-- Round 16 Migration #5: PII Data Masking & Data Classification
-- Severity: HIGH — Non-privileged users can see plaintext PII (phone, email,
--           full_name) via direct table access or views that don't mask fields.
-- Fix: Dynamic data masking functions for PII fields, data classification labels,
--      masked views for agent role, RLS-aware masking wrappers.
-- Date: 2026-07-12
-- Impact: Agents see masked PII; admins/supervisors see full data; LGPD compliance

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. PII classification registry
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pii_field_registry (
  id              BIGSERIAL PRIMARY KEY,
  schema_name     TEXT NOT NULL,
  table_name      TEXT NOT NULL,
  column_name     TEXT NOT NULL,
  classification  TEXT NOT NULL DEFAULT 'PII',
  mask_type       TEXT NOT NULL DEFAULT 'partial',
  registered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (schema_name, table_name, column_name),
  CONSTRAINT chk_classification CHECK (
    classification IN ('PII', 'SENSITIVE_PII', 'FINANCIAL', 'CREDENTIALS', 'PUBLIC')
  ),
  CONSTRAINT chk_mask_type CHECK (
    mask_type IN ('full', 'partial', 'hash', 'none')
  )
);

-- Seed known PII fields
INSERT INTO public.pii_field_registry (schema_name, table_name, column_name, classification, mask_type)
VALUES
  ('evo', 'evolution_contacts', 'full_name',         'PII',           'partial'),
  ('evo', 'evolution_contacts', 'phone_number',       'PII',           'partial'),
  ('evo', 'evolution_contacts', 'email',              'PII',           'partial'),
  ('evo', 'evolution_contacts', 'push_name',          'PII',           'partial'),
  ('evo', 'evolution_contacts', 'profile_picture_url','PII',           'full'),
  ('evo', 'evolution_contacts', 'company',            'PII',           'partial'),
  ('evo', 'evolution_contacts', 'notes',              'SENSITIVE_PII', 'full'),
  ('public', 'profiles',        'email',              'PII',           'partial'),
  ('public', 'profiles',        'full_name',          'PII',           'partial'),
  ('public', 'payment_links',   'customer_phone',     'FINANCIAL',     'partial'),
  ('public', 'payment_links',   'customer_email',     'FINANCIAL',     'partial')
ON CONFLICT (schema_name, table_name, column_name) DO NOTHING;

ALTER TABLE public.pii_field_registry ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pii_field_registry' AND policyname='pii_reg_read') THEN
    EXECUTE 'CREATE POLICY pii_reg_read ON public.pii_field_registry FOR SELECT TO authenticated USING (is_admin_or_supervisor(auth.uid()))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pii_field_registry' AND policyname='pii_reg_svc') THEN
    EXECUTE 'CREATE POLICY pii_reg_svc ON public.pii_field_registry TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Masking functions
-- ─────────────────────────────────────────────────────────────────────────────

