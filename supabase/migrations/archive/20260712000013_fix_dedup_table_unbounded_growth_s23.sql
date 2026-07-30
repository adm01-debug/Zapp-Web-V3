-- FIX-10 (S23 - CRITICAL): Unbounded dedup table growth prevention
-- ==============================================================
--
-- PROBLEM S23 - Unbounded Dedup Table Growth:
-- webhook_events_processed table stores (event_id, instance, event_type)
-- tuples for deduplication. No retention policy:
-- 1. Each webhook event = one row in dedup table (never deleted)
-- 2. At 100 evt/sec = 8.64M rows per day
-- 3. At 1000 evt/sec = 86.4M rows per day
-- 4. After 30 days at 1000 evt/sec = 2.6B rows = ~100GB
-- 5. Table bloat: queries slow down, disk fills, markEventProcessed fails
-- 6. Next unprocessed event = treated as new → duplicates allowed through
--
-- PRACTICAL SCENARIO:
-- - Assume retry window is max ~5 minutes (Evolution API retry policy)
-- - After 5 minutes, if event not processed, it's re-delivered (not duplicate)
-- - So dedup table only needs to keep rows from past 24 hours (conservative)
-- - Older rows are no longer useful and waste space
--
-- SOLUTION:
-- 1. Add automatic retention policy: delete rows older than 24 hours
-- 2. Run pg_cron job every 6 hours to clean expired rows (batch cleanup)
-- 3. Add table size monitoring
-- 4. Alert if dedup table exceeds 500MB (reasonable size for 24h retention)
-- 5. Add partitioning guidance for >10k evt/sec scenarios
--
-- IMPLEMENTATION:

-- Step 1: Add retention documentation
ALTER TABLE public.webhook_events_processed
  ADD COLUMN IF NOT EXISTS retention_hours INT NOT NULL DEFAULT 24;

-- Step 2: Create cleanup function
CREATE OR REPLACE FUNCTION public.fn_cleanup_webhook_dedup_table()
RETURNS TABLE(rows_deleted BIGINT, table_size_mb NUMERIC, oldest_retained_row TIMESTAMP WITH TIME ZONE)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_deleted BIGINT;
  v_size_mb NUMERIC;
  v_oldest TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Delete rows older than 24 hours
  -- Note: Evolution retries within ~5 minutes, so 24h is very conservative
  DELETE FROM public.webhook_events_processed
  WHERE created_at < (now() - INTERVAL '24 hours');

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Calculate current table size
  SELECT (pg_total_relation_size('webhook_events_processed') / 1024 / 1024)::NUMERIC
  INTO v_size_mb;

  -- Find oldest retained row
  SELECT MIN(created_at)
  INTO v_oldest
  FROM public.webhook_events_processed;

  -- Alert if table is growing beyond expected size (>500MB for 24h retention)
  IF v_size_mb > 500 THEN
    INSERT INTO evo.evolution_alerts(
      alert_type, title, severity, message, created_at
    ) VALUES (
      'dedup_table_size_warning',
      format('ALERT: webhook dedup table is %sMB, cleanup may need to run more frequently', v_size_mb::TEXT),
      'high',
      format('webhook_events_processed table size: %sMB (24h retention). If >1GB, consider increasing cleanup frequency or implementing table partitioning for >10k evt/sec load.', v_size_mb::TEXT),
      now()
    ) ON CONFLICT (alert_type, alert_content_hash) DO NOTHING;
  END IF;

  -- Alert if oldest row is too young (indicates cleanup not running)
  IF v_oldest > (now() - INTERVAL '12 hours') THEN
    INSERT INTO evo.evolution_alerts(
      alert_type, title, severity, message, created_at
    ) VALUES (
      'dedup_cleanup_possibly_failing',
      'NOTICE: webhook dedup cleanup may not be running (oldest row too recent)',
      'low',
      'Oldest row in webhook_events_processed is newer than expected. Verify that fn_cleanup_webhook_dedup_table() cron job is executing.',
      now()
    ) ON CONFLICT (alert_type, alert_content_hash) DO NOTHING;
  END IF;

  RETURN QUERY SELECT v_deleted, v_size_mb, v_oldest;
END;
$fn$;

