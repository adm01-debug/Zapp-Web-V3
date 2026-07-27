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
CREATE OR REPLACE FUNCTION zapp.search_contacts_cursor(
  search_term         text        DEFAULT '',
  sort_field          text        DEFAULT 'name',
  sort_direction      text        DEFAULT 'asc',
  contact_type_filter text        DEFAULT NULL,
  company_filter      text        DEFAULT NULL,
  date_from           timestamptz DEFAULT NULL,
  job_title_filter    text        DEFAULT NULL,
  tag_filter          text        DEFAULT NULL,
  page_size           int         DEFAULT 50,
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
SET search_path = zapp
AS $$
DECLARE
  v_query       text;
  v_count_where text;
  v_sort_dir    text;
  v_sort_expr   text;
  v_where       text;
BEGIN
  v_sort_dir := UPPER(COALESCE(sort_direction, 'ASC'));
  IF v_sort_dir NOT IN ('ASC', 'DESC') THEN
    -- FIX: restore RAISE EXCEPTION (BUG-15 fix was regressed to silent default)
    RAISE EXCEPTION 'Invalid sort_direction: %; must be ASC or DESC', sort_direction
      USING ERRCODE = 'P0001';
  END IF;

  v_sort_expr := CASE
    WHEN sort_field = 'created_at' THEN 'c.created_at ' || v_sort_dir || ', c.id ' || v_sort_dir
    WHEN sort_field = 'updated_at' THEN 'c.updated_at ' || v_sort_dir || ', c.id ' || v_sort_dir
    ELSE                                 'c.name '       || v_sort_dir || ', c.id ' || v_sort_dir
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

  v_count_where := v_where;

  IF cursor_id IS NOT NULL THEN
    IF sort_field = 'created_at' THEN
      IF v_sort_dir = 'ASC' THEN
        v_where := v_where ||
          ' AND (c.created_at, c.id) > (SELECT cc.created_at, cc.id FROM zapp.contacts cc WHERE cc.id = $7)';
      ELSE
        v_where := v_where ||
          ' AND (c.created_at, c.id) < (SELECT cc.created_at, cc.id FROM zapp.contacts cc WHERE cc.id = $7)';
      END IF;
    ELSIF sort_field = 'updated_at' THEN
      IF v_sort_dir = 'ASC' THEN
        v_where := v_where ||
          ' AND (c.updated_at, c.id) > (SELECT cc.updated_at, cc.id FROM zapp.contacts cc WHERE cc.id = $7)';
      ELSE
        v_where := v_where ||
          ' AND (c.updated_at, c.id) < (SELECT cc.updated_at, cc.id FROM zapp.contacts cc WHERE cc.id = $7)';
      END IF;
    ELSE
      IF v_sort_dir = 'ASC' THEN
        v_where := v_where ||
          ' AND (c.name, c.id::text) > (SELECT cc.name, cc.id::text FROM zapp.contacts cc WHERE cc.id = $7)';
      ELSE
        v_where := v_where ||
          ' AND (c.name, c.id::text) < (SELECT cc.name, cc.id::text FROM zapp.contacts cc WHERE cc.id = $7)';
      END IF;
    END IF;
  END IF;

  v_query :=
    'WITH total AS (
       SELECT COUNT(*)::bigint AS cnt FROM zapp.contacts c ' || v_count_where || '
     )
     SELECT c.id, c.name::text, c.nickname, c.surname, c.job_title,
            c.company::text, c.phone, c.email::text, c.avatar_url,
            c.tags, c.notes, c.contact_type, c.created_at, c.updated_at,
            t.cnt AS total_count
     FROM zapp.contacts c, total t
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

