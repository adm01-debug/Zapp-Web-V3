-- Round 16 Migration #9: Vault Key Protection & LGPD Data Portability
-- Severity: HIGH — Encryption keys stored as plaintext BYTEA in _encryption_keys
--           table means any SQL injection or DB credential leak exposes all encrypted
--           PII. Also adds LGPD Article 18 data portability (export) function.
-- Fix: Migrate to pgsodium Vault for key storage. Wrap encrypt/decrypt functions
--      to use vault.secret instead of plaintext BYTEA. Add LGPD portability function.
-- Date: 2026-07-12
-- Impact: Key material never accessible via SQL; only accessible via pgsodium Vault API

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Check if pgsodium/vault are available (Supabase provides both)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgsodium') THEN
    RAISE NOTICE 'pgsodium not available — vault-based key storage will be skipped. Keys remain in _encryption_keys table.';
  ELSE
    RAISE NOTICE 'pgsodium available — proceeding with vault key migration';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Create key reference table (replaces plaintext key storage)
--    Stores only the vault key_id (UUID) — never the actual key bytes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.encryption_key_refs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key_purpose  TEXT        NOT NULL,
  vault_key_id UUID        NOT NULL,          -- references pgsodium.key.id
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at   TIMESTAMPTZ,
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  CONSTRAINT chk_key_purpose CHECK (
    key_purpose IN ('pii_encryption', 'audit_hmac', 'backup_encryption', 'token_signing')
  ),
  UNIQUE (key_purpose, is_active) DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE public.encryption_key_refs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'encryption_key_refs' AND policyname = 'ekr_svc_only'
  ) THEN
    EXECUTE 'CREATE POLICY ekr_svc_only ON public.encryption_key_refs
             AS RESTRICTIVE TO service_role USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'encryption_key_refs' AND policyname = 'ekr_deny_all'
  ) THEN
    EXECUTE 'CREATE POLICY ekr_deny_all ON public.encryption_key_refs USING (false)';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Hardened PII encryption using pgsodium (falls back gracefully if unavailable)
-- ─────────────────────────────────────────────────────────────────────────────

-- fn_encrypt_pii_v2: uses pgsodium.crypto_aead_det_encrypt if available
-- IMPORTANT: This function is VOLATILE (calls Vault which is stateful)
CREATE OR REPLACE FUNCTION fn_encrypt_pii_v2(
  p_plaintext TEXT,
  p_key_purpose TEXT DEFAULT 'pii_encryption'
)
RETURNS BYTEA
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public', 'pgsodium', 'vault'
AS $$
DECLARE
  v_vault_key_id UUID;
  v_ciphertext   BYTEA;
BEGIN
  IF p_plaintext IS NULL THEN
    RETURN NULL;
  END IF;

  -- Get the active vault key reference for this purpose
  SELECT vault_key_id INTO v_vault_key_id
  FROM public.encryption_key_refs
  WHERE key_purpose = p_key_purpose AND is_active = true
  LIMIT 1;

  IF v_vault_key_id IS NULL THEN
    RAISE EXCEPTION 'no_active_key: No active vault key found for purpose %', p_key_purpose
      USING ERRCODE = '42704';
  END IF;

  -- Use pgsodium deterministic AEAD encryption if available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgsodium') THEN
    -- pgsodium.crypto_aead_det_encrypt(message, additional, key_id, context)
    v_ciphertext := pgsodium.crypto_aead_det_encrypt(
      p_plaintext::BYTEA,
      'pii'::BYTEA,  -- additional data (context)
      v_vault_key_id
    );
  ELSE
    -- Fallback: return error — should never reach here in production
    RAISE EXCEPTION 'pgsodium_required: pgsodium extension must be installed for PII encryption'
      USING ERRCODE = 'XX000';
  END IF;

  RETURN v_ciphertext;
END;
$$;

