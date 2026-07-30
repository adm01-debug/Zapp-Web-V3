-- Migration: create automation RPCs in zapp schema
-- Both rpc_register_automation_execution and rpc_record_automation_error are defined
-- in the public schema (migration 20260427120727) but safeClient.rpc() uses
-- Accept-Profile: zapp, causing PGRST202 ("could not find function in schema cache").
-- This migration creates thin wrappers in the zapp schema that delegate to the
-- existing public-schema implementations so no business logic is duplicated.

-- Wrapper: rpc_register_automation_execution
CREATE OR REPLACE FUNCTION zapp.rpc_register_automation_execution(
  p_rule_id UUID,
  p_remote_jid TEXT,
  p_instance_name TEXT,
  p_assigned_to TEXT DEFAULT NULL,
  p_trigger_payload JSONB DEFAULT '{}'::jsonb,
  p_channel_id UUID DEFAULT NULL,
  p_department_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT public.rpc_register_automation_execution(
    p_rule_id,
    p_remote_jid,
    p_instance_name,
    p_assigned_to,
    p_trigger_payload,
    p_channel_id,
    p_department_id
  );
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_register_automation_execution(UUID, TEXT, TEXT, TEXT, JSONB, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.rpc_register_automation_execution(UUID, TEXT, TEXT, TEXT, JSONB, UUID, UUID) TO authenticated;

-- Wrapper: rpc_record_automation_error
CREATE OR REPLACE FUNCTION zapp.rpc_record_automation_error(
  p_execution_id UUID,
  p_error TEXT,
  p_context JSONB DEFAULT '{}'::jsonb
) RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT public.rpc_record_automation_error(p_execution_id, p_error, p_context);
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_record_automation_error(UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.rpc_record_automation_error(UUID, TEXT, JSONB) TO authenticated;
