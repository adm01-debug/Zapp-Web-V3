-- Schema Hardening v5: Duplicate indexes cleanup + CHECK constraints on status columns
-- Findings from exhaustive simulation probes across 84 status columns and duplicate index scan.

-- ============================================================
-- FIX #13: Drop 3 redundant duplicate indexes
-- GAP: These indexes are fully covered by existing PK or UNIQUE
-- indexes on the same columns, wasting write I/O and disk.
-- ============================================================

-- PK on deleted_contact_id already covers lookups
DROP INDEX IF EXISTS zapp.idx_contact_id_graveyard_lookup;

-- UNIQUE uq_email_watch_account already covers plain index
DROP INDEX IF EXISTS zapp.idx_email_watch_history_account;

-- Full index idx_stickers_owner covers all queries including WHERE owner_id IS NOT NULL
DROP INDEX IF EXISTS zapp.idx_stickers_owner_id;

-- ============================================================
-- FIX #14: CHECK constraints on 13 high-priority status columns
-- GAP: These tables accepted any string in their status column,
-- allowing silent data corruption. Values verified against app
-- code, TypeScript types, edge functions, and migration comments.
-- ============================================================

-- Conversations & threads
ALTER TABLE zapp.conversation_threads
  ADD CONSTRAINT conversation_threads_status_check
  CHECK (status IN ('open', 'pending', 'resolved', 'archived'));

ALTER TABLE zapp.conversation_tasks
  ADD CONSTRAINT conversation_tasks_status_check
  CHECK (status IN ('pending', 'completed'));

-- Channels
ALTER TABLE zapp.service_channels
  ADD CONSTRAINT service_channels_status_check
  CHECK (status IN ('active', 'paused', 'disabled'));

ALTER TABLE zapp.channel_connections
  ADD CONSTRAINT channel_connections_status_check
  CHECK (status IN ('pending_setup', 'connected', 'disconnected', 'open', 'active', 'closed', 'qrcode', 'qr', 'degraded'));

-- Automation
ALTER TABLE zapp.automation_executions
  ADD CONSTRAINT automation_executions_status_check
  CHECK (status IN ('pending', 'accepted', 'executed', 'dismissed', 'failed', 'error'));

-- Messaging
ALTER TABLE zapp.failed_messages
  ADD CONSTRAINT failed_messages_status_check
  CHECK (status IN ('pending', 'retrying', 'succeeded', 'abandoned', 'failed'));

ALTER TABLE zapp.whatsapp_templates
  ADD CONSTRAINT whatsapp_templates_status_check
  CHECK (status IN ('draft', 'approved', 'pending', 'rejected'));

ALTER TABLE zapp.whatsapp_flows
  ADD CONSTRAINT whatsapp_flows_status_check
  CHECK (status IN ('draft', 'published'));

-- Queue infrastructure
ALTER TABLE zapp.outbox_events
  ADD CONSTRAINT outbox_events_status_check
  CHECK (status IN ('pending', 'processing', 'dispatched', 'failed', 'abandoned'));

ALTER TABLE zapp.reprocess_jobs
  ADD CONSTRAINT reprocess_jobs_status_check
  CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'abandoned'));

ALTER TABLE zapp.batch_jobs
  ADD CONSTRAINT batch_jobs_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed'));

ALTER TABLE zapp.message_queue
  ADD CONSTRAINT message_queue_status_check
  CHECK (status IN ('queued', 'pending', 'processing', 'completed', 'failed'));

ALTER TABLE zapp.queue_items
  ADD CONSTRAINT queue_items_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed'));
