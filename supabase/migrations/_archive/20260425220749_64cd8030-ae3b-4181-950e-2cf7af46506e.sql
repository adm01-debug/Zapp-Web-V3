DROP POLICY IF EXISTS "dispatch_error_logs_insert_authenticated"
  ON public.dispatch_error_logs;

CREATE POLICY "dispatch_error_logs_insert_self_or_service"
  ON public.dispatch_error_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    instance_name IS NOT NULL
    AND length(trim(instance_name)) > 0
    AND (agent_user_id IS NULL OR agent_user_id = auth.uid())
  );