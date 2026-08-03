-- =============================================================================
-- Migration: 20260717_fix_dlq_mutation_rpcs_zapp_schema.sql
-- Fixes 5 DLQ mutation RPCs that remained in the public schema after
-- 20260716_fix_public_to_zapp_schema.sql, making them unreachable from the
-- frontend (supabase client sends Content-Profile: zapp).
--
-- Functions created/fixed:
--   1. zapp.rpc_dlq_retry_now          — single-item retry
--   2. zapp.rpc_dlq_abandon            — single-item abandon
--   3. zapp.rpc_dlq_bulk_abandon       — batch abandon
--   4. zapp.rpc_dlq_log_reprocess_trigger — audit: panel trigger
--   5. zapp.rpc_dlq_log_reprocess_result  — audit: edge-fn result
--   6. zapp.rpc_dlq_bulk_retry_now     — FIXED: wrong column next_retry_at
--                                        corrected to next_attempt_at
--
-- All mutation RPCs reference zapp.failed_messages directly (not the public
-- view) so they work correctly under SECURITY DEFINER + search_path = zapp.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. rpc_dlq_retry_now — force single item to retry immediately
--    Hook calls: supabase.rpc('rpc_dlq_retry_now', { p_id: id })
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.rpc_dlq_retry_now(
  p_id      uuid DEFAULT NULL,
  p_item_id uuid DEFAULT NULL   -- backwards-compat alias
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_target uuid;
  v_updated int;
BEGIN
  IF NOT (zapp.has_role(auth.uid(), 'admin') OR zapp.has_role(auth.uid(), 'supervisor')) THEN
    PERFORM zapp.log_rls_denied(
      'failed_messages', 'admin|supervisor',
      jsonb_build_object('rpc', 'rpc_dlq_retry_now', 'p_id', COALESCE(p_id, p_item_id))
    );
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_target := COALESCE(p_id, p_item_id);

  IF v_target IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE zapp.failed_messages
     SET status          = 'pending',
         next_attempt_at = now(),
         updated_at      = now()
   WHERE id     = v_target
     AND status IN ('pending', 'retrying', 'failed', 'abandoned');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_retry_now(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_retry_now(uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. rpc_dlq_abandon — mark single item as permanently abandoned
--    Hook calls: supabase.rpc('rpc_dlq_abandon', { p_id: id, p_reason: reason })
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.rpc_dlq_abandon(
  p_id      uuid DEFAULT NULL,
  p_item_id uuid DEFAULT NULL,  -- backwards-compat alias
  p_reason  text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_target uuid;
  v_reason text;
  v_updated int;
BEGIN
  IF NOT (zapp.has_role(auth.uid(), 'admin') OR zapp.has_role(auth.uid(), 'supervisor')) THEN
    PERFORM zapp.log_rls_denied(
      'failed_messages', 'admin|supervisor',
      jsonb_build_object('rpc', 'rpc_dlq_abandon', 'p_id', COALESCE(p_id, p_item_id))
    );
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_target := COALESCE(p_id, p_item_id);

  IF v_target IS NULL THEN
    RETURN FALSE;
  END IF;

  v_reason := NULLIF(TRIM(COALESCE(p_reason, '')), '');

  UPDATE zapp.failed_messages
     SET status        = 'abandoned',
         error_message = COALESCE(error_message, '') ||
                         ' [ABANDONED: ' || COALESCE(v_reason, 'no reason given') || ']',
         updated_at    = now()
   WHERE id     = v_target
     AND status NOT IN ('abandoned', 'succeeded');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_abandon(uuid, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_abandon(uuid, uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. rpc_dlq_bulk_abandon — batch abandon up to 500 items
--    Hook calls: supabase.rpc('rpc_dlq_bulk_abandon', { p_ids: ids, p_reason: reason })
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.rpc_dlq_bulk_abandon(
  p_ids    uuid[],
  p_reason text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_reason  text;
  v_updated int;
BEGIN
  IF NOT (zapp.has_role(auth.uid(), 'admin') OR zapp.has_role(auth.uid(), 'supervisor')) THEN
    PERFORM zapp.log_rls_denied(
      'failed_messages', 'admin|supervisor',
      jsonb_build_object('rpc', 'rpc_dlq_bulk_abandon', 'ids_count', array_length(p_ids, 1))
    );
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  IF array_length(p_ids, 1) > 500 THEN
    RAISE EXCEPTION 'Bulk operation limited to 500 rows per call';
  END IF;

  v_reason := NULLIF(TRIM(COALESCE(p_reason, '')), '');

  UPDATE zapp.failed_messages
     SET status        = 'abandoned',
         error_message = COALESCE(error_message, '') ||
                         ' [ABANDONED: ' || COALESCE(v_reason, 'bulk') || ']',
         updated_at    = now()
   WHERE id = ANY(p_ids)
     AND status NOT IN ('abandoned', 'succeeded');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_bulk_abandon(uuid[], text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_bulk_abandon(uuid[], text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. rpc_dlq_log_reprocess_trigger — audit: manual panel trigger
--    Hook calls via _rpc: 'rpc_dlq_log_reprocess_trigger', { p_source: 'panel' }
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.rpc_dlq_log_reprocess_trigger(
  p_source text DEFAULT 'panel'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  IF NOT (zapp.has_role(auth.uid(), 'admin') OR zapp.has_role(auth.uid(), 'supervisor')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'dlq_reprocess_trigger',
    'failed_messages',
    NULL,
    jsonb_build_object(
      'source',       COALESCE(NULLIF(TRIM(p_source), ''), 'panel'),
      'triggered_at', now()
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_log_reprocess_trigger(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_log_reprocess_trigger(text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. rpc_dlq_log_reprocess_result — audit: edge-fn execution result
--    Hook calls via _rpc: 'rpc_dlq_log_reprocess_result', { p_processed, ... }
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.rpc_dlq_log_reprocess_result(
  p_processed integer DEFAULT 0,
  p_succeeded integer DEFAULT 0,
  p_failed    integer DEFAULT 0,
  p_abandoned integer DEFAULT 0,
  p_message   text    DEFAULT NULL,
  p_source    text    DEFAULT 'panel'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  IF NOT (zapp.has_role(auth.uid(), 'admin') OR zapp.has_role(auth.uid(), 'supervisor')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'dlq_reprocess_result',
    'failed_messages',
    NULL,
    jsonb_build_object(
      'source',      COALESCE(NULLIF(TRIM(p_source), ''), 'panel'),
      'processed',   GREATEST(COALESCE(p_processed, 0), 0),
      'succeeded',   GREATEST(COALESCE(p_succeeded, 0), 0),
      'failed',      GREATEST(COALESCE(p_failed,    0), 0),
      'abandoned',   GREATEST(COALESCE(p_abandoned, 0), 0),
      'message',     p_message,
      'finished_at', now()
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_log_reprocess_result(integer, integer, integer, integer, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_log_reprocess_result(integer, integer, integer, integer, text, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Fix zapp.rpc_dlq_bulk_retry_now — column name was next_retry_at (wrong),
--    correct column is next_attempt_at; also fix search_path and table ref.
--    (Function already in zapp schema after 20260716 migration)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.rpc_dlq_bulk_retry_now(
  p_ids    uuid[],
  p_reason text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT (zapp.has_role(auth.uid(), 'admin') OR zapp.has_role(auth.uid(), 'supervisor')) THEN
    PERFORM zapp.log_rls_denied(
      'failed_messages', 'admin|supervisor',
      jsonb_build_object('rpc', 'rpc_dlq_bulk_retry_now', 'ids_count', array_length(p_ids, 1))
    );
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  IF array_length(p_ids, 1) > 500 THEN
    RAISE EXCEPTION 'Bulk operation limited to 500 rows per call';
  END IF;

  UPDATE zapp.failed_messages
     SET next_attempt_at = now(),
         status          = 'pending',
         updated_at      = now()
   WHERE id = ANY(p_ids)
     AND status IN ('pending', 'retrying', 'abandoned', 'failed');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_bulk_retry_now(uuid[], text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_bulk_retry_now(uuid[], text) TO authenticated;
