-- ============================================================================
-- Spurious Close Detector (E1-12)
-- Auditoria 2026-07-10
--
-- E1-12 — connection.update close propaga desnecessariamente
--   O consumer n8n processa todos os eventos connection.update do tipo 'close'
--   sem distinguir fechamentos transitórios (que o Baileys auto-reconecta em < 30s)
--   de desconexões reais. Isso dispara workflows downstream desnecessariamente,
--   causando ruído nos alertas e potencial sobrecarga.
--
--   Padrão: instância entra em 'disconnected' mas transiciona para
--   'connecting' ou 'connected' dentro de v_reconnect_window (30s por padrão).
--   Isso é uma desconexão espúria — o Baileys reconectou antes do consumer
--   precisar agir.
--
-- Solução DB-side:
--   1. evo.v_spurious_close_events — view dos fechamentos transitórios
--      (disconnected → reconnecting em < 30s) nas últimas 24h
--   2. evo.fn_detect_spurious_closes(p_window, p_reconnect_window) — analisa
--      janela configurável, calcula taxa de fechamentos espúrios vs reais,
--      emite alerta quando taxa > threshold. Permite ao time calibrar o
--      filtro no consumer n8n.
--
-- Thresholds:
--   spurious_rate_warn_pct     = 70%  (WARN se >70% dos closes são espúrios)
--   spurious_rate_critical_pct = 90%  (CRITICAL se >90% são espúrios)
--   min_count_to_alert         = 5    (mínimo de eventos para alertar)
--
-- Idempotente: CREATE OR REPLACE VIEW + FUNCTION.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- View: spurious close events in last 24h
-- A "close" is spurious when the instance reconnects within reconnect_window.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW evo.v_spurious_close_events AS
WITH disconnects AS (
  SELECT
    instance_name,
    created_at                                AS disconnected_at,
    LEAD(state)       OVER w                  AS next_state,
    LEAD(created_at)  OVER w                  AS next_state_at
  FROM evo.evolution_connection_history
  WHERE state = 'disconnected'
    AND created_at >= now() - interval '24 hours'
  WINDOW w AS (PARTITION BY instance_name ORDER BY created_at)
)
SELECT
  instance_name,
  disconnected_at,
  next_state,
  next_state_at,
  EXTRACT(EPOCH FROM (next_state_at - disconnected_at))::int AS reconnect_seconds,
  (
    next_state IN ('connecting', 'connected')
    AND (next_state_at - disconnected_at) <= interval '30 seconds'
  ) AS is_spurious
FROM disconnects
WHERE next_state IS NOT NULL
ORDER BY disconnected_at DESC;

COMMENT ON VIEW evo.v_spurious_close_events IS
  'E1-12: Disconnection events from evolution_connection_history (last 24h) '
  'classified as spurious (Baileys auto-reconnected within 30s) vs real. '
  'is_spurious=true events are the ones the n8n consumer should filter out.';

