-- Execution 13 (P1-11): Cursor-Based Pagination to Replace Offset-Based Pagination
-- This migration adds cursor-based pagination RPC functions to replace inefficient offset-based
-- pagination. Cursor-based pagination is O(1) instead of O(n), providing better performance
-- for large datasets and avoiding sequential scans through all prior pages.

-- 1) Cursor-based version of rpc_list_failed_messages
-- Instead of OFFSET (scans through n rows), use WHERE id > cursor_id
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
  message_id text,
  error_message text,
  retry_count integer,
  next_retry_at timestamptz,
  status text,
  created_at timestamptz,
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
  SELECT fm.id, fm.instance_name, fm.message_id, fm.error_message,
         fm.retry_count, fm.next_retry_at, fm.status, fm.created_at,
         COUNT(*) OVER()::bigint AS total_count
  FROM public.failed_messages fm
  WHERE (p_status IS NULL OR fm.status = ANY(p_status))
    AND (p_instance IS NULL OR fm.instance_name = p_instance)
    AND (p_search IS NULL OR fm.error_message ILIKE '%'||p_search||'%' OR fm.message_id ILIKE '%'||p_search||'%')
    AND (p_from IS NULL OR fm.created_at >= p_from)
    AND (p_to IS NULL OR fm.created_at <= p_to)
    AND (p_cursor_id IS NULL OR fm.created_at < (SELECT created_at FROM public.failed_messages WHERE id = p_cursor_id))
  ORDER BY fm.created_at DESC, fm.id DESC
  LIMIT COALESCE(p_limit, 50);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_list_failed_messages_cursor(text[], text, text, timestamptz, timestamptz, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_list_failed_messages_cursor(text[], text, text, timestamptz, timestamptz, integer, uuid) TO authenticated;

-- 2) Cursor-based version of rpc_list_dispatch_error_logs
CREATE OR REPLACE FUNCTION public.rpc_list_dispatch_error_logs_cursor(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_instance text DEFAULT NULL,
  p_agent text DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  failed_message_id uuid,
  instance_name text,
  remote_jid text,
  channel_type text,
  agent_email text,
  agent_user_id uuid,
  error_code text,
  error_message text,
  http_status integer,
  retry_count integer,
  payload jsonb,
  context jsonb,
  occurred_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_limit integer;
  v_search text;
  v_cursor_occurred_at timestamptz;
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: admin or supervisor role required';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
  v_search := NULLIF(TRIM(COALESCE(p_search, '')), '');

  -- Get cursor timestamp if cursor_id provided
  IF p_cursor_id IS NOT NULL THEN
    SELECT occurred_at INTO v_cursor_occurred_at
    FROM public.dispatch_error_logs
    WHERE id = p_cursor_id;
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT d.*
    FROM public.dispatch_error_logs d
    WHERE (p_from IS NULL OR d.occurred_at >= p_from)
      AND (p_to IS NULL OR d.occurred_at <= p_to)
      AND (p_instance IS NULL OR d.instance_name = p_instance)
      AND (p_agent IS NULL OR d.agent_email = p_agent)
      AND (p_error_code IS NULL OR d.error_code = p_error_code)
      AND (
        v_search IS NULL OR (
          d.remote_jid ILIKE '%' || v_search || '%' OR
          d.error_message ILIKE '%' || v_search || '%' OR
          d.error_code ILIKE '%' || v_search || '%'
        )
      )
      AND (v_cursor_occurred_at IS NULL OR d.occurred_at < v_cursor_occurred_at)
  ), counted AS (
    SELECT COUNT(*)::BIGINT AS total FROM filtered
  )
  SELECT
    f.id, f.failed_message_id, f.instance_name, f.remote_jid,
    f.channel_type, f.agent_email, f.agent_user_id,
    f.error_code, f.error_message, f.http_status, f.retry_count,
    f.payload, f.context, f.occurred_at,
    c.total
  FROM filtered f
  CROSS JOIN counted c
  ORDER BY f.occurred_at DESC, f.id DESC
  LIMIT v_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_list_dispatch_error_logs_cursor(timestamptz, timestamptz, text, text, text, text, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_list_dispatch_error_logs_cursor(timestamptz, timestamptz, text, text, text, integer, uuid) TO authenticated;

-- 3) Cursor-based version of rpc_list_transfers_paginated
CREATE OR REPLACE FUNCTION public.rpc_list_transfers_paginated_cursor(
  p_status text DEFAULT NULL,
  p_priority integer DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  source_instance text,
  target_instance text,
  remote_jid text,
  contact_name text,
  status text,
  priority integer,
  transfer_type text,
  category text,
  reason text,
  from_agent_id uuid,
  to_agent_id uuid,
  sla_deadline timestamptz,
  created_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH cursor_time AS (
    SELECT created_at FROM public.conversation_transfers
    WHERE (p_cursor_id IS NULL OR id = p_cursor_id) LIMIT 1
  )
  SELECT t.id, t.source_instance, t.target_instance, t.remote_jid, t.contact_name,
         t.status, t.priority, t.transfer_type, t.category, t.reason,
         t.from_agent_id, t.to_agent_id, t.sla_deadline,
         t.created_at, t.accepted_at, t.completed_at,
         COUNT(*) OVER()::bigint AS total_count
  FROM public.conversation_transfers t
  CROSS JOIN cursor_time ct
  WHERE (p_status IS NULL OR t.status = p_status)
    AND (p_priority IS NULL OR t.priority = p_priority)
    AND (p_from IS NULL OR t.created_at >= p_from)
    AND (p_to IS NULL OR t.created_at <= p_to)
    AND (p_cursor_id IS NULL OR t.created_at < ct.created_at)
  ORDER BY t.created_at DESC, t.id DESC
  LIMIT COALESCE(p_limit, 50);
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_list_transfers_paginated_cursor(text, integer, timestamptz, timestamptz, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_list_transfers_paginated_cursor(text, integer, timestamptz, timestamptz, integer, uuid) TO authenticated;

-- 4) Cursor-based version of rpc_dlq_list_audit
CREATE OR REPLACE FUNCTION public.rpc_dlq_list_audit_cursor(
  p_limit integer,
  p_action text,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  action text,
  entity_id text,
  details jsonb,
  created_at timestamptz,
  user_id uuid,
  user_name text,
  user_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cursor_created_at timestamptz;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor')) THEN
    PERFORM public.log_rls_denied('dlq_audit_log', 'admin|supervisor',
      jsonb_build_object('rpc', 'rpc_dlq_list_audit_cursor', 'action', p_action));
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Get cursor timestamp if cursor_id provided
  IF p_cursor_id IS NOT NULL THEN
    SELECT created_at INTO v_cursor_created_at
    FROM public.audit_logs
    WHERE id = p_cursor_id;
  END IF;

  RETURN QUERY
  SELECT al.id,
         al.action::text,
         al.entity_id::text,
         al.details,
         al.created_at,
         al.user_id,
         p.name AS user_name,
         p.email AS user_email
  FROM public.audit_logs al
  LEFT JOIN public.profiles p ON p.user_id = al.user_id
  WHERE al.entity_type = 'failed_messages'
    AND (p_action IS NULL OR p_action = 'all' OR al.action = p_action)
    AND (v_cursor_created_at IS NULL OR al.created_at < v_cursor_created_at)
  ORDER BY al.created_at DESC, al.id DESC
  LIMIT COALESCE(p_limit, 30);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_dlq_list_audit_cursor(integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_dlq_list_audit_cursor(integer, text, uuid) TO authenticated;

-- 5) Cursor-based version of search_contacts (if it uses offset pagination)
-- This is implemented at the application level, so we create a cursor variant
CREATE OR REPLACE FUNCTION public.search_contacts_cursor(
  search_term text DEFAULT '',
  contact_type_filter text DEFAULT NULL,
  company_filter text DEFAULT NULL,
  job_title_filter text DEFAULT NULL,
  tag_filter text DEFAULT NULL,
  date_from timestamptz DEFAULT NULL,
  sort_field text DEFAULT 'name',
  sort_direction text DEFAULT 'asc',
  page_size integer DEFAULT 50,
  cursor_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  name text,
  nickname text,
  surname text,
  job_title text,
  company text,
  phone text,
  email text,
  avatar_url text,
  tags text[],
  notes text,
  contact_type text,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_query text;
  v_sort_expr text;
  v_where_clause text;
  v_cursor_sort_value text;
BEGIN
  -- Build sort expression based on sort_field and sort_direction
  v_sort_expr := CASE
    WHEN sort_field = 'created_at' THEN 'created_at ' || UPPER(sort_direction) || ', id ' || UPPER(sort_direction)
    WHEN sort_field = 'updated_at' THEN 'updated_at ' || UPPER(sort_direction) || ', id ' || UPPER(sort_direction)
    ELSE 'name ' || UPPER(sort_direction) || ', id ' || UPPER(sort_direction)
  END;

  -- Build WHERE clause for cursor pagination
  v_where_clause := 'WHERE 1=1';

  IF search_term != '' THEN
    v_where_clause := v_where_clause || ' AND (name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1)';
  END IF;

  IF contact_type_filter IS NOT NULL THEN
    v_where_clause := v_where_clause || ' AND contact_type = $2';
  END IF;

  IF company_filter IS NOT NULL THEN
    v_where_clause := v_where_clause || ' AND company ILIKE $3';
  END IF;

  IF job_title_filter IS NOT NULL THEN
    v_where_clause := v_where_clause || ' AND job_title ILIKE $4';
  END IF;

  IF tag_filter IS NOT NULL THEN
    v_where_clause := v_where_clause || ' AND $5 = ANY(tags)';
  END IF;

  IF date_from IS NOT NULL THEN
    v_where_clause := v_where_clause || ' AND created_at >= $6';
  END IF;

  -- Add cursor condition
  IF cursor_id IS NOT NULL THEN
    IF sort_direction = 'asc' THEN
      v_where_clause := v_where_clause || ' AND id > $7::uuid';
    ELSE
      v_where_clause := v_where_clause || ' AND id < $7::uuid';
    END IF;
  END IF;

  v_query := 'SELECT c.id, c.name, c.nickname, c.surname, c.job_title, c.company, c.phone, c.email,
                     c.avatar_url, c.tags, c.notes, c.contact_type, c.created_at, c.updated_at,
                     COUNT(*) OVER()::bigint AS total_count
              FROM public.contacts c
              ' || v_where_clause || '
              ORDER BY ' || v_sort_expr || '
              LIMIT $8';

  RETURN QUERY EXECUTE v_query
    USING search_term, contact_type_filter, company_filter, job_title_filter, tag_filter, date_from, cursor_id, page_size;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.search_contacts_cursor(text, text, text, text, text, timestamptz, text, text, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_contacts_cursor(text, text, text, text, text, timestamptz, text, text, integer, uuid) TO authenticated;
