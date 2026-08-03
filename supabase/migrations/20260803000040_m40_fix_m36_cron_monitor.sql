-- M40: Fix M36 — fn_monitor_sync_cron_health (6 bugs)
-- Branch: claude/plan-implementation-review-bq8j14
-- Date: 2026-08-03
--
-- Problem (cubic/P review of M36):
--
--   P0 (M36:126): alert_type = 'cron_execution_gap' is NOT a valid warroom_alert_type
--       enum value. Valid values: info, warning, critical, sla_breach.
--       Result: INSERT raises check-constraint violation and the alert is silently
--       swallowed (no alert ever persists to warroom_alerts).
--
--   P0 (M36:132-154): Wrong columns in warroom_alerts INSERT:
--       - 'details' JSONB column does NOT exist on warroom_alerts.
--       - 'title' (NOT NULL) is missing from the INSERT column list.
--       - 'source' and 'entity' (used for anti-flood targeting) are absent.
--       Result: migration aborts with "column does not exist" and everything
--       after the CREATE OR REPLACE is rolled back.
--
--   P0 (M36:124-129): Anti-flood queries non-existent columns:
--       - wa.alert_type = 'cron_execution_gap' (invalid enum — see P0 above)
--       - wa.details->>'jobid' — 'details' column does not exist
--       Result: EXISTS sub-query errors out; anti-flood guard always errors rather
--       than protecting, so even if the INSERT were fixed it would crash first.
--
--   P1 (M36:85): fn_monitor_sync_cron_health reads FROM cron.job without a
--       pg_cron exception guard. On environments without pg_cron (staging, CI,
--       fresh installs) the function itself errors on EVERY call, making it
--       completely unusable in those envs.
--
--   P1 (M36:99-103): The FOR loop reads FROM cron.job_run_details — also without
--       a pg_cron guard. Same failure mode.
--
--   P1 (M36:122): No trailing-gap check after the FOR loop. If the job has
--       simply stopped running (current outage), v_prev_start is the last
--       successful run and (now() - v_prev_start) may be enormous. The function
--       only caught historical gaps between consecutive pairs, not the open
--       trailing gap from the last run to the present moment.
--
--   P1 (M36:197): Hardcoded '96' in the cron schedule command string. If the
--       job was re-created on a different environment with a new jobid, the
--       monitor silently monitors the wrong job.
--
--   Bug (M36 STEP 1, lines 29-53): cron.job access without pg_cron guard.
--       Migration fails on envs without pg_cron before even reaching STEP 2.
--
--   Bug (M36 STEP 3, lines 188-204): EXCEPTION WHEN OTHERS catch-all (too broad)
--       masks real errors; cron.unschedule() inside a WHERE EXISTS on cron.job
--       (no guard). STEP 3 also hardcodes 96 in the cron command.
--
--   Bug (M36 Verification, lines 246, 255-260): cron.job queries without guards;
--       missing pg_cron causes migration rollback during verification.
--
--   P2 (M36:70): search_path includes 'public' in a SECURITY DEFINER function.
--       Rule: SECURITY DEFINER must use only 'pg_catalog', 'zapp'.
--
-- Fix (CREATE OR REPLACE — no git history rewrite):
--   1. SET search_path TO 'pg_catalog', 'zapp' (drop 'public').
--   2. Wrap the cron.job name lookup in a pg_cron exception guard.
--   3. Wrap the cron.job_run_details FOR loop in a pg_cron exception guard.
--   4. Add trailing-gap check: after the FOR loop, compare (now() - v_prev_start)
--      to the gap threshold and raise an alert if the job has gone silent.
--   5. Handle zero-run case with a NOTICE + early return (job may be new/paused).
--   6. Fix anti-flood: wa.source = 'cron_monitor' AND wa.entity = coalesce(v_jobname, p_jobid::TEXT).
--   7. Fix INSERT: (alert_type, title, message, source, entity, severity) — NO details.
--   8. Fix alert_type values: 'critical' (> 30 min gap) or 'warning' (≤ 30 min, > threshold).
--   9. STEP 1 re-run: wrap cron.job access in pg_cron exception guard.
--  10. STEP 3 re-run: pg_cron guard; dynamic jobid lookup for cron command; idempotent
--      alter-or-schedule pattern; EXCEPTION WHEN undefined_table only (no catch-all).
--  11. Verification: pg_cron guards on all cron.* queries; missing pg_cron → WARN (non-fatal).
--
-- Rollback:
--   Run the original M36 STEP 2 CREATE OR REPLACE to restore the buggy version.
--   (Not recommended — all 6 bugs re-appear.)

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — Shift schedule for sync-instance-registry-status (with pg_cron guard)
-- Idempotent: safe to re-run if M36 already ran the schedule shift.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_jobid BIGINT;
BEGIN
  BEGIN
    SELECT jobid INTO v_jobid
      FROM cron.job
     WHERE jobid = 96
        OR jobname IN ('sync-instance-registry-status', 'sync_instance_registry_status')
     ORDER BY jobid
     LIMIT 1;
  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    RAISE NOTICE 'M40 STEP 1: pg_cron not available — skipping schedule shift';
    RETURN;
  END;

  IF v_jobid IS NULL THEN
    RAISE NOTICE 'M40 STEP 1: sync-instance-registry-status cron not found — schedule unchanged';
    RETURN;
  END IF;

  PERFORM cron.alter_job(
    job_id   => v_jobid,
    schedule => '3-59/5 * * * *'
  );

  RAISE NOTICE 'M40 STEP 1: jobid % schedule updated to 3-59/5 * * * * ✓', v_jobid;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Replace fn_monitor_sync_cron_health with corrected version
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_monitor_sync_cron_health(
  p_jobid        BIGINT  DEFAULT 96,
  p_gap_minutes  INTEGER DEFAULT 15,
  p_lookback_hrs INTEGER DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'zapp'
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
  v_alert_type    TEXT;
  v_trailing_gap  DOUBLE PRECISION;
BEGIN
  -- Resolve job name for alert messages.
  -- pg_cron guard: if cron.job is unavailable, return early (fail-safe for non-prod envs).
  BEGIN
    SELECT jobname INTO v_jobname
      FROM cron.job
     WHERE jobid = p_jobid
     LIMIT 1;
  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    RAISE NOTICE 'fn_monitor_sync_cron_health: pg_cron not available — returning early';
    RETURN jsonb_build_object('skipped', TRUE, 'reason', 'pg_cron not available');
  END;

  IF v_jobname IS NULL THEN
    RAISE NOTICE 'fn_monitor_sync_cron_health: jobid % not found in cron.job — skipping', p_jobid;
    RETURN jsonb_build_object('skipped', TRUE, 'reason', 'job not found',
                              'jobid', p_jobid);
  END IF;

  -- Scan run history for consecutive gaps.
  -- pg_cron guard: cron.job_run_details may also be absent on some envs.
  v_prev_start := NULL;

  BEGIN
    FOR v_run IN
      SELECT start_time
        FROM cron.job_run_details
       WHERE jobid      = p_jobid
         AND start_time > now() - (p_lookback_hrs || ' hours')::INTERVAL
       ORDER BY start_time ASC
    LOOP
      v_run_count := v_run_count + 1;

      IF v_prev_start IS NOT NULL THEN
        v_gap_sec := EXTRACT(EPOCH FROM (v_run.start_time - v_prev_start));

        IF v_gap_sec > (p_gap_minutes * 60) AND v_gap_sec > v_max_gap_sec THEN
          v_max_gap_sec := v_gap_sec;
          v_max_gap_at  := v_prev_start;
        END IF;
      END IF;

      v_prev_start := v_run.start_time;
    END LOOP;
  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    RAISE NOTICE 'fn_monitor_sync_cron_health: cron.job_run_details unavailable — skipping gap scan';
    RETURN jsonb_build_object('skipped', TRUE, 'reason', 'cron.job_run_details not available');
  END;

  -- Zero-run case: job may be newly created or paused — log notice, no alert.
  IF v_run_count = 0 THEN
    RAISE NOTICE 'fn_monitor_sync_cron_health: no runs for jobid % in last % hours — job may be new or paused',
      p_jobid, p_lookback_hrs;
    RETURN jsonb_build_object(
      'jobid',         p_jobid,
      'jobname',       v_jobname,
      'runs_scanned',  0,
      'max_gap_min',   0,
      'alerts_raised', 0,
      'checked_at',    now()
    );
  END IF;

  -- Trailing-gap check: if the job has gone silent since its last run, the open
  -- gap from v_prev_start → now() may be the largest and most actionable one.
  IF v_prev_start IS NOT NULL THEN
    v_trailing_gap := EXTRACT(EPOCH FROM (now() - v_prev_start));
    IF v_trailing_gap > (p_gap_minutes * 60) AND v_trailing_gap > v_max_gap_sec THEN
      v_max_gap_sec := v_trailing_gap;
      v_max_gap_at  := v_prev_start;
    END IF;
  END IF;

  -- Raise a warroom alert if any significant gap was found.
  IF v_max_gap_sec > (p_gap_minutes * 60) THEN
    -- Anti-flood: skip if a cron_monitor alert for this entity was raised in the last 30 min.
    -- Use source + entity (not alert_type + details) — warroom_alerts has no 'details' column.
    SELECT EXISTS (
      SELECT 1 FROM zapp.warroom_alerts wa
       WHERE wa.source     = 'cron_monitor'
         AND wa.entity     = coalesce(v_jobname, p_jobid::TEXT)
         AND wa.created_at > now() - INTERVAL '30 minutes'
    ) INTO v_flooded;

    IF NOT v_flooded THEN
      -- alert_type enum values: info, warning, critical, sla_breach
      v_alert_type := CASE
        WHEN v_max_gap_sec > 1800 THEN 'critical'  -- > 30 min
        ELSE                           'warning'   -- > p_gap_minutes min
      END;

      INSERT INTO zapp.warroom_alerts (
        alert_type, title, message, source, entity, severity
      ) VALUES (
        v_alert_type,
        format('Cron gap: %s', v_jobname),
        format(
          'Cron ''%s'' (jobid %s) had a gap of %s minutes in the last %s hours',
          v_jobname, p_jobid,
          round(v_max_gap_sec / 60)::TEXT,
          p_lookback_hrs
        ),
        'cron_monitor',
        coalesce(v_jobname, p_jobid::TEXT),
        v_alert_type
      );

      v_alerts_raised := v_alerts_raised + 1;
      RAISE NOTICE 'fn_monitor_sync_cron_health: warroom alert raised — cron % gap ~% min (%)',
        v_jobname, round(v_max_gap_sec / 60), v_alert_type;
    ELSE
      RAISE NOTICE 'fn_monitor_sync_cron_health: gap detected but anti-flood active — no alert raised';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'jobid',         p_jobid,
    'jobname',       v_jobname,
    'runs_scanned',  v_run_count,
    'max_gap_min',   round(v_max_gap_sec / 60),
    'alerts_raised', v_alerts_raised,
    'checked_at',    now()
  );
