-- Migration: idx_pipeline_health_gaps
--
-- Adds performance indexes for the rpc_get_pipeline_health() queries that scan
-- evo.evolution_messages and evo.evolution_contacts for data-quality gaps.
-- Without these indexes the health dashboard forces full-table scans on tables
-- with hundreds of thousands of rows.

-- ── evolution_messages: contact_id IS NULL scan ─────────────────────────────
-- rpc_get_pipeline_health counts messages where contact_id IS NULL AND the jid
-- is not a group/broadcast/system jid. This partial index covers the dominant
-- filtering predicate so the planner can skip matched rows entirely.
CREATE INDEX IF NOT EXISTS idx_em_instance_no_contact
  ON evo.evolution_messages (instance_name, created_at DESC)
  WHERE contact_id IS NULL;

-- ── evolution_messages: latest_at (MAX(created_at)) fast lookup ──────────────
-- The health RPC needs MAX(created_at) per instance. A descending index on
-- (instance_name, created_at) lets the planner satisfy this with an index scan
-- on the first row instead of aggregating the entire partition.
CREATE INDEX IF NOT EXISTS idx_em_instance_created_desc
  ON evo.evolution_messages (instance_name, created_at DESC);

-- ── evolution_contacts: dedup_hash lookup ────────────────────────────────────
-- LGPD dedup-hash job (job 4 in lgpd-scheduled-jobs) SELECT contacts WHERE
-- dedup_hash IS NULL. A partial index avoids scanning the contacts that already
-- have a hash.
CREATE INDEX IF NOT EXISTS idx_ec_no_dedup_hash
  ON evo.evolution_contacts (instance_name)
  WHERE dedup_hash IS NULL
    AND deleted_at IS NULL;

-- Partial unique index on dedup_hash to prevent duplicate contacts from the
-- same instance. NULLs are not unique so they are safely excluded.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ec_dedup_hash_unique
  ON evo.evolution_contacts (instance_name, dedup_hash)
  WHERE dedup_hash IS NOT NULL
    AND deleted_at IS NULL;

-- ── evolution_contacts: LGPD deletion backlog ────────────────────────────────
-- rpc_get_pipeline_health counts contacts with lgpd_deletion_requested_at IS NOT
-- NULL AND pii_masked_at IS NULL. This partial index supports that count as well
-- as the anonymize_pending job in lgpd-scheduled-jobs.
CREATE INDEX IF NOT EXISTS idx_ec_lgpd_pending
  ON evo.evolution_contacts (instance_name, lgpd_deletion_requested_at)
  WHERE lgpd_deletion_requested_at IS NOT NULL
    AND pii_masked_at IS NULL
    AND deleted_at IS NULL;

-- ── evolution_conversations: no contact_id ───────────────────────────────────
-- Health RPC counts conversations where contact_id IS NULL. This partial index
-- allows an index-only scan for that aggregation.
CREATE INDEX IF NOT EXISTS idx_econv_instance_no_contact
  ON evo.evolution_conversations (instance_name)
  WHERE contact_id IS NULL;

COMMENT ON INDEX evo.idx_em_instance_no_contact IS
  'Partial index for rpc_get_pipeline_health: messages without contact_id per instance';
COMMENT ON INDEX evo.idx_em_instance_created_desc IS
  'Descending index for fast MAX(created_at) per instance in health dashboard';
COMMENT ON INDEX evo.idx_ec_no_dedup_hash IS
  'Partial index for LGPD dedup-hash job: contacts still missing dedup_hash';
COMMENT ON INDEX evo.idx_ec_dedup_hash_unique IS
  'Partial unique index to prevent duplicate contacts by dedup_hash per instance';
COMMENT ON INDEX evo.idx_ec_lgpd_pending IS
  'Partial index for LGPD anonymization backlog queries';
COMMENT ON INDEX evo.idx_econv_instance_no_contact IS
  'Partial index for health dashboard: conversations without contact_id';
