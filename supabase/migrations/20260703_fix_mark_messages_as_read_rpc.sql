-- Migration: 20260703_fix_mark_messages_as_read_rpc.sql (v2)
-- Creates/replaces rpc_mark_messages_as_read with:
--   - SECURITY DEFINER (runs as function owner, not caller)
--   - SET search_path hardened (prevents search_path injection)
--   - REVOKE EXECUTE FROM PUBLIC (anon cannot call)
--   - GRANT to authenticated + service_role only
--   - AND deleted_at IS NULL (v2: excludes soft-deleted messages)
--
-- Root cause fixed: HTTP 400 "invalid input syntax for type uuid" when
-- selectedContactId is a WhatsApp JID (phone number) instead of a UUID.
-- The frontend guards in uuid.ts prevent non-UUIDs from reaching this RPC.

CREATE OR REPLACE FUNCTION public.rpc_mark_messages_as_read(p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'evo'
AS $$
BEGIN
  IF p_contact_id IS NULL THEN
    RAISE EXCEPTION 'rpc_mark_messages_as_read: p_contact_id cannot be null';
  END IF;

  UPDATE evo.evolution_messages
  SET
    is_read    = true,
    updated_at = now()
  WHERE contact_id = p_contact_id
    AND from_me    = false
    AND (is_read IS NULL OR is_read = false)
    AND deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_mark_messages_as_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_mark_messages_as_read(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.rpc_mark_messages_as_read(uuid) FROM PUBLIC;
