-- ============================================================================
-- Burn-in Monitor: E10-02 + E10-03
-- Auditoria 2026-07-10
--
-- E10-02 — 72h burn-in: desconexão Baileys espontânea
--   evo.evolution_connection_history registra todas as transições de estado.
--   fn_burnin_disconnection_check() identifica eventos onde:
--     previous_state IN ('open','connected') → state IN ('close','disconnected')
--   Se duration_seconds > 30 em qualquer evento nas últimas 72h, classifica
--   como WARN para investigação; > 120s = FAIL (desconexão prolongada).
--
-- E10-03 — Novo alerta crítico durante período de burn-in
--   Se qualquer evolution_alert de severity='critical' for criado após
--   burn_in_start, o contador de 72h é reiniciado automaticamente.
--   fn_burnin_critical_alert_check() detecta isso e atualiza
--   evo.evolution_burnin_tracker.burn_in_start = now() quando encontra
--   alertas críticos não-reconhecidos mais recentes que o último reset.
--
-- Burn-in tracker: evo.evolution_burnin_tracker — singleton row.
--   burn_in_start: quando o período de 72h começou (ou foi reiniciado)
--   burn_in_passed: true quando now() - burn_in_start >= 72h sem resets
--
-- Scheduled: a cada 15 min durante burn-in (*/15 * * * *)
-- Idempotente: CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE + cron.unschedule.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────────
-- Burn-in tracker table (singleton row)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evo.evolution_burnin_tracker (
  id              INT          PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  burn_in_start   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  burn_in_passed  BOOLEAN      NOT NULL DEFAULT false,
  last_reset_reason TEXT,
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE evo.evolution_burnin_tracker IS
  'E10-02/E10-03: Singleton row tracking 72h burn-in start time. '
  'burn_in_start is reset to now() if any critical alert or disconnection > 30s occurs.';

INSERT INTO evo.evolution_burnin_tracker (id, burn_in_start, burn_in_passed)
VALUES (1, now(), false)
ON CONFLICT (id) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- E10-02: Disconnection check function
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION evo.fn_burnin_disconnection_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public, zapp, pg_temp
AS $$
DECLARE
  v_window_start   timestamptz;
  v_burn_passed    boolean;
  v_result         jsonb := '{}';
  v_worst_duration integer;
  v_disc_count     bigint;
  v_long_disc      bigint;
  v_reset_needed   boolean := false;
  v_status         text;
BEGIN
  SELECT burn_in_start, burn_in_passed
  INTO v_window_start, v_burn_passed
  FROM evo.evolution_burnin_tracker
  WHERE id = 1;

  IF v_burn_passed THEN
    RETURN jsonb_build_object('status', 'SKIP', 'detail', 'burn-in already passed — monitor deactivated');
  END IF;

  -- Count disconnection events in the 72h window
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE duration_seconds > 30),
    MAX(duration_seconds)
  INTO v_disc_count, v_long_disc, v_worst_duration
  FROM evo.evolution_connection_history
  WHERE created_at >= v_window_start
    AND previous_state IN ('open', 'connected', 'connecting')
    AND state IN ('close', 'disconnected', 'refused');

  IF v_disc_count = 0 THEN
    v_status := 'PASS';
  ELSIF v_long_disc = 0 THEN
    v_status := 'PASS';  -- all disconnects < 30s = auto-reconnect OK
  ELSIF v_worst_duration > 120 THEN
    v_status := 'FAIL';
    v_reset_needed := true;
  ELSE
    v_status := 'WARN';  -- 30-120s disconnections need investigation
  END IF;

  v_result := jsonb_build_object(
    'status',         v_status,
    'burn_in_start',  v_window_start,
    'elapsed_hours',  ROUND(EXTRACT(EPOCH FROM (now() - v_window_start)) / 3600, 1),
    'disconnections_total',   v_disc_count,
    'disconnections_over_30s', v_long_disc,
    'worst_duration_seconds',  COALESCE(v_worst_duration, 0)
  );

  -- Reset burn-in counter if critical disconnection found
  IF v_reset_needed THEN
    UPDATE evo.evolution_burnin_tracker
    SET burn_in_start     = now(),
        last_reset_reason = format('E10-02: disconnection %ss > 120s threshold at %s',
                                   v_worst_duration, now()),
        updated_at        = now()
    WHERE id = 1;

    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, message, metadata, created_at)
      VALUES (
        'burnin_disconnection',
        'critical',
        format('E10-02: Baileys disconnection %ss > 120s — burn-in counter reset', v_worst_duration),
        v_result,
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  -- Check if burn-in window has completed (72h elapsed without reset)
  IF now() - v_window_start >= INTERVAL '72 hours' AND NOT v_reset_needed THEN
    UPDATE evo.evolution_burnin_tracker
    SET burn_in_passed = true, updated_at = now()
    WHERE id = 1;
    v_result := v_result || jsonb_build_object('burn_in_passed', true);
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION evo.fn_burnin_disconnection_check() IS
  'E10-02: Checks evolution_connection_history for Baileys disconnections > 30s '
  'since burn_in_start. Resets 72h counter and raises critical alert if any '
  'disconnection exceeds 120s. Marks burn_in_passed=true when 72h complete.';

-- ──────────────────────────────────────────────────────────────────────────────
-- E10-03: Critical alert during burn-in check
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION evo.fn_burnin_critical_alert_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public, zapp, pg_temp
AS $$
DECLARE
  v_window_start   timestamptz;
  v_burn_passed    boolean;
  v_crit_count     bigint;
  v_result         jsonb := '{}';
BEGIN
  SELECT burn_in_start, burn_in_passed
  INTO v_window_start, v_burn_passed
  FROM evo.evolution_burnin_tracker
  WHERE id = 1;

  IF v_burn_passed THEN
    RETURN jsonb_build_object('status', 'SKIP', 'detail', 'burn-in already passed');
  END IF;

  -- Count new unacknowledged critical alerts since burn-in started
  SELECT COUNT(*) INTO v_crit_count
  FROM evo.evolution_alerts
  WHERE severity = 'critical'
    AND created_at >= v_window_start
    AND (acknowledged IS NULL OR acknowledged = false)
    AND (resolved IS NULL OR resolved = false);

  v_result := jsonb_build_object(
    'status',          CASE WHEN v_crit_count > 0 THEN 'FAIL' ELSE 'PASS' END,
    'burn_in_start',   v_window_start,
    'elapsed_hours',   ROUND(EXTRACT(EPOCH FROM (now() - v_window_start)) / 3600, 1),
    'critical_alerts_since_start', v_crit_count
  );

  IF v_crit_count > 0 THEN
    -- Reset burn-in counter (E10-03: new critical → restart 72h clock)
    UPDATE evo.evolution_burnin_tracker
    SET burn_in_start     = now(),
        last_reset_reason = format('E10-03: %s new critical alert(s) found at %s — 72h counter reset',
                                   v_crit_count, now()),
        updated_at        = now()
    WHERE id = 1;

    BEGIN
      INSERT INTO zapp.webhook_health_alerts
        (alert_type, severity, message, metadata, created_at)
      VALUES (
        'burnin_critical_alert',
        'critical',
        format('E10-03: %s new critical alert(s) during burn-in — 72h counter reset. Investigate before go-live.', v_crit_count),
        v_result,
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION evo.fn_burnin_critical_alert_check() IS
  'E10-03: Detects new unacknowledged critical evolution_alerts since burn_in_start. '
  'If any found, resets the 72h burn-in counter (burn_in_start = now()) and '
  'raises a zapp.webhook_health_alerts alert. Fixes from go-live must restart '
  'the burn-in clock.';

-- ──────────────────────────────────────────────────────────────────────────────
-- Combined burn-in runner (calls both checks in one job)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION evo.fn_burnin_monitor()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = evo, public, pg_temp
AS $$
DECLARE
  v_disc   jsonb;
  v_alert  jsonb;
BEGIN
  v_disc  := evo.fn_burnin_disconnection_check();
  v_alert := evo.fn_burnin_critical_alert_check();

  RETURN jsonb_build_object(
    'checked_at',          now(),
    'disconnection_check', v_disc,
    'critical_alert_check', v_alert
  );
END;
$$;

COMMENT ON FUNCTION evo.fn_burnin_monitor() IS
  'E10-02/E10-03: Unified burn-in monitor — runs disconnection and critical-alert '
  'checks in a single call. Scheduled every 15 min during burn-in period.';

-- ──────────────────────────────────────────────────────────────────────────────
-- pg_cron: every 15 minutes (runs until burn_in_passed = true, then is a no-op)
-- ──────────────────────────────────────────────────────────────────────────────
SELECT cron.unschedule('burnin-monitor')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'burnin-monitor');

SELECT cron.schedule(
  'burnin-monitor',
  '*/15 * * * *',
  'SELECT evo.fn_burnin_monitor()'
);
