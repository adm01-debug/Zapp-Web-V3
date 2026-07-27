-- ============================================================
-- MIGRATION: Explicit deny-all policies + ALTER DEFAULT PRIVILEGES
-- DATE: 2026-07-28
-- ============================================================

-- 1. Explicit deny-all for _wal_slot_guard_events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='_wal_slot_guard_events'
  ) THEN
    EXECUTE '
      CREATE POLICY deny_all_wal_guard ON public._wal_slot_guard_events
        AS RESTRICTIVE FOR ALL TO PUBLIC
        USING (false) WITH CHECK (false)
    ';
  END IF;
END;
$$;

-- 2. ALTER DEFAULT PRIVILEGES - artes schema
ALTER DEFAULT PRIVILEGES IN SCHEMA artes REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA artes REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA artes REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA artes REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- 3. ALTER DEFAULT PRIVILEGES - financeiro schema
ALTER DEFAULT PRIVILEGES IN SCHEMA financeiro REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA financeiro REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA financeiro REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA financeiro REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- 4. Event trigger function: not callable by anon
REVOKE EXECUTE ON FUNCTION zapp.fn_trg_auto_security_invoker() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.fn_trg_auto_security_invoker() TO postgres, supabase_admin;
