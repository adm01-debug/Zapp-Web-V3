-- Round 15 Migration #4: RLS Hardening & Schema Introspection Prevention
-- Prevents CTE/JOIN RLS bypasses and schema discovery attacks
-- Date: 2026-07-12
-- Impact: Critical security hardening

BEGIN;

CREATE OR REPLACE FUNCTION is_admin_or_supervisor(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_role VARCHAR;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  v_user_id := p_user_id;

  SELECT role INTO v_role
  FROM auth.users
  WHERE id = v_user_id
  LIMIT 1;

  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN v_role IN ('admin', 'supervisor');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_contacts_via_cte_safe(
  p_search_field VARCHAR,
  p_search_value ANYELEMENT
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  name VARCHAR,
  email VARCHAR,
  phone VARCHAR,
  deleted_at TIMESTAMPTZ
) AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  RETURN QUERY EXECUTE format('
    WITH filtered_contacts AS (
      SELECT
        c.id, c.user_id, c.name, c.email, c.phone, c.deleted_at
      FROM contacts c
      WHERE c.deleted_at IS NULL
        AND (c.user_id = %L OR %L::BOOLEAN)
    )
    SELECT * FROM filtered_contacts
    WHERE %I = %L
  ',
    v_user_id,
    is_admin_or_supervisor(v_user_id),
    p_search_field,
    p_search_value
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_conversations_safe_join()
RETURNS TABLE (
  conversation_id UUID,
  contact_id UUID,
  contact_name VARCHAR,
  message_count BIGINT
) AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  RETURN QUERY
  SELECT
    conv.id,
    c.id,
    c.name,
    COUNT(msg.id)
  FROM conversations conv
  INNER JOIN contacts c ON conv.contact_id = c.id
  LEFT JOIN messages msg ON conv.id = msg.conversation_id
  WHERE
    (c.user_id = v_user_id OR is_admin_or_supervisor(v_user_id))
    AND c.deleted_at IS NULL
    AND conv.deleted_at IS NULL
  GROUP BY conv.id, c.id, c.name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION safe_execute_query(p_query TEXT)
RETURNS SETOF RECORD AS $$
BEGIN
  RETURN QUERY EXECUTE p_query;
EXCEPTION
  WHEN UNDEFINED_TABLE THEN
    RAISE EXCEPTION 'Resource not found' USING ERRCODE = '42P99';
  WHEN UNDEFINED_COLUMN THEN
    RAISE EXCEPTION 'Resource not found' USING ERRCODE = '42P99';
  WHEN UNDEFINED_FUNCTION THEN
    RAISE EXCEPTION 'Resource not found' USING ERRCODE = '42P99';
  WHEN INSUFFICIENT_PRIVILEGE THEN
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Internal error' USING ERRCODE = '58000';
END;
$$ LANGUAGE plpgsql;

REVOKE ALL PRIVILEGES ON SCHEMA information_schema FROM public;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA information_schema FROM public;
REVOKE ALL PRIVILEGES ON SCHEMA pg_catalog FROM public;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA pg_catalog FROM public;

COMMIT;
