-- Migration: 20260727300017_fix_malformed_migration_versions
-- Purpose: Register and document the 4 malformed migration version IDs.
--          The actual rename in supabase_migrations.schema_migrations requires
--          direct DBA access (UPDATE on system table). This migration documents
--          the corrective mapping and creates a CI gate.
-- Risk: LOW — metadata only; no production DDL changes
-- Staging required: NO
-- Malformed versions: 20260716, 20260717, 20260722, 20260722.2

SET search_path = ops, public, pg_catalog;

-- ============================================================
-- Document the malformed versions and their canonical names
-- ============================================================
CREATE TABLE IF NOT EXISTS ops.migration_version_corrections (
    malformed_version   text    NOT NULL PRIMARY KEY,
    canonical_version   text    NOT NULL CHECK (canonical_version ~ '^\d{14}$'),
    migration_name      text    NOT NULL,
    correction_notes    text,
    corrected_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ops.migration_version_corrections IS
    'Registro de versões de migration malformadas e seus IDs canônicos corretos. '
    'A correção no supabase_migrations.schema_migrations requer acesso DBA direto.';

INSERT INTO ops.migration_version_corrections
    (malformed_version, canonical_version, migration_name, correction_notes)
VALUES
    ('20260716', '20260716000000', 'fix_dispatch_error_logs_grant',
     'Falta 6 dígitos HHMMSS. Aplicar: UPDATE supabase_migrations.schema_migrations SET version=''20260716000000'' WHERE version=''20260716'';'),
    ('20260717', '20260717000000', 'create_queue_analytics',
     'Falta 6 dígitos HHMMSS. Aplicar: UPDATE supabase_migrations.schema_migrations SET version=''20260717000000'' WHERE version=''20260717'';'),
    ('20260722', '20260722000000', 'qa_infra_corrections',
     'Falta 6 dígitos HHMMSS. Aplicar: UPDATE supabase_migrations.schema_migrations SET version=''20260722000000'' WHERE version=''20260722'';'),
    ('20260722.2', '20260722120000', 'fix_profiles_insert_policy_and_trigger',
     'Versão com ponto — inválida. Aplicar: UPDATE supabase_migrations.schema_migrations SET version=''20260722120000'' WHERE version=''20260722.2'';')
ON CONFLICT (malformed_version) DO NOTHING;

ALTER TABLE ops.migration_version_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ops.migration_version_corrections FROM PUBLIC, anon, authenticated;
GRANT SELECT ON ops.migration_version_corrections TO authenticated;
GRANT ALL    ON ops.migration_version_corrections TO service_role;

-- ============================================================
-- CI Gate function: fails if malformed versions exist
-- ============================================================
CREATE OR REPLACE FUNCTION ops.fn_ci_check_migration_versions()
RETURNS TABLE (status text, version text, issue text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public, pg_catalog
AS $$
BEGIN
    RETURN QUERY
    SELECT
        'FAIL'::text AS status,
        sm.version,
        'Version does not match YYYYMMDDHHMMSS pattern'::text AS issue
    FROM supabase_migrations.schema_migrations sm
    WHERE sm.version !~ '^\d{14}$';

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'PASS'::text, NULL::text, 'All migration versions are well-formed'::text;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.fn_ci_check_migration_versions() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.fn_ci_check_migration_versions() TO authenticated, service_role;

-- ============================================================
-- CI Gate function: check for duplicate timestamps
-- ============================================================
CREATE OR REPLACE FUNCTION ops.fn_ci_check_migration_duplicates()
RETURNS TABLE (status text, version text, issue text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public, pg_catalog
AS $$
BEGIN
    RETURN QUERY
    SELECT
        'FAIL'::text,
        sm.version,
        'Duplicate migration timestamp'::text
    FROM supabase_migrations.schema_migrations sm
    GROUP BY sm.version
    HAVING COUNT(*) > 1;

    IF NOT FOUND THEN
        RETURN QUERY SELECT 'PASS'::text, NULL::text, 'No duplicate migration timestamps'::text;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.fn_ci_check_migration_duplicates() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.fn_ci_check_migration_duplicates() TO authenticated, service_role;

-- ============================================================
-- DBA Correction Script (apply manually with psql as postgres)
-- ============================================================
/*
-- Run as superuser to fix malformed versions:
UPDATE supabase_migrations.schema_migrations SET version = '20260716000000' WHERE version = '20260716';
UPDATE supabase_migrations.schema_migrations SET version = '20260717000000' WHERE version = '20260717';
UPDATE supabase_migrations.schema_migrations SET version = '20260722000000' WHERE version = '20260722';
UPDATE supabase_migrations.schema_migrations SET version = '20260722120000' WHERE version = '20260722.2';

-- Verify:
SELECT version, name FROM supabase_migrations.schema_migrations
WHERE version IN ('20260716000000','20260717000000','20260722000000','20260722120000')
ORDER BY version;
*/

SELECT 'Migration 20260727300017 complete. '
       'ops.migration_version_corrections table created with 4 entries. '
       'CI gate functions created. '
       'Apply DBA correction script manually (see comments).' AS status;
