-- =============================================================================
-- CRITICAL: Block SSRF / data exfiltration via pg_net (net schema)
-- Applied to production 2026-07-03. Idempotent.
-- =============================================================================
-- Finding (empirically confirmed via role-simulation testing):
--   net.http_get() and net.http_post() were callable by anon AND authenticated.
--   net.worker_restart() was callable by anon (DoS vector).
--   Confirmed live exploitation:
--     [anon] net.http_get('http://169.254.169.254/') => request_id=26 (SSRF AWS metadata)
--     [anon] net.http_get('https://ifconfig.me')     => request_id=27 (external exfil)
--     [anon] net.worker_restart()                    => EXECUTED (pg_net worker DoS)
--   The 2 SSRF/exfil requests were immediately cancelled (DELETE FROM net.http_request_queue).
--
--   Root cause: net.http_get and net.http_post had EXPLICIT individual grants to
--   anon and authenticated (anon=X/supabase_admin) in addition to the PUBLIC grant.
--   A prior REVOKE FROM PUBLIC left the individual grants intact. This migration
--   revokes both PUBLIC and the individual grants.
--
--   Safety: service_role and postgres retain EXECUTE (used by Supabase edge function
--   triggers and the supabase_functions.http_request trigger). The app should
--   never make outbound HTTP calls directly from anon/authenticated context.
-- =============================================================================

-- Revoke net.* from PUBLIC (removes any future PUBLIC grant)
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT pg_proc.oid, pg_proc.proname,
           pg_get_function_identity_arguments(pg_proc.oid) AS args
    FROM pg_proc JOIN pg_namespace n ON n.oid=pg_proc.pronamespace
    WHERE n.nspname='net'
      AND (has_function_privilege('anon', pg_proc.oid, 'EXECUTE')
        OR has_function_privilege('authenticated', pg_proc.oid, 'EXECUTE'))
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION net.%I(%s) FROM PUBLIC, anon, authenticated',
                   p.proname, p.args);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION net.%I(%s) TO service_role, postgres',
                   p.proname, p.args);
  END LOOP;
END $$;

-- Belt-and-suspenders: explicit revoke on functions that had individual grants
-- Guard: functions may not exist in CI (vanilla postgres without pg_net)
DO $$
DECLARE fn_sig text;
BEGIN
  FOR fn_sig IN
    SELECT pg_get_function_identity_arguments(p.oid)
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='net' AND p.proname IN ('http_get','http_post')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION net.%I FROM anon, authenticated', fn_sig);
  END LOOP;
END $$;

-- Also block supabase_functions.http_request from anon (edge fn trigger surface)
DO $$
BEGIN
  IF has_function_privilege('anon', 'supabase_functions.http_request()', 'EXECUTE') THEN
    REVOKE EXECUTE ON FUNCTION supabase_functions.http_request() FROM PUBLIC, anon, authenticated;
    GRANT  EXECUTE ON FUNCTION supabase_functions.http_request() TO service_role, postgres;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SKIP supabase_functions.http_request revoke: %', SQLERRM;
END $$;

-- Validation — skip assertions for functions that don't exist in this environment
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='net' AND p.proname='http_get') THEN
    IF has_function_privilege('anon','net.http_get(text,jsonb,jsonb,integer)','EXECUTE') THEN
      RAISE EXCEPTION 'ASSERT FAIL: anon can still execute net.http_get';
    END IF;
    IF NOT has_function_privilege('service_role','net.http_get(text,jsonb,jsonb,integer)','EXECUTE') THEN
      RAISE EXCEPTION 'ASSERT FAIL: service_role lost net.http_get (edge fn broken)';
    END IF;
  ELSE
    RAISE NOTICE 'net.http_get not present in this environment — skipping assertion';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='net' AND p.proname='http_post') THEN
    IF has_function_privilege('authenticated','net.http_post(text,jsonb,jsonb,jsonb,integer)','EXECUTE') THEN
      RAISE EXCEPTION 'ASSERT FAIL: authenticated can still execute net.http_post';
    END IF;
  END IF;
  RAISE NOTICE 'net SSRF fix assertions PASSED';
END $$;
