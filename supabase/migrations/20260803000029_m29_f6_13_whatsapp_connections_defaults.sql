-- M29: F6-13 — CRÍTICO (P0): api_url e api_key são NOT NULL sem defaults
-- Branch: claude/plan-implementation-review-bq8j14
-- Date: 2026-08-03
--
-- Problem: zapp.whatsapp_connections has api_url NOT NULL and api_key NOT NULL
--   with no column defaults. handleAddConnection() inserts only 7 columns
--   (instance_name, display_name, status, etc.) and omits both fields → INSERT
--   fails immediately with a NOT NULL violation before the Evolution API is
--   even called to generate the instance hash (api_key).
--
-- Fix:
--   1. BEFORE INSERT trigger auto-populates api_url from vault.decrypted_secrets
--      (name = 'evolution_api_url'). Named trg_a_* so it fires alphabetically
--      BEFORE the existing trg_validate_whatsapp_connection_url trigger.
--   2. ALTER api_key to DROP NOT NULL — the value is returned by Evolution API
--      createInstance() and written in a subsequent UPDATE (2-step flow).
--      A CHECK constraint ensures api_key is non-empty once set.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_a_wconn_auto_populate ON zapp.whatsapp_connections;
--   DROP FUNCTION IF EXISTS zapp.fn_whatsapp_connections_auto_populate();
--   ALTER TABLE zapp.whatsapp_connections ALTER COLUMN api_key SET NOT NULL;
--   ALTER TABLE zapp.whatsapp_connections DROP CONSTRAINT IF EXISTS chk_wconn_api_key_nonempty;

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — Trigger function: auto-populate api_url from vault
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
  -- Auto-populate api_url only when not explicitly provided by caller.
  -- Exempt 'official' api_type (WhatsApp Cloud API / Meta Business API) — those
  -- connections authenticate via Meta's infrastructure, not via an Evolution API URL,
  -- so the evolution_api_url vault secret is irrelevant and must not block the INSERT.
  IF (NEW.api_url IS NULL OR NEW.api_url = '') AND NEW.api_type IS DISTINCT FROM 'official' THEN
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
        'Configure the secret before creating connections. (For official/Cloud API connections, '
        'pass api_type = ''official'' to bypass this check.)'
        USING ERRCODE = 'P0001';
    END IF;

    NEW.api_url := v_vault_url;
  ELSIF (NEW.api_url IS NULL OR NEW.api_url = '') AND NEW.api_type = 'official' THEN
    -- Cloud API (Meta Business API / WhatsApp Official) connections use the Meta Graph API,
    -- not an Evolution API URL. Store the actual Meta Cloud API base URL so that any
    -- non-filtered code path building a URL from api_url produces a valid HTTPS address
    -- instead of the nonsensical scheme 'https://official/…'.
    NEW.api_url := 'https://graph.facebook.com/v21.0';
  END IF;

  -- api_key intentionally left NULL here — populated after Evolution
  -- API createInstance() returns the instance hash (2-step flow).
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION zapp.fn_whatsapp_connections_auto_populate()
  IS 'BEFORE INSERT trigger: auto-populates api_url from vault.decrypted_secrets '
     'when the caller omits it. Fails fast if vault secret is missing (fail-secure). '
     'api_key is left NULL; populated in step-2 UPDATE after createInstance().';

REVOKE EXECUTE ON FUNCTION zapp.fn_whatsapp_connections_auto_populate() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_whatsapp_connections_auto_populate() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Create the BEFORE INSERT trigger
-- Named trg_a_* so it fires alphabetically BEFORE the existing
-- trg_validate_whatsapp_connection_url (trg_v_*) — api_url is populated
-- before the URL validator runs.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_a_wconn_auto_populate ON zapp.whatsapp_connections;

