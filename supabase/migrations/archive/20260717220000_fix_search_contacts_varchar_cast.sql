-- FIX CRÍTICO: search_contacts_cursor — type mismatch varchar vs text
--
-- DETECTADO em suite de validação exaustiva (G7_T73):
--   ERROR: structure of query does not match function result type
--
-- ROOT CAUSE: zapp.contacts.name/company/email são character varying (varchar),
-- mas RETURNS TABLE declara name/company/email como text.
-- Em funções EXECUTE dinâmico, o PostgreSQL exige match exato de tipos —
-- varchar NÃO é aceito onde text é esperado, mesmo sendo compatível no DML normal.
--
-- FIX: casts explícitos ::text em c.name, c.company, c.email na query dinâmica.
-- Resultado validado: search_contacts_cursor executa e retorna 20.562 contatos reais.

CREATE OR REPLACE FUNCTION zapp.search_contacts_cursor(
  search_term text DEFAULT '', sort_field text DEFAULT 'name',
  sort_direction text DEFAULT 'asc', contact_type_filter text DEFAULT NULL,
  company_filter text DEFAULT NULL, date_from timestamptz DEFAULT NULL,
  job_title_filter text DEFAULT NULL, tag_filter text DEFAULT NULL,
  page_size integer DEFAULT 50, cursor_id uuid DEFAULT NULL
)
RETURNS TABLE(id uuid, name text, nickname text, surname text, job_title text,
              company text, phone text, email text, avatar_url text,
              tags text[], notes text, contact_type text,
              created_at timestamptz, updated_at timestamptz, total_count bigint)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = zapp AS $$
DECLARE v_query text; v_sort_expr text; v_where text;
BEGIN
  v_sort_expr := CASE
    WHEN sort_field='created_at' THEN 'created_at '||UPPER(sort_direction)||', id '||UPPER(sort_direction)
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
  -- ::text explícito para colunas varchar — evita type mismatch em EXECUTE dinâmico
  v_query:='SELECT c.id, c.name::text, c.nickname, c.surname, c.job_title,
            c.company::text, c.phone, c.email::text, c.avatar_url,
            c.tags, c.notes, c.contact_type, c.created_at, c.updated_at,
            COUNT(*) OVER()::bigint AS total_count FROM zapp.contacts c '
           ||v_where||' ORDER BY '||v_sort_expr||' LIMIT $8';
  RETURN QUERY EXECUTE v_query USING '%'||search_term||'%', contact_type_filter,
    '%'||COALESCE(company_filter,'')||'%', '%'||COALESCE(job_title_filter,'')||'%',
    tag_filter, date_from, cursor_id, page_size;
END; $$

-- TAMBÉM: fn_rate_limit_check — NULL identifier/rpc_name devem retornar FALSE (fail-closed)
-- DETECTADO em G2_T15: null identifier causava NOT NULL constraint violation.
-- FIX: guard IF NULL → RETURN FALSE no início da função.
CREATE OR REPLACE FUNCTION zapp.fn_rate_limit_check(
  p_identifier text, p_rpc_name text, p_max_calls integer DEFAULT 60, p_window_minutes integer DEFAULT 1
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'zapp' AS $$
DECLARE v_count int; v_ws timestamptz;
BEGIN
  IF p_identifier IS NULL OR p_rpc_name IS NULL THEN RETURN FALSE; END IF;
  v_ws := to_timestamp(floor(EXTRACT(epoch FROM now()) / (p_window_minutes * 60)) * (p_window_minutes * 60));
  INSERT INTO rpc_rate_limits(identifier,rpc_name,window_start,call_count) VALUES(p_identifier,p_rpc_name,v_ws,1)
  ON CONFLICT(identifier,rpc_name,window_start) DO UPDATE SET call_count=rpc_rate_limits.call_count+1
  RETURNING call_count INTO v_count;
  RETURN v_count <= p_max_calls;
END; $$
