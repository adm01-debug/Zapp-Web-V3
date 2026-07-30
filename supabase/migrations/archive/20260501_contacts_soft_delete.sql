-- ============================================================
-- Migration: Soft Delete for Contacts
-- Purpose: Prevent accidental permanent deletion.
--          All deletes are reversible for 30 days.
-- ============================================================

-- 1. Add soft-delete columns to contacts table
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS deleted_at       timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_reason   text        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS merged_from_id   uuid        REFERENCES public.contacts(id) ON DELETE SET NULL;

-- Index for fast "active contacts only" queries
CREATE INDEX IF NOT EXISTS idx_contacts_not_deleted
  ON public.contacts (deleted_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_deleted
  ON public.contacts (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- 2. Update RLS policies to exclude soft-deleted contacts from normal queries

-- Drop existing policies that don't filter deleted contacts
DO $$
DECLARE
  pol text;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'contacts' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.contacts', pol);
  END LOOP;
END
$$;

-- Re-create: agents see only active contacts in their workspace
CREATE POLICY "contacts_select_active"
  ON public.contacts FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND workspace_id = (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Admins/managers can see deleted contacts (for restoration)
CREATE POLICY "contacts_select_deleted_by_admins"
  ON public.contacts FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NOT NULL
    AND workspace_id = (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin', 'supervisor', 'manager')
    )
  );

CREATE POLICY "contacts_insert"
  ON public.contacts FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id = (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "contacts_update"
  ON public.contacts FOR UPDATE
  TO authenticated
  USING (
    deleted_at IS NULL
    AND workspace_id = (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Block hard deletes entirely — use soft delete only
CREATE POLICY "contacts_no_hard_delete"
  ON public.contacts FOR DELETE
  TO authenticated
  USING (false);

-- Service role still has full access
CREATE POLICY "contacts_service_role"
  ON public.contacts FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 3. RPC: soft_delete_contact
CREATE OR REPLACE FUNCTION public.soft_delete_contact(
  p_contact_id uuid,
  p_reason     text DEFAULT 'manual_deletion'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.contacts
  SET
    deleted_at     = now(),
    deleted_by     = auth.uid(),
    deleted_reason = p_reason,
    updated_at     = now()
  WHERE id = p_contact_id
    AND deleted_at IS NULL
    AND workspace_id = (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact % not found or already deleted', p_contact_id;
  END IF;
END;
$$;

-- 4. RPC: bulk_soft_delete_contacts
CREATE OR REPLACE FUNCTION public.bulk_soft_delete_contacts(
  p_contact_ids uuid[],
  p_reason      text DEFAULT 'bulk_deletion'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Chunk safety: refuse if > 500 contacts at once
  IF array_length(p_contact_ids, 1) > 500 THEN
    RAISE EXCEPTION 'Maximum 500 contacts per bulk operation. Got: %', array_length(p_contact_ids, 1);
  END IF;

  UPDATE public.contacts
  SET
    deleted_at     = now(),
    deleted_by     = auth.uid(),
    deleted_reason = p_reason,
    updated_at     = now()
  WHERE id = ANY(p_contact_ids)
    AND deleted_at IS NULL
    AND workspace_id = (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 5. RPC: restore_contact (within 30 days)
CREATE OR REPLACE FUNCTION public.restore_contact(
  p_contact_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only managers/admins can restore
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'supervisor', 'manager')
  ) THEN
    RAISE EXCEPTION 'Permission denied: only managers can restore contacts';
  END IF;

  UPDATE public.contacts
  SET
    deleted_at     = NULL,
    deleted_by     = NULL,
    deleted_reason = NULL,
    updated_at     = now()
  WHERE id = p_contact_id
    AND deleted_at IS NOT NULL
    AND deleted_at >= now() - interval '30 days'
    AND workspace_id = (
      SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact % not found, not deleted, or outside 30-day recovery window', p_contact_id;
  END IF;
END;
$$;

-- 6. Scheduled purge: permanently delete contacts soft-deleted > 30 days ago
-- (Run via pg_cron or Supabase Edge Function cron)
CREATE OR REPLACE FUNCTION public.purge_old_deleted_contacts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Only purge contacts merged or deleted > 30 days ago
  DELETE FROM public.contacts
  WHERE deleted_at IS NOT NULL
    AND deleted_at < now() - interval '30 days';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
