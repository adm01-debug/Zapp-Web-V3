-- Migration: create missing zapp-schema auth helper functions
-- These functions are called extensively in zapp.* function bodies and RLS policies
-- but were never created in the zapp schema. Without them:
--   • zapp.rpc_dlq_bulk_retry_now calls zapp.has_role(auth.uid(), 'admin') → runtime error
--   • RLS policies on zapp.queue_skill_requirements call zapp.is_admin_or_supervisor() → runtime error
--   • zapp.prevent_role_escalation trigger calls zapp.is_admin_or_supervisor(v_uid) → runtime error
--   • ALTER FUNCTION in 20260721_fix_cursor_rpcs_and_search_path.sql targets these → would fail
--   • Frontend tests call supabase.rpc('has_role',...) → PGRST202
--
-- Design decisions:
--   1. has_role accepts TEXT (not public.app_role enum) to avoid cross-schema type dependency
--   2. is_admin_or_supervisor provided in two overloads: no-arg (for RLS) + UUID param (for callers)
--   3. All query public.user_roles directly (table never moved to zapp schema)
--   4. role::TEXT cast handles the public.app_role enum transparently

-- ---------------------------------------------------------------------------
-- 1. zapp.has_role(UUID, TEXT)
--    Called from:
--      • zapp.rpc_dlq_bulk_retry_now: zapp.has_role(auth.uid(), 'admin')
--      • src/__tests__/security-and-performance.test.ts:47
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.has_role(
  _user_id UUID,
  _role     TEXT
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::TEXT = _role
  );
$$;

REVOKE EXECUTE ON FUNCTION zapp.has_role(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.has_role(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. zapp.is_admin_or_supervisor() — no-arg overload
--    Called from:
--      • RLS policies: zapp.is_admin_or_supervisor() in USING / WITH CHECK clauses
--      • ALTER FUNCTION in 20260721_fix_cursor_rpcs_and_search_path.sql line 418
--      • zapp.queue_skill_requirements policies (migration 20260724000032)
--    Role set includes 'manager' and 'dev' to match lovable original definitions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.is_admin_or_supervisor()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role::TEXT IN ('admin', 'supervisor', 'manager', 'dev')
  );
$$;

REVOKE EXECUTE ON FUNCTION zapp.is_admin_or_supervisor() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.is_admin_or_supervisor() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. zapp.is_admin_or_supervisor(UUID) — UUID-param overload
--    Called from:
--      • zapp.prevent_role_escalation trigger: zapp.is_admin_or_supervisor(v_uid)
--      • src/__tests__/security-and-performance.test.ts:73
--      • ALTER FUNCTION in 20260721_fix_cursor_rpcs_and_search_path.sql line 419
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.is_admin_or_supervisor(
  _user_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::TEXT IN ('admin', 'supervisor', 'manager', 'dev')
  );
$$;

REVOKE EXECUTE ON FUNCTION zapp.is_admin_or_supervisor(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.is_admin_or_supervisor(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. zapp.log_rls_denied(TEXT, TEXT, JSONB) — wrapper for public.log_rls_denied
--    Called from zapp function bodies that fire on RLS policy violations.
--    Signature matches public.log_rls_denied(p_resource, p_required_role, p_context).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.log_rls_denied(
  p_resource      TEXT,
  p_required_role TEXT,
  p_context       JSONB DEFAULT NULL
) RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT public.log_rls_denied(p_resource, p_required_role, p_context);
$$;

REVOKE EXECUTE ON FUNCTION zapp.log_rls_denied(TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.log_rls_denied(TEXT, TEXT, JSONB) TO authenticated, service_role;
