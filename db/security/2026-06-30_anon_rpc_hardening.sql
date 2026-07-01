-- =====================================================================
-- zapp-web-v3 - Self-hosted Supabase - ANON RPC hardening
-- Date: 2026-06-30
--
-- WHY: 492 SECURITY DEFINER functions in `public` were EXECUTE-able by
--      `anon`. SECURITY DEFINER runs as the owner and bypasses RLS, so
--      anon could call e.g. rpc_list_messages() / rpc_insert_message()
--      and READ/WRITE all data - bypassing the table-level anon lockdown.
--      `anon` held EXECUTE both via an explicit grant AND via PUBLIC
--      (the `=X` ACL entry), so revoking from anon alone is NOT enough.
--
-- FIX: for each target function, GRANT EXECUTE to authenticated +
--      service_role (preserve app + backend), then REVOKE EXECUTE from
--      PUBLIC + anon.
--
-- RESULT (applied 2026-06-30): 489 functions closed; only 3 login-flow
--      functions kept anon-executable (allowlist below).
--
-- SAFETY: backs up signatures (+ whether PUBLIC had EXECUTE) to
--         archive.anon_func_grant_backup_20260630. See ROLLBACK script.
--         Run in a window; smoke-test login (success + failure) and app.
-- =====================================================================

BEGIN;
CREATE SCHEMA IF NOT EXISTS archive;
CREATE TABLE IF NOT EXISTS archive.anon_func_grant_backup_20260630 (
  func_signature text,
  had_public     boolean,
  captured_at    timestamptz NOT NULL DEFAULT now()
);

-- ---- ALLOWLIST (keep anon EXECUTE) - login flow, low sensitivity -----
CREATE TEMP TABLE _func_keep(proname name) ON COMMIT DROP;
INSERT INTO _func_keep(proname) VALUES
  ('record_failed_login'),
  ('clear_login_attempts'),
  ('sync_perfil_on_login');
-- --------------------------------------------------------------------

INSERT INTO archive.anon_func_grant_backup_20260630(func_signature, had_public)
SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)),
       (p.proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'))
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef = true
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
  AND p.proname <> ALL (SELECT proname FROM _func_keep);

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.proname <> ALL (SELECT proname FROM _func_keep)
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

COMMIT;

-- Post-check (expect 3 = allowlist):
--   SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND p.prosecdef=true
--     AND has_function_privilege('anon', p.oid,'EXECUTE');
