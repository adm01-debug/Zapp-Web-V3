-- M30: F6-16 — created_by = NULL em todos os 3 registros de whatsapp_connections
-- Branch: claude/plan-implementation-review-bq8j14
-- Date: 2026-08-03
--
-- Problem: All 3 rows in zapp.whatsapp_connections have created_by = NULL.
--   RLS policy wconn_insert_auth has a clause `WITH CHECK (created_by IS NULL OR ...)`
--   that was added to work around this, but that clause is a security hole (M31 fixes it).
--   This migration first backfills created_by on existing rows, then extends the BEFORE
--   INSERT trigger (already created in M29) to also auto-set created_by = auth.uid() when
--   the caller omits it — so future INSERTs never produce NULL created_by.
--
-- Approach:
--   1. Backfill existing NULL rows with the oldest profile's user_id (the original admin).
--      profiles.user_id stores the auth.users UUID (bridge column).
--   2. Extend fn_whatsapp_connections_auto_populate (created in M29) to also set
--      NEW.created_by when it is NULL. SECURITY DEFINER is already set.
--
-- Rollback:
--   UPDATE zapp.whatsapp_connections SET created_by = NULL WHERE true; -- revert backfill
--   -- Revert trigger function to M29 version (without created_by logic) if needed.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — Backfill created_by = NULL rows
-- Use the earliest profile in the system as the canonical "system owner" for
-- existing rows that were inserted without auth context.
-- profiles.user_id = auth.users UUID (the bridge between zapp.profiles and auth.users).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_owner_uid UUID;
  v_updated   INTEGER;
BEGIN
  SELECT user_id
    INTO v_owner_uid
    FROM zapp.profiles
   WHERE user_id IS NOT NULL
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_owner_uid IS NULL THEN
    RAISE NOTICE 'M30 SKIP backfill: no profiles with user_id found — created_by remains NULL';
    RETURN;
  END IF;

  UPDATE zapp.whatsapp_connections
     SET created_by = v_owner_uid
   WHERE created_by IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE 'M30 Backfill: set created_by = % on % rows', v_owner_uid, v_updated;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Extend the BEFORE INSERT trigger function to auto-set created_by
-- CREATE OR REPLACE retains the existing trigger binding from M29.
-- The function now handles both api_url (from vault) and created_by (from auth.uid()).
-- service_role / cron callers may not have auth.uid(); we allow NULL in those cases
-- (NOT NULL on created_by is intentionally not added here — see NOTE below).
--
-- NOTE: We do NOT add NOT NULL to created_by because:
--   (a) service_role edge functions may legitimately INSERT without an auth context;
--   (b) The original schema design left it nullable;
--   (c) M31 (RLS fix) will tighten the policy so only auth sessions with uid() can INSERT.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_whatsapp_connections_auto_populate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'zapp', 'vault', 'public'
AS $fn$
DECLARE
  v_vault_url TEXT;
BEGIN
  -- ── api_url: auto-populate from vault when not provided ──────────────────
  IF NEW.api_url IS NULL OR NEW.api_url = '' THEN
    BEGIN
      SELECT decrypted_secret
        INTO v_vault_url
        FROM vault.decrypted_secrets
       WHERE name = 'evolution_api_url'
       LIMIT 1;
    EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
      v_vault_url := NULL;
    END;

    IF v_vault_url IS NULL OR v_vault_url = '' THEN
      RAISE EXCEPTION
        'whatsapp_connections: api_url not provided and vault secret ''evolution_api_url'' is not set. '
        'Configure the secret before creating connections.'
        USING ERRCODE = 'P0001';
    END IF;

    NEW.api_url := v_vault_url;
  END IF;

  -- ── created_by: auto-set from auth.uid() when caller omits it ─────────────
  -- auth.uid() returns NULL for service_role / cron callers — acceptable;
  -- authenticated UI sessions always have a valid uid().
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  -- api_key intentionally left NULL here — populated after Evolution
  -- API createInstance() returns the instance hash (2-step flow).
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION zapp.fn_whatsapp_connections_auto_populate()
  IS 'BEFORE INSERT trigger (M29+M30): auto-populates api_url from vault.decrypted_secrets '
     'and created_by from auth.uid() when callers omit them. Fails fast if vault secret is '
     'missing (fail-secure). api_key is left NULL; populated in step-2 UPDATE after createInstance().';

-- REVOKE/GRANT unchanged from M29 (service_role only)
REVOKE EXECUTE ON FUNCTION zapp.fn_whatsapp_connections_auto_populate() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_whatsapp_connections_auto_populate() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_null_count  INTEGER;
  v_fn_secdef   BOOLEAN;
  v_ok          BOOLEAN := TRUE;
  v_report      TEXT    := '';
BEGIN
  -- Backfill: no NULL created_by rows should remain (unless there were no profiles)
  SELECT COUNT(*) INTO v_null_count
    FROM zapp.whatsapp_connections
   WHERE created_by IS NULL;

  IF v_null_count = 0 THEN
    v_report := v_report || E'\n  [OK]   F6-16 BACKFILL: created_by = NULL count = 0 ✓';
  ELSE
    v_report := v_report || E'\n  [WARN] F6-16 BACKFILL: ' || v_null_count || ' rows still have created_by = NULL (no profiles found — acceptable for empty DB)';
    -- Not a hard failure; an empty profile table is a valid test scenario.
  END IF;

  -- Trigger function is still SECURITY DEFINER after CREATE OR REPLACE
  SELECT prosecdef INTO v_fn_secdef
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp'
     AND p.proname = 'fn_whatsapp_connections_auto_populate'
   LIMIT 1;

  IF v_fn_secdef IS TRUE THEN
    v_report := v_report || E'\n  [OK]   F6-16 FUNCTION: SECURITY DEFINER ✓';
  ELSIF v_fn_secdef IS FALSE THEN
    v_report := v_report || E'\n  [FAIL] F6-16 FUNCTION: exists but NOT SECURITY DEFINER';
    v_ok := FALSE;
  ELSE
    v_report := v_report || E'\n  [FAIL] F6-16 FUNCTION: fn_whatsapp_connections_auto_populate not found';
    v_ok := FALSE;
  END IF;

  RAISE NOTICE E'M30 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M30 verification FAILED — see notices above';
  END IF;
END;
$$;

COMMIT;
