-- Schema Hardening v4: Triggers, partial indexes, and NOT NULL on core tables
-- Findings from simulation probes across updated_at triggers, queue indexes,
-- and nullable timestamps on high-traffic tables.

-- ============================================================
-- FIX #10: Missing updated_at triggers
-- GAP: 4 tables had an updated_at column but no BEFORE UPDATE
-- trigger to auto-set it, so updates silently left stale timestamps.
-- ============================================================
CREATE TRIGGER set_updated_at_conversation_threads
  BEFORE UPDATE ON zapp.conversation_threads
  FOR EACH ROW EXECUTE FUNCTION zapp.set_updated_at();

CREATE TRIGGER set_updated_at_outbound_message_queue
  BEFORE UPDATE ON zapp.outbound_message_queue
  FOR EACH ROW EXECUTE FUNCTION zapp.set_updated_at();

CREATE TRIGGER set_updated_at_outbox_events
  BEFORE UPDATE ON zapp.outbox_events
  FOR EACH ROW EXECUTE FUNCTION zapp.set_updated_at();

CREATE TRIGGER set_updated_at_reprocess_jobs
  BEFORE UPDATE ON zapp.reprocess_jobs
  FOR EACH ROW EXECUTE FUNCTION zapp.set_updated_at();

-- ============================================================
-- FIX #11: Partial indexes on queue tables for hot-path processing
-- GAP: batch_jobs, message_queue, queue_items had no partial
-- index on status, forcing full-table scans for pending items.
-- ============================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_batch_jobs_status_pending
  ON zapp.batch_jobs (status, created_at)
  WHERE status IN ('pending', 'running');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_message_queue_status_pending
  ON zapp.message_queue (status, created_at)
  WHERE status IN ('queued', 'processing');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_queue_items_status_pending
  ON zapp.queue_items (status, created_at)
  WHERE status IN ('pending', 'processing');

-- ============================================================
-- FIX #12: NOT NULL on created_at / updated_at for core tables
-- GAP: 19 core tables allowed NULL timestamps, breaking audit
-- trails and ORDER BY queries. All verified zero NULLs before apply.
-- ============================================================

-- User & access
ALTER TABLE zapp.profiles
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE zapp.departments
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE zapp.roles
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE zapp.workspaces
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

-- Messaging & templates
ALTER TABLE zapp.campaigns
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE zapp.message_templates
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE zapp.whatsapp_templates
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE zapp.conversation_threads
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

-- Channels & connections
ALTER TABLE zapp.service_channels
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE zapp.channel_connections
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

-- Automation & flows
ALTER TABLE zapp.automations
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE zapp.chatbot_flows
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

-- SLA & webhooks
ALTER TABLE zapp.sla_configurations
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE zapp.webhook_endpoints
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

-- Security
ALTER TABLE zapp.credential_vault
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

-- Queue infrastructure
ALTER TABLE zapp.outbox_events
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE zapp.reprocess_jobs
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

-- Single-column (no updated_at)
ALTER TABLE zapp.notifications
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE zapp.tags
  ALTER COLUMN created_at SET NOT NULL;
