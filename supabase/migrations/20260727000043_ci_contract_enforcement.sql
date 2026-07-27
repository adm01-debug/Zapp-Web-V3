-- ============================================================
-- Migration: 20260727000043_ci_contract_enforcement
-- Objetivo: Meta CI gate que executa todos os checks de uma vez
-- Criado: 2026-07-27
--参阅: Step 43
-- ============================================================

-- ============================================================================
-- Meta CI gate: executa todos os gates e retorna consolidado
-- ============================================================================
CREATE OR REPLACE FUNCTION ops.fn_ci_run_all_gates()
RETURNS TABLE(
    gate_name      TEXT,
    status         TEXT,
    error_count    BIGINT,
    warnings_count BIGINT,
    details        JSONB
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
BEGIN
    -- CI-01: Migration versions
    RETURN QUERY
    SELECT
        'migration_versions'::TEXT,
        CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
        count(*) FILTER (WHERE status = 'ERROR') AS error_count,
        count(*) FILTER (WHERE status = 'WARNING') AS warnings_count,
        jsonb_agg(jsonb_build_object('version', version, 'issue', issue)) AS details
    FROM ops.fn_ci_check_migration_versions();

    -- CI-02: Migration duplicates
    RETURN QUERY
    SELECT
        'migration_duplicates'::TEXT,
        CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
        count(*) FILTER (WHERE status = 'ERROR') AS error_count,
        0::BIGINT AS warnings_count,
        jsonb_agg(jsonb_build_object('version', version, 'issue', issue)) AS details
    FROM ops.fn_ci_check_migration_duplicates();

    -- CI-03: Forbidden FKs
    RETURN QUERY
    SELECT
        'forbidden_fks'::TEXT,
        CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
        count(*) FILTER (WHERE status = 'VIOLATION') AS error_count,
        0::BIGINT AS warnings_count,
        jsonb_agg(jsonb_build_object(
            'from_schema', from_schema, 'from_table', from_table,
            'to_schema', to_schema, 'to_table', to_table, 'issue', issue
        )) AS details
    FROM ops.fn_ci_check_forbidden_fks();

    -- CI-04: RLS coverage
    RETURN QUERY
    SELECT
        'rls_coverage'::TEXT,
        CASE WHEN count(*) FILTER (WHERE status = 'ERROR') = 0 THEN 'PASS' ELSE 'FAIL' END,
        count(*) FILTER (WHERE status = 'ERROR') AS error_count,
        count(*) FILTER (WHERE status = 'WARNING') AS warnings_count,
        jsonb_agg(jsonb_build_object(
            'schema', schema_name, 'table', table_name, 'issue', issue
        )) AS details
    FROM ops.fn_ci_check_rls_coverage();

    -- CI-05: Query SLA
    RETURN QUERY
    SELECT
        'query_sla'::TEXT,
        CASE WHEN count(*) FILTER (WHERE status = 'WARNING') = 0 THEN 'PASS' ELSE 'WARN' END,
        count(*) FILTER (WHERE status = 'CRITICAL') AS error_count,
        count(*) FILTER (WHERE status = 'WARNING') AS warnings_count,
        NULL::JSONB AS details
    FROM ops.v_slow_queries
    WHERE status IN ('critical', 'warning');

END;
$$;

-- ============================================================================
-- Função: retorna 1 se todos os gates passam, 0 se algum falha
-- Uso em CI/CD pipeline
-- ============================================================================
CREATE OR REPLACE FUNCTION ops.fn_ci_gate_all_passed()
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
DECLARE
    pass_count   INTEGER := 0;
    fail_count   INTEGER := 0;
    warn_count   INTEGER := 0;
    r            RECORD;
BEGIN
    FOR r IN SELECT * FROM ops.fn_ci_run_all_gates()
    LOOP
        IF r.status = 'PASS' THEN
            pass_count := pass_count + 1;
        ELSIF r.status = 'FAIL' THEN
            fail_count := fail_count + 1;
        ELSIF r.status = 'WARN' THEN
            warn_count := warn_count + 1;
        END IF;
    END LOOP;

    RAISE NOTICE 'CI GATES: % passed, % failed, % warnings', pass_count, fail_count, warn_count;

    RETURN fail_count = 0;
END;
$$;

COMMENT ON FUNCTION ops.fn_ci_run_all_gates() IS
'Executa todos os gates de CI e retorna resultado consolidado. Uso: SELECT * FROM ops.fn_ci_run_all_gates();';
COMMENT ON FUNCTION ops.fn_ci_gate_all_passed() IS
'Retorna true se todos os gates passam. Uso em CI/CD: SELECT NOT ops.fn_ci_gate_all_passed() AS has_failures;';
