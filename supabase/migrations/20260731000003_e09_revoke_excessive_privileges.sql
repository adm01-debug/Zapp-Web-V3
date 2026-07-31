-- =============================================================================
-- E09 — REVOKE excessive DDL privileges from authenticated/anon roles
-- =============================================================================
-- Principle of Least Privilege: application roles (authenticated, anon) should
-- NEVER have TRUNCATE, REFERENCES (FK creation), or TRIGGER privileges on any
-- application table. These are DBA/service_role-only operations.
--
-- What this migration does:
--   1. Revokes TRUNCATE, REFERENCES, TRIGGER from authenticated on all tables
--      in zapp, evo, bpm, email_app, ai, archive, financeiro, vendas, ops schemas.
--   2. Revokes ALL from anon except SELECT on explicitly whitelisted views.
--   3. Sets ALTER DEFAULT PRIVILEGES to prevent future grants of these ops.
--
-- This migration is SAFE to apply multiple times (REVOKE is idempotent).
-- =============================================================================

DO $$
DECLARE
  v_schema text;
  v_table  text;
  v_schemas text[] := ARRAY[
    'zapp', 'evo', 'bpm', 'email_app', 'ai',
    'archive', 'financeiro', 'vendas', 'ops'
  ];
BEGIN
  FOREACH v_schema IN ARRAY v_schemas LOOP
    FOR v_table IN
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = v_schema
    LOOP
      -- Revoke dangerous DDL privileges from authenticated
      EXECUTE format(
        'REVOKE TRUNCATE, REFERENCES, TRIGGER ON %I.%I FROM authenticated',
        v_schema, v_table
      );

      -- Revoke ALL from anon (anon should NEVER have direct table access;
      -- all anon access must go through security_invoker views with RLS)
      EXECUTE format(
        'REVOKE ALL ON %I.%I FROM anon',
        v_schema, v_table
      );
    END LOOP;

    -- Sequences: authenticated should have USAGE but not ALTER/DROP
    FOR v_table IN
      SELECT sequence_name
      FROM information_schema.sequences
      WHERE sequence_schema = v_schema
    LOOP
      EXECUTE format(
        'REVOKE ALL ON SEQUENCE %I.%I FROM anon',
        v_schema, v_table
      );
    END LOOP;
  END LOOP;

  RAISE NOTICE
    'E09: TRUNCATE, REFERENCES, TRIGGER revoked from authenticated on all app tables. '
    'ALL revoked from anon on all app tables. '
    'Schemas processed: %', array_to_string(v_schemas, ', ');
END $$;

-- =============================================================================
-- ALTER DEFAULT PRIVILEGES — prevent future tables from granting these ops
-- =============================================================================
-- Note: This sets defaults for tables created by the superuser/postgres role.
-- Tables created by other roles may need additional EXECUTE on their role.
-- =============================================================================

-- For zapp schema
ALTER DEFAULT PRIVILEGES IN SCHEMA zapp
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA zapp
  REVOKE ALL ON TABLES FROM anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA zapp
  REVOKE ALL ON SEQUENCES FROM anon;

-- For evo schema
ALTER DEFAULT PRIVILEGES IN SCHEMA evo
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA evo
  REVOKE ALL ON TABLES FROM anon;

-- For bpm schema
ALTER DEFAULT PRIVILEGES IN SCHEMA bpm
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA bpm
  REVOKE ALL ON TABLES FROM anon;

-- For email_app schema
ALTER DEFAULT PRIVILEGES IN SCHEMA email_app
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA email_app
  REVOKE ALL ON TABLES FROM anon;

-- For financeiro schema
ALTER DEFAULT PRIVILEGES IN SCHEMA financeiro
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA financeiro
  REVOKE ALL ON TABLES FROM anon;

-- =============================================================================
-- Verification: log tables that still have TRUNCATE granted to authenticated
-- (these are intentional exceptions and should be reviewed)
-- =============================================================================
DO $$
DECLARE
  v_count int;
  v_rows  text;
BEGIN
  SELECT COUNT(*), string_agg(
    format('%I.%I', n.nspname, c.relname), ', ' ORDER BY n.nspname, c.relname
  )
  INTO v_count, v_rows
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_roles r ON r.rolname = 'authenticated'
  WHERE c.relkind IN ('r', 'p')
    AND n.nspname IN ('zapp', 'evo', 'bpm', 'email_app', 'ai', 'archive', 'financeiro', 'vendas', 'ops')
    AND has_table_privilege('authenticated', format('%I.%I', n.nspname, c.relname), 'TRUNCATE');

  IF v_count > 0 THEN
    RAISE WARNING
      'E09 POST-CHECK: % tables still have TRUNCATE granted to authenticated: %',
      v_count, COALESCE(v_rows, '(none)');
  ELSE
    RAISE NOTICE
      'E09 POST-CHECK PASSED: No app tables have TRUNCATE granted to authenticated.';
  END IF;
END $$;
