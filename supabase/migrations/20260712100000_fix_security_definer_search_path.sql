-- Fix SECURITY DEFINER functions missing SET search_path in public schema.
--
-- Root cause: functions created before the search_path hardening policy was
-- adopted omit the SET search_path clause, making them vulnerable to
-- search_path injection if a malicious schema is prepended to the session
-- search_path before the function runs.
--
-- Strategy: iterate pg_proc for all public SECURITY DEFINER functions that
-- have no search_path in their proconfig and ALTER each one.
--
-- NOTE: This is a ONE-SHOT migration, not self-maintaining.  Functions added
-- after this migration runs are NOT automatically protected; they must
-- explicitly include SET search_path in their CREATE OR REPLACE statement.
-- The CI gate (scripts/check-security-definer.mjs) enforces this going forward.
DO $$
DECLARE
  r RECORD;
  fn_sig text;
BEGIN
  FOR r IN
    SELECT p.oid,
           pg_get_function_identity_arguments(p.oid) AS args,
           p.proname
    FROM   pg_proc p
    JOIN   pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
      AND  p.prosecdef = true
      AND  (
             p.proconfig IS NULL
             OR NOT EXISTS (
               SELECT 1
               FROM   unnest(p.proconfig) AS cfg
               WHERE  cfg LIKE 'search_path%'
             )
           )
  LOOP
    fn_sig := format(
      'public.%I(%s)',
      r.proname,
      r.args
    );
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION %s SET search_path = pg_catalog, public, pg_temp',
        fn_sig
      );
      RAISE NOTICE 'Fixed search_path on %', fn_sig;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Could not fix search_path on %: %', fn_sig, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- Verify: the following query should return 0 after this migration runs.
-- SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.prosecdef = true
-- AND (p.proconfig IS NULL OR NOT EXISTS (
--   SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path%'));
