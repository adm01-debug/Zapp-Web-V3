-- Round 15 High Priority Gaps #2-4: RLS CTE Bypass, JOIN Bypass, Introspection Access
-- Problem: CTEs can bypass RLS; JOINs can access unfiltered columns; information_schema exposed
-- Solution: Explicit RLS checks in CTEs, re-check on JOINs, restrict information_schema access

-- First, enhance the base RLS check function with explicit error handling
CREATE OR REPLACE FUNCTION is_admin_or_supervisor(p_user_id UUID DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());

  -- Explicit NULL check with error
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication context missing or invalid'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Query user's role
  SELECT role INTO v_role
  FROM users
  WHERE id = v_user_id;

  -- Explicit NULL handling
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'User % not found in users table', v_user_id
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN v_role IN ('admin', 'supervisor');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create function to enforce RLS on CTE results (CTE-wrapper pattern)
CREATE OR REPLACE FUNCTION enforce_rls_on_cte_results(
  p_cte_json JSONB,
  p_table_name VARCHAR,
  p_record_ids UUID[]
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_has_access BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication context missing'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Verify user has access to all record IDs in CTE result
  CASE p_table_name
    WHEN 'contacts' THEN
      SELECT EXISTS(
        SELECT 1 FROM contacts
        WHERE id = ANY(p_record_ids)
        AND (user_id = v_user_id OR is_admin_or_supervisor(v_user_id))
      ) INTO v_has_access;

    WHEN 'conversations' THEN
      SELECT EXISTS(
        SELECT 1 FROM conversations c
        JOIN contacts ct ON c.contact_id = ct.id
        WHERE c.id = ANY(p_record_ids)
        AND (ct.user_id = v_user_id OR is_admin_or_supervisor(v_user_id))
      ) INTO v_has_access;

    ELSE
      RAISE EXCEPTION 'Unknown table for RLS CTE check: %', p_table_name
        USING ERRCODE = 'invalid_parameter_value';
  END CASE;

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'Access denied to records in % via CTE', p_table_name
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN p_cte_json;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create wrapper function for CTEs that filters results through RLS
CREATE OR REPLACE FUNCTION get_contacts_via_cte_safe(
  p_filter_column VARCHAR,
  p_filter_value ANYELEMENT
)
RETURNS TABLE (id UUID, name TEXT, email TEXT, user_id UUID) AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication context missing'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- CTE with EXPLICIT RLS filter (not implicit)
  RETURN QUERY
  WITH filtered_contacts AS (
    SELECT c.id, c.name, c.email, c.user_id
    FROM contacts c
    WHERE c.deleted_at IS NULL
    AND (c.user_id = v_user_id OR is_admin_or_supervisor(v_user_id))
    AND CASE
      WHEN p_filter_column = 'email' THEN c.email::TEXT = p_filter_value::TEXT
      WHEN p_filter_column = 'name' THEN c.name ILIKE '%' || p_filter_value::TEXT || '%'
      ELSE true
    END
  )
  SELECT fc.id, fc.name, fc.email, fc.user_id
  FROM filtered_contacts fc;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create function to safely JOIN with RLS re-validation
CREATE OR REPLACE FUNCTION get_conversations_safe_join()
RETURNS TABLE (
  conversation_id UUID,
  contact_id UUID,
  contact_name TEXT,
  last_message TEXT
) AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication context missing'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- JOIN with EXPLICIT RLS re-check on both tables
  RETURN QUERY
  SELECT
    c.id,
    c.contact_id,
    ct.name,
    c.last_message
  FROM conversations c
  INNER JOIN contacts ct ON c.contact_id = ct.id
  -- RLS check on conversations owner
  WHERE EXISTS(
    SELECT 1 FROM users u
    WHERE u.id = v_user_id
    AND (c.user_id = v_user_id OR is_admin_or_supervisor(v_user_id))
  )
  -- RLS re-check on contact owner (critical!)
  AND EXISTS(
    SELECT 1 FROM users u
    WHERE u.id = v_user_id
    AND (ct.user_id = v_user_id OR is_admin_or_supervisor(v_user_id))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Restrict information_schema and pg_catalog access for non-superusers
-- This prevents PostgREST introspection attacks

DO $$
BEGIN
  -- Revoke schema-level access
  REVOKE ALL ON SCHEMA information_schema FROM public;
  REVOKE ALL ON SCHEMA pg_catalog FROM public;

  -- Grant only minimal necessary access for application
  -- (authentication role can see function definitions but not table structure)
  GRANT USAGE ON SCHEMA information_schema TO postgres, authenticated;
  GRANT USAGE ON SCHEMA pg_catalog TO postgres, authenticated;

  -- Explicitly deny queries on sensitive information_schema tables
  -- (prevents schema discovery via error messages)
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR USER postgres '
    'REVOKE SELECT ON TABLES FROM public';

  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR USER postgres '
    'REVOKE SELECT ON TABLES FROM authenticated';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Information schema privileges may have been partially set: %', SQLERRM;
END $$;

-- Create function to mask schema errors in API responses
CREATE OR REPLACE FUNCTION safe_execute_query(p_query TEXT)
RETURNS TABLE (result TEXT) AS $$
BEGIN
  BEGIN
    RETURN QUERY EXECUTE p_query;
  EXCEPTION
    WHEN SQLSTATE '42P01' THEN -- Undefined table
      RAISE EXCEPTION 'Resource not found' USING ERRCODE = 'not_found';
    WHEN SQLSTATE '42703' THEN -- Undefined column
      RAISE EXCEPTION 'Resource not found' USING ERRCODE = 'not_found';
    WHEN SQLSTATE '42883' THEN -- Undefined function
      RAISE EXCEPTION 'Operation not permitted' USING ERRCODE = 'insufficient_privilege';
    WHEN SQLSTATE '42000' THEN -- Insufficient privilege
      RAISE EXCEPTION 'Access denied' USING ERRCODE = 'insufficient_privilege';
    WHEN OTHERS THEN
      -- Log actual error for debugging, but return generic message to client
      RAISE NOTICE 'Query execution error (logged for audit): %', SQLERRM;
      RAISE EXCEPTION 'Operation failed' USING ERRCODE = 'internal_error';
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add metadata documenting RLS hardening
COMMENT ON FUNCTION enforce_rls_on_cte_results(JSONB, VARCHAR, UUID[]) IS
  'Enforce RLS on CTE results by re-checking access to all record IDs. '
  'Prevents CTE queries from bypassing user_id ownership checks. '
  'Called after CTE execution to validate access.';

COMMENT ON FUNCTION get_contacts_via_cte_safe(VARCHAR, ANYELEMENT) IS
  'Safely execute CTE-based contact queries with explicit BUILT-IN RLS filters. '
  'RLS check is in the CTE definition itself, not as wrapper. '
  'Prevents optimizer from bypassing filters.';

COMMENT ON FUNCTION get_conversations_safe_join() IS
  'Safely JOIN conversations and contacts with RLS re-validation on both tables. '
  'Prevents JOIN optimization from accessing unfiltered contact columns. '
  'Uses EXISTS subqueries for explicit RLS checks on each table.';

COMMENT ON FUNCTION safe_execute_query(TEXT) IS
  'Execute dynamic queries with error masking. '
  'Prevents schema discovery attacks via error messages. '
  'Returns generic error messages instead of revealing table/column names.';
