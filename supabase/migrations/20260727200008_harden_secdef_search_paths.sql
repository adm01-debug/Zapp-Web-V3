-- Migration: harden_secdef_search_paths
-- Ensures all SECURITY DEFINER functions in app schemas have an explicit
-- search_path. Functions without it are vulnerable to search_path hijacking.

DO $do$
DECLARE r RECORD;
DECLARE v_fixed INT := 0;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema, p.proname AS fn, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('zapp','evo','public','artes','financeiro')
      AND p.prosecdef = TRUE
      AND (
        p.proconfig IS NULL OR
        NOT array_to_string(p.proconfig,',') ILIKE '%search_path%'
      )
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION %I.%I(%s) SET search_path = %L, ''pg_catalog''',
        r.schema, r.fn, r.args, r.schema
      );
      v_fixed := v_fixed + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not patch %.%(%): %', r.schema, r.fn, r.args, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Hardened search_path on % SECURITY DEFINER functions', v_fixed;
END;
$do$;
