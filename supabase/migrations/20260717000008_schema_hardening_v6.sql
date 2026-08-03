-- Schema Hardening v6: CHECK constraints on remaining status columns
-- All values verified against live data (SELECT DISTINCT) and application code
-- before constraint creation. Applied after v5 (PR #441).

-- ============================================================
-- FIX #15: CHECK constraints on 23 additional status columns
-- GAP: These tables accepted any string in their status column,
-- allowing silent data corruption. Values verified against
-- actual DB data, TypeScript types, and edge functions.
-- ============================================================

-- Telephony
ALTER TABLE zapp.calls
  ADD CONSTRAINT calls_status_check
  CHECK (status IN ('ringing', 'answered', 'ended', 'missed', 'accept', 'offer', 'reject', 'terminate'));

-- User & access
ALTER TABLE zapp.department_invitations
  ADD CONSTRAINT department_invitations_status_check
  CHECK (status IN ('pending', 'accepted', 'declined', 'expired'));

ALTER TABLE zapp.queues
  ADD CONSTRAINT queues_status_check
  CHECK (status IN ('active', 'paused', 'archived', 'inactive'));

-- Content & documents
ALTER TABLE zapp.documents
  ADD CONSTRAINT documents_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed'));

ALTER TABLE zapp.contact_export_log
  ADD CONSTRAINT contact_export_log_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed'));

-- Data governance
ALTER TABLE zapp.data_deletion_requests
  ADD CONSTRAINT data_deletion_requests_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed'));

-- Infrastructure registry
ALTER TABLE zapp.instance_registry
  ADD CONSTRAINT instance_registry_status_check
  CHECK (status IN ('active', 'inactive', 'connected', 'disconnected', 'degraded', 'archived', 'not_provisioned'));

ALTER TABLE zapp.integration_registry
  ADD CONSTRAINT integration_registry_status_check
  CHECK (status IN ('active', 'inactive', 'deprecated'));

-- AI & analysis
ALTER TABLE zapp.conversation_analyses
  ADD CONSTRAINT conversation_analyses_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'failed'));

ALTER TABLE zapp.evaluation_runs
  ADD CONSTRAINT evaluation_runs_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed'));

ALTER TABLE zapp.finetune_jobs
  ADD CONSTRAINT finetune_jobs_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'));

-- Email & watch
ALTER TABLE zapp.email_watch_history
  ADD CONSTRAINT email_watch_history_status_check
  CHECK (status IN ('pending', 'active', 'expired', 'failed'));

-- Security & scanning
ALTER TABLE zapp.file_scan_logs
  ADD CONSTRAINT file_scan_logs_status_check
  CHECK (status IN ('pending', 'scanning', 'clean', 'infected', 'failed'));

-- Scheduled execution
ALTER TABLE zapp.cron_schedule_executions
  ADD CONSTRAINT cron_schedule_executions_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped'));

ALTER TABLE zapp.followup_executions
  ADD CONSTRAINT followup_executions_status_check
  CHECK (status IN ('pending', 'executed', 'failed', 'skipped'));

-- Messaging delivery
ALTER TABLE zapp.message_attempts
  ADD CONSTRAINT message_attempts_status_check
  CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'expired'));

-- Connection monitoring
ALTER TABLE zapp.connection_health_logs
  ADD CONSTRAINT connection_health_logs_status_check
  CHECK (status IN ('connected', 'disconnected', 'degraded', 'timeout'));

ALTER TABLE zapp.qr_attempts
  ADD CONSTRAINT qr_attempts_status_check
  CHECK (status IN ('pending', 'scanned', 'expired', 'failed'));

-- Ops & healthcheck
ALTER TABLE zapp.restore_test_log
  ADD CONSTRAINT restore_test_log_status_check
  CHECK (status IN ('PASS', 'FAIL', 'SKIP'));

ALTER TABLE zapp.vault_healthcheck_log
  ADD CONSTRAINT vault_healthcheck_log_status_check
  CHECK (status IN ('healthy', 'degraded', 'unhealthy', 'failed'));

-- Webhook processing
ALTER TABLE zapp.webhook_audit_log
  ADD CONSTRAINT webhook_audit_log_status_check
  CHECK (status IN ('received', 'processed', 'duplicate', 'failed', 'rejected'));

ALTER TABLE zapp.whatsapp_cloud_webhook_pings
  ADD CONSTRAINT whatsapp_cloud_webhook_pings_status_check
  CHECK (status IN ('received', 'queued', 'success', 'noop', 'invalid_json', 'failed'));

-- Audit (nullable — existing NULLs preserved)
ALTER TABLE zapp.audit_logs
  ADD CONSTRAINT audit_logs_status_check
  CHECK (status IS NULL OR status IN ('ok', 'warn', 'error', 'info'));
