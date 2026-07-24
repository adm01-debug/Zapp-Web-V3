-- Bulk remediation: remove `public` from search_path of all SECURITY DEFINER
-- functions in the zapp and evo schemas.
--
-- Background
-- ----------
-- PostgreSQL resolves unqualified object names against schemas in search_path
-- order.  When a SECURITY DEFINER function runs, it runs with the *definer's*
-- privileges.  If `public` appears early in search_path, any object created in
-- `public` with the same name as a legitimate zapp/evo object would be found
-- first, allowing a privilege-escalation by any user who can write to `public`.
--
-- This was audited on 2026-07-24 and found to affect:
--   ≈ 572 functions in `zapp` (most with pattern: public, evo, zapp, monitoring)
--   ≈  49 functions in `evo`
--
-- All references inside these function bodies are fully-qualified (e.g.
-- zapp.foo, evo.bar, auth.uid()), so removing `public` is a no-op for object
-- resolution but closes the attack surface.
--
-- Algorithm
-- ---------
-- For each affected SECURITY DEFINER function in zapp/evo:
--   1. Parse the current search_path from pg_proc.proconfig
--   2. Split by comma, trim, remove 'public' and 'pg_temp' elements, deduplicate
--   3. Ensure the function's own schema (zapp or evo) is the first element
--   4. ALTER FUNCTION ... SET search_path = <new_path>
--
-- pg_catalog is always implicitly appended by PostgreSQL regardless of
-- search_path, so gen_random_uuid(), now(), etc. continue to work.
--
-- Failures for individual functions are logged as WARNINGs (not exceptions) so
-- that one bad function signature cannot abort the entire remediation.

DO $$
DECLARE
  r             RECORD;
  v_sp_config   TEXT;
  v_oldpath     TEXT;
  v_parts       TEXT[];
  v_newparts    TEXT[];
  v_part        TEXT;
  v_newsearchpath TEXT;
  v_count       INTEGER := 0;
  v_failed      INTEGER := 0;
BEGIN
  FOR r IN
    SELECT
      p.oid,
      p.proname,
      n.nspname,
      pg_get_function_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('zapp', 'evo')
      AND p.prosecdef = true
      AND EXISTS (
        SELECT 1 FROM unnest(p.proconfig) kv(val)
        WHERE kv.val LIKE 'search_path=%'
          AND kv.val ~ 'public'
      )
    ORDER BY n.nspname, p.proname
  LOOP
    -- Extract search_path value from proconfig
    SELECT val INTO v_sp_config
    FROM unnest(r.oid::pg_catalog.regproc::pg_catalog.oid::pg_proc.proconfig) kv(val)
    WHERE kv.val LIKE 'search_path=%'
    LIMIT 1;

    -- Fallback: query pg_proc directly by oid
    IF v_sp_config IS NULL THEN
      SELECT val INTO v_sp_config
      FROM (
        SELECT unnest(proconfig) AS val FROM pg_proc WHERE oid = r.oid
      ) t WHERE val LIKE 'search_path=%' LIMIT 1;
    END IF;

    IF v_sp_config IS NULL THEN
      RAISE WARNING 'SKIP %.%(%s): could not read proconfig', r.nspname, r.proname, LEFT(r.args,40);
      CONTINUE;
    END IF;

    -- Strip 'search_path=' prefix (12 chars)
    v_oldpath := substring(v_sp_config FROM 13);

    -- Split, filter out public and pg_temp, deduplicate
    v_parts   := regexp_split_to_array(v_oldpath, '\s*,\s*');
    v_newparts := ARRAY[]::TEXT[];

    FOREACH v_part IN ARRAY v_parts LOOP
      v_part := btrim(v_part);
      -- Skip public, pg_temp (always implicit), and empty strings
      CONTINUE WHEN v_part = '' OR v_part = 'public' OR v_part = 'pg_temp';
      -- Deduplicate
      CONTINUE WHEN v_part = ANY(v_newparts);
      v_newparts := array_append(v_newparts, v_part);
    END LOOP;

    -- Ensure function's own schema is present and first
    IF NOT (r.nspname = ANY(v_newparts)) THEN
      -- Schema missing entirely — prepend it
      v_newparts := array_prepend(r.nspname, v_newparts);
    ELSIF v_newparts[1] IS DISTINCT FROM r.nspname THEN
      -- Schema present but not first — move it to front
      v_newparts := array_prepend(r.nspname, array_remove(v_newparts, r.nspname));
    END IF;

    -- Safety: if array ended up empty somehow, use own schema
    IF array_length(v_newparts, 1) IS NULL OR array_length(v_newparts, 1) = 0 THEN
      v_newparts := ARRAY[r.nspname];
    END IF;

    v_newsearchpath := array_to_string(v_newparts, ', ');

    BEGIN
      -- Use OID-based regprocedure for accurate function signature
      EXECUTE format(
        'ALTER FUNCTION %s SET search_path = %s',
        r.oid::regprocedure,
        v_newsearchpath
      );
      v_count := v_count + 1;
      RAISE NOTICE 'Fixed [%] %.%(%) : [%] -> [%]',
        v_count, r.nspname, r.proname, LEFT(r.args, 50), v_oldpath, v_newsearchpath;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      RAISE WARNING 'FAILED %.%(%): % (SQLSTATE: %)',
        r.nspname, r.proname, LEFT(r.args, 40), SQLERRM, SQLSTATE;
    END;
  END LOOP;

  RAISE NOTICE '=== search_path remediation complete: % fixed, % failed ===', v_count, v_failed;
END $$;

-- ── Post-remediation verification ────────────────────────────────────────────
-- Confirm that no SECURITY DEFINER function in zapp/evo still has public first.
DO $$
DECLARE
  v_remaining INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_remaining
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('zapp', 'evo')
    AND p.prosecdef = true
    AND EXISTS (
      SELECT 1 FROM unnest(p.proconfig) kv(val)
      WHERE kv.val LIKE 'search_path=%'
        AND kv.val ~ '^search_path=public'   -- public still first
    );

  IF v_remaining > 0 THEN
    RAISE WARNING 'POST-CHECK: % SECURITY DEFINER function(s) still have public first in search_path', v_remaining;
  ELSE
    RAISE NOTICE 'POST-CHECK OK: no SECURITY DEFINER functions in zapp/evo have public first in search_path';
  END IF;
END $$;
