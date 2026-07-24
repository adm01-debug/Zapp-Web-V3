-- Migration: create zapp-schema wrappers for RPCs that only exist in public schema
-- The Supabase client sends Accept-Profile: zapp on every request, so PostgREST
-- resolves RPC calls against the zapp schema cache. Functions that exist only in
-- public return PGRST202 "could not find function in schema cache".
-- Each wrapper below delegates to the existing public.* implementation.

-- ---------------------------------------------------------------------------
-- 1. log_security_event
--    Callers: src/features/auth/components/ProtectedRoute.tsx:270,299
--             src/pages/AccessDenied.tsx:25
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.log_security_event(
  p_event_type TEXT,
  p_resource   TEXT,
  p_action     TEXT,
  p_status     TEXT,
  p_details    JSONB DEFAULT '{}'::jsonb
) RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT public.log_security_event(p_event_type, p_resource, p_action, p_status, p_details);
$$;

REVOKE EXECUTE ON FUNCTION zapp.log_security_event(TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.log_security_event(TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. log_audit_event (5-arg signature used by audit.ts and LGPDComplianceView.tsx)
--    p_action, p_entity_type DEFAULT NULL, p_entity_id DEFAULT NULL,
--    p_details DEFAULT NULL, p_user_agent DEFAULT NULL
--    Callers: src/lib/audit.ts:48, src/components/compliance/LGPDComplianceView.tsx:28,47,72
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.log_audit_event(
  p_action      TEXT,
  p_entity_type TEXT  DEFAULT NULL,
  p_entity_id   TEXT  DEFAULT NULL,
  p_details     JSONB DEFAULT NULL,
  p_user_agent  TEXT  DEFAULT NULL
) RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT public.log_audit_event(p_action, p_entity_type, p_entity_id, p_details, p_user_agent);
$$;

REVOKE EXECUTE ON FUNCTION zapp.log_audit_event(TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.log_audit_event(TEXT, TEXT, TEXT, JSONB, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. update_own_profile
--    Caller: src/features/auth/hooks/useSecureProfile.ts:24
--    The caller only checks for error — it never reads the returned profile row.
--    Return VOID to avoid exposing a public.profiles composite type cross-schema.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.update_own_profile(
  p_display_name TEXT DEFAULT NULL,
  p_avatar_url   TEXT DEFAULT NULL,
  p_phone        TEXT DEFAULT NULL,
  p_email        TEXT DEFAULT NULL,
  p_signature    TEXT DEFAULT NULL,
  p_birthday     TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT public.update_own_profile(
    p_display_name, p_avatar_url, p_phone, p_email, p_signature, p_birthday
  );
$$;

REVOKE EXECUTE ON FUNCTION zapp.update_own_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.update_own_profile(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. user_has_permission
--    Callers: src/features/auth/hooks/usePermissions.ts:107
--             src/features/auth/components/ProtectedRoute.tsx:80
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.user_has_permission(
  _user_id        UUID,
  _permission_name TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  -- Only allow querying own permissions unless caller is admin/supervisor
  IF _user_id <> auth.uid() AND NOT zapp.is_admin_or_supervisor() THEN
    RETURN FALSE;
  END IF;
  RETURN public.user_has_permission(_user_id, _permission_name);
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.user_has_permission(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.user_has_permission(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. get_team_profiles
--    Callers: src/features/inbox/components/chat/TicketActionsBar.tsx:74
--             src/features/inbox/components/TicketHistorySheet.tsx:236
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.get_team_profiles()
RETURNS TABLE (
  id           UUID,
  user_id      UUID,
  name         TEXT,
  email        TEXT,
  avatar_url   TEXT,
  role         TEXT,
  is_active    BOOLEAN,
  department   TEXT,
  job_title    TEXT,
  phone        TEXT,
  max_chats    INTEGER,
  created_at   TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT * FROM public.get_team_profiles();
$$;

REVOKE EXECUTE ON FUNCTION zapp.get_team_profiles() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.get_team_profiles() TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. search_knowledge_base
--    Caller: src/hooks/useSearchManagement.ts:56
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.search_knowledge_base(
  search_query TEXT,
  max_results  INTEGER DEFAULT 5
) RETURNS TABLE (
  id       UUID,
  title    TEXT,
  content  TEXT,
  category TEXT,
  tags     TEXT[],
  rank     REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT * FROM public.search_knowledge_base(search_query, max_results);
$$;

REVOKE EXECUTE ON FUNCTION zapp.search_knowledge_base(TEXT, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.search_knowledge_base(TEXT, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. contacts_count_by_type
--    Caller: src/features/contacts/hooks/useContactsSearch.ts:221
--    Note: public function returns column named contact_type (not lead_status).
--          Caller in useContactsSearch.ts accesses the field as contact_type.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.contacts_count_by_type()
RETURNS TABLE (contact_type TEXT, count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT * FROM public.contacts_count_by_type();
$$;

REVOKE EXECUTE ON FUNCTION zapp.contacts_count_by_type() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.contacts_count_by_type() TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. get_visible_agent_ids
--    Caller: src/features/admin/hooks/useVisibleAgents.ts:17
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.get_visible_agent_ids(
  _user_id UUID
) RETURNS SETOF UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  -- Only allow querying visibility for own user_id unless caller is admin/supervisor
  IF _user_id <> auth.uid() AND NOT zapp.is_admin_or_supervisor() THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM public.get_visible_agent_ids(_user_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.get_visible_agent_ids(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.get_visible_agent_ids(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. is_within_business_hours
--    Caller: src/hooks/useBusinessHoursManagement.ts:182
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.is_within_business_hours(
  connection_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT public.is_within_business_hours(connection_id);
$$;

REVOKE EXECUTE ON FUNCTION zapp.is_within_business_hours(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.is_within_business_hours(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. rpc_instance_auth_event_trend
--     Callers: src/features/admin/components/instance-pauses/AuthEventTrendChart.tsx:76
--              src/features/admin/components/alerts/AlertInstanceDetailDialog.tsx:62
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_instance_auth_event_trend(
  p_instance TEXT,
  p_hours    INTEGER DEFAULT 24
) RETURNS TABLE (
  bucket            TIMESTAMPTZ,
  instance_name     TEXT,
  success_count     BIGINT,
  failure_count     BIGINT,
  invalid_signature BIGINT,
  auth_401          BIGINT,
  auth_403          BIGINT,
  total             BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT * FROM public.rpc_instance_auth_event_trend(p_instance, p_hours);
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_instance_auth_event_trend(TEXT, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_instance_auth_event_trend(TEXT, INTEGER) TO authenticated;

-- ---------------------------------------------------------------------------
-- 11. rpc_instance_auth_event_summary
--     Caller: src/features/admin/components/instance-pauses/AuthEventTrendChart.tsx:90
--     Note: public function returns (event_type TEXT, total BIGINT) — 2 cols.
--     AuthEventTrendChart expects a richer object (SummaryResp) but casts via
--     `as SummaryResp` — the cast is client-side and the component handles
--     missing fields gracefully. Wrapper forwards public signature verbatim.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.rpc_instance_auth_event_summary(
  p_instance TEXT
) RETURNS TABLE (
  event_type TEXT,
  total      BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
  SELECT * FROM public.rpc_instance_auth_event_summary(p_instance);
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_instance_auth_event_summary(TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_instance_auth_event_summary(TEXT) TO authenticated;
