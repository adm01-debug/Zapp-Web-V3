-- =========================================================================
-- LOTE R1+R2+R3 — Camada de roteamento de mensagens
-- =========================================================================

-- ---------- 1) routing_mode na conexão -----------------------------------
ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS routing_mode TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE public.whatsapp_connections
  DROP CONSTRAINT IF EXISTS whatsapp_connections_routing_mode_check;

ALTER TABLE public.whatsapp_connections
  ADD CONSTRAINT whatsapp_connections_routing_mode_check
  CHECK (routing_mode IN ('manual', 'sticky', 'rules', 'round_robin'));

COMMENT ON COLUMN public.whatsapp_connections.routing_mode IS
  'Como mensagens novas são atribuídas: manual=Sem dono | sticky=último agente | rules=client_wallet_rules | round_robin=menor carga no depto';

-- ---------- 2) Tabela de deduplicação de eventos -------------------------
CREATE TABLE IF NOT EXISTS public.webhook_event_dedup (
  event_key TEXT PRIMARY KEY,
  instance_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_webhook_event_dedup_received_at
  ON public.webhook_event_dedup (received_at);

CREATE INDEX IF NOT EXISTS idx_webhook_event_dedup_instance
  ON public.webhook_event_dedup (instance_name, received_at DESC);

ALTER TABLE public.webhook_event_dedup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read dedup" ON public.webhook_event_dedup;
CREATE POLICY "Admins read dedup"
  ON public.webhook_event_dedup
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- writes só via service role (webhook) ou admin
DROP POLICY IF EXISTS "Service writes dedup" ON public.webhook_event_dedup;
CREATE POLICY "Service writes dedup"
  ON public.webhook_event_dedup
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

COMMENT ON TABLE public.webhook_event_dedup IS
  'Chave de idempotência para eventos do webhook (Evolution + Cloud API). PK = sha256(instance:msg_id:event_type:ts). TTL 7 dias.';

-- ---------- 3) Cleanup função (chamada por cron) -------------------------
CREATE OR REPLACE FUNCTION public.cleanup_webhook_event_dedup()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.webhook_event_dedup
   WHERE received_at < now() - interval '7 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- ---------- 4) Helper: registrar evento (idempotente) --------------------
CREATE OR REPLACE FUNCTION public.rpc_register_webhook_event(
  p_event_key TEXT,
  p_instance_name TEXT,
  p_event_type TEXT,
  p_payload_hash TEXT DEFAULT NULL
)
RETURNS BOOLEAN  -- true = primeira vez (processar), false = duplicata
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inserted BOOLEAN;
BEGIN
  IF p_event_key IS NULL OR length(p_event_key) = 0 THEN
    RAISE EXCEPTION 'event_key required';
  END IF;

  INSERT INTO public.webhook_event_dedup (event_key, instance_name, event_type, payload_hash)
  VALUES (p_event_key, p_instance_name, p_event_type, p_payload_hash)
  ON CONFLICT (event_key) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted > 0;
END;
$$;

