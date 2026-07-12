-- 1) Snapshot da regra + carimbo de erro
ALTER TABLE public.automation_executions
  ADD COLUMN IF NOT EXISTS rule_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS error_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_automation_executions_rule_created
  ON public.automation_executions(rule_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_executions_status_created
  ON public.automation_executions(status, created_at DESC);

-- 2) RPC: registra execução já com snapshot da regra
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
  v_snapshot JSONB;
BEGIN
  SELECT cooldown_seconds, channel_id, department_id,
         jsonb_build_object(
           'name', name,
           'description', description,
           'trigger_type', trigger_type,
           'trigger_config', trigger_config,
           'actions', actions,
           'priority', priority,
           'cooldown_seconds', cooldown_seconds,
           'channel_id', channel_id,
           'department_id', department_id,
           'captured_at', now()
         )
    INTO v_cooldown, v_channel, v_department, v_snapshot
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
    channel_id, department_id, rule_snapshot, status
  ) VALUES (
    p_rule_id, p_remote_jid, p_instance_name, p_assigned_to, p_trigger_payload,
    COALESCE(p_channel_id, v_channel),
    COALESCE(p_department_id, v_department),
    v_snapshot,
    'pending'
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 3) RPC: gravar erro de execução
CREATE OR REPLACE FUNCTION public.rpc_record_automation_error(
  p_execution_id UUID,
  p_error TEXT,
  p_context JSONB DEFAULT '{}'::jsonb
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.automation_executions
  SET status = 'error',
      error_message = LEFT(COALESCE(p_error, 'unknown error'), 2000),
      error_at = now(),
      trigger_payload = COALESCE(trigger_payload, '{}'::jsonb) || jsonb_build_object('error_context', p_context)
  WHERE id = p_execution_id;
END;
$$;