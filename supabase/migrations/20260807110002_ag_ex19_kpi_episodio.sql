-- ============================================================================
-- AG-EX-19 — refinamento do KPI uptime: 1 alerta por EPISÓDIO + auto-resolução
-- 20260807110002_ag_ex19_kpi_episodio.sql
--
-- Problema identificado na validação pós-migração (20260807110000/10001):
-- com dedup de janela fixa (30min), um incidente longo (ex.: outage de 13.5h
-- do AG-EX-05) geraria ~27–48 notificações repetidas enquanto a janela móvel
-- de 24h permanecesse <95% — spam na cadeia de entrega (jobs 73/84).
--
-- Fix (padrão de episódio, espelhado em fn_check_evolution_jid_health):
--   * DISPARO: só quando NÃO existe alerta ABERTO do tipo (resolved_at IS NULL)
--     — sem janela de tempo → 1 alerta por episódio;
--   * AUTO-RESOLUÇÃO: quando o status volta a OK, resolve os alertas abertos
--     (webhook_health_alerts.resolved_at + evolution_alerts.resolved_at/resolved)
--     — o episódio fecha sozinho e o próximo incidente pode re-disparar.
-- ============================================================================

CREATE OR REPLACE FUNCTION evo.fn_wpp2_uptime_kpi(
  p_window   interval DEFAULT '24 hours',
  p_instance text     DEFAULT 'wpp2',
  p_alert    boolean  DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = evo, zapp, public
AS $fn$
DECLARE
  v_ws            timestamptz;
  v_state_at_ws   text;
  v_uptime_pct    numeric;
  v_peak_pct      numeric;
  v_connects      bigint := 0;
  v_disconnects   bigint := 0;
  v_last_event    timestamptz;
  v_open_alert    boolean;
  v_alerted       boolean := false;
  v_resolved      int := 0;
  v_tmp           int := 0;
  v_status        text;
  v_alert_type    text := 'wpp2_uptime_sla_breach';
  v_sla_warn      CONSTANT numeric := 99.0;
  v_sla_critical  CONSTANT numeric := 95.0;
  v_hours         numeric;
  v_has_hist      boolean;
BEGIN
  v_ws    := now() - p_window;
  v_hours := round(EXTRACT(EPOCH FROM p_window) / 3600.0, 1);

  SELECT EXISTS (
    SELECT 1 FROM evo.evolution_connection_history WHERE instance_name = p_instance
  ) INTO v_has_hist;

  IF NOT v_has_hist THEN
    RETURN jsonb_build_object('ok', true, 'checked_at', now(), 'instance', p_instance,
      'window', p_window, 'status', 'NO_DATA',
      'message', 'sem historico em evolution_connection_history');
  END IF;

  -- Estado no início da janela (último evento anterior à janela)
  SELECT state INTO v_state_at_ws
  FROM evo.evolution_connection_history
  WHERE instance_name = p_instance AND created_at <= v_ws
  ORDER BY created_at DESC
  LIMIT 1;

  WITH spans AS (
    SELECT s, state, e, synth FROM (
      SELECT created_at AS s, state,
             lead(created_at) OVER (ORDER BY created_at) AS e,
             0 AS synth
      FROM evo.evolution_connection_history
      WHERE instance_name = p_instance AND created_at > v_ws
    ) t
    UNION ALL
    SELECT v_ws, v_state_at_ws,
           (SELECT min(created_at) FROM evo.evolution_connection_history
             WHERE instance_name = p_instance AND created_at > v_ws),
           1
    WHERE v_state_at_ws IS NOT NULL
  ),
  agg AS (
    SELECT
      COALESCE(SUM(CASE WHEN state IN ('connected','open')
                   THEN EXTRACT(EPOCH FROM (COALESCE(e, now()) - s)) ELSE 0 END), 0) AS up_sec,
      SUM(CASE WHEN state IN ('connected','open') AND synth = 0 THEN 1 ELSE 0 END) AS connects,
      SUM(CASE WHEN state IN ('logged_out','disconnected') THEN 1 ELSE 0 END) AS disconnects,
      MAX(CASE WHEN synth = 0 THEN s END) AS last_event
    FROM spans
  ),
  peak AS (
    SELECT COALESCE(SUM(
      CASE WHEN state IN ('connected','open') THEN
        GREATEST(0, EXTRACT(EPOCH FROM (LEAST(COALESCE(e, now()), d + interval '21 hours')
                                      - GREATEST(s, d + interval '11 hours'))))
      ELSE 0 END), 0) AS up_sec
    FROM spans
    CROSS JOIN LATERAL generate_series(
      date_trunc('day', s), date_trunc('day', COALESCE(e, now())), interval '1 day') AS d
    WHERE EXTRACT(ISODOW FROM d) <= 5
  ),
  peak_total AS (
    SELECT COALESCE(SUM(
      CASE WHEN EXTRACT(ISODOW FROM d) <= 5 THEN
        GREATEST(0, EXTRACT(EPOCH FROM (LEAST(now(), d + interval '21 hours')
                                      - GREATEST(v_ws, d + interval '11 hours'))))
      ELSE 0 END), 0) AS sec
    FROM generate_series(date_trunc('day', v_ws), date_trunc('day', now()), interval '1 day') AS d
  )
  SELECT
    round(100.0 * a.up_sec / EXTRACT(EPOCH FROM p_window), 2),
    a.connects, a.disconnects, a.last_event,
    CASE WHEN pt.sec > 0 THEN round(100.0 * p.up_sec / pt.sec, 2) ELSE NULL END
  INTO v_uptime_pct, v_connects, v_disconnects, v_last_event, v_peak_pct
  FROM agg a CROSS JOIN peak p CROSS JOIN peak_total pt;

  v_status := CASE
    WHEN v_uptime_pct IS NULL THEN 'NO_DATA'
    WHEN v_uptime_pct < v_sla_critical OR (v_peak_pct IS NOT NULL AND v_peak_pct < v_sla_critical) THEN 'CRITICAL'
    WHEN v_uptime_pct < v_sla_warn     OR (v_peak_pct IS NOT NULL AND v_peak_pct < v_sla_warn)     THEN 'WARN'
    ELSE 'OK'
  END;

  IF p_alert THEN
    -- AUTO-RESOLUÇÃO: status voltou a OK -> fecha o episódio (1 alerta/episódio)
    IF v_status = 'OK' THEN
      UPDATE zapp.webhook_health_alerts
      SET resolved_at = now()
      WHERE alert_type = v_alert_type AND resolved_at IS NULL;
      GET DIAGNOSTICS v_resolved = ROW_COUNT;
      UPDATE evo.evolution_alerts
      SET resolved_at = now(), resolved = true, resolved_by = 'fn_wpp2_uptime_kpi'
      WHERE alert_type = v_alert_type AND resolved_at IS NULL;
      GET DIAGNOSTICS v_tmp = ROW_COUNT;
      v_resolved := v_resolved + v_tmp;
    ELSE
      -- DISPARO: apenas se não há episódio aberto
      SELECT EXISTS(
        SELECT 1 FROM zapp.webhook_health_alerts
        WHERE alert_type = v_alert_type AND resolved_at IS NULL
      ) INTO v_open_alert;

      IF NOT v_open_alert THEN
        INSERT INTO zapp.webhook_health_alerts (alert_type, severity, title, details, created_at)
        VALUES (
          v_alert_type,
          CASE WHEN v_status = 'CRITICAL' THEN 'critical' ELSE 'high' END,
          format('wpp2: uptime %s%% em %s h (pico %s%%) — SLA %s (warn %s%% / crit %s%%)',
            v_uptime_pct, v_hours, COALESCE(v_peak_pct::text, 'n/a'), v_status, v_sla_warn, v_sla_critical),
          jsonb_build_object(
            'instance', p_instance, 'window', p_window,
            'uptime_pct_24h', v_uptime_pct, 'uptime_pct_peak_hours', v_peak_pct,
            'connects', v_connects, 'disconnects', v_disconnects,
            'last_conn_event_at', v_last_event,
            'source_table', 'evo.evolution_connection_history',
            'peak_window', '11:00-21:00 UTC seg-sex',
            'sla_thresholds', jsonb_build_object('warn', v_sla_warn, 'critical', v_sla_critical)
          ),
          now()
        );
        INSERT INTO evo.evolution_alerts (alert_type, severity, title, message, payload)
        VALUES (
          v_alert_type,
          CASE WHEN v_status = 'CRITICAL' THEN 'critical' ELSE 'high' END,
          format('wpp2: uptime %s%% em %s h', v_uptime_pct, v_hours),
          format('Uptime wpp2 (janela %s h) = %s%%; pico (11-21Z seg-sex) = %s%%. Thresholds SLA: warn %s%%, crit %s%%. Fonte: evolution_connection_history.',
            v_hours, v_uptime_pct, COALESCE(v_peak_pct::text, 'n/a'), v_sla_warn, v_sla_critical),
          jsonb_build_object(
            'instance', p_instance, 'window', p_window,
            'uptime_pct_24h', v_uptime_pct, 'uptime_pct_peak_hours', v_peak_pct,
            'connects', v_connects, 'disconnects', v_disconnects
          )
        );
        v_alerted := true;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'checked_at', now(), 'instance', p_instance, 'window', p_window,
    'uptime_pct_24h', v_uptime_pct, 'uptime_pct_peak_hours', v_peak_pct,
    'connects_24h', v_connects, 'disconnects_24h', v_disconnects,
    'last_conn_event_at', v_last_event,
    'status', v_status, 'alerted', v_alerted, 'resolved', v_resolved,
    'sla_thresholds', jsonb_build_object('warn', v_sla_warn, 'critical', v_sla_critical)
  );
END;
$fn$;
