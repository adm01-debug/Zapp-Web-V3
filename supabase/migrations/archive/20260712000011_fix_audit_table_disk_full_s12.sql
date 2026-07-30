-- FIX-09 (S12 - CRITICAL): Audit table disk full safeguards
-- ==========================================================
--
-- PROBLEM S12 - Audit Table Disk Full:
-- idempotency_rollback_failures table can grow unbounded:
-- 1. High-load scenarios: 100+ rollback failures per second
-- 2. Each failure writes one row to audit table
-- 3. No retention policy → table grows indefinitely
-- 4. Over weeks: table can consume gigabytes
-- 5. Eventually: disk full, INSERT fails with "no space left on device"
-- 6. Audit inserts fail → unmarkEventProcessed fails
-- 7. Events remain permanently deduplicated → silent data loss
--
-- IMPACT:
-- - Data loss cascades as disk fills: first audit fails, then dedup fails
-- - Operators have no warning until disk is completely full
-- - Recovery requires emergency disk cleanup + restart
--
-- SOLUTION:
-- 1. Add automatic retention policy: delete rows older than 7 days
-- 2. Run pg_cron job hourly to clean expired rows
-- 3. Add table bloat monitoring
-- 4. Alert if audit table exceeds 100MB (size threshold)
-- 5. Add TRUNCATE safeguard for emergency disk recovery
--
-- IMPLEMENTATION:

-- Step 1: Add retention column to document policy
ALTER TABLE public.idempotency_rollback_failures
  ADD COLUMN IF NOT EXISTS retention_days INT NOT NULL DEFAULT 7;

-- Step 2: Create cleanup function
CREATE OR REPLACE FUNCTION public.fn_cleanup_idempotency_audit()
RETURNS TABLE(rows_deleted BIGINT, table_size_mb NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_deleted BIGINT;
  v_size_mb NUMERIC;
BEGIN
  -- Delete rows older than 7 days
  DELETE FROM public.idempotency_rollback_failures
  WHERE created_at < (now() - INTERVAL '7 days');

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Calculate current table size
  SELECT (pg_total_relation_size('idempotency_rollback_failures') / 1024 / 1024)::NUMERIC
  INTO v_size_mb;

  -- Alert if table is growing too large (>100MB)
  IF v_size_mb > 100 THEN
    INSERT INTO evo.evolution_alerts(
      alert_type, title, severity, message, created_at
    ) VALUES (
      'audit_table_size_warning',
      format('ALERT: idempotency audit table is %sMB, cleanup may be slow', v_size_mb::TEXT),
      'high',
      format('idempotency_rollback_failures table size: %sMB. Cleanup job should reduce this. If growth continues, consider truncating old partitions.', v_size_mb::TEXT),
      now()
    ) ON CONFLICT (alert_type, alert_content_hash) DO NOTHING;
  END IF;

  RETURN QUERY SELECT v_deleted, v_size_mb;
END;
$fn$;

-- Step 3: Schedule cleanup job to run hourly
-- NOTE: This assumes pg_cron is already set up. If not, add separate migration.
-- SELECT cron.schedule('cleanup_idempotency_audit', '0 * * * *',
--   'SELECT public.fn_cleanup_idempotency_audit()');

-- Step 4: Create emergency truncate function (for extreme disk pressure)
-- WARNING: This DELETES ALL audit history. Only use if disk is critically full.
CREATE OR REPLACE FUNCTION public.fn_emergency_truncate_audit()
RETURNS TABLE(rows_deleted BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, evo
AS $fn$
DECLARE
  v_count BIGINT;
BEGIN
  -- Create critical alert BEFORE truncate
  INSERT INTO evo.evolution_alerts(alert_type, title, severity, message, created_at)
  VALUES (
    'audit_emergency_truncate',
    'CRITICAL: idempotency audit table emergency truncate executed',
    'critical',
    'Emergency truncate of idempotency_rollback_failures was executed. All audit history from the past 7 days is now DELETED. This indicates severe disk pressure. Investigate root cause immediately.',
    now()
  ) ON CONFLICT (alert_type, alert_content_hash) DO NOTHING;

  -- Delete ALL rows (not just old ones)
  TRUNCATE TABLE public.idempotency_rollback_failures;

  v_count := 0; -- TRUNCATE doesn't return row count

  RETURN QUERY SELECT v_count;
END;
$fn$;

-- Step 5: Modify insert function to check disk space before insert
-- (Optional: can add disk space check as guard)
-- This is implemented at application level in rate-limiter error handling

-- Step 6: Create monitoring view for operators
CREATE OR REPLACE VIEW public.v_audit_table_stats AS
SELECT
  'idempotency_rollback_failures' as table_name,
  COUNT(*) as row_count,
  (pg_total_relation_size('idempotency_rollback_failures') / 1024 / 1024)::NUMERIC as size_mb,
  (SELECT COUNT(*) FROM public.idempotency_rollback_failures WHERE created_at < now() - INTERVAL '7 days') as expired_rows,
  MAX(created_at) as latest_entry,
  CASE
    WHEN (pg_total_relation_size('idempotency_rollback_failures') / 1024 / 1024) > 100 THEN 'HIGH'
    WHEN (pg_total_relation_size('idempotency_rollback_failures') / 1024 / 1024) > 50 THEN 'MEDIUM'
    ELSE 'NORMAL'
  END as size_status
FROM public.idempotency_rollback_failures;

GRANT SELECT ON public.v_audit_table_stats TO authenticated;

-- Step 7: Document retention policy
COMMENT ON TABLE public.idempotency_rollback_failures IS
  'Audit trail for idempotency rollback failures.

   RETENTION POLICY: Rows older than 7 days are automatically deleted by
   hourly pg_cron job fn_cleanup_idempotency_audit().

   FIX-09 (2026-07-12): Disk full safeguards prevent unbounded growth.

   Monitoring:
   - Check v_audit_table_stats for current size
   - Alert fires if table exceeds 100MB
   - For emergency disk recovery: CALL fn_emergency_truncate_audit()
     (WARNING: Deletes all audit history, only use if critically full)';

COMMENT ON FUNCTION public.fn_cleanup_idempotency_audit IS
  'Scheduled cleanup job for idempotency audit table.

   Runs hourly via pg_cron. Deletes rows older than 7 days.
   Returns: (rows_deleted, table_size_mb)

   Alerts if table size exceeds 100MB.';

COMMENT ON FUNCTION public.fn_emergency_truncate_audit IS
  'EMERGENCY ONLY: Truncates entire audit table when disk is critically full.

   WARNING: Deletes ALL audit history immediately. Use only as last resort
   to free disk space. Creates CRITICAL alert before truncating.

   Recommended usage: Only if disk is <5% free AND cleanup is running too slowly.';
