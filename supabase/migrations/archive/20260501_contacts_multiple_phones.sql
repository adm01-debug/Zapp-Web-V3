-- ============================================================
-- Migration: Multiple Phone Numbers per Contact
-- Purpose: Support personal, work, WhatsApp, landline numbers
-- ============================================================

-- 1. Add phone_numbers JSONB array column
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS phone_numbers jsonb DEFAULT '[]'::jsonb;

-- Migrate existing `phone` value into phone_numbers array
UPDATE public.contacts
SET phone_numbers = jsonb_build_array(
  jsonb_build_object(
    'number',  phone,
    'type',    'mobile',
    'label',   'Principal',
    'is_whatsapp', true,
    'is_primary',  true
  )
)
WHERE phone IS NOT NULL
  AND (phone_numbers IS NULL OR phone_numbers = '[]'::jsonb);

-- 2. Index for searching within JSONB phone_numbers
CREATE INDEX IF NOT EXISTS idx_contacts_phone_numbers
  ON public.contacts USING gin(phone_numbers);

-- 3. Validation function: ensure at least 1 valid phone in the array
CREATE OR REPLACE FUNCTION public.validate_phone_numbers(phone_numbers jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Must be an array
  IF jsonb_typeof(phone_numbers) != 'array' THEN
    RETURN false;
  END IF;

  -- Each element must have a non-empty 'number' field
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(phone_numbers) AS elem
    WHERE elem->>'number' IS NULL OR trim(elem->>'number') = ''
  ) THEN
    RETURN false;
  END IF;

  -- Max 10 phone numbers per contact
  IF jsonb_array_length(phone_numbers) > 10 THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- 4. Add check constraint
ALTER TABLE public.contacts
  DROP CONSTRAINT IF EXISTS chk_phone_numbers_valid;

ALTER TABLE public.contacts
  ADD CONSTRAINT chk_phone_numbers_valid
  CHECK (
    phone_numbers IS NULL
    OR phone_numbers = '[]'::jsonb
    OR validate_phone_numbers(phone_numbers)
  );

-- 5. Helper view: contacts with their phones unnested (for deduplication queries)
CREATE OR REPLACE VIEW public.v_contact_phones AS
SELECT
  c.id         AS contact_id,
  c.name       AS contact_name,
  c.workspace_id,
  p.value      ->> 'number'       AS phone_number,
  p.value      ->> 'type'         AS phone_type,
  p.value      ->> 'label'        AS phone_label,
  (p.value     ->> 'is_whatsapp')::boolean AS is_whatsapp,
  (p.value     ->> 'is_primary')::boolean  AS is_primary,
  regexp_replace(p.value ->> 'number', '[^0-9]', '', 'g') AS phone_normalized,
  p.ordinality AS position
FROM public.contacts c,
  LATERAL jsonb_array_elements(COALESCE(c.phone_numbers, '[]'::jsonb))
    WITH ORDINALITY AS p(value, ordinality)
WHERE c.deleted_at IS NULL;

-- 6. Duplicate detection: find contacts sharing the same normalized phone
CREATE OR REPLACE FUNCTION public.find_duplicate_contacts(
  p_workspace_id uuid
)
RETURNS TABLE (
  phone_normalized  text,
  contact_ids       uuid[],
  contact_names     text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cp.phone_normalized,
    array_agg(DISTINCT cp.contact_id ORDER BY cp.contact_id) AS contact_ids,
    array_agg(DISTINCT cp.contact_name ORDER BY cp.contact_name) AS contact_names
  FROM public.v_contact_phones cp
  WHERE cp.workspace_id = p_workspace_id
    AND cp.phone_normalized != ''
    AND length(cp.phone_normalized) >= 8
  GROUP BY cp.phone_normalized
  HAVING count(DISTINCT cp.contact_id) > 1
  ORDER BY count(DISTINCT cp.contact_id) DESC;
$$;
