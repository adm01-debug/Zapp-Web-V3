-- Migration: create zapp wrappers for 4 remaining RPCs only in public schema
-- Discovered after migration 20260724000033 by cross-referencing all supabase.rpc()
-- call sites against CREATE FUNCTION zapp.* in migrations.

-- ---------------------------------------------------------------------------
-- 1. reassign_absent_agents
--    Caller: src/features/admin/hooks/useAgentReassignment.ts:24
--    Returns INTEGER (count of reassigned conversations)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.reassign_absent_agents(
  inactive_minutes INTEGER DEFAULT 30
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  IF NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'Admin or supervisor role required' USING ERRCODE = 'P0001';
  END IF;
  RETURN public.reassign_absent_agents(inactive_minutes);
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.reassign_absent_agents(INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.reassign_absent_agents(INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. reassign_overloaded_agents
--    Caller: src/features/admin/hooks/useAgentReassignment.ts:43
--    Returns INTEGER (count of reassigned conversations)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.reassign_overloaded_agents()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  IF NOT zapp.is_admin_or_supervisor() THEN
    RAISE EXCEPTION 'Admin or supervisor role required' USING ERRCODE = 'P0001';
  END IF;
  RETURN public.reassign_overloaded_agents();
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.reassign_overloaded_agents() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.reassign_overloaded_agents() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. rpc_get_contact (p_remote_jid / p_instance overload)
--    Caller: src/features/inbox/hooks/useIncomingCallBroadcast.ts:63
--    Caller reads first element: (Array.isArray(data) ? data[0] : data)
--    Fields consumed: push_name, name, full_name, phone, profile_picture_url, id
--    Returns JSONB array — avoids cross-schema composite type dependency on evo.*
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_get_contact(
  p_remote_jid TEXT,
  p_instance   TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT COALESCE(
    (SELECT jsonb_agg(to_jsonb(r.*))
     FROM public.rpc_get_contact(p_remote_jid, p_instance) r),
    '[]'::jsonb
  );
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_get_contact(TEXT, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_get_contact(TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. rpc_log_email_health
--    Caller: src/integrations/supabase/safeClient.ts:327
--    Returns JSONB
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_log_email_health(
  p_status        TEXT,
  p_operation     TEXT    DEFAULT NULL,
  p_resource      TEXT    DEFAULT NULL,
  p_request_id    TEXT    DEFAULT NULL,
  p_error_message TEXT    DEFAULT NULL,
  p_metadata      JSONB   DEFAULT NULL,
  p_is_failure    BOOLEAN DEFAULT NULL,
  p_account_id    UUID    DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT public.rpc_log_email_health(
    p_status, p_operation, p_resource, p_request_id,
    p_error_message, p_metadata, p_is_failure, p_account_id
  );
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_log_email_health(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_log_email_health(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, BOOLEAN, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. rpc_update_email_health_state
--    Caller: src/integrations/supabase/safeClient.ts:262
--    Returns JSONB
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_update_email_health_state(
  p_status        TEXT,
  p_failure_count INTEGER DEFAULT 0,
  p_metadata      JSONB   DEFAULT NULL
) RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT public.rpc_update_email_health_state(p_status, p_failure_count, p_metadata);
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_update_email_health_state(TEXT, INTEGER, JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_update_email_health_state(TEXT, INTEGER, JSONB) TO authenticated;
