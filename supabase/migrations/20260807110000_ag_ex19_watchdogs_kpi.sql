-- ============================================================================
-- AG-EX-19 — Consolidação de watchdogs de conexão + KPI uptime wpp2
-- Data: 2026-08-07 · Itens 25 / 28 / 29 / 30 do runbook de infraestrutura
-- Base de evidência: AG-EX-05-wpp2-401.md (fonte real = evo.evolution_connection_history)
--
-- NOTA DE COEXISTÊNCIA (sessões paralelas no mesmo repo):
--   * O item 85 da AG-EX-17 (migration 20260807091000) já reescreveu o job 161
--     com evo.fn_get_401_payload_v2() (fonte real, threshold >=3/15min, dedup
--     30min) gravando APENAS em zapp.webhook_health_alerts (severity warning).
--   * Esta migration COMPLEMENTA o item 85 (não dropa nada): cria
--     evo.fn_feed_401_disconnect_alerts() que preserva o alert_type
--     'sentry_401_feed' (integração com o job 173 — fn_detect_401_bursts conta
--     esse tipo como sinal) E adiciona a entrega real: insert em
--     evo.evolution_alerts (severity critical) — única cadeia que NOTIFICA
--     (job 84 -> wpp2/n8n/Bitrix24; job 73 -> escalada; job 205 -> verificação).
--     fn_get_401_payload_v2 fica órfã benigna (mantida, documentada).
--
-- Resumo das mudanças:
--  1. ITEM 29 — job 161: função unificada evo.fn_feed_401_disconnect_alerts()
--     lendo evo.evolution_connection_history (logged_out/disconnected) ->
--     webhook_health_alerts (sentry_401_feed, warning, p/ integração com 173)
--     + evolution_alerts (wpp2_disconnect_burst, critical, p/ entrega 73/84).
--     SEM auto-reconnect (decisão documentada: enforcement do WhatsApp sobre
--     Baileys 7.0.0-rc.9 (issue #2248) -> auto-reconnect = loop de re-pairing;
--     ação = alerta + runbook QR scan).
--  2. ITEM 30 — KPI '% uptime 24h do wpp2': view evo.v_wpp2_uptime_24h (SQL do
--     AG-EX-05, com correção do estado no início da janela) + colunas novas em
--     evo.v_kpi_overview + função evo.fn_wpp2_uptime_kpi (uptime 24h + pico
--     11-21Z seg-sex, alertas SLA 99%/95%) re-apontando o job 163
--     (evo-peak-hours-sla) que era NO_PEAK_DATA eterno (evolution_health_logs
--     com 1 linha).
--  3. ITEM 25 — consolidação de watchdogs:
--     - watchdog-baileys (container): CANÔNICO (mantido) — estado via API 5min,
--       restart p/ state!=open>=30min, suppression device_removed(401), flapping.
--     - watchdog-canary (container): MANTIDO — cobertura ÚNICA (half-duplex:
--       sendText canário 10min, 2 falhas -> restart serviço). Não é redundante.
--     - job 104 (wpp2_disconnection_watchdog): DESATIVADO — redundante com
--       watchdog-baileys + novo burst feed (mesma família de sinal: estado de
--       conexão; fonte downstream whatsapp_connections). Dry-run 06/08:
--       connected -> ok. 25 alertas wpp2_disconnection abertos sem resolução.
--     - job 120 (wpp2-session-expiry-watchdog): DESATIVADO — fonte ineficaz
--       (health_status deriva de gap de MENSAGENS via fn_update_instance_health,
--       não de estado de conexão; não disparou no outage 05-06/08; último
--       alerta 25/07). Dry-run: 0 linhas inseríveis.
--     - job 35 (evolution-jid-health-check): MANTIDO — NÃO é watchdog de
--       conexão (qualidade JID de mensagens); sem overlap.
--  4. ITEM 28 — job 160 (evo-swarm-duplicate-detector): VALIDADO e MANTIDO —
--     mudo por design (único escritor de evo.evolution_guardian_heartbeat =
--     pg-cron-liveness job 193, 5/5min -> nunca >2/window; double-open exige
--     2 OPEN <=60s). 559 runs succeeded/3d, 0 alertas swarm_task_duplicate.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) ITEM 29 — Feed 401/desconexão na fonte REAL + entrega (job 161)
--    Complementa o item 85 (AG-EX-17): mesma semântica de contagem, agora com
--    entrega real via evolution_alerts (critical) + payload rico (runbook).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION evo.fn_feed_401_disconnect_alerts(
  p_minutes   int DEFAULT 15,
  p_threshold int DEFAULT 3
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = evo, zapp, public
AS $fn$
DECLARE
  v_count       bigint := 0;
  v_last_event  timestamptz;
  v_events      jsonb;
  v_open_alert  boolean;
  v_alerted     boolean := false;
  v_since       timestamptz;
BEGIN
  v_since := now() - make_interval(mins => p_minutes);

  -- Fonte REAL de estado de conexão (AG-EX-05): evolution_connection_history.
  -- Estados logged_out/disconnected na janela = assinatura de 401/enforcement
  -- do WhatsApp (device_removed, issue #2248) e flapping de QR.
  SELECT count(*), max(created_at)
  INTO v_count, v_last_event
  FROM evo.evolution_connection_history
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
    FROM evo.evolution_connection_history
    WHERE instance_name = 'wpp2'
      AND state IN ('logged_out', 'disconnected')
      AND created_at >= v_since
    ORDER BY created_at DESC
    LIMIT 10
  ) e;

  -- Dedup: 1 alerta aberto por episódio (não re-dispara a cada tick)
  SELECT EXISTS(
    SELECT 1 FROM zapp.webhook_health_alerts
    WHERE alert_type = 'sentry_401_feed' AND resolved_at IS NULL
      AND created_at > now() - interval '30 minutes'
  ) INTO v_open_alert;

  IF v_count >= p_threshold AND NOT v_open_alert THEN
    -- (a) Registro canônico — MANTÉM alert_type 'sentry_401_feed' (o job 173
    --     fn_detect_401_bursts conta esse tipo como sinal de 401).
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
        'source_table', 'evo.evolution_connection_history',
        'threshold', p_threshold,
        'auto_reconnect', false,
        'action_required', 'QR_SCAN',
        'runbook', 'logout -> connect -> qrcode (skill evolution-runtime-diagnostics; AG-EX-05)',
        'decisao', 'auto-reconnect NAO implementado: enforcement do WhatsApp (Baileys 7.0.0-rc.9, issue #2248) -> restart/redeploy nao resolve; acao = alerta + re-pareamento manual (QR scan)'
      ),
      now()
    );
    -- (b) Entrega real — cadeia de notificação/escalada (jobs 73/84/205 leem
    --     evo.evolution_alerts). critical p/ escalar.
    INSERT INTO evo.evolution_alerts (alert_type, severity, title, message, payload)
    VALUES (
      'wpp2_disconnect_burst',
      'critical',
      format('wpp2: %s desconexões em %s min', v_count, p_minutes),
      format('Instancia wpp2 registrou %s eventos de desconexao em %s min (threshold %s) na fonte evolution_connection_history. Sem auto-reconnect (enforcement #2248). Acao: verificar QR/re-pareamento via manager (evolution.atomicabr.com.br/manager).',
        v_count, p_minutes, p_threshold),
      jsonb_build_object(
        'instance', 'wpp2', 'window_minutes', p_minutes, 'threshold', p_threshold,
        'event_count', v_count, 'source_table', 'evo.evolution_connection_history',
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
END;
$fn$;

-- ----------------------------------------------------------------------------
-- 2) ITEM 30 — View KPI '% uptime 24h do wpp2' (SQL do AG-EX-05, corrigido)
--    Correção: estado no início da janela vem do último evento anterior à
--    janela (span sintético) — evita uptime 0% falso quando não há eventos
--    dentro da janela (instância estável >24h sem mudança de estado).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW evo.v_wpp2_uptime_24h
WITH (security_invoker = true) AS
WITH ws AS (
  SELECT now() - interval '24 hours' AS t
),
hist AS (
  SELECT created_at AS s, state,
         lead(created_at) OVER (ORDER BY created_at) AS e
  FROM evo.evolution_connection_history
  WHERE instance_name = 'wpp2'
    AND created_at > (SELECT t FROM ws)
),
first_state AS (
  SELECT COALESCE(
    (SELECT state FROM evo.evolution_connection_history
      WHERE instance_name = 'wpp2' AND created_at <= (SELECT t FROM ws)
      ORDER BY created_at DESC LIMIT 1),
    NULL
  ) AS st
),
has_hist AS (
  SELECT EXISTS (SELECT 1 FROM evo.evolution_connection_history WHERE instance_name = 'wpp2') AS h
),
spans AS (
  SELECT s, state, COALESCE(e, now()) AS e, 0 AS synth FROM hist
  UNION ALL
  SELECT (SELECT t FROM ws), st,
         (SELECT min(created_at) FROM evo.evolution_connection_history
           WHERE instance_name = 'wpp2' AND created_at > (SELECT t FROM ws)),
         1
  FROM first_state WHERE st IS NOT NULL
)
SELECT
  CASE WHEN (SELECT h FROM has_hist) THEN
    round(100.0 * COALESCE(SUM(CASE WHEN state IN ('connected','open')
            THEN EXTRACT(EPOCH FROM (e - s)) ELSE 0 END), 0)
            / EXTRACT(EPOCH FROM interval '24 hours'), 2)
  ELSE NULL END AS uptime_pct_24h,
  CASE WHEN (SELECT h FROM has_hist) THEN
    SUM(CASE WHEN state IN ('connected','open') AND synth = 0 THEN 1 ELSE 0 END)
  ELSE NULL END AS connects_24h,
  CASE WHEN (SELECT h FROM has_hist) THEN
    SUM(CASE WHEN state IN ('logged_out','disconnected') THEN 1 ELSE 0 END)
  ELSE NULL END AS disconnects_24h,
  CASE WHEN (SELECT h FROM has_hist) THEN MAX(CASE WHEN synth = 0 THEN s END)
  ELSE NULL END AS last_conn_event_at,
  now() AS checked_at
FROM spans;

-- ----------------------------------------------------------------------------
-- 3) ITEM 30 — Função KPI + alerta SLA (re-aponta job 163)
--    uptime 24h (spans connected/open) + uptime em janela de pico
--    (11:00–21:00 UTC, seg–sex) com interseção exata span × pico.
--    Alertas: warn < 99%, critical < 95% (mesmos thresholds do job 163 antigo),
--    com dedup de 30min, em webhook_health_alerts + evolution_alerts.
-- ----------------------------------------------------------------------------
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

  IF p_alert AND v_status IN ('CRITICAL','WARN') THEN
    SELECT EXISTS(
      SELECT 1 FROM zapp.webhook_health_alerts
      WHERE alert_type = v_alert_type AND resolved_at IS NULL
        AND created_at > now() - interval '30 minutes'
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

  RETURN jsonb_build_object(
    'ok', true, 'checked_at', now(), 'instance', p_instance, 'window', p_window,
    'uptime_pct_24h', v_uptime_pct, 'uptime_pct_peak_hours', v_peak_pct,
    'connects_24h', v_connects, 'disconnects_24h', v_disconnects,
    'last_conn_event_at', v_last_event,
    'status', v_status, 'alerted', v_alerted,
    'sla_thresholds', jsonb_build_object('warn', v_sla_warn, 'critical', v_sla_critical)
  );
END;
$fn$;


-- ----------------------------------------------------------------------------
-- NOTA: as seções 4–6 (extensão do evo.v_kpi_overview, UPDATEs em cron.job e
-- upsert no cron_inventory) foram aplicadas como migration separada
-- `20260807110001_ag_ex19_v2_cron_and_inventory.sql` (divisão operacional do
-- payload no apply_migration) — ver aquele arquivo. Este espelho é fiel à
-- versão 20260807110000 aplicada no banco.
-- ----------------------------------------------------------------------------