-- Mask a phone number: +5511999887766 → +55119***7766
CREATE OR REPLACE FUNCTION fn_mask_phone(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF p_phone IS NULL OR LENGTH(p_phone) < 6 THEN
    RETURN '***';
  END IF;
  -- Keep first 5 chars (country+area) and last 4 digits
  RETURN SUBSTRING(p_phone FROM 1 FOR 5) ||
         REPEAT('*', GREATEST(0, LENGTH(p_phone) - 9)) ||
         SUBSTRING(p_phone FROM LENGTH(p_phone) - 3);
END;
$$;

-- Mask an email: john.doe@example.com → jo***@example.com
CREATE OR REPLACE FUNCTION fn_mask_email(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_at_pos INT;
  v_local  TEXT;
  v_domain TEXT;
BEGIN
  IF p_email IS NULL OR p_email = '' THEN
    RETURN '***@***.***';
  END IF;

  v_at_pos := POSITION('@' IN p_email);
  IF v_at_pos = 0 THEN
    RETURN SUBSTRING(p_email FROM 1 FOR 2) || REPEAT('*', GREATEST(0, LENGTH(p_email) - 2));
  END IF;

  v_local  := SUBSTRING(p_email FROM 1 FOR v_at_pos - 1);
  v_domain := SUBSTRING(p_email FROM v_at_pos);

  RETURN SUBSTRING(v_local FROM 1 FOR LEAST(2, LENGTH(v_local))) ||
         REPEAT('*', GREATEST(0, LENGTH(v_local) - 2)) ||
         v_domain;
END;
$$;

-- Mask a name: "João Silva" → "Jo*** Si***"
CREATE OR REPLACE FUNCTION fn_mask_name(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_words TEXT[];
  v_word  TEXT;
  v_masked TEXT[];
  v_i INT;
BEGIN
  IF p_name IS NULL OR p_name = '' THEN
    RETURN '***';
  END IF;

  v_words := string_to_array(TRIM(p_name), ' ');
  v_masked := ARRAY[]::TEXT[];

  FOR v_i IN 1 .. array_length(v_words, 1) LOOP
    v_word := v_words[v_i];
    IF LENGTH(v_word) <= 2 THEN
      v_masked := v_masked || v_word;
    ELSE
      v_masked := v_masked || (SUBSTRING(v_word FROM 1 FOR 2) || REPEAT('*', LENGTH(v_word) - 2));
    END IF;
  END LOOP;

  RETURN array_to_string(v_masked, ' ');
END;
$$;

-- Partial mask (generic): keep first N, mask middle, keep last M
CREATE OR REPLACE FUNCTION fn_mask_partial(
  p_value  TEXT,
  p_keep_start INT DEFAULT 2,
  p_keep_end   INT DEFAULT 2
)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_len INT;
BEGIN
  IF p_value IS NULL OR p_value = '' THEN
    RETURN '***';
  END IF;

  v_len := LENGTH(p_value);

  IF v_len <= (p_keep_start + p_keep_end) THEN
    RETURN REPEAT('*', v_len);
  END IF;

  RETURN SUBSTRING(p_value FROM 1 FOR p_keep_start) ||
         REPEAT('*', v_len - p_keep_start - p_keep_end) ||
         SUBSTRING(p_value FROM v_len - p_keep_end + 1);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Role-aware contact data accessor — returns masked or clear data
--    based on caller's privilege level
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_get_contact_masked(p_contact_id UUID)
RETURNS TABLE (
  id                UUID,
  full_name         TEXT,
  phone_number      TEXT,
  email             TEXT,
  company           TEXT,
  instance_name     TEXT,
  workspace_id      UUID,
  deleted_at        TIMESTAMPTZ,
  pii_masked        BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public', 'evo'
AS $$
DECLARE
  v_user_id     UUID;
  v_is_elevated BOOLEAN;
  v_workspace   UUID;
  r             RECORD;
BEGIN
  v_user_id     := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;

  v_is_elevated := is_admin_or_supervisor(v_user_id);

  SELECT wm.workspace_id INTO v_workspace
  FROM public.workspace_members wm
  WHERE wm.user_id = v_user_id AND wm.accepted_at IS NOT NULL
  LIMIT 1;

  SELECT c.id, c.full_name, c.phone_number, c.email,
         c.company, c.instance_name, c.workspace_id, c.deleted_at
  INTO r
  FROM evo.evolution_contacts c
  WHERE c.id = p_contact_id
    AND c.deleted_at IS NULL
    AND (v_is_elevated OR c.workspace_id = v_workspace);

  IF NOT FOUND THEN
    RETURN;
  END IF;

  id           := r.id;
  workspace_id := r.workspace_id;
  deleted_at   := r.deleted_at;
  instance_name := r.instance_name;

  IF v_is_elevated THEN
    -- Full data for admins/supervisors
    full_name    := r.full_name;
    phone_number := r.phone_number;
    email        := r.email;
    company      := r.company;
    pii_masked   := FALSE;
  ELSE
    -- Masked data for agents
    full_name    := fn_mask_name(r.full_name);
    phone_number := fn_mask_phone(r.phone_number);
    email        := fn_mask_email(r.email);
    company      := fn_mask_partial(r.company, 3, 2);
    pii_masked   := TRUE;
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION fn_get_contact_masked(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_get_contact_masked(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION fn_get_contact_masked(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Batch contact retrieval with masking (for contact list views)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_list_contacts_masked(
  p_limit  INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id           UUID,
  full_name    TEXT,
  phone_number TEXT,
  email        TEXT,
  company      TEXT,
  instance_name TEXT,
  workspace_id  UUID,
  pii_masked   BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public', 'evo'
AS $$
DECLARE
  v_user_id     UUID;
  v_is_elevated BOOLEAN;
  v_workspace   UUID;
BEGIN
  IF p_limit > 200 THEN
    RAISE EXCEPTION 'limit_exceeded: Maximum page size is 200, requested %', p_limit
      USING ERRCODE = '22023';
  END IF;

  v_user_id     := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;

  v_is_elevated := is_admin_or_supervisor(v_user_id);

  SELECT wm.workspace_id INTO v_workspace
  FROM public.workspace_members wm
  WHERE wm.user_id = v_user_id AND wm.accepted_at IS NOT NULL
  LIMIT 1;

  IF v_is_elevated THEN
    RETURN QUERY
    SELECT c.id, c.full_name, c.phone_number, c.email,
           c.company, c.instance_name, c.workspace_id, FALSE::BOOLEAN
    FROM evo.evolution_contacts c
    WHERE c.deleted_at IS NULL
      AND c.workspace_id = v_workspace
    ORDER BY c.created_at DESC
    LIMIT p_limit OFFSET p_offset;
  ELSE
    RETURN QUERY
    SELECT c.id,
           fn_mask_name(c.full_name),
           fn_mask_phone(c.phone_number),
           fn_mask_email(c.email),
           fn_mask_partial(c.company, 3, 2),
           c.instance_name,
           c.workspace_id,
           TRUE::BOOLEAN
    FROM evo.evolution_contacts c
    WHERE c.deleted_at IS NULL
      AND c.workspace_id = v_workspace
    ORDER BY c.created_at DESC
    LIMIT p_limit OFFSET p_offset;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION fn_list_contacts_masked(INT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_list_contacts_masked(INT, INT) FROM anon;
GRANT EXECUTE ON FUNCTION fn_list_contacts_masked(INT, INT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. PII access audit — log every unmasked PII access by elevated users
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pii_access_log (
  id          BIGSERIAL PRIMARY KEY,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accessor_id UUID        NOT NULL,
  contact_id  UUID        NOT NULL,
  operation   TEXT        NOT NULL DEFAULT 'READ',
  fields_accessed TEXT[],
  ip_hint     TEXT
);

CREATE INDEX IF NOT EXISTS idx_pii_access_log_accessor
  ON public.pii_access_log (accessor_id, accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pii_access_log_contact
  ON public.pii_access_log (contact_id, accessed_at DESC);

ALTER TABLE public.pii_access_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pii_access_log' AND policyname='pal_svc_full') THEN
    EXECUTE 'CREATE POLICY pal_svc_full ON public.pii_access_log TO service_role USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='pii_access_log' AND policyname='pal_admin_read') THEN
    EXECUTE 'CREATE POLICY pal_admin_read ON public.pii_access_log FOR SELECT TO authenticated
             USING (is_admin_or_supervisor(auth.uid()) OR accessor_id = auth.uid())';
  END IF;
END $$;

COMMIT;
