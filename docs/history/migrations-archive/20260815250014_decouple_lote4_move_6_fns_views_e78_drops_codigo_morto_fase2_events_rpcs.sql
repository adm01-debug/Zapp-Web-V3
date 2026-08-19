-- ============================================================================
-- REPLAY CONVERGENTE — materializado retroativamente em 2026-08-16 a partir de
-- supabase_migrations.schema_migrations (version=20260815250014), sem arquivo
-- correspondente neste repo. Ver convencao completa em 20260815250008_*.sql.
--
-- Fonte: docs/decouple/LOTE4_FASE2_LOG.md. Corpos: pg_get_functiondef em
-- producao 2026-08-15 pos-Lote5.
--
-- LACUNA (assinaturas): as 5 fns dropadas abaixo ja nao existem em producao
-- (confirmado: 0 linhas em pg_proc para qualquer overload desses nomes) —
-- pg_get_functiondef nao pode confirmar a assinatura exata de argumentos.
-- fn_mirror_to_webhook_events_v2 e trigger-fn (RETURNS trigger, sem args,
-- confirmado por ser trigger-fn de INSERT — ver E62_REPOINT_LOG.md); as outras
-- 3 (fn_reprocess_instance_webhook_events, fn_route_failed_webhooks_to_dlq,
-- fn_purge_processed_webhook_events) tinham assinaturas nao documentadas nos
-- logs. DROP FUNCTION sem lista de argumentos resolve por nome quando unico
-- no schema (comportamento padrao do Postgres) — seguro aqui pois os nomes
-- ja nao existem mais (idempotente/no-op se o replay rodar fora de ordem).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Drops de codigo morto (0 refs em pg_proc, 0 crons — verificado na sessao original)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS zapp.fn_mirror_to_webhook_events_v2();
DROP FUNCTION IF EXISTS evo.rpc_boundary_mirror_event(jsonb);
DROP FUNCTION IF EXISTS zapp.fn_reprocess_instance_webhook_events;
DROP FUNCTION IF EXISTS zapp.fn_route_failed_webhooks_to_dlq;
DROP FUNCTION IF EXISTS zapp.fn_purge_processed_webhook_events;

-- ---------------------------------------------------------------------------
-- Lote 4 — 6 fns evo->zapp (I1 -6)
-- ---------------------------------------------------------------------------

-- Move puro (corpo 100% zapp-qualificado)
CREATE OR REPLACE FUNCTION zapp.fn_backfill_contact_id(p_batch integer DEFAULT 20000)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE v_n int;
BEGIN
  UPDATE zapp.evolution_messages_wpp2 m
  SET contact_id = sub.contact_id
  FROM (
    SELECT m2.ctid AS locked_ctid, ec2.id AS contact_id
    FROM zapp.evolution_messages_wpp2 m2
    JOIN zapp.evolution_contacts ec2
      ON ec2.remote_jid    = m2.remote_jid
     AND ec2.instance_name = m2.instance_name
    WHERE m2.contact_id IS NULL
    LIMIT p_batch
    FOR UPDATE OF m2 SKIP LOCKED
  ) sub
  WHERE m.ctid = sub.locked_ctid;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

DROP FUNCTION IF EXISTS evo.fn_backfill_contact_id(integer);
SELECT cron.alter_job(334, command => 'SELECT zapp.fn_backfill_contact_id(5000)');

CREATE OR REPLACE FUNCTION zapp.fn_shadow_snapshot_daily()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE
  v_result jsonb := '{}';
  r RECORD;
BEGIN
  -- Apagar snapshot do dia corrente se existir (re-run idempotente)
  DELETE FROM zapp.evolution_source_shadow_log WHERE snapshot_date = current_date;

  FOR r IN
    SELECT
      COALESCE(webhook_source, 'legacy') AS source,
      count(*) AS event_count,
      jsonb_object_agg(DISTINCT event_type, 1) AS event_types
    FROM zapp.webhook_events_processed
    WHERE processed_at > now() - interval '24 hours'
    GROUP BY COALESCE(webhook_source, 'legacy')
  LOOP
    INSERT INTO zapp.evolution_source_shadow_log(snapshot_date, window_days, source, event_count, event_types)
    VALUES (current_date, 1, r.source, r.event_count, r.event_types);
    v_result := v_result || jsonb_build_object(r.source, r.event_count);
  END LOOP;

  RETURN v_result || jsonb_build_object('snapshot_date', current_date);
END;
$function$;

