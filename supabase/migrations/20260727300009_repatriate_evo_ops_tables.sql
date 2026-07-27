-- Migration: 20260727300009_repatriate_evo_ops_tables
-- Purpose: Move 12 ops-tooling tables/functions that leaked into `evo` → `ops`.
-- Risk: HIGH — Evolution API v2.3.7 ORM may re-create these tables in `evo` on restart.
-- Pre-requisites:
--   1. Confirm which tables are Evolution-managed vs manually-added:
--      SELECT tablename, obj_description(oid,'pg_class') AS comment
--      FROM pg_tables JOIN pg_class ON relname=tablename AND relnamespace='evo'::regnamespace
--      WHERE tablename IN ('vps_comments','vps_diagnostic_runs','vps_etapas',
--                          'vps_performance_snapshots','vps_scenario_status',
--                          'vps_scenarios','vps_status_history','ops_runbooks',
--                          'migration_watermark','_secure_config',
--                          'idx_usage_audit','_snapshot_version_state');
--   2. Freeze Evolution API container during migration window to prevent ORM re-creation.
--   3. Staging validation required.
-- Rollback: drop compat views in evo; ALTER TABLE ops.X SET SCHEMA evo for each table.
-- Staging required: YES — Evolution API must be stopped during window.

SET search_path = ops, evo, public, pg_catalog;

-- ============================================================
-- SAFETY CHECK: Verify tables exist in evo before moving
-- ============================================================
DO $$
DECLARE
    v_missing text[] := '{}';
    t text;
    v_tables text[] := ARRAY[
        'vps_comments','vps_diagnostic_runs','vps_etapas',
        'vps_performance_snapshots','vps_scenario_status',
        'vps_scenarios','vps_status_history','ops_runbooks',
        'migration_watermark','_secure_config',
        'idx_usage_audit','_snapshot_version_state'
    ];
BEGIN
    FOREACH t IN ARRAY v_tables LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_tables
            WHERE schemaname = 'evo' AND tablename = t
        ) THEN
            v_missing := v_missing || t;
        END IF;
    END LOOP;
    IF array_length(v_missing, 1) > 0 THEN
        RAISE NOTICE 'Tables not found in evo (may already be in ops or do not exist): %',
            array_to_string(v_missing, ', ');
    END IF;
END;
$$;

-- ============================================================
-- PHASE 1: Move each table (uncomment after staging validation)
-- ============================================================
-- For each table: CREATE in ops LIKE evo, copy data, drop evo, create compat view.
-- Pattern repeated for all 12 tables:

/*
-- vps_scenarios
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='evo' AND tablename='vps_scenarios')
       AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='ops' AND tablename='vps_scenarios')
    THEN
        CREATE TABLE ops.vps_scenarios (LIKE evo.vps_scenarios INCLUDING ALL);
        INSERT INTO ops.vps_scenarios SELECT * FROM evo.vps_scenarios;
        RAISE NOTICE 'vps_scenarios copied to ops (% rows)', (SELECT COUNT(*) FROM ops.vps_scenarios);
    END IF;
END; $$;

-- vps_etapas
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='evo' AND tablename='vps_etapas')
       AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='ops' AND tablename='vps_etapas')
    THEN
        CREATE TABLE ops.vps_etapas (LIKE evo.vps_etapas INCLUDING ALL);
        INSERT INTO ops.vps_etapas SELECT * FROM evo.vps_etapas;
        RAISE NOTICE 'vps_etapas copied to ops (% rows)', (SELECT COUNT(*) FROM ops.vps_etapas);
    END IF;
END; $$;

-- vps_status_history
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='evo' AND tablename='vps_status_history')
       AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='ops' AND tablename='vps_status_history')
    THEN
        CREATE TABLE ops.vps_status_history (LIKE evo.vps_status_history INCLUDING ALL);
        INSERT INTO ops.vps_status_history SELECT * FROM evo.vps_status_history;
    END IF;
END; $$;

-- vps_scenario_status
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='evo' AND tablename='vps_scenario_status')
       AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='ops' AND tablename='vps_scenario_status')
    THEN
        CREATE TABLE ops.vps_scenario_status (LIKE evo.vps_scenario_status INCLUDING ALL);
        INSERT INTO ops.vps_scenario_status SELECT * FROM evo.vps_scenario_status;
    END IF;
END; $$;

-- vps_comments
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='evo' AND tablename='vps_comments')
       AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='ops' AND tablename='vps_comments')
    THEN
        CREATE TABLE ops.vps_comments (LIKE evo.vps_comments INCLUDING ALL);
        INSERT INTO ops.vps_comments SELECT * FROM evo.vps_comments;
    END IF;
END; $$;

-- vps_diagnostic_runs
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='evo' AND tablename='vps_diagnostic_runs')
       AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='ops' AND tablename='vps_diagnostic_runs')
    THEN
        CREATE TABLE ops.vps_diagnostic_runs (LIKE evo.vps_diagnostic_runs INCLUDING ALL);
        INSERT INTO ops.vps_diagnostic_runs SELECT * FROM evo.vps_diagnostic_runs;
    END IF;
END; $$;

-- vps_performance_snapshots
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='evo' AND tablename='vps_performance_snapshots')
       AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='ops' AND tablename='vps_performance_snapshots')
    THEN
        CREATE TABLE ops.vps_performance_snapshots (LIKE evo.vps_performance_snapshots INCLUDING ALL);
        INSERT INTO ops.vps_performance_snapshots SELECT * FROM evo.vps_performance_snapshots;
    END IF;
END; $$;

-- ops_runbooks
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='evo' AND tablename='ops_runbooks')
       AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='ops' AND tablename='ops_runbooks')
    THEN
        CREATE TABLE ops.ops_runbooks (LIKE evo.ops_runbooks INCLUDING ALL);
        INSERT INTO ops.ops_runbooks SELECT * FROM evo.ops_runbooks;
    END IF;
END; $$;

-- migration_watermark
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='evo' AND tablename='migration_watermark')
       AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='ops' AND tablename='migration_watermark')
    THEN
        CREATE TABLE ops.migration_watermark (LIKE evo.migration_watermark INCLUDING ALL);
        INSERT INTO ops.migration_watermark SELECT * FROM evo.migration_watermark;
    END IF;
END; $$;

-- _secure_config
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='evo' AND tablename='_secure_config')
       AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='ops' AND tablename='_secure_config')
    THEN
        CREATE TABLE ops._secure_config (LIKE evo._secure_config INCLUDING ALL);
        INSERT INTO ops._secure_config SELECT * FROM evo._secure_config;
    END IF;
END; $$;

-- idx_usage_audit
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='evo' AND tablename='idx_usage_audit')
       AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='ops' AND tablename='idx_usage_audit')
    THEN
        CREATE TABLE ops.idx_usage_audit (LIKE evo.idx_usage_audit INCLUDING ALL);
        INSERT INTO ops.idx_usage_audit SELECT * FROM evo.idx_usage_audit;
    END IF;
END; $$;

-- _snapshot_version_state
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='evo' AND tablename='_snapshot_version_state')
       AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='ops' AND tablename='_snapshot_version_state')
    THEN
        CREATE TABLE ops._snapshot_version_state (LIKE evo._snapshot_version_state INCLUDING ALL);
        INSERT INTO ops._snapshot_version_state SELECT * FROM evo._snapshot_version_state;
    END IF;
END; $$;
*/

