-- =============================================================================
-- Fix: cursor RPCs calling public.has_role (42883) + ROW() keyset bug +
--      search_contacts_cursor broken pagination + is_admin_or_supervisor
--      wrong search_path + dispatch_error_logs missing from realtime pub
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. rpc_list_failed_messages_cursor
--    BUG-A: public.has_role(uid, 'admin') → function does not exist (42883)
--    BUG-B: ROW(col,id) < (SELECT ROW(col,id) FROM ...) → "subquery has too
--           few columns" — PL/pgSQL parses the static body at first invocation;
--           must use (col, id) < (SELECT col, id FROM ...) bare-column tuple.
--    BUG-C: RETURNS TABLE declared http_status/max_retries as int but the
--           actual failed_messages columns are numeric — type mismatch caught
--           at first RETURN QUERY execution.
--    FIX:   DROP + CREATE (return type changed); zapp.is_admin_or_supervisor;
--           bare-column tuple keyset; numeric column types corrected.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS zapp.rpc_list_failed_messages_cursor(text[], text, text, timestamptz, timestamptz, int, uuid, text);

CREATE FUNCTION zapp.rpc_list_failed_messages_cursor(
  p_status      text[],
  p_instance    text,
  p_search      text,
  p_from        timestamptz,
  p_to          timestamptz,
  p_limit       int,
  p_cursor_id   uuid    DEFAULT NULL,
  p_error_code  text    DEFAULT NULL
)
RETURNS TABLE(
  id                uuid,
  instance_name     text,
  remote_jid        text,
  payload           jsonb,
  error_code        text,
  error_message     text,
  http_status       numeric,
  retry_count       int,
  max_retries       numeric,
  status            text,
  last_attempt_at   timestamptz,
  next_attempt_at   timestamptz,
  succeeded_at      timestamptz,
  created_at        timestamptz,
  updated_at        timestamptz,
  total_count       bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  IF NOT zapp.is_admin_or_supervisor(auth.uid()) THEN
    PERFORM zapp.log_rls_denied('failed_messages', 'admin|supervisor',
      jsonb_build_object('rpc', 'rpc_list_failed_messages_cursor', 'filters',
        jsonb_build_object('status', p_status, 'instance', p_instance, 'search', p_search)));
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
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
    WHERE (p_status    IS NULL OR fm.status        = ANY(p_status))
      AND (p_instance  IS NULL OR fm.instance_name = p_instance)
      AND (p_search    IS NULL
           OR fm.error_message ILIKE '%' || p_search || '%'
           OR fm.error_code    ILIKE '%' || p_search || '%'
           OR fm.remote_jid    ILIKE '%' || p_search || '%')
      AND (p_from      IS NULL OR fm.created_at >= p_from)
      AND (p_to        IS NULL OR fm.created_at <= p_to)
      AND (p_error_code IS NULL
           OR fm.error_code = p_error_code
           OR (fm.error_code IS NULL AND fm.http_status IS NOT NULL
               AND 'http_' || fm.http_status::text = p_error_code)
           OR (fm.error_code IS NULL AND fm.http_status IS NULL
               AND p_error_code = 'unknown'))
  ),
  total AS (SELECT COUNT(*)::bigint AS cnt FROM base)
  SELECT
    b.id, b.instance_name, b.remote_jid, b.payload,
    b.error_code, b.error_message, b.http_status,
    b.retry_count, b.max_retries, b.status,
    b.last_attempt_at, b.next_attempt_at, b.succeeded_at,
    b.created_at, b.updated_at,
    t.cnt AS total_count
  FROM base b, total t
  WHERE (p_cursor_id IS NULL OR
         (b.created_at, b.id) < (
           SELECT c.created_at, c.id
           FROM zapp.failed_messages c
           WHERE c.id = p_cursor_id
         ))
  ORDER BY b.created_at DESC, b.id DESC
  LIMIT COALESCE(p_limit, 50);
END;
$$;

