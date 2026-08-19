-- ============================================================================
-- REPLAY CONVERGENTE — materializado retroativamente em 2026-08-16 a partir de
-- supabase_migrations.schema_migrations (version=20260815250015), sem arquivo
-- correspondente neste repo. Ver convencao completa em 20260815250008_*.sql.
--
-- Fonte: docs/decouple/LOTE4_FASE2_LOG.md — "A migration 250015 corrige as
-- strings source_table p/ a view (metadata verdadeira + remove falso positivo
-- do audit)". 2 statements, confirmados via supabase_migrations.schema_migrations
-- (statements=2): das 3 fns movidas em 20260815250014 que leem
-- public.evo_connection_history, apenas fn_feed_401_disconnect_alerts e
-- fn_wpp2_uptime_kpi embutem o nome da tabela fonte como literal 'source_table'
-- no payload jsonb de alerta (fn_detect_spurious_closes nao tem essa chave) —
-- por isso 2, nao 3. Corpo alvo (ja corrigido) = pg_get_functiondef atual.
-- ============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_feed_401_disconnect_alerts(p_minutes integer DEFAULT 15, p_threshold integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'zapp', 'public', 'pg_catalog'
AS $function$
DECLARE
  v_count       bigint := 0;
  v_last_event  timestamptz;
  v_events      jsonb;
  v_open_alert  boolean;
  v_alerted     boolean := false;
  v_since       timestamptz;
BEGIN
  v_since := now() - make_interval(mins => p_minutes);

  SELECT count(*), max(created_at)
  INTO v_count, v_last_event
  FROM public.evo_connection_history
  WHERE instance_name = 'wpp2'
    AND state IN ('logged_out', 'disconnected')
    AND created_at >= v_since;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'at', created_at, 'state', state, 'previous_state', previous_state,
           'source', COALESCE(metadata->>'source', 'unknown')
         ) ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_events
  FROM (
    SELECT created_at, state, previous_state, metadata
    FROM public.evo_connection_history
    WHERE instance_name = 'wpp2'
      AND state IN ('logged_out', 'disconnected')
      AND created_at >= v_since
    ORDER BY created_at DESC
    LIMIT 10
  ) e;

  SELECT EXISTS(
    SELECT 1 FROM zapp.webhook_health_alerts
    WHERE alert_type = 'sentry_401_feed' AND resolved_at IS NULL
      AND created_at > now() - interval '30 minutes'
  ) INTO v_open_alert;

  IF v_count >= p_threshold AND NOT v_open_alert THEN
    INSERT INTO zapp.webhook_health_alerts
      (alert_type, severity, title, details, created_at)
    VALUES (
      'sentry_401_feed',
      'warning',
      format('E3-10: 401/desconexão — %s evento(s) em %smin (fonte: evolution_connection_history)', v_count, p_minutes),
      jsonb_build_object(
        'generated_at', now(), 'window_minutes', p_minutes, 'since', v_since,
        'event_count', v_count, 'events', v_events,
        'last_event_at', v_last_event,
        'source_table', 'public.evo_connection_history',
        'threshold', p_threshold,
        'auto_reconnect', false,
        'action_required', 'QR_SCAN',
        'runbook', 'logout -> connect -> qrcode (skill evolution-runtime-diagnostics; AG-EX-05)',
        'decisao', 'auto-reconnect NAO implementado: enforcement do WhatsApp (Baileys 7.0.0-rc.9, issue #2248) -> restart/redeploy nao resolve; acao = alerta + re-pareamento manual (QR scan)'
      ),
      now()
    );
    INSERT INTO zapp.evolution_alerts (alert_type, severity, title, message, payload)
    VALUES (
      'wpp2_disconnect_burst',
      'critical',
      format('wpp2: %s desconexões em %s min', v_count, p_minutes),
      format('Instancia wpp2 registrou %s eventos de desconexao em %s min (threshold %s) na fonte evolution_connection_history. Sem auto-reconnect (enforcement #2248). Acao: verificar QR/re-pareamento via manager.',
        v_count, p_minutes, p_threshold),
      jsonb_build_object(
        'instance', 'wpp2', 'window_minutes', p_minutes, 'threshold', p_threshold,
        'event_count', v_count, 'source_table', 'public.evo_connection_history',
        'auto_reconnect', false, 'action_required', 'QR_SCAN'
      )
    );
    v_alerted := true;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'checked_at', now(),
    'window_minutes', p_minutes, 'threshold', p_threshold,
    'event_count', v_count, 'alerted', v_alerted,
    'last_event_at', v_last_event, 'auto_reconnect', false
  );
END $function$;

CREATE OR REPLACE FUNCTION zapp.fn_wpp2_uptime_kpi(p_instance text DEFAULT 'wpp2'::text, p_window interval DEFAULT '24:00:00'::interval, p_alert boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'public', 'pg_catalog'
AS $function$
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
    SELECT 1 FROM public.evo_connection_history WHERE instance_name = p_instance
  ) INTO v_has_hist;

  IF NOT v_has_hist THEN
    RETURN jsonb_build_object('ok', true, 'checked_at', now(), 'instance', p_instance,
      'window', p_window, 'status', 'NO_DATA',
      'message', 'sem historico em evolution_connection_history');
  END IF;

  SELECT state INTO v_state_at_ws
  FROM public.evo_connection_history
  WHERE instance_name = p_instance AND created_at <= v_ws
  ORDER BY created_at DESC
  LIMIT 1;

  WITH spans AS (
    SELECT s, state, e, synth FROM (
      SELECT created_at AS s, state,
             lead(created_at) OVER (ORDER BY created_at) AS e,
             0 AS synth
      FROM public.evo_connection_history
      WHERE instance_name = p_instance AND created_at > v_ws
    ) t
    UNION ALL
    SELECT v_ws, v_state_at_ws,
           (SELECT min(created_at) FROM public.evo_connection_history
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
    IF v_status IN ('OK', 'WARN') THEN
      UPDATE zapp.evolution_alerts
      SET resolved_at = now(), resolved_by = 'fn_wpp2_uptime_kpi-critical-recovery'
      WHERE alert_type = v_alert_type AND severity = 'critical' AND resolved_at IS NULL;
      GET DIAGNOSTICS v_tmp = ROW_COUNT;
      v_resolved := v_resolved + v_tmp;
    END IF;
    IF v_status = 'OK' THEN
      UPDATE zapp.webhook_health_alerts
      SET resolved_at = now()
      WHERE alert_type = v_alert_type AND resolved_at IS NULL;
      GET DIAGNOSTICS v_resolved = ROW_COUNT;
      UPDATE zapp.evolution_alerts
      SET resolved_at = now(), resolved_by = 'fn_wpp2_uptime_kpi'
      WHERE alert_type = v_alert_type AND resolved_at IS NULL;
      GET DIAGNOSTICS v_tmp = ROW_COUNT;
      v_resolved := v_resolved + v_tmp;
    ELSE
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
            'source_table', 'public.evo_connection_history',
            'peak_window', '11:00-21:00 UTC seg-sex',
            'sla_thresholds', jsonb_build_object('warn', v_sla_warn, 'critical', v_sla_critical)
          ),
          now()
        );
        INSERT INTO zapp.evolution_alerts (alert_type, severity, title, message, payload)
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
END $function$;
