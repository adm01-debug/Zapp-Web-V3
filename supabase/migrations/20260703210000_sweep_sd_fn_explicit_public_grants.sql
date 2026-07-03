-- =============================================================================
-- Comprehensive sweep: revoke PUBLIC from SD functions with explicit =X/postgres grant
-- Applied to production 2026-07-03. Idempotent.
-- =============================================================================
-- Problem: ALTER DEFAULT PRIVILEGES only protects NEW functions. Functions that
-- existed before the change (or were CREATE OR REPLACE'd) keep their explicit
-- proacl='{=X/postgres,...}' PUBLIC grant. Our prior loops only caught functions
-- where has_function_privilege('anon',...) was true at the time of execution.
-- New functions (fn_outbound_dispatch, fn_outbound_dispatch_apply,
-- rpc_integration_health) were discovered with PUBLIC execute grants.
--
-- fn_outbound_dispatch and fn_outbound_dispatch_apply are particularly sensitive:
-- they have 'net' in their search_path (set search_path TO 'public','zapp','net')
-- meaning they can call net.http_* functions. If callable by anon, this would
-- re-open the SSRF vector we closed in PR #131.
--
-- This migration does a COMPLETE SWEEP: revokes PUBLIC from ALL SD functions in
-- public/zapp that have any explicit PUBLIC (grantee=0) in their proacl.
-- Does not rely on has_function_privilege (which is point-in-time and can miss
-- functions created after the check). Instead queries pg_proc.proacl directly.
-- =============================================================================

DO $$
DECLARE p record; cnt int := 0;
BEGIN
  FOR p IN
    SELECT pg_proc.oid, n.nspname, pg_proc.proname,
           pg_get_function_identity_arguments(pg_proc.oid) AS args,
           pg_get_userbyid(pg_proc.proowner) AS owner_name
    FROM pg_proc JOIN pg_namespace n ON n.oid=pg_proc.pronamespace
    WHERE n.nspname IN ('public','zapp')
      AND pg_proc.prosecdef
      AND EXISTS (
        SELECT 1 FROM aclexplode(coalesce(pg_proc.proacl,'{}')) a
        WHERE a.grantee=0  -- PUBLIC
      )
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC',
                     p.nspname, p.proname, p.args);
      cnt := cnt + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Try as supabase_admin for functions owned by that role
      BEGIN
        SET LOCAL ROLE supabase_admin;
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC',
                       p.nspname, p.proname, p.args);
        RESET ROLE;
        cnt := cnt + 1;
      EXCEPTION WHEN OTHERS THEN RESET ROLE; NULL; END;
    END;
  END LOOP;
  RAISE NOTICE 'Explicit PUBLIC grants removed from % SD functions', cnt;
END $$;

-- Validation: zero SD functions in public/zapp with PUBLIC in proacl
DO $$
DECLARE cnt int;
BEGIN
  SELECT count(*) INTO cnt
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','zapp') AND p.prosecdef
    AND EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,'{}')) a WHERE a.grantee=0);
  IF cnt > 0 THEN
    RAISE EXCEPTION 'ASSERT FAIL: % SD functions still have explicit PUBLIC grant', cnt;
  END IF;

  -- Also: zero anon-executable SD functions
  SELECT count(*) INTO cnt
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','zapp') AND p.prosecdef
    AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF cnt > 0 THEN
    RAISE EXCEPTION 'ASSERT FAIL: % SD functions still anon-executable', cnt;
  END IF;

  RAISE NOTICE 'Explicit PUBLIC grant sweep assertions PASSED';
END $$;
