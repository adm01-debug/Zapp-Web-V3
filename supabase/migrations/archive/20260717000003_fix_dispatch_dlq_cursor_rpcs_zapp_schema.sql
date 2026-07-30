-- Fix: rpc_list_dispatch_error_logs_cursor and rpc_dlq_list_audit_cursor both
-- had multiple critical bugs inherited from migration 20260712001500:
--
-- Common bugs (both functions):
-- A) Created in `public` schema; supabase.rpc() sends Content-Profile: zapp
--    (db.schema='zapp'). PostgREST resolves RPCs in the declared schema only →
--    PGRST202 (Function not found in schema: zapp). GAP-8 / GAP-9.
-- B) SET search_path TO 'public' — wrong; should include 'zapp' first so that
--    references to zapp tables resolve without schema-qualification.
--
-- rpc_list_dispatch_error_logs_cursor additional bugs:
-- C) All table references used public.dispatch_error_logs (a VIEW), not the
--    physical table zapp.dispatch_error_logs. RLS policies apply to the physical
--    table; querying the view bypasses the correct policy context.
-- D) COUNT(*) was computed inside the `filtered` CTE which already had the cursor
--    predicate applied → total_count decreased as pages advanced.
--    Fixed: count full result set before the cursor predicate via a separate CTE.
-- E) Keyset cursor used `d.occurred_at < v_cursor_occurred_at` (timestamp only),
--    skipping rows that share the same occurred_at as the cursor row.
--    Fixed: ROW(occurred_at, id) < ROW(cursor_occurred_at, cursor_id).
-- F) Auth check used public.is_admin_or_supervisor() (deprecated helper) instead
--    of the canonical public.has_role() pattern.
-- G) GRANT on wrong schema AND wrong arity (7 params vs 8) — already patched in
--    20260716_fix_dispatch_error_logs_grant.sql, but still on public schema.
--
-- rpc_dlq_list_audit_cursor additional bugs:
-- H) Table references used public.audit_logs and public.profiles; correct tables
--    are zapp.audit_logs and zapp.profiles.
-- I) Keyset cursor used `al.created_at < v_cursor_created_at` (timestamp only),
--    skipping rows sharing the same created_at as the cursor row.
--    Fixed: ROW(al.created_at, al.id) < ROW(cursor_created_at, cursor_id).

-- ─── Drop stale public-schema copies ─────────────────────────────────────────

DROP FUNCTION IF EXISTS public.rpc_list_dispatch_error_logs_cursor(
  timestamptz, timestamptz, text, text, text, text, integer, uuid);
-- Also drop the 7-param variant that the original GRANT mistakenly targeted.
DROP FUNCTION IF EXISTS public.rpc_list_dispatch_error_logs_cursor(
  timestamptz, timestamptz, text, text, text, integer, uuid);

DROP FUNCTION IF EXISTS public.rpc_dlq_list_audit_cursor(integer, text, uuid);

-- ─── rpc_list_dispatch_error_logs_cursor (GAP-8) ─────────────────────────────

