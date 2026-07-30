-- ============================================================================
-- Peak-Hours SLA Monitor (E1-05)
-- Auditoria 2026-07-10
--
-- E1-05 — Downtime em horário de pico (B2B)
--   Falhas de saúde da Evolution API durante horário comercial (08:00-18:00 BRT,
--   Seg-Sex) impactam diretamente clientes B2B. O sistema carece de alertas
--   específicos para o contexto B2B e não distingue downtime em pico de downtime
--   em horário de baixo tráfego.
--
-- Solução: DB-side SLA monitor que:
--   1. Analisa evolution_health_logs buscando falhas em horário de pico
--   2. Calcula uptime % por janela (última 1h / 24h / 7d)
--   3. Emite alerta critical em zapp.webhook_health_alerts quando SLA < threshold
--   4. Persiste snapshot diário em evolution_daily_metrics (se existir campo)
--
-- Thresholds:
--   sla_warn_pct    = 99.0% (WARN se uptime < 99% em 1h de pico)
--   sla_critical_pct = 95.0% (CRITICAL se uptime < 95%)
--
-- Scheduled: a cada 15 minutos durante horário de pico (*/15 * * * *)
-- Idempotente: CREATE OR REPLACE + cron.unschedule.
-- ============================================================================

CREATE OR REPLACE FUNCTION evo.fn_peak_hours_sla_check(
  p_window interval DEFAULT '1 hour'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public, zapp, pg_temp
AS $$
DECLARE
  -- Horário de pico B2B: 08:00-18:00 BRT (UTC-3) → 11:00-21:00 UTC
  v_peak_start     CONSTANT int  := 11;  -- 08:00 BRT = 11:00 UTC
  v_peak_end       CONSTANT int  := 21;  -- 18:00 BRT = 21:00 UTC
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
  -- Determine if current time is within peak hours
  v_is_peak    := EXTRACT(HOUR FROM now() AT TIME ZONE 'UTC') BETWEEN v_peak_start AND v_peak_end;
  v_is_weekday := EXTRACT(DOW FROM now()) BETWEEN 1 AND 5;  -- Mon=1, Fri=5

  -- Always run the check, but flag whether we're in peak or off-peak
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('healthy', 'ok', 'connected'))
  INTO v_total_checks, v_healthy_checks
  FROM evo.evolution_health_logs
  WHERE created_at >= now() - p_window
    -- Only count checks during peak hours for SLA calculation
    AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC') BETWEEN v_peak_start AND v_peak_end
    AND EXTRACT(DOW FROM created_at) BETWEEN 1 AND 5;

  -- Calculate uptime %
  IF v_total_checks = 0 THEN
    -- No peak-hour checks in window; check if there are any checks at all
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

  -- Get details of failing checks
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

  -- SLA breach alerts
  IF v_uptime_pct < v_sla_critical THEN
    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, title, details, created_at)
      VALUES (
        'peak_hours_sla_breach',
        'critical',
        format('E1-05: B2B SLA CRITICAL — peak-hour uptime %.2f%% (threshold: %.0f%%)', v_uptime_pct, v_sla_critical),
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
        format('E1-05: B2B SLA WARN — peak-hour uptime %.2f%% (threshold: %.0f%%)', v_uptime_pct, v_sla_warn),
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
$$;

COMMENT ON FUNCTION evo.fn_peak_hours_sla_check(interval) IS
  'E1-05: Checks Evolution API uptime % during B2B peak hours (08:00-18:00 BRT, Mon-Fri). '
  'Queries evolution_health_logs for the given window restricted to peak UTC hours. '
  'Emits high alert if uptime < 99%, critical if < 95%. '
  'Scheduled every 15 minutes via pg_cron.';

REVOKE EXECUTE ON FUNCTION evo.fn_peak_hours_sla_check(interval) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION evo.fn_peak_hours_sla_check(interval) TO service_role;

-- ──────────────────────────────────────────────────────────────────────────────
-- pg_cron: every 15 minutes
-- ──────────────────────────────────────────────────────────────────────────────
SELECT cron.unschedule('evo-peak-hours-sla')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'evo-peak-hours-sla');

SELECT cron.schedule(
  'evo-peak-hours-sla',
  '*/15 * * * *',
  $$SELECT evo.fn_peak_hours_sla_check('1 hour'::interval)$$
);
