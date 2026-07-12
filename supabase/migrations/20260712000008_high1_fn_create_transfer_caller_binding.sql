-- ============================================================================
-- HIGH-1 gap (2026-07-12): Caller-binding validation for fn_create_transfer
--
-- PROBLEM (cubic-dev-ai P0 findings on migration 20260712000007)
-- -------
-- Migration 20260712000007 added auth.uid() IS NULL guard but left two
-- SECURITY DEFINER fn_create_transfer overloads without caller binding:
--
--   UUID overload: p_from_agent_id and p_conversation_id are unsanitized.
--     Any authenticated user could:
--       (a) impersonate another agent as the transfer originator
--       (b) create a transfer for a conversation not assigned to them
--
--   TEXT overload: p_source_instance is unsanitized.
--     Any authenticated user could claim any WhatsApp instance as the source.
--
-- SOLUTION
-- --------
--   UUID overload:
--     1. p_from_agent_id must belong to the calling user (profiles.user_id =
--        auth.uid()) OR caller must be admin/supervisor.
--     2. p_conversation_id must be assigned_to the calling user's profile
--        OR caller must be admin/supervisor.
--
--   TEXT overload:
--     p_source_instance must be a whatsapp_connections.instance_name whose
--     created_by profile has user_id = auth.uid(), OR caller must be
--     admin/supervisor (shared instance legitimately used by admin).
--
-- NOTE: profiles.id ≠ auth.uid().
--   auth.uid() = auth.users.id = profiles.user_id  (the FK column)
--   profiles.id = auto-generated UUID (the PK, referenced by FK columns)
--   conversation_transfers.from_agent_id REFERENCES profiles(id)
--   conversations.assigned_to REFERENCES profiles(id)
--   whatsapp_connections.created_by REFERENCES profiles(id)
--
-- IDEMPOTENT: CREATE OR REPLACE.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. fn_create_transfer — UUID-based overload with caller-binding validation
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_create_transfer(
    p_conversation_id UUID,
    p_from_agent_id   UUID,
    p_to_agent_id     UUID    DEFAULT NULL,
    p_to_queue_id     UUID    DEFAULT NULL,
    p_transfer_type   TEXT    DEFAULT 'direct',
    p_priority        TEXT    DEFAULT 'P3',
    p_context_summary TEXT    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_transfer_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;

    -- Caller binding: p_from_agent_id must be the calling user's profile
    -- unless the caller is an admin or supervisor who may act on behalf of
    -- another agent (e.g. supervisor-initiated transfer).
    IF p_from_agent_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = p_from_agent_id
              AND user_id = auth.uid()
        ) AND NOT public.is_admin_or_supervisor(auth.uid()) THEN
            PERFORM public.log_rls_denied(
                'conversation_transfers', 'agent_self_or_admin',
                jsonb_build_object(
                    'rpc', 'fn_create_transfer',
                    'p_from_agent_id', p_from_agent_id
                )
            );
            RAISE EXCEPTION 'forbidden: p_from_agent_id does not belong to calling user' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Conversation access: caller must be assigned to the conversation
    -- unless they are admin/supervisor.
    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.conversations c
            JOIN public.profiles p ON p.id = c.assigned_to
            WHERE c.id = p_conversation_id
              AND p.user_id = auth.uid()
        ) THEN
            PERFORM public.log_rls_denied(
                'conversation_transfers', 'conversation_owner_or_admin',
                jsonb_build_object(
                    'rpc', 'fn_create_transfer',
                    'p_conversation_id', p_conversation_id
                )
            );
            RAISE EXCEPTION 'forbidden: conversation not assigned to calling user' USING ERRCODE = '42501';
        END IF;
    END IF;

    INSERT INTO public.conversation_transfers (
        conversation_id,
        from_agent_id,
        to_agent_id,
        to_queue_id,
        transfer_type,
        priority,
        context_summary,
        sla_deadline
    ) VALUES (
        p_conversation_id,
        p_from_agent_id,
        p_to_agent_id,
        p_to_queue_id,
        p_transfer_type,
        p_priority,
        p_context_summary,
        CASE
            WHEN p_priority = 'P1' THEN NOW() + INTERVAL '15 minutes'
            WHEN p_priority = 'P2' THEN NOW() + INTERVAL '1 hour'
            WHEN p_priority = 'P3' THEN NOW() + INTERVAL '4 hours'
            ELSE NOW() + INTERVAL '24 hours'
        END
    ) RETURNING id INTO v_transfer_id;

    RETURN v_transfer_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. fn_create_transfer — TEXT/instance-based overload with instance binding
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_create_transfer(
    p_source_instance TEXT,
    p_target_instance TEXT,
    p_remote_jid       TEXT,
    p_reason           TEXT,
    p_category         TEXT,
    p_priority         INTEGER DEFAULT 2,
    p_transfer_type    TEXT    DEFAULT 'internal',
    p_source_operator  TEXT    DEFAULT NULL,
    p_context_summary  TEXT    DEFAULT NULL,
    p_tags             TEXT[]  DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_transfer_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;

    -- Instance binding: caller must have created the source instance (their
    -- profile's id = whatsapp_connections.created_by for instance_name =
    -- p_source_instance), or be an admin/supervisor who may use any instance.
    IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
        IF NOT EXISTS (
            SELECT 1
            FROM public.whatsapp_connections wc
            JOIN public.profiles p ON p.id = wc.created_by
            WHERE wc.instance_name = p_source_instance
              AND p.user_id = auth.uid()
        ) THEN
            PERFORM public.log_rls_denied(
                'conversation_transfers', 'instance_owner_or_admin',
                jsonb_build_object(
                    'rpc', 'fn_create_transfer_text',
                    'p_source_instance', p_source_instance
                )
            );
            RAISE EXCEPTION 'forbidden: caller not authorized for source_instance' USING ERRCODE = '42501';
        END IF;
    END IF;

    INSERT INTO public.conversation_transfers (
        source_instance, target_instance, remote_jid,
        reason, category, priority, transfer_type, source_operator,
        context_summary, tags, status, expires_at
    ) VALUES (
        p_source_instance, p_target_instance, p_remote_jid,
        p_reason, p_category, p_priority, p_transfer_type, p_source_operator,
        p_context_summary, p_tags, 'pending',
        CASE
            WHEN p_priority = 4 THEN NOW() + INTERVAL '2 hours'
            WHEN p_priority = 3 THEN NOW() + INTERVAL '4 hours'
            WHEN p_priority = 2 THEN NOW() + INTERVAL '8 hours'
            ELSE NOW() + INTERVAL '24 hours'
        END
    ) RETURNING id INTO v_transfer_id;

    RETURN v_transfer_id;
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
  WHERE n.nspname = 'public' AND p.proname = 'fn_create_transfer';

  IF v_count < 2 THEN
    RAISE EXCEPTION 'HIGH-1 caller-binding validation FAILED: expected ≥2 fn_create_transfer overloads, got %', v_count;
  END IF;

  RAISE NOTICE 'HIGH-1 caller-binding OK: fn_create_transfer (×%) with p_from_agent_id binding + instance binding.', v_count;
END;
$$;
