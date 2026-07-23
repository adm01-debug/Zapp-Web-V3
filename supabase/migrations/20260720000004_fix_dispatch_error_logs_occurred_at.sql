-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 20260720000004_fix_dispatch_error_logs_occurred_at.sql
-- Purpose  : Fix two related bugs in DLQ dispatch error log RPCs
--
-- C3 (MEDIUM) — rpc_list_dispatch_error_logs_cursor
--   Bug 1: `d.created_at AS occurred_at` aliases the wrong column.
--          The table has a dedicated `occurred_at` column that records when
--          the dispatch failure actually occurred (distinct from row insertion
--          time `created_at`). Fix: use `d.occurred_at` directly.
--   Bug 2: cursor keyset compares ROW(b.occurred_at, b.id) vs
--          ROW(c.created_at, c.id) — mismatched columns on each side.
--          When paginating, the cursor pivot uses `created_at` but the base
--          rows are ordered by `occurred_at`, so the keyset comparison is
--          semantically wrong and produces incorrect page boundaries.
--          Fix: align both sides to `occurred_at`.
--
-- A2 (MEDIUM) — rpc_list_dispatch_error_logs
--   Bug: `FROM public.dispatch_error_logs d` inside a function with
--        `SET search_path = zapp`. The unqualified name resolves to
--        `zapp.dispatch_error_logs` (the physical table). Using the
--        explicit `public.` qualifier hits the proxy VIEW in public schema
--        instead, adding a resolution hop and bypassing any future
--        direct-table policies on the physical table.
--        Fix: change to the unqualified name (resolves to zapp via search_path).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Fix: rpc_list_dispatch_error_logs_cursor ────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.rpc_list_dispatch_error_logs_cursor(
  p_from       timestamptz DEFAULT NULL,
  p_to         timestamptz DEFAULT NULL,
  p_instance   text        DEFAULT NULL,
  p_agent      text        DEFAULT NULL,
  p_error_code text        DEFAULT NULL,
  p_search     text        DEFAULT NULL,
  p_limit      integer     DEFAULT 50,
  p_cursor_id  uuid        DEFAULT NULL
)
RETURNS TABLE(
  id               uuid,
  failed_message_id uuid,
  instance_name    text,
  remote_jid       text,
  channel_type     text,
  agent_email      text,
  agent_user_id    uuid,
  error_code       text,
  error_message    text,
  http_status      integer,
  retry_count      integer,
  payload          jsonb,
  context          jsonb,
  occurred_at      timestamptz,
  total_count      bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'zapp'
AS $$
BEGIN
  IF NOT (zapp.has_role(auth.uid(), 'admin') OR zapp.has_role(auth.uid(), 'supervisor')) THEN
    PERFORM zapp.log_rls_denied('dispatch_error_logs', 'admin|supervisor',
      jsonb_build_object('rpc', 'rpc_list_dispatch_error_logs_cursor'));
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT d.id, d.failed_message_id, d.instance_name,
           d.remote_jid, d.channel_type, d.agent_email, d.agent_user_id,
           d.error_code, d.error_message, d.http_status, d.retry_count,
           d.payload, d.context,
           d.occurred_at  -- FIX C3: was d.created_at AS occurred_at
    FROM dispatch_error_logs d  -- resolves to zapp.dispatch_error_logs via search_path
    WHERE (p_from IS NULL OR d.occurred_at >= p_from)
      AND (p_to   IS NULL OR d.occurred_at <= p_to)
      AND (p_instance   IS NULL OR d.instance_name = p_instance)
      AND (p_agent      IS NULL OR d.agent_email   = p_agent)
      AND (p_error_code IS NULL OR d.error_code    = p_error_code)
      AND (p_search IS NULL OR d.error_message ILIKE '%' || p_search || '%'
                            OR d.error_code    ILIKE '%' || p_search || '%')
  ),
  total AS (SELECT COUNT(*)::bigint AS cnt FROM base)
  SELECT b.id, b.failed_message_id, b.instance_name, b.remote_jid,
         b.channel_type, b.agent_email, b.agent_user_id, b.error_code,
         b.error_message, b.http_status, b.retry_count, b.payload,
         b.context, b.occurred_at, t.cnt
  FROM base b, total t
  WHERE (p_cursor_id IS NULL OR
         -- FIX C3: both sides now use occurred_at (was c.created_at on right side)
         ROW(b.occurred_at, b.id) < (
           SELECT ROW(c.occurred_at, c.id)
           FROM dispatch_error_logs c
           WHERE c.id = p_cursor_id
         ))
  ORDER BY b.occurred_at DESC, b.id DESC
  LIMIT COALESCE(p_limit, 50);
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_list_dispatch_error_logs_cursor(
  timestamptz, timestamptz, text, text, text, text, integer, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.rpc_list_dispatch_error_logs_cursor(
  timestamptz, timestamptz, text, text, text, text, integer, uuid
) TO authenticated;

-- ─── Fix: rpc_list_dispatch_error_logs (offset-based) ────────────────────────
-- Drop and recreate so the FROM clause references the physical zapp table.
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
    -- FIX A2: unqualified name resolves to zapp.dispatch_error_logs (physical table)
    -- instead of public.dispatch_error_logs (proxy view) that the prior migration used
    SELECT d.*
    FROM dispatch_error_logs d
    WHERE (p_from IS NULL OR d.occurred_at >= p_from)
      AND (p_to   IS NULL OR d.occurred_at <= p_to)
      AND (p_instance   IS NULL OR d.instance_name = p_instance)
      AND (p_agent      IS NULL OR d.agent_email   = p_agent)
      AND (p_error_code IS NULL OR d.error_code    = p_error_code)
      AND (
        v_search IS NULL OR (
          d.remote_jid    ILIKE '%' || v_search || '%' OR
          d.error_message ILIKE '%' || v_search || '%' OR
          d.error_code    ILIKE '%' || v_search || '%'
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
GRANT EXECUTE ON FUNCTION zapp.rpc_list_dispatch_error_logs(
  TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER
) TO authenticated;
