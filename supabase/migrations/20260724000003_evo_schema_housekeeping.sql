-- Evolution API Audit 2026-07-24: evo Schema Housekeeping
--
-- This migration addresses remaining gaps not covered by melhoria3/melhoria5:
--   1. Autovacuum tuning for evo tables missed by melhoria5
--   2. WAL slot monitor helper function (cainophile_kzabiv0d lag 313 MB → growing)
--   3. Analyze partitioned root tables (planner statistics)
--   4. COMMENT documentation on critical evo tables
--   5. Partition-level autovacuum on high-write non-wpp2 partitions

-- ── 1. Autovacuum tuning for evo tables not covered in melhoria5 ─────────────

-- evolution_daily_metrics: 24×7 inserts/updates, no prior tuning
ALTER TABLE evo.evolution_daily_metrics SET (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_threshold     = 100
);

-- evolution_reactions: high-frequency react/un-react events
ALTER TABLE evo.evolution_reactions SET (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_threshold     = 200
);

-- evolution_calls: call events arrive in bursts
ALTER TABLE evo.evolution_calls SET (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

-- evolution_followups: time-based scheduler table, rows update frequently
ALTER TABLE evo.evolution_followups SET (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_vacuum_threshold     = 50
);

-- evolution_webhook_events_v2_default: catch-all partition (ongoing inserts)
ALTER TABLE evo.evolution_webhook_events_v2_default SET (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_threshold     = 500
);

-- evolution_bitrix_queue: job queue; rows are inserted and deleted frequently
ALTER TABLE evo.evolution_bitrix_queue SET (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_vacuum_threshold     = 100
);

-- evolution_ip_watch: security audit table updated by ingress events
ALTER TABLE evo.evolution_ip_watch SET (
  autovacuum_vacuum_scale_factor  = 0.10,
  autovacuum_vacuum_threshold     = 50
);

-- evolution_instance_credentials: rarely written but needs freeze protection
ALTER TABLE evo.evolution_instance_credentials SET (
  autovacuum_freeze_max_age = 50000000
);

-- evolution_health_logs: append-only health check log (high insert rate)
ALTER TABLE evo.evolution_health_logs SET (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_vacuum_threshold     = 500
);

-- evolution_incident_runbook: rarely written; freeze protection only
ALTER TABLE evo.evolution_incident_runbook SET (
  autovacuum_freeze_max_age = 50000000
);

-- evolution_status_auto_rules: configuration table, freeze protection
ALTER TABLE evo.evolution_status_auto_rules SET (
  autovacuum_freeze_max_age = 50000000
);

-- ── 2. Partition-level autovacuum for active non-wpp2 message partitions ─────
-- melhoria5 covered wpp2 only; the comercial_* partitions also receive writes.

DO $$
DECLARE
  partname TEXT;
  partition_list TEXT[] := ARRAY[
    'evolution_messages_comercial_01',
    'evolution_messages_comercial_02',
    'evolution_messages_comercial_03',
    'evolution_messages_comercial_04',
    'evolution_messages_comercial_05',
    'evolution_messages_comercial_06',
    'evolution_messages_comercial_07',
    'evolution_messages_comercial_08',
    'evolution_messages_comercial_09',
    'evolution_messages_comercial_10',
    'evolution_messages_comercial_11',
    'evolution_messages_comercial_12',
    'evolution_messages_comercial_13',
    'evolution_messages_comercial_14',
    'evolution_messages_comercial_15',
    'evolution_messages_artes',
    'evolution_messages_logistica',
    'evolution_messages_financeiro',
    'evolution_messages_compras',
    'evolution_messages_marketing',
    'evolution_messages_gravacao',
    'evolution_messages_default'
  ];
BEGIN
  FOREACH partname IN ARRAY partition_list
  LOOP
    EXECUTE format(
      'ALTER TABLE evo.%I SET (
         autovacuum_vacuum_scale_factor   = 0.05,
         autovacuum_analyze_scale_factor  = 0.02,
         autovacuum_vacuum_threshold      = 100
       )', partname
    );
  END LOOP;
END $$;

