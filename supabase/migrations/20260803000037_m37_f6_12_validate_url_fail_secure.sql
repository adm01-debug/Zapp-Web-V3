-- M37: F6-12 — fn_validate_whatsapp_connection_url fail-secure + no info-leak
-- Branch: claude/plan-implementation-review-bq8j14
-- Date: 2026-08-03
--
-- Problem (F6-12): fn_validate_whatsapp_connection_url has four issues:
--   1. Hardcoded fallback: IF vault returns NULL, falls back to
--      'https://evolution.atomicabr.com.br' — allows INSERTs even when vault is
--      corrupted/empty; vault should be the sole source of truth.
--   2. Info leak: RAISE EXCEPTION body exposes the expected URL:
--      'api_url invalida: X | esperado: Y' — leaks internal infrastructure host.
--   3. Missing SECURITY DEFINER + fixed search_path (security hardening gap).
--   4. No exemption for api_type='official': M29/M30 set
--      api_url='https://graph.facebook.com/v21.0' for Meta Cloud API connections —
--      the validator fires alphabetically after trg_a_wconn_auto_populate ('v' > 'a')
--      and would reject official connections because the Cloud API URL != vault URL.
--
-- Fix:
--   1. Remove hardcoded fallback. Vault empty/absent → RAISE EXCEPTION (fail-secure).
--   2. Generic error message: 'api_url invalida — valor recebido não corresponde ao
--      esperado (vault.evolution_api_url)' with DETAIL = 'recebido: <url>'
--      (does NOT expose the vault secret / expected URL).
--   3. SECURITY DEFINER SET search_path TO 'pg_catalog', 'zapp', 'vault', 'public'.
--   4. Skip validation when NEW.api_type = 'official' (Meta Cloud API connections
--      use https://graph.facebook.com/v21.0, not the Evolution vault secret).
--   5. Exception handler for vault access failure (consistent with M29 pattern).
--
-- Trigger binding unchanged: trg_validate_whatsapp_connection_url BEFORE INSERT OR UPDATE
--   OF api_url — CREATE OR REPLACE retains the existing trigger automatically.
--
-- Rollback:
--   CREATE OR REPLACE FUNCTION zapp.fn_validate_whatsapp_connection_url()
--     RETURNS trigger LANGUAGE plpgsql AS $$
--     DECLARE v_allowed_url text; BEGIN
--       SELECT decrypted_secret INTO v_allowed_url
--         FROM vault.decrypted_secrets WHERE name = 'evolution_api_url';
--       IF v_allowed_url IS NULL THEN
--         v_allowed_url := 'https://evolution.atomicabr.com.br';
--       END IF;
--       IF NEW.api_url IS DISTINCT FROM v_allowed_url THEN
--         RAISE EXCEPTION '[fn_validate_whatsapp_connection_url] api_url invalida: % | esperado: %', NEW.api_url, v_allowed_url
--           USING ERRCODE = '23514';
--       END IF;
--       RETURN NEW;
--     END; $$;

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — Replace with fail-secure, non-leaking, SECURITY DEFINER version
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_validate_whatsapp_connection_url()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'zapp', 'vault', 'public'
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
  -- DETAIL contains only the received URL so operators can debug; the vault secret stays hidden.
  IF NEW.api_url IS DISTINCT FROM v_allowed_url THEN
    RAISE EXCEPTION 'api_url invalida — valor recebido não corresponde ao esperado (vault.evolution_api_url)'
      USING ERRCODE = '23514',
            DETAIL  = format('recebido: %s', NEW.api_url);
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION zapp.fn_validate_whatsapp_connection_url()
  IS 'BEFORE INSERT/UPDATE OF api_url trigger (M37/F6-12): validates api_url against '
     'vault.evolution_api_url. Fail-secure: RAISES when vault is empty or unavailable '
     '(no hardcoded fallback). Error message does not expose the expected URL. '
     'Exempts api_type=official (Meta Cloud API / Graph API endpoint).';

REVOKE EXECUTE ON FUNCTION zapp.fn_validate_whatsapp_connection_url() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_validate_whatsapp_connection_url() TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn_secdef BOOLEAN;
  v_fn_body   TEXT;
  v_ok        BOOLEAN := TRUE;
  v_report    TEXT    := '';
BEGIN
  SELECT prosecdef,
         pg_catalog.pg_get_functiondef(p.oid)
    INTO v_fn_secdef, v_fn_body
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp'
     AND p.proname = 'fn_validate_whatsapp_connection_url'
   LIMIT 1;

  IF v_fn_body IS NULL THEN
    RAISE EXCEPTION 'M37 verification FAILED: fn_validate_whatsapp_connection_url not found';
  END IF;

  v_report := v_report || E'\n  [OK]   F6-12: fn_validate_whatsapp_connection_url exists ✓';

  -- SECURITY DEFINER
  IF v_fn_secdef IS TRUE THEN
    v_report := v_report || E'\n  [OK]   F6-12: SECURITY DEFINER ✓';
  ELSE
    v_report := v_report || E'\n  [FAIL] F6-12: NOT SECURITY DEFINER';
    v_ok := FALSE;
  END IF;

  -- No hardcoded fallback URL — the old URL must not appear in the body
  IF v_fn_body ~* 'evolution\.atomicabr\.com\.br' THEN
    v_report := v_report || E'\n  [FAIL] F6-12: function body still contains hardcoded fallback URL';
    v_ok := FALSE;
  ELSE
    v_report := v_report || E'\n  [OK]   F6-12: no hardcoded fallback URL in function body ✓';
  END IF;

  -- Fail-secure: body must raise when vault is unconfigured
  IF v_fn_body ~* 'não configurado' THEN
    v_report := v_report || E'\n  [OK]   F6-12: fail-secure RAISE for empty vault present ✓';
  ELSE
    v_report := v_report || E'\n  [FAIL] F6-12: fail-secure RAISE for empty vault NOT found';
    v_ok := FALSE;
  END IF;

  -- No info leak: old pattern 'esperado:' must not appear in error messages
  IF v_fn_body ~* '\|\s*esperado:' THEN
    v_report := v_report || E'\n  [FAIL] F6-12: function body still leaks expected URL in error message';
    v_ok := FALSE;
  ELSE
    v_report := v_report || E'\n  [OK]   F6-12: no URL info-leak in error message ✓';
  END IF;

  -- Official api_type exemption present
  IF v_fn_body ~* 'api_type.*official' THEN
    v_report := v_report || E'\n  [OK]   F6-12: official api_type exemption present ✓';
  ELSE
    v_report := v_report || E'\n  [FAIL] F6-12: official api_type exemption NOT found';
    v_ok := FALSE;
  END IF;

  RAISE NOTICE E'M37 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M37 verification FAILED — see notices above';
  END IF;
END;
$$;

COMMIT;
