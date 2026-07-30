-- =============================================================================
-- Close the latent anon-grant "mines" in the remaining app schemas.
--
-- The prior cycles hardened the schemas anon could actually reach (public, zapp,
-- vendas, financeiro — all had anon USAGE). A full instance sweep found six more
-- schemas that carry broad `anon` table grants but where `anon` has NO schema
-- USAGE, so they are not reachable today — a latent mine: a single stray
-- `GRANT USAGE ON SCHEMA <s> TO anon` (a common Supabase default) would instantly
-- expose them. Measured anon table grants at sweep time:
--   evo 143, bpm 39, email_app 35, ai 31, archive 15, monitoring 6  (= 269).
--
-- This revokes those anon grants (and future ones via ALTER DEFAULT PRIVILEGES)
-- so the mine can't be armed. It is provably safe: anon lacks schema USAGE on all
-- six, so anon cannot reach these tables regardless — the revoke is functionally
-- inert today and purely removes future exposure. `authenticated` and
-- `service_role` grants are untouched (verified: authenticated/service_role grant
-- counts unchanged after the sweep). Applied to production live; idempotent
-- (REVOKE is naturally idempotent; the loop is existence-guarded).
--
-- Post-sweep (verified): anon grants in these 6 schemas 269 -> 0; live anon leaks
-- instance-wide = 0.
-- =============================================================================

DO $$
DECLARE s text;
  schemas text[] := ARRAY['evo','email_app','ai','bpm','archive','monitoring'];
BEGIN
  FOREACH s IN ARRAY schemas LOOP
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = s) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM anon', s);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM anon', s);
      -- Stop future objects in these schemas from re-granting anon. Guarded so a
      -- non-existent granting role can't abort the migration.
      BEGIN
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE ALL ON TABLES FROM anon', s);
      EXCEPTION WHEN others THEN NULL; END;
      RAISE NOTICE 'swept anon grants from schema %', s;
    END IF;
  END LOOP;
END $$;
