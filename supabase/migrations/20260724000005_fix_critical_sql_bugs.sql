-- FIX: Critical SQL bugs found in exhaustive audit
--
-- C-1: ALTER SYSTEM SET statement_timeout = '120s' (in 20260724000002)
--      applied globally to ALL sessions including pg_cron workers.
--      Fix: reset the global setting; apply only to the `authenticated` role.
--
-- H-2: Seven SECURITY DEFINER stubs have SET search_path = zapp, public
--      (in 20260717000002). The `public` entry is a security risk: a superuser
--      or attacker who creates a function/table in public can shadow zapp
--      objects and escalate privileges.
--      Fix: recreate with SET search_path = zapp only.
--
-- H-8: rpc_list_dispatch_error_logs_cursor (in 20260721_fix_cursor_rpcs…)
--      did an unnecessary LEFT JOIN evo.evolution_messages em to fetch
--      em.remote_jid even though d.remote_jid already exists directly on
--      zapp.dispatch_error_logs. The JOIN caused a cross-schema read under
--      SECURITY DEFINER and inflated query cost.
--      Fix: drop the JOIN, use d.remote_jid directly.

-- ═══════════════════════════════════════════════════════════════════════════
-- C-1: Fix global statement_timeout set by 20260724000002
-- ═══════════════════════════════════════════════════════════════════════════

-- Remove the session-level global that affects ALL backends (pg_cron, etc.)
ALTER SYSTEM RESET statement_timeout;

-- Apply only to authenticated users (app layer)
ALTER ROLE authenticated SET statement_timeout = '120s';
ALTER ROLE authenticated SET lock_timeout      = '10s';
ALTER ROLE authenticated SET idle_in_transaction_session_timeout = '300s';

-- Reload so the ALTER SYSTEM RESET takes effect immediately
SELECT pg_reload_conf();

-- ═══════════════════════════════════════════════════════════════════════════
-- H-2: Recreate all 7 stubs with SET search_path = zapp (no public)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── GAP-2: Gmail OAuth ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION zapp.initiate_gmail_oauth()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = zapp
AS $$
BEGIN
  RAISE EXCEPTION 'Gmail OAuth not yet implemented'
    USING ERRCODE = 'P0001',
          DETAIL  = 'Configure Google OAuth credentials and implement initiate_gmail_oauth.';
END;
$$;

GRANT EXECUTE ON FUNCTION zapp.initiate_gmail_oauth() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION zapp.complete_gmail_oauth(auth_code text, p_state text DEFAULT NULL)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = zapp
AS $$
BEGIN
  RAISE EXCEPTION 'Gmail OAuth not yet implemented'
    USING ERRCODE = 'P0001',
          DETAIL  = 'Configure Google OAuth credentials and implement complete_gmail_oauth.';
END;
$$;

GRANT EXECUTE ON FUNCTION zapp.complete_gmail_oauth(auth_code text, p_state text) TO authenticated;

-- ─── GAP-3: CRM Sync ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION zapp.sync_to_crm(
  entity_id   uuid,
  entity_data jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = zapp
AS $$
BEGIN
  RAISE EXCEPTION 'sync_to_crm not yet implemented'
    USING ERRCODE = 'P0001',
          DETAIL  = 'CRM sync integration is pending. entity_id=' || entity_id::text;
END;
$$;

GRANT EXECUTE ON FUNCTION zapp.sync_to_crm(uuid, jsonb) TO authenticated;

-- ─── GAP-4: Export user data ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION zapp.export_user_data(export_format text DEFAULT 'json')
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = zapp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile record;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF export_format NOT IN ('json') THEN
    RAISE EXCEPTION 'Unsupported export format: %', export_format
      USING ERRCODE = 'P0001',
            DETAIL  = 'Supported formats: json';
  END IF;

  SELECT * INTO v_profile
  FROM profiles
  WHERE user_id = v_user_id
  LIMIT 1;

  RETURN jsonb_build_object(
    'format',       export_format,
    'exported_at',  now(),
    'profile',      row_to_json(v_profile)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION zapp.export_user_data(text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION zapp.import_user_data(data jsonb)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = zapp
AS $$
BEGIN
  RAISE EXCEPTION 'import_user_data not yet implemented'
    USING ERRCODE = 'P0001',
          DETAIL  = 'Data import requires an Edge Function for transaction safety.';
END;
$$;

GRANT EXECUTE ON FUNCTION zapp.import_user_data(jsonb) TO authenticated;

-- ─── GAP-5: Contact enrichment ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION zapp.enrich_contact(contact_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = zapp
AS $$
DECLARE
  v_contact record;
BEGIN
  SELECT * INTO v_contact
  FROM contacts
  WHERE id = contact_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'contact_id', contact_id,
    'enriched',   false,
    'source',     'stub',
    'data',       row_to_json(v_contact)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION zapp.enrich_contact(uuid) TO authenticated;

-- ─── GAP-6: Latest sentiment analysis ────────────────────────────────────

CREATE OR REPLACE FUNCTION zapp.get_latest_analysis(hours integer DEFAULT 24)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = zapp
AS $$
DECLARE
  v_cutoff timestamptz := now() - (hours || ' hours')::interval;
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id',        gen_random_uuid(),
    'metric',    'engagement_avg',
    'value',     COALESCE(AVG(ci.engagement_score), 0),
    'trend',     'stable',
    'timestamp', now()
  )
  INTO v_result
  FROM contact_intelligence ci
  WHERE ci.created_at >= v_cutoff;

  RETURN COALESCE(v_result, jsonb_build_object(
    'id',        gen_random_uuid(),
    'metric',    'sentiment_avg',
    'value',     0,
    'trend',     'stable',
    'timestamp', now()
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION zapp.get_latest_analysis(integer) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- H-8: Fix rpc_list_dispatch_error_logs_cursor — remove unnecessary JOIN
-- ═══════════════════════════════════════════════════════════════════════════
-- d.remote_jid already exists directly on zapp.dispatch_error_logs.
-- The previous LEFT JOIN evo.evolution_messages em was both wasteful and
-- a cross-schema read from a SECURITY DEFINER context.

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
         ROW(f.occurred_at, f.id) < (
           SELECT ROW(c.occurred_at, c.id)
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
