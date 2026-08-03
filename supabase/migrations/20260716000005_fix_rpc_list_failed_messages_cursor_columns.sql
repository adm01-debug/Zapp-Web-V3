-- Fix: rpc_list_failed_messages_cursor had several critical bugs:
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
-- 5) Used public.failed_messages (a VIEW) instead of the physical table
--    zapp.failed_messages, routing the query through PostgREST's public schema
--    context rather than the physical table's RLS policies.
--
-- 6) COUNT(*) OVER() ran after the cursor predicate, so total_count decreased
--    as pages advanced. Fixed via a CTE that counts the full result set before
--    the cursor filter is applied.
--
-- 7) errorCode filtering was done client-side after LIMIT, producing spuriously
--    empty pages when matching rows fell beyond the page boundary. Added
--    p_error_code parameter for server-side filtering. The synthesised codes
--    (http_NNN, unknown) used by the JS client are mirrored in SQL.
--    rootCause classification (multi-field heuristic) remains client-side.
--
-- 8) Function was in `public` schema but supabase.rpc() sends Content-Profile: zapp
--    (db.schema='zapp'). PostgREST resolves RPCs in the Content-Profile schema only,
--    so a function in `public` is invisible to the JS client — PGRST202 (Function not
--    found in schema: zapp). Fixed by creating the function in the `zapp` schema.

-- Drop any stale copies from public schema (old 7-param and 8-param).
DROP FUNCTION IF EXISTS public.rpc_list_failed_messages_cursor(text[], text, text, timestamptz, timestamptz, integer, uuid);
DROP FUNCTION IF EXISTS public.rpc_list_failed_messages_cursor(text[], text, text, timestamptz, timestamptz, integer, uuid, text);

CREATE OR REPLACE FUNCTION zapp.rpc_list_failed_messages_cursor(
  p_status     text[],
  p_instance   text,
  p_search     text,
  p_from       timestamptz,
  p_to         timestamptz,
  p_limit      integer,
  p_cursor_id  uuid    DEFAULT NULL,
  p_error_code text    DEFAULT NULL
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
SET search_path TO 'zapp', 'public'
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor')) THEN
    PERFORM public.log_rls_denied('failed_messages', 'admin|supervisor',
      jsonb_build_object('rpc', 'rpc_list_failed_messages_cursor', 'filters',
        jsonb_build_object('status', p_status, 'instance', p_instance, 'search', p_search)));
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    -- Filter without cursor so we can count the full result set.
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
      fm.updated_at
    FROM zapp.failed_messages fm
    WHERE (p_status IS NULL OR fm.status = ANY(p_status))
      AND (p_instance IS NULL OR fm.instance_name = p_instance)
      AND (p_search IS NULL
           OR fm.error_message ILIKE '%' || p_search || '%'
           OR fm.error_code    ILIKE '%' || p_search || '%'
           OR fm.remote_jid    ILIKE '%' || p_search || '%')
      AND (p_from IS NULL OR fm.created_at >= p_from)
      AND (p_to   IS NULL OR fm.created_at <= p_to)
      -- Server-side error_code filter, mirroring JS synthesised codes:
      --   error_code column value (direct match)
      --   NULL error_code + http_status  → 'http_NNN'
      --   NULL error_code + NULL status  → 'unknown'
      AND (p_error_code IS NULL
           OR fm.error_code = p_error_code
           OR (fm.error_code IS NULL AND fm.http_status IS NOT NULL
               AND 'http_' || fm.http_status::text = p_error_code)
           OR (fm.error_code IS NULL AND fm.http_status IS NULL
               AND p_error_code = 'unknown'))
  ),
  total AS (
    SELECT COUNT(*)::bigint AS cnt FROM base
  )
  SELECT
    b.id,
    b.instance_name,
    b.remote_jid,
    b.payload,
    b.error_code,
    b.error_message,
    b.http_status,
    b.retry_count,
    b.max_retries,
    b.status,
    b.last_attempt_at,
    b.next_attempt_at,
    b.succeeded_at,
    b.created_at,
    b.updated_at,
    t.cnt AS total_count
  FROM base b, total t
  WHERE (p_cursor_id IS NULL OR
         ROW(b.created_at, b.id) < (
           SELECT ROW(c.created_at, c.id)
           FROM zapp.failed_messages c
           WHERE c.id = p_cursor_id
         ))
  ORDER BY b.created_at DESC, b.id DESC
  LIMIT COALESCE(p_limit, 50);
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_list_failed_messages_cursor(text[], text, text, timestamptz, timestamptz, integer, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.rpc_list_failed_messages_cursor(text[], text, text, timestamptz, timestamptz, integer, uuid, text) TO authenticated;
