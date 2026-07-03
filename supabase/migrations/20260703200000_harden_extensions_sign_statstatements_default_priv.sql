-- =============================================================================
-- Close extensions.* anon access + fix systemic SD function default privilege
-- Applied to production 2026-07-03. Idempotent (guarded).
-- =============================================================================
-- Findings (empirically confirmed via role-simulation testing):
--
-- 1) extensions.sign(json,text,text) + extensions.algorithm_sign + extensions.verify
--    were callable by anon. Combined with app.settings.jwt_secret being readable
--    via current_setting() by any role (GUC custom param), anon could forge valid
--    JWT tokens signed with the real secret => authentication bypass.
--    Fix: REVOKE FROM PUBLIC (must be done as supabase_admin, the original grantor).
--
-- 2) extensions.pg_stat_statements(boolean) callable by anon => exposed 2,652+
--    queries from ALL users, including admin operations, edge function calls,
--    and potentially sensitive data embedded in queries.
--
-- 3) extensions.grant_pg_net_access(), grant_pg_cron_access(), grant_pg_graphql_access(),
--    pgrst_ddl_watch, pgrst_drop_watch, set_graphql_placeholder were callable by anon.
--    grant_pg_net_access() in particular could attempt to re-grant net.http* access.
--    (Confirmed executed by anon in testing; net access NOT re-opened because our
--    prior fix removed explicit individual grants, not just PUBLIC.)
--
-- 4) Two new SD functions (rpc_message_stats, rpc_search_messages) were created AFTER
--    the prior REVOKE loop and inherited the default PUBLIC execute privilege.
--    rpc_search_messages returned 5 real messages (content, phone numbers, names).
--    rpc_message_stats returned business intelligence contact counts.
--    Root cause: the prior loop was a point-in-time fix; new functions get proacl=null
--    which defaults to PUBLIC execute. Fixed by:
--      a) Immediate REVOKE on these 2 functions
--      b) ALTER DEFAULT PRIVILEGES FOR ROLE postgres/supabase_admin IN SCHEMA public/zapp
--         REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC (prevents ALL future SD functions
--         from being anon-callable on creation)
--
-- NOTE: extensions.sign and pg_stat_statements required SET ROLE supabase_admin
-- (the original grantor). Running REVOKE as postgres alone was silently a no-op.
-- =============================================================================

-- 1) Revoke dangerous extensions.* from PUBLIC (as supabase_admin = original grantor)
DO $$
DECLARE p record; cnt int := 0;
BEGIN
  SET LOCAL ROLE supabase_admin;
  FOR p IN
    SELECT pg_proc.oid, pg_proc.proname,
           pg_get_function_identity_arguments(pg_proc.oid) AS args
    FROM pg_proc JOIN pg_namespace n ON n.oid=pg_proc.pronamespace
    WHERE n.nspname='extensions'
      AND has_function_privilege('anon', pg_proc.oid, 'EXECUTE')
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION extensions.%I(%s) FROM PUBLIC',
                     p.proname, p.args);
      cnt := cnt + 1;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
  RESET ROLE;
  RAISE NOTICE 'extensions: revoked from % functions', cnt;
END $$;

-- 2) Fix any remaining SD functions in public/zapp anon can execute
DO $$
DECLARE p record; cnt int := 0;
BEGIN
  FOR p IN
    SELECT pg_proc.oid, n.nspname, pg_proc.proname,
           pg_get_function_identity_arguments(pg_proc.oid) AS args,
           pg_get_userbyid(pg_proc.proowner) AS owner
    FROM pg_proc JOIN pg_namespace n ON n.oid=pg_proc.pronamespace
    WHERE n.nspname IN ('public','zapp')
      AND pg_proc.prosecdef
      AND has_function_privilege('anon', pg_proc.oid, 'EXECUTE')
  LOOP
    BEGIN
      -- Try as the function owner first, then as postgres
      IF p.owner = 'supabase_admin' THEN
        EXECUTE format('SET LOCAL ROLE supabase_admin');
      END IF;
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
                     p.nspname, p.proname, p.args);
      EXECUTE format('GRANT  EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role',
                     p.nspname, p.proname, p.args);
      RESET ROLE;
      cnt := cnt + 1;
    EXCEPTION WHEN OTHERS THEN RESET ROLE; NULL; END;
  END LOOP;
  RAISE NOTICE 'public/zapp SD fns: revoked from % functions', cnt;
END $$;

-- 3) Prevent future SD functions from inheriting PUBLIC execute by default
--    (closes the "whack-a-mole" root cause: new functions get proacl=null => PUBLIC)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA public GRANT  EXECUTE ON FUNCTIONS TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT  EXECUTE ON FUNCTIONS TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA zapp   REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres       IN SCHEMA zapp   GRANT  EXECUTE ON FUNCTIONS TO authenticated, service_role;

-- 4) Validation assertions
DO $$
BEGIN
  -- extensions.sign must be blocked for anon
  IF has_function_privilege('anon','extensions.sign(json,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'ASSERT FAIL: anon can still forge JWTs via extensions.sign';
  END IF;
  -- extensions.pg_stat_statements must be blocked
  IF has_function_privilege('anon','extensions.pg_stat_statements(boolean)','EXECUTE') THEN
    RAISE EXCEPTION 'ASSERT FAIL: anon can still read query stats via extensions.pg_stat_statements';
  END IF;
  -- No SD functions in public/zapp anon-executable
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('public','zapp') AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL: SD functions still anon-executable in public/zapp';
  END IF;
  -- Future functions protected (at least 3 default-priv rules)
  IF (SELECT count(*) FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace
      WHERE n.nspname IN ('public','zapp') AND d.defaclobjtype='f'
        AND array_to_string(d.defaclacl,',') LIKE '%authenticated%') < 3 THEN
    RAISE EXCEPTION 'ASSERT FAIL: default privilege rules for future functions not set';
  END IF;
  RAISE NOTICE 'All extensions/SD-fn assertions PASSED';
END $$;
