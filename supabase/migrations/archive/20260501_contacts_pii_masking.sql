-- ============================================================
-- Migration: PII Masking for viewer role
-- Purpose: LGPD compliance — agents/viewers see masked PII.
--          Only managers and above see full data.
-- ============================================================

-- 1. Masking functions (immutable for use in views)

CREATE OR REPLACE FUNCTION public.mask_phone(phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN phone IS NULL OR length(phone) < 4 THEN phone
    ELSE
      -- Show first 2 + last 4 digits, mask middle
      left(phone, 2) || repeat('*', greatest(0, length(phone) - 6)) || right(phone, 4)
  END
$$;

CREATE OR REPLACE FUNCTION public.mask_email(email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN email IS NULL OR position('@' IN email) < 2 THEN email
    ELSE
      left(email, 1) ||
      repeat('*', greatest(0, position('@' IN email) - 2)) ||
      substring(email FROM position('@' IN email))
  END
$$;

CREATE OR REPLACE FUNCTION public.mask_cpf(cpf text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN cpf IS NULL THEN NULL
    ELSE '***.' || substring(cpf, 5, 3) || '.***-**'
  END
$$;

-- Convenience: check if current user can see PII
CREATE OR REPLACE FUNCTION public.can_see_pii()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'manager', 'agente_especial')
  )
$$;

-- 2. Masked contacts view — agents/viewers see this
CREATE OR REPLACE VIEW public.v_contacts_masked AS
SELECT
  id,
  name,
  -- Phone: masked for viewers, full for managers
  CASE WHEN public.can_see_pii() THEN phone ELSE public.mask_phone(phone) END AS phone,
  -- Email: masked for viewers, full for managers
  CASE WHEN public.can_see_pii() THEN email ELSE public.mask_email(email) END AS email,
  -- phone_numbers: mask all numbers in the JSONB array for viewers
  CASE
    WHEN public.can_see_pii() THEN phone_numbers
    ELSE (
      SELECT jsonb_agg(
        elem || jsonb_build_object('number', public.mask_phone(elem->>'number'))
      )
      FROM jsonb_array_elements(COALESCE(phone_numbers, '[]'::jsonb)) AS elem
    )
  END AS phone_numbers,
  company,
  tags,
  channel,
  avatar_url,
  notes,
  created_at,
  updated_at,
  last_seen_at,
  workspace_id,
  -- LGPD fields: only managers
  CASE WHEN public.can_see_pii() THEN lgpd_consent_at ELSE NULL END AS lgpd_consent_at,
  lgpd_marketing_consent,
  lgpd_opt_out_at,
  -- Soft delete fields
  deleted_at,
  merged_from_id
FROM public.contacts
WHERE deleted_at IS NULL;

-- Grant SELECT on the view to authenticated users
GRANT SELECT ON public.v_contacts_masked TO authenticated;

-- 3. Audit view access (who viewed PII)
CREATE TABLE IF NOT EXISTS public.pii_access_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  accessed_by  uuid        REFERENCES auth.users(id),
  contact_id   uuid,
  field        text        NOT NULL,
  accessed_at  timestamptz NOT NULL DEFAULT now(),
  source       text        -- 'ui' | 'api' | 'export'
);

CREATE INDEX IF NOT EXISTS idx_pii_access_log_user
  ON public.pii_access_log (accessed_by, accessed_at DESC);

ALTER TABLE public.pii_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pii_access_log_insert"
  ON public.pii_access_log FOR INSERT
  TO authenticated
  WITH CHECK (accessed_by = auth.uid());

CREATE POLICY "pii_access_log_select_managers"
  ON public.pii_access_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'supervisor')
    )
  );

-- 4. Add LGPD columns to contacts if not exists
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS lgpd_consent_at        timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lgpd_consent_channel   text        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lgpd_opt_out_at        timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lgpd_marketing_consent boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS lgpd_data_sharing      boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS lgpd_profiling         boolean     DEFAULT false;
