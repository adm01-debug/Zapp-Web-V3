-- FIX-10 Companion: Schedule dedup table cleanup job via pg_cron
-- =============================================================

-- Schedule cleanup to run every 6 hours
-- This keeps the dedup table size under control and prevents disk exhaustion
SELECT cron.schedule(
  'cleanup_webhook_dedup_table_6h',
  '0 */6 * * *',  -- Every 6 hours (at :00 of hours 0, 6, 12, 18)
  'SELECT public.fn_cleanup_webhook_dedup_table()'
);

-- Also schedule a weekly ANALYZE to update table statistics (helps query planner)
SELECT cron.schedule(
  'analyze_webhook_dedup_weekly',
  '0 2 * * 0',  -- Every Sunday at 2:00 AM (one hour before audit ANALYZE)
  'ANALYZE public.webhook_events_processed'
);

-- Optional: More aggressive cleanup if table is >500MB
-- This would run daily and be more aggressive, but might impact retry scenarios
-- SELECT cron.schedule(
--   'aggressive_cleanup_webhook_dedup_daily',
--   '0 4 * * *',  -- Every day at 4:00 AM
--   'SELECT public.fn_aggressive_cleanup_dedup_table() WHERE (
--     SELECT (pg_total_relation_size(''webhook_events_processed'') / 1024 / 1024) > 500
--   )'
-- );
