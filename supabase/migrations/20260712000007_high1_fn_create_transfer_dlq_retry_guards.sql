-- ============================================================================
-- HIGH-1 gap (2026-07-12): Add role guards to fn_create_transfer overloads and
-- restore has_role guard to rpc_dlq_retry_now (removed by 20260521104847).
--
-- PROBLEM
-- -------
-- Two functions remained callable by any authenticated user without internal
-- role checks (HIGH-1 from AUDITORIA_BACKEND_SENIOR_2026-07-11.md):
--
--   1. fn_create_transfer (2 overloads, 20260520162325 / 20260520143901):
--      INSERT into conversation_transfers with no auth.uid() guard —
--      an unauthenticated session_role that somehow gets an anon JWT can also
--      call it when RLS is absent or misconfigured.
--
--   2. rpc_dlq_retry_now (20260521104847 overrode the guarded 20260423173400
--      version with an unguarded body). Any authenticated user can now re-queue
--      any failed_messages row, including rows of other tenants.
--
-- SOLUTION
-- --------
--   fn_create_transfer: require auth.uid() IS NOT NULL (any authenticated caller;
--     transfers are a workflow action — agents, supervisors, admins all need it;
--     table-level RLS bounds what rows they can insert/read).
--
--   rpc_dlq_retry_now: restore admin-only guard (consistent with the original
--     implementation and rpc_dlq_abandon which still has the guard).
--
-- IDEMPOTENT: CREATE OR REPLACE.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. fn_create_transfer — legacy TEXT-based overload (20260520162325)
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
-- 2. fn_create_transfer — UUID-based overload (20260520143901)
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
-- 3. rpc_dlq_retry_now — restore admin guard (removed by 20260521104847)
--    Unify into single overload that accepts both param names for back-compat.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_dlq_retry_now(
    p_item_id UUID DEFAULT NULL,
    p_id      UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
        PERFORM public.log_rls_denied(
            'failed_messages', 'admin',
            jsonb_build_object('rpc', 'rpc_dlq_retry_now', 'target_id', COALESCE(p_item_id, p_id))
        );
        RAISE EXCEPTION 'forbidden: admin role required' USING ERRCODE = '42501';
    END IF;

    UPDATE public.failed_messages
       SET next_retry_at = now(), status = 'pending'
     WHERE id = COALESCE(p_item_id, p_id);

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
  WHERE n.nspname = 'public' AND p.proname IN ('fn_create_transfer', 'rpc_dlq_retry_now');

  IF v_count < 3 THEN
    RAISE EXCEPTION 'HIGH-1 validation FAILED: expected ≥3 matching functions, got %', v_count;
  END IF;

  RAISE NOTICE 'HIGH-1 OK: fn_create_transfer (×2) + rpc_dlq_retry_now guarded.';
END;
$$;
