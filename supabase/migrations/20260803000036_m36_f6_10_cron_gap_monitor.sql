-- M36: F6-10 — cron sync-instance-registry-status (96) gap detection + schedule fix
-- Branch: claude/plan-implementation-review-bq8j14
-- Date: 2026-08-03
--
-- Problem: Cron jobid 96 (`sync-instance-registry-status`) schedule `2-59/5 * * * *`
--   delivers only 256/288 expected runs per day (~11% loss). Probable cause: pg_cron
--   pool contention with other crons that cluster near minutes 0,5,10... offsets.
--
-- Fix:
--   1. Shift cron schedule from `2-59/5` to `3-59/5` (minute offset +1) to spread
--      load away from other crons in this cluster.
--   2. Create fn_monitor_sync_cron_health() that reads cron.job_run_details and
--      raises a warroom_alert when gap between consecutive executions exceeds 15 min.
--   3. Schedule the health monitor cron at `*/30 * * * *`.
--
-- Rollback:
--   -- Revert cron schedule: cron.alter_job(96, schedule => '2-59/5 * * * *')
--   DROP FUNCTION IF EXISTS zapp.fn_monitor_sync_cron_health();
--   -- Delete the new monitoring cron manually via cron.unschedule().

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — Shift schedule for sync-instance-registry-status
-- From `2-59/5` (fires at :02,:07,...:57) to `3-59/5` (fires at :03,:08,...:58)
-- This moves all executions 1 minute later, reducing collision probability with
-- other crons that were originally aligned to the :02 offset cluster.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_jobid BIGINT;
BEGIN
  -- Look up by jobid 96 first (the known id from audit); fallback to name search
  SELECT jobid INTO v_jobid
    FROM cron.job
   WHERE jobid = 96
      OR jobname IN ('sync-instance-registry-status', 'sync_instance_registry_status')
   ORDER BY jobid
   LIMIT 1;

  IF v_jobid IS NULL THEN
    RAISE NOTICE 'M36 SKIP STEP1: sync-instance-registry-status cron not found — schedule unchanged';
    RETURN;
  END IF;

  PERFORM cron.alter_job(
    job_id   => v_jobid,
    schedule => '3-59/5 * * * *'
  );

  RAISE NOTICE 'M36 STEP1: jobid % schedule updated to 3-59/5 * * * *', v_jobid;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Create gap detection + alerting function
-- Reads cron.job_run_details for jobid 96 (last 3 hours of runs),
-- finds consecutive gaps > 15 minutes, inserts into zapp.warroom_alerts.
-- Only inserts if no identical alert already raised in last 30 minutes
-- (anti-flood guard).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_monitor_sync_cron_health(
  p_jobid        BIGINT  DEFAULT 96,
  p_gap_minutes  INTEGER DEFAULT 15,
  p_lookback_hrs INTEGER DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'zapp', 'public'
AS $fn$
DECLARE
  v_run           RECORD;
  v_prev_start    TIMESTAMPTZ;
  v_gap_sec       DOUBLE PRECISION;
  v_max_gap_sec   DOUBLE PRECISION := 0;
  v_max_gap_at    TIMESTAMPTZ;
  v_alerts_raised INTEGER := 0;
  v_flooded       BOOLEAN;
  v_run_count     INTEGER := 0;
  v_jobname       TEXT;
BEGIN
  -- Resolve job name for alert message
  SELECT jobname INTO v_jobname
    FROM cron.job
   WHERE jobid = p_jobid
   LIMIT 1;

  IF v_jobname IS NULL THEN
    RAISE NOTICE 'M36 fn_monitor_sync_cron_health: jobid % not found — skipping', p_jobid;
    RETURN jsonb_build_object('skipped', TRUE, 'reason', 'job not found');
  END IF;

  -- Scan run history for gaps
  v_prev_start := NULL;

  FOR v_run IN
    SELECT start_time
      FROM cron.job_run_details
     WHERE jobid     = p_jobid
       AND start_time > now() - (p_lookback_hrs || ' hours')::INTERVAL
     ORDER BY start_time ASC
  LOOP
    v_run_count := v_run_count + 1;

    IF v_prev_start IS NOT NULL THEN
      v_gap_sec := EXTRACT(EPOCH FROM (v_run.start_time - v_prev_start));

      IF v_gap_sec > (p_gap_minutes * 60) THEN
        -- This gap exceeds threshold — track the widest one
        IF v_gap_sec > v_max_gap_sec THEN
          v_max_gap_sec := v_gap_sec;
          v_max_gap_at  := v_prev_start; -- gap started after this run
        END IF;
      END IF;
    END IF;

    v_prev_start := v_run.start_time;
  END LOOP;

  -- If a significant gap was found, raise a warroom alert (anti-flood: once per 30 min)
  IF v_max_gap_sec > 0 THEN
    -- Anti-flood: skip if same alert type raised in last 30 min
    SELECT EXISTS (
      SELECT 1 FROM zapp.warroom_alerts wa
       WHERE wa.alert_type = 'cron_execution_gap'
         AND wa.created_at > now() - INTERVAL '30 minutes'
         AND wa.details->>'jobid' = p_jobid::TEXT
    ) INTO v_flooded;

    IF NOT v_flooded THEN
      INSERT INTO zapp.warroom_alerts (
        alert_type, severity, message, details
      ) VALUES (
        'cron_execution_gap',
        CASE
          WHEN v_max_gap_sec > 1800 THEN 'critical'  -- > 30 min
          WHEN v_max_gap_sec > 900  THEN 'warning'   -- > 15 min
          ELSE 'info'
        END,
        format('Cron ''%s'' (jobid %s) had a gap of %s minutes in the last %s hours',
          v_jobname, p_jobid,
          round(v_max_gap_sec / 60)::TEXT,
          p_lookback_hrs),
        jsonb_build_object(
          'jobid',          p_jobid,
          'jobname',        v_jobname,
          'gap_minutes',    round(v_max_gap_sec / 60),
          'gap_started_at', v_max_gap_at,
          'lookback_hours', p_lookback_hrs,
          'runs_scanned',   v_run_count,
          'threshold_min',  p_gap_minutes
        )
      );

      v_alerts_raised := v_alerts_raised + 1;
      RAISE NOTICE 'M36: warroom alert raised — cron % gap of ~% min detected',
        v_jobname, round(v_max_gap_sec / 60);
    ELSE
      RAISE NOTICE 'M36: gap detected but anti-flood active — no alert raised';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'jobid',          p_jobid,
    'jobname',        v_jobname,
    'runs_scanned',   v_run_count,
    'max_gap_min',    round(v_max_gap_sec / 60),
    'alerts_raised',  v_alerts_raised,
    'checked_at',     now()
  );
