-- Scheduled cleanup function for old data
-- Can be called via pg_cron or Supabase scheduled Edge Function

CREATE OR REPLACE FUNCTION public.cleanup_old_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_errors int := 0;
  deleted_webhooks int := 0;
  deleted_dlq int := 0;
  deleted_audit int := 0;
BEGIN
  -- 1. Cleanup error logs > 30 days
  DELETE FROM public.app_error_logs WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS deleted_errors = ROW_COUNT;

  -- 2. Cleanup webhook events > 14 days
  DELETE FROM public.evolution_webhook_events WHERE created_at < now() - interval '14 days';
  GET DIAGNOSTICS deleted_webhooks = ROW_COUNT;

  -- 3. Cleanup dead letter queue > 30 days
  DELETE FROM public.dead_letter_queue WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS deleted_dlq = ROW_COUNT;

  -- 4. Cleanup audit log > 90 days
  DELETE FROM public.audit_log WHERE created_at < now() - interval '90 days';
  GET DIAGNOSTICS deleted_audit = ROW_COUNT;

  RETURN jsonb_build_object(
    'timestamp', now(),
    'deleted_errors', deleted_errors,
    'deleted_webhooks', deleted_webhooks,
    'deleted_dlq', deleted_dlq,
    'deleted_audit', deleted_audit
  );
END;
$$;

COMMENT ON FUNCTION public.cleanup_old_data() IS 'Scheduled cleanup of old error logs, webhook events, DLQ, and audit entries';
