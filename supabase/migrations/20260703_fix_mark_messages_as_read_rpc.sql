-- =============================================================================
-- Migration: 20260703_fix_mark_messages_as_read_rpc.sql
-- =============================================================================
-- Creates a SECURITY DEFINER RPC that atomically marks all inbound messages
-- for a given contact UUID as read in evo.evolution_messages.
--
-- Why this RPC exists:
--   The public.messages VIEW has an INSTEAD OF UPDATE trigger
--   (messages_update_trigger) that correctly handles is_read updates, but:
--     1. evo.evolution_messages has no UPDATE RLS policy for 'authenticated'.
--        The SECURITY DEFINER trigger bypasses this at trigger time, but the
--        view-based path is fragile and non-idiomatic for this codebase.
--     2. A non-UUID contact_id (e.g. a WhatsApp JID) would still fail at
--        the PostgreSQL type-cast stage in the WHERE clause before the trigger
--        fires (PostgreSQL must cast the literal to uuid to evaluate the WHERE).
--
--   Per the architecture note in registry.ts:
--   "TODA leitura/escrita de domínio em FATOR X deve usar RPC SECURITY DEFINER".
--   The frontend UUID guard (isValidUUID in useRealtimeMessages.ts) is the
--   primary 400-fix; this RPC is the follow-up architectural hardening.
--
-- Column mapping:
--   public.messages.sender = 'contact'  ↔  evo.evolution_messages.from_me = false
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

  UPDATE evo.evolution_messages
  SET
    is_read    = true,
    updated_at = now()
  WHERE contact_id = p_contact_id
    AND from_me    = false              -- sender = 'contact' in view terms
    AND (is_read IS NULL OR is_read = false);
  -- Returns void; caller does optimistic in-memory update immediately.
END;
$$;

-- Grant execution to authenticated (logged-in) users.
GRANT EXECUTE ON FUNCTION public.rpc_mark_messages_as_read(uuid) TO authenticated;

COMMENT ON FUNCTION public.rpc_mark_messages_as_read(uuid) IS
  'Marks all inbound (from_me=false) messages for a contact as read in '
  'evo.evolution_messages. SECURITY DEFINER bypasses the missing UPDATE '
  'RLS policy on the evo schema. Called by markAsRead() in '
  'useRealtimeMessages.ts after the UUID guard passes.';
