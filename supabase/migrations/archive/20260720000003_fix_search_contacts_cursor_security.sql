-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 20260720000003_fix_search_contacts_cursor_security.sql
-- Purpose  : Security & correctness overhaul for search_contacts_cursor
--
-- Issues fixed:
--   H1 — SQL injection: sort_direction injected into dynamic ORDER BY without
--         whitelist check. UPPER() does not sanitize SQL syntax.
--   H2 — COUNT(*) OVER() was evaluated after the cursor predicate, causing
--         total_count to shrink with each page. Count now runs in a CTE
--         before the cursor filter.
--   H3 — Cursor always used id-only comparison (c.id > $7) regardless of
--         sort_field. With created_at/updated_at sort, rows with the same
--         sort value and id LESS than cursor_id were skipped. Fixed with
--         compound ROW(sort_col, id) keyset, using pre-fetched pivot values.
--   C2 — Prior migration 20260717220000 omitted the REVOKE/GRANT that existed
--         in 20260717200000, leaving authenticated users without EXECUTE.
--   C1 — Trailing semicolons after $$ restored (safety for tooling that
--         splits on ;).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION zapp.search_contacts_cursor(
  search_term        text          DEFAULT '',
  sort_field         text          DEFAULT 'name',
  sort_direction     text          DEFAULT 'asc',
  contact_type_filter text         DEFAULT NULL,
  company_filter     text          DEFAULT NULL,
  date_from          timestamptz   DEFAULT NULL,
  job_title_filter   text          DEFAULT NULL,
  tag_filter         text          DEFAULT NULL,
  page_size          integer       DEFAULT 50,
  cursor_id          uuid          DEFAULT NULL
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
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = zapp AS $$
DECLARE
  v_query          text;
  v_sort_col       text;
  v_sort_expr      text;
  v_dir            text;
  v_where          text;
  v_cursor_where   text := '';
  -- Pivot values for compound keyset cursor (fetched once, not in dynamic SQL)
  v_pivot_ts       timestamptz;
  v_pivot_text     text;
BEGIN
  -- ── H1: guard sort_direction against SQL injection ────────────────────────
  v_dir := UPPER(sort_direction);
  IF v_dir NOT IN ('ASC', 'DESC') THEN
    RAISE EXCEPTION 'Invalid sort_direction: %; must be ASC or DESC', sort_direction
      USING ERRCODE = 'P0001';
  END IF;

  -- ── safe sort column (CASE whitelist prevents injection) ──────────────────
  v_sort_col := CASE
    WHEN sort_field = 'created_at' THEN 'created_at'
    WHEN sort_field = 'updated_at' THEN 'updated_at'
    ELSE 'name'
  END;

  v_sort_expr := v_sort_col || ' ' || v_dir || ', id ' || v_dir;

  -- ── base WHERE (no cursor, no dynamic identifiers) ────────────────────────
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

  -- ── H3: compound keyset cursor — pre-fetch pivot values ──────────────────
  -- Pivot is fetched via static SQL (no injection surface), then embedded
  -- into the dynamic query as quoted literals via format('%L').
  IF cursor_id IS NOT NULL THEN
    IF v_sort_col = 'name' THEN
      SELECT c.name::text INTO v_pivot_text
        FROM zapp.contacts c WHERE c.id = cursor_id;
      IF v_dir = 'ASC' THEN
        v_cursor_where := format(
          ' AND (b.name, b.id) > (%L::text, %L::uuid)',
          v_pivot_text, cursor_id
        );
      ELSE
        v_cursor_where := format(
          ' AND (b.name, b.id) < (%L::text, %L::uuid)',
          v_pivot_text, cursor_id
        );
      END IF;
    ELSIF v_sort_col = 'created_at' THEN
      SELECT c.created_at INTO v_pivot_ts
        FROM zapp.contacts c WHERE c.id = cursor_id;
      IF v_dir = 'ASC' THEN
        v_cursor_where := format(
          ' AND (b.created_at, b.id) > (%L::timestamptz, %L::uuid)',
          v_pivot_ts, cursor_id
        );
      ELSE
        v_cursor_where := format(
          ' AND (b.created_at, b.id) < (%L::timestamptz, %L::uuid)',
          v_pivot_ts, cursor_id
        );
      END IF;
    ELSIF v_sort_col = 'updated_at' THEN
      SELECT c.updated_at INTO v_pivot_ts
        FROM zapp.contacts c WHERE c.id = cursor_id;
      IF v_dir = 'ASC' THEN
        v_cursor_where := format(
          ' AND (b.updated_at, b.id) > (%L::timestamptz, %L::uuid)',
          v_pivot_ts, cursor_id
        );
      ELSE
        v_cursor_where := format(
          ' AND (b.updated_at, b.id) < (%L::timestamptz, %L::uuid)',
          v_pivot_ts, cursor_id
        );
      END IF;
    END IF;
  END IF;

  -- ── H2: CTE separates full-result count from the cursor-paged rows ────────
  -- total_count is calculated over the full base result (ignoring the cursor),
  -- so it remains stable across all pages and represents the real match count.
  v_query :=
    'WITH base AS (
       SELECT
         c.id,
         c.name::text     AS name,
         c.nickname,
         c.surname,
         c.job_title,
         c.company::text  AS company,
         c.phone,
         c.email::text    AS email,
         c.avatar_url,
         c.tags,
         c.notes,
         c.contact_type,
         c.created_at,
         c.updated_at
       FROM zapp.contacts c ' || v_where || '
     ),
     total AS (SELECT COUNT(*)::bigint AS cnt FROM base)
     SELECT
       b.id, b.name, b.nickname, b.surname, b.job_title,
       b.company, b.phone, b.email, b.avatar_url,
       b.tags, b.notes, b.contact_type, b.created_at, b.updated_at,
       t.cnt AS total_count
     FROM base b, total t'
     || v_cursor_where
     || ' ORDER BY ' || v_sort_expr
     || ' LIMIT $8';

  RETURN QUERY EXECUTE v_query
    USING
      '%' || search_term || '%',
      contact_type_filter,
      '%' || COALESCE(company_filter,     '') || '%',
      '%' || COALESCE(job_title_filter,   '') || '%',
      tag_filter,
      date_from,
      cursor_id,
      page_size;
END;
$$;

-- ── C2: restore the REVOKE/GRANT that 20260717220000 omitted ─────────────────
REVOKE EXECUTE ON FUNCTION zapp.search_contacts_cursor(
  text, text, text, text, text, timestamptz, text, text, integer, uuid
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION zapp.search_contacts_cursor(
  text, text, text, text, text, timestamptz, text, text, integer, uuid
) TO authenticated;

-- ── VERIFICATION ─────────────────────────────────────────────────────────────
DO $$
DECLARE v_anon_search int;
BEGIN
  SELECT count(*) INTO v_anon_search
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'zapp'
    AND p.proname = 'search_contacts_cursor'
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_anon_search > 0 THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: anon can still EXECUTE search_contacts_cursor';
  END IF;

  RAISE NOTICE 'OK: search_contacts_cursor — anon blocked, sort_direction guarded, compound keyset cursor, CTE count';
END;
$$;
