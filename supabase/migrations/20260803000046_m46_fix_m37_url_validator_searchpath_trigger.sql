-- M46: Fix fn_validate_whatsapp_connection_url — search_path + trigger column
-- Branch: claude/plan-implementation-review-bq8j14
-- Date: 2026-08-03
--
-- Problems:
--
--   P1 — search_path includes 'public' (hardening violation):
--     M37 set:
--       SET search_path TO 'pg_catalog', 'zapp', 'vault', 'public'
--     Project rule: SECURITY DEFINER functions must NOT include 'public' in
--     search_path. 'public' allows an attacker to create shadow objects
--     (e.g. decrypted_secrets view in public) that intercept vault reads.
--     The function needs only 'pg_catalog', 'zapp', 'vault'.
--
--   P2 — trigger fires on wrong column (trg_validate_whatsapp_connection_url):
--     M26 STEP 6 created the trigger with:
--       BEFORE INSERT OR UPDATE OF server_url ON zapp.whatsapp_connections
--     But the validator checks NEW.api_url (not server_url). In PostgreSQL,
--     UPDATE OF col_list only fires the trigger when at least one of the
--     listed columns is updated. When api_url is set directly (e.g. by M42
--     correcting Cloud API connections, or any direct UPDATE of api_url),
--     the trigger does NOT fire — the validation is silently skipped.
--     M37's comment stated "BEFORE INSERT OR UPDATE OF api_url" but M37 did
--     not DROP+CREATE the trigger — the old server_url binding remained.
--
-- Fix:
--   1. CREATE OR REPLACE function with search_path = 'pg_catalog','zapp','vault'
--      (remove 'public'). Vault access works because vault schema is still listed
--      and the FROM clause uses schema-qualified name anyway.
--   2. DROP TRIGGER IF EXISTS + CREATE TRIGGER with correct column:
--      BEFORE INSERT OR UPDATE OF api_url
--
-- Idempotent: CREATE OR REPLACE + DROP/CREATE trigger; safe to re-run.
--
-- Rollback:
--   ALTER FUNCTION zapp.fn_validate_whatsapp_connection_url()
--     SET search_path TO 'pg_catalog', 'zapp', 'vault', 'public';
--   DROP TRIGGER IF EXISTS trg_validate_whatsapp_connection_url ON zapp.whatsapp_connections;
--   CREATE TRIGGER trg_validate_whatsapp_connection_url
--     BEFORE INSERT OR UPDATE OF server_url ON zapp.whatsapp_connections
--     FOR EACH ROW EXECUTE FUNCTION zapp.fn_validate_whatsapp_connection_url();

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — CREATE OR REPLACE with corrected search_path (remove 'public')
-- Function body is identical to M37 except the SET search_path line.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_validate_whatsapp_connection_url()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'zapp', 'vault'
AS $fn$
DECLARE
  v_allowed_url TEXT;
