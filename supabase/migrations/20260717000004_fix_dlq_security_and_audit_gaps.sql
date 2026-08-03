-- =============================================================================
-- Migration: 20260717_fix_dlq_security_and_audit_gaps.sql
-- Comprehensive fix for all DLQ/search_contacts RPC security and correctness bugs
-- found during exhaustive PhD-level audit of zapp schema functions.
--
-- Bug inventory (all confirmed against production DB via pg_proc):
--
-- BUG-A: rpc_dlq_retry_now — TWO insecure legacy overloads (OID 1000791, 1000882)
--   • No role check: any authenticated user can reset DLQ items
--   • Sets next_retry_at (column does NOT exist) instead of next_attempt_at
--   Fix: DROP the (uuid) overload; CREATE OR REPLACE the (uuid, uuid) overload
--        with proper zapp.has_role guard and correct column name.
--
-- BUG-B: rpc_dlq_abandon — TWO insecure legacy overloads (OID 1000785, 1000786)
--   • No role check, no audit log
--   Fix: DROP both; tighten canonical overload (add supervisor role + fix search_path).
--
-- BUG-C: rpc_dlq_bulk_abandon — ONE insecure legacy overload (OID 1000787)
--   • No role check, wrong return type (boolean instead of integer)
--   Fix: DROP it; tighten canonical overload (add supervisor role + fix search_path).
--
-- BUG-D: rpc_dlq_bulk_retry_now (OID 1145573)
--   • Calls public.has_role() and public.log_rls_denied() — neither exist in public
--   • Writes to public.audit_logs — does not exist (only zapp.audit_logs exists)
--   Fix: DROP + CREATE with zapp.has_role / zapp.log_rls_denied.
--
-- BUG-E: rpc_dlq_list_audit (OID 547808)
--   • JOIN uses p.id = a.user_id. profiles.id is a surrogate UUID.
--     The auth UID lives in profiles.user_id (FK to auth.users.id).
--     Result: user_name and user_email are ALWAYS NULL in the audit log panel.
--   Fix: Change to p.user_id = a.user_id.
--
-- BUG-F: rpc_dlq_log_item_action — TWO insecure legacy overloads (OID 1000789, 1000790)
--   • No role check: any authenticated user can append to zapp.dlq_audit_log
--   Fix: DROP both; tighten canonical overload (add supervisor role + fix search_path).
--
-- BUG-G: rpc_dlq_log_reprocess_trigger / rpc_dlq_log_reprocess_result
--   • search_path = 'public','evo','zapp','monitoring' — insecure: unqualified
--     names resolved by search_path order, not pinned to zapp schema
--   • Only admin role allowed; supervisors should also be permitted
--   Fix: SET search_path = zapp; add supervisor to role check.
--
-- BUG-H: search_contacts_cursor (OID 1145916)
--   • sort_direction is compared with lowercase literal ('asc') but ORDER BY uses
--     UPPER(sort_direction). Callers passing 'ASC'/'DESC' get correct ORDER BY
--     but wrong cursor direction → broken pagination on page 2+.
--   • sort_direction flows directly into ORDER BY via string concat → ORDER BY
--     injection (e.g. '1 LIMIT 0 UNION SELECT...') is possible.
--   Fix: normalize to v_sort_dir := UPPER(…); validate IN ('ASC','DESC').
--
-- PERF-1: No index on failed_messages.created_at → full-table scan for ORDER BY.
-- PERF-2: Existing partial idx covers only pending/retrying; DLQ panel also queries
--         abandoned/failed rows.
-- PERF-3: No index on next_attempt_at for reprocess-failed-messages edge function.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- BUG-A  rpc_dlq_retry_now
-- ─────────────────────────────────────────────────────────────────────────────

-- DROP insecure single-param overload (OID 1000882)
DROP FUNCTION IF EXISTS zapp.rpc_dlq_retry_now(uuid);

