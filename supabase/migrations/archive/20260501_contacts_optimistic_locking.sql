-- ============================================================
-- Migration: Optimistic Locking for Contacts
-- Purpose: Prevent concurrent edit conflicts (last-write-wins)
-- When two agents edit the same contact simultaneously,
-- the second save is rejected with a clear error message.
-- ============================================================

-- 1. Add version column (optimistic lock counter)
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- 2. Create trigger to auto-increment version on update
CREATE OR REPLACE FUNCTION public.fn_contacts_increment_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.version := COALESCE(OLD.version, 0) + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contacts_increment_version ON public.contacts;
CREATE TRIGGER trg_contacts_increment_version
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_contacts_increment_version();

-- 3. RPC: update_contact_versioned — rejects stale updates
CREATE OR REPLACE FUNCTION public.update_contact_versioned(
  p_contact_id     uuid,
  p_expected_version integer,
  p_updates        jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_version integer;
  v_result          jsonb;
BEGIN
  -- Check current version matches expected
  SELECT version INTO v_current_version
  FROM public.contacts
  WHERE id = p_contact_id
    AND deleted_at IS NULL
    AND workspace_id = (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    )
  FOR UPDATE;  -- row-level lock

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTACT_NOT_FOUND: Contact % not found', p_contact_id;
  END IF;

  IF v_current_version != p_expected_version THEN
    -- Fetch the conflicting values for UI display
    SELECT jsonb_build_object(
      'error',            'CONFLICT',
      'message',          'Este contato foi modificado por outro usuário. Recarregue e tente novamente.',
      'current_version',  version,
      'your_version',     p_expected_version,
      'last_updated_by',  (SELECT full_name FROM public.profiles WHERE id = (SELECT updated_by FROM public.contacts WHERE id = p_contact_id)),
      'last_updated_at',  updated_at
    ) INTO v_result
    FROM public.contacts WHERE id = p_contact_id;

    RETURN v_result;
  END IF;

  -- Safe to update — versions match
  UPDATE public.contacts
  SET
    name    = COALESCE((p_updates->>'name')::text,    name),
    phone   = COALESCE((p_updates->>'phone')::text,   phone),
    email   = COALESCE((p_updates->>'email')::text,   email),
    company = COALESCE((p_updates->>'company')::text, company),
    notes   = COALESCE((p_updates->>'notes')::text,   notes),
    tags    = CASE WHEN p_updates ? 'tags' THEN
                ARRAY(SELECT jsonb_array_elements_text(p_updates->'tags'))
              ELSE tags END,
    custom_fields = CASE WHEN p_updates ? 'custom_fields' THEN
                      p_updates->'custom_fields'
                    ELSE custom_fields END,
    updated_by = auth.uid()
  WHERE id = p_contact_id;

  -- Return success with new version
  SELECT jsonb_build_object(
    'success', true,
    'version', version,
    'updated_at', updated_at
  ) INTO v_result
  FROM public.contacts WHERE id = p_contact_id;

  RETURN v_result;
END;
$$;

-- 4. Add updated_by column to contacts
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