END;
$fn$;

COMMENT ON FUNCTION zapp.fn_monitor_sync_cron_health(BIGINT, INTEGER, INTEGER)
  IS 'Cron health monitor (M36/M40 fix/F6-10): scans cron.job_run_details for consecutive '
     'execution gaps and trailing outages exceeding p_gap_minutes in the last p_lookback_hrs '
     'hours. Inserts into zapp.warroom_alerts (alert_type: warning/critical; source: '
     'cron_monitor; entity: jobname) with a 30-minute anti-flood guard. '
     'pg_cron guards: returns early if cron.job or cron.job_run_details are unavailable. '
     'SECURITY DEFINER search_path = pg_catalog, zapp.';

REVOKE EXECUTE ON FUNCTION zapp.fn_monitor_sync_cron_health(BIGINT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_monitor_sync_cron_health(BIGINT, INTEGER, INTEGER) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — Schedule the health monitor cron (with pg_cron guard + dynamic jobid)
-- Idempotent: alter existing job if present, otherwise schedule.
-- Dynamic: resolves the monitored jobid at runtime instead of hardcoding 96.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_main_jobid    BIGINT;
  v_monitor_jobid BIGINT;
  v_cmd           TEXT;
BEGIN
  BEGIN
    -- Resolve the main cron job ID to pass to the monitor function.
    -- Falls back to 96 (the known production jobid) if not found.
    SELECT jobid INTO v_main_jobid
      FROM cron.job
     WHERE jobid = 96
        OR jobname IN ('sync-instance-registry-status', 'sync_instance_registry_status')
     ORDER BY jobid
     LIMIT 1;

    v_cmd := format(
      'SELECT zapp.fn_monitor_sync_cron_health(%s, 15, 3)',
      coalesce(v_main_jobid::TEXT, '96')
    );

    -- Idempotent: update existing monitor cron or create new one.
    SELECT jobid INTO v_monitor_jobid
      FROM cron.job
     WHERE jobname = 'sync_cron_gap_monitor';

    IF v_monitor_jobid IS NOT NULL THEN
      PERFORM cron.alter_job(
        job_id   => v_monitor_jobid,
        command  => v_cmd,
        schedule => '*/30 * * * *'
      );
      RAISE NOTICE 'M40 STEP 3: sync_cron_gap_monitor (jobid %) updated → targeting jobid %',
        v_monitor_jobid, coalesce(v_main_jobid::TEXT, '96 (fallback)');
    ELSE
      PERFORM cron.schedule(
        'sync_cron_gap_monitor',
        '*/30 * * * *',
        v_cmd
      );
      RAISE NOTICE 'M40 STEP 3: sync_cron_gap_monitor created → targeting jobid % ✓',
        coalesce(v_main_jobid::TEXT, '96 (fallback)');
    END IF;

  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    RAISE NOTICE 'M40 STEP 3: pg_cron not available — skipping monitor cron creation';
  END;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn_secdef      BOOLEAN;
  v_fn_body        TEXT;
  v_monitor_cron   TEXT;
  v_main_sched     TEXT;
  v_ok             BOOLEAN := TRUE;
  v_report         TEXT    := '';
BEGIN
  -- Function exists and is SECURITY DEFINER
  SELECT p.prosecdef, pg_catalog.pg_get_functiondef(p.oid)
    INTO v_fn_secdef, v_fn_body
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp'
     AND p.proname = 'fn_monitor_sync_cron_health'
   LIMIT 1;

  IF v_fn_body IS NULL THEN
    v_report := v_report || E'\n  [FAIL] F6-10: fn_monitor_sync_cron_health NOT FOUND';
    v_ok := FALSE;
  ELSE
    v_report := v_report || E'\n  [OK]   F6-10: fn_monitor_sync_cron_health exists ✓';

    IF v_fn_secdef IS TRUE THEN
      v_report := v_report || E'\n  [OK]   M40: SECURITY DEFINER ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M40: NOT SECURITY DEFINER';
      v_ok := FALSE;
    END IF;

    -- search_path must NOT contain 'public'
    IF v_fn_body ~* 'set search_path.*\bpublic\b' THEN
      v_report := v_report || E'\n  [FAIL] M40/P2: search_path still contains public';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   M40/P2: search_path free of public ✓';
    END IF;

    -- Must not reference invalid alert_type 'cron_execution_gap'
    IF v_fn_body ~* 'cron_execution_gap' THEN
      v_report := v_report || E'\n  [FAIL] M40/P0: function body still references cron_execution_gap (invalid enum)';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   M40/P0: no cron_execution_gap in body ✓';
    END IF;

    -- Anti-flood must use source='cron_monitor' (not details->>'jobid')
    IF v_fn_body ~* '''cron_monitor''' THEN
      v_report := v_report || E'\n  [OK]   M40/P0: anti-flood uses source=cron_monitor ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M40/P0: anti-flood does not use source=cron_monitor';
      v_ok := FALSE;
    END IF;

    -- Trailing-gap check must be present (v_trailing_gap variable name)
    IF v_fn_body ~* 'v_trailing_gap' THEN
      v_report := v_report || E'\n  [OK]   M40/P1: trailing-gap check (v_trailing_gap) present ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M40/P1: trailing-gap check missing';
      v_ok := FALSE;
    END IF;

    -- INSERT must include 'title' column (it is NOT NULL on warroom_alerts)
    IF v_fn_body ~* 'insert into.*warroom_alerts' AND v_fn_body ~* '\btitle\b' THEN
      v_report := v_report || E'\n  [OK]   M40/P0: warroom_alerts INSERT includes title ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M40/P0: warroom_alerts INSERT missing title column';
      v_ok := FALSE;
    END IF;

    -- Must NOT reference non-existent 'details' column
    IF v_fn_body ~* 'warroom_alerts.*\bdetails\b' OR v_fn_body ~* '\bdetails\b.*warroom_alerts' THEN
      v_report := v_report || E'\n  [FAIL] M40/P0: function body references non-existent warroom_alerts.details column';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   M40/P0: no warroom_alerts.details reference ✓';
    END IF;
  END IF;

  -- Cron checks (non-fatal if pg_cron absent)
  BEGIN
    SELECT jobname INTO v_monitor_cron
      FROM cron.job
     WHERE jobname = 'sync_cron_gap_monitor'
     LIMIT 1;

    IF v_monitor_cron IS NOT NULL THEN
      v_report := v_report || E'\n  [OK]   M40: sync_cron_gap_monitor cron exists ✓';
    ELSE
      v_report := v_report || E'\n  [WARN] M40: sync_cron_gap_monitor not found (non-fatal — pg_cron may not be available)';
    END IF;

    SELECT schedule INTO v_main_sched
      FROM cron.job
     WHERE jobid = 96
        OR jobname IN ('sync-instance-registry-status', 'sync_instance_registry_status')
     ORDER BY jobid
     LIMIT 1;

    IF v_main_sched IS NOT NULL AND v_main_sched = '3-59/5 * * * *' THEN
      v_report := v_report || E'\n  [OK]   M40: sync-instance-registry-status schedule = 3-59/5 * * * * ✓';
    ELSIF v_main_sched IS NOT NULL THEN
      v_report := v_report || E'\n  [WARN] M40: sync-instance-registry-status schedule = ' || v_main_sched
        || ' (expected 3-59/5 * * * * — may need manual update)';
    ELSE
      v_report := v_report || E'\n  [WARN] M40: sync-instance-registry-status not found (non-fatal)';
    END IF;

  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    v_report := v_report || E'\n  [WARN] M40: pg_cron not available in this env — cron verification skipped (non-fatal)';
  END;

  RAISE NOTICE E'M40 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M40 verification FAILED — see notices above';
  END IF;
END;
$$;

COMMIT;
