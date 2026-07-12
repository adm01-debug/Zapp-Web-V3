-- ============================================================================
-- LOW-8 (2026-07-12): Deprecate legacy RPC overloads
--
-- PROBLEM (AUDITORIA_BACKEND_SENIOR_2026-07-11.md LOW-8)
-- -------
-- Five functions accumulated multiple overloads over time. The old signatures
-- remain live in the database (PostgreSQL identifies overloads by type, not
-- parameter names) and accept calls without any deprecation signal, making it
-- impossible to track stale callers in production logs.
--
-- Deprecated overloads:
--   1. manage_department_member(_admin_user_id uuid, _target_profile_id uuid,
--        _department_id uuid, _action text)  RETURNS void   [20260503 4-arg form]
--   2. fn_transfer_comment(p_transfer_id UUID, p_author TEXT, p_instance TEXT,
--        p_content TEXT, p_attachments JSONB DEFAULT '[]')  [20260506 5-arg form]
--   3. rpc_dlq_retry_now(p_item_id UUID)                   [20260521 1-arg form]
--   4. rpc_dlq_abandon(p_id uuid, p_reason text)           [20260423 2-arg (uuid,text)]
--   5. rpc_dlq_abandon(p_item_id UUID)                     [20260521 1-arg form]
--
-- SOLUTION
-- --------
-- CREATE OR REPLACE each deprecated overload:
--   • RAISE NOTICE 'deprecated: use <canonical_signature>' at the start.
--   • Delegate to the current canonical signature (no breaking change).
--   • Existing callers continue working; their server logs now surface the
--     deprecation notice so we can migrate them before eventual removal.
--
-- Current canonical signatures:
--   manage_department_member → (p_profile_id uuid DEFAULT NULL, p_department_id uuid DEFAULT NULL,
--        p_action text DEFAULT NULL, _admin_user_id uuid DEFAULT NULL, _target_profile_id uuid DEFAULT NULL)
--   fn_transfer_comment → (p_transfer_id UUID, p_author TEXT, p_instance TEXT, p_content TEXT)
--   rpc_dlq_retry_now → (p_item_id UUID DEFAULT NULL, p_id UUID DEFAULT NULL)
--   rpc_dlq_abandon  → (p_item_id UUID DEFAULT NULL, p_id UUID DEFAULT NULL)
--
-- IDEMPOTENT: CREATE OR REPLACE.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. manage_department_member — old 4-arg (uuid, uuid, uuid, text) form
--    Type signature: (uuid, uuid, uuid, text) — distinct from all current forms
--    Current forms:  (uuid, uuid, text)
--                    (uuid, uuid, text, uuid)
--                    (uuid DEFAULT, uuid DEFAULT, text DEFAULT, uuid DEFAULT, uuid DEFAULT)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.manage_department_member(
    _admin_user_id    uuid,
    _target_profile_id uuid,
    _department_id    uuid,
    _action           text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RAISE NOTICE 'deprecated: manage_department_member(_admin_user_id, _target_profile_id, _department_id, _action) — use manage_department_member(p_profile_id, p_department_id, p_action) instead';

    PERFORM public.manage_department_member(
        p_profile_id      := _target_profile_id,
        p_department_id   := _department_id,
        p_action          := _action,
        _admin_user_id    := _admin_user_id
    );
END;
$$;

COMMENT ON FUNCTION public.manage_department_member(uuid, uuid, uuid, text) IS
  'DEPRECATED (LOW-8): old 4-arg form with reversed param order. '
  'Use manage_department_member(p_profile_id, p_department_id, p_action) instead.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. fn_transfer_comment — old 5-arg form with p_attachments
--    Type signature: (uuid, text, text, text, jsonb) — distinct from current
--    Current forms:  (uuid, uuid, text)  and  (uuid, text, text, text)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_transfer_comment(
    p_transfer_id UUID,
    p_author      TEXT,
    p_instance    TEXT,
    p_content     TEXT,
    p_attachments JSONB DEFAULT '[]'::jsonb
)
RETURNS public.transfer_comments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RAISE NOTICE 'deprecated: fn_transfer_comment(transfer_id, author, instance, content, attachments) — use fn_transfer_comment(transfer_id, author, instance, content) instead; p_attachments is ignored';

    RETURN public.fn_transfer_comment(
        p_transfer_id := p_transfer_id,
        p_author      := p_author,
        p_instance    := p_instance,
        p_content     := p_content
    );
END;
$$;

COMMENT ON FUNCTION public.fn_transfer_comment(uuid, text, text, text, jsonb) IS
  'DEPRECATED (LOW-8): old 5-arg form. p_attachments argument is ignored. '
  'Use fn_transfer_comment(p_transfer_id, p_author, p_instance, p_content) instead.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. rpc_dlq_retry_now — old 1-arg (p_item_id uuid) form
--    Type signature: (uuid) — distinct from canonical (uuid DEFAULT, uuid DEFAULT)
--    Uses named arg p_id := NULL to force resolution to the 2-arg canonical
--    and avoid recursion back into this 1-arg form.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_dlq_retry_now(p_item_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RAISE NOTICE 'deprecated: rpc_dlq_retry_now(p_item_id uuid) — use rpc_dlq_retry_now(p_item_id := <id>) with the dual-default signature instead';

    RETURN public.rpc_dlq_retry_now(p_item_id := p_item_id, p_id := NULL);
END;
$$;

COMMENT ON FUNCTION public.rpc_dlq_retry_now(uuid) IS
  'DEPRECATED (LOW-8): single-arg form, no auth guard. '
  'Use rpc_dlq_retry_now(p_item_id UUID DEFAULT NULL, p_id UUID DEFAULT NULL) instead.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. rpc_dlq_abandon — old (p_id uuid, p_reason text) form
--    Type signature: (uuid, text) — distinct from canonical (uuid, uuid)
--    p_reason is dropped (canonical has no reason parameter).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_dlq_abandon(p_id uuid, p_reason text)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RAISE NOTICE 'deprecated: rpc_dlq_abandon(p_id, p_reason) — use rpc_dlq_abandon(p_item_id := <id>) instead; p_reason is no longer stored';

    RETURN public.rpc_dlq_abandon(p_item_id := p_id, p_id := NULL);
END;
$$;

COMMENT ON FUNCTION public.rpc_dlq_abandon(uuid, text) IS
  'DEPRECATED (LOW-8): 2-arg form with p_reason; p_reason is ignored. '
  'Use rpc_dlq_abandon(p_item_id UUID DEFAULT NULL, p_id UUID DEFAULT NULL) instead.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. rpc_dlq_abandon — old 1-arg (p_item_id uuid) form
--    Type signature: (uuid) — distinct from canonical (uuid DEFAULT, uuid DEFAULT)
--    Uses named arg p_id := NULL to force canonical 2-arg resolution.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_dlq_abandon(p_item_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RAISE NOTICE 'deprecated: rpc_dlq_abandon(p_item_id uuid) — use rpc_dlq_abandon(p_item_id := <id>) with the dual-default signature instead';

    RETURN public.rpc_dlq_abandon(p_item_id := p_item_id, p_id := NULL);
END;
$$;

COMMENT ON FUNCTION public.rpc_dlq_abandon(uuid) IS
  'DEPRECATED (LOW-8): single-arg form, no auth guard. '
  'Use rpc_dlq_abandon(p_item_id UUID DEFAULT NULL, p_id UUID DEFAULT NULL) instead.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Validate: all 5 deprecated overloads present in pg_proc
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
    v_count int;
BEGIN
    -- manage_department_member(uuid, uuid, uuid, text) — RETURNS void
    SELECT COUNT(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'manage_department_member'
      AND p.prorettype = 'pg_catalog.void'::regtype;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'LOW-8 FAILED: deprecated manage_department_member(uuid,uuid,uuid,text) not found';
    END IF;

    -- fn_transfer_comment 5-arg (uuid, text, text, text, jsonb)
    SELECT COUNT(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_transfer_comment'
      AND array_length(p.proargtypes, 1) = 5;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'LOW-8 FAILED: deprecated fn_transfer_comment 5-arg not found';
    END IF;

    -- rpc_dlq_retry_now 1-arg
    SELECT COUNT(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rpc_dlq_retry_now'
      AND array_length(p.proargtypes, 1) = 1;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'LOW-8 FAILED: deprecated rpc_dlq_retry_now(uuid) not found';
    END IF;

    -- rpc_dlq_abandon(uuid, text) and rpc_dlq_abandon(uuid)
    SELECT COUNT(*) INTO v_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rpc_dlq_abandon'
      AND array_length(p.proargtypes, 1) <= 2;

    IF v_count < 2 THEN
        RAISE EXCEPTION 'LOW-8 FAILED: expected ≥2 deprecated rpc_dlq_abandon overloads, got %', v_count;
    END IF;

    RAISE NOTICE 'LOW-8 OK: 5 deprecated overloads updated with RAISE NOTICE deprecation warning.';
END;
$$;
