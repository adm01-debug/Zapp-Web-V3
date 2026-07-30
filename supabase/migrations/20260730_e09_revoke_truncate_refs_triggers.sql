-- E09: REVOKE TRUNCATE, REFERENCES, TRIGGER from authenticated
-- Schemas: zapp, evo, bpm, ai, archive, logistica, email_app, financeiro

BEGIN;

-- Backup current grants
CREATE TABLE IF NOT EXISTS _grant_backup_20260730 AS
SELECT table_schema, table_name, privilege_type
FROM information_schema.table_privileges
WHERE grantee = 'authenticated'
  AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER')
  AND table_schema IN ('zapp','evo','bpm','ai','archive','logistica','email_app','financeiro');

-- Revoke TRUNCATE, REFERENCES, TRIGGER from authenticated on all tables in all 8 schemas
DO $$
DECLARE
    schema_name text;
    rec record;
BEGIN
    FOR schema_name IN SELECT unnest(ARRAY['zapp','evo','bpm','ai','archive','logistica','email_app','financeiro'])
    LOOP
        FOR rec IN EXECUTE format(
            'SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = %L', schema_name
        )
        LOOP
            EXECUTE format(
                'REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE %I.%I FROM authenticated',
                schema_name, rec.tablename
            );
        END LOOP;
    END LOOP;
END;
$$;

-- ALTER DEFAULT PRIVILEGES to prevent new tables from getting these grants
DO $$
DECLARE
    schema_name text;
BEGIN
    FOR schema_name IN SELECT unnest(ARRAY['zapp','evo','bpm','ai','archive','logistica','email_app','financeiro'])
    LOOP
        EXECUTE format(
            'ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated',
            schema_name
        );
    END LOOP;
END;
$$;

COMMIT;
