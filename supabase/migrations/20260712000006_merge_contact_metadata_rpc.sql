-- ============================================================================
-- MED-8 (2026-07-12): Atomic server-side JSONB merge for contact metadata
--
-- PROBLEM
-- -------
-- evolution-webhook-handlers.ts merged chat metadata (wa_pinned, wa_muted,
-- wa_archived, wa_not_spam) on the client side:
--   const existingMeta = contact.metadata ?? {};
--   contactUpdate.metadata = { ...existingMeta, ...metaOverlay };
-- Two concurrent chats.* events for the same contact race: the last writer
-- wins and silently drops the other's keys.
--
-- SOLUTION
-- --------
-- A SECURITY DEFINER SQL function that performs the merge atomically in one
-- UPDATE using the JSONB || operator, which is evaluated inside Postgres while
-- holding a row-level lock. The edge function calls this via supabase.rpc()
-- without needing to read metadata first.
--
-- IDEMPOTENT: CREATE OR REPLACE.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.merge_contact_metadata(
  p_contact_id uuid,
  p_overlay    jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE contacts
  SET metadata   = COALESCE(metadata, '{}'::jsonb) || p_overlay,
      updated_at = now()
  WHERE id = p_contact_id;
$$;

REVOKE EXECUTE ON FUNCTION public.merge_contact_metadata(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.merge_contact_metadata(uuid, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.merge_contact_metadata(uuid, jsonb) FROM anon;
-- service_role must be granted back explicitly after revoking PUBLIC (which service_role
-- inherits from). Edge functions call this via supabase.rpc() with the service_role key.
GRANT  EXECUTE ON FUNCTION public.merge_contact_metadata(uuid, jsonb) TO   service_role;

COMMENT ON FUNCTION public.merge_contact_metadata(uuid, jsonb) IS
  'MED-8 (2026-07-12): Atomically merges p_overlay into contacts.metadata '
  'using JSONB || operator (server-side, inside row lock). '
  'Called by evolution-webhook-handlers.ts for chat state updates '
  '(wa_pinned, wa_muted, wa_archived, wa_not_spam). '
  'Not callable by PUBLIC/authenticated/anon — service_role only (edge functions).';

-- ──────────────────────────────────────────────────────────────────────────────
-- Validate
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'merge_contact_metadata';

  IF v_count = 0 THEN
    RAISE EXCEPTION 'MED-8 validation FAILED: merge_contact_metadata not found';
  END IF;

  RAISE NOTICE 'MED-8 OK: merge_contact_metadata created as atomic JSONB merge RPC.';
END;
$$;
