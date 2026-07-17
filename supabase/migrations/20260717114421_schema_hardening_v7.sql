-- Schema Hardening v7: Final status CHECK constraints + data cleanup
-- Covers the last 12 unconstrained status columns (excluding _audit_sim_results
-- which is an internal tooling table, proxy_metrics which stores HTTP codes,
-- and email_health_logs whose RPC intentionally stores raw status values).
-- All values verified against app code, migrations, and edge functions.
-- Note: Supabase migration runner wraps each file in a transaction automatically.

-- ============================================================
-- FIX #16: Clean up exploit test data
-- ============================================================
DELETE FROM zapp.email_health_logs WHERE status = 'EXPLOIT_TEST_INVALID_9z9z';

-- ============================================================
-- FIX #17: CHECK constraints on final 12 status columns
-- Using NOT VALID to avoid blocking writes during table scan,
-- followed by VALIDATE CONSTRAINT to verify existing data.
-- All wrapped in DO blocks for idempotency (Rule M2).
--
-- NOTE: email_health_logs is intentionally excluded — the
-- rpc_log_email_health function stores raw p_status values
-- (e.g. 'ok') for diagnostic purposes. See migration
-- 20260702_email_rpc_hardening.sql line 90.
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_purchases_status_check') THEN
    ALTER TABLE zapp.contact_purchases
      ADD CONSTRAINT contact_purchases_status_check
      CHECK (status IN ('pending', 'approved', 'completed', 'cancelled')) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_deals_status_check') THEN
    ALTER TABLE zapp.sales_deals
      ADD CONSTRAINT sales_deals_status_check
      CHECK (status IN ('open', 'won', 'lost')) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'security_audit_logs_status_check') THEN
    ALTER TABLE zapp.security_audit_logs
      ADD CONSTRAINT security_audit_logs_status_check
      CHECK (status IN ('denied', 'allowed', 'flagged')) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_configs_status_check') THEN
    ALTER TABLE zapp.provider_configs
      ADD CONSTRAINT provider_configs_status_check
      CHECK (status IN ('online', 'degraded', 'offline', 'unknown')) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_message_log_status_check') THEN
    ALTER TABLE zapp.provider_message_log
      ADD CONSTRAINT provider_message_log_status_check
      CHECK (status IS NULL OR status IN ('received', 'persisted', 'routed', 'sent', 'delivered', 'read', 'failed')) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provider_message_log_delivery_status_check') THEN
    ALTER TABLE zapp.provider_message_log
      ADD CONSTRAINT provider_message_log_delivery_status_check
      CHECK (delivery_status IN ('pending', 'received', 'persisted', 'routed', 'sent', 'delivered', 'read', 'failed', 'error')) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stress_test_runs_status_check') THEN
    ALTER TABLE zapp.stress_test_runs
      ADD CONSTRAINT stress_test_runs_status_check
      CHECK (status IN ('running', 'completed', 'aborted', 'failed')) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_status_check') THEN
    ALTER TABLE zapp.sessions
      ADD CONSTRAINT sessions_status_check
      CHECK (status IN ('active', 'inactive', 'expired', 'revoked')) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webauthn_challenges_status_check') THEN
    ALTER TABLE zapp.webauthn_challenges
      ADD CONSTRAINT webauthn_challenges_status_check
      CHECK (status IN ('pending', 'verified', 'expired', 'failed')) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deploy_connections_status_check') THEN
    ALTER TABLE zapp.deploy_connections
      ADD CONSTRAINT deploy_connections_status_check
      CHECK (status IN ('active', 'inactive', 'disconnected', 'failed')) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_queues_status_check') THEN
    ALTER TABLE zapp.task_queues
      ADD CONSTRAINT task_queues_status_check
      CHECK (status IN ('active', 'paused', 'disabled')) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consumer_dlq_status_check') THEN
    ALTER TABLE zapp._consumer_dlq
      ADD CONSTRAINT consumer_dlq_status_check
      CHECK (status IN ('pending', 'retrying', 'replayed', 'abandoned', 'failed')) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supabase_projects_status_check') THEN
    ALTER TABLE zapp.supabase_projects
      ADD CONSTRAINT supabase_projects_status_check
      CHECK (status IN ('active', 'inactive', 'paused', 'deleted')) NOT VALID;
  END IF;
END $$;

-- Validate all constraints (safe: acquires SHARE UPDATE EXCLUSIVE, no write block)
-- VALIDATE is a no-op if the constraint is already valid.
ALTER TABLE zapp.contact_purchases VALIDATE CONSTRAINT contact_purchases_status_check;
ALTER TABLE zapp.sales_deals VALIDATE CONSTRAINT sales_deals_status_check;
ALTER TABLE zapp.security_audit_logs VALIDATE CONSTRAINT security_audit_logs_status_check;
ALTER TABLE zapp.provider_configs VALIDATE CONSTRAINT provider_configs_status_check;
ALTER TABLE zapp.provider_message_log VALIDATE CONSTRAINT provider_message_log_status_check;
ALTER TABLE zapp.provider_message_log VALIDATE CONSTRAINT provider_message_log_delivery_status_check;
ALTER TABLE zapp.stress_test_runs VALIDATE CONSTRAINT stress_test_runs_status_check;
ALTER TABLE zapp.sessions VALIDATE CONSTRAINT sessions_status_check;
ALTER TABLE zapp.webauthn_challenges VALIDATE CONSTRAINT webauthn_challenges_status_check;
ALTER TABLE zapp.deploy_connections VALIDATE CONSTRAINT deploy_connections_status_check;
ALTER TABLE zapp.task_queues VALIDATE CONSTRAINT task_queues_status_check;
ALTER TABLE zapp._consumer_dlq VALIDATE CONSTRAINT consumer_dlq_status_check;
ALTER TABLE zapp.supabase_projects VALIDATE CONSTRAINT supabase_projects_status_check;

-- ============================================================
-- FIX #18: Boolean columns missing DEFAULT values
-- ============================================================
UPDATE zapp.whatsapp_connections SET is_plugged = false WHERE is_plugged IS NULL;

ALTER TABLE zapp.cookies_config
  ALTER COLUMN is_healthy SET DEFAULT true;

ALTER TABLE zapp.whatsapp_connections
  ALTER COLUMN is_plugged SET DEFAULT false,
  ALTER COLUMN is_plugged SET NOT NULL;

-- ============================================================
-- FIX #19: Missing timestamp defaults + NOT NULL on
-- _vault_corrupted_quarantine
-- ============================================================
ALTER TABLE zapp._vault_corrupted_quarantine
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN quarantined_at SET DEFAULT now();

ALTER TABLE zapp._vault_corrupted_quarantine
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN quarantined_at SET NOT NULL;
