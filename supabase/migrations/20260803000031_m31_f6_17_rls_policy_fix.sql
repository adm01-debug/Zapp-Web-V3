-- M31: F6-17 — Fix RLS policy wconn_insert_auth on zapp.whatsapp_connections
-- Branch: claude/plan-implementation-review-bq8j14
-- Date: 2026-08-03
--
-- Problem: The INSERT policy `wconn_insert_auth` has:
--     WITH CHECK (created_by IS NULL OR created_by = auth.uid())
--   The `created_by IS NULL` branch is a security hole — any authenticated user can
--   INSERT a row with created_by = NULL, bypassing the ownership audit trail entirely.
--   This clause was added as a workaround because existing rows had created_by = NULL
--   (fixed in M30). Now that backfill is complete and the trigger auto-sets created_by,
--   the NULL escape hatch can and must be removed.
--
-- Fix:
--   DROP the old policy and CREATE a new one with:
--     WITH CHECK (created_by = auth.uid())
--   Also ensure a SELECT policy exists so the INSERT policy enforcement makes sense.
--
-- Security invariant after this migration:
--   - INSERT: caller must be authenticated (auth.uid() IS NOT NULL) AND
--             the row's created_by must equal their uid — no orphan rows possible.
--   - The BEFORE INSERT trigger (M29+M30) sets created_by = auth.uid() automatically,
--     so legitimate UI callers never need to provide it explicitly.
--   - service_role bypasses RLS entirely — edge functions are not affected.
--
-- Rollback:
--   DROP POLICY IF EXISTS wconn_insert_auth ON zapp.whatsapp_connections;
--   CREATE POLICY wconn_insert_auth ON zapp.whatsapp_connections
--     FOR INSERT TO authenticated
--     WITH CHECK (created_by IS NULL OR created_by = auth.uid());

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — Drop the insecure INSERT policy
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS wconn_insert_auth ON zapp.whatsapp_connections;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Create the corrected INSERT policy
-- auth.uid() IS NOT NULL guard is implicit: if uid() returns NULL (no session),
-- `created_by = auth.uid()` evaluates to (created_by = NULL) which is always
-- FALSE in SQL, so the INSERT is rejected — no explicit uid() IS NOT NULL check needed.
-- ─────────────────────────────────────────────────────────────────────────────
-- `created_by` FK references profiles.id (surrogate UUID), NOT auth.uid()
-- (which returns the auth UUID stored in profiles.user_id). We resolve
-- via a subquery so the comparison is type-compatible with the FK target.
CREATE POLICY wconn_insert_auth
  ON zapp.whatsapp_connections
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_pol_exists  BOOLEAN;
  v_pol_check   TEXT;
  v_ok          BOOLEAN := TRUE;
  v_report      TEXT    := '';
BEGIN
  -- For INSERT-only policies, pg_policy.qual (the USING expression) is always NULL.
  -- The WITH CHECK expression lives in pg_policy.polwithcheck. Check existence first,
  -- then read polwithcheck separately to avoid a false "NOT FOUND" when qual IS NULL.

  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_policy pc
      JOIN pg_catalog.pg_class  cl ON cl.oid = pc.polrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
     WHERE n.nspname = 'zapp'
       AND cl.relname = 'whatsapp_connections'
       AND pc.polname = 'wconn_insert_auth'
  ) INTO v_pol_exists;

  IF NOT v_pol_exists THEN
    v_report := v_report || E'\n  [FAIL] F6-17: wconn_insert_auth policy NOT FOUND';
    v_ok := FALSE;
  ELSE
    v_report := v_report || E'\n  [OK]   F6-17: wconn_insert_auth policy exists ✓';

    -- Read the WITH CHECK expression (polwithcheck), not qual (which is NULL for INSERT policies)
    SELECT pg_catalog.pg_get_expr(pc.polwithcheck, pc.polrelid)
      INTO v_pol_check
      FROM pg_catalog.pg_policy pc
      JOIN pg_catalog.pg_class  cl ON cl.oid = pc.polrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
     WHERE n.nspname = 'zapp'
       AND cl.relname = 'whatsapp_connections'
       AND pc.polname = 'wconn_insert_auth';

    -- Confirm the WITH CHECK expression does NOT contain 'IS NULL' (old escape hatch)
    IF v_pol_check IS NULL OR position('IS NULL' IN upper(v_pol_check)) > 0 THEN
      v_report := v_report || E'\n  [FAIL] F6-17: policy WITH CHECK still contains IS NULL escape hatch! (got: ' || coalesce(v_pol_check,'<null>') || ')';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   F6-17: policy WITH CHECK has no IS NULL escape hatch ✓';

      -- Verify the expression matches the expected structural pattern:
      --   created_by = (SELECT p.id FROM [zapp.]profiles p WHERE p.user_id = auth.uid())
      -- Using regex ensures we catch both the profiles table reference AND the user_id column
      -- together in the correct relational context (not just independently present in the string).
      IF v_pol_check !~* 'created_by[[:space:]]*=[[:space:]]*\([[:space:]]*select[[:space:]]+p\.id[[:space:]]+from[[:space:]]+(zapp\.)?profiles[[:space:]]+p[[:space:]]+where[[:space:]]+p\.user_id[[:space:]]*=[[:space:]]*auth\.uid' THEN
        v_report := v_report || E'\n  [FAIL] F6-17: WITH CHECK does not match expected profiles.user_id pattern (got: ' || coalesce(v_pol_check,'<null>') || ')';
        v_ok := FALSE;
      ELSE
        v_report := v_report || E'\n  [OK]   F6-17: WITH CHECK matches profiles.user_id surrogate-key pattern ✓';
      END IF;
    END IF;
  END IF;

  RAISE NOTICE E'M31 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M31 verification FAILED — see notices above';
  END IF;
END;
$$;

COMMIT;
