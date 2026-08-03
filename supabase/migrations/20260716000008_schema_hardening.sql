-- Migration: Schema Hardening — Gaps found via exhaustive scenario simulation
-- Date: 2026-07-16
-- Scope: Missing UNIQUE constraints, missing indexes, partial indexes for queues,
--        NOT NULL enforcement on timestamp columns
-- Applied to: zapp schema (21 tables created by 20260715_create_missing_schema_objects)

BEGIN;

-- ============================================================
-- 1. UNIQUE CONSTRAINTS (data integrity for upsert patterns)
-- ============================================================

-- onboarding_steps: one entry per (user, step) — prevents duplicate step records
ALTER TABLE zapp.onboarding_steps
  ADD CONSTRAINT uq_onboarding_steps_user_step UNIQUE (user_id, step_key);

-- webhook_preferences: one preferences record per user
ALTER TABLE zapp.webhook_preferences
  ADD CONSTRAINT uq_webhook_preferences_user UNIQUE (user_id);


-- ============================================================
-- 2. MISSING LOOKUP INDEXES (query performance)
-- ============================================================

-- search_history: .select().eq('user_id') and .delete().eq('user_id')
CREATE INDEX idx_search_history_user_id
  ON zapp.search_history (user_id);

-- sentiment_alerts: correlation lookups by message_id
CREATE INDEX idx_sentiment_alerts_message_id
  ON zapp.sentiment_alerts (message_id);

-- sicoob_reply_outbox: outbox retrieval by contact
CREATE INDEX idx_sicoob_outbox_contact_id
  ON zapp.sicoob_reply_outbox (contact_id);

-- webhook_health_checks: .select().eq('webhook_id') health lookups
CREATE INDEX idx_webhook_health_checks_webhook_id
  ON zapp.webhook_health_checks (webhook_id);

-- webhook_reprocess_queue: lookups by connection
CREATE INDEX idx_webhook_reprocess_connection_id
  ON zapp.webhook_reprocess_queue (connection_id);

-- webhook_idempotency: cleanup queries DELETE WHERE expires_at < now()
CREATE INDEX idx_webhook_idempotency_expires_at
  ON zapp.webhook_idempotency (expires_at);


-- ============================================================
-- 3. PARTIAL INDEXES (queue processing hot-path)
-- ============================================================

-- sicoob_reply_outbox: only pending/processing rows scanned by workers
CREATE INDEX idx_sicoob_outbox_pending
  ON zapp.sicoob_reply_outbox (next_attempt_at)
  WHERE status IN ('pending', 'processing');

-- webhook_reprocess_queue: only pending/processing rows scanned by retry workers
CREATE INDEX idx_webhook_reprocess_pending
  ON zapp.webhook_reprocess_queue (next_retry_at)
  WHERE status IN ('pending', 'processing');


-- ============================================================
-- 4. NOT NULL ENFORCEMENT (timestamp consistency)
-- ============================================================

-- storage_cleanup_logs: created_at should never be NULL (has DEFAULT now())
UPDATE zapp.storage_cleanup_logs SET created_at = now() WHERE created_at IS NULL;
ALTER TABLE zapp.storage_cleanup_logs ALTER COLUMN created_at SET NOT NULL;

-- webhook_reprocess_queue: created_at/updated_at should never be NULL
UPDATE zapp.webhook_reprocess_queue SET created_at = now() WHERE created_at IS NULL;
UPDATE zapp.webhook_reprocess_queue SET updated_at = now() WHERE updated_at IS NULL;
ALTER TABLE zapp.webhook_reprocess_queue ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE zapp.webhook_reprocess_queue ALTER COLUMN updated_at SET NOT NULL;

COMMIT;
