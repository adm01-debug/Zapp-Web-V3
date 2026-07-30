-- 1. Tabela sticky_assignments
CREATE TABLE IF NOT EXISTS public.sticky_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  channel_connection_id uuid REFERENCES public.channel_connections(id) ON DELETE CASCADE,
  agent_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  queue_id uuid REFERENCES public.queues(id) ON DELETE SET NULL,
  last_assigned_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, channel_connection_id)
);

CREATE INDEX IF NOT EXISTS idx_sticky_contact ON public.sticky_assignments(contact_id);
CREATE INDEX IF NOT EXISTS idx_sticky_agent ON public.sticky_assignments(agent_profile_id);
CREATE INDEX IF NOT EXISTS idx_sticky_expires ON public.sticky_assignments(expires_at);

ALTER TABLE public.sticky_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and supervisors manage sticky"
  ON public.sticky_assignments
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (public.is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Agents can view own sticky"
  ON public.sticky_assignments
  FOR SELECT
  TO authenticated
  USING (
    agent_profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
    OR public.is_admin_or_supervisor(auth.uid())
  );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.sticky_assignments;

-- 2. Function: round-robin counter por fila (auxiliar - usa agent_stats se houver, senão random)
-- 3. Função principal de roteamento
CREATE OR REPLACE FUNCTION public.fn_resolve_agent_for_routing(
  p_contact_id uuid,
  p_channel_connection_id uuid DEFAULT NULL,
  p_queue_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_id uuid;
  v_resolved_queue uuid;
  v_strategy text;
  v_required_skills text[];
BEGIN
  -- 1) Sticky: último agente do contato neste canal, ainda válido e ativo
  SELECT s.agent_profile_id, s.queue_id
    INTO v_agent_id, v_resolved_queue
  FROM public.sticky_assignments s
  JOIN public.profiles p ON p.id = s.agent_profile_id
  WHERE s.contact_id = p_contact_id
    AND (p_channel_connection_id IS NULL OR s.channel_connection_id = p_channel_connection_id)
    AND s.expires_at > now()
    AND p.is_active = true
  ORDER BY s.last_assigned_at DESC
  LIMIT 1;

  IF v_agent_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'agent_profile_id', v_agent_id,
      'queue_id', v_resolved_queue,
      'strategy', 'sticky'
    );
  END IF;

  -- 2) Resolver fila: parâmetro > regra de roteamento do canal
  v_resolved_queue := p_queue_id;

  IF v_resolved_queue IS NULL AND p_channel_connection_id IS NOT NULL THEN
    SELECT queue_id INTO v_resolved_queue
    FROM public.channel_routing_rules
    WHERE channel_connection_id = p_channel_connection_id
      AND queue_id IS NOT NULL
    ORDER BY priority DESC
    LIMIT 1;
  END IF;

  IF v_resolved_queue IS NULL THEN
    RETURN jsonb_build_object(
      'agent_profile_id', NULL,
      'queue_id', NULL,
      'strategy', 'unassigned',
      'reason', 'no_queue_resolved'
    );
  END IF;

  -- 3) Skills exigidas pela fila
  SELECT COALESCE(array_agg(skill_name), ARRAY[]::text[])
    INTO v_required_skills
  FROM public.queue_skill_requirements
  WHERE queue_id = v_resolved_queue;

  -- 4) Round-robin: agente da fila com menos atribuições nas últimas 24h, com skills
  SELECT qm.profile_id INTO v_agent_id
  FROM public.queue_members qm
  JOIN public.profiles p ON p.id = qm.profile_id
  WHERE qm.queue_id = v_resolved_queue
    AND qm.is_active = true
    AND p.is_active = true
    AND (
      array_length(v_required_skills, 1) IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM unnest(v_required_skills) rs(name)
        WHERE NOT EXISTS (
          SELECT 1 FROM public.agent_skills s
          WHERE s.profile_id = qm.profile_id AND s.skill_name = rs.name
        )
      )
    )
  ORDER BY (
    SELECT COUNT(*) FROM public.sticky_assignments sa
    WHERE sa.agent_profile_id = qm.profile_id
      AND sa.last_assigned_at > now() - interval '24 hours'
  ) ASC, random()
  LIMIT 1;

  IF v_agent_id IS NULL THEN
    RETURN jsonb_build_object(
      'agent_profile_id', NULL,
      'queue_id', v_resolved_queue,
      'strategy', 'unassigned',
      'reason', 'no_eligible_agent'
    );
  END IF;

  RETURN jsonb_build_object(
    'agent_profile_id', v_agent_id,
    'queue_id', v_resolved_queue,
    'strategy', 'round_robin'
  );
END;
$$;

-- 4. RPC para registrar/atualizar sticky após atribuição
CREATE OR REPLACE FUNCTION public.fn_register_sticky_assignment(
  p_contact_id uuid,
  p_agent_profile_id uuid,
  p_channel_connection_id uuid DEFAULT NULL,
  p_queue_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.sticky_assignments
    (contact_id, channel_connection_id, agent_profile_id, queue_id, last_assigned_at, expires_at)
  VALUES
    (p_contact_id, p_channel_connection_id, p_agent_profile_id, p_queue_id, now(), now() + interval '24 hours')
  ON CONFLICT (contact_id, channel_connection_id) DO UPDATE
    SET agent_profile_id = EXCLUDED.agent_profile_id,
        queue_id = EXCLUDED.queue_id,
        last_assigned_at = now(),
        expires_at = now() + interval '24 hours'
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_resolve_agent_for_routing(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_register_sticky_assignment(uuid, uuid, uuid, uuid) TO authenticated;