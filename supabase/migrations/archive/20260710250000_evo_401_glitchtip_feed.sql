-- ============================================================================
-- 401 GlitchTip Observability Feed (E3-10)
-- Auditoria 2026-07-10
--
-- E3-10 — GlitchTip não registra path dos 401 (config incompleta)
--   O GlitchTip/Sentry está configurado com DSN incompleto nos stacks afetados,
--   e 401s chegam sem o campo `request.url` preenchido — impossibilitando
--   correlação entre IPs suspeitos e endpoints atacados.
--
--   DB-side fix: expor os dados de 401 (IP + endpoint + UA + timestamp) via:
--   1. View evo.v_401_observability — summary dos últimos 24h por endpoint+IP
--   2. Function evo.fn_get_401_glitchtip_payload(p_minutes) — retorna JSON array
--      compatível com Sentry envelope API (/api/store/), pronto para um
--      sidecar cron (n8n/pg_cron webhook worker) fazer POST ao GlitchTip.
--
--   O DSN deve ser configurado nos stacks, mas enquanto isso este feed fornece
--   visibilidade completa dos paths 401 via Supabase REST API ou pg_cron.
--
-- Idempotente: CREATE OR REPLACE VIEW + FUNCTION.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- View: 401 observability summary (last 24h, by endpoint)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW evo.v_401_observability AS
SELECT
  endpoint,
  ip_address,
  http_status,
  COUNT(*)                          AS hit_count,
  MIN(created_at)                   AS first_seen,
  MAX(created_at)                   AS last_seen,
  COUNT(DISTINCT ip_address)        AS unique_ips,
  -- Most recent user-agents
  array_agg(DISTINCT user_agent) FILTER (WHERE user_agent IS NOT NULL) AS user_agents,
  -- Classify endpoint
  CASE
    WHEN endpoint ILIKE '%/message/%'  THEN 'messaging'
    WHEN endpoint ILIKE '%/instance/%' THEN 'instance_mgmt'
    WHEN endpoint ILIKE '%/group/%'    THEN 'group_mgmt'
    WHEN endpoint ILIKE '%/webhook%'   THEN 'webhook'
    WHEN endpoint ILIKE '%/send%'      THEN 'send'
    ELSE 'other'
  END AS endpoint_category
FROM evo.evolution_ip_watch
WHERE created_at >= now() - interval '24 hours'
GROUP BY endpoint, ip_address, http_status
ORDER BY hit_count DESC;

COMMENT ON VIEW evo.v_401_observability IS
  'E3-10: 401/403 hit summary (last 24h) grouped by endpoint + IP. '
  'Queryable via Supabase REST API or pg_cron for GlitchTip/Sentry forwarding. '
  'Source: evo.evolution_ip_watch (populated by E3-03 fn_log_api_401).';

