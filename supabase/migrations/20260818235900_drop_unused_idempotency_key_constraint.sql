-- Remove UNIQUE constraint on webhook_events_processed.idempotency_key
-- Rationale: 43MB index (0 scans ever). Deduplication uses event_id_uq (35k+ scans).
-- idempotency_key is written as an audit field derived from sha256(event_id), never queried.
-- Applied live 2026-08-18 via ALTER TABLE DROP CONSTRAINT.
ALTER TABLE zapp.webhook_events_processed
  DROP CONSTRAINT IF EXISTS webhook_events_processed_idempotency_key_key;
