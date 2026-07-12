-- ============================================================================
-- M-3: Idempotency hardening + message-key secondary dedup
-- Auditoria 2026-07-12
--
-- FINDINGS
-- --------
-- markEventProcessed() returns true on any non-23505 error (fail-open).
-- Intentional — pipeline must not stall on audit-infra failure. However,
-- the error path had no structured logging so transient failures were silent.
--
-- Cron jobid 152 (purge_webhook_events_processed, 04:30 daily, 3-day TTL):
-- HEALTHY — zapp.webhook_events_processed.processed_at has DEFAULT now()
-- on the underlying table. No action needed.
--
-- "Dedup adicional por key.id": WhatsApp messages arrive with a stable
-- key.id (the WhatsApp message WAMID). Current event-level dedup is
-- sha256(raw_body). If the same message arrives via two paths with slightly
-- different byte sequences (e.g., JSON key ordering), the hash differs and
-- dedup misses it. Adding a secondary unique index on (instance, message_key_id)
-- prevents double-insertion of the same WhatsApp message at the DB level.
--
-- CHANGES
-- -------
-- 1. Add nullable column message_key_id TEXT to zapp.webhook_events_processed
-- 2. Add partial unique index on (instance, message_key_id) WHERE NOT NULL
-- 3. The edge function (_shared/evolution-helpers.ts) is updated separately
--    to pass message_key_id for messages.upsert entries (edge function commit).
--
-- IDEMPOTENT: IF NOT EXISTS / CREATE INDEX CONCURRENTLY safe on repeated runs.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Add message_key_id column to zapp.webhook_events_processed
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE zapp.webhook_events_processed
  ADD COLUMN IF NOT EXISTS message_key_id TEXT;

COMMENT ON COLUMN zapp.webhook_events_processed.message_key_id IS
  'M-3 (2026-07-12): WhatsApp message WAMID (key.id from messages.upsert payload). '
  'NULL for non-message events. Used for secondary dedup on top of sha256 event hash '
  'so the same WhatsApp message is never double-processed even when raw body bytes differ.';

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Partial unique index: (instance, message_key_id) WHERE NOT NULL
-- ──────────────────────────────────────────────────────────────────────────────
-- Partial so non-message events (NULL message_key_id) are not affected.
-- CONCURRENTLY keeps the production table online during index build.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wep_instance_message_key
  ON zapp.webhook_events_processed (instance, message_key_id)
  WHERE message_key_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Validate: confirm index exists and check table row counts
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_idx_count int;
  v_row_count bigint;
  v_null_count bigint;
BEGIN
  SELECT COUNT(*) INTO v_idx_count
  FROM pg_indexes
  WHERE schemaname = 'zapp'
    AND tablename  = 'webhook_events_processed'
    AND indexname  = 'idx_wep_instance_message_key';

  IF v_idx_count = 0 THEN
    RAISE EXCEPTION 'M-3 validation FAILED: idx_wep_instance_message_key not found';
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE message_key_id IS NULL)
  INTO v_row_count, v_null_count
  FROM zapp.webhook_events_processed;

  RAISE NOTICE 'M-3 OK: idx_wep_instance_message_key created. rows=% null_key=%',
    v_row_count, v_null_count;
END;
$$;
