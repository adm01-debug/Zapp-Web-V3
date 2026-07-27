-- Migration: 20260727300021_fk_audit
-- Purpose: Create FK audit infrastructure. Find FK columns without supporting indexes
--          (causes slow sequential scans on the referenced table during deletes/updates).
--          Document cross-schema FKs that violate dependency rules.
-- Risk: LOW — views and functions only
-- Staging required: NO

SET search_path = ops, public, pg_catalog;

-- ============================================================
-- View: FK columns without indexes (performance gap)
-- ============================================================
CREATE OR REPLACE VIEW ops.v_fk_missing_indexes
WITH (security_invoker = on) AS
SELECT
    n.nspname   AS schema_name,
    c.relname   AS table_name,
    a.attname   AS column_name,
    fn.nspname  AS ref_schema,
    fc.relname  AS ref_table,
    fa.attname  AS ref_column,
    'FK without index — causes SeqScan on DELETE/UPDATE of referenced table' AS issue
FROM pg_constraint con
JOIN pg_class c   ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_class fc  ON fc.oid = con.confrelid
JOIN pg_namespace fn ON fn.oid = fc.relnamespace
JOIN pg_attribute a  ON a.attrelid = con.conrelid  AND a.attnum = ANY(con.conkey)
JOIN pg_attribute fa ON fa.attrelid = con.confrelid AND fa.attnum = ANY(con.confkey)
WHERE con.contype = 'f'
  AND n.nspname IN ('zapp','evo','bpm','email_app','ai','financeiro','vendas','logistica','artes')
  AND NOT EXISTS (
      SELECT 1 FROM pg_index idx
      JOIN pg_class ic ON ic.oid = idx.indexrelid
      WHERE idx.indrelid = con.conrelid
        AND a.attnum = ANY(idx.indkey)
  )
ORDER BY n.nspname, c.relname, a.attname;

COMMENT ON VIEW ops.v_fk_missing_indexes IS
    'FK columns that lack a supporting index. '
    'Without an index, DELETE/UPDATE on the referenced table causes a full SeqScan '
    'on the referencing table. Fix: CREATE INDEX on the FK column. '
    'Created: etapa 21 (2026-07-27).';

-- ============================================================
-- View: Cross-schema FKs (dependency audit)
-- ============================================================
CREATE OR REPLACE VIEW ops.v_cross_schema_fks
WITH (security_invoker = on) AS
SELECT
    n.nspname   AS from_schema,
    c.relname   AS from_table,
    a.attname   AS from_column,
    fn.nspname  AS to_schema,
    fc.relname  AS to_table,
    fa.attname  AS to_column,
    CASE
        WHEN n.nspname = 'evo' AND fn.nspname = 'zapp'
            THEN '⚠️ VIOLATION: evo→zapp dependency (FORBIDDEN by SCHEMA-CONTRACT)'
        WHEN n.nspname = fn.nspname
            THEN 'same-schema FK (ok)'
        ELSE 'cross-schema FK (review allowed dependencies)'
    END AS assessment
FROM pg_constraint con
JOIN pg_class c   ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_class fc  ON fc.oid = con.confrelid
JOIN pg_namespace fn ON fn.oid = fc.relnamespace
JOIN pg_attribute a  ON a.attrelid = con.conrelid  AND a.attnum = ANY(con.conkey)
JOIN pg_attribute fa ON fa.attrelid = con.confrelid AND fa.attnum = ANY(con.confkey)
WHERE con.contype = 'f'
  AND n.nspname IN ('zapp','evo','bpm','email_app','ai','financeiro','vendas','logistica','artes')
  AND n.nspname != fn.nspname  -- only cross-schema
ORDER BY n.nspname, c.relname;

COMMENT ON VIEW ops.v_cross_schema_fks IS
    'Cross-schema FK dependencies. Any evo→zapp FK is a VIOLATION of SCHEMA-CONTRACT. '
    'Review all other cross-schema FKs for compliance. '
    'Created: etapa 21 (2026-07-27).';

-- ============================================================
-- CI Gate: Forbidden FKs
-- ============================================================
CREATE OR REPLACE FUNCTION ops.fn_ci_check_forbidden_fks()
RETURNS TABLE (status text, from_schema text, from_table text, to_schema text, to_table text, issue text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
BEGIN
    RETURN QUERY
    SELECT
        'FAIL'::text,
        n.nspname::text,
        c.relname::text,
        fn.nspname::text,
        fc.relname::text,
        'FORBIDDEN: evo→zapp FK dependency'::text
    FROM pg_constraint con
    JOIN pg_class c   ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_class fc  ON fc.oid = con.confrelid
    JOIN pg_namespace fn ON fn.oid = fc.relnamespace
    WHERE con.contype = 'f'
      AND n.nspname = 'evo'
      AND fn.nspname = 'zapp';

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'PASS'::text, NULL::text, NULL::text, NULL::text, NULL::text,
            'No forbidden cross-schema FK dependencies'::text;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.fn_ci_check_forbidden_fks() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.fn_ci_check_forbidden_fks() TO authenticated, service_role;

SELECT 'Migration 20260727300021 complete. '
       'FK audit views: ops.v_fk_missing_indexes, ops.v_cross_schema_fks. '
       'CI gate: ops.fn_ci_check_forbidden_fks().' AS status;
