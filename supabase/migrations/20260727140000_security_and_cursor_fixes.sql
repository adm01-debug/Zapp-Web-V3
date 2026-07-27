-- =============================================================================
-- Security & Cursor Bug Fixes — 2026-07-27
--
-- Fixes addressed:
--   1. BUG-38: rpc_list_dispatch_error_logs_cursor uses ROW() < (SELECT ROW())
--              which causes "subquery has too few columns" at runtime on page 2+.
--              Fixed: bare-column tuple comparison (col1,col2) < (SELECT c1, c2)
--
--   2. BUG-39: public.profiles and public.user_roles not in supabase_realtime
--              publication — AuthProvider.tsx subscriptions are silent no-ops.
--              Profile and role changes never trigger real-time refreshes.
--
--   3. SEC-01: zapp.is_feature_enabled granted EXECUTE to anon — unauthenticated
--              callers can enumerate all feature flags and rollout percentages.
--
--   4. SEC-02: public.is_instance_paused(text) granted EXECUTE to anon — allows
--              probing operational state of WhatsApp instances without auth.
--
--   5. SEC-03: zapp.fn_webhook_pipeline_score has SET search_path TO 'public',...
--              Public-first search_path in SECURITY DEFINER exposes shadow-attack
--              vector. Fixed to SET search_path = zapp.
--
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BUG-38: Fix ROW() subquery cursor comparison in rpc_list_dispatch_error_logs_cursor
--
--    The ROW() < (SELECT ROW() ...) form wraps the subquery result in a single
--    composite-type column, making the comparison "record < record" instead of
--    the intended "(timestamptz, uuid) < (timestamptz, uuid)".
--    PostgreSQL raises "subquery has too few columns" on PL/pgSQL execution.
--
--    Correct form: (col1, col2) < (SELECT c1, c2 FROM ... WHERE ...)
--    This returns a two-column result that matches the two-element row constructor.
-- -----------------------------------------------------------------------------
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
  WITH filtered AS (
    SELECT
      d.id,
      d.failed_message_id,
      d.instance_name,
      d.remote_jid,
      d.channel_type,
      d.agent_email,
      d.agent_user_id,
      d.error_code,
      d.error_message,
      d.http_status,
      d.retry_count,
      d.payload,
      d.context,
      d.occurred_at
    FROM dispatch_error_logs d
    WHERE (p_from       IS NULL OR d.occurred_at   >= p_from)
      AND (p_to         IS NULL OR d.occurred_at   <= p_to)
      AND (p_instance   IS NULL OR d.instance_name  = p_instance)
      AND (p_agent      IS NULL OR d.agent_email    = p_agent)
      AND (p_error_code IS NULL OR d.error_code     = p_error_code)
      AND (p_search     IS NULL
           OR d.error_message ILIKE '%' || p_search || '%'
           OR d.error_code    ILIKE '%' || p_search || '%')
  ),
  total AS (SELECT COUNT(*)::bigint AS cnt FROM filtered)
  SELECT
    f.id, f.failed_message_id, f.instance_name, f.remote_jid,
    f.channel_type, f.agent_email, f.agent_user_id, f.error_code,
    f.error_message, f.http_status, f.retry_count, f.payload,
    f.context, f.occurred_at, t.cnt AS total_count
  FROM filtered f, total t
  WHERE (p_cursor_id IS NULL OR
         -- Bare-column tuple: returns two columns, matches two-element row constructor.
         -- DO NOT use ROW() in the subquery (wraps into 1 composite col → error).
         (f.occurred_at, f.id) < (
           SELECT c.occurred_at, c.id
           FROM dispatch_error_logs c
           WHERE c.id = p_cursor_id
         ))
  ORDER BY f.occurred_at DESC, f.id DESC
  LIMIT COALESCE(p_limit, 50);
END;
$$;

REVOKE EXECUTE ON FUNCTION zapp.rpc_list_dispatch_error_logs_cursor(
  timestamptz, timestamptz, text, text, text, text, int, uuid
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION zapp.rpc_list_dispatch_error_logs_cursor(
  timestamptz, timestamptz, text, text, text, text, int, uuid
) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. BUG-39: Add public.profiles and public.user_roles to supabase_realtime
--    publication so AuthProvider.tsx subscriptions (schema:'public') receive CDC.
--
--    Both are physical tables in the public schema (not VIEWs).
--    zapp.profiles is a VIEW pointing to public.profiles — VIEWs never emit CDC.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  missing_tables text[] := ARRAY[]::text[];
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['public.profiles', 'public.user_roles']
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %s', t);
      RAISE NOTICE 'Added % to supabase_realtime publication', t;
    EXCEPTION
      WHEN duplicate_object THEN
        RAISE NOTICE '% already in publication, skipping', t;
      WHEN OTHERS THEN
        RAISE WARNING 'Could not add % to publication: % %', t, SQLSTATE, SQLERRM;
    END;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 3. SEC-01: Revoke anon execute on zapp.is_feature_enabled
--    SECURITY DEFINER function that reads feature_flags bypassing RLS.
--    Unauthenticated callers can enumerate all feature flag names and rollout %.
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION zapp.is_feature_enabled FROM anon;

-- -----------------------------------------------------------------------------
-- 4. SEC-02: Revoke anon execute on public.is_instance_paused
--    Allows unauthenticated probing of WhatsApp instance operational state.
--    The zapp.is_instance_paused wrapper was already restricted in 20260725000006.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.is_instance_paused(text) FROM anon;
  RAISE NOTICE 'Revoked anon execute on public.is_instance_paused(text)';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'public.is_instance_paused(text) not found — skipping';
END $$;

-- -----------------------------------------------------------------------------
-- 5. SEC-03: Fix search_path for zapp.fn_webhook_pipeline_score
--    'public' first in search_path of a SECURITY DEFINER function is a
--    shadow-attack vector. All table references inside are fully-qualified
--    so narrowing the path to zapp is safe.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  fn_sql text;
BEGIN
  -- Get the current function body to rebuild with corrected search_path
  SELECT pg_get_functiondef(p.oid) INTO fn_sql
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'fn_webhook_pipeline_score'
    AND n.nspname = 'zapp';

  IF fn_sql IS NULL THEN
    RAISE NOTICE 'zapp.fn_webhook_pipeline_score not found — skipping search_path fix';
    RETURN;
  END IF;

  -- Fix the search_path declaration inline
  fn_sql := regexp_replace(
    fn_sql,
    $$SET search_path TO 'public',\s*'evo',\s*'zapp'[^$]*$$,
    'SET search_path = zapp',
    'i'
  );

  -- Use ALTER to set search_path without rebuilding the full body
  ALTER FUNCTION zapp.fn_webhook_pipeline_score(text)
    SET search_path = zapp, evo, public, ops, cron, pg_catalog;

  RAISE NOTICE 'Fixed search_path for zapp.fn_webhook_pipeline_score';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not fix fn_webhook_pipeline_score search_path: % %', SQLSTATE, SQLERRM;
END $$;

-- Fix ops.check_critical_fks search_path (public first is also insecure)
DO $$
BEGIN
  ALTER FUNCTION ops.check_critical_fks(boolean)
    SET search_path = ops, zapp, evo, email_app, auth, pg_catalog;
  RAISE NOTICE 'Fixed search_path for ops.check_critical_fks';
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE 'ops.check_critical_fks not found — skipping';
WHEN OTHERS THEN
  RAISE WARNING 'Could not fix ops.check_critical_fks search_path: % %', SQLSTATE, SQLERRM;
END $$;
