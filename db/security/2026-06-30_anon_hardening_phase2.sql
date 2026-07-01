-- =====================================================================
-- zapp-web-v3 - Self-hosted - ANON hardening PHASE 2 (2026-06-30)
-- Completes phase 1 (tables/matviews/DEFINER funcs) by closing the two
-- remaining anon vectors: SECURITY INVOKER functions + schema USAGE.
-- Self-hosted target is NOT in production until cutover. Reversible.
-- =====================================================================
BEGIN;
CREATE SCHEMA IF NOT EXISTS archive;

-- ===== A) Revoke anon USAGE on app namespaced schemas =====
-- anon never needs these (PostgREST exposes only `public`). Keeps
-- public / storage / graphql_public (platform-required for anon).
CREATE TABLE IF NOT EXISTS archive.anon_schema_usage_backup_20260630 (
  schema_name text, captured_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO archive.anon_schema_usage_backup_20260630(schema_name)
SELECT n.nspname FROM pg_namespace n
WHERE n.nspname IN ('zapp','evo','bpm','ai','email_app','monitoring')
  AND has_schema_privilege('anon', n.nspname, 'USAGE');

REVOKE USAGE ON SCHEMA zapp, evo, bpm, ai, email_app, monitoring FROM anon;

-- ===== B) Revoke anon EXECUTE on SECURITY INVOKER public functions =====
-- Same pattern as the DEFINER pass: preserve authenticated+service_role,
-- strip PUBLIC+anon. Login-flow funcs allowlisted.
CREATE TABLE IF NOT EXISTS archive.anon_invoker_func_backup_20260630 (
  func_signature text, had_public boolean, captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE TEMP TABLE _func_keep(proname name) ON COMMIT DROP;
INSERT INTO _func_keep VALUES ('record_failed_login'),('clear_login_attempts'),('sync_perfil_on_login');

INSERT INTO archive.anon_invoker_func_backup_20260630(func_signature, had_public)
SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)),
       (p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef=false
  AND has_function_privilege('anon', p.oid,'EXECUTE')
  AND p.proname <> ALL (SELECT proname FROM _func_keep);

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef=false
      AND has_function_privilege('anon', p.oid,'EXECUTE')
      AND p.proname <> ALL (SELECT proname FROM _func_keep)
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

COMMIT;

-- Verified post-apply: anon executes exactly 3 public funcs (allowlist);
-- authenticated/service_role lost access to 0 functions; anon USAGE = false
-- on zapp/evo/bpm/ai/email_app/monitoring.
