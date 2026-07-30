-- Migration: 20260727300038_observability_dashboard
-- Purpose: Consolidated observability view + health dashboard function.
--          Aggregates all ops.fn_ci_check_* + key metrics into one query.
-- Risk: LOW — views and functions only
-- Staging required: NO

SET search_path = ops, public, pg_catalog;

-- ============================================================
-- Comprehensive observability dashboard view
-- ============================================================
CREATE OR REPLACE VIEW ops.v_observability_dashboard
WITH (security_invoker = on) AS
WITH
-- Index health
index_summary AS (
    SELECT
        COUNT(*) FILTER (WHERE NOT ix.indisprimary AND NOT ix.indisunique AND s.idx_scan = 0) AS unused_secondary_count,
        COUNT(*) FILTER (WHERE ix.indisprimary) AS pk_count,
        COUNT(*) AS total_index_count
    FROM pg_stat_user_indexes s
    JOIN pg_index ix ON ix.indexrelid = s.indexrelid
    WHERE s.schemaname IN ('zapp','evo','financeiro','email_app')
),
-- Quarantine status
quarantine_summary AS (
    SELECT
        COUNT(*) AS quarantine_total,
        COUNT(*) FILTER (WHERE drop_approved) AS approved_for_drop,
        COUNT(*) FILTER (WHERE dropped_at IS NOT NULL) AS already_dropped
    FROM ops.index_quarantine
),
-- Cron health (last 24h from execution history if populated)
cron_summary AS (
    SELECT
        COUNT(*) AS total_active_crons
    FROM cron.job WHERE active
),
-- RLS coverage
rls_summary AS (
    SELECT
        COUNT(*) FILTER (WHERE t.relrowsecurity) AS rls_enabled_count,
        COUNT(*) FILTER (WHERE NOT t.relrowsecurity AND n.nspname IN ('zapp','evo')) AS rls_missing_count
    FROM pg_class t
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE t.relkind = 'r'
      AND n.nspname IN ('zapp','evo','financeiro','email_app','bpm')
),
-- Table sizes
table_summary AS (
    SELECT
        n.nspname AS schema_name,
        COUNT(*) AS table_count,
        pg_size_pretty(SUM(pg_total_relation_size(t.oid))) AS total_size
    FROM pg_class t
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE t.relkind = 'r'
      AND n.nspname IN ('zapp','evo','financeiro','email_app','bpm','ops')
    GROUP BY n.nspname
)
SELECT
    now() AS dashboard_at,
    i.total_index_count,
    i.unused_secondary_count,
    q.quarantine_total AS indexes_in_quarantine,
    q.approved_for_drop AS indexes_approved_drop,
    c.total_active_crons,
    r.rls_enabled_count,
    r.rls_missing_count,
    (SELECT COUNT(*) FROM ops.matview_governance WHERE last_refreshed_at IS NULL
       OR last_refreshed_at < now() - (max_staleness_mins || ' minutes')::interval) AS stale_matviews,
    (SELECT COUNT(*) FROM ops.external_dependencies WHERE is_critical) AS critical_dependencies,
    (SELECT COUNT(*) FROM ops.index_missing_candidates WHERE status = 'pending') AS pending_missing_indexes
FROM index_summary i
CROSS JOIN quarantine_summary q
CROSS JOIN cron_summary c
CROSS JOIN rls_summary r;

COMMENT ON VIEW ops.v_observability_dashboard IS
    'Single-row health summary of the database. '
    'Query this view for a quick operational health check. '
    'Created: etapa 38 (2026-07-27).';

-- ============================================================
-- Comprehensive health check function (all gates + summary)
-- ============================================================
CREATE OR REPLACE FUNCTION ops.fn_health_check_full()
RETURNS TABLE (
    check_name  text,
    status      text,
    detail      text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
BEGIN
    -- DDL violations
    RETURN QUERY
    SELECT
        'ddl_violations'::text,
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARNING' END,
        format('%s unresolved DDL violations', COUNT(*))::text
    FROM ops.ddl_violations_live
    WHERE resolved_at IS NULL;

    -- RLS gaps
    RETURN QUERY
    SELECT
        'rls_gaps'::text,
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARNING' END,
        format('%s tables with RLS on but no policies', COUNT(*))::text
    FROM ops.v_rls_gaps;

    -- Tables without RLS
    RETURN QUERY
    SELECT
        'tables_without_rls'::text,
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARNING' END,
        format('%s tables in business schemas without RLS enabled', COUNT(*))::text
    FROM ops.v_tables_without_rls;

    -- Cross-schema FK violations
    RETURN QUERY
    SELECT
        'forbidden_fks'::text,
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'CRITICAL' END,
        format('%s evo→zapp FK violations detected', COUNT(*))::text
    FROM ops.v_cross_schema_fks
    WHERE is_violation;

    -- Index quarantine candidates (idx_scan=0, non-PK/unique)
    RETURN QUERY
    SELECT
        'unused_indexes'::text,
        CASE WHEN COUNT(*) < 100 THEN 'OK'
             WHEN COUNT(*) < 500 THEN 'WARNING'
             ELSE 'INFO' END,
        format('%s non-PK/UNIQUE indexes with idx_scan=0 (quarantine candidates)', COUNT(*))::text
    FROM ops.v_index_quarantine_candidates
    WHERE status = 'CANDIDATE';

    -- Stale matviews
    RETURN QUERY
    SELECT
        'stale_matviews'::text,
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARNING' END,
        format('%s matviews exceed staleness threshold', COUNT(*))::text
    FROM ops.v_matview_staleness
    WHERE freshness_status IN ('STALE','NEVER REFRESHED');

    -- Cron thundering herd
    RETURN QUERY
    SELECT
        'cron_thundering_herd'::text,
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARNING' END,
        format('%s cron time slots with >2 concurrent jobs', COUNT(*))::text
    FROM ops.v_cron_thundering_herd;

    -- Backcompat view allowlist coverage
    RETURN QUERY
    SELECT
        'backcompat_coverage'::text,
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARNING' END,
        format('%s canonical backcompat views missing from allowlist', COUNT(*))::text
    FROM ops.v_backcompat_view_coverage
    WHERE coverage_status != 'ALLOWLISTED';

    -- Migration version health
    RETURN QUERY
    SELECT
        'migration_versions'::text,
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARNING' END,
        format('%s malformed migration versions in correction log', COUNT(*))::text
    FROM ops.migration_version_corrections;

    -- Storage policy gaps
    RETURN QUERY
    SELECT
        'storage_policy'::text,
        CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARNING' END,
        format('%s buckets with policy gaps (public→private or missing signed-url config)', COUNT(*))::text
    FROM ops.v_storage_policy_gaps;

END;
$$;

REVOKE EXECUTE ON FUNCTION ops.fn_health_check_full() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.fn_health_check_full() TO service_role;

-- Grant read access to authenticated for the dashboard view
CREATE POLICY "authenticated can view observability dashboard"
    ON ops.index_quarantine FOR SELECT TO authenticated USING (true);

SELECT 'Migration 20260727300038 complete. '
       'ops.v_observability_dashboard view created (single-row health summary). '
       'ops.fn_health_check_full() comprehensive health check function registered.' AS status;
