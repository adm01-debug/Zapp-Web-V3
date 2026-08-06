-- ============================================================================
-- AG-EX-17 wave 2 observabilidade | item 85 — evo-401-feed na fonte REAL
-- 20260807091000_item85_evo401_feed_conn_history.sql
--
-- Problema (AG-EX-05/AG-EX-09): job 161 lê evo.fn_get_401_payload() → fonte
-- evo.evolution_ip_watch com 0 linhas (pipeline Traefik→DB nunca ligado) → no-op
-- desde a criação; 627×401 reais/dia não alimentavam nenhum alerta.
--
-- Fix: nova função evo.fn_get_401_payload_v2() que lê
-- evo.evolution_connection_history (fonte REAL de eventos de conexão/desconexão
-- do wpp2, descoberta no AG-EX-05) — estados logged_out/disconnected na janela
-- são a assinatura de 401/enforcement do WhatsApp. Job 161 reescrito com
-- threshold >= 3 eventos em 15min + dedupe 30min (anti-ruído, AG-EX-09 §85).
-- ============================================================================

CREATE OR REPLACE FUNCTION evo.fn_get_401_payload_v2(p_minutes integer DEFAULT 15)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_events   jsonb;
  v_summary  jsonb;
  v_since    timestamptz;
  v_total    bigint;
BEGIN
  v_since := now() - make_interval(mins => p_minutes);

  -- Fonte REAL (AG-EX-05): evolution_connection_history — eventos de conexão do
  -- runtime Evolution (fonte app + webhook_push). Estados de desconexão/logout
  -- = assinatura de 401/enforcement do WhatsApp (device_removed, #2248).
  WITH grouped AS (
    SELECT
      h.instance_name,
      h.state,
      COUNT(*)                                        AS hit_count,
      MIN(h.created_at)                               AS first_seen,
      MAX(h.created_at)                               AS last_seen
    FROM evo.evolution_connection_history h
    WHERE h.created_at >= v_since
      AND h.state IN ('logged_out', 'disconnected')
    GROUP BY h.instance_name, h.state
  )
  SELECT COALESCE(SUM(g.hit_count), 0)::bigint,
         COALESCE(jsonb_agg(
           jsonb_build_object(
             'event_id',   gen_random_uuid(),
             'timestamp',  EXTRACT(EPOCH FROM g.last_seen)::bigint,
             'level',      CASE WHEN g.hit_count >= 5 THEN 'error' ELSE 'warning' END,
             'logger',     'evo.evolution_connection_history',
             'platform',   'other',
             'message',    format('[E3-10] %s evento(s) %s em %s (janela %smin)',
                            g.hit_count, g.state, g.instance_name, p_minutes),
             'extra',      jsonb_build_object(
                             'instance_name', g.instance_name,
                             'state',         g.state,
                             'hit_count',     g.hit_count,
                             'first_seen',    g.first_seen,
                             'last_seen',     g.last_seen,
                             'source_table',  'evo.evolution_connection_history'
                           ),
             'tags',       jsonb_build_object(
                             'instance', g.instance_name,
                             'state',    g.state,
                             'source',   'evo-db-e3-10-v2'
                           )
           )
           ORDER BY g.hit_count DESC
         ), '[]'::jsonb)
  INTO v_total, v_events
  FROM grouped g;

  v_summary := jsonb_build_object(
    'generated_at',   now(),
    'window_minutes', p_minutes,
    'since',          v_since,
    'event_count',    v_total,
    'events',         v_events
  );

  RETURN v_summary;
END;
$function$;

UPDATE cron.job
SET command = $cmd$
    INSERT INTO zapp.webhook_health_alerts
      (alert_type, severity, title, details, created_at)
    SELECT
      'sentry_401_feed',
      'warning',
      format('E3-10: 401/desconexão — %s evento(s) em %smin (fonte: evolution_connection_history)', (payload->>'event_count')::int, payload->>'window_minutes'),
      payload,
      now()
    FROM (SELECT evo.fn_get_401_payload_v2(15) AS payload) sub
    WHERE (payload->>'event_count')::int >= 3
      AND NOT EXISTS (
        SELECT 1 FROM zapp.webhook_health_alerts
        WHERE alert_type = 'sentry_401_feed' AND resolved_at IS NULL
          AND created_at > now() - interval '30 minutes'
      )
  $cmd$
WHERE jobid = 161;