-- ──────────────────────────────────────────────────────────────────────────────
-- Function: structured 401 payload for GlitchTip/Sentry envelope API
-- Returns a JSONB array of Sentry-compatible error event objects.
-- A sidecar (n8n workflow or pg_cron webhook) can POST each item to
-- https://<glitchtip-host>/api/<org>/<project>/store/
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION evo.fn_get_401_glitchtip_payload(
  p_minutes int DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = evo, public, pg_temp
AS $$
DECLARE
  v_events   jsonb;
  v_summary  jsonb;
  v_since    timestamptz;
BEGIN
  v_since := now() - (p_minutes || ' minutes')::interval;

  -- Pre-aggregate per IP+endpoint to avoid nested aggregate error
  WITH grouped AS (
    SELECT
      w.ip_address,
      w.endpoint,
      w.http_status,
      COUNT(*)                                                                AS hit_count,
      MIN(w.created_at)                                                       AS first_seen,
      MAX(w.created_at)                                                       AS last_seen,
      jsonb_agg(DISTINCT w.user_agent) FILTER (WHERE w.user_agent IS NOT NULL) AS user_agents
    FROM evo.evolution_ip_watch w
    WHERE w.created_at >= v_since
    GROUP BY w.ip_address, w.endpoint, w.http_status
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      -- Sentry envelope fields
      'event_id',  gen_random_uuid(),
      'timestamp', EXTRACT(EPOCH FROM g.last_seen)::bigint,
      'level',     CASE WHEN g.hit_count >= 10 THEN 'error' ELSE 'warning' END,
      'logger',    'evo.evolution_ip_watch',
      'platform',  'other',
      'message',   format('[E3-10] %s hits on %s from %s (status: %s)',
                     g.hit_count, g.endpoint, g.ip_address, g.http_status),
      -- Request context (the key missing piece in GlitchTip)
      'request',   jsonb_build_object(
                     'url',    COALESCE(g.endpoint, '/[unknown]'),
                     'method', 'POST',
                     'env',    jsonb_build_object(
                                 'REMOTE_ADDR', g.ip_address,
                                 'HTTP_STATUS', g.http_status::text
                               )
                   ),
      -- Extra context
      'extra',     jsonb_build_object(
                     'ip_address',   g.ip_address,
                     'endpoint',     g.endpoint,
                     'http_status',  g.http_status,
                     'hit_count',    g.hit_count,
                     'first_seen',   g.first_seen,
                     'last_seen',    g.last_seen,
                     'user_agents',  COALESCE(g.user_agents, '[]'::jsonb),
                     'source_table', 'evo.evolution_ip_watch'
                   ),
      -- Tags for GlitchTip filtering
      'tags',      jsonb_build_object(
                     'ip',       g.ip_address,
                     'endpoint', COALESCE(g.endpoint, 'unknown'),
                     'status',   g.http_status::text,
                     'source',   'evo-db-e3-10'
                   )
    )
    ORDER BY g.hit_count DESC
  )
  INTO v_events
  FROM grouped g;

  -- Summary envelope
  v_summary := jsonb_build_object(
    'generated_at',   now(),
    'window_minutes', p_minutes,
    'since',          v_since,
    'event_count',    COALESCE(jsonb_array_length(v_events), 0),
    'events',         COALESCE(v_events, '[]'::jsonb)
  );

  RETURN v_summary;
END;
$$;

COMMENT ON FUNCTION evo.fn_get_401_glitchtip_payload(int) IS
  'E3-10: Returns a Sentry-envelope-compatible JSONB payload of 401/403 events '
  'from evo.evolution_ip_watch for the last N minutes (default: 10). '
  'Each event includes request.url (the endpoint path) which was missing from '
  'GlitchTip due to incomplete DSN config. '
  'Usage: SELECT evo.fn_get_401_glitchtip_payload(10); '
  'Forward the .events array items to https://<glitchtip>/api/<org>/<project>/store/';

REVOKE EXECUTE ON FUNCTION evo.fn_get_401_glitchtip_payload(int) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION evo.fn_get_401_glitchtip_payload(int) TO service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- pg_cron: every 10 minutes — log pending 401 events count for ops visibility
-- (Actual forwarding to GlitchTip is done by n8n/external webhook caller)
-- ──────────────────────────────────────────────────────────────────────────────
SELECT cron.unschedule('evo-401-glitchtip-feed')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'evo-401-glitchtip-feed');

SELECT cron.schedule(
  'evo-401-glitchtip-feed',
  '*/10 * * * *',
  $$
    INSERT INTO zapp.webhook_health_alerts
      (alert_type, severity, title, details, created_at)
    SELECT
      'glitchtip_401_feed',
      CASE WHEN (payload->>'event_count')::int > 0 THEN 'info' ELSE 'info' END,
      format('E3-10: GlitchTip 401 feed — %s events in last 10min', payload->>'event_count'),
      payload,
      now()
    FROM (SELECT evo.fn_get_401_glitchtip_payload(10) AS payload) sub
    WHERE (payload->>'event_count')::int > 0
  $$
);