DROP FUNCTION IF EXISTS evo.fn_shadow_snapshot_daily();
SELECT cron.alter_job(319, command => 'SELECT zapp.fn_shadow_snapshot_daily()');

-- Homonima independente da ops. (monitoram ids diferentes); search_path ganhou cron
CREATE OR REPLACE FUNCTION zapp.fn_ensure_critical_crons_active()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'cron', 'pg_catalog'
AS $function$
DECLARE
  v_results jsonb := '[]'::jsonb;
  v_issues  int   := 0;
  v_rec     record;

  -- Crons críticos: (jobid, nome, max_silence_minutes)
  -- silence = max tempo sem execução bem-sucedida antes de alertar
  v_critical_crons int[][] := ARRAY[
    [328, 65],    -- lid-passive-accumulator (*/30min, alertar se > 65min)
    [429, 6],     -- pipeline-canary-keep-alive (*/3min, alertar se > 6min)
    [466, 70],    -- lid-convergence-snapshot-hourly (0 * * * *, alertar se > 70min)
    [467, 370],   -- lid-normalizer-test-suite-6h (0 */6, alertar se > 370min)
    [468, 130]    -- lid-regression-suite-2h (0 */2, alertar se > 130min)
  ];
  v_pair int[];
BEGIN
  FOREACH v_pair SLICE 1 IN ARRAY v_critical_crons
  LOOP
    SELECT
      j.jobid,
      j.jobname,
      j.active,
      d.status AS last_status,
      d.start_time AS last_run,
      EXTRACT(EPOCH FROM (now() - d.start_time))/60 AS silence_min
    INTO v_rec
    FROM cron.job j
    LEFT JOIN (
      SELECT jobid, status, start_time,
             ROW_NUMBER() OVER (PARTITION BY jobid ORDER BY runid DESC) AS rn
      FROM cron.job_run_details
    ) d ON d.jobid = j.jobid AND d.rn = 1
    WHERE j.jobid = v_pair[1];

    IF v_rec.jobid IS NULL THEN
      -- Cron não encontrado → CRITICAL
      v_issues := v_issues + 1;
      v_results := v_results || jsonb_build_object(
        'jobid', v_pair[1], 'status', 'MISSING',
        'severity', 'critical', 'message', 'Cron job não encontrado'
      );
      -- Criar alerta
      INSERT INTO zapp.evolution_alerts (alert_type, severity, message, payload)
      VALUES (
        'cron_critical_missing', 'critical',
        format('Cron crítico jobid=%s não existe', v_pair[1]),
        jsonb_build_object('jobid', v_pair[1], 'check', 'fn_ensure_critical_crons_active')
      ) ON CONFLICT DO NOTHING;

    ELSIF NOT v_rec.active THEN
      -- Cron desativado → HIGH
      v_issues := v_issues + 1;
      v_results := v_results || jsonb_build_object(
        'jobid', v_rec.jobid, 'jobname', v_rec.jobname,
        'status', 'INACTIVE', 'severity', 'high',
        'message', 'Cron desativado'
      );
      INSERT INTO zapp.evolution_alerts (alert_type, severity, message, payload)
      VALUES (
        'cron_critical_inactive', 'high',
        format('Cron crítico "%s" (jobid=%s) está DESATIVADO', v_rec.jobname, v_rec.jobid),
        jsonb_build_object('jobid', v_rec.jobid, 'jobname', v_rec.jobname)
      ) ON CONFLICT DO NOTHING;

    ELSIF v_rec.last_run IS NULL OR v_rec.silence_min > v_pair[2] THEN
      -- Cron ativo mas não rodou a tempo → WARN
      v_issues := v_issues + 1;
      v_results := v_results || jsonb_build_object(
        'jobid', v_rec.jobid, 'jobname', v_rec.jobname,
        'status', 'STALE', 'severity', 'medium',
        'silence_min', round(v_rec.silence_min::numeric, 1),
        'max_silence_min', v_pair[2],
        'last_run', v_rec.last_run,
        'last_status', v_rec.last_status
      );

    ELSIF v_rec.last_status != 'succeeded' THEN
      -- Último run falhou → WARN
      v_results := v_results || jsonb_build_object(
        'jobid', v_rec.jobid, 'jobname', v_rec.jobname,
        'status', 'LAST_FAILED', 'severity', 'medium',
        'last_run', v_rec.last_run,
        'last_status', v_rec.last_status
      );

    ELSE
      -- OK
      v_results := v_results || jsonb_build_object(
        'jobid', v_rec.jobid, 'jobname', v_rec.jobname,
        'status', 'OK', 'severity', 'none',
        'last_run', v_rec.last_run,
        'silence_min', round(v_rec.silence_min::numeric, 1)
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_issues = 0 THEN 'ALL_OK' ELSE 'ISSUES_FOUND' END,
    'issues', v_issues,
    'crons_checked', array_length(v_critical_crons, 1),
    'results', v_results,
    'ts', now()
  );
