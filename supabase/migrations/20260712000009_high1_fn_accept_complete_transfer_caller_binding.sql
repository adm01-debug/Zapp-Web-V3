-- ============================================================================
-- HIGH-1 gap (2026-07-12): Caller-binding validation for fn_accept_transfer
--                          and fn_complete_transfer
--
-- PROBLEM (audit AUDITORIA_BACKEND_SENIOR_2026-07-11.md HIGH-1)
-- -------
-- fn_accept_transfer and fn_complete_transfer are SECURITY DEFINER functions
-- with only an auth.uid() IS NULL guard (added by 20260711134126). Any
-- authenticated user can:
--   (a) Accept a transfer meant for another agent by passing a foreign
--       p_agent_id (UUID overload).
--   (b) Complete a transfer they did not accept.
--   (c) Accept any transfer using any operator name (TEXT overload).
--
-- SOLUTION
-- --------
--   fn_accept_transfer TEXT overload:
--     p_operator is a free-form string (WPP2/Evolution instance operator);
--     it cannot be bound directly to a profile. Require admin/supervisor to
--     prevent arbitrary agents from poaching cross-instance transfers.
--
--   fn_accept_transfer UUID overload:
--     p_agent_id must belong to the calling user's profile
--     (profiles.id = p_agent_id AND profiles.user_id = auth.uid())
--     OR caller must be admin/supervisor (supervisor assigns to another agent).
--
--   fn_complete_transfer (both overloads):
--     The transfer's to_agent_id must belong to the calling user's profile
--     (profiles.id = ct.to_agent_id AND profiles.user_id = auth.uid())
--     OR caller must be admin/supervisor.
--     When to_agent_id IS NULL (TEXT-routed transfer with only target_operator
--     set), the JOIN returns no rows → requires admin/supervisor.
--
-- NOTE: profiles.id ≠ auth.uid().
--   auth.uid() = auth.users.id = profiles.user_id  (FK column)
--   profiles.id = auto-generated UUID (PK, referenced by FK columns)
--   conversation_transfers.to_agent_id REFERENCES profiles(id)
--
-- IDEMPOTENT: CREATE OR REPLACE.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. fn_accept_transfer — TEXT/operator overload: admin/supervisor only
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_accept_transfer(
    p_transfer_id UUID,
    p_operator    TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;

    -- TEXT operator is a free-form string; cannot be caller-bound to a profile.
    -- Accepting a transfer on behalf of a named operator is an admin/supervisor action.
    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
        PERFORM public.log_rls_denied(
            'conversation_transfers', 'admin_or_supervisor',
            jsonb_build_object(
                'rpc', 'fn_accept_transfer',
                'p_transfer_id', p_transfer_id,
                'p_operator', p_operator
            )
        );
        RAISE EXCEPTION 'forbidden: admin or supervisor required to accept transfer by operator name' USING ERRCODE = '42501';
    END IF;

    UPDATE public.conversation_transfers
       SET status = 'accepted', target_operator = p_operator, accepted_at = NOW()
     WHERE id = p_transfer_id AND status = 'pending';
    RETURN FOUND;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. fn_accept_transfer — UUID/agent overload with caller-binding
-- ─────────────────────────────────────────────────────────────────────────────
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

    -- Caller binding: agent can only accept on behalf of their own profile
    -- unless they are admin/supervisor (e.g. supervisor assigns to another agent).
    IF p_agent_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = p_agent_id
              AND user_id = auth.uid()
        ) AND NOT public.is_admin_or_supervisor(auth.uid()) THEN
            PERFORM public.log_rls_denied(
                'conversation_transfers', 'agent_self_or_admin',
                jsonb_build_object(
                    'rpc', 'fn_accept_transfer',
                    'p_transfer_id', p_transfer_id,
                    'p_agent_id', p_agent_id
                )
            );
            RAISE EXCEPTION 'forbidden: p_agent_id does not belong to calling user' USING ERRCODE = '42501';
        END IF;
    END IF;

    UPDATE public.conversation_transfers
       SET status = 'accepted', to_agent_id = p_agent_id, accepted_at = NOW()
     WHERE id = p_transfer_id AND status = 'pending'
     RETURNING conversation_id INTO v_conversation_id;

    IF FOUND THEN
        UPDATE public.contacts SET assigned_to = p_agent_id WHERE id = v_conversation_id;
        RETURN TRUE;
    END IF;
    RETURN FALSE;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. fn_complete_transfer — single-arg overload with caller-binding
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_complete_transfer(p_transfer_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;

    -- Caller binding: only the accepting agent (to_agent_id = caller's profile)
    -- or admin/supervisor may complete a transfer.
    -- When to_agent_id IS NULL (TEXT-routed transfer), the JOIN returns no rows
    -- → admin/supervisor required.
    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.conversation_transfers ct
            JOIN public.profiles p ON p.id = ct.to_agent_id
            WHERE ct.id = p_transfer_id
              AND p.user_id = auth.uid()
        ) THEN
            PERFORM public.log_rls_denied(
                'conversation_transfers', 'transfer_owner_or_admin',
                jsonb_build_object('rpc', 'fn_complete_transfer', 'p_transfer_id', p_transfer_id)
            );
            RAISE EXCEPTION 'forbidden: caller is not the accepting agent for this transfer' USING ERRCODE = '42501';
        END IF;
    END IF;

    UPDATE public.conversation_transfers
       SET status = 'completed', completed_at = NOW()
     WHERE id = p_transfer_id AND status = 'accepted';
    RETURN FOUND;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. fn_complete_transfer — notes overload with caller-binding
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_complete_transfer(
    p_transfer_id UUID,
    p_notes       TEXT,
    p_type        TEXT DEFAULT 'resolved'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;

    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.conversation_transfers ct
            JOIN public.profiles p ON p.id = ct.to_agent_id
            WHERE ct.id = p_transfer_id
              AND p.user_id = auth.uid()
        ) THEN
            PERFORM public.log_rls_denied(
                'conversation_transfers', 'transfer_owner_or_admin',
                jsonb_build_object('rpc', 'fn_complete_transfer_notes', 'p_transfer_id', p_transfer_id)
            );
            RAISE EXCEPTION 'forbidden: caller is not the accepting agent for this transfer' USING ERRCODE = '42501';
        END IF;
    END IF;

    UPDATE public.conversation_transfers
        SET status = 'completed',
            resolution_notes = p_notes,
            resolution_type = p_type,
            completed_at = NOW()
      WHERE id = p_transfer_id AND status IN ('accepted', 'in_progress');
    RETURN FOUND;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Validate
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('fn_accept_transfer', 'fn_complete_transfer');

  IF v_count < 4 THEN
    RAISE EXCEPTION 'HIGH-1 caller-binding FAILED: expected ≥4 fn_accept/complete overloads, got %', v_count;
  END IF;

  RAISE NOTICE 'HIGH-1 OK: fn_accept_transfer (×2) + fn_complete_transfer (×2) caller-bound.';
END;
$$;
