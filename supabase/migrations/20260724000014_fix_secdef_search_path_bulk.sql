-- Bulk remediation: remove `public` from search_path of all SECURITY DEFINER
-- functions in the zapp and evo schemas.
--
-- Background
-- ----------
-- PostgreSQL resolves unqualified object names against schemas in search_path
-- order.  When a SECURITY DEFINER function runs, it elevates to the definer's
-- privileges.  If `public` appears early in search_path, any object created in
-- `public` with the same name as a legitimate zapp/evo object would shadow the
-- real one, allowing privilege-escalation by any user who can write to `public`.
--
-- Audit (2026-07-24) found:
--   ≈ 572 functions in `zapp` with 'public' present in search_path
--   ≈  49 functions in `evo`  with 'public' present in search_path
-- Most common pattern: search_path=public, evo, zapp, monitoring (392 functions)
--
-- All references inside these function bodies are fully-qualified (zapp.foo,
-- evo.bar, auth.uid(), etc.), so removing 'public' is a no-op for object
-- resolution but closes the shadowing attack surface.
--
-- pg_catalog is always implicitly appended by PostgreSQL regardless of
-- search_path, so gen_random_uuid(), now(), etc. continue to work without it.
--
-- The DO block handles failures per-function so one bad signature cannot abort
-- the entire remediation.

DO $$
DECLARE
  r             RECORD;
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
      p.prokind,
      n.nspname,
      pg_get_function_arguments(p.oid) AS args,
      -- Extract the search_path value (strip 'search_path=' prefix = 12 chars)
      (
        SELECT substring(t.val FROM 13)
        FROM pg_proc p2, unnest(p2.proconfig) AS t(val)
        WHERE p2.oid = p.oid AND t.val LIKE 'search_path=%'
        LIMIT 1
      ) AS oldpath
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('zapp', 'evo')
      AND p.prosecdef = true
      AND EXISTS (
        SELECT 1
        FROM unnest(p.proconfig) AS t(val)
        WHERE t.val LIKE 'search_path=%' AND t.val ~ 'public'
      )
    ORDER BY n.nspname, p.proname
  LOOP
    v_oldpath := r.oldpath;

    IF v_oldpath IS NULL THEN
      RAISE WARNING 'SKIP %.%(%) — cannot read search_path from proconfig',
        r.nspname, r.proname, LEFT(r.args, 40);
      CONTINUE;
    END IF;

    -- Split by comma, filter out 'public', deduplicate while preserving order.
    -- NOTE: do NOT remove pg_temp here — if pg_temp is absent from search_path
    -- PostgreSQL inserts it implicitly at FIRST position, which is the shadowing
    -- vector. Keep it and move it to LAST position explicitly (see below).
    v_parts    := regexp_split_to_array(v_oldpath, '\s*,\s*');
    v_newparts := ARRAY[]::TEXT[];

    FOREACH v_part IN ARRAY v_parts LOOP
      v_part := btrim(v_part);
      -- Drop public (attack vector) and blank entries
      CONTINUE WHEN v_part = '' OR v_part = 'public';
      -- Deduplicate
      CONTINUE WHEN v_part = ANY(v_newparts);
      v_newparts := array_append(v_newparts, v_part);
    END LOOP;

    -- Ensure the function's own schema (zapp or evo) is present and FIRST
    IF NOT (r.nspname = ANY(v_newparts)) THEN
      -- Missing entirely — prepend it
      v_newparts := array_prepend(r.nspname, v_newparts);
    ELSIF v_newparts[1] IS DISTINCT FROM r.nspname THEN
      -- Present but not first — move it to front
      v_newparts := array_prepend(r.nspname, array_remove(v_newparts, r.nspname));
    END IF;

    -- Safety guard: if array is still empty, use own schema
    IF array_length(v_newparts, 1) IS NULL OR array_length(v_newparts, 1) = 0 THEN
      v_newparts := ARRAY[r.nspname];
    END IF;

    -- Move pg_temp to LAST position so PostgreSQL searches it last.
    -- If pg_temp were absent entirely, PG would implicitly insert it FIRST
    -- (before all other schemas), enabling temp-table shadowing attacks.
    -- Keeping it last preserves the explicit ordering while closing that vector.
    IF 'pg_temp' = ANY(v_newparts) THEN
      v_newparts := array_append(array_remove(v_newparts, 'pg_temp'), 'pg_temp');
    END IF;

    v_newsearchpath := array_to_string(v_newparts, ', ');

    BEGIN
      -- oid::regprocedure produces schema.fn(arg_types) — correct ALTER target
      EXECUTE format(
        'ALTER %s %s SET search_path = %s',
        CASE r.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END,
        r.oid::regprocedure,
        v_newsearchpath
      );
      v_count := v_count + 1;
      RAISE NOTICE '[%] Fixed %.%(%): [%] -> [%]',
        v_count, r.nspname, r.proname, LEFT(r.args, 50), v_oldpath, v_newsearchpath;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      RAISE WARNING 'FAILED %.%(%): % (SQLSTATE: %)',
        r.nspname, r.proname, LEFT(r.args, 40), SQLERRM, SQLSTATE;
    END;
  END LOOP;

  RAISE NOTICE '=== search_path remediation complete: % fixed, % failed ===',
    v_count, v_failed;
END $$;

-- ── Post-remediation verification ────────────────────────────────────────────
-- Confirm no SECURITY DEFINER function in zapp/evo still has 'public' anywhere
-- in search_path (not just first position — public in any position is a risk).
-- Uses word-boundary regex \mpublic\M so it won't match 'public_ext' etc.
-- RAISES EXCEPTION (fails the migration) if any functions remain unfixed.
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
      SELECT 1 FROM unnest(p.proconfig) AS t(val)
      WHERE t.val LIKE 'search_path=%' AND t.val ~ '\mpublic\M'
    );

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'POST-CHECK FAILED: % SECURITY DEFINER function(s) in zapp/evo still have public in search_path — remediation incomplete',
      v_remaining
      USING ERRCODE = 'P0001';
  ELSE
    RAISE NOTICE 'POST-CHECK OK: 0 SECURITY DEFINER functions in zapp/evo have public in search_path';
  END IF;
END $$;