-- ============================================================
-- PHASE 2: RLS on ops tables (after copy, before drop)
-- ============================================================
/*
DO $$
DECLARE t text;
DECLARE tables text[] := ARRAY[
    'vps_comments','vps_diagnostic_runs','vps_etapas',
    'vps_performance_snapshots','vps_scenario_status',
    'vps_scenarios','vps_status_history','ops_runbooks',
    'migration_watermark','_secure_config',
    'idx_usage_audit','_snapshot_version_state'
];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE ops.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('REVOKE ALL ON ops.%I FROM PUBLIC, anon, authenticated', t);
        EXECUTE format('GRANT ALL ON ops.%I TO service_role', t);
    END LOOP;
END; $$;
*/

-- ============================================================
-- PHASE 3: Drop evo tables + create compat views
-- ============================================================
/*
DO $$
DECLARE t text;
DECLARE tables text[] := ARRAY[
    'vps_comments','vps_diagnostic_runs','vps_etapas',
    'vps_performance_snapshots','vps_scenario_status',
    'vps_scenarios','vps_status_history','ops_runbooks',
    'migration_watermark','_secure_config',
    'idx_usage_audit','_snapshot_version_state'
];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        -- Drop from evo (only if ops table exists with data)
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='ops' AND tablename=t) THEN
            EXECUTE format('DROP TABLE IF EXISTS evo.%I CASCADE', t);
            -- Create backwards-compat view in evo
            EXECUTE format(
                'CREATE OR REPLACE VIEW evo.%I WITH (security_invoker=on) AS SELECT * FROM ops.%I',
                t, t
            );
            RAISE NOTICE 'evo.% replaced with view → ops.%', t, t;
        END IF;
    END LOOP;
END; $$;
*/

-- ============================================================
-- PHASE 4: Move fn_vps_* functions to ops
-- ============================================================
-- Functions to move (after tables are in ops):
-- fn_vps_dashboard_summary, fn_vps_health_score, fn_vps_risk_report,
-- fn_vps_next_priority, fn_vps_go_live_check, fn_vps_refresh_dashboard,
-- fn_vps_category_breakdown, pr_vps_update_status, trg_fn_vps_status_audit
--
-- Pattern: CREATE OR REPLACE FUNCTION ops.fn_vps_X(...) with updated schema refs
-- then CREATE OR REPLACE FUNCTION evo.fn_vps_X(...) as wrapper calling ops.fn_vps_X(...)
-- (Implement per-function after confirming current signatures via pg_proc)

-- ============================================================
-- VALIDATION (run after each phase)
-- ============================================================
/*
-- Verify tables moved:
SELECT schemaname, tablename FROM pg_tables
WHERE tablename IN ('vps_scenarios','vps_etapas','ops_runbooks','migration_watermark')
ORDER BY schemaname, tablename;

-- Verify compat views created in evo:
SELECT schemaname, viewname FROM pg_views
WHERE viewname IN ('vps_scenarios','vps_etapas','ops_runbooks','migration_watermark')
ORDER BY schemaname, viewname;

-- Verify evo still has no ops tooling (only Evolution-domain tables):
SELECT tablename FROM pg_tables WHERE schemaname = 'evo'
AND tablename NOT LIKE 'evolution_%'
AND tablename NOT IN ('contact_id_graveyard')
ORDER BY tablename;
*/

-- This migration is intentionally documented-only until staging validation.
-- Remove comments and execute phases sequentially after:
--   1. Evolution API container is frozen
--   2. Backup confirmed current
--   3. Staging execution successful

SELECT 'Migration 20260727300009 loaded as documentation. '
       'Execute Phase 1-4 sequentially after Evolution API freeze + staging. '
       'Read SCHEMA-CONTRACT.md §evo first.' AS status;
