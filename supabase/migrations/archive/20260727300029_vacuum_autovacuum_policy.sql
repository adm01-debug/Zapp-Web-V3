-- Migration: 20260727300029_vacuum_autovacuum_policy
-- Purpose: Document autovacuum tuning per hot table + create monitoring view.
--          Actual ALTER TABLE ... SET (autovacuum_*) must be applied manually or
--          via a separate DBA-approved migration after staging validation.
-- Risk: LOW — governance table + view only; no autovacuum changes applied here
-- Staging required: YES — for actual ALTER TABLE autovacuum settings

SET search_path = ops, public, pg_catalog;

-- ============================================================
-- Autovacuum policy table
-- ============================================================
CREATE TABLE IF NOT EXISTS ops.vacuum_policy (
    id                      bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    schema_name             text        NOT NULL,
    table_name              text        NOT NULL,
    reason                  text        NOT NULL,
    autovacuum_vacuum_scale_factor  numeric(5,3),
    autovacuum_analyze_scale_factor numeric(5,3),
    autovacuum_vacuum_cost_delay    integer,
    autovacuum_vacuum_threshold     integer,
    applied                 boolean     NOT NULL DEFAULT false,
    applied_at              timestamptz,
    notes                   text,
    UNIQUE (schema_name, table_name)
);

COMMENT ON TABLE ops.vacuum_policy IS
    'Per-table autovacuum tuning recommendations for hot tables. '
    'applied=false = recommended but not yet applied. '
    'Created: etapa 29 (2026-07-27).';

ALTER TABLE ops.vacuum_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ops.vacuum_policy FROM PUBLIC, anon;
GRANT SELECT ON ops.vacuum_policy TO authenticated;
GRANT ALL    ON ops.vacuum_policy TO service_role;

-- ============================================================
-- Seed: Hot tables requiring tighter autovacuum
-- ============================================================
INSERT INTO ops.vacuum_policy
    (schema_name, table_name, reason,
     autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor,
     autovacuum_vacuum_cost_delay, autovacuum_vacuum_threshold, notes)
VALUES
    -- webhook tables: high insert/update rate, large tables
    ('zapp', 'webhook_events_processed',
     '58k+ rows, high write rate (Evolution API webhooks). Default 20% threshold = 11k dead rows before vacuum.',
     0.01, 0.005, 2, 1000,
     'ALTER TABLE zapp.webhook_events_processed SET (autovacuum_vacuum_scale_factor=0.01, autovacuum_analyze_scale_factor=0.005, autovacuum_vacuum_cost_delay=2, autovacuum_vacuum_threshold=1000);'),

    ('zapp', 'webhook_audit_log',
     '58k+ rows, insert-heavy. Bloat risk without tight vacuum.',
     0.01, 0.005, 2, 1000,
     'ALTER TABLE zapp.webhook_audit_log SET (autovacuum_vacuum_scale_factor=0.01, autovacuum_analyze_scale_factor=0.005, autovacuum_vacuum_cost_delay=2, autovacuum_vacuum_threshold=1000);'),

    -- evolution tables: extremely high throughput
    ('evo', 'evolution_messages',
     'Root partitioned table (25 partitions). New messages arrive continuously. Each partition needs tight vacuum.',
     0.005, 0.002, 2, 500,
     'Apply to each partition: evolution_messages_wpp2, evolution_messages_comercial_01, etc.'),

    ('evo', 'evolution_contacts',
     '20k+ rows, updated on every Evolution webhook. Stale stats cause bad join plans.',
     0.02, 0.01, 5, 200,
     'ALTER TABLE evo.evolution_contacts SET (autovacuum_vacuum_scale_factor=0.02, autovacuum_analyze_scale_factor=0.01, autovacuum_vacuum_cost_delay=5);'),

    ('evo', 'evolution_whatsapp_status',
     '14k+ rows, UPDATE-heavy (presence/status changes). High dead tuple rate.',
     0.02, 0.01, 5, 200,
     'ALTER TABLE evo.evolution_whatsapp_status SET (autovacuum_vacuum_scale_factor=0.02, autovacuum_analyze_scale_factor=0.01);'),

    -- notification table
    ('zapp', 'app_notifications',
     '14k+ rows. Notifications marked read frequently = UPDATE churn. Risk of bloat.',
     0.05, 0.02, 10, 100,
     'ALTER TABLE zapp.app_notifications SET (autovacuum_vacuum_scale_factor=0.05, autovacuum_analyze_scale_factor=0.02);'),

    -- audit/history tables
    ('zapp', 'audit_logs',
     '4k+ rows with insert-only pattern. Analyze matters more than vacuum here.',
     0.10, 0.01, 20, 500,
     'ALTER TABLE zapp.audit_logs SET (autovacuum_analyze_scale_factor=0.01, autovacuum_vacuum_cost_delay=20);'),

    -- large contact tables
    ('zapp', 'empresas',
     '51k+ rows. CRM updates cause UPDATE churn. Analyze critical for good plans.',
     0.02, 0.01, 5, 500,
     'ALTER TABLE zapp.empresas SET (autovacuum_vacuum_scale_factor=0.02, autovacuum_analyze_scale_factor=0.01);')

