-- =============================================================================
-- Migration: 20260717_fix_dlq_rpc_schema_drift.sql
-- Fixes two schema-drift bugs found during post-merge audit (2026-07-17):
--
-- BUG-1: zapp.rpc_list_failed_messages(text, ...) references abandoned_at and
--   abandon_reason columns that do not exist in zapp.failed_messages. Any call
--   that resolves to this overload (e.g. when p_status IS NULL, PostgreSQL
--   prefers text over text[]) results in:
--     ERROR: column fm.abandoned_at does not exist
--   The text[] overload also returns a narrow column set (message_id,
--   next_retry_at) that does not match the FailedMessageRow TypeScript type,
--   causing silent undefined values for error_code, http_status, payload, etc.
--
-- BUG-2: zapp.rpc_dlq_stats() returns {pending, retrying, failed, total} but
--   the DlqStats frontend type expects {total, total_24h, oldest_pending_at,
--   by_status, by_instance}. KPI cards in the DLQ panel render empty/undefined.
--
-- Fix strategy:
--   1. DROP the broken text overload of rpc_list_failed_messages.
--   2. REPLACE the text[] overload to return all FailedMessageRow columns.
--   3. REPLACE rpc_dlq_stats to return the full DlqStats shape.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Drop both overloads (RETURNS TABLE changed — CREATE OR REPLACE would fail)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS zapp.rpc_list_failed_messages(
  text, text, text, timestamptz, timestamptz, integer, integer
);
DROP FUNCTION IF EXISTS zapp.rpc_list_failed_messages(
  text[], text, text, timestamptz, timestamptz, integer, integer
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Create unified text[] overload — returns all FailedMessageRow columns
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION zapp.rpc_list_failed_messages(
  p_status   text[]    DEFAULT NULL,
  p_instance text      DEFAULT NULL,
  p_search   text      DEFAULT NULL,
  p_from     timestamptz DEFAULT NULL,
  p_to       timestamptz DEFAULT NULL,
  p_limit    integer   DEFAULT 50,
  p_offset   integer   DEFAULT 0
)
RETURNS TABLE(
  id              uuid,
  instance_name   text,
  remote_jid      text,
  payload         jsonb,
  error_code      text,
  error_message   text,
  http_status     numeric,
  retry_count     integer,
  max_retries     numeric,
  status          text,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz,
  succeeded_at    timestamptz,
  created_at      timestamptz,
  updated_at      timestamptz,
  total_count     bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  IF NOT (zapp.has_role(auth.uid(), 'admin') OR zapp.has_role(auth.uid(), 'supervisor')) THEN
    PERFORM zapp.log_rls_denied(
      'failed_messages', 'admin|supervisor',
      jsonb_build_object(
        'rpc', 'rpc_list_failed_messages',
        'filters', jsonb_build_object(
          'status', p_status, 'instance', p_instance, 'search', p_search
        )
      )
    );
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    fm.id,
    fm.instance_name,
    fm.remote_jid,
    fm.payload,
    fm.error_code,
    fm.error_message,
    fm.http_status,
    fm.retry_count,
    fm.max_retries,
    fm.status,
    fm.last_attempt_at,
    fm.next_attempt_at,
    fm.succeeded_at,
    fm.created_at,
    fm.updated_at,
    COUNT(*) OVER()::bigint AS total_count
  FROM zapp.failed_messages fm
  WHERE
    (p_status IS NULL OR fm.status = ANY(p_status))
    AND (p_instance IS NULL OR fm.instance_name = p_instance)
    AND (p_search IS NULL
         OR fm.remote_jid ILIKE '%' || p_search || '%'
         OR fm.error_message ILIKE '%' || p_search || '%'
         OR fm.message_id ILIKE '%' || p_search || '%')
    AND (p_from IS NULL OR fm.created_at >= p_from)
    AND (p_to   IS NULL OR fm.created_at <= p_to)
  ORDER BY fm.created_at DESC
  LIMIT  COALESCE(p_limit,  50)
  OFFSET COALESCE(p_offset, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_list_failed_messages(
  text[], text, text, timestamptz, timestamptz, integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.rpc_list_failed_messages(
  text[], text, text, timestamptz, timestamptz, integer, integer
) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Replace rpc_dlq_stats — return full DlqStats shape
--    Frontend type: { total, total_24h, oldest_pending_at, by_status, by_instance }
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.rpc_dlq_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_total            bigint;
  v_total_24h        bigint;
  v_oldest_pending   timestamptz;
  v_by_status        jsonb;
  v_by_instance      jsonb;
BEGIN
  IF NOT (zapp.has_role(auth.uid(), 'admin') OR zapp.has_role(auth.uid(), 'supervisor')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*) INTO v_total FROM zapp.failed_messages;

  SELECT COUNT(*) INTO v_total_24h
  FROM zapp.failed_messages
  WHERE created_at >= NOW() - INTERVAL '24 hours';

  SELECT MIN(created_at) INTO v_oldest_pending
  FROM zapp.failed_messages
  WHERE status = 'pending';

  SELECT jsonb_object_agg(status, cnt) INTO v_by_status
  FROM (
    SELECT status, COUNT(*) AS cnt
    FROM zapp.failed_messages
    GROUP BY status
  ) s;

  SELECT jsonb_agg(jsonb_build_object('instance', instance_name, 'count', cnt) ORDER BY cnt DESC)
  INTO v_by_instance
  FROM (
    SELECT instance_name, COUNT(*) AS cnt
    FROM zapp.failed_messages
    GROUP BY instance_name
    ORDER BY cnt DESC
    LIMIT 10
  ) i;

  RETURN jsonb_build_object(
    'total',             COALESCE(v_total, 0),
    'total_24h',         COALESCE(v_total_24h, 0),
    'oldest_pending_at', v_oldest_pending,
    'by_status',         COALESCE(v_by_status, '{}'::jsonb),
    'by_instance',       COALESCE(v_by_instance, '[]'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_stats() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_stats() TO authenticated;
