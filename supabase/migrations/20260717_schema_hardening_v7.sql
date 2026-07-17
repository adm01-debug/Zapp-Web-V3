-- Schema Hardening v7: Final status CHECK constraints + data cleanup
-- Covers the last 13 unconstrained status columns (excluding _audit_sim_results
-- which is an internal tooling table, and proxy_metrics which stores HTTP codes).
-- All values verified against app code, migrations, and edge functions.
-- Note: Supabase migration runner wraps each file in a transaction automatically.

-- ============================================================
-- FIX #16: Clean up exploit test data
-- GAP: email_health_logs contained a test row with invalid status
-- value 'EXPLOIT_TEST_INVALID_9z9z' from security testing.
-- ============================================================
DELETE FROM zapp.email_health_logs WHERE status = 'EXPLOIT_TEST_INVALID_9z9z';

-- ============================================================
-- FIX #17: CHECK constraints on final 13 status columns
-- GAP: These tables accepted any string in their status column.
-- Values verified against TypeScript types, migration comments,
-- edge function code, and UI components.
-- Using NOT VALID to avoid blocking writes during table scan,
-- followed by VALIDATE CONSTRAINT to verify existing data.
-- ============================================================

-- Sales & CRM
ALTER TABLE zapp.contact_purchases
  ADD CONSTRAINT contact_purchases_status_check
  CHECK (status IN ('pending', 'approved', 'completed', 'cancelled')) NOT VALID;

ALTER TABLE zapp.sales_deals
  ADD CONSTRAINT sales_deals_status_check
  CHECK (status IN ('open', 'won', 'lost')) NOT VALID;

-- Security
ALTER TABLE zapp.security_audit_logs
  ADD CONSTRAINT security_audit_logs_status_check
  CHECK (status IN ('denied', 'allowed', 'flagged')) NOT VALID;

-- Provider infrastructure
ALTER TABLE zapp.provider_configs
  ADD CONSTRAINT provider_configs_status_check
  CHECK (status IN ('online', 'degraded', 'offline', 'unknown')) NOT VALID;

ALTER TABLE zapp.provider_message_log
  ADD CONSTRAINT provider_message_log_status_check
  CHECK (status IS NULL OR status IN ('received', 'persisted', 'routed', 'sent', 'delivered', 'read', 'failed')) NOT VALID;

-- Email monitoring
ALTER TABLE zapp.email_health_logs
  ADD CONSTRAINT email_health_logs_status_check
  CHECK (status IN ('healthy', 'degraded', 'error', 'unknown')) NOT VALID;

-- Testing infrastructure
ALTER TABLE zapp.stress_test_runs
  ADD CONSTRAINT stress_test_runs_status_check
  CHECK (status IN ('running', 'completed', 'aborted', 'failed')) NOT VALID;

-- Sessions & auth
ALTER TABLE zapp.sessions
  ADD CONSTRAINT sessions_status_check
  CHECK (status IN ('active', 'inactive', 'expired', 'revoked')) NOT VALID;

ALTER TABLE zapp.webauthn_challenges
  ADD CONSTRAINT webauthn_challenges_status_check
  CHECK (status IN ('pending', 'verified', 'expired', 'failed')) NOT VALID;

-- Deployment & connections
ALTER TABLE zapp.deploy_connections
  ADD CONSTRAINT deploy_connections_status_check
  CHECK (status IN ('active', 'inactive', 'disconnected', 'failed')) NOT VALID;

-- Queue infrastructure
ALTER TABLE zapp.task_queues
  ADD CONSTRAINT task_queues_status_check
  CHECK (status IN ('active', 'paused', 'disabled')) NOT VALID;

ALTER TABLE zapp._consumer_dlq
  ADD CONSTRAINT consumer_dlq_status_check
  CHECK (status IN ('pending', 'retrying', 'replayed', 'abandoned', 'failed')) NOT VALID;

-- Project management
ALTER TABLE zapp.supabase_projects
  ADD CONSTRAINT supabase_projects_status_check
  CHECK (status IN ('active', 'inactive', 'paused', 'deleted')) NOT VALID;

-- Validate all constraints (safe: acquires SHARE UPDATE EXCLUSIVE, no write block)
ALTER TABLE zapp.contact_purchases VALIDATE CONSTRAINT contact_purchases_status_check;
ALTER TABLE zapp.sales_deals VALIDATE CONSTRAINT sales_deals_status_check;
ALTER TABLE zapp.security_audit_logs VALIDATE CONSTRAINT security_audit_logs_status_check;
ALTER TABLE zapp.provider_configs VALIDATE CONSTRAINT provider_configs_status_check;
ALTER TABLE zapp.provider_message_log VALIDATE CONSTRAINT provider_message_log_status_check;
ALTER TABLE zapp.email_health_logs VALIDATE CONSTRAINT email_health_logs_status_check;
ALTER TABLE zapp.stress_test_runs VALIDATE CONSTRAINT stress_test_runs_status_check;
ALTER TABLE zapp.sessions VALIDATE CONSTRAINT sessions_status_check;
ALTER TABLE zapp.webauthn_challenges VALIDATE CONSTRAINT webauthn_challenges_status_check;
ALTER TABLE zapp.deploy_connections VALIDATE CONSTRAINT deploy_connections_status_check;
ALTER TABLE zapp.task_queues VALIDATE CONSTRAINT task_queues_status_check;
ALTER TABLE zapp._consumer_dlq VALIDATE CONSTRAINT consumer_dlq_status_check;
ALTER TABLE zapp.supabase_projects VALIDATE CONSTRAINT supabase_projects_status_check;

-- ============================================================
-- FIX #18: Boolean columns missing DEFAULT values
-- GAP: These boolean columns had no default, causing potential
-- NULL insertions or requiring explicit values on every insert.
-- ============================================================
UPDATE zapp.whatsapp_connections SET is_plugged = false WHERE is_plugged IS NULL;

ALTER TABLE zapp.cookies_config
  ALTER COLUMN is_healthy SET DEFAULT true;

ALTER TABLE zapp.whatsapp_connections
  ALTER COLUMN is_plugged SET DEFAULT false,
  ALTER COLUMN is_plugged SET NOT NULL;

-- ============================================================
-- FIX #19: Missing timestamp defaults on _vault_corrupted_quarantine
-- GAP: created_at, updated_at, quarantined_at had no DEFAULT,
-- allowing rows without timestamps.
-- ============================================================
ALTER TABLE zapp._vault_corrupted_quarantine
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN quarantined_at SET DEFAULT now();
