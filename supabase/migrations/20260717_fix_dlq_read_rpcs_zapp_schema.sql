-- =============================================================================
-- Migration: 20260717_fix_dlq_read_rpcs_zapp_schema.sql
-- Fixes schema drift for two DLQ read RPCs (2026-07-17 post-merge audit):
--
-- BUG-1: rpc_list_dispatch_error_logs only exists in `public` schema.
--   The Supabase client is configured with db.schema='zapp', so PostgREST
--   sends Content-Profile: zapp and resolves functions only in zapp.
--   Calling supabase.rpc('rpc_list_dispatch_error_logs', ...) → PGRST202.
--   Only rpc_list_dispatch_error_logs_cursor was moved to zapp by
--   20260716_fix_public_to_zapp_schema.sql; the non-cursor variant was missed.
--
-- BUG-2: rpc_dlq_list_audit only exists in `public` schema for the same reason.
--   Only rpc_dlq_list_audit_cursor was moved; the non-cursor variant was missed.
--
-- Fix strategy:
--   Create both functions directly in the zapp schema.
--   dispatch_error_logs table lives in public — reference it explicitly.
--   audit_logs and profiles are accessible as zapp.audit_logs / zapp.profiles.
--   Role check uses zapp.has_role() / zapp.log_rls_denied() consistent with
--   other zapp-schema RPCs (rpc_list_failed_messages, rpc_dlq_stats, etc.).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. rpc_list_dispatch_error_logs — paginated read of the dispatch_error_logs
--    audit trail, gated to admin/supervisor via zapp.has_role.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.rpc_list_dispatch_error_logs(
  p_from       TIMESTAMPTZ DEFAULT NULL,
  p_to         TIMESTAMPTZ DEFAULT NULL,
  p_instance   TEXT        DEFAULT NULL,
  p_agent      TEXT        DEFAULT NULL,
  p_error_code TEXT        DEFAULT NULL,
  p_search     TEXT        DEFAULT NULL,
  p_limit      INTEGER     DEFAULT 50,
  p_offset     INTEGER     DEFAULT 0
)
RETURNS TABLE (
  id               UUID,
  failed_message_id UUID,
  instance_name    TEXT,
  remote_jid       TEXT,
  channel_type     TEXT,
  agent_email      TEXT,
  agent_user_id    UUID,
  error_code       TEXT,
  error_message    TEXT,
  http_status      INTEGER,
  retry_count      INTEGER,
  payload          JSONB,
  context          JSONB,
  occurred_at      TIMESTAMPTZ,
  total_count      BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_limit  INTEGER;
  v_search TEXT;
BEGIN
  IF NOT (zapp.has_role(auth.uid(), 'admin') OR zapp.has_role(auth.uid(), 'supervisor')) THEN
    PERFORM zapp.log_rls_denied(
      'dispatch_error_logs', 'admin|supervisor',
      jsonb_build_object('rpc', 'rpc_list_dispatch_error_logs',
        'filters', jsonb_build_object(
          'instance', p_instance, 'agent', p_agent, 'error_code', p_error_code
        ))
    );
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_limit  := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500);
  v_search := NULLIF(TRIM(COALESCE(p_search, '')), '');

  RETURN QUERY
  WITH filtered AS (
    SELECT d.*
    FROM public.dispatch_error_logs d
    WHERE (p_from IS NULL OR d.occurred_at >= p_from)
      AND (p_to   IS NULL OR d.occurred_at <= p_to)
      AND (p_instance   IS NULL OR d.instance_name = p_instance)
      AND (p_agent      IS NULL OR d.agent_email   = p_agent)
      AND (p_error_code IS NULL OR d.error_code    = p_error_code)
      AND (
        v_search IS NULL OR (
          d.remote_jid   ILIKE '%' || v_search || '%' OR
          d.error_message ILIKE '%' || v_search || '%' OR
          d.error_code   ILIKE '%' || v_search || '%'
        )
      )
  ), counted AS (
    SELECT COUNT(*)::BIGINT AS total FROM filtered
  )
  SELECT
    f.id, f.failed_message_id, f.instance_name, f.remote_jid,
    f.channel_type, f.agent_email, f.agent_user_id,
    f.error_code, f.error_message, f.http_status, f.retry_count,
    f.payload, f.context, f.occurred_at,
    c.total
  FROM filtered f
  CROSS JOIN counted c
  ORDER BY f.occurred_at DESC
  LIMIT  v_limit
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_list_dispatch_error_logs(
  TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER
) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_list_dispatch_error_logs(
  TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER
) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. rpc_dlq_list_audit — paginated DLQ audit log read from zapp.audit_logs,
--    joined with zapp.profiles for actor name/email, gated to admin/supervisor.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.rpc_dlq_list_audit(
  p_limit  INTEGER DEFAULT 30,
  p_offset INTEGER DEFAULT 0,
  p_action TEXT    DEFAULT NULL
)
RETURNS TABLE (
  id         UUID,
  action     TEXT,
  entity_id  TEXT,
  details    JSONB,
  created_at TIMESTAMPTZ,
  user_id    UUID,
  user_name  TEXT,
  user_email TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  IF NOT (zapp.has_role(auth.uid(), 'admin') OR zapp.has_role(auth.uid(), 'supervisor')) THEN
    PERFORM zapp.log_rls_denied(
      'dlq_audit_log', 'admin|supervisor',
      jsonb_build_object('rpc', 'rpc_dlq_list_audit', 'action', p_action)
    );
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
  ORDER BY al.created_at DESC
  LIMIT  COALESCE(p_limit,  30)
  OFFSET COALESCE(p_offset, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_list_audit(INTEGER, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_list_audit(INTEGER, INTEGER, TEXT) TO authenticated;