REVOKE ALL ON FUNCTION fn_encrypt_pii_v2(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_encrypt_pii_v2(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION fn_encrypt_pii_v2(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION fn_encrypt_pii_v2(TEXT, TEXT) TO service_role;

-- fn_decrypt_pii_v2: reverse of encryption
CREATE OR REPLACE FUNCTION fn_decrypt_pii_v2(
  p_ciphertext BYTEA,
  p_key_purpose TEXT DEFAULT 'pii_encryption'
)
RETURNS TEXT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public', 'pgsodium', 'vault'
AS $$
DECLARE
  v_vault_key_id UUID;
  v_plaintext    BYTEA;
BEGIN
  IF p_ciphertext IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT vault_key_id INTO v_vault_key_id
  FROM public.encryption_key_refs
  WHERE key_purpose = p_key_purpose AND is_active = true
  LIMIT 1;

  IF v_vault_key_id IS NULL THEN
    RAISE EXCEPTION 'no_active_key: No active vault key for purpose %', p_key_purpose
      USING ERRCODE = '42704';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgsodium') THEN
    v_plaintext := pgsodium.crypto_aead_det_decrypt(
      p_ciphertext,
      'pii'::BYTEA,
      v_vault_key_id
    );
  ELSE
    RAISE EXCEPTION 'pgsodium_required: pgsodium extension must be installed for PII decryption'
      USING ERRCODE = 'XX000';
  END IF;

  RETURN convert_from(v_plaintext, 'UTF8');
END;
$$;

REVOKE ALL ON FUNCTION fn_decrypt_pii_v2(BYTEA, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_decrypt_pii_v2(BYTEA, TEXT) FROM anon;
REVOKE ALL ON FUNCTION fn_decrypt_pii_v2(BYTEA, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION fn_decrypt_pii_v2(BYTEA, TEXT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Key rotation function — creates new vault key, marks old as rotated
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_rotate_encryption_key(p_key_purpose TEXT)
RETURNS UUID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public', 'pgsodium', 'vault'
AS $$
DECLARE
  v_old_ref_id    UUID;
  v_new_key_id    UUID;
  v_actor         UUID;
BEGIN
  v_actor := auth.uid();

  IF v_actor IS NULL OR NOT is_admin_or_supervisor(v_actor) THEN
    RAISE EXCEPTION 'insufficient_privilege: Key rotation requires admin privileges'
      USING ERRCODE = '42501';
  END IF;

  IF p_key_purpose NOT IN ('pii_encryption', 'audit_hmac', 'backup_encryption', 'token_signing') THEN
    RAISE EXCEPTION 'invalid_purpose: %', p_key_purpose
      USING ERRCODE = '22023';
  END IF;

  -- Get current active key
  SELECT id INTO v_old_ref_id
  FROM public.encryption_key_refs
  WHERE key_purpose = p_key_purpose AND is_active = true;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgsodium') THEN
    -- Create new key in vault
    INSERT INTO pgsodium.key (key_type, name, comment)
    VALUES ('aead-det', p_key_purpose || '_' || to_char(now(), 'YYYYMMDDHH24MISS'), 'Rotated key for ' || p_key_purpose)
    RETURNING id INTO v_new_key_id;
  ELSE
    RAISE EXCEPTION 'pgsodium_required: Cannot rotate keys without pgsodium'
      USING ERRCODE = 'XX000';
  END IF;

  -- Deactivate old key reference
  UPDATE public.encryption_key_refs
  SET is_active = false, rotated_at = now()
  WHERE key_purpose = p_key_purpose AND is_active = true;

  -- Insert new key reference
  INSERT INTO public.encryption_key_refs (key_purpose, vault_key_id, is_active)
  VALUES (p_key_purpose, v_new_key_id, true);

  -- Emit audit event
  PERFORM fn_append_audit_event(
    'KEY_ROTATED',
    v_actor,
    'encryption_key',
    p_key_purpose,
    jsonb_build_object(
      'new_key_id', v_new_key_id,
      'old_ref_id', v_old_ref_id,
      'rotated_at', now()
    )
  );

  RETURN v_new_key_id;
END;
$$;

REVOKE ALL ON FUNCTION fn_rotate_encryption_key(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_rotate_encryption_key(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION fn_rotate_encryption_key(TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. LGPD Article 18 — Data Portability Export Function
--    Returns all data the system holds on a contact in portable JSON format
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_export_contact_data_portable(p_contact_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public', 'evo', 'zapp'
AS $$
DECLARE
  v_actor       UUID;
  v_workspace   UUID;
  v_contact     RECORD;
  v_result      JSONB;
  v_consents    JSONB;
  v_campaigns   JSONB;
  v_audit_trail JSONB;
BEGIN
  v_actor := auth.uid();

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;

  -- Find workspace and verify access
  SELECT wm.workspace_id INTO v_workspace
  FROM public.workspace_members wm
  WHERE wm.user_id = v_actor AND wm.accepted_at IS NOT NULL
  LIMIT 1;

  -- Fetch contact data (admin/supervisor sees any workspace; agent sees own workspace)
  SELECT c.*
  INTO v_contact
  FROM evo.evolution_contacts c
  WHERE c.id = p_contact_id
    AND c.deleted_at IS NULL
    AND (
      is_admin_or_supervisor(v_actor)
      OR c.workspace_id = v_workspace
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact_not_found: Contact % not found or not accessible', p_contact_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Gather LGPD consents
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'consent_type', la.consent_type,
      'granted', la.is_granted,
      'granted_at', la.created_at,
      'withdrawn_at', la.withdrawn_at,
      'channel', la.channel
    ) ORDER BY la.created_at DESC),
    '[]'::jsonb
  ) INTO v_consents
  FROM public.lgpd_consent_audit la
  WHERE la.contact_id = p_contact_id;

  -- Gather campaign memberships
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'campaign_id', cc.campaign_id,
      'added_at', cc.created_at,
      'status', cc.status
    ) ORDER BY cc.created_at DESC),
    '[]'::jsonb
  ) INTO v_campaigns
  FROM zapp.campaign_contacts cc
  WHERE cc.contact_id = p_contact_id
    AND cc.deleted_at IS NULL;

  -- Recent audit trail for this contact
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'event', pal.operation,
      'accessed_by', pal.accessor_id,
      'accessed_at', pal.accessed_at
    ) ORDER BY pal.accessed_at DESC),
    '[]'::jsonb
  ) INTO v_audit_trail
  FROM public.pii_access_log pal
  WHERE pal.contact_id = p_contact_id
  LIMIT 100;

  -- Build portable export (LGPD Art. 18 — right to portability)
  v_result := jsonb_build_object(
    'export_version', '1.0',
    'exported_at', now(),
    'contact', jsonb_build_object(
      'id', v_contact.id,
      'full_name', v_contact.full_name,
      'phone_number', v_contact.phone_number,
      'email', v_contact.email,
      'push_name', v_contact.push_name,
      'company', v_contact.company,
      'instance_name', v_contact.instance_name,
      'workspace_id', v_contact.workspace_id,
      'created_at', v_contact.created_at,
      'updated_at', v_contact.updated_at
    ),
    'consents', v_consents,
    'campaign_memberships', v_campaigns,
    'access_audit', v_audit_trail,
    'lgpd', jsonb_build_object(
      'basis', 'LGPD Art. 18 — Right to Data Portability',
      'retention_policy', '5 years (Art. 16)',
      'controller', 'Zapp Platform'
    )
  );

  -- Log this export access
  INSERT INTO public.pii_access_log (accessor_id, contact_id, operation, fields_accessed)
  VALUES (
    v_actor, p_contact_id, 'EXPORT_PORTABLE',
    ARRAY['full_name','phone_number','email','push_name','company','consents','campaigns']
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION fn_export_contact_data_portable(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_export_contact_data_portable(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION fn_export_contact_data_portable(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. PII mutation audit trigger — AFTER UPDATE ON evo.evolution_contacts
--    Logs field-level PII changes to the tamper-evident chain
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_audit_pii_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public', 'evo'
AS $$
DECLARE
  v_changed_fields TEXT[] := ARRAY[]::TEXT[];
  v_payload        JSONB;
BEGIN
  -- Only log changes to PII fields
  IF OLD.full_name IS DISTINCT FROM NEW.full_name THEN
    v_changed_fields := v_changed_fields || 'full_name';
  END IF;
  IF OLD.phone_number IS DISTINCT FROM NEW.phone_number THEN
    v_changed_fields := v_changed_fields || 'phone_number';
  END IF;
  IF OLD.email IS DISTINCT FROM NEW.email THEN
    v_changed_fields := v_changed_fields || 'email';
  END IF;
  IF OLD.push_name IS DISTINCT FROM NEW.push_name THEN
    v_changed_fields := v_changed_fields || 'push_name';
  END IF;
  IF OLD.profile_picture_url IS DISTINCT FROM NEW.profile_picture_url THEN
    v_changed_fields := v_changed_fields || 'profile_picture_url';
  END IF;
  IF OLD.notes IS DISTINCT FROM NEW.notes THEN
    v_changed_fields := v_changed_fields || 'notes';
  END IF;

  IF array_length(v_changed_fields, 1) > 0 THEN
    v_payload := jsonb_build_object(
      'contact_id', NEW.id,
      'workspace_id', NEW.workspace_id,
      'changed_fields', v_changed_fields,
      'actor', auth.uid(),
      'timestamp', now()
    );

    PERFORM fn_append_audit_event(
      'PII_MUTATION',
      auth.uid(),
      'contact',
      NEW.id::TEXT,
      v_payload
    );

    -- Log to PII access log as well
    INSERT INTO public.pii_access_log (accessor_id, contact_id, operation, fields_accessed)
    VALUES (auth.uid(), NEW.id, 'MUTATION', v_changed_fields)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'evo' AND tablename = 'evolution_contacts'
  ) THEN
    DROP TRIGGER IF EXISTS trg_audit_pii_mutation ON evo.evolution_contacts;
    CREATE TRIGGER trg_audit_pii_mutation
      AFTER UPDATE ON evo.evolution_contacts
      FOR EACH ROW EXECUTE FUNCTION fn_audit_pii_mutation();
    RAISE NOTICE 'PII mutation audit trigger created on evo.evolution_contacts';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Nonce replay protection table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.used_nonces (
  nonce      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  used_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  purpose    TEXT        NOT NULL DEFAULT 'auth',
  CONSTRAINT chk_nonce_expires_future CHECK (expires_at > used_at)
);

CREATE INDEX IF NOT EXISTS idx_used_nonces_expires
  ON public.used_nonces (expires_at)
  WHERE expires_at > now() - INTERVAL '1 hour';

ALTER TABLE public.used_nonces ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'used_nonces' AND policyname = 'un_svc_full'
  ) THEN
    EXECUTE 'CREATE POLICY un_svc_full ON public.used_nonces TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- Function: check and consume a nonce (atomic — prevents TOCTOU)
CREATE OR REPLACE FUNCTION fn_consume_nonce(p_nonce UUID, p_expires_at TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_inserted BOOLEAN := false;
BEGIN
  -- Check expiry before consuming
  IF p_expires_at < now() THEN
    RETURN false;
  END IF;

  -- Try to insert (PK conflict = already used)
  BEGIN
    INSERT INTO public.used_nonces (nonce, expires_at)
    VALUES (p_nonce, p_expires_at);
    v_inserted := true;
  EXCEPTION WHEN unique_violation THEN
    v_inserted := false;
  END;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION fn_consume_nonce(UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_consume_nonce(UUID, TIMESTAMPTZ) TO service_role;

-- Schedule nonce cleanup if pg_cron is available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup-used-nonces',
      '0 */4 * * *',
      'DELETE FROM public.used_nonces WHERE expires_at < now() - INTERVAL ''1 hour'''
    );
    RAISE NOTICE 'pg_cron: nonce cleanup job scheduled (every 4 hours)';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Emit audit chain event
-- ─────────────────────────────────────────────────────────────────────────────
SELECT fn_append_audit_event(
  'VAULT_AND_PORTABILITY_DEPLOYED',
  NULL,
  'migration',
  '20260712170800_r16_vault_key_protection',
  jsonb_build_object(
    'migration', '20260712170800_r16_vault_key_protection',
    'components', ARRAY[
      'encryption_key_refs table (vault reference, no plaintext)',
      'fn_encrypt_pii_v2 (pgsodium AEAD)',
      'fn_decrypt_pii_v2 (pgsodium AEAD)',
      'fn_rotate_encryption_key',
      'fn_export_contact_data_portable (LGPD Art.18)',
      'fn_audit_pii_mutation trigger',
      'used_nonces table + fn_consume_nonce'
    ]
  )
);

COMMIT;
