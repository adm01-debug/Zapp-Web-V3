-- ============================================================
-- Migration: Complete LGPD + Contacts Schema Finalization
-- Purpose: Add all remaining columns and constraints for 10/10
-- ============================================================

-- 1. Ensure all LGPD columns exist with proper types and defaults
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS lgpd_consent_at        timestamptz  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lgpd_consent_channel   text         DEFAULT NULL
    CHECK (lgpd_consent_channel IN ('whatsapp','email','form','phone','manual','import') OR lgpd_consent_channel IS NULL),
  ADD COLUMN IF NOT EXISTS lgpd_opt_out_at        timestamptz  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lgpd_marketing_consent boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lgpd_data_sharing      boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lgpd_profiling         boolean      NOT NULL DEFAULT false;

-- 2. Ensure birth_date column exists
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS birth_date date DEFAULT NULL;

-- Birthday constraint: cannot be in the future
ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS chk_birth_date_not_future;
ALTER TABLE public.contacts
  ADD CONSTRAINT chk_birth_date_not_future
  CHECK (birth_date IS NULL OR birth_date <= CURRENT_DATE);

-- 3. Ensure name length constraint (max 500 chars)
ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS chk_contact_name_length;
ALTER TABLE public.contacts
  ADD CONSTRAINT chk_contact_name_length
  CHECK (length(name) BETWEEN 1 AND 500);

-- 4. Ensure phone length constraint (max 20 chars after normalization)
ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS chk_contact_phone_length;
ALTER TABLE public.contacts
  ADD CONSTRAINT chk_contact_phone_length
  CHECK (phone IS NULL OR length(phone) BETWEEN 4 AND 20);

-- 5. Ensure email format constraint
ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS chk_contact_email_format;
ALTER TABLE public.contacts
  ADD CONSTRAINT chk_contact_email_format
  CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- 6. LGPD opt-out must be after consent
ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS chk_lgpd_optout_after_consent;
ALTER TABLE public.contacts
  ADD CONSTRAINT chk_lgpd_optout_after_consent
  CHECK (
    lgpd_opt_out_at IS NULL
    OR lgpd_consent_at IS NULL
    OR lgpd_opt_out_at >= lgpd_consent_at
  );

-- 7. Marketing consent requires general consent
-- (Can't consent to marketing without general consent)
ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS chk_lgpd_marketing_requires_consent;
ALTER TABLE public.contacts
  ADD CONSTRAINT chk_lgpd_marketing_requires_consent
  CHECK (
    NOT lgpd_marketing_consent
    OR (lgpd_consent_at IS NOT NULL AND lgpd_opt_out_at IS NULL)
  );

-- 8. Workspace isolation: ensure workspace_id is never null
ALTER TABLE public.contacts
  ALTER COLUMN workspace_id SET NOT NULL;

-- 9. Create phone uniqueness function (normalized dedup at DB level)
CREATE OR REPLACE FUNCTION public.normalize_phone_for_unique(phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN phone IS NULL THEN NULL
    ELSE (
      -- Strip non-digits
      regexp_replace(
        -- Remove country code 55
        CASE
          WHEN regexp_replace(phone, '[^0-9]', '', 'g') ~ '^55\d{10,11}$'
          THEN right(regexp_replace(phone, '[^0-9]', '', 'g'), -2)
          ELSE regexp_replace(phone, '[^0-9]', '', 'g')
        END,
        '[^0-9]', '', 'g'
      )
    )
  END
$$;

-- Note: We don't add a UNIQUE constraint on normalized_phone because:
-- 1. One business may have multiple contacts (e.g., company with shared landline)
-- 2. Deduplication is done via find_duplicate_contacts() RPC + merge UI
-- 3. A unique constraint would block legitimate use cases

-- 10. Notify channel for real-time contact changes
-- (Supabase realtime already handles this via postgres_changes)
-- But ensure updated_at is always set:
CREATE OR REPLACE FUNCTION public.fn_contacts_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contacts_set_updated_at ON public.contacts;
CREATE TRIGGER trg_contacts_set_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW
  WHEN (NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at)
  EXECUTE FUNCTION public.fn_contacts_set_updated_at();

-- 11. Grant necessary permissions for the Edge Function service role
GRANT EXECUTE ON FUNCTION public.soft_delete_contact(uuid, text)          TO service_role;
GRANT EXECUTE ON FUNCTION public.bulk_soft_delete_contacts(uuid[], text)   TO service_role;
GRANT EXECUTE ON FUNCTION public.restore_contact(uuid)                     TO service_role;
GRANT EXECUTE ON FUNCTION public.search_contacts(text, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_duplicate_contacts(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_contact_versioned(uuid, integer, jsonb) TO authenticated;

-- 12. Comment all new columns for documentation
COMMENT ON COLUMN public.contacts.lgpd_consent_at        IS 'LGPD: Timestamp when contact gave general consent';
COMMENT ON COLUMN public.contacts.lgpd_consent_channel   IS 'LGPD: Channel through which consent was given';
COMMENT ON COLUMN public.contacts.lgpd_opt_out_at        IS 'LGPD: Timestamp when contact revoked consent';
COMMENT ON COLUMN public.contacts.lgpd_marketing_consent IS 'LGPD: Specific consent for marketing communications';
COMMENT ON COLUMN public.contacts.lgpd_data_sharing      IS 'LGPD: Specific consent for data sharing with partners';
COMMENT ON COLUMN public.contacts.lgpd_profiling         IS 'LGPD: Specific consent for profiling and personalization';
COMMENT ON COLUMN public.contacts.deleted_at             IS 'Soft delete timestamp (NULL = active)';
COMMENT ON COLUMN public.contacts.deleted_by             IS 'User who deleted the contact';
COMMENT ON COLUMN public.contacts.merged_from_id         IS 'ID of contact that was merged into this one';
COMMENT ON COLUMN public.contacts.phone_numbers          IS 'JSONB array of phone numbers with type/label/whatsapp flags';
COMMENT ON COLUMN public.contacts.version                IS 'Optimistic locking version counter';
COMMENT ON COLUMN public.contacts.search_vector          IS 'Generated full-text search vector (auto-updated)';