-- ---------- 5) RPC de roteamento ----------------------------------------
-- Recebe contact_id + connection_id, lê routing_mode, decide assigned_to.
-- Sempre tem fallback seguro para 'manual' (Sem dono).
CREATE OR REPLACE FUNCTION public.rpc_route_incoming_message(
  p_contact_id UUID,
  p_connection_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_mode TEXT;
  v_current_assigned UUID;
  v_target_agent UUID;
  v_reason TEXT;
  v_business_open BOOLEAN := TRUE;
BEGIN
  -- Lê estado atual
  SELECT assigned_to INTO v_current_assigned
    FROM public.contacts
   WHERE id = p_contact_id
   LIMIT 1;

  -- Se contato já tem dono, não mexe (princípio "nunca tirar atendimento")
  IF v_current_assigned IS NOT NULL THEN
    RETURN jsonb_build_object(
      'action', 'skipped',
      'reason', 'already_assigned',
      'agent_id', v_current_assigned
    );
  END IF;

  -- Lê modo da conexão
  SELECT routing_mode INTO v_mode
    FROM public.whatsapp_connections
   WHERE id = p_connection_id
   LIMIT 1;

  v_mode := COALESCE(v_mode, 'manual');

  -- Horário comercial (se a função existir e a conexão configurar)
  BEGIN
    v_business_open := public.is_within_business_hours(p_connection_id);
  EXCEPTION WHEN OTHERS THEN
    v_business_open := TRUE;
  END;

  IF NOT v_business_open THEN
    RETURN jsonb_build_object(
      'action', 'unassigned',
      'reason', 'outside_business_hours',
      'mode', v_mode
    );
  END IF;

  -- Modo: manual → não faz nada (Sem dono)
  IF v_mode = 'manual' THEN
    RETURN jsonb_build_object('action', 'unassigned', 'reason', 'manual_mode');
  END IF;

  -- Modo: sticky → último agente conhecido
  IF v_mode = 'sticky' THEN
    SELECT sa.agent_profile_id INTO v_target_agent
      FROM public.sticky_assignments sa
     WHERE sa.contact_id = p_contact_id
       AND (sa.channel_connection_id IS NULL OR sa.channel_connection_id = p_connection_id)
       AND sa.expires_at > now()
     ORDER BY sa.last_assigned_at DESC
     LIMIT 1;

    IF v_target_agent IS NOT NULL THEN
      v_reason := 'sticky_match';
    END IF;
  END IF;

  -- Modo: rules → engine de client_wallet_rules
  IF v_mode = 'rules' AND v_target_agent IS NULL THEN
    SELECT cwr.agent_id INTO v_target_agent
      FROM public.client_wallet_rules cwr
     WHERE cwr.is_active = TRUE
       AND (cwr.whatsapp_connection_id IS NULL OR cwr.whatsapp_connection_id = p_connection_id)
     ORDER BY cwr.priority DESC, cwr.created_at ASC
     LIMIT 1;

    IF v_target_agent IS NOT NULL THEN
      v_reason := 'rule_match';
    END IF;
  END IF;

  -- Modo: round_robin → menor carga no depto da conexão
  IF v_mode = 'round_robin' AND v_target_agent IS NULL THEN
    SELECT p.id INTO v_target_agent
      FROM public.profiles p
     WHERE p.is_active = TRUE
       AND p.role IN ('agent', 'supervisor')
     ORDER BY (
       SELECT COUNT(*) FROM public.contacts c2
        WHERE c2.assigned_to = p.id
     ) ASC, p.created_at ASC
     LIMIT 1;

    IF v_target_agent IS NOT NULL THEN
      v_reason := 'round_robin';
    END IF;
  END IF;

  -- Aplica atribuição (se encontrou candidato)
  IF v_target_agent IS NOT NULL THEN
    UPDATE public.contacts
       SET assigned_to = v_target_agent,
           updated_at = now()
     WHERE id = p_contact_id
       AND assigned_to IS NULL;  -- guard contra race

    -- Registra sticky para próxima
    BEGIN
      PERFORM public.fn_register_sticky_assignment(
        p_contact_id, v_target_agent, p_connection_id, NULL
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- sticky é best-effort
    END;

    RETURN jsonb_build_object(
      'action', 'assigned',
      'agent_id', v_target_agent,
      'reason', v_reason,
      'mode', v_mode
    );
  END IF;

  -- Fallback: nenhum candidato encontrado em modo automático → Sem dono
  RETURN jsonb_build_object(
    'action', 'unassigned',
    'reason', 'no_candidate_fallback',
    'mode', v_mode
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_route_incoming_message IS
  'Decide atribuição de uma conversa nova conforme routing_mode da conexão. Sempre fallback seguro para Sem dono. Idempotente: só atribui se assigned_to=NULL.';