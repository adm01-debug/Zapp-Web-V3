-- =============================================================================
-- Migration: 20260717_fix_missing_zapp_functions.sql
-- Fixes two functions that are completely absent from the production DB
-- after the 20260716 and 20260717 migration runs (confirmed via pg_proc: 0 rows).
--
-- MISSING-1: zapp.rpc_dlq_bulk_retry_now
--   The 20260717_fix_dlq_mutation_rpcs_zapp_schema.sql used CREATE OR REPLACE,
--   but the pre-existing version (moved from public by 20260716) had a different
--   return type or signature. PostgreSQL rejects CREATE OR REPLACE when the
--   return type changes, causing a silent failure that left the function absent
--   from all schemas. This migration uses DROP + CREATE to force-recreate it.
--
-- MISSING-2: zapp.search_contacts_cursor
--   Originally created in public by 20260712001500_cursor_pagination_optimization.sql.
--   The 20260716 migration attempted to move it to zapp. The move logic drops the
--   public version if a zapp version already exists (or was just created); if the
--   move itself failed for any reason, both versions were left absent.
--   Called from: src/features/contacts/hooks/useContactsSearch.ts:167
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. rpc_dlq_bulk_retry_now — bulk mark DLQ items for immediate retry
--    Called from: src/features/admin/hooks/monitoring/useFailedMessages.ts:199
--      supabase.rpc('rpc_dlq_bulk_retry_now', { p_ids: ids, p_reason: reason })
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

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  IF array_length(p_ids, 1) > 500 THEN
    RAISE EXCEPTION 'Bulk operation limited to 500 rows per call';
  END IF;

  UPDATE zapp.failed_messages
     SET next_attempt_at = now(),
         status          = 'pending',
         updated_at      = now()
   WHERE id = ANY(p_ids)
     AND status IN ('pending', 'retrying', 'abandoned', 'failed');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_bulk_retry_now(uuid[], text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_bulk_retry_now(uuid[], text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. search_contacts_cursor — cursor-paginated contact search
--    Called from: src/features/contacts/hooks/useContactsSearch.ts:167
--      supabase.rpc('search_contacts_cursor', { search_term, contact_type_filter,
--        company_filter, job_title_filter, tag_filter, date_from,
--        sort_field, sort_direction, page_size, cursor_id })
--
--    Uses SECURITY INVOKER so RLS on the underlying contacts table applies.
--    Uses public.contacts view (one of the 535 public proxy views) which maps to
--    the contacts table moved to zapp schema by the 20260716 migration.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS zapp.search_contacts_cursor(text, text, text, text, text, timestamptz, text, text, integer, uuid);

CREATE FUNCTION zapp.search_contacts_cursor(
  search_term         text        DEFAULT '',
  contact_type_filter text        DEFAULT NULL,
  company_filter      text        DEFAULT NULL,
  job_title_filter    text        DEFAULT NULL,
  tag_filter          text        DEFAULT NULL,
  date_from           timestamptz DEFAULT NULL,
  sort_field          text        DEFAULT 'name',
  sort_direction      text        DEFAULT 'asc',
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
  v_sort_expr text;
  v_where     text;
BEGIN
  v_sort_expr := CASE
    WHEN sort_field = 'created_at' THEN 'created_at ' || UPPER(sort_direction) || ', id ' || UPPER(sort_direction)
    WHEN sort_field = 'updated_at' THEN 'updated_at ' || UPPER(sort_direction) || ', id ' || UPPER(sort_direction)
    ELSE 'name ' || UPPER(sort_direction) || ', id ' || UPPER(sort_direction)
  END;

  v_where := 'WHERE 1=1';

  IF search_term != '' THEN
    v_where := v_where || ' AND (c.name ILIKE $1 OR c.email ILIKE $1 OR c.phone ILIKE $1)';
  END IF;

  IF contact_type_filter IS NOT NULL THEN
    v_where := v_where || ' AND c.contact_type = $2';
  END IF;

  IF company_filter IS NOT NULL THEN
    v_where := v_where || ' AND c.company ILIKE $3';
  END IF;

  IF job_title_filter IS NOT NULL THEN
    v_where := v_where || ' AND c.job_title ILIKE $4';
  END IF;

  IF tag_filter IS NOT NULL THEN
    v_where := v_where || ' AND $5 = ANY(c.tags)';
  END IF;

  IF date_from IS NOT NULL THEN
    v_where := v_where || ' AND c.created_at >= $6';
  END IF;

  IF cursor_id IS NOT NULL THEN
    IF sort_direction = 'asc' THEN
      v_where := v_where || ' AND c.id > $7::uuid';
    ELSE
      v_where := v_where || ' AND c.id < $7::uuid';
    END IF;
  END IF;

  v_query :=
    'SELECT c.id, c.name, c.nickname, c.surname, c.job_title, c.company, c.phone, c.email,
            c.avatar_url, c.tags, c.notes, c.contact_type, c.created_at, c.updated_at,
            COUNT(*) OVER()::bigint AS total_count
     FROM public.contacts c
     ' || v_where || '
     ORDER BY ' || v_sort_expr || '
     LIMIT $8';

  RETURN QUERY EXECUTE v_query
    USING '%' || search_term || '%',
          contact_type_filter,
          '%' || COALESCE(company_filter, '') || '%',
          '%' || COALESCE(job_title_filter, '') || '%',
          tag_filter,
          date_from,
          cursor_id,
          page_size;
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.search_contacts_cursor(text, text, text, text, text, timestamptz, text, text, integer, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.search_contacts_cursor(text, text, text, text, text, timestamptz, text, text, integer, uuid) TO authenticated;
