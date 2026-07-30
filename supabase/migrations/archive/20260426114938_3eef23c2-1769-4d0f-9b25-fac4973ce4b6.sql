-- 1. Ajustar UNIQUE para global por contato
ALTER TABLE public.sticky_assignments
  DROP CONSTRAINT IF EXISTS sticky_assignments_contact_id_channel_connection_id_key;

ALTER TABLE public.sticky_assignments
  ADD CONSTRAINT sticky_assignments_contact_id_key UNIQUE (contact_id);

-- 2. Função utilitária: upsert sticky respeitando TTL do canal
CREATE OR REPLACE FUNCTION public.fn_sticky_upsert(
  p_contact_id uuid,
  p_agent_profile_id uuid,
  p_channel_id uuid DEFAULT NULL,
  p_queue_id uuid DEFAULT NULL,
  p_source text DEFAULT 'manual'
)
RETURNS public.sticky_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ttl_hours int := 24;
  v_enabled boolean := true;
  v_row public.sticky_assignments;
BEGIN
  IF p_contact_id IS NULL OR p_agent_profile_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Lê TTL/enabled do canal (se informado)
  IF p_channel_id IS NOT NULL THEN
    SELECT sticky_enabled, COALESCE(sticky_ttl_hours, 24)
      INTO v_enabled, v_ttl_hours
      FROM public.service_channels
     WHERE id = p_channel_id;

    IF NOT COALESCE(v_enabled, true) THEN
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO public.sticky_assignments AS sa
    (contact_id, agent_profile_id, queue_id, last_assigned_at, expires_at)
  VALUES
    (p_contact_id, p_agent_profile_id, p_queue_id, now(),
     now() + make_interval(hours => v_ttl_hours))
  ON CONFLICT (contact_id) DO UPDATE
    SET agent_profile_id = EXCLUDED.agent_profile_id,
        queue_id         = COALESCE(EXCLUDED.queue_id, sa.queue_id),
        last_assigned_at = now(),
        expires_at       = now() + make_interval(hours => v_ttl_hours)
  RETURNING * INTO v_row;

  -- Audit best-effort
  BEGIN
    INSERT INTO public.audit_log(actor_user_id, action, entity_type, entity_id, payload)
    VALUES (auth.uid(), 'sticky.upsert', 'sticky_assignment', v_row.id,
            jsonb_build_object('source', p_source, 'agent', p_agent_profile_id,
                               'channel', p_channel_id, 'queue', p_queue_id,
                               'expires_at', v_row.expires_at));
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  RETURN v_row;
END;
$$;

-- 3. Trigger: contacts.assigned_to mudou -> renova sticky
CREATE OR REPLACE FUNCTION public.fn_sticky_on_contact_assign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  IF NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = NEW.assigned_to LIMIT 1;
  IF v_profile_id IS NULL THEN RETURN NEW; END IF;

  PERFORM public.fn_sticky_upsert(NEW.id, v_profile_id, NULL, NULL, 'contact_assignment');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sticky_on_contact_assign ON public.contacts;
CREATE TRIGGER trg_sticky_on_contact_assign
AFTER INSERT OR UPDATE OF assigned_to ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.fn_sticky_on_contact_assign();

-- 4. RPC principal de roteamento
CREATE OR REPLACE FUNCTION public.rpc_route_inbound_message(
  p_contact_id uuid,
  p_channel_id uuid DEFAULT NULL,
  p_queue_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sticky public.sticky_assignments;
  v_agent_user_id uuid;
  v_agent_profile_id uuid;
  v_dept_id uuid;
  v_max int;
  v_active int;
  v_online boolean;
  v_picked uuid;
  v_source text := 'algorithm';
BEGIN
  IF p_contact_id IS NULL THEN
    RAISE EXCEPTION 'contact_id required';
  END IF;

  -- 1) Tenta sticky
  SELECT * INTO v_sticky
    FROM public.sticky_assignments
   WHERE contact_id = p_contact_id
     AND expires_at > now();

  IF FOUND THEN
    SELECT p.user_id,
           COALESCE(p.max_concurrent_chats, 5),
           COALESCE(p.is_online, false),
           p.department_id
      INTO v_agent_user_id, v_max, v_online, v_dept_id
      FROM public.profiles p
     WHERE p.id = v_sticky.agent_profile_id;

    SELECT count(*) INTO v_active
      FROM public.contacts
     WHERE assigned_to = v_agent_user_id
       AND COALESCE(status, 'open') NOT IN ('resolved','closed');

    -- valida: online, com folga, e (sem fila exigida OU mesmo depto da fila)
    IF v_agent_user_id IS NOT NULL
       AND v_online
       AND v_active < v_max
       AND (
         p_queue_id IS NULL
         OR EXISTS (
              SELECT 1 FROM public.queues q
               WHERE q.id = p_queue_id
                 AND (q.department_id IS NULL OR q.department_id = v_dept_id)
                 AND COALESCE(q.status, 'active') = 'active'
            )
       )
    THEN
      v_picked := v_agent_user_id;
      v_source := 'sticky';
    END IF;
  END IF;

  -- 2) Fallback: algoritmo da fila
  IF v_picked IS NULL AND p_queue_id IS NOT NULL THEN
    BEGIN
      SELECT public.rpc_pick_next_agent(p_queue_id) INTO v_picked;
    EXCEPTION WHEN undefined_function THEN
      v_picked := NULL;
    END;
    v_source := 'algorithm';
  END IF;

  IF v_picked IS NULL THEN
    BEGIN
      INSERT INTO public.audit_log(actor_user_id, action, entity_type, entity_id, payload)
      VALUES (NULL, 'route.no_agent', 'contact', p_contact_id,
              jsonb_build_object('channel', p_channel_id, 'queue', p_queue_id));
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
    RETURN jsonb_build_object('assigned', false, 'source', null);
  END IF;

  -- 3) Atribui (dispara trigger de sticky upsert)
  UPDATE public.contacts
     SET assigned_to = v_picked,
         updated_at = now()
   WHERE id = p_contact_id
     AND (assigned_to IS DISTINCT FROM v_picked);

  -- 4) Garante sticky atualizado mesmo se já era o assigned_to
  SELECT id INTO v_agent_profile_id FROM public.profiles WHERE user_id = v_picked LIMIT 1;
  IF v_agent_profile_id IS NOT NULL THEN
    PERFORM public.fn_sticky_upsert(p_contact_id, v_agent_profile_id, p_channel_id, p_queue_id, v_source);
  END IF;

  RETURN jsonb_build_object(
    'assigned', true,
    'agent_user_id', v_picked,
    'source', v_source,
    'channel_id', p_channel_id,
    'queue_id', p_queue_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_sticky_upsert(uuid,uuid,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_route_inbound_message(uuid,uuid,uuid) TO authenticated, service_role;