-- CREATE OR REPLACE replaces the two-param overload (OID 1000791 signature uuid,uuid)
CREATE OR REPLACE FUNCTION zapp.rpc_dlq_retry_now(
  p_id      uuid DEFAULT NULL,
  p_item_id uuid DEFAULT NULL   -- backwards-compat alias
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_target  uuid;
  v_updated int;
BEGIN
  IF NOT (zapp.has_role(auth.uid(), 'admin') OR zapp.has_role(auth.uid(), 'supervisor')) THEN
    PERFORM zapp.log_rls_denied(
      'failed_messages', 'admin|supervisor',
      jsonb_build_object('rpc', 'rpc_dlq_retry_now', 'p_id', COALESCE(p_id, p_item_id))
    );
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_target := COALESCE(p_id, p_item_id);
  IF v_target IS NULL THEN RETURN FALSE; END IF;

  UPDATE zapp.failed_messages
     SET status          = 'pending',
         next_attempt_at = now(),    -- was incorrectly next_retry_at in legacy overloads
         updated_at      = now()
   WHERE id     = v_target
     AND status NOT IN ('processing', 'succeeded');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_retry_now(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_retry_now(uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- BUG-B  rpc_dlq_abandon
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS zapp.rpc_dlq_abandon(uuid);           -- OID 1000785
DROP FUNCTION IF EXISTS zapp.rpc_dlq_abandon(uuid, uuid);     -- OID 1000786

-- Fix canonical (p_id uuid, p_reason text) — OID 547806
CREATE OR REPLACE FUNCTION zapp.rpc_dlq_abandon(
  p_id     uuid,
  p_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_updated int;
  v_reason  text;
BEGIN
  IF NOT (zapp.has_role(auth.uid(), 'admin') OR zapp.has_role(auth.uid(), 'supervisor')) THEN
    PERFORM zapp.log_rls_denied(
      'failed_messages', 'admin|supervisor',
      jsonb_build_object('rpc', 'rpc_dlq_abandon', 'p_id', p_id)
    );
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_reason := NULLIF(TRIM(COALESCE(p_reason, '')), '');

  UPDATE zapp.failed_messages
     SET status        = 'abandoned',
         error_message = COALESCE(error_message, '') ||
                         ' [ABANDONED: ' || COALESCE(v_reason, 'no reason given') || ']',
         updated_at    = now()
   WHERE id     = p_id
     AND status NOT IN ('abandoned', 'succeeded');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    INSERT INTO zapp.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(), 'dlq_abandon', 'failed_messages',
      p_id::text,
      jsonb_build_object('reason', v_reason)
    );
  END IF;

  RETURN v_updated > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_abandon(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_abandon(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- BUG-C  rpc_dlq_bulk_abandon
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS zapp.rpc_dlq_bulk_abandon(uuid[]);    -- OID 1000787

-- Fix canonical (p_ids uuid[], p_reason text) — OID 547807
CREATE OR REPLACE FUNCTION zapp.rpc_dlq_bulk_abandon(
  p_ids    uuid[],
  p_reason text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_updated int;
  v_reason  text;
BEGIN
  IF NOT (zapp.has_role(auth.uid(), 'admin') OR zapp.has_role(auth.uid(), 'supervisor')) THEN
    PERFORM zapp.log_rls_denied(
      'failed_messages', 'admin|supervisor',
      jsonb_build_object('rpc', 'rpc_dlq_bulk_abandon', 'ids_count', array_length(p_ids, 1))
    );
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN RETURN 0; END IF;

  IF array_length(p_ids, 1) > 500 THEN
    RAISE EXCEPTION 'Bulk operation limited to 500 rows per call';
  END IF;

  v_reason := NULLIF(TRIM(COALESCE(p_reason, '')), '');

  UPDATE zapp.failed_messages
     SET status        = 'abandoned',
         error_message = COALESCE(error_message, '') ||
                         ' [ABANDONED: ' || COALESCE(v_reason, 'bulk') || ']',
         updated_at    = now()
   WHERE id = ANY(p_ids)
     AND status NOT IN ('abandoned', 'succeeded');

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    INSERT INTO zapp.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (
      auth.uid(), 'dlq_bulk_abandon', 'failed_messages', NULL,
      jsonb_build_object(
        'reason', v_reason,
        'requested', array_length(p_ids, 1),
        'updated', v_updated
      )
    );
  END IF;

  RETURN v_updated;
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_bulk_abandon(uuid[], text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_bulk_abandon(uuid[], text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- BUG-D  rpc_dlq_bulk_retry_now — DROP + CREATE (public.has_role doesn't exist)
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS zapp.rpc_dlq_bulk_retry_now(uuid[], text);

CREATE FUNCTION zapp.rpc_dlq_bulk_retry_now(
  p_ids    uuid[],
  p_reason text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT (zapp.has_role(auth.uid(), 'admin') OR zapp.has_role(auth.uid(), 'supervisor')) THEN
    PERFORM zapp.log_rls_denied(
      'failed_messages', 'admin|supervisor',
      jsonb_build_object('rpc', 'rpc_dlq_bulk_retry_now', 'ids_count', array_length(p_ids, 1))
    );
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN RETURN 0; END IF;

  IF array_length(p_ids, 1) > 500 THEN
    RAISE EXCEPTION 'Bulk operation limited to 500 rows per call';
  END IF;

  UPDATE zapp.failed_messages
     SET next_attempt_at = now(),
         status          = 'pending',
         updated_at      = now()
   WHERE id = ANY(p_ids)
     AND status NOT IN ('processing', 'succeeded');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_bulk_retry_now(uuid[], text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_bulk_retry_now(uuid[], text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- BUG-E  rpc_dlq_list_audit — wrong JOIN column (p.id vs p.user_id)
--
-- profiles.id   = surrogate UUID (gen_random_uuid())
-- profiles.user_id = FK to auth.users.id  ← this is what auth.uid() returns
-- audit_logs.user_id stores the auth UID, so the JOIN must use profiles.user_id.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION zapp.rpc_dlq_list_audit(
  p_limit  integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_action text    DEFAULT NULL
)
RETURNS TABLE(
  id         uuid,
  action     text,
  entity_id  text,
  details    jsonb,
  created_at timestamptz,
  user_id    uuid,
  user_name  text,
  user_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  IF NOT (zapp.has_role(auth.uid(), 'admin') OR zapp.has_role(auth.uid(), 'supervisor')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.action,
    a.entity_id,
    a.details,
    a.created_at,
    a.user_id,
    p.name  AS user_name,
    p.email AS user_email
  FROM zapp.audit_logs a
  LEFT JOIN zapp.profiles p ON p.user_id = a.user_id  -- FIXED: was p.id = a.user_id
  WHERE a.entity_type = 'failed_messages'
    AND a.action LIKE 'dlq_%'
    AND (
      p_action IS NULL
      OR a.action = p_action
      OR (p_action = 'all' AND a.action LIKE 'dlq_%')
    )
  ORDER BY a.created_at DESC
  LIMIT  GREATEST(COALESCE(p_limit,  50), 1)
  OFFSET GREATEST(COALESCE(p_offset,  0), 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_list_audit(integer, integer, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_list_audit(integer, integer, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- BUG-F  rpc_dlq_log_item_action — DROP insecure legacy overloads
-- ─────────────────────────────────────────────────────────────────────────────

-- OID 1000790: (p_item_id uuid, p_action text, p_reason text DEFAULT NULL)
DROP FUNCTION IF EXISTS zapp.rpc_dlq_log_item_action(uuid, text, text);

-- OID 1000789: (p_item_id uuid DEFAULT NULL, p_action text DEFAULT NULL,
--               p_reason text DEFAULT NULL, p_ids uuid[] DEFAULT NULL)
DROP FUNCTION IF EXISTS zapp.rpc_dlq_log_item_action(uuid, text, text, uuid[]);

-- Fix canonical: (p_action text, p_ids uuid[], p_reason text DEFAULT NULL) — OID 547809
CREATE OR REPLACE FUNCTION zapp.rpc_dlq_log_item_action(
  p_action text,
  p_ids    uuid[],
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_action text;
BEGIN
  IF NOT (zapp.has_role(auth.uid(), 'admin') OR zapp.has_role(auth.uid(), 'supervisor')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_action := CASE p_action
    WHEN 'retry'        THEN 'dlq_retry_now'
    WHEN 'abandon'      THEN 'dlq_abandon'
    WHEN 'bulk_retry'   THEN 'dlq_bulk_retry'
    WHEN 'bulk_abandon' THEN 'dlq_bulk_abandon'
    ELSE NULL
  END;

  IF v_action IS NULL THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN RETURN; END IF;

  INSERT INTO zapp.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(), v_action, 'failed_messages',
    CASE WHEN array_length(p_ids, 1) = 1 THEN p_ids[1]::text ELSE NULL END,
    jsonb_build_object(
      'ids',          to_jsonb(p_ids),
      'count',        array_length(p_ids, 1),
      'reason',       p_reason,
      'performed_at', now()
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_log_item_action(text, uuid[], text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_log_item_action(text, uuid[], text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- BUG-G  rpc_dlq_log_reprocess_trigger + rpc_dlq_log_reprocess_result
--        Fix: search_path = zapp; add supervisor to role check.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION zapp.rpc_dlq_log_reprocess_trigger(
  p_source text DEFAULT 'panel'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  IF NOT (zapp.has_role(auth.uid(), 'admin') OR zapp.has_role(auth.uid(), 'supervisor')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO zapp.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'dlq_reprocess_trigger',
    'failed_messages',
    NULL,
    jsonb_build_object(
      'source',       COALESCE(NULLIF(TRIM(p_source), ''), 'panel'),
      'triggered_at', now()
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_log_reprocess_trigger(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_log_reprocess_trigger(text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION zapp.rpc_dlq_log_reprocess_result(
  p_processed integer DEFAULT 0,
  p_succeeded integer DEFAULT 0,
  p_failed    integer DEFAULT 0,
  p_abandoned integer DEFAULT 0,
  p_message   text    DEFAULT NULL,
  p_source    text    DEFAULT 'panel'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp
AS $$
BEGIN
  IF NOT (zapp.has_role(auth.uid(), 'admin') OR zapp.has_role(auth.uid(), 'supervisor')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO zapp.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(),
    'dlq_reprocess_result',
    'failed_messages',
    NULL,
    jsonb_build_object(
      'source',      COALESCE(NULLIF(TRIM(p_source), ''), 'panel'),
      'processed',   GREATEST(COALESCE(p_processed, 0), 0),
      'succeeded',   GREATEST(COALESCE(p_succeeded, 0), 0),
      'failed',      GREATEST(COALESCE(p_failed,    0), 0),
      'abandoned',   GREATEST(COALESCE(p_abandoned, 0), 0),
      'message',     p_message,
      'finished_at', now()
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_log_reprocess_result(integer, integer, integer, integer, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_log_reprocess_result(integer, integer, integer, integer, text, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- BUG-H  search_contacts_cursor — sort_direction injection + case sensitivity
--
-- The existing function (OID 1145916) uses sort_direction in two places:
--   1. UPPER(sort_direction) → ORDER BY clause (correct, but injectable)
--   2. IF sort_direction = 'asc' → cursor direction (case-sensitive bug)
--
-- A call with sort_direction = 'ASC': ORDER BY ASC but cursor uses < (wrong).
-- Injection: sort_direction = '1 LIMIT 0 UNION SELECT...' escapes into ORDER BY.
--
-- Fix: normalize v_sort_dir := UPPER(COALESCE(sort_direction, 'ASC')); validate
--      IN ('ASC','DESC'); use v_sort_dir everywhere.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS zapp.search_contacts_cursor(text, text, text, text, text, timestamptz, text, text, integer, uuid);

CREATE FUNCTION zapp.search_contacts_cursor(
  search_term         text        DEFAULT '',
  sort_field          text        DEFAULT 'name',
  sort_direction      text        DEFAULT 'asc',
  contact_type_filter text        DEFAULT NULL,
  company_filter      text        DEFAULT NULL,
  date_from           timestamptz DEFAULT NULL,
  job_title_filter    text        DEFAULT NULL,
  tag_filter          text        DEFAULT NULL,
  page_size           integer     DEFAULT 50,
  cursor_id           uuid        DEFAULT NULL
)
RETURNS TABLE(
  id           uuid,
  name         text,
  nickname     text,
  surname      text,
  job_title    text,
  company      text,
  phone        text,
  email        text,
  avatar_url   text,
  tags         text[],
  notes        text,
  contact_type text,
  created_at   timestamptz,
  updated_at   timestamptz,
  total_count  bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = zapp
AS $$
DECLARE
  v_query     text;
  v_sort_dir  text;
  v_sort_expr text;
  v_where     text;
BEGIN
  -- Normalize and validate: prevents ORDER BY injection and case bugs
  v_sort_dir := UPPER(COALESCE(sort_direction, 'ASC'));
  IF v_sort_dir NOT IN ('ASC', 'DESC') THEN
    v_sort_dir := 'ASC';
  END IF;

  v_sort_expr := CASE
    WHEN sort_field = 'created_at' THEN 'created_at ' || v_sort_dir || ', id ' || v_sort_dir
    WHEN sort_field = 'updated_at' THEN 'updated_at ' || v_sort_dir || ', id ' || v_sort_dir
    ELSE                                 'name '       || v_sort_dir || ', id ' || v_sort_dir
  END;

  v_where := 'WHERE 1=1';

  IF search_term != '' THEN
    v_where := v_where || ' AND (c.name ILIKE $1 OR c.email ILIKE $1 OR c.phone ILIKE $1)';
  END IF;
  IF contact_type_filter IS NOT NULL THEN v_where := v_where || ' AND c.contact_type = $2';    END IF;
  IF company_filter      IS NOT NULL THEN v_where := v_where || ' AND c.company ILIKE $3';     END IF;
  IF job_title_filter    IS NOT NULL THEN v_where := v_where || ' AND c.job_title ILIKE $4';   END IF;
  IF tag_filter          IS NOT NULL THEN v_where := v_where || ' AND $5 = ANY(c.tags)';       END IF;
  IF date_from           IS NOT NULL THEN v_where := v_where || ' AND c.created_at >= $6';     END IF;
  IF cursor_id           IS NOT NULL THEN
    -- Use v_sort_dir (normalized) — was sort_direction (raw, case-sensitive) in old version
    IF v_sort_dir = 'ASC' THEN v_where := v_where || ' AND c.id > $7::uuid';
    ELSE                        v_where := v_where || ' AND c.id < $7::uuid';
    END IF;
  END IF;

  v_query :=
    'SELECT c.id, c.name::text, c.nickname, c.surname, c.job_title,
            c.company::text, c.phone, c.email::text, c.avatar_url,
            c.tags, c.notes, c.contact_type, c.created_at, c.updated_at,
            COUNT(*) OVER()::bigint AS total_count
     FROM zapp.contacts c
     ' || v_where || '
     ORDER BY ' || v_sort_expr || '
     LIMIT $8';

  RETURN QUERY EXECUTE v_query
    USING '%' || search_term || '%',
          contact_type_filter,
          '%' || COALESCE(company_filter,   '') || '%',
          '%' || COALESCE(job_title_filter, '') || '%',
          tag_filter,
          date_from,
          cursor_id,
          page_size;
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.search_contacts_cursor(text, text, text, text, text, timestamptz, text, text, integer, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.search_contacts_cursor(text, text, text, text, text, timestamptz, text, text, integer, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- PERF  Indexes on zapp.failed_messages
-- ─────────────────────────────────────────────────────────────────────────────

-- For ORDER BY created_at DESC in rpc_list_failed_messages and rpc_dlq_list_audit
CREATE INDEX IF NOT EXISTS idx_failed_messages_created_at
  ON zapp.failed_messages (created_at DESC);

-- Replace narrow partial index (only pending/retrying) with a full (status, created_at)
-- index so the admin panel can efficiently filter by abandoned/failed as well.
DROP INDEX IF EXISTS zapp.idx_failed_messages_status;

CREATE INDEX IF NOT EXISTS idx_failed_messages_status_created
  ON zapp.failed_messages (status, created_at DESC);

-- For reprocess-failed-messages edge function:
--   WHERE status = 'pending' AND next_attempt_at <= now()
CREATE INDEX IF NOT EXISTS idx_failed_messages_next_attempt
  ON zapp.failed_messages (next_attempt_at)
  WHERE status = 'pending';
