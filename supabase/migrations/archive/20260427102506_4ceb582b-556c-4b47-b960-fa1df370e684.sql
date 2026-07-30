-- Onda 1: Revogar SELECT do role anon em todas as tabelas/views do schema public
-- Signup/login operam no schema auth e não dependem de SELECT em public.
-- Edge functions usam service_role. Frontend autenticado usa authenticated.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE SELECT ON TABLE %I.%I FROM anon', r.schemaname, r.tablename);
  END LOOP;
END $$;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, viewname
    FROM pg_views
    WHERE schemaname = 'public'
  LOOP
    BEGIN
      EXECUTE format('REVOKE SELECT ON %I.%I FROM anon', r.schemaname, r.viewname);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;

-- Default para futuras tabelas criadas pela role atual desta migration
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM anon;