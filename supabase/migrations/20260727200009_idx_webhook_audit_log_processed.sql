-- Migration: idx_webhook_audit_log_processed
--
-- The existing webhook_audit_log_status_idx covers only WHERE status IN ('error','rejected').
-- The fn_system_health_score and fn_webhook_pipeline_score functions query
-- WHERE status = 'processed' AND created_at > NOW() - INTERVAL '1 hour' (or similar
-- sliding windows). Without a matching index, those queries perform full sequential
-- scans on a high-write table (58K+ rows, 19 MB at last audit).
--
-- These health score functions are called by the monitoring dashboard on every
-- page load — the scan cost compounds with table growth.
--
-- Fix: add a partial descending index on created_at for the 'processed' status.
-- The partial predicate eliminates all other status rows from the index entirely,
-- keeping the index small and the scan fast.

CREATE INDEX IF NOT EXISTS idx_webhook_audit_log_processed_at
  ON zapp.webhook_audit_log (created_at DESC)
  WHERE status = 'processed';

-- Also index the 'success' status variant used by some queries
CREATE INDEX IF NOT EXISTS idx_webhook_audit_log_success_at
  ON zapp.webhook_audit_log (created_at DESC)
  WHERE status = 'success';

COMMENT ON INDEX zapp.idx_webhook_audit_log_processed_at IS
  'Partial descending index for health score queries: '
  'WHERE status = ''processed'' AND created_at > NOW() - INTERVAL ...';

COMMENT ON INDEX zapp.idx_webhook_audit_log_success_at IS
  'Partial descending index for health score queries: '
  'WHERE status = ''success'' AND created_at > NOW() - INTERVAL ...';
