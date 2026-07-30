-- Escopo por canal e filial nas regras
ALTER TABLE public.automation_rules
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES public.service_channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_automation_rules_scope
  ON public.automation_rules(is_active, channel_id, department_id, priority);

-- Escopo também nas execuções (auditoria)
ALTER TABLE public.automation_executions
  ADD COLUMN IF NOT EXISTS channel_id UUID,
  ADD COLUMN IF NOT EXISTS department_id UUID;

-- Atualiza RPC para propagar escopo
CREATE OR REPLACE FUNCTION public.rpc_register_automation_execution(
  p_rule_id UUID,
  p_remote_jid TEXT,
  p_instance_name TEXT,
  p_assigned_to TEXT DEFAULT NULL,
  p_trigger_payload JSONB DEFAULT '{}'::jsonb,
  p_channel_id UUID DEFAULT NULL,
  p_department_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cooldown INT;
  v_last TIMESTAMPTZ;
  v_id UUID;
  v_channel UUID;
  v_department UUID;
BEGIN
  SELECT cooldown_seconds, channel_id, department_id
    INTO v_cooldown, v_channel, v_department
  FROM public.automation_rules WHERE id = p_rule_id AND is_active = true;

  IF v_cooldown IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT MAX(created_at) INTO v_last
  FROM public.automation_executions
  WHERE rule_id = p_rule_id AND remote_jid = p_remote_jid;

  IF v_last IS NOT NULL AND v_last > now() - make_interval(secs => v_cooldown) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.automation_executions (
    rule_id, remote_jid, instance_name, assigned_to, trigger_payload,
    channel_id, department_id, status
  ) VALUES (
    p_rule_id, p_remote_jid, p_instance_name, p_assigned_to, p_trigger_payload,
    COALESCE(p_channel_id, v_channel),
    COALESCE(p_department_id, v_department),
    'pending'
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;