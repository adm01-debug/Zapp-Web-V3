-- FIX-09 Companion: Schedule hourly audit cleanup job via pg_cron
-- ==============================================================

-- Schedule cleanup to run every hour at :00
-- This keeps the audit table size under control and prevents disk exhaustion
SELECT cron.schedule(
  'cleanup_idempotency_audit_hourly',
  '0 * * * *',  -- Every hour at :00
  'SELECT public.fn_cleanup_idempotency_audit()'
);

-- Also schedule a weekly ANALYZE to update table statistics (helps query planner)
SELECT cron.schedule(
  'analyze_idempotency_audit_weekly',
  '0 3 * * 0',  -- Every Sunday at 3:00 AM
  'ANALYZE public.idempotency_rollback_failures'
);