END;
$function$;

DROP FUNCTION IF EXISTS evo.fn_ensure_critical_crons_active();
SELECT cron.alter_job(481, command => 'SELECT zapp.fn_ensure_critical_crons_active()');

-- Move + leituras via views E78 (evo.evolution_connection_history -> public.evo_connection_history)
CREATE OR REPLACE FUNCTION zapp.fn_detect_spurious_closes(p_window interval DEFAULT '01:00:00'::interval, p_reconnect_window interval DEFAULT '00:00:30'::interval)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'public', 'pg_catalog'
AS $function$
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
  WITH disconnects AS (
    SELECT
      instance_name,
      created_at AS disconnected_at,
      LEAD(state)       OVER (PARTITION BY instance_name ORDER BY created_at) AS next_state,
      LEAD(created_at)  OVER (PARTITION BY instance_name ORDER BY created_at) AS next_state_at
    FROM public.evo_connection_history
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
  IF v_total_disconnects > 0 THEN
    v_spurious_rate := round((v_spurious_count::numeric / v_total_disconnects) * 100, 1);
  END IF;
  WITH disconnects AS (
    SELECT
      instance_name,
      created_at AS disconnected_at,
      LEAD(state)       OVER (PARTITION BY instance_name ORDER BY created_at) AS next_state,
      LEAD(created_at)  OVER (PARTITION BY instance_name ORDER BY created_at) AS next_state_at
    FROM public.evo_connection_history
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
  v_status := CASE
    WHEN v_spurious_count >= v_min_count AND v_spurious_rate >= v_spurious_critical_pct THEN 'CRITICAL'
    WHEN v_spurious_count >= v_min_count AND v_spurious_rate >= v_spurious_warn_pct     THEN 'WARN'
    WHEN v_spurious_count > 0                                                           THEN 'INFO'
    ELSE 'OK'
  END;
  IF v_status = 'CRITICAL' THEN
    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'spurious_close_flood',
        'critical',
        format('E1-12: %s%% of connection closes are spurious (%s/%s) — n8n consumer filter REQUIRED',
          round(v_spurious_rate, 0), v_spurious_count, v_total_disconnects),
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
        format('E1-12: %s%% of connection closes are spurious (%s/%s) — consider n8n consumer filter',
          round(v_spurious_rate, 0), v_spurious_count, v_total_disconnects),
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
END $function$;

DROP FUNCTION IF EXISTS evo.fn_detect_spurious_closes(interval, interval);
SELECT cron.alter_job(166, command => 'SELECT zapp.fn_detect_spurious_closes(''1 hour''::interval, ''30 seconds''::interval)');

-- Move + leituras via views E78 (source_table literal ainda 'evo.evolution_connection_history'
-- neste ponto — corrigido em 20260815250015)
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
        'source_table', 'evo.evolution_connection_history',
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
END $function$;

DROP FUNCTION IF EXISTS evo.fn_feed_401_disconnect_alerts(integer, integer);
SELECT cron.alter_job(161, command => 'SELECT zapp.fn_feed_401_disconnect_alerts()');

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
            'source_table', 'evo.evolution_connection_history',
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

DROP FUNCTION IF EXISTS evo.fn_wpp2_uptime_kpi(text, interval, boolean);
SELECT cron.alter_job(163, command => 'SELECT zapp.fn_wpp2_uptime_kpi()');

-- Achado: a "chamada" de fn_wpp2_uptime_kpi em fn_sync_instance_registry_status
-- era so comentario — nenhum chamador real, nenhuma acao necessaria.

-- ---------------------------------------------------------------------------
-- E62 fase 2 — RPCs de eventos + repoints (I2 -2 alem dos drops)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION evo.rpc_boundary_events_pull(p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, event_type text, instance_name text, payload jsonb, retry_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
BEGIN
  RETURN QUERY SELECT e.id, e.event_type, e.instance_name, e.payload, e.retry_count
  FROM evo.evolution_webhook_events_v2 e
  WHERE e.status IN ('pending','failed')
    AND e.created_at < now() - interval '30 seconds'
    AND e.retry_count < 5
  ORDER BY e.created_at
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit,100), 1000));
END $function$;