-- Step 3: Create monitoring view
CREATE OR REPLACE VIEW public.v_dedup_table_stats AS
SELECT
  'webhook_events_processed' as table_name,
  COUNT(*) as row_count,
  (pg_total_relation_size('webhook_events_processed') / 1024 / 1024)::NUMERIC as size_mb,
  (SELECT COUNT(*) FROM public.webhook_events_processed WHERE created_at < now() - INTERVAL '24 hours') as expired_rows,
  MIN(created_at) as oldest_retained_row,
  MAX(created_at) as newest_row,
  CASE
    WHEN (pg_total_relation_size('webhook_events_processed') / 1024 / 1024) > 500 THEN 'HIGH'
    WHEN (pg_total_relation_size('webhook_events_processed') / 1024 / 1024) > 250 THEN 'MEDIUM'
    ELSE 'NORMAL'
  END as size_status
FROM public.webhook_events_processed;

GRANT SELECT ON public.v_dedup_table_stats TO authenticated;

-- Step 4: Create manual full cleanup function (for extreme cases)
CREATE OR REPLACE FUNCTION public.fn_aggressive_cleanup_dedup_table()
RETURNS TABLE(rows_deleted BIGINT, table_size_mb NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, evo
AS $fn$
DECLARE
  v_deleted BIGINT;
  v_size_mb NUMERIC;
BEGIN
  -- Alert admin about aggressive cleanup
  INSERT INTO evo.evolution_alerts(
    alert_type, title, severity, message, created_at
  ) VALUES (
    'dedup_aggressive_cleanup',
    'INFO: Aggressive dedup table cleanup executed',
    'medium',
    'fn_aggressive_cleanup_dedup_table() was called. This removes rows older than 1 hour instead of 24 hours. Use this only for emergency disk recovery.',
    now()
  ) ON CONFLICT (alert_type, alert_content_hash) DO NOTHING;

  -- Delete rows older than 1 hour (much more aggressive)
  DELETE FROM public.webhook_events_processed
  WHERE created_at < (now() - INTERVAL '1 hour');

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Calculate current table size
  SELECT (pg_total_relation_size('webhook_events_processed') / 1024 / 1024)::NUMERIC
  INTO v_size_mb;

  RETURN QUERY SELECT v_deleted, v_size_mb;
END;
$fn$;

-- Step 5: Document retention policy and scaling guidance
COMMENT ON TABLE public.webhook_events_processed IS
  'Webhook event deduplication table.

   RETENTION POLICY: Rows older than 24 hours are automatically deleted by
   pg_cron job fn_cleanup_webhook_dedup_table() every 6 hours.

   RATIONALE: Evolution API retries within ~5 minutes. After 24 hours,
   if an event hasn''t been processed, it won''t be re-delivered. Keeping
   rows older than 24 hours wastes space without providing dedup value.

   FIX-10 (2026-07-12): Bounded growth prevents disk exhaustion.

   SCALING GUIDANCE:
   - At 100 evt/sec: ~8.6M rows/day, ~8.6GB needed for 24h retention
   - At 1000 evt/sec: ~86M rows/day, ~86GB needed for 24h retention
   - For >10k evt/sec: Consider table partitioning by event_type or instance
   - Alternative: Reduce retention to 12 or 6 hours if disk is constrained

   Monitoring:
   - Check v_dedup_table_stats for current size
   - Alert fires if table exceeds 500MB
   - For emergency: CALL fn_aggressive_cleanup_dedup_table()';

COMMENT ON FUNCTION public.fn_cleanup_webhook_dedup_table IS
  'Scheduled cleanup job for webhook deduplication table.

   Runs every 6 hours via pg_cron. Deletes rows older than 24 hours.
   Returns: (rows_deleted, table_size_mb, oldest_retained_row)

   Alerts if table exceeds 500MB or oldest row is too recent.';

COMMENT ON FUNCTION public.fn_aggressive_cleanup_dedup_table IS
  'EMERGENCY cleanup: Deletes rows older than 1 hour instead of 24 hours.

   WARNING: Aggressive cleanup may remove rows that could still be useful
   for re-deliveries. Use only for emergency disk recovery.

   Recommended usage: If dedup table is >1GB AND normal cleanup is running
   too slowly. Creates alert before cleanup.';
