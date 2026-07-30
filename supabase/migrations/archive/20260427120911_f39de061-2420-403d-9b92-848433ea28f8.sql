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
  SET status = 'failed',
      error_message = LEFT(COALESCE(p_error, 'unknown error'), 2000),
      error_at = now(),
      trigger_payload = COALESCE(trigger_payload, '{}'::jsonb) || jsonb_build_object('error_context', p_context)
  WHERE id = p_execution_id;
END;
$$;