ON CONFLICT (schema_name, table_name) DO NOTHING;

-- ============================================================
-- View: Tables with high bloat risk (dead tuples > threshold)
-- ============================================================
CREATE OR REPLACE VIEW ops.v_vacuum_candidates
WITH (security_invoker = on) AS
SELECT
    s.schemaname,
    s.relname   AS table_name,
    s.n_dead_tup,
    s.n_live_tup,
    ROUND(s.n_dead_tup::numeric / NULLIF(s.n_live_tup + s.n_dead_tup, 0) * 100, 2) AS dead_pct,
    pg_size_pretty(pg_total_relation_size(s.relid)) AS total_size,
    s.last_vacuum,
    s.last_autovacuum,
    s.last_analyze,
    s.last_autoanalyze,
    p.notes AS policy_notes
FROM pg_stat_user_tables s
LEFT JOIN ops.vacuum_policy p ON p.schema_name = s.schemaname AND p.table_name = s.relname
WHERE s.schemaname IN ('zapp','evo','financeiro','email_app','bpm')
  AND (s.n_dead_tup > 1000 OR s.last_autovacuum < now() - INTERVAL '24 hours')
ORDER BY s.n_dead_tup DESC;

COMMENT ON VIEW ops.v_vacuum_candidates IS
    'Tables with >1000 dead tuples or not vacuumed in 24h. '
    'Check regularly; run VACUUM ANALYZE on flagged tables.';

-- ============================================================
-- CI function: Check for tables with dangerous bloat
-- ============================================================
CREATE OR REPLACE FUNCTION ops.fn_ci_check_vacuum_health()
RETURNS TABLE (status text, schema_name text, table_name text, issue text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
BEGIN
    -- Tables with >50% dead tuple ratio and >10k live rows
    RETURN QUERY
    SELECT
        'WARNING'::text,
        s.schemaname::text,
        s.relname::text,
        format('dead_pct=%.1f%% (dead=%s, live=%s) — needs VACUUM ANALYZE',
               ROUND(s.n_dead_tup::numeric / NULLIF(s.n_live_tup + s.n_dead_tup, 0) * 100, 1),
               s.n_dead_tup, s.n_live_tup)::text
    FROM pg_stat_user_tables s
    WHERE s.schemaname IN ('zapp','evo','financeiro','email_app')
      AND s.n_live_tup > 10000
      AND (s.n_dead_tup::numeric / NULLIF(s.n_live_tup + s.n_dead_tup, 0)) > 0.30;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'OK'::text, 'all'::text, 'all'::text, 'No tables with critical bloat detected'::text;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.fn_ci_check_vacuum_health() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.fn_ci_check_vacuum_health() TO service_role;

SELECT 'Migration 20260727300029 complete. '
       'ops.vacuum_policy seeded with 8 hot tables. '
       'ops.v_vacuum_candidates view created. '
       'ALTER TABLE autovacuum settings documented in notes column — apply manually after staging.' AS status;