CREATE TRIGGER trg_a_wconn_auto_populate
  BEFORE INSERT ON zapp.whatsapp_connections
  FOR EACH ROW
  EXECUTE FUNCTION zapp.fn_whatsapp_connections_auto_populate();

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — Make api_key nullable (2-step creation flow)
-- The Evolution API createInstance() returns the instance hash (api_key)
-- which the client then writes via a subsequent UPDATE. The INSERT itself
-- must succeed without api_key.
--
-- Add a CHECK constraint so once api_key IS set it cannot be the empty string.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE zapp.whatsapp_connections
  ALTER COLUMN api_key DROP NOT NULL;

ALTER TABLE zapp.whatsapp_connections
  DROP CONSTRAINT IF EXISTS chk_wconn_api_key_nonempty;

ALTER TABLE zapp.whatsapp_connections
  ADD CONSTRAINT chk_wconn_api_key_nonempty
    CHECK (api_key IS NULL OR api_key <> '');

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_trig_count  INTEGER;
  v_fn_exists   BOOLEAN;
  v_api_key_nullable BOOLEAN;
  v_ck_exists   BOOLEAN;
  v_ok          BOOLEAN := TRUE;
  v_report      TEXT    := '';
BEGIN
  -- Trigger exists
  SELECT COUNT(*) INTO v_trig_count
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class   c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'zapp'
     AND c.relname = 'whatsapp_connections'
     AND t.tgname  = 'trg_a_wconn_auto_populate'
     AND NOT t.tgisinternal;

  IF v_trig_count > 0 THEN
    v_report := v_report || E'\n  [OK]   F6-13 TRIGGER: trg_a_wconn_auto_populate exists ✓';
  ELSE
    v_report := v_report || E'\n  [FAIL] F6-13 TRIGGER: trg_a_wconn_auto_populate NOT found';
    v_ok := FALSE;
  END IF;

  -- Trigger function exists and is SECURITY DEFINER
  SELECT prosecdef INTO v_fn_exists
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp'
     AND p.proname = 'fn_whatsapp_connections_auto_populate'
   LIMIT 1;

  IF v_fn_exists IS TRUE THEN
    v_report := v_report || E'\n  [OK]   F6-13 FUNCTION: SECURITY DEFINER ✓';
  ELSIF v_fn_exists IS FALSE THEN
    v_report := v_report || E'\n  [FAIL] F6-13 FUNCTION: exists but NOT SECURITY DEFINER';
    v_ok := FALSE;
  ELSE
    v_report := v_report || E'\n  [FAIL] F6-13 FUNCTION: fn_whatsapp_connections_auto_populate not found';
    v_ok := FALSE;
  END IF;

  -- api_key is now nullable
  SELECT NOT a.attnotnull INTO v_api_key_nullable
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class     c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'zapp'
     AND c.relname = 'whatsapp_connections'
     AND a.attname = 'api_key'
     AND a.attnum  > 0
     AND NOT a.attisdropped;

  IF v_api_key_nullable IS TRUE THEN
    v_report := v_report || E'\n  [OK]   F6-13 api_key: nullable ✓';
  ELSE
    v_report := v_report || E'\n  [FAIL] F6-13 api_key: still NOT NULL';
    v_ok := FALSE;
  END IF;

  -- CHECK constraint exists
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint c
    JOIN pg_catalog.pg_class      t ON t.oid = c.conrelid
    JOIN pg_catalog.pg_namespace  n ON n.oid = t.relnamespace
   WHERE n.nspname = 'zapp'
     AND t.relname = 'whatsapp_connections'
     AND c.contype = 'c'
     AND c.conname = 'chk_wconn_api_key_nonempty'
  ) INTO v_ck_exists;

  IF v_ck_exists THEN
    v_report := v_report || E'\n  [OK]   F6-13 CHECK: chk_wconn_api_key_nonempty exists ✓';
  ELSE
    v_report := v_report || E'\n  [FAIL] F6-13 CHECK: chk_wconn_api_key_nonempty NOT found';
    v_ok := FALSE;
  END IF;

  RAISE NOTICE E'M29 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M29 verification FAILED — see notices above';
  END IF;
END;
$$;

COMMIT;