END;
$fn$;

COMMENT ON FUNCTION zapp.fn_monitor_sync_cron_health(BIGINT, INTEGER, INTEGER)
  IS 'Cron health monitor (M36/F6-10): scans cron.job_run_details for execution gaps '
     'exceeding p_gap_minutes in the last p_lookback_hrs hours. Inserts into '
     'zapp.warroom_alerts with anti-flood guard (once per 30 min per job). '
     'Designed to be called by a pg_cron job every 30 minutes.';

REVOKE EXECUTE ON FUNCTION zapp.fn_monitor_sync_cron_health(BIGINT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_monitor_sync_cron_health(BIGINT, INTEGER, INTEGER) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — Schedule the health monitor cron
-- Runs every 30 minutes; idempotent (unschedule first by name if exists).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Remove existing job with the same name (idempotent)
  PERFORM cron.unschedule('sync_cron_gap_monitor')
   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync_cron_gap_monitor');

  PERFORM cron.schedule(
    'sync_cron_gap_monitor',                                  -- job name
    '*/30 * * * *',                                           -- every 30 minutes
    'SELECT zapp.fn_monitor_sync_cron_health(96, 15, 3)'     -- check jobid 96, 15min gap threshold, 3h lookback
  );

  RAISE NOTICE 'M36 STEP3: sync_cron_gap_monitor cron created (*/30 * * * *)';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'M36 STEP3 WARN: could not create sync_cron_gap_monitor cron — %', SQLERRM;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn_exists      BOOLEAN;
  v_fn_secdef      BOOLEAN;
  v_monitor_cron   TEXT;
  v_main_sched     TEXT;
  v_ok             BOOLEAN := TRUE;
  v_report         TEXT    := '';
BEGIN
  -- Function exists and is SECURITY DEFINER
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp' AND p.proname = 'fn_monitor_sync_cron_health'
  ) INTO v_fn_exists;

  IF v_fn_exists THEN
    v_report := v_report || E'\n  [OK]   F6-10: fn_monitor_sync_cron_health exists ✓';

    SELECT prosecdef INTO v_fn_secdef
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'zapp' AND p.proname = 'fn_monitor_sync_cron_health'
     LIMIT 1;

    IF v_fn_secdef IS TRUE THEN
      v_report := v_report || E'\n  [OK]   F6-10: fn_monitor_sync_cron_health is SECURITY DEFINER ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] F6-10: fn_monitor_sync_cron_health NOT SECURITY DEFINER';
      v_ok := FALSE;
    END IF;
  ELSE
    v_report := v_report || E'\n  [FAIL] F6-10: fn_monitor_sync_cron_health NOT FOUND';
    v_ok := FALSE;
  END IF;

  -- Monitor cron exists
  SELECT jobname INTO v_monitor_cron FROM cron.job WHERE jobname = 'sync_cron_gap_monitor' LIMIT 1;

  IF v_monitor_cron IS NOT NULL THEN
    v_report := v_report || E'\n  [OK]   F6-10: sync_cron_gap_monitor cron exists ✓';
  ELSE
    v_report := v_report || E'\n  [WARN] F6-10: sync_cron_gap_monitor cron not found (pg_cron may not be available in this env)';
  END IF;

  -- Main cron schedule updated
  SELECT schedule INTO v_main_sched
    FROM cron.job
   WHERE jobid = 96
      OR jobname IN ('sync-instance-registry-status', 'sync_instance_registry_status')
   ORDER BY jobid
   LIMIT 1;

  IF v_main_sched IS NOT NULL AND v_main_sched = '3-59/5 * * * *' THEN
    v_report := v_report || E'\n  [OK]   F6-10: sync-instance-registry-status schedule = 3-59/5 * * * * ✓';
  ELSIF v_main_sched IS NOT NULL THEN
    v_report := v_report || E'\n  [WARN] F6-10: sync-instance-registry-status schedule = ' || v_main_sched || ' (expected 3-59/5 * * * *)';
  ELSE
    v_report := v_report || E'\n  [WARN] F6-10: sync-instance-registry-status cron not found in this environment';
  END IF;

  RAISE NOTICE E'M36 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M36 verification FAILED — see notices above';
  END IF;
END;
$$;

COMMIT;
