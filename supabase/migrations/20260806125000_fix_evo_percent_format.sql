-- Fix do job AG-EX-14 (evo): fn_detect_spurious_closes + fn_peak_hours_sla_check
-- Bug: format('E1-12: %.0f%% of connection closes are spurious ...') e
--      format('E1-05: B2B SLA CRITICAL — peak-hour uptime %.2f%% (threshold: %.0f%%)')
--   -> PostgreSQL rejeita especificador printf-style "%.0f"/"%.2f" em format()
--   -> erro "unrecognized format() type specifier" QUANDO o alerta dispararia
--      (spurious rate >= threshold ou SLA abaixo do threshold)
--   -> alerta silenciado por EXCEPTION WHEN OTHERS THEN NULL (falso-negativo estrutural)
-- Fix: %s + round(<expr>::numeric, 0) (especificador %s é válido em format())
-- Aplicado de facto no DB em 2026-08-05/06 via ALTER FUNCTION manual (drift); esta migration
-- versionada alinha repo x DB e registra o fix em supabase_migrations.schema_migrations.
-- Padrão: idêntico ao fix ops.fn_edge_fn_staleness_check (20260805181000).

CREATE OR REPLACE FUNCTION evo.fn_detect_spurious_closes(p_window interval DEFAULT '01:00:00'::interval, p_reconnect_window interval DEFAULT '00:00:30'::interval)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'zapp'
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

  IF v_total_disconnects > 0 THEN
    v_spurious_rate := round((v_spurious_count::numeric / v_total_disconnects) * 100, 1);
  END IF;

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
END;
$function$;

CREATE OR REPLACE FUNCTION evo.fn_peak_hours_sla_check(p_window interval DEFAULT '01:00:00'::interval)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'zapp'
AS $function$
DECLARE
  v_peak_start     CONSTANT int  := 11;
  v_peak_end       CONSTANT int  := 21;
  v_sla_warn       CONSTANT numeric := 99.0;
  v_sla_critical   CONSTANT numeric := 95.0;

  v_is_peak        boolean;
  v_is_weekday     boolean;
  v_total_checks   bigint;
  v_healthy_checks bigint;
  v_uptime_pct     numeric;
  v_peak_failures  jsonb;
  v_result         jsonb;
BEGIN
  v_is_peak    := EXTRACT(HOUR FROM now() AT TIME ZONE 'UTC') BETWEEN v_peak_start AND v_peak_end;
  v_is_weekday := EXTRACT(DOW FROM now()) BETWEEN 1 AND 5;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('healthy', 'ok', 'connected'))
  INTO v_total_checks, v_healthy_checks
  FROM evo.evolution_health_logs
  WHERE created_at >= now() - p_window
    AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') BETWEEN v_peak_start AND v_peak_end
    AND EXTRACT(DOW FROM created_at) BETWEEN 1 AND 5;

  IF v_total_checks = 0 THEN
    SELECT COUNT(*) INTO v_total_checks
    FROM evo.evolution_health_logs
    WHERE created_at >= now() - p_window;

    v_result := jsonb_build_object(
      'checked_at',   now(),
      'is_peak',      v_is_peak,
      'is_weekday',   v_is_weekday,
      'window',       p_window,
      'status',       'NO_PEAK_DATA',
      'message',      'No health checks recorded during peak hours in this window'
    );
    RETURN v_result;
  END IF;

  v_uptime_pct := round((v_healthy_checks::numeric / v_total_checks) * 100, 2);

  SELECT jsonb_agg(jsonb_build_object(
    'created_at',     created_at,
    'status',         status,
    'error_message',  left(error_message, 200),
    'instance',       instance_name,
    'http_status',    http_status_code
  ) ORDER BY created_at DESC)
  INTO v_peak_failures
  FROM evo.evolution_health_logs
  WHERE created_at >= now() - p_window
    AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') BETWEEN v_peak_start AND v_peak_end
    AND EXTRACT(DOW FROM created_at) BETWEEN 1 AND 5
    AND status NOT IN ('healthy', 'ok', 'connected')
  LIMIT 10;

  IF v_uptime_pct < v_sla_critical THEN
    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'peak_hours_sla_breach',
        'critical',
        format('E1-05: B2B SLA CRITICAL — peak-hour uptime %s%% (threshold: %s%%)', round(v_uptime_pct, 2), round(v_sla_critical, 0)),
        jsonb_build_object(
          'uptime_pct',      v_uptime_pct,
          'total_checks',    v_total_checks,
          'healthy_checks',  v_healthy_checks,
          'failed_checks',   v_total_checks - v_healthy_checks,
          'window',          p_window,
          'peak_window',     format('%s:00--%s:00 UTC (Mon-Fri)', v_peak_start, v_peak_end),
          'recent_failures', COALESCE(v_peak_failures, '[]'::jsonb),
          'threshold_warn',  v_sla_warn,
          'threshold_crit',  v_sla_critical
        ),
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;

  ELSIF v_uptime_pct < v_sla_warn THEN
    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'peak_hours_sla_breach',
        'high',
        format('E1-05: B2B SLA WARN — peak-hour uptime %s%% (threshold: %s%%)', round(v_uptime_pct, 2), round(v_sla_warn, 0)),
        jsonb_build_object(
          'uptime_pct',      v_uptime_pct,
          'total_checks',    v_total_checks,
          'healthy_checks',  v_healthy_checks,
          'failed_checks',   v_total_checks - v_healthy_checks,
          'window',          p_window,
          'peak_window',     format('%s:00--%s:00 UTC (Mon-Fri)', v_peak_start, v_peak_end),
          'recent_failures', COALESCE(v_peak_failures, '[]'::jsonb),
          'threshold_warn',  v_sla_warn
        ),
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  v_result := jsonb_build_object(
    'checked_at',      now(),
    'is_peak',         v_is_peak,
    'is_weekday',      v_is_weekday,
    'window',          p_window,
    'uptime_pct',      v_uptime_pct,
    'total_checks',    v_total_checks,
    'healthy_checks',  v_healthy_checks,
    'failed_checks',   v_total_checks - v_healthy_checks,
    'sla_thresholds',  jsonb_build_object('warn', v_sla_warn, 'critical', v_sla_critical),
    'status',          CASE
                         WHEN v_uptime_pct < v_sla_critical THEN 'CRITICAL'
                         WHEN v_uptime_pct < v_sla_warn     THEN 'WARN'
                         ELSE 'OK'
                       END
  );

  RETURN v_result;
END;
$function$;
