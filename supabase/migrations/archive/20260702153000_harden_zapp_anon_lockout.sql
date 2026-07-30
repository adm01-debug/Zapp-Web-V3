-- =============================================================================
-- Zapp schema — anonymous-access lockout (defense-in-depth)
-- Applied to production 2026-07-02. Idempotent; mirrors live state so that
-- staging / fresh environments reproduce the hardened configuration.
-- =============================================================================
-- Background: the `anon` role held table-level SELECT on 136 of 149 zapp tables
-- and 24 RLS policies used USING(true)/WITH CHECK(true) TO public. anon was only
-- blocked because it lacked USAGE on the schema — a single accidental
-- `GRANT USAGE ON SCHEMA zapp TO anon` would have exposed PII / messages /
-- conversations. This migration removes that latent exposure at every layer.
--
-- NOTE: policies TO `authenticated` with USING(true) are INTENTIONAL for this
-- single-organization shared inbox and are deliberately left untouched.
-- =============================================================================

-- 1) Retarget any remaining anon-exposed permissive policies to authenticated.
--    Guarded + idempotent: only touches policies that still target PUBLIC and
--    whose predicate is literally `true`.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl, p.polname AS pol
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'zapp'
      AND 0 = ANY(p.polroles)                                   -- targets PUBLIC/anon
      AND (pg_get_expr(p.polqual, p.polrelid) = 'true'
        OR pg_get_expr(p.polwithcheck, p.polrelid) = 'true')
  LOOP
    EXECUTE format('ALTER POLICY %I ON zapp.%I TO authenticated', r.pol, r.tbl);
  END LOOP;
END $$;

-- 2) Remove all table privileges from anon in zapp (current tables).
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA zapp FROM anon;

-- 3) Stop future tables (created by `postgres`) from re-granting anon.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA zapp REVOKE ALL ON TABLES FROM anon;

-- 4) Belt-and-suspenders: ensure anon cannot even enter the schema.
REVOKE USAGE ON SCHEMA zapp FROM anon;