CREATE OR REPLACE FUNCTION evo.rpc_boundary_event_mark_ok(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
BEGIN
  UPDATE evo.evolution_webhook_events_v2
  SET processed = true, processed_at = now(), error_message = NULL, status = 'processed'
  WHERE id = p_id;
END $function$;

CREATE OR REPLACE FUNCTION evo.rpc_boundary_event_mark_fail(p_id uuid, p_error text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
BEGIN
  UPDATE evo.evolution_webhook_events_v2
  SET error_message = p_error,
      retry_count = COALESCE(retry_count, 0) + 1,
      status = CASE WHEN COALESCE(retry_count, 0) + 1 >= 5 THEN 'dead_letter' ELSE 'failed' END
  WHERE id = p_id;
END $function$;

CREATE OR REPLACE FUNCTION evo.rpc_boundary_purge_events(p_retention_days integer, p_batch_size integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
DECLARE v_total bigint := 0; v_batch bigint; v_table text; v_sql text; v_result jsonb := '{}'::jsonb;
BEGIN
  FOR v_table IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='evo' AND c.relkind IN ('r','p') AND c.relname LIKE 'evolution_webhook_events%'
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='evo' AND table_name=c.relname AND column_name='processed')
    ORDER BY c.relname
  LOOP
    v_sql := format($q$ WITH del AS (DELETE FROM evo.%I WHERE processed = true AND created_at < NOW() - INTERVAL '1 day' * %s AND ctid IN (SELECT ctid FROM evo.%I WHERE processed = true AND created_at < NOW() - INTERVAL '1 day' * %s LIMIT %s) RETURNING 1) SELECT count(*) FROM del $q$, v_table, p_retention_days, v_table, p_retention_days, p_batch_size);
    EXECUTE v_sql INTO v_batch;
    v_total := v_total + v_batch;
    IF v_batch > 0 THEN v_result := v_result || jsonb_build_object('evo.'||v_table, v_batch); END IF;
  END LOOP;
  RETURN v_result || jsonb_build_object('_total_deleted', v_total);
END $function$;

REVOKE ALL ON FUNCTION evo.rpc_boundary_events_pull(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION evo.rpc_boundary_event_mark_ok(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION evo.rpc_boundary_event_mark_fail(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION evo.rpc_boundary_purge_events(integer, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION evo.rpc_boundary_events_pull(integer) TO zapp_writer;
GRANT EXECUTE ON FUNCTION evo.rpc_boundary_event_mark_ok(uuid) TO zapp_writer;
GRANT EXECUTE ON FUNCTION evo.rpc_boundary_event_mark_fail(uuid, text) TO zapp_writer;
GRANT EXECUTE ON FUNCTION evo.rpc_boundary_purge_events(integer, integer) TO zapp_writer;

-- Repontada (cron 17) — pull/mark via RPC
CREATE OR REPLACE FUNCTION zapp.fn_reprocess_pending_webhook_events(p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo'
AS $function$
DECLARE
  e RECORD;
  v_ok int := 0;
  v_fail int := 0;
  v_stats jsonb := '{}'::jsonb;
  v_action_count int;
BEGIN
  FOR e IN
    SELECT * FROM evo.rpc_boundary_events_pull(p_limit)
  LOOP
    BEGIN
      IF e.event_type IN ('contacts.upsert','contacts.update','CONTACTS_UPSERT','CONTACTS_UPDATE') THEN
        PERFORM zapp.fn_process_contacts_batch(e.payload, COALESCE(e.instance_name, 'wpp2'));
        v_action_count := COALESCE((v_stats->>'contacts')::int, 0) + 1;
        v_stats := v_stats || jsonb_build_object('contacts', v_action_count);

      ELSIF e.event_type IN ('messages.edited','MESSAGES_EDITED') THEN
        PERFORM zapp.fn_process_message_edited(e.payload, COALESCE(e.instance_name, 'wpp2'));
        v_action_count := COALESCE((v_stats->>'messages_edited')::int, 0) + 1;
        v_stats := v_stats || jsonb_build_object('messages_edited', v_action_count);

      ELSIF e.event_type IN ('chats.update','CHATS_UPDATE') THEN
        PERFORM zapp.fn_process_chat_update(e.payload, COALESCE(e.instance_name, 'wpp2'));
        v_action_count := COALESCE((v_stats->>'chats_update')::int, 0) + 1;
        v_stats := v_stats || jsonb_build_object('chats_update', v_action_count);

      ELSIF e.event_type IN ('messages.upsert','MESSAGES_UPSERT') THEN
        PERFORM zapp.fn_process_whatsapp_message(e.payload, COALESCE(e.instance_name, 'wpp2'));
        v_action_count := COALESCE((v_stats->>'messages_upsert')::int, 0) + 1;
        v_stats := v_stats || jsonb_build_object('messages_upsert', v_action_count);

      ELSE
        v_action_count := COALESCE((v_stats->>'skipped_no_handler')::int, 0) + 1;
        v_stats := v_stats || jsonb_build_object('skipped_no_handler', v_action_count);
      END IF;

      PERFORM evo.rpc_boundary_event_mark_ok(e.id);
      v_ok := v_ok + 1;

    EXCEPTION WHEN OTHERS THEN
      PERFORM evo.rpc_boundary_event_mark_fail(e.id, SQLERRM);
      v_fail := v_fail + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', v_ok,
    'failed', v_fail,
    'distribution', v_stats,
    'source_table', 'evolution_webhook_events_v2',
    'timestamp', NOW()
  );
END $function$;

SELECT cron.alter_job(17, command => ' SELECT zapp.fn_reprocess_pending_webhook_events(200); ');

-- Repontada (cron 263) — loop dinamico evo extraido p/ rpc_boundary_purge_events; purges zapp inalterados
CREATE OR REPLACE FUNCTION zapp.fn_webhook_purge_consolidated(p_v2_retention_days integer DEFAULT 30, p_batch_size integer DEFAULT 5000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp, ops, pg_catalog'
AS $function$
DECLARE v_total bigint := 0; v_batch bigint; v_evo jsonb; v_result jsonb := '{}'::jsonb;
BEGIN
  v_evo := evo.rpc_boundary_purge_events(p_v2_retention_days, p_batch_size);
  v_total := COALESCE((v_evo->>'_total_deleted')::bigint, 0);
  v_result := v_result || (v_evo - '_total_deleted');

  DELETE FROM zapp.webhook_audit_log WHERE status='processed' AND created_at < NOW() - INTERVAL '3 days';
  GET DIAGNOSTICS v_batch = ROW_COUNT; v_total := v_total + v_batch;
  IF v_batch > 0 THEN v_result := v_result || jsonb_build_object('webhook_audit_log.processed_3d', v_batch); END IF;

  DELETE FROM zapp.webhook_audit_log WHERE status='rejected' AND created_at < NOW() - INTERVAL '1 day';
  GET DIAGNOSTICS v_batch = ROW_COUNT; v_total := v_total + v_batch;
  IF v_batch > 0 THEN v_result := v_result || jsonb_build_object('webhook_audit_log.rejected_1d', v_batch); END IF;

  DELETE FROM zapp.webhook_audit_log WHERE status='duplicate' AND created_at < NOW() - INTERVAL '3 days';
  GET DIAGNOSTICS v_batch = ROW_COUNT; v_total := v_total + v_batch;
  IF v_batch > 0 THEN v_result := v_result || jsonb_build_object('webhook_audit_log.duplicate_3d', v_batch); END IF;

  DELETE FROM zapp.webhook_audit_log WHERE created_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS v_batch = ROW_COUNT; v_total := v_total + v_batch;
  IF v_batch > 0 THEN v_result := v_result || jsonb_build_object('webhook_audit_log.todos_30d', v_batch); END IF;

  LOOP
    DELETE FROM zapp.webhook_events_processed WHERE id IN (SELECT id FROM zapp.webhook_events_processed WHERE processed_at < now() - interval '30 days' LIMIT 5000);
    GET DIAGNOSTICS v_batch = ROW_COUNT; v_total := v_total + v_batch;
    EXIT WHEN v_batch = 0;
    PERFORM pg_sleep(0.2);
  END LOOP;

  v_result := v_result || jsonb_build_object('_total_deleted', v_total);
  INSERT INTO ops.maintenance_log (job, details, ran_at)
  VALUES ('fn_webhook_purge_consolidated', jsonb_build_object('deleted_rows', v_total, 'retencoes', jsonb_build_object('v2_processed_dias', p_v2_retention_days, 'audit_processed_dias', 3, 'audit_rejected_dias', 1, 'audit_duplicate_dias', 3, 'audit_todos_dias', 30, 'events_processed_dias', 30)), now())
  ON CONFLICT DO NOTHING;
  RETURN v_result;
END $function$;

SELECT cron.alter_job(263, command => 'SELECT zapp.fn_webhook_purge_consolidated(30, 5000)');
