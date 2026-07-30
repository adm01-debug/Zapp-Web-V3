-- FIX: Cron job 54 (evolution-webhook-purge) retention mismatch
--
-- DB-T2 gap: fn_purge_processed_webhook_events() defaults to 7-day retention,
-- but cron job 54 invokes it with p_retention_days=30, defeating the M-3 fix.
-- This update makes the cron job consistent with the function default.

-- Verify job 54 exists and update its command to use 7-day retention
UPDATE cron.job
SET command = 'SELECT public.fn_purge_processed_webhook_events(7, 5000);'
WHERE jobid = 54
  AND jobname = 'evolution-webhook-purge'
  AND command LIKE '%fn_purge_processed_webhook_events(30%';

-- If job doesn't match the pattern (already fixed or renamed), insert a comment for ops
INSERT INTO cron.job (jobname, schedule, command, nodename, nodeport, database, username, active)
SELECT 'evolution-webhook-purge', '0 * * * *', 'SELECT public.fn_purge_processed_webhook_events(7, 5000);', 'localhost', 5432, 'postgres', 'postgres', true
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobid = 54 AND jobname = 'evolution-webhook-purge');
