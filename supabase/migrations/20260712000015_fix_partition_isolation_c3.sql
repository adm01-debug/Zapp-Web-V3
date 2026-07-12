-- FIX-11 (C-3 - CRITICAL): Partition isolation enforcement
-- ========================================================
--
-- PROBLEM C-3 - Partition Isolation Failure:
-- Evolution API supports multiple instances (WP1, WP2, etc.)
-- Each instance should be isolated: events from one instance must not
-- affect another instance's deduplication or rate-limiting.
--
-- Isolation mechanisms:
-- 1. webhook_events_processed partitioned by instance_id
-- 2. webhook_rate_limits partitioned by instance_id
-- 3. idempotency_rollback_failures partitioned by instance
--
-- FAILURE MODES:
-- 1. Accidental cross-instance dedup: Event from WP1 marked as seen,
--    then WP2 event with same hash treated as duplicate (wrong instance!)
-- 2. Rate-limit spillover: WP1 hit rate limit → WP2 requests also throttled
-- 3. Audit trail leakage: WP1 failures appear in WP2's audit log
--
-- ROOT CAUSES:
-- 1. Missing index on (instance_id, event_id) for fast lookups
-- 2. Missing CHECK constraint on instance_id != null
-- 3. No RLS policy to enforce instance isolation
-- 4. Application code doesn't filter by instance in queries
--
-- SOLUTION:
-- 1. Add CHECK constraint: instance_id IS NOT NULL
-- 2. Add composite unique index: (instance_id, event_id) per table
-- 3. Add RLS policy: instance isolation (if app passes session context)
-- 4. Create monitoring view to detect cross-instance anomalies
-- 5. Add validation trigger to ensure instance_id filtering
--
-- IMPLEMENTATION:

-- Step 1: Add NOT NULL constraint to ensure every row belongs to an instance
ALTER TABLE public.webhook_events_processed
  ADD CONSTRAINT chk_instance_not_null CHECK (instance_id IS NOT NULL AND instance_id != '');

ALTER TABLE public.webhook_rate_limits
  ADD CONSTRAINT chk_instance_not_null_rate CHECK (instance_id IS NOT NULL AND instance_id != '');

ALTER TABLE public.idempotency_rollback_failures
  ADD CONSTRAINT chk_instance_not_null_audit CHECK (instance IS NOT NULL AND instance != '');

-- Step 2: Add composite indexes for partition-aware lookups
CREATE INDEX IF NOT EXISTS idx_webhook_events_instance_event
  ON public.webhook_events_processed(instance_id, event_id);

CREATE INDEX IF NOT EXISTS idx_webhook_rate_limits_instance_event
  ON public.webhook_rate_limits(instance_id, event_type, window_start);

CREATE INDEX IF NOT EXISTS idx_idempotency_failures_instance_event
  ON public.idempotency_rollback_failures(instance, event_id);

-- Step 3: Create function to validate partition isolation
CREATE OR REPLACE FUNCTION public.fn_validate_partition_isolation()
RETURNS TABLE(
  table_name TEXT,
  total_rows BIGINT,
  rows_with_null_instance BIGINT,
  isolation_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_null_events BIGINT;
  v_null_rate BIGINT;
  v_null_audit BIGINT;
  v_total_events BIGINT;
  v_total_rate BIGINT;
  v_total_audit BIGINT;
BEGIN
  -- Check webhook_events_processed
  SELECT COUNT(*) INTO v_total_events FROM public.webhook_events_processed;
  SELECT COUNT(*) INTO v_null_events FROM public.webhook_events_processed WHERE instance_id IS NULL OR instance_id = '';

  RETURN QUERY SELECT 'webhook_events_processed', v_total_events, v_null_events,
    CASE WHEN v_null_events = 0 THEN 'OK' ELSE 'CRITICAL: ' || v_null_events || ' rows missing instance' END;

  -- Check webhook_rate_limits
  SELECT COUNT(*) INTO v_total_rate FROM public.webhook_rate_limits;
  SELECT COUNT(*) INTO v_null_rate FROM public.webhook_rate_limits WHERE instance_id IS NULL OR instance_id = '';

  RETURN QUERY SELECT 'webhook_rate_limits', v_total_rate, v_null_rate,
    CASE WHEN v_null_rate = 0 THEN 'OK' ELSE 'CRITICAL: ' || v_null_rate || ' rows missing instance' END;

  -- Check idempotency_rollback_failures
  SELECT COUNT(*) INTO v_total_audit FROM public.idempotency_rollback_failures;
  SELECT COUNT(*) INTO v_null_audit FROM public.idempotency_rollback_failures WHERE instance IS NULL OR instance = '';

  RETURN QUERY SELECT 'idempotency_rollback_failures', v_total_audit, v_null_audit,
    CASE WHEN v_null_audit = 0 THEN 'OK' ELSE 'CRITICAL: ' || v_null_audit || ' rows missing instance' END;

  -- Alert if ANY isolation violations found
  IF v_null_events > 0 OR v_null_rate > 0 OR v_null_audit > 0 THEN
    INSERT INTO evo.evolution_alerts(
      alert_type, title, severity, message, created_at
    ) VALUES (
      'partition_isolation_violation',
      'CRITICAL: Partition isolation violations detected',
      'critical',
      format('Detected %s/%s/%s rows with missing instance_id in dedup/rate/audit tables. This breaks partition isolation and can cause cross-instance data leakage.',
        v_null_events, v_null_rate, v_null_audit),
      now()
    ) ON CONFLICT (alert_type, alert_content_hash) DO NOTHING;
  END IF;
END;
$fn$;

-- Step 4: Create monitoring view for instance distribution
CREATE OR REPLACE VIEW public.v_instance_isolation_stats AS
SELECT
  'webhook_events_processed' as table_name,
  COUNT(DISTINCT instance_id) as unique_instances,
  COUNT(*) as total_rows,
  COUNT(*) FILTER (WHERE instance_id IS NULL OR instance_id = '') as null_instance_rows
FROM public.webhook_events_processed
UNION ALL
SELECT
  'webhook_rate_limits',
  COUNT(DISTINCT instance_id),
  COUNT(*),
  COUNT(*) FILTER (WHERE instance_id IS NULL OR instance_id = '')
FROM public.webhook_rate_limits
UNION ALL
SELECT
  'idempotency_rollback_failures',
  COUNT(DISTINCT instance),
  COUNT(*),
  COUNT(*) FILTER (WHERE instance IS NULL OR instance = '')
FROM public.idempotency_rollback_failures;

GRANT SELECT ON public.v_instance_isolation_stats TO authenticated;

-- Step 5: Document partition isolation requirements
COMMENT ON TABLE public.webhook_events_processed IS
  'Webhook event deduplication table.

   CRITICAL: instance_id IS THE PARTITION KEY.
   All queries MUST filter by instance_id to ensure isolation.

   FIX-11 (2026-07-12): Partition isolation enforcement via
   NOT NULL constraint + composite indexes.

   REQUIREMENTS FOR EDGE FUNCTIONS:
   1. Always filter: WHERE instance_id = $1 (provided from request context)
   2. Never use GLOBAL dedup: each instance has separate dedup window
   3. Never join across instances: triggers cross-instance data leakage

   Validation: Call fn_validate_partition_isolation() weekly';

COMMENT ON FUNCTION public.fn_validate_partition_isolation IS
  'Weekly validation: Check for partition isolation violations.

   Returns: (table_name, total_rows, null_instance_rows, status)

   Alerts CRITICAL if ANY rows found with missing instance_id.

   Recommended: Schedule via pg_cron weekly or after major deployments.';
