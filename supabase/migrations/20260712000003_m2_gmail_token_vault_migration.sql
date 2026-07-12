-- ============================================================================
-- M-2 (MED-2): Migrate Gmail token encryption key from app.encryption_key GUC
--              to Supabase vault.decrypted_secrets
-- Audit: AUDITORIA_BACKEND_SENIOR_2026-07-11.md
-- Date: 2026-07-12
--
-- PROBLEM
-- -------
-- encrypt_gmail_token / decrypt_gmail_token read the symmetric key from
-- current_setting('app.encryption_key', true) — a PostgreSQL GUC set in
-- postgresql.conf or ALTER DATABASE. This has two risks:
--   1. The key is visible to any superuser via SHOW app.encryption_key.
--   2. Rotation requires a pg_reload_conf() or ALTER DATABASE restart cycle.
--
-- SOLUTION
-- --------
-- Migrate to vault.decrypted_secrets (pgsodium-backed Supabase vault), which:
--   - Stores the secret encrypted at rest with pgsodium's server key.
--   - Exposes the plaintext only to postgres (SECURITY DEFINER functions).
--   - Supports rotation via vault.update_secret() without any DB restart.
--
-- OPERATOR STEP (must be done BEFORE this migration takes effect in production):
-- -----------------------------------------------------------------------
--   SELECT vault.create_secret(
--     '<current value of app.encryption_key GUC>',
--     'gmail_encryption_key',
--     'Symmetric key for Gmail OAuth token encryption (pgp_sym_encrypt)'
--   );
-- -----------------------------------------------------------------------
-- The functions below try vault first and fall back to the GUC so that
-- existing installations continue working even if the vault secret has not
-- been created yet. Once all environments have the vault secret, the
-- fallback can be dropped in a subsequent migration.
--
-- IDEMPOTENT: CREATE OR REPLACE is safe on repeated runs.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Helper: resolve_gmail_encryption_key()
--    Reads key from vault (preferred); falls back to GUC for compatibility.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_gmail_encryption_key()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_key text;
BEGIN
  -- Try vault first
  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'gmail_encryption_key'
  LIMIT 1;

  IF v_key IS NOT NULL AND v_key <> '' THEN
    RETURN v_key;
  END IF;

  -- Fallback: GUC (legacy path, removed once vault is populated everywhere)
  v_key := current_setting('app.encryption_key', true);
  IF v_key IS NULL OR v_key = '' THEN
    RAISE EXCEPTION '[gmail_encryption] No key found in vault (gmail_encryption_key) or GUC (app.encryption_key). '
      'Run: SELECT vault.create_secret(''<key>'', ''gmail_encryption_key'', ''Gmail token key'');';
  END IF;

  RETURN v_key;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_gmail_encryption_key() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_gmail_encryption_key() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_gmail_encryption_key() FROM anon;

COMMENT ON FUNCTION public.resolve_gmail_encryption_key() IS
  'M-2 (2026-07-12): Returns Gmail symmetric key from vault.decrypted_secrets '
  '(''gmail_encryption_key'') with GUC fallback. Callable only by postgres role.';

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Update encrypt_gmail_token to use vault-backed key
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.encrypt_gmail_token(p_token text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_encrypt(p_token, public.resolve_gmail_encryption_key());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.encrypt_gmail_token(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.encrypt_gmail_token(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_gmail_token(text) FROM anon;

COMMENT ON FUNCTION public.encrypt_gmail_token(text) IS
  'M-2 (2026-07-12): Encrypts Gmail OAuth token with key from vault '
  '(gmail_encryption_key) via pgp_sym_encrypt. GUC fallback retained for compatibility.';

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Update decrypt_gmail_token to use vault-backed key
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.decrypt_gmail_token(p_encrypted bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_encrypted IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(p_encrypted, public.resolve_gmail_encryption_key());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.decrypt_gmail_token(bytea) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decrypt_gmail_token(bytea) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_gmail_token(bytea) FROM anon;

COMMENT ON FUNCTION public.decrypt_gmail_token(bytea) IS
  'M-2 (2026-07-12): Decrypts Gmail OAuth token with key from vault '
  '(gmail_encryption_key) via pgp_sym_decrypt. GUC fallback retained for compatibility.';

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Validate: functions exist and helper is not callable by authenticated
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn_count int;
  v_priv_count int;
BEGIN
  SELECT COUNT(*) INTO v_fn_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('resolve_gmail_encryption_key', 'encrypt_gmail_token', 'decrypt_gmail_token');

  IF v_fn_count < 3 THEN
    RAISE EXCEPTION 'M-2 validation FAILED: expected 3 functions, found %', v_fn_count;
  END IF;

  -- Verify authenticated cannot call resolve_gmail_encryption_key
  SELECT COUNT(*) INTO v_priv_count
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name = 'resolve_gmail_encryption_key'
    AND grantee IN ('authenticated', 'anon', 'PUBLIC');

  IF v_priv_count > 0 THEN
    RAISE EXCEPTION 'M-2 validation FAILED: resolve_gmail_encryption_key is callable by %', v_priv_count;
  END IF;

  RAISE NOTICE 'M-2 OK: gmail encryption functions updated to vault-backed key resolver. '
    'OPERATOR ACTION REQUIRED: run vault.create_secret() to populate gmail_encryption_key.';
END;
$$;
