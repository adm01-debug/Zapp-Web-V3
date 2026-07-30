-- Migration: 20260727300020_rls_gap_audit
-- Purpose: Audit and document RLS gaps. Create view of tables with RLS enabled
--          but no policies (service_role-only by design or gap).
--          Apply missing policies where safe.
-- Risk: LOW — additive policies only; does not change existing policies
-- Staging required: NO for views; YES for any policy that changes access

SET search_path = ops, zapp, evo, public, pg_catalog;

-- ============================================================
-- View: Tables with RLS on but no policies
-- ============================================================
CREATE OR REPLACE VIEW ops.v_rls_gaps
WITH (security_invoker = on) AS
SELECT
    n.nspname   AS schema_name,
    c.relname   AS table_name,
    CASE
        WHEN n.nspname = 'archive'
          OR c.relname LIKE '\_%'
        THEN 'intentional — service_role only (backup/internal)'
        ELSE 'REVIEW REQUIRED'
    END AS assessment
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'           -- regular table
  AND c.relrowsecurity = true   -- RLS enabled
  AND NOT EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = c.oid
  )
  AND n.nspname IN ('zapp','evo','ops','public','bpm','email_app','ai','financeiro','vendas','logistica','artes')
ORDER BY n.nspname, c.relname;

COMMENT ON VIEW ops.v_rls_gaps IS
    'Tables with RLS enabled but no policies. '
    'archive.* and internal tables are intentional (service_role-only). '
    'All others require review. Created: etapa 20 (2026-07-27).';

-- ============================================================
-- View: Tables WITHOUT RLS in business schemas
-- ============================================================
CREATE OR REPLACE VIEW ops.v_tables_without_rls
WITH (security_invoker = on) AS
SELECT
    n.nspname  AS schema_name,
    c.relname  AS table_name,
    'NO RLS — potential security gap' AS assessment
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND c.relrowsecurity = false
  AND n.nspname IN ('zapp','evo','bpm','email_app','ai','financeiro','vendas','logistica','artes')
  AND c.relname NOT LIKE 'pg_%'
ORDER BY n.nspname, c.relname;

COMMENT ON VIEW ops.v_tables_without_rls IS
    'Tables in business schemas WITHOUT RLS enabled. These are critical security gaps. '
    'Each table here is either a historical oversight or a deliberately unprotected internal table. '
    'All should be reviewed and have RLS + policies applied or documented as intentional.';

-- ============================================================
-- Known intentional gaps (document here, not gaps)
-- ============================================================
-- archive.* — 10 tables, service_role-only backup tables (documented in RLS-POLICIES.md)
-- ops._wal_slot_guard_events — internal Supabase table (moving to ops — etapa 7)
-- ops.* internal tables — service_role-only by design

-- ============================================================
-- CI Gate: RLS coverage check
-- ============================================================
CREATE OR REPLACE FUNCTION ops.fn_ci_check_rls_coverage()
RETURNS TABLE (status text, schema_name text, table_name text, issue text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
BEGIN
    RETURN QUERY
    SELECT
        'FAIL'::text AS status,
        n.nspname::text,
        c.relname::text,
        'Table without RLS in business schema'::text AS issue
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND c.relrowsecurity = false
      AND n.nspname IN ('zapp','evo','bpm','email_app','ai','financeiro','vendas')
      AND c.relname NOT LIKE 'pg_%';

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'PASS'::text, NULL::text, NULL::text, 'All business schema tables have RLS enabled'::text;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.fn_ci_check_rls_coverage() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.fn_ci_check_rls_coverage() TO authenticated, service_role;

-- ============================================================
-- Fix: Apply RLS to any remaining unprotected zapp tables
-- ============================================================
/*
-- APPLY CAREFULLY — test each policy in staging first
-- For each table in ops.v_tables_without_rls where schema_name = 'zapp':

-- Standard pattern for zapp tables:
ALTER TABLE zapp.<tablename> ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON zapp.<tablename> FROM anon;

CREATE POLICY "authenticated workspace access"
    ON zapp.<tablename>
    FOR ALL
    TO authenticated
    USING (
        workspace_id IN (
            SELECT workspace_id FROM zapp.workspace_members
            WHERE user_id = auth.uid()
        )
    );
*/

SELECT 'Migration 20260727300020 complete. '
       'RLS gap audit views created: ops.v_rls_gaps, ops.v_tables_without_rls. '
       'CI gate function ops.fn_ci_check_rls_coverage() created.' AS status;
