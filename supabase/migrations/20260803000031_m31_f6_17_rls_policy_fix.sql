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
CREATE POLICY wconn_insert_auth
  ON zapp.whatsapp_connections
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_pol_qual   TEXT;
  v_ok         BOOLEAN := TRUE;
  v_report     TEXT    := '';
BEGIN
  -- Policy must exist with the new definition (no IS NULL clause)
  SELECT pc.qual
    INTO v_pol_qual
    FROM pg_catalog.pg_policy pc
    JOIN pg_catalog.pg_class  cl ON cl.oid = pc.polrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = cl.relnamespace
   WHERE n.nspname = 'zapp'
     AND cl.relname = 'whatsapp_connections'
     AND pc.polname = 'wconn_insert_auth';

  IF v_pol_qual IS NULL THEN
    v_report := v_report || E'\n  [FAIL] F6-17: wconn_insert_auth policy NOT FOUND';
    v_ok := FALSE;
  ELSE
    v_report := v_report || E'\n  [OK]   F6-17: wconn_insert_auth policy exists ✓';

    -- Confirm the policy qual does NOT contain 'IS NULL' (the old escape hatch)
    IF position('IS NULL' IN upper(v_pol_qual)) > 0 THEN
      v_report := v_report || E'\n  [FAIL] F6-17: policy qual still contains IS NULL escape hatch!';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   F6-17: policy qual has no IS NULL escape hatch ✓';
    END IF;
  END IF;

  RAISE NOTICE E'M31 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M31 verification FAILED — see notices above';
  END IF;
END;
$$;

COMMIT;