CREATE OR REPLACE FUNCTION zapp.rpc_list_dispatch_error_logs_cursor(
  p_from       timestamptz DEFAULT NULL,
  p_to         timestamptz DEFAULT NULL,
  p_instance   text        DEFAULT NULL,
  p_agent      text        DEFAULT NULL,
  p_error_code text        DEFAULT NULL,
  p_search     text        DEFAULT NULL,
  p_limit      integer     DEFAULT 50,
  p_cursor_id  uuid        DEFAULT NULL
)
RETURNS TABLE (
  id               uuid,
  failed_message_id uuid,
  instance_name    text,
  remote_jid       text,
  channel_type     text,
  agent_email      text,
  agent_user_id    uuid,
  error_code       text,
  error_message    text,
  http_status      integer,
  retry_count      integer,
  payload          jsonb,
  context          jsonb,
  occurred_at      timestamptz,
  total_count      bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'zapp', 'public'
AS $$
DECLARE
  v_limit  integer;
  v_search text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor')) THEN
    PERFORM public.log_rls_denied('dispatch_error_logs', 'admin|supervisor',
      jsonb_build_object('rpc', 'rpc_list_dispatch_error_logs_cursor',
        'filters', jsonb_build_object(
          'instance', p_instance, 'agent', p_agent,
          'error_code', p_error_code, 'search', p_search)));
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_limit  := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
  v_search := NULLIF(TRIM(COALESCE(p_search, '')), '');

  RETURN QUERY
  WITH base AS (
    -- Apply all filters EXCEPT the cursor predicate so that total_count
    -- reflects the full result set, not just the remaining pages.
    SELECT
      d.id,
      d.failed_message_id,
      d.instance_name,
      d.remote_jid,
      d.channel_type,
      d.agent_email,
      d.agent_user_id,
      d.error_code,
      d.error_message,
      d.http_status,
      d.retry_count,
      d.payload,
      d.context,
      d.occurred_at
    FROM zapp.dispatch_error_logs d
    WHERE (p_from IS NULL OR d.occurred_at >= p_from)
      AND (p_to   IS NULL OR d.occurred_at <= p_to)
      AND (p_instance   IS NULL OR d.instance_name = p_instance)
      AND (p_agent      IS NULL OR d.agent_email   = p_agent)
      AND (p_error_code IS NULL OR d.error_code    = p_error_code)
      AND (v_search IS NULL OR (
            d.remote_jid    ILIKE '%' || v_search || '%' OR
            d.error_message ILIKE '%' || v_search || '%' OR
            d.error_code    ILIKE '%' || v_search || '%'
          ))
  ),
  total AS (
    SELECT COUNT(*)::bigint AS cnt FROM base
  )
  SELECT
    b.id, b.failed_message_id, b.instance_name, b.remote_jid,
    b.channel_type, b.agent_email, b.agent_user_id,
    b.error_code, b.error_message, b.http_status, b.retry_count,
    b.payload, b.context, b.occurred_at,
    t.cnt AS total_count
  FROM base b, total t
  WHERE (p_cursor_id IS NULL OR
         ROW(b.occurred_at, b.id) < (
           SELECT ROW(c.occurred_at, c.id)
           FROM zapp.dispatch_error_logs c
           WHERE c.id = p_cursor_id
         ))
  ORDER BY b.occurred_at DESC, b.id DESC
  LIMIT v_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_list_dispatch_error_logs_cursor(
  timestamptz, timestamptz, text, text, text, text, integer, uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION zapp.rpc_list_dispatch_error_logs_cursor(
  timestamptz, timestamptz, text, text, text, text, integer, uuid)
TO authenticated;

-- ─── rpc_dlq_list_audit_cursor (GAP-9) ───────────────────────────────────────

CREATE OR REPLACE FUNCTION zapp.rpc_dlq_list_audit_cursor(
  p_limit     integer,
  p_action    text,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id         uuid,
  action     text,
  entity_id  text,
  details    jsonb,
  created_at timestamptz,
  user_id    uuid,
  user_name  text,
  user_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'zapp', 'public'
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor')) THEN
    PERFORM public.log_rls_denied('audit_logs', 'admin|supervisor',
      jsonb_build_object('rpc', 'rpc_dlq_list_audit_cursor', 'action', p_action));
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    al.id,
    al.action::text,
    al.entity_id::text,
    al.details,
    al.created_at,
    al.user_id,
    p.name  AS user_name,
    p.email AS user_email
  FROM zapp.audit_logs al
  LEFT JOIN zapp.profiles p ON p.user_id = al.user_id
  WHERE al.entity_type = 'failed_messages'
    AND (p_action IS NULL OR p_action = 'all' OR al.action = p_action)
    AND (p_cursor_id IS NULL OR
         ROW(al.created_at, al.id) < (
           SELECT ROW(c.created_at, c.id)
           FROM zapp.audit_logs c
           WHERE c.id = p_cursor_id
         ))
  ORDER BY al.created_at DESC, al.id DESC
  LIMIT COALESCE(p_limit, 30);
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_list_audit_cursor(integer, text, uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION zapp.rpc_dlq_list_audit_cursor(integer, text, uuid)
TO authenticated;