REVOKE ALL ON FUNCTION zapp.search_contacts_cursor(text, text, text, text, text, timestamptz, text, text, int, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.search_contacts_cursor(text, text, text, text, text, timestamptz, text, text, int, uuid)
  TO authenticated, service_role;


-- =============================================================================
-- HIGH 9: Fix zapp.calls SELECT policy — add workspace isolation
-- =============================================================================
DROP POLICY IF EXISTS "Users can view calls" ON zapp.calls;

CREATE POLICY "calls_select_workspace_isolated"
  ON zapp.calls FOR SELECT
  TO authenticated
  USING (
    -- Calls assigned to an agent: check agent belongs to user's workspace
    (agent_id IS NOT NULL AND agent_id IN (
      SELECT p.id FROM zapp.profiles p
      WHERE p.workspace_id IN (
        SELECT workspace_id FROM zapp.workspace_members WHERE user_id = auth.uid()
      )
    ))
    OR
    -- Calls with no agent (missed/unassigned): visible to any workspace member
    (agent_id IS NULL AND EXISTS (
      SELECT 1 FROM zapp.workspace_members WHERE user_id = auth.uid()
    ))
  );


-- =============================================================================
-- CRITICAL 2: Fix stale now() partial index on processed_requests
-- Drop the stale partial index and recreate as a full index
-- =============================================================================
DROP INDEX IF EXISTS zapp.idx_processed_requests_expires_at;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'processed_requests' AND n.nspname = 'zapp'
  ) THEN
    -- Recreate without stale WHERE predicate
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_processed_requests_expires_at ON zapp.processed_requests (expires_at)';
  END IF;
END;
$$;


-- =============================================================================
-- CRITICAL 3: Fix stale now() partial index on analytics_events
-- =============================================================================
DROP INDEX IF EXISTS zapp.idx_analytics_events_action;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'analytics_events' AND n.nspname = 'zapp'
  ) THEN
    -- Recreate without stale NOW()-based WHERE predicate
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_analytics_events_action ON zapp.analytics_events (action, "timestamp" DESC)';
  END IF;
END;
$$;


-- =============================================================================
-- CRITICAL 4: Fix c.telefone → c.phone in get_contact_intelligence_by_phone
-- =============================================================================
CREATE OR REPLACE FUNCTION zapp.get_contact_intelligence_by_phone(p_phone TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = zapp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'contact_id',        ci.contact_id,
    'engagement_score',  ci.engagement_score,
    'sentiment_avg',     ci.sentiment_avg,
    'rfm_segment',       ci.rfm_segment,
    'churn_risk',        ci.churn_risk,
    'last_updated',      ci.updated_at
  )
    INTO v_result
    FROM zapp.contact_intelligence ci
    JOIN zapp.contacts c ON c.id = ci.contact_id
   WHERE c.phone = p_phone     -- FIX: was c.telefone (column does not exist; contacts uses English column names)
   LIMIT 1;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION zapp.get_contact_intelligence_by_phone(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.get_contact_intelligence_by_phone(TEXT) TO authenticated, service_role;


-- =============================================================================
-- MEDIUM 12: Reduce imap_smtp_accounts VIEW grant
-- Remove INSERT/UPDATE/DELETE from authenticated (table contains IMAP/SMTP passwords)
-- =============================================================================
REVOKE INSERT, UPDATE, DELETE ON zapp.imap_smtp_accounts FROM authenticated;
-- service_role keeps ALL, authenticated retains SELECT only


-- =============================================================================
-- MEDIUM 13: Fix fn_evolution_status_unknown — remove public from search_path
-- =============================================================================
CREATE OR REPLACE FUNCTION zapp.fn_evolution_status_unknown(p_instance_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, pg_catalog    -- FIX: was zapp, public
AS $fn$
DECLARE
  v_status text := 'unknown';
BEGIN
  BEGIN
    UPDATE zapp.whatsapp_connections
       SET status = 'unknown', updated_at = now()
     WHERE instance_name = p_instance_name;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Falha ao atualizar status de %: %', p_instance_name, SQLERRM;
  END;

  RETURN jsonb_build_object(
    'status', v_status,
    'state', null,
    'instance', p_instance_name,
    'message', format('Evolution API status unknown for instance %s', p_instance_name),
    'timestamp', extract(epoch from now())
  );
END;
$fn$;

REVOKE ALL ON FUNCTION zapp.fn_evolution_status_unknown(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.fn_evolution_status_unknown(text) TO authenticated, service_role;


-- =============================================================================
-- MEDIUM 14: Fix fn_refresh_role_permissions_mv — remove public from search_path
-- =============================================================================
CREATE OR REPLACE FUNCTION zapp.fn_refresh_role_permissions_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, pg_catalog    -- FIX: was zapp, public
AS $fn$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY zapp.mv_role_permissions_full;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'refresh mv_role_permissions_full falhou: %', SQLERRM;
END;
$fn$;

REVOKE ALL ON FUNCTION zapp.fn_refresh_role_permissions_mv() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION zapp.fn_refresh_role_permissions_mv() TO service_role;


-- =============================================================================
-- MEDIUM 15: Fix is_feature_enabled — remove public from search_path
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'is_feature_enabled' AND n.nspname = 'zapp'
  ) THEN
    -- Update search_path via ALTER FUNCTION (avoids rewriting the full body)
    EXECUTE 'ALTER FUNCTION zapp.is_feature_enabled(text, uuid, text) SET search_path = zapp, pg_catalog';
    RAISE NOTICE 'Fixed is_feature_enabled search_path: removed public';
  ELSE
    RAISE NOTICE 'is_feature_enabled not found — skipping';
  END IF;
END;
$$;


-- =============================================================================
-- MEDIUM 16: Fix trigger functions missing SET search_path
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'fn_touch_updated_at' AND n.nspname = 'zapp'
  ) THEN
    EXECUTE 'ALTER FUNCTION zapp.fn_touch_updated_at() SET search_path = zapp, pg_catalog';
    RAISE NOTICE 'Fixed fn_touch_updated_at search_path';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'fn_touch_role_permissions_updated_at' AND n.nspname = 'zapp'
  ) THEN
    EXECUTE 'ALTER FUNCTION zapp.fn_touch_role_permissions_updated_at() SET search_path = zapp, pg_catalog';
    RAISE NOTICE 'Fixed fn_touch_role_permissions_updated_at search_path';
  END IF;
  -- Also fix trg_fn_refresh_role_permissions_mv (trigger wrapper — same file)
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'trg_fn_refresh_role_permissions_mv' AND n.nspname = 'zapp'
  ) THEN
    EXECUTE 'ALTER FUNCTION zapp.trg_fn_refresh_role_permissions_mv() SET search_path = zapp, pg_catalog';
    RAISE NOTICE 'Fixed trg_fn_refresh_role_permissions_mv search_path';
  END IF;
