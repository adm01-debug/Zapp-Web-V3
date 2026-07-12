-- ============================================================================
-- P0 FIX (2026-07-12): fn_accept_transfer UUID overload — transfer-poaching
--
-- PROBLEM (cubic-dev-ai P0, migration 20260712000009 line 120)
-- -------
-- Two vulnerabilities in the UUID overload of fn_accept_transfer:
--
--   (a) NULL bypass: the caller-binding guard was wrapped in
--       `IF p_agent_id IS NOT NULL`, so passing NULL skipped the guard
--       entirely. Any authenticated user could accept any pending transfer
--       and overwrite to_agent_id = NULL.
--
--   (b) Poaching: the UPDATE WHERE clause only filters on status = 'pending',
--       not on the existing to_agent_id. Agent A could claim a transfer
--       explicitly assigned to agent B by passing their own valid
--       p_agent_id — the guard passes (A owns A's profile) but the UPDATE
--       silently overwrites B's assignment.
--
-- SOLUTION
-- --------
-- Restructure the UUID overload into two paths:
--
--   Non-admin path:
--     1. p_agent_id MUST NOT be NULL (reject to prevent silent un-assign).
--     2. p_agent_id MUST belong to the calling user's profile.
--     3. UPDATE adds: AND (to_agent_id IS NULL OR to_agent_id = p_agent_id)
--        — can only accept unassigned or self-targeted transfers.
--
--   Admin/supervisor path:
--     No restriction on existing to_agent_id (supervisors may reassign).
--
-- IDEMPOTENT: CREATE OR REPLACE.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_accept_transfer(
    p_transfer_id UUID,
    p_agent_id    UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_conversation_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
        -- For non-admins:
        -- (a) p_agent_id must not be NULL — prevents silent clearing of to_agent_id
        -- (b) p_agent_id must belong to the calling user's own profile
        IF p_agent_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = p_agent_id
              AND user_id = auth.uid()
        ) THEN
            PERFORM public.log_rls_denied(
                'conversation_transfers', 'agent_self',
                jsonb_build_object(
                    'rpc', 'fn_accept_transfer',
                    'p_transfer_id', p_transfer_id,
                    'p_agent_id', p_agent_id
                )
            );
            RAISE EXCEPTION 'forbidden: p_agent_id must be own profile (not null)' USING ERRCODE = '42501';
        END IF;

        -- (c) Only accept transfers that are unassigned or already targeted to self
        --     Prevents poaching transfers assigned to a different agent
        UPDATE public.conversation_transfers
           SET status = 'accepted', to_agent_id = p_agent_id, accepted_at = NOW()
         WHERE id = p_transfer_id
           AND status = 'pending'
           AND (to_agent_id IS NULL OR to_agent_id = p_agent_id)
         RETURNING conversation_id INTO v_conversation_id;
    ELSE
        -- Admin / supervisor: may reassign any pending transfer regardless of
        -- existing to_agent_id (e.g. supervisor re-routes to a different agent)
        UPDATE public.conversation_transfers
           SET status = 'accepted', to_agent_id = p_agent_id, accepted_at = NOW()
         WHERE id = p_transfer_id AND status = 'pending'
         RETURNING conversation_id INTO v_conversation_id;
    END IF;

    IF FOUND THEN
        UPDATE public.contacts SET assigned_to = p_agent_id WHERE id = v_conversation_id;
        RETURN TRUE;
    END IF;
    RETURN FALSE;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Validate: function still exists with two args
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_accept_transfer'
      AND array_length(p.proargtypes, 1) = 2
  ) THEN
    RAISE EXCEPTION 'P0 fix FAILED: fn_accept_transfer(UUID,UUID) not found';
  END IF;

  RAISE NOTICE 'P0 fix OK: fn_accept_transfer(UUID,UUID) with poach-guard deployed.';
END;
$$;
