-- =============================================================================
-- Audit Fixes — Critical, High, and Medium findings from 2026-07-27 audit
--
-- Findings fixed:
--   CRITICAL 1  BUG-19 reintroduced: rpc_list_dispatch_error_logs_cursor used
--               d.created_at AS occurred_at + unused LEFT JOIN + cursor side mismatch
--   CRITICAL 2  Stale now() constant in partial index on processed_requests
--   CRITICAL 3  Stale now() constant in partial index on analytics_events
--   CRITICAL 4  c.telefone → c.phone in get_contact_intelligence_by_phone
--   HIGH 6      Missing REVOKE on rpc_list_dispatch_error_logs_cursor (PUBLIC gets EXECUTE)
--   HIGH 7      Missing REVOKE on rpc_dlq_list_audit_cursor
--   HIGH 8      Missing REVOKE on search_contacts_cursor
--   HIGH 9      zapp.calls SELECT policy USING (true) — no workspace isolation
--   HIGH 11     search_contacts_cursor silently swallows invalid sort_direction (BUG-15 regression)
--   MEDIUM 12   imap_smtp_accounts VIEW grants INSERT/UPDATE/DELETE to authenticated
--   MEDIUM 13   fn_evolution_status_unknown SECDEF has public in search_path
--   MEDIUM 14   fn_refresh_role_permissions_mv SECDEF has public in search_path
--   MEDIUM 15   is_feature_enabled SECDEF has public in search_path
--   MEDIUM 16   fn_touch_updated_at / fn_touch_role_permissions_updated_at missing SET search_path
--   MEDIUM 17   email_tracked_links RLS USING (TRUE) — no tenant isolation
--   MEDIUM 18   get_all_table_names exposes schema to authenticated users (restrict to service_role)
--   NEW BUG-38  AuthProvider subscribes profiles with schema:'public' (no-op) → needs publication too
--   NEW BUG-39  AuthProvider subscribes user_roles with schema:'public' (no-op) → needs publication
--   NEW BUG-40  useBridgeStatus subscribes system_health_incidents with schema:'public' (no-op)
--
-- TypeScript fixes (separate edits):
--   AuthProvider.tsx:424    schema:'public' → schema:'zapp' for profiles
--   AuthProvider.tsx:440    schema:'public' → schema:'zapp' for user_roles
--   useBridgeStatus.ts:202  schema:'public' → schema:'zapp' for system_health_incidents
-- =============================================================================


-- =============================================================================
-- CRITICAL 1 + HIGH 6: Fix rpc_list_dispatch_error_logs_cursor
--   - Remove unused LEFT JOIN evo.evolution_messages (adds planner overhead on partitioned table)
--   - Use d.remote_jid directly (not em.remote_jid from removed join)
--   - Use d.occurred_at directly (not d.created_at AS occurred_at)
--   - Fix cursor: both sides must reference the same column (occurred_at, not created_at)
--   - Add missing REVOKE before GRANT
-- =============================================================================
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
      d.remote_jid,           -- FIX: was em.remote_jid (from removed unused JOIN)
      d.channel_type,
      d.agent_email,
      d.agent_user_id,
      d.error_code,
      d.error_message,
      d.http_status,
      d.retry_count,
      d.payload,
      d.context,
      d.occurred_at           -- FIX: was d.created_at AS occurred_at (wrong column)
    FROM zapp.dispatch_error_logs d
    -- FIX: removed unused LEFT JOIN evo.evolution_messages em (added planner overhead
    --      on a 25-partition table; no columns from em were used in SELECT or WHERE)
    WHERE (p_from       IS NULL OR d.occurred_at >= p_from)
      AND (p_to         IS NULL OR d.occurred_at <= p_to)
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
           SELECT c.occurred_at, c.id     -- FIX: was c.created_at (cursor side mismatch)
           FROM zapp.dispatch_error_logs c
           WHERE c.id = p_cursor_id
         ))
  ORDER BY b.occurred_at DESC, b.id DESC
  LIMIT COALESCE(p_limit, 50);
END;
$$;

REVOKE ALL ON FUNCTION zapp.rpc_list_dispatch_error_logs_cursor(timestamptz, timestamptz, text, text, text, text, int, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.rpc_list_dispatch_error_logs_cursor(timestamptz, timestamptz, text, text, text, text, int, uuid)
  TO authenticated, service_role;


-- =============================================================================
-- HIGH 7: Add missing REVOKE for rpc_dlq_list_audit_cursor
-- =============================================================================
REVOKE ALL ON FUNCTION zapp.rpc_dlq_list_audit_cursor(int, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.rpc_dlq_list_audit_cursor(int, text, uuid)
  TO authenticated, service_role;


-- =============================================================================
-- HIGH 8 + HIGH 11: Fix search_contacts_cursor
--   - Restore RAISE EXCEPTION for invalid sort_direction (BUG-15 regression)
--   - Add missing REVOKE before GRANT
-- =============================================================================