-- =============================================================================
-- Migration: search_contacts_cursor v2 — security + correctness (BUG-15/16/17/18)
--
-- The version deployed via 20260717_fix_dlq_security_and_audit_gaps.sql had
-- three correctness and one security gap that archive/20260720000003 fixed but
-- never deployed:
--
--   BUG-15 (SQL injection risk): sort_direction silently fell back to 'ASC'
--     for invalid values instead of raising an exception. While the whitelist
--     via CASE statement on sort_field prevented ORDER BY injection, explicit
--     RAISE EXCEPTION is the correct defensive posture (P0001).
--
--   BUG-16 (COUNT instability): COUNT(*) OVER() was evaluated after the cursor
--     predicate, so total_count decreased with each page. Users saw "15 results"
--     on page 1, "10" on page 2, "5" on page 3 — all wrong. Fix: CTE `base`
--     counts before the cursor filter; `total` CTE cross-joins the stable count.
--
--   BUG-17 (cursor keyset incomplete): cursor used only `c.id > $7::uuid`
--     regardless of sort_field. For ORDER BY name ASC, id ASC, this skips rows
--     where (name > pivot_name) but id < pivot_id. Fix: composite ROW(sort_col,
--     id) keyset with pre-fetched pivot values (no injection surface).
--
--   BUG-18 (GRANT missing): The REVOKE/GRANT from the original migration was
--     already restored by 20260717_fix_dlq_security_and_audit_gaps.sql line 577.
--     We re-affirm it here for idempotency.
-- =============================================================================

CREATE OR REPLACE FUNCTION zapp.search_contacts_cursor(
  search_term         text          DEFAULT '',
  sort_field          text          DEFAULT 'name',
  sort_direction      text          DEFAULT 'asc',
  contact_type_filter text          DEFAULT NULL,
  company_filter      text          DEFAULT NULL,
  date_from           timestamptz   DEFAULT NULL,
  job_title_filter    text          DEFAULT NULL,
  tag_filter          text          DEFAULT NULL,
  page_size           integer       DEFAULT 50,
  cursor_id           uuid          DEFAULT NULL
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
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = zapp
AS $$
DECLARE
  v_query        text;
  v_sort_col     text;
  v_sort_expr    text;
  v_dir          text;
  v_where        text;
  v_cursor_where text := '';
  v_pivot_ts     timestamptz;
  v_pivot_text   text;
BEGIN
  -- BUG-15: validate sort_direction — RAISE instead of silent fallback
  v_dir := UPPER(COALESCE(sort_direction, 'ASC'));
  IF v_dir NOT IN ('ASC', 'DESC') THEN
    RAISE EXCEPTION 'Invalid sort_direction ''%'': must be ASC or DESC', sort_direction
      USING ERRCODE = 'P0001';
  END IF;

  -- Whitelist sort_field (no injection surface — CASE produces only known column names)
  v_sort_col := CASE
    WHEN sort_field = 'created_at' THEN 'created_at'
    WHEN sort_field = 'updated_at' THEN 'updated_at'
    ELSE                                 'name'
  END;

  v_sort_expr := v_sort_col || ' ' || v_dir || ', id ' || v_dir;

  -- Base WHERE (parameterised — no dynamic identifiers)
  v_where := 'WHERE 1=1';
  IF search_term != '' THEN
    v_where := v_where || ' AND (c.name ILIKE $1 OR c.email ILIKE $1 OR c.phone ILIKE $1)';
  END IF;
  IF contact_type_filter IS NOT NULL THEN v_where := v_where || ' AND c.contact_type = $2';  END IF;
  IF company_filter      IS NOT NULL THEN v_where := v_where || ' AND c.company ILIKE $3';   END IF;
  IF job_title_filter    IS NOT NULL THEN v_where := v_where || ' AND c.job_title ILIKE $4'; END IF;
  IF tag_filter          IS NOT NULL THEN v_where := v_where || ' AND $5 = ANY(c.tags)';     END IF;
  IF date_from           IS NOT NULL THEN v_where := v_where || ' AND c.created_at >= $6';   END IF;

  -- BUG-17: composite ROW(sort_col, id) keyset — pre-fetch pivot via static SQL
  -- format('%L') quoting eliminates injection risk for the pivot values.
  IF cursor_id IS NOT NULL THEN
    IF v_sort_col = 'name' THEN
      SELECT c.name::text INTO v_pivot_text
        FROM zapp.contacts c WHERE c.id = cursor_id;
      IF v_dir = 'ASC' THEN
        v_cursor_where := format(' AND (b.name, b.id) > (%L::text, %L::uuid)', v_pivot_text, cursor_id);
      ELSE
        v_cursor_where := format(' AND (b.name, b.id) < (%L::text, %L::uuid)', v_pivot_text, cursor_id);
      END IF;

    ELSIF v_sort_col = 'created_at' THEN
      SELECT c.created_at INTO v_pivot_ts
        FROM zapp.contacts c WHERE c.id = cursor_id;
      IF v_dir = 'ASC' THEN
        v_cursor_where := format(' AND (b.created_at, b.id) > (%L::timestamptz, %L::uuid)', v_pivot_ts, cursor_id);
      ELSE
        v_cursor_where := format(' AND (b.created_at, b.id) < (%L::timestamptz, %L::uuid)', v_pivot_ts, cursor_id);
      END IF;

    ELSIF v_sort_col = 'updated_at' THEN
      SELECT c.updated_at INTO v_pivot_ts
        FROM zapp.contacts c WHERE c.id = cursor_id;
      IF v_dir = 'ASC' THEN
        v_cursor_where := format(' AND (b.updated_at, b.id) > (%L::timestamptz, %L::uuid)', v_pivot_ts, cursor_id);
      ELSE
        v_cursor_where := format(' AND (b.updated_at, b.id) < (%L::timestamptz, %L::uuid)', v_pivot_ts, cursor_id);
      END IF;
    END IF;
  END IF;

  -- BUG-16: CTE `base` runs before cursor predicate → total_count is stable across pages
  -- CTE `total` cross-joins the stable count into every row.
  v_query :=
    'WITH base AS (
       SELECT c.id,
              c.name::text      AS name,
              c.nickname,
              c.surname,
              c.job_title,
              c.company::text   AS company,
              c.phone,
              c.email::text     AS email,
              c.avatar_url,
              c.tags,
              c.notes,
              c.contact_type,
              c.created_at,
              c.updated_at
       FROM   zapp.contacts c ' || v_where || '
     ),
     total AS (SELECT COUNT(*)::bigint AS cnt FROM base)
     SELECT b.id, b.name, b.nickname, b.surname, b.job_title,
            b.company, b.phone, b.email, b.avatar_url,
            b.tags, b.notes, b.contact_type, b.created_at, b.updated_at,
            t.cnt AS total_count
     FROM   base b, total t'
     || v_cursor_where
     || ' ORDER BY ' || v_sort_expr
     || ' LIMIT $8';

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

-- BUG-18: re-affirm REVOKE/GRANT (idempotent)
REVOKE EXECUTE ON FUNCTION zapp.search_contacts_cursor(
  text, text, text, text, text, timestamptz, text, text, integer, uuid
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION zapp.search_contacts_cursor(
  text, text, text, text, text, timestamptz, text, text, integer, uuid
) TO authenticated;
