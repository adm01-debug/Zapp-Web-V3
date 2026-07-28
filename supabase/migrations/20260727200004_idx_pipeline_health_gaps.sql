-- Migration: idx_pipeline_health_gaps
-- Performance indexes for the pipeline health RPC and gap detection queries.
-- These indexes support the whatsapp_reconcile_* crons and alerting.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_status_created
  ON zapp.messages (status, created_at DESC)
  WHERE status IN ('pending','queued','failed');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_pending_age
  ON zapp.messages (created_at ASC)
  WHERE status = 'pending';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dispatch_errors_created
  ON zapp.dispatch_error_logs (created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_queue_pending
  ON zapp.media_queue (created_at ASC)
  WHERE status = 'pending';

COMMENT ON INDEX zapp.idx_messages_status_created IS
  'Supports pipeline health dashboard and reconcile crons';
