-- MELHORIA #8 — Correct & deploy zapp.rpc_list_failed_messages_cursor (GAP-7)
--
-- The prior migration (20260716_fix_rpc_list_failed_messages_cursor_columns.sql)
-- had not been applied to the self-hosted instance, and contained two further bugs:
--
--   A) Calls public.has_role() — function does NOT exist in public; only zapp.has_role().
--   B) RETURNS TABLE declares http_status as integer, but zapp.failed_messages.http_status
--      is numeric.  PostgreSQL allows the implicit coercion in assignment context, but
--      explicit CAST avoids any edge-case OID mismatch.
--
-- This migration supersedes 20260716_fix_rpc_list_failed_messages_cursor_columns.sql.
-- The original 8 bugs documented there are also fixed here.

-- Drop stale copies from public schema
DROP FUNCTION IF EXISTS public.rpc_list_failed_messages_cursor(text[], text, text, timestamptz, timestamptz, integer, uuid);
DROP FUNCTION IF EXISTS public.rpc_list_failed_messages_cursor(text[], text, text, timestamptz, timestamptz, integer, uuid, text);

CREATE OR REPLACE FUNCTION zapp.rpc_list_failed_messages_cursor(
  p_status     text[]    DEFAULT NULL,
  p_instance   text      DEFAULT NULL,
  p_search     text      DEFAULT NULL,
  p_from       timestamptz DEFAULT NULL,
  p_to         timestamptz DEFAULT NULL,
  p_limit      integer   DEFAULT 50,
  p_cursor_id  uuid      DEFAULT NULL,
  p_error_code text      DEFAULT NULL
)
RETURNS TABLE(
  id              uuid,
  instance_name   text,
  remote_jid      text,
  payload         jsonb,
  error_code      text,
  error_message   text,
  http_status     integer,
  retry_count     integer,
  max_retries     integer,
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
SET search_path = zapp, pg_catalog
AS $$
BEGIN
  IF NOT (zapp.has_role(auth.uid(), 'admin'::zapp.app_role)
          OR zapp.has_role(auth.uid(), 'supervisor'::zapp.app_role)) THEN
    PERFORM zapp.log_rls_denied(
      'failed_messages', 'admin|supervisor',
      jsonb_build_object(
        'rpc', 'rpc_list_failed_messages_cursor',
        'filters', jsonb_build_object(
          'status', p_status, 'instance', p_instance, 'search', p_search
        )
      )
    );
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    -- Full filtered set (no cursor) so total_count is stable across pages
    SELECT
      fm.id,
      fm.instance_name,
      fm.remote_jid,
      fm.payload,
      fm.error_code,
      fm.error_message,
      fm.http_status::integer,
      fm.retry_count,
      fm.max_retries::integer,
      fm.status,
      fm.last_attempt_at,
      fm.next_attempt_at,
      fm.succeeded_at,
      fm.created_at,
      fm.updated_at
    FROM zapp.failed_messages fm
    WHERE (p_status   IS NULL OR fm.status        = ANY(p_status))
      AND (p_instance IS NULL OR fm.instance_name = p_instance)
      AND (p_search   IS NULL
           OR fm.error_message ILIKE '%' || p_search || '%'
           OR fm.error_code    ILIKE '%' || p_search || '%'
           OR fm.remote_jid    ILIKE '%' || p_search || '%')
      AND (p_from IS NULL OR fm.created_at >= p_from)
      AND (p_to   IS NULL OR fm.created_at <= p_to)
      -- Server-side error_code filter mirrors JS synthesised codes:
      --   • real error_code column value
      --   • NULL code + http_status  → 'http_NNN'
      --   • NULL code + NULL status  → 'unknown'
      AND (p_error_code IS NULL
           OR fm.error_code = p_error_code
           OR (fm.error_code IS NULL AND fm.http_status IS NOT NULL
               AND 'http_' || fm.http_status::text = p_error_code)
           OR (fm.error_code IS NULL AND fm.http_status IS NULL
               AND p_error_code = 'unknown'))
  ),
  total AS (
    SELECT COUNT(*)::bigint AS cnt FROM base
  )
  SELECT
    b.id,
    b.instance_name,
    b.remote_jid,
    b.payload,
    b.error_code,
    b.error_message,
    b.http_status,
    b.retry_count,
    b.max_retries,
    b.status,
    b.last_attempt_at,
    b.next_attempt_at,
    b.succeeded_at,
    b.created_at,
    b.updated_at,
    t.cnt AS total_count
  FROM base b, total t
  WHERE (p_cursor_id IS NULL
         OR ROW(b.created_at, b.id) < (
               SELECT ROW(c.created_at, c.id)
               FROM zapp.failed_messages c
               WHERE c.id = p_cursor_id
            ))
  ORDER BY b.created_at DESC, b.id DESC
  LIMIT COALESCE(p_limit, 50);
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_list_failed_messages_cursor(text[], text, text, timestamptz, timestamptz, integer, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_list_failed_messages_cursor(text[], text, text, timestamptz, timestamptz, integer, uuid, text) TO authenticated;