REVOKE ALL ON FUNCTION zapp.rpc_list_failed_messages_cursor(text[], text, text, timestamptz, timestamptz, int, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_list_failed_messages_cursor(text[], text, text, timestamptz, timestamptz, int, uuid, text)
  TO authenticated;


-- ---------------------------------------------------------------------------
-- 2. rpc_list_dispatch_error_logs_cursor
--    BUG-A: public.has_role → 42883
--    BUG-B: ROW() subquery row-comparison error (same as above)
--    FIX:   zapp.is_admin_or_supervisor; bare-column tuple keyset;
--           search_path = zapp only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_list_dispatch_error_logs_cursor(
  p_from        timestamptz DEFAULT NULL,
  p_to          timestamptz DEFAULT NULL,
  p_instance    text        DEFAULT NULL,
  p_agent       text        DEFAULT NULL,
  p_error_code  text        DEFAULT NULL,
  p_search      text        DEFAULT NULL,
  p_limit       int         DEFAULT 50,
  p_cursor_id   uuid        DEFAULT NULL
)
RETURNS TABLE(
  id                uuid,
  failed_message_id uuid,
  instance_name     text,
  remote_jid        text,
  channel_type      text,
  agent_email       text,
  agent_user_id     uuid,
  error_code        text,
  error_message     text,
  http_status       int,
  retry_count       int,
  payload           jsonb,
  context           jsonb,
  occurred_at       timestamptz,
  total_count       bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  IF NOT zapp.is_admin_or_supervisor(auth.uid()) THEN
    PERFORM zapp.log_rls_denied(
      'dispatch_error_logs', 'admin|supervisor',
      jsonb_build_object('rpc', 'rpc_list_dispatch_error_logs_cursor')
    );
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      d.id,
      d.failed_message_id,
      d.instance_name,
      em.remote_jid,
      d.channel_type,
      d.agent_email,
      d.agent_user_id,
      d.error_code,
      d.error_message,
      d.http_status,
      d.retry_count,
      d.payload,
      d.context,
      d.created_at AS occurred_at
    FROM zapp.dispatch_error_logs d
    LEFT JOIN evo.evolution_messages em ON em.id = d.failed_message_id
    WHERE (p_from       IS NULL OR d.created_at >= p_from)
      AND (p_to         IS NULL OR d.created_at <= p_to)
      AND (p_instance   IS NULL OR d.instance_name = p_instance)
      AND (p_agent      IS NULL OR d.agent_email   = p_agent)
      AND (p_error_code IS NULL OR d.error_code    = p_error_code)
      AND (p_search     IS NULL
           OR d.error_message ILIKE '%' || p_search || '%'
           OR d.error_code    ILIKE '%' || p_search || '%')
  ),
  total AS (SELECT COUNT(*)::bigint AS cnt FROM base)
  SELECT
    b.id, b.failed_message_id, b.instance_name, b.remote_jid,
    b.channel_type, b.agent_email, b.agent_user_id, b.error_code,
    b.error_message, b.http_status, b.retry_count, b.payload,
    b.context, b.occurred_at, t.cnt AS total_count
  FROM base b, total t
  WHERE (p_cursor_id IS NULL OR
         (b.occurred_at, b.id) < (
           SELECT c.created_at, c.id
           FROM zapp.dispatch_error_logs c
           WHERE c.id = p_cursor_id
         ))
  ORDER BY b.occurred_at DESC, b.id DESC
  LIMIT COALESCE(p_limit, 50);
END;
$$;

GRANT EXECUTE ON FUNCTION zapp.rpc_list_dispatch_error_logs_cursor(timestamptz, timestamptz, text, text, text, text, int, uuid)
  TO authenticated;


-- ---------------------------------------------------------------------------
-- 3. rpc_dlq_list_audit_cursor
--    BUG-A: public.has_role → 42883
--    BUG-B: ROW() subquery row-comparison error
--    FIX:   zapp.is_admin_or_supervisor; bare-column tuple keyset;
--           search_path = zapp only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_dlq_list_audit_cursor(
  p_limit     int  DEFAULT 30,
  p_action    text DEFAULT NULL,
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
SET search_path = zapp
AS $$
BEGIN
  IF NOT zapp.is_admin_or_supervisor(auth.uid()) THEN
    PERFORM zapp.log_rls_denied('audit_logs', 'admin|supervisor',
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
         (al.created_at, al.id) < (
           SELECT c.created_at, c.id
           FROM zapp.audit_logs c
           WHERE c.id = p_cursor_id
         ))
  ORDER BY al.created_at DESC, al.id DESC
  LIMIT COALESCE(p_limit, 30);
END;
$$;

GRANT EXECUTE ON FUNCTION zapp.rpc_dlq_list_audit_cursor(int, text, uuid)
  TO authenticated;


-- ---------------------------------------------------------------------------
-- 4. search_contacts_cursor
--    BUG: cursor condition compared only c.id regardless of sort_field,
--         returning 0 rows on page 2+ when sorting by name/created_at/updated_at.
--         ROW() in subquery also wrong syntax — must use bare-column tuple.
--    FIX: (sort_col, c.id) < (SELECT sort_col, id FROM anchor) per sort_field.
--         search_path already = zapp (BUG-16 was previously applied).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.search_contacts_cursor(
  search_term         text        DEFAULT '',
  sort_field          text        DEFAULT 'name',
  sort_direction      text        DEFAULT 'asc',
  contact_type_filter text        DEFAULT NULL,
  company_filter      text        DEFAULT NULL,
  date_from           timestamptz DEFAULT NULL,
  job_title_filter    text        DEFAULT NULL,
  tag_filter          text        DEFAULT NULL,
  page_size           int         DEFAULT 50,
  cursor_id           uuid        DEFAULT NULL
)
RETURNS TABLE(
  id           uuid,
  name         text,
  nickname     text,
  surname      text,
  job_title    text,
  company      text,
  phone        text,
  email        text,
  avatar_url   text,
  tags         text[],
  notes        text,
  contact_type text,
  created_at   timestamptz,
  updated_at   timestamptz,
  total_count  bigint
)
LANGUAGE plpgsql
STABLE
SET search_path = zapp
AS $$
DECLARE
  v_query       text;
  v_count_where text;
  v_sort_dir    text;
  v_sort_expr   text;
  v_where       text;
BEGIN
  v_sort_dir := UPPER(COALESCE(sort_direction, 'ASC'));
  IF v_sort_dir NOT IN ('ASC', 'DESC') THEN
    v_sort_dir := 'ASC';
  END IF;

  v_sort_expr := CASE
    WHEN sort_field = 'created_at' THEN 'c.created_at ' || v_sort_dir || ', c.id ' || v_sort_dir
    WHEN sort_field = 'updated_at' THEN 'c.updated_at ' || v_sort_dir || ', c.id ' || v_sort_dir
    ELSE                                 'c.name '       || v_sort_dir || ', c.id ' || v_sort_dir
  END;

  v_where := 'WHERE 1=1';

  IF search_term != '' THEN
    v_where := v_where || ' AND (c.name ILIKE $1 OR c.email ILIKE $1 OR c.phone ILIKE $1)';
  END IF;
  IF contact_type_filter IS NOT NULL THEN v_where := v_where || ' AND c.contact_type = $2';    END IF;
  IF company_filter      IS NOT NULL THEN v_where := v_where || ' AND c.company ILIKE $3';     END IF;
  IF job_title_filter    IS NOT NULL THEN v_where := v_where || ' AND c.job_title ILIKE $4';   END IF;
  IF tag_filter          IS NOT NULL THEN v_where := v_where || ' AND $5 = ANY(c.tags)';       END IF;
  IF date_from           IS NOT NULL THEN v_where := v_where || ' AND c.created_at >= $6';     END IF;

  -- Capture the filter-only WHERE (no cursor) for the total count CTE.
  v_count_where := v_where;

  -- Keyset cursor: (sort_col, id) comparison via bare-column subquery.
  -- DO NOT use ROW() in the subquery — that wraps into a composite type (1 col)
  -- causing "subquery has too few columns". Use (col1, col2) < (SELECT c1, c2).
  IF cursor_id IS NOT NULL THEN
    IF sort_field = 'created_at' THEN
      IF v_sort_dir = 'ASC' THEN
        v_where := v_where ||
          ' AND (c.created_at, c.id) > (SELECT cc.created_at, cc.id FROM zapp.contacts cc WHERE cc.id = $7)';
      ELSE
        v_where := v_where ||
          ' AND (c.created_at, c.id) < (SELECT cc.created_at, cc.id FROM zapp.contacts cc WHERE cc.id = $7)';
      END IF;
    ELSIF sort_field = 'updated_at' THEN
      IF v_sort_dir = 'ASC' THEN
        v_where := v_where ||
          ' AND (c.updated_at, c.id) > (SELECT cc.updated_at, cc.id FROM zapp.contacts cc WHERE cc.id = $7)';
      ELSE
        v_where := v_where ||
          ' AND (c.updated_at, c.id) < (SELECT cc.updated_at, cc.id FROM zapp.contacts cc WHERE cc.id = $7)';
      END IF;
    ELSE
      -- sort by name: cast id to text for consistent (text, text) comparison
      IF v_sort_dir = 'ASC' THEN
        v_where := v_where ||
          ' AND (c.name, c.id::text) > (SELECT cc.name, cc.id::text FROM zapp.contacts cc WHERE cc.id = $7)';
      ELSE
        v_where := v_where ||
          ' AND (c.name, c.id::text) < (SELECT cc.name, cc.id::text FROM zapp.contacts cc WHERE cc.id = $7)';
      END IF;
    END IF;
  END IF;

  v_query :=
    'WITH total AS (
       SELECT COUNT(*)::bigint AS cnt FROM zapp.contacts c ' || v_count_where || '
     )
     SELECT c.id, c.name::text, c.nickname, c.surname, c.job_title,
            c.company::text, c.phone, c.email::text, c.avatar_url,
            c.tags, c.notes, c.contact_type, c.created_at, c.updated_at,
            t.cnt AS total_count
     FROM zapp.contacts c, total t
     ' || v_where || '
     ORDER BY ' || v_sort_expr || '
     LIMIT $8';

  RETURN QUERY EXECUTE v_query
    USING '%' || search_term || '%',
          contact_type_filter,
          '%' || COALESCE(company_filter,   '') || '%',
          '%' || COALESCE(job_title_filter, '') || '%',
          tag_filter,
          date_from,
          cursor_id,
          page_size;
END;
$$;

GRANT EXECUTE ON FUNCTION zapp.search_contacts_cursor(text, text, text, text, text, timestamptz, text, text, int, uuid)
  TO authenticated;


-- ---------------------------------------------------------------------------
-- 5. is_admin_or_supervisor: search_path was 'public'; bodies use fully-
--    qualified zapp.* references so only the config needs patching.
-- ---------------------------------------------------------------------------
ALTER FUNCTION zapp.is_admin_or_supervisor()     SET search_path = zapp;
ALTER FUNCTION zapp.is_admin_or_supervisor(uuid) SET search_path = zapp;


-- ---------------------------------------------------------------------------
-- 6. dispatch_error_logs was NOT in supabase_realtime publication.
--    Any Realtime subscription on it was a silent no-op.
-- ---------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE zapp.dispatch_error_logs;