-- ── 3. WAL slot monitoring helper (cainophile_kzabiv0d lag: 313 MB, growing) ─
-- This function lets Hermes cron (or pg_cron) alert when lag exceeds threshold.
-- The problematic slot is on the _supabase database (logflare consumer).
-- This function lives in the application DB for monitoring convenience.

CREATE OR REPLACE FUNCTION zapp.fn_wal_slot_lag_check(
  p_threshold_mb INT DEFAULT 200
)
RETURNS TABLE (
  slot_name       TEXT,
  lag_mb          NUMERIC,
  is_active       BOOLEAN,
  exceeds_threshold BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT
    slot_name::TEXT,
    ROUND(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)
          / (1024.0 * 1024.0), 2) AS lag_mb,
    active AS is_active,
    ROUND(pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)
          / (1024.0 * 1024.0), 2) > p_threshold_mb AS exceeds_threshold
  FROM pg_replication_slots
  WHERE slot_type = 'logical'
  ORDER BY lag_mb DESC NULLS LAST;
$$;

REVOKE EXECUTE ON FUNCTION zapp.fn_wal_slot_lag_check(INT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_wal_slot_lag_check(INT) TO authenticated;

COMMENT ON FUNCTION zapp.fn_wal_slot_lag_check IS
  'Returns WAL lag in MB per logical replication slot. Slots exceeding p_threshold_mb '
  'flag exceeds_threshold=true. Monitor cainophile_kzabiv0d (Logflare) which was at '
  '313 MB lag on 2026-07-24 with ~35 MB/day growth.';

-- ── 4. COMMENT documentation on critical evo tables ──────────────────────────

COMMENT ON TABLE evo.evolution_messages IS
  'Partitioned root table for all WhatsApp messages. 25 partitions by instance name '
  '(wpp2, artes, comercial_01-15, compras, default, financeiro, gravacao, logistica, '
  'marketing, wpp2_archive). Realtime events use this root via supabase_realtime '
  'publication (publish_via_partition_root = true).';

COMMENT ON TABLE evo.evolution_conversations IS
  'Partitioned root table for WhatsApp conversations (one row per JID per instance). '
  '25 partitions mirroring evolution_messages partition layout. '
  'Realtime: subscribe to root, not individual partitions.';

COMMENT ON TABLE evo.evolution_contacts IS
  'Evolution API contact cache: 20,563 rows, 18 MB. '
  'xid_age was 33.5M on 2026-07-21 (autovacuum tuned in melhoria5). '
  'Indexed on pushname, phone; GIN trigram on nickname/first_name/job_title dropped '
  'in audit (unused since last restart).';

COMMENT ON TABLE evo.evolution_whatsapp_status IS
  'WhatsApp status/story cache: 14,789 rows, 10 MB. '
  'High update rate (status viewed events). Autovacuum tuned in melhoria5. '
  'Indexes wstatus_viewed_expires, wstatus_expires_at, wstatus_posted, '
  'wstatus_participant, wstatus_instance dropped in audit (0 scans).';

COMMENT ON TABLE evo.evolution_media IS
  'Media file metadata: 23,366 rows, 10 MB. Backed by Cloudflare R2 bucket '
  'zapp-whatsapp-media. TTL-based expiry handled by Evolution API internals. '
  'xid_age was 33.5M on 2026-07-21 (autovacuum tuned in melhoria5).';

COMMENT ON TABLE evo.evolution_health_logs IS
  'Append-only health check log written by Hermes monitoring agent every 15 min. '
  'Partition by time may be warranted if row count exceeds 500K.';

COMMENT ON TABLE evo.evolution_bitrix_queue IS
  'Job queue for Bitrix24 CRM integration. Rows inserted on incoming WA events '
  'and deleted after successful sync. Keep autovacuum aggressive to reclaim dead tuples.';

-- ── 5. ANALYZE root partitioned tables for fresh planner statistics ───────────
-- Only ANALYZE (no VACUUM) — safe to run without SUPERUSER in this context.
ANALYZE evo.evolution_messages;
ANALYZE evo.evolution_conversations;
ANALYZE evo.evolution_contacts;
ANALYZE evo.evolution_whatsapp_status;
ANALYZE evo.evolution_media;
ANALYZE evo.evolution_daily_metrics;
ANALYZE evo.evolution_reactions;
ANALYZE evo.evolution_followups;