END;
$$;


-- =============================================================================
-- MEDIUM 17: Fix email_tracked_links RLS — restrict write access
-- The table has no workspace_id; at minimum restrict writes to service_role
-- (click tracking inserts should go through the service-role edge function)
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'email_tracked_links' AND n.nspname = 'zapp' AND c.relkind = 'r'
  ) THEN
    -- Drop the permissive FOR ALL policy
    EXECUTE 'DROP POLICY IF EXISTS "email_tracked_links_auth" ON zapp.email_tracked_links';

    -- Read: all authenticated users (link resolution endpoint needs SELECT)
    EXECUTE $p$
      CREATE POLICY "email_tracked_links_select"
        ON zapp.email_tracked_links FOR SELECT
        TO authenticated
        USING (true)
    $p$;

    -- Write: service_role only (INSERT/UPDATE from edge functions)
    REVOKE INSERT, UPDATE, DELETE ON zapp.email_tracked_links FROM authenticated;

    RAISE NOTICE 'email_tracked_links: restricted write to service_role, read stays authenticated';
  END IF;
END;
$$;


-- =============================================================================
-- MEDIUM 18: Restrict get_all_table_names to service_role only
-- (exposes information_schema to any authenticated user — reconnaissance risk)
-- =============================================================================
REVOKE EXECUTE ON FUNCTION zapp.get_all_table_names() FROM authenticated;
GRANT  EXECUTE ON FUNCTION zapp.get_all_table_names() TO service_role;


-- =============================================================================
-- NEW BUG-38/39: Add zapp.profiles and zapp.user_roles to supabase_realtime
-- AuthProvider.tsx subscribes to both with schema:'public' → will be fixed to
-- schema:'zapp' in TypeScript, but the tables also need to be in the publication.
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'zapp' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.profiles;
    RAISE NOTICE 'Added zapp.profiles to supabase_realtime';
  ELSE
    RAISE NOTICE 'zapp.profiles already in supabase_realtime';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'zapp' AND tablename = 'user_roles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zapp.user_roles;
    RAISE NOTICE 'Added zapp.user_roles to supabase_realtime';
  ELSE
    RAISE NOTICE 'zapp.user_roles already in supabase_realtime';
  END IF;
END;
$$;
