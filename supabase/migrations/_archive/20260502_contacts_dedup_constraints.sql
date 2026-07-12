-- ============================================================
-- Migration: Deduplication Constraints + LGPD Fields
-- Purpose: Enforce unique normalized phones at DB level.
--          Complete LGPD field set for contacts table.
-- ============================================================

-- 1. Add function to get normalized phone for uniqueness check
CREATE OR REPLACE FUNCTION public.get_normalized_phone(phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN phone IS NULL OR phone = '' THEN NULL
    ELSE
      regexp_replace(
        CASE
          -- Strip leading 55 country code
          WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^55[1-9][0-9]' AND
               length(regexp_replace(phone, '[^0-9]', '', 'g')) IN (12, 13)
          THEN substring(regexp_replace(phone, '[^0-9]', '', 'g') FROM 3)
          ELSE regexp_replace(phone, '[^0-9]', '', 'g')
        END,
        '^',
        ''
      )
  END
$$;

-- 2. Create partial unique index on normalized phone per workspace
-- (allows NULL phones, prevents duplicate non-null phones in same workspace)
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_unique_phone_per_workspace
  ON public.contacts (workspace_id, get_normalized_phone(phone))
  WHERE phone IS NOT NULL
    AND deleted_at IS NULL;

-- 3. Create partial unique index on email per workspace  
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_unique_email_per_workspace
  ON public.contacts (workspace_id, lower(email))
  WHERE email IS NOT NULL
    AND deleted_at IS NULL;

-- 4. LGPD consent columns (if not already added)
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS lgpd_consent_at         timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lgpd_consent_channel    text        DEFAULT NULL 
    CHECK (lgpd_consent_channel IN ('whatsapp', 'email', 'form', 'phone', 'manual', 'import', NULL)),
  ADD COLUMN IF NOT EXISTS lgpd_opt_out_at         timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lgpd_marketing_consent  boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lgpd_data_sharing       boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lgpd_profiling          boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lgpd_last_updated_at    timestamptz DEFAULT NULL;

-- 5. Update lgpd_last_updated_at automatically
CREATE OR REPLACE FUNCTION public.fn_contacts_update_lgpd_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.lgpd_consent_at IS DISTINCT FROM NEW.lgpd_consent_at
    OR OLD.lgpd_opt_out_at IS DISTINCT FROM NEW.lgpd_opt_out_at
    OR OLD.lgpd_marketing_consent IS DISTINCT FROM NEW.lgpd_marketing_consent
    OR OLD.lgpd_data_sharing IS DISTINCT FROM NEW.lgpd_data_sharing
    OR OLD.lgpd_profiling IS DISTINCT FROM NEW.lgpd_profiling
  THEN
    NEW.lgpd_last_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contacts_lgpd_timestamp ON public.contacts;
CREATE TRIGGER trg_contacts_lgpd_timestamp
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_contacts_update_lgpd_timestamp();

-- 6. View: contacts without LGPD consent (for compliance report)
CREATE OR REPLACE VIEW public.v_contacts_without_consent AS
SELECT
  id, name, phone, email, channel, created_at, workspace_id
FROM public.contacts
WHERE deleted_at IS NULL
  AND lgpd_consent_at IS NULL
  AND lgpd_opt_out_at IS NULL
ORDER BY created_at DESC;

-- 7. RPC: get compliance stats per workspace
CREATE OR REPLACE FUNCTION public.get_lgpd_compliance_stats(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_active',           COUNT(*),
    'with_consent',           COUNT(*) FILTER (WHERE lgpd_consent_at IS NOT NULL AND lgpd_opt_out_at IS NULL),
    'opted_out',              COUNT(*) FILTER (WHERE lgpd_opt_out_at IS NOT NULL),
    'without_consent',        COUNT(*) FILTER (WHERE lgpd_consent_at IS NULL AND lgpd_opt_out_at IS NULL),
    'marketing_enabled',      COUNT(*) FILTER (WHERE lgpd_marketing_consent = true AND lgpd_opt_out_at IS NULL),
    'consent_rate_pct',       ROUND(
                                100.0 * COUNT(*) FILTER (WHERE lgpd_consent_at IS NOT NULL AND lgpd_opt_out_at IS NULL)
                                / NULLIF(COUNT(*), 0), 1
                              )
  )
  FROM public.contacts
  WHERE workspace_id = p_workspace_id
    AND deleted_at IS NULL
$$;
