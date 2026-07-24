-- MELHORIA #5 — Autovacuum tuning for high-xid_age and high-write tables
--
-- Audit (2026-07-21) found:
--   - zapp.contatos:               xid_age 40M, 0 autovacuums ever
--   - evo.evolution_contacts:      xid_age 33.5M, 0 autovacuums ever (20K rows)
--   - evo.evolution_conversations_wpp2: xid_age 33.5M, 0 autovacuums
--   - evo.evolution_messages_wpp2: 51 MB active partition, needs lower scale_factor
--   - evo.evolution_whatsapp_status: xid_age 4M, no vacuum, 14K rows
--
-- Strategy:
--   a) Lower autovacuum_vacuum_scale_factor + autovacuum_analyze_scale_factor on
--      tables large enough to benefit from percentage-based thresholds.
--   b) Lower autovacuum_freeze_max_age on any table with xid_age > 30M so
--      the freeze vacuum runs before xid_age drifts past 100M.
--   c) Run VACUUM ANALYZE immediately on the most stale tables.

-- ── 1. High-write message/status partitions ──────────────────────────────────
-- evolution_messages_wpp2 (51 MB, 41K rows, active insert/update target)
-- Default scale_factor=0.2 means vacuum only after 8K dead tuples — too lazy.
ALTER TABLE evo.evolution_messages_wpp2 SET (
  autovacuum_vacuum_scale_factor   = 0.05,
  autovacuum_analyze_scale_factor  = 0.02,
  autovacuum_vacuum_cost_delay     = 2,
  autovacuum_vacuum_threshold      = 50
);

-- evolution_whatsapp_status (10 MB, 14K rows, status updates overwrite rows)
ALTER TABLE evo.evolution_whatsapp_status SET (
  autovacuum_vacuum_scale_factor   = 0.05,
  autovacuum_analyze_scale_factor  = 0.02,
  autovacuum_vacuum_threshold      = 50
);

-- ── 2. High-xid_age tables — lower freeze_max_age so VACUUM FREEZE ──────────
--    runs before xid_age reaches 200M.  We target ≤ 60M transactions old.
ALTER TABLE evo.evolution_contacts SET (
  autovacuum_vacuum_scale_factor   = 0.05,
  autovacuum_analyze_scale_factor  = 0.02,
  autovacuum_freeze_max_age        = 50000000,
  autovacuum_vacuum_threshold      = 100
);

ALTER TABLE evo.evolution_conversations_wpp2 SET (
  autovacuum_vacuum_scale_factor   = 0.05,
  autovacuum_freeze_max_age        = 50000000
);

ALTER TABLE evo.evolution_media SET (
  autovacuum_vacuum_scale_factor   = 0.05,
  autovacuum_freeze_max_age        = 50000000
);

-- ── 3. High-volume zapp write tables ─────────────────────────────────────────
-- webhook_events_processed (39 MB, 70K rows, ~3.4K inserts/batch)
ALTER TABLE zapp.webhook_events_processed SET (
  autovacuum_vacuum_scale_factor   = 0.05,
  autovacuum_analyze_scale_factor  = 0.02,
  autovacuum_vacuum_cost_delay     = 2,
  autovacuum_vacuum_threshold      = 200
);

-- webhook_audit_log (31 MB, 70K rows, append-only audit stream)
ALTER TABLE zapp.webhook_audit_log SET (
  autovacuum_vacuum_scale_factor   = 0.05,
  autovacuum_analyze_scale_factor  = 0.02,
  autovacuum_vacuum_threshold      = 200
);

-- app_notifications (9.6 MB, 12K rows, xid_age 33M — needs freeze tuning)
ALTER TABLE zapp.app_notifications SET (
  autovacuum_vacuum_scale_factor   = 0.05,
  autovacuum_analyze_scale_factor  = 0.02,
  autovacuum_freeze_max_age        = 50000000
);

-- ── 4. Note: VACUUM cannot run inside a transaction block ────────────────────
-- Supabase migrations execute inside a transaction, so VACUUM cannot be issued
-- here. Run the following manually via psql after applying this migration, or
-- schedule via pg_cron:
--
--   VACUUM (ANALYZE, VERBOSE) evo.evolution_contacts;
--   VACUUM (ANALYZE, VERBOSE) evo.evolution_conversations_wpp2;
--   VACUUM (ANALYZE, VERBOSE) evo.evolution_media;
--   VACUUM (ANALYZE, VERBOSE) evo.evolution_whatsapp_status;
--   VACUUM (ANALYZE, VERBOSE) zapp.contatos;
