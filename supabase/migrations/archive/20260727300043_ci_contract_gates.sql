-- Migration: 20260727300043_ci_contract_gates
-- Purpose: Master CI gate function that runs ALL contract checks.
--          Returns a pass/fail verdict for CI pipelines.
--          Calls all ops.fn_ci_check_* functions defined in prior migrations.
-- Risk: LOW — function only
-- Staging required: NO

SET search_path = ops, public, pg_catalog;

-- ============================================================
-- Master CI gate — runs all checks, returns pass/fail
-- ============================================================
CREATE OR REPLACE FUNCTION ops.fn_ci_run_all_gates(
    p_fail_on_warning boolean DEFAULT false
)
RETURNS TABLE (
    check_name  text,
    status      text,
    detail      text,
    is_blocking boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
BEGIN
    -- Gate CI-01: DDL violations
    RETURN QUERY
    SELECT
        'CI-01:ddl_violations'::text,
        v.status,
        v.detail,
        (v.status IN ('CRITICAL','ERROR'))::boolean
    FROM ops.fn_ci_check_migration_versions() v;

    -- Gate CI-02: Migration duplicates
    RETURN QUERY
    SELECT
        'CI-02:migration_duplicates'::text,
        v.status,
        v.version,
        (v.status IN ('CRITICAL','ERROR'))::boolean
    FROM ops.fn_ci_check_migration_duplicates() v;

    -- Gate CI-03: RLS coverage
    RETURN QUERY
    SELECT
        'CI-03:rls_coverage'::text,
        c.status,
        format('%s.%s — %s', c.schema_name, c.table_name, c.issue),
        (c.status IN ('CRITICAL','ERROR'))::boolean
    FROM ops.fn_ci_check_rls_coverage() c;

    -- Gate CI-04: Forbidden cross-schema FKs
    RETURN QUERY
    SELECT
        'CI-04:forbidden_fks'::text,
        c.status,
        format('%s.%s → %s.%s: %s', c.from_schema, c.from_table, c.to_schema, c.to_table, c.issue),
        (c.status IN ('CRITICAL','ERROR'))::boolean
    FROM ops.fn_ci_check_forbidden_fks() c;

    -- Gate CI-05: Cron naming
    RETURN QUERY
    SELECT
        'CI-05:cron_naming'::text,
        c.status,
        format('job=%s: %s', c.jobname, c.issue),
        (p_fail_on_warning AND c.status = 'WARNING')::boolean
    FROM ops.fn_ci_check_cron_naming() c;

    -- Gate CI-06: Vacuum health
    RETURN QUERY
    SELECT
        'CI-06:vacuum_health'::text,
        c.status,
        format('%s.%s: %s', c.schema_name, c.table_name, c.issue),
        false::boolean   -- never blocking; warning only
    FROM ops.fn_ci_check_vacuum_health() c;

    -- Gate CI-07: Query SLA violations (warning only in CI)
    RETURN QUERY
    SELECT
        'CI-07:query_sla'::text,
        c.status,
        format('class=%s query=%s: %s', c.query_class, c.query_fragment, c.issue),
        (c.status = 'CRITICAL')::boolean
    FROM ops.fn_ci_check_query_sla() c;

    -- Gate CI-08: Cron health
    RETURN QUERY
    SELECT
        'CI-08:cron_health'::text,
        c.status,
        format('job=%s: %s', c.jobname, c.issue),
        (c.status = 'CRITICAL')::boolean
    FROM ops.fn_ci_check_cron_health() c;

END;
$$;

REVOKE EXECUTE ON FUNCTION ops.fn_ci_run_all_gates(boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.fn_ci_run_all_gates(boolean) TO service_role;

-- ============================================================
-- Convenience: Single boolean — did all gates pass?
-- ============================================================
CREATE OR REPLACE FUNCTION ops.fn_ci_gate_all_passed(
    p_fail_on_warning boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
DECLARE
    v_blocking_count integer;
BEGIN
    SELECT COUNT(*) INTO v_blocking_count
    FROM ops.fn_ci_run_all_gates(p_fail_on_warning)
    WHERE is_blocking;

    RETURN v_blocking_count = 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.fn_ci_gate_all_passed(boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.fn_ci_gate_all_passed(boolean) TO service_role;

-- ============================================================
-- View: Live gate status (for dashboard/monitoring)
-- ============================================================
CREATE OR REPLACE VIEW ops.v_ci_gate_status
WITH (security_invoker = on) AS
SELECT
    g.check_name,
    g.status,
    g.detail,
    g.is_blocking,
    now() AS evaluated_at
FROM ops.fn_ci_run_all_gates(false) g
ORDER BY g.is_blocking DESC, g.status DESC;

COMMENT ON VIEW ops.v_ci_gate_status IS
    'Live CI gate status. is_blocking=true means a check would fail CI. '
    'Run SELECT ops.fn_ci_gate_all_passed() for a boolean result. '
    'Created: etapa 43 (2026-07-27).';

-- ============================================================
-- SQL to use in CI pipeline (postgres shell):
-- ============================================================
-- psql $DATABASE_URL -c "SELECT CASE WHEN ops.fn_ci_gate_all_passed() THEN 'PASS' ELSE 'FAIL' END;"
-- Or for detailed output:
-- psql $DATABASE_URL -c "SELECT check_name, status, detail FROM ops.fn_ci_run_all_gates() WHERE status != 'OK';"

SELECT 'Migration 20260727300043 complete. '
       'ops.fn_ci_run_all_gates() master CI gate registered (8 sub-gates). '
       'ops.fn_ci_gate_all_passed() boolean shortcut registered. '
       'ops.v_ci_gate_status view created for live monitoring. '
       'Usage: SELECT ops.fn_ci_gate_all_passed();' AS status;