BEGIN
  -- Official (Meta Cloud API / WhatsApp Business) connections use the Meta Graph API
  -- endpoint (https://graph.facebook.com/v21.0), not an Evolution API URL.
  -- The M29/M30 auto-populate trigger already stores that endpoint in api_url;
  -- comparing it against the vault evolution_api_url secret would always fail.
  IF NEW.api_type = 'official' THEN
    RETURN NEW;
  END IF;

  -- Read the authorised Evolution API URL from vault — no fallback allowed.
  -- If vault is unavailable or the secret is unset, the INSERT is rejected (fail-secure).
  BEGIN
    SELECT decrypted_secret
      INTO v_allowed_url
      FROM vault.decrypted_secrets
     WHERE name = 'evolution_api_url'
     LIMIT 1;
  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    RAISE EXCEPTION 'fn_validate_whatsapp_connection_url: vault indisponível — INSERT rejeitado'
      USING ERRCODE = '42501';
  END;

  IF v_allowed_url IS NULL OR v_allowed_url = '' THEN
    RAISE EXCEPTION
      'fn_validate_whatsapp_connection_url: vault.evolution_api_url não configurado — '
      'INSERT rejeitado. Configure o secret antes de criar conexões.'
      USING ERRCODE = '42501';
  END IF;

  -- Validate api_url without leaking the expected value in the error message.
  -- DETAIL contains only the received URL so operators can debug; vault secret stays hidden.
  IF NEW.api_url IS DISTINCT FROM v_allowed_url THEN
    RAISE EXCEPTION 'api_url invalida — valor recebido não corresponde ao esperado (vault.evolution_api_url)'
      USING ERRCODE = '23514',
            DETAIL  = pg_catalog.format('recebido: %s', NEW.api_url);
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION zapp.fn_validate_whatsapp_connection_url()
  IS 'BEFORE INSERT/UPDATE OF api_url trigger (M37/M46 fix/F6-12): validates api_url '
     'against vault.evolution_api_url. Fail-secure: RAISES when vault is empty or '
     'unavailable (no hardcoded fallback). Error message does not expose expected URL. '
     'Exempts api_type=official (Meta Cloud API / Graph API endpoint). '
     'M46 fix: search_path no longer includes public; trigger re-bound to api_url column.';

REVOKE EXECUTE ON FUNCTION zapp.fn_validate_whatsapp_connection_url() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_validate_whatsapp_connection_url() TO service_role;

DO $$ BEGIN RAISE NOTICE 'M46 STEP 1: fn_validate_whatsapp_connection_url replaced (search_path=pg_catalog,zapp,vault) ✓'; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Re-bind trigger to correct column (api_url, not server_url)
-- M26 STEP 6 created the trigger with OF server_url — wrong column.
-- The validator checks NEW.api_url; if only api_url changes the trigger
-- never fires. DROP+CREATE corrects the column list.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_validate_whatsapp_connection_url ON zapp.whatsapp_connections;

CREATE TRIGGER trg_validate_whatsapp_connection_url
  BEFORE INSERT OR UPDATE OF api_url
  ON zapp.whatsapp_connections
  FOR EACH ROW
  EXECUTE FUNCTION zapp.fn_validate_whatsapp_connection_url();

DO $$ BEGIN RAISE NOTICE 'M46 STEP 2: trigger trg_validate_whatsapp_connection_url re-bound to UPDATE OF api_url ✓'; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn_secdef  BOOLEAN;
  v_fn_body    TEXT;
  v_trg_exists BOOLEAN;
  v_trg_cols   TEXT;
  v_ok         BOOLEAN := TRUE;
  v_report     TEXT    := '';
BEGIN
  -- Function checks
  SELECT p.prosecdef, pg_catalog.pg_get_functiondef(p.oid)
    INTO v_fn_secdef, v_fn_body
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp'
     AND p.proname = 'fn_validate_whatsapp_connection_url'
   LIMIT 1;

  IF v_fn_body IS NULL THEN
    v_report := v_report || E'\n  [FAIL] M46: fn_validate_whatsapp_connection_url NOT FOUND';
    v_ok := FALSE;
  ELSE
    v_report := v_report || E'\n  [OK]   M46: fn_validate_whatsapp_connection_url exists ✓';

    IF v_fn_secdef IS TRUE THEN
      v_report := v_report || E'\n  [OK]   M46: SECURITY DEFINER ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M46: NOT SECURITY DEFINER';
      v_ok := FALSE;
    END IF;

    -- P1: search_path must NOT contain 'public'
    IF position(', ''public''' IN lower(v_fn_body)) > 0
       OR position('''public'',' IN lower(v_fn_body)) > 0
    THEN
      v_report := v_report || E'\n  [FAIL] M46/P1: search_path still contains public';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   M46/P1: search_path free of public ✓';
    END IF;

    -- search_path must contain vault (required for vault.decrypted_secrets access)
    IF position('''vault''' IN lower(v_fn_body)) > 0 THEN
      v_report := v_report || E'\n  [OK]   M46: search_path contains vault ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M46: search_path missing vault';
      v_ok := FALSE;
    END IF;

    -- Fail-secure guards present
    IF position('não configurado' IN lower(v_fn_body)) > 0 THEN
      v_report := v_report || E'\n  [OK]   M46: fail-secure guard for empty vault present ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M46: fail-secure guard for empty vault missing';
      v_ok := FALSE;
    END IF;

    -- No info-leak (old 'esperado:' pattern)
    IF position('esperado:' IN lower(v_fn_body)) > 0
       AND position('vault.evolution_api_url' IN lower(v_fn_body)) = 0
    THEN
      v_report := v_report || E'\n  [FAIL] M46: function may still leak expected URL in error';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   M46: no URL info-leak in error message ✓';
    END IF;

    -- Official api_type exemption
    IF position('api_type' IN lower(v_fn_body)) > 0
       AND position('official' IN lower(v_fn_body)) > 0
    THEN
      v_report := v_report || E'\n  [OK]   M46: official api_type exemption present ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M46: official api_type exemption NOT found';
      v_ok := FALSE;
    END IF;
  END IF;

  -- Trigger checks: must exist and fire on api_url column (not server_url)
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'zapp'
       AND c.relname = 'whatsapp_connections'
       AND t.tgname  = 'trg_validate_whatsapp_connection_url'
       AND NOT t.tgisinternal
  ) INTO v_trg_exists;

  IF v_trg_exists THEN
    v_report := v_report || E'\n  [OK]   M46: trg_validate_whatsapp_connection_url trigger exists ✓';

    -- Verify trigger is NOT bound to server_url (old wrong column)
    -- tgattr stores column attnums; pg_get_triggerdef reveals the OF clause in text
    SELECT pg_catalog.pg_get_triggerdef(t.oid)
      INTO v_trg_cols
      FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'zapp'
       AND c.relname = 'whatsapp_connections'
       AND t.tgname  = 'trg_validate_whatsapp_connection_url'
       AND NOT t.tgisinternal
     LIMIT 1;

    IF position('server_url' IN lower(v_trg_cols)) > 0 THEN
      v_report := v_report || E'\n  [FAIL] M46/P2: trigger still bound to server_url (wrong column)';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   M46/P2: trigger NOT bound to server_url ✓';
    END IF;

    IF position('api_url' IN lower(v_trg_cols)) > 0 THEN
      v_report := v_report || E'\n  [OK]   M46/P2: trigger bound to api_url (correct column) ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M46/P2: trigger NOT bound to api_url';
      v_ok := FALSE;
    END IF;
  ELSE
    v_report := v_report || E'\n  [FAIL] M46: trg_validate_whatsapp_connection_url trigger NOT FOUND';
    v_ok := FALSE;
  END IF;

  RAISE NOTICE E'M46 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M46 verification FAILED — see notices above';
  END IF;
END;
$$;

COMMIT;
