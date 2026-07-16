-- Fix: rpc_list_failed_messages_cursor had 3 critical bugs:
--
-- 1) RETURNS TABLE only listed 9 columns, but FailedMessageRow (client) expects 15.
--    Missing: remote_jid, payload, error_code, http_status, max_retries,
--             last_attempt_at, succeeded_at, updated_at.
--
-- 2) Column name mismatch: function used `next_retry_at` but public.failed_messages
--    has `next_attempt_at` and FailedMessageRow uses `next_attempt_at`.
--
-- 3) SELECT referenced `fm.message_id` which does NOT exist in public.failed_messages
--    (see migration 20260423152231). This caused a compile-time error, making the
--    whole function fail to create — confirming the previous migration was never
--    successfully applied.
--
-- 4) Keyset cursor used `fm.created_at < (subquery)` which skips rows sharing the
--    same created_at as the cursor row. Fixed to use proper row-value comparison:
--    ROW(created_at, id) < ROW(cursor_created_at, cursor_id).
--
-- Impact: All client-side errorCode/rootCause filters were silent no-ops (fields
-- always undefined). computeFailedMessagesAggregates() always showed 'unknown' for
-- all error codes. Pagination potentially skipped rows at timestamp boundaries.

CREATE OR REPLACE FUNCTION public.rpc_list_failed_messages_cursor(
  p_status text[],
  p_instance text,
  p_search text,
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  instance_name text,
  remote_jid text,
  payload jsonb,
  error_code text,
  error_message text,
  http_status integer,
  retry_count integer,
  max_retries integer,
  status text,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  succeeded_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor')) THEN
    PERFORM public.log_rls_denied('failed_messages', 'admin|supervisor',
      jsonb_build_object('rpc', 'rpc_list_failed_messages_cursor', 'filters',
        jsonb_build_object('status', p_status, 'instance', p_instance, 'search', p_search)));
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    fm.id,
    fm.instance_name,
    fm.remote_jid,
    fm.payload,
    fm.error_code,
    fm.error_message,
    fm.http_status,
    fm.retry_count,
    fm.max_retries,
    fm.status,
    fm.last_attempt_at,
    fm.next_attempt_at,
    fm.succeeded_at,
    fm.created_at,
    fm.updated_at,
    COUNT(*) OVER()::bigint AS total_count
  FROM public.failed_messages fm
  WHERE (p_status IS NULL OR fm.status = ANY(p_status))
    AND (p_instance IS NULL OR fm.instance_name = p_instance)
    AND (p_search IS NULL
         OR fm.error_message ILIKE '%' || p_search || '%'
         OR fm.error_code ILIKE '%' || p_search || '%'
         OR fm.remote_jid ILIKE '%' || p_search || '%')
    AND (p_from IS NULL OR fm.created_at >= p_from)
    AND (p_to IS NULL OR fm.created_at <= p_to)
    AND (p_cursor_id IS NULL OR
         ROW(fm.created_at, fm.id) < (
           SELECT ROW(c.created_at, c.id)
           FROM public.failed_messages c
           WHERE c.id = p_cursor_id
         ))
  ORDER BY fm.created_at DESC, fm.id DESC
  LIMIT COALESCE(p_limit, 50);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_list_failed_messages_cursor(text[], text, text, timestamptz, timestamptz, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_list_failed_messages_cursor(text[], text, text, timestamptz, timestamptz, integer, uuid) TO authenticated;
