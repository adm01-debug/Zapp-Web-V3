-- Round 16 Migration #1: CRITICAL — Close Arbitrary SQL Execution Vector
-- Severity: CRITICAL (RCE-level injection)
-- Gap: safe_execute_query(p_query TEXT) executes caller-controlled SQL verbatim.
--      Any authenticated user or SECURITY DEFINER chain can inject arbitrary DDL/DML.
-- Fix: DROP the function, replace get_contacts_via_cte_safe with strict whitelist,
--      remove residual auth.users.role checks replaced by user_roles.
-- Date: 2026-07-12
-- Impact: Closes full SQL injection / privilege escalation path

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. DROP arbitrary SQL execution function (critical RCE-level vector)
-- ─────────────────────────────────────────────────────────────────────────────
-- safe_execute_query executes any SQL string passed as argument.
-- No SECURITY DEFINER check, no input validation, no allowlist.
-- A malicious caller can execute: DROP TABLE, ALTER TABLE, GRANT, etc.
DROP FUNCTION IF EXISTS safe_execute_query(TEXT);
DROP FUNCTION IF EXISTS safe_execute_query(p_query TEXT);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Replace get_contacts_via_cte_safe with strict column whitelist
--    Previous version allowed arbitrary column names via %I — still injectable
--    because no column whitelist was enforced before format().
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_contacts_via_cte_safe(
  p_search_field TEXT,
  p_search_value TEXT
)
RETURNS TABLE (
  id         UUID,
  full_name  TEXT,
  email      TEXT,
  phone      TEXT,
  deleted_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public', 'evo'
AS $$
DECLARE
  v_user_id   UUID;
  v_is_admin  BOOLEAN;
  v_workspace_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_required: No authenticated user' USING ERRCODE = '42501';
  END IF;

  -- Strict column whitelist — blocks schema enumeration via field injection
  IF p_search_field NOT IN ('phone_number', 'email', 'id', 'remote_jid', 'instance_name') THEN
    RAISE EXCEPTION 'invalid_field: Column "%" is not allowed for search. Allowed: phone_number, email, id, remote_jid, instance_name',
      p_search_field USING ERRCODE = '42703';
  END IF;

  -- Input length guard
  IF LENGTH(p_search_value) > 500 THEN
    RAISE EXCEPTION 'input_too_long: Search value exceeds 500 characters' USING ERRCODE = '22023';
  END IF;

  -- Resolve workspace from workspace_members (not auth.users.role)
  SELECT wm.workspace_id INTO v_workspace_id
  FROM public.workspace_members wm
  WHERE wm.user_id = v_user_id
    AND wm.accepted_at IS NOT NULL
  LIMIT 1;

  v_is_admin := is_admin_or_supervisor(v_user_id);

  -- Execute with workspace-scoped access and whitelisted column
  RETURN QUERY
  SELECT
    c.id::UUID,
    c.full_name::TEXT,
    c.email::TEXT,
    c.phone_number::TEXT,
    c.deleted_at
  FROM evo.evolution_contacts c
  WHERE c.deleted_at IS NULL
    AND (v_is_admin OR c.workspace_id = v_workspace_id)
    AND CASE p_search_field
          WHEN 'phone_number'  THEN c.phone_number = p_search_value
          WHEN 'email'         THEN c.email = p_search_value
          WHEN 'id'            THEN c.id::TEXT = p_search_value
          WHEN 'remote_jid'    THEN c.remote_jid = p_search_value
          WHEN 'instance_name' THEN c.instance_name = p_search_value
          ELSE FALSE
        END;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Harden get_conversations_safe_join — remove references to non-existent
--    public.contacts and public.messages views; use evo schema directly.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_conversations_safe_join()
RETURNS TABLE (
  conversation_id    UUID,
  contact_id         UUID,
  contact_name       TEXT,
  message_count      BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public', 'evo'
AS $$
DECLARE
  v_user_id      UUID;
  v_is_admin     BOOLEAN;
  v_workspace_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_required: No authenticated user' USING ERRCODE = '42501';
  END IF;

  SELECT wm.workspace_id INTO v_workspace_id
  FROM public.workspace_members wm
  WHERE wm.user_id = v_user_id
    AND wm.accepted_at IS NOT NULL
  LIMIT 1;

  v_is_admin := is_admin_or_supervisor(v_user_id);

  RETURN QUERY
  SELECT
    conv.id::UUID,
    c.id::UUID,
    c.full_name::TEXT,
    conv.message_count::BIGINT
  FROM evo.evolution_conversations conv
  INNER JOIN evo.evolution_contacts c ON conv.contact_id = c.id
  WHERE c.deleted_at IS NULL
    AND conv.deleted_at IS NULL
    AND (v_is_admin OR c.workspace_id = v_workspace_id);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Ensure no anon or public execute on these sensitive functions
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION get_contacts_via_cte_safe(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_contacts_via_cte_safe(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION get_contacts_via_cte_safe(TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION get_conversations_safe_join() FROM PUBLIC;
REVOKE ALL ON FUNCTION get_conversations_safe_join() FROM anon;
GRANT EXECUTE ON FUNCTION get_conversations_safe_join() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Verify safe_execute_query is gone (raise if still exists)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'safe_execute_query'
  ) THEN
    RAISE EXCEPTION 'SECURITY: safe_execute_query still exists — drop failed. Abort migration.'
      USING ERRCODE = '42P13';
  END IF;
  RAISE NOTICE 'Verified: safe_execute_query is gone';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Audit log entry for this critical remediation
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.security_acl_alerts (
  alert_type, object_name, role_name, privilege, severity, details
) VALUES (
  'FUNCTION_DROPPED',
  'safe_execute_query',
  'public',
  'EXECUTE',
  'CRITICAL',
  jsonb_build_object(
    'reason', 'Arbitrary SQL execution vector — RCE-level injection risk',
    'remediation', 'Function dropped in R16-M1 migration',
    'migration', '20260712170000_r16_close_arbitrary_sql_exec_vector',
    'timestamp', now()
  )
) ON CONFLICT DO NOTHING;

COMMIT;
