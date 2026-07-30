-- Fix: search_contacts_cursor usava FROM public.contacts (não existe)
-- Corrigido para FROM zapp.contacts (VIEW com 50 colunas incluindo nickname, surname, job_title, tags, notes, contact_type)
-- Fix: rpc_list_dispatch_error_logs_cursor criado com cursor-based pagination
-- Necessário porque useDispatchErrorLogs.ts (PR #457) migrou para a versão _cursor que não existia.

-- ═══ FIX-1: rpc_list_dispatch_error_logs_cursor ═══════════════════════════
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
RETURNS TABLE(
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
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor')) THEN
    PERFORM public.log_rls_denied('dispatch_error_logs','admin|supervisor',
      jsonb_build_object('rpc','rpc_list_dispatch_error_logs_cursor'));
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT d.id, d.failed_message_id, d.instance_name,
           em.remote_jid, d.channel_type, d.agent_email, d.agent_user_id,
           d.error_code, d.error_message, d.http_status, d.retry_count,
           d.payload, d.context, d.created_at AS occurred_at
    FROM zapp.dispatch_error_logs d
    LEFT JOIN evo.evolution_messages em ON em.id = d.failed_message_id
    WHERE (p_from IS NULL OR d.created_at >= p_from)
      AND (p_to IS NULL OR d.created_at <= p_to)
      AND (p_instance IS NULL OR d.instance_name = p_instance)
      AND (p_agent IS NULL OR d.agent_email = p_agent)
      AND (p_error_code IS NULL OR d.error_code = p_error_code)
      AND (p_search IS NULL OR d.error_message ILIKE '%'||p_search||'%'
                            OR d.error_code ILIKE '%'||p_search||'%')
  ),
  total AS (SELECT COUNT(*)::bigint AS cnt FROM base)
  SELECT b.id, b.failed_message_id, b.instance_name, b.remote_jid,
         b.channel_type, b.agent_email, b.agent_user_id, b.error_code,
         b.error_message, b.http_status, b.retry_count, b.payload,
         b.context, b.occurred_at, t.cnt
  FROM base b, total t
  WHERE (p_cursor_id IS NULL OR
         ROW(b.occurred_at,b.id) < (SELECT ROW(c.created_at,c.id) FROM zapp.dispatch_error_logs c WHERE c.id=p_cursor_id))
  ORDER BY b.occurred_at DESC, b.id DESC
  LIMIT COALESCE(p_limit,50);
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_list_dispatch_error_logs_cursor(timestamptz,timestamptz,text,text,text,text,integer,uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_list_dispatch_error_logs_cursor(timestamptz,timestamptz,text,text,text,text,integer,uuid) TO authenticated;

-- ═══ FIX-2: search_contacts_cursor — public.contacts → zapp.contacts ═════════
CREATE OR REPLACE FUNCTION zapp.search_contacts_cursor(
  search_term text DEFAULT '', sort_field text DEFAULT 'name', sort_direction text DEFAULT 'asc',
  contact_type_filter text DEFAULT NULL, company_filter text DEFAULT NULL,
  date_from timestamptz DEFAULT NULL, job_title_filter text DEFAULT NULL,
  tag_filter text DEFAULT NULL, page_size integer DEFAULT 50, cursor_id uuid DEFAULT NULL
)
RETURNS TABLE(id uuid, name text, nickname text, surname text, job_title text, company text,
              phone text, email text, avatar_url text, tags text[], notes text, contact_type text,
              created_at timestamptz, updated_at timestamptz, total_count bigint)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = zapp AS $$
DECLARE v_query text; v_sort_expr text; v_where text;
BEGIN
  v_sort_expr := CASE WHEN sort_field='created_at' THEN 'created_at '||UPPER(sort_direction)||', id '||UPPER(sort_direction)
                      WHEN sort_field='updated_at' THEN 'updated_at '||UPPER(sort_direction)||', id '||UPPER(sort_direction)
                      ELSE 'name '||UPPER(sort_direction)||', id '||UPPER(sort_direction) END;
  v_where := 'WHERE 1=1';
  IF search_term!='' THEN v_where:=v_where||' AND (c.name ILIKE $1 OR c.email ILIKE $1 OR c.phone ILIKE $1)'; END IF;
  IF contact_type_filter IS NOT NULL THEN v_where:=v_where||' AND c.contact_type=$2'; END IF;
  IF company_filter IS NOT NULL THEN v_where:=v_where||' AND c.company ILIKE $3'; END IF;
  IF job_title_filter IS NOT NULL THEN v_where:=v_where||' AND c.job_title ILIKE $4'; END IF;
  IF tag_filter IS NOT NULL THEN v_where:=v_where||' AND $5=ANY(c.tags)'; END IF;
  IF date_from IS NOT NULL THEN v_where:=v_where||' AND c.created_at>=$6'; END IF;
  IF cursor_id IS NOT NULL THEN
    IF sort_direction='asc' THEN v_where:=v_where||' AND c.id>$7::uuid';
    ELSE v_where:=v_where||' AND c.id<$7::uuid'; END IF;
  END IF;
  v_query:='SELECT c.id,c.name,c.nickname,c.surname,c.job_title,c.company,c.phone,c.email,
            c.avatar_url,c.tags,c.notes,c.contact_type,c.created_at,c.updated_at,
            COUNT(*) OVER()::bigint AS total_count FROM zapp.contacts c '
           ||v_where||' ORDER BY '||v_sort_expr||' LIMIT $8';
  RETURN QUERY EXECUTE v_query USING '%'||search_term||'%',contact_type_filter,
    '%'||COALESCE(company_filter,'')||'%','%'||COALESCE(job_title_filter,'')||'%',
    tag_filter,date_from,cursor_id,page_size;
END; $$;

REVOKE EXECUTE ON FUNCTION zapp.search_contacts_cursor(text,text,text,text,text,timestamptz,text,text,integer,uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.search_contacts_cursor(text,text,text,text,text,timestamptz,text,text,integer,uuid) TO authenticated;
