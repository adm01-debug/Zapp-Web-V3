-- =============================================================================
-- Migration: 20260703_fix_mark_messages_as_read_rpc.sql
-- =============================================================================
-- Creates a SECURITY DEFINER RPC that atomically marks all inbound messages
-- for a given contact UUID as read in evo.evolution_messages.
--
-- Column mapping:
--   public.messages.sender = 'contact'  -> evo.evolution_messages.from_me = false
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rpc_mark_messages_as_read(
  p_contact_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'evo'
AS $$
BEGIN
  IF p_contact_id IS NULL THEN
    RAISE EXCEPTION 'rpc_mark_messages_as_read: p_contact_id cannot be null';
  END IF;

  -- Note: (is_read IS NULL OR is_read = false) is a defensive guard.
  -- evo.evolution_messages.is_read is NOT NULL DEFAULT false, so IS NULL
  -- is a dead branch in practice (0 null rows in 1.8M+ messages as of 2026-07-03).
  UPDATE evo.evolution_messages
  SET
    is_read    = true,
    updated_at = now()
  WHERE contact_id = p_contact_id
    AND from_me    = false
    AND (is_read IS NULL OR is_read = false);
END;
$$;

-- Allow authenticated (logged-in) users to call this function.
GRANT EXECUTE ON FUNCTION public.rpc_mark_messages_as_read(uuid) TO authenticated;

-- Revoke from PUBLIC (anon included) to prevent unauthenticated callers
-- from marking messages as read without a JWT token.
-- Audit S3-T1 found PUBLIC had EXECUTE via PostgreSQL default grant.
REVOKE EXECUTE ON FUNCTION public.rpc_mark_messages_as_read(uuid) FROM PUBLIC;

COMMENT ON FUNCTION public.rpc_mark_messages_as_read(uuid) IS
  'Marks all inbound (from_me=false) messages for a contact as read. SECURITY DEFINER. Authenticated only (PUBLIC revoked).';