-- ──────────────────────────────────────────────────────────────────────────────
-- Main detector function
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION evo.fn_detect_spurious_closes(
  p_window           interval DEFAULT '1 hour',
  p_reconnect_window interval DEFAULT '30 seconds'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public, zapp, pg_temp
AS $$
DECLARE
  v_spurious_warn_pct     CONSTANT numeric := 70.0;
  v_spurious_critical_pct CONSTANT numeric := 90.0;
  v_min_count             CONSTANT int     := 5;

  v_total_disconnects  bigint := 0;
  v_spurious_count     bigint := 0;
  v_real_count         bigint := 0;
  v_spurious_rate      numeric := 0;
  v_top_offenders      jsonb;
  v_result             jsonb;
  v_status             text;
BEGIN
  -- Count disconnects and classify within window
  WITH disconnects AS (
    SELECT
      instance_name,
      created_at AS disconnected_at,
      LEAD(state)       OVER (PARTITION BY instance_name ORDER BY created_at) AS next_state,
      LEAD(created_at)  OVER (PARTITION BY instance_name ORDER BY created_at) AS next_state_at
    FROM evo.evolution_connection_history
    WHERE state = 'disconnected'
      AND created_at >= now() - p_window
  )
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE
      next_state IN ('connecting', 'connected')
      AND (next_state_at - disconnected_at) <= p_reconnect_window
    ),
    COUNT(*) FILTER (WHERE
      next_state IS NULL
      OR next_state NOT IN ('connecting', 'connected')
      OR (next_state_at - disconnected_at) > p_reconnect_window
    )
  INTO v_total_disconnects, v_spurious_count, v_real_count
  FROM disconnects
  WHERE next_state IS NOT NULL;

  -- Calculate spurious rate
  IF v_total_disconnects > 0 THEN
    v_spurious_rate := round((v_spurious_count::numeric / v_total_disconnects) * 100, 1);
  END IF;

  -- Top offending instances
  WITH disconnects AS (
    SELECT
      instance_name,
      created_at AS disconnected_at,
      LEAD(state)       OVER (PARTITION BY instance_name ORDER BY created_at) AS next_state,
      LEAD(created_at)  OVER (PARTITION BY instance_name ORDER BY created_at) AS next_state_at
    FROM evo.evolution_connection_history
    WHERE state = 'disconnected'
      AND created_at >= now() - p_window
  ),
  classified AS (
    SELECT
      instance_name,
      CASE WHEN next_state IN ('connecting','connected')
             AND (next_state_at - disconnected_at) <= p_reconnect_window
           THEN true ELSE false END AS is_spurious
    FROM disconnects WHERE next_state IS NOT NULL
  )
  SELECT jsonb_agg(jsonb_build_object(
    'instance_name',   instance_name,
    'spurious_count',  spurious_count,
    'real_count',      real_count,
    'total',           spurious_count + real_count
  ) ORDER BY spurious_count DESC)
  INTO v_top_offenders
  FROM (
    SELECT
      instance_name,
      COUNT(*) FILTER (WHERE is_spurious)     AS spurious_count,
      COUNT(*) FILTER (WHERE NOT is_spurious)  AS real_count
    FROM classified
    GROUP BY instance_name
    HAVING COUNT(*) FILTER (WHERE is_spurious) > 0
    ORDER BY spurious_count DESC
    LIMIT 5
  ) t;

  -- Determine status
  v_status := CASE
    WHEN v_spurious_count >= v_min_count AND v_spurious_rate >= v_spurious_critical_pct THEN 'CRITICAL'
    WHEN v_spurious_count >= v_min_count AND v_spurious_rate >= v_spurious_warn_pct     THEN 'WARN'
    WHEN v_spurious_count > 0                                                           THEN 'INFO'
    ELSE 'OK'
  END;

  -- Emit CRITICAL: almost all closes are spurious → consumer filter urgently needed
  IF v_status = 'CRITICAL' THEN
    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'spurious_close_flood',
        'critical',
        format('E1-12: %.0f%% of connection closes are spurious (%s/%s) — n8n consumer filter REQUIRED',
          v_spurious_rate, v_spurious_count, v_total_disconnects),
        jsonb_build_object(
          'spurious_count',        v_spurious_count,
          'real_count',            v_real_count,
          'total_disconnects',     v_total_disconnects,
          'spurious_rate_pct',     v_spurious_rate,
          'window',                p_window,
          'reconnect_window',      p_reconnect_window,
          'top_offenders',         COALESCE(v_top_offenders, '[]'::jsonb),
          'fix_action',            'Add filter in n8n consumer: skip connection.update type=close when next event is connecting/connected within 30s',
          'threshold_warn_pct',    v_spurious_warn_pct,
          'threshold_crit_pct',    v_spurious_critical_pct
        ),
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;

  ELSIF v_status = 'WARN' THEN
    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'spurious_close_flood',
        'high',
        format('E1-12: %.0f%% of connection closes are spurious (%s/%s) — consider n8n consumer filter',
          v_spurious_rate, v_spurious_count, v_total_disconnects),
        jsonb_build_object(
          'spurious_count',        v_spurious_count,
          'real_count',            v_real_count,
          'total_disconnects',     v_total_disconnects,
          'spurious_rate_pct',     v_spurious_rate,
          'window',                p_window,
          'reconnect_window',      p_reconnect_window,
          'top_offenders',         COALESCE(v_top_offenders, '[]'::jsonb),
          'fix_action',            'Filter connection.update type=close in n8n when Baileys reconnects within 30s'
        ),
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  v_result := jsonb_build_object(
    'checked_at',          now(),
    'window',              p_window,
    'reconnect_window',    p_reconnect_window,
    'status',              v_status,
    'total_disconnects',   v_total_disconnects,
    'spurious_count',      v_spurious_count,
    'real_count',          v_real_count,
    'spurious_rate_pct',   v_spurious_rate,
    'top_offenders',       COALESCE(v_top_offenders, '[]'::jsonb),
    'thresholds',          jsonb_build_object(
                             'warn_pct',     v_spurious_warn_pct,
                             'critical_pct', v_spurious_critical_pct,
                             'min_count',    v_min_count
                           ),
    'fix_action',          'Filter connection.update type=close in n8n consumer when Baileys reconnects within 30s'
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION evo.fn_detect_spurious_closes(interval, interval) IS
  'E1-12: Detects spurious connection.update close events — disconnections where '
  'Baileys auto-reconnects within p_reconnect_window (default 30s). '
  'WARN when >70% of closes are spurious, CRITICAL when >90%. '
  'Provides per-instance breakdown to calibrate n8n consumer filter. '
  'Scheduled every 15 minutes via pg_cron.';

REVOKE EXECUTE ON FUNCTION evo.fn_detect_spurious_closes(interval, interval) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION evo.fn_detect_spurious_closes(interval, interval) TO service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- pg_cron: every 15 minutes
-- ──────────────────────────────────────────────────────────────────────────────
SELECT cron.unschedule('evo-spurious-close-detector')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'evo-spurious-close-detector');

SELECT cron.schedule(
  'evo-spurious-close-detector',
  '*/15 * * * *',
  $$SELECT evo.fn_detect_spurious_closes('1 hour'::interval, '30 seconds'::interval)$$
);
