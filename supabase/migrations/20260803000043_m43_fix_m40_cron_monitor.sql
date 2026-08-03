-- M43: Fix M40 — fn_monitor_sync_cron_health (5 bugs)
-- Branch: claude/plan-implementation-review-bq8j14
-- Date: 2026-08-03
--
-- Problem (cubic P0/P1/P2/P3 review of M40):
--
--   P0 (M40:228): INSERT into zapp.warroom_alerts includes 'severity' column
--       which does NOT exist on warroom_alerts (columns: alert_type, title,
--       message, source, entity — no severity). Every alert insertion fails with
--       "column 'severity' of relation 'warroom_alerts' does not exist", meaning
--       no cron gap alerts are ever persisted.
--
--   P0 (M40:395): Verification block uses v_fn_body ~* '\btitle\b'.
--       PostgreSQL's ARE engine treats \b as a backspace character (0x08), NOT
--       as a word-boundary anchor (that would be \y or \m/\M in PostgreSQL).
--       The pattern never matches any realistic function body, so the verification
--       always falls into the ELSE branch and raises RAISE EXCEPTION
--       'M40 verification FAILED'. Migration self-destructs on every run.
--       Fix: position('title' IN v_fn_body) > 0 (no word-boundary issue).
--
--   P1 (M40:186-197): Zero-run case is handled as "job may be new or paused"
--       and returns early with 0 alerts. But a continuous outage longer than
--       p_lookback_hrs would also show zero runs in the lookback window.
--       A system that has been down for >3 hours gets no alert — exactly the
--       opposite of the intended behaviour.
--       Fix: peek at the most recent run ever (outside the lookback window).
--       If a run exists outside the window, the system WAS running — a full
--       lookback-window outage is confirmed; raise critical alert immediately.
--       Only skip alert when there is genuinely no prior run at all.
--
--   P2 (M40:88-91): STEP 1 cron resolution uses ORDER BY jobid, meaning the
--       old numeric ID 96 wins if it co-exists with a newer row by name
--       ('sync-instance-registry-status'). The name row is always the canonical
--       one; jobid=96 is a hardcoded legacy fallback. Name should take priority.
--       Fix: ORDER BY CASE WHEN jobname IN (...) THEN 0 ELSE 1 END, jobid.
--
--   P3 (M40:129,174,205): v_max_gap_at is declared and assigned twice but
--       never referenced in any subsequent expression (removed from INSERT
--       when 'details' column was dropped). Dead variable — remove.
--
-- Fix (CREATE OR REPLACE — no git history rewrite):
--   1. Remove 'severity' from warroom_alerts INSERT column list and VALUES.
--   2. Replace \btitle\b with position('title' IN ...) in verification block.
--   3. Zero-run: peek at one run older than lookback window; if found, treat
--      as full-window outage and raise critical immediately.
--   4. Cron ID resolution: ORDER BY name-match priority, then jobid.
--   5. Drop v_max_gap_at declaration and assignments.
--
-- Also fixes M40's own verification block (runs inline, not inside the
-- new function) so the migration itself does not self-destruct.
--
-- Rollback:
--   Run the M40 STEP 2 CREATE OR REPLACE to restore the M40 version.
--   (Not recommended — P0 severity bug re-appears.)

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — Fix cron job ID resolution priority (name > numeric ID)
-- Same as M40 STEP 1 but with ORDER BY name priority to avoid jobid=96 winning.
-- Idempotent: safe to re-run.
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
     ORDER BY
       CASE WHEN jobname IN ('sync-instance-registry-status', 'sync_instance_registry_status')
            THEN 0 ELSE 1 END,
       jobid
     LIMIT 1;
  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    RAISE NOTICE 'M43 STEP 1: pg_cron not available — skipping schedule shift';
    RETURN;
  END;

  IF v_jobid IS NULL THEN
    RAISE NOTICE 'M43 STEP 1: sync-instance-registry-status cron not found — skipping';
    RETURN;
  END IF;

  PERFORM cron.alter_job(
    job_id   => v_jobid,
    schedule => '3-59/5 * * * *'
  );

  RAISE NOTICE 'M43 STEP 1: jobid % schedule confirmed 3-59/5 * * * * ✓', v_jobid;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Replace fn_monitor_sync_cron_health (all 5 bugs fixed)
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
  v_alerts_raised INTEGER := 0;
  v_flooded       BOOLEAN;
  v_run_count     INTEGER := 0;
  v_jobname       TEXT;
  v_alert_type    TEXT;
  v_trailing_gap  DOUBLE PRECISION;
  v_last_ever     TIMESTAMPTZ;
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

  -- Scan run history for consecutive gaps within the lookback window.
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
        END IF;
      END IF;

      v_prev_start := v_run.start_time;
    END LOOP;
  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    RAISE NOTICE 'fn_monitor_sync_cron_health: cron.job_run_details unavailable — skipping gap scan';
    RETURN jsonb_build_object('skipped', TRUE, 'reason', 'cron.job_run_details not available');
  END;

  -- Zero-run case (P1 fix): distinguish "job genuinely has no history" from
  -- "continuous outage that started before the lookback window".
  -- Peek at the most recent run outside the lookback window.
  -- If one exists, the job WAS running — a full-window silence is an outage.
  IF v_run_count = 0 THEN
    BEGIN
      SELECT max(start_time) INTO v_last_ever
        FROM cron.job_run_details
       WHERE jobid      = p_jobid
         AND start_time <= now() - (p_lookback_hrs || ' hours')::INTERVAL;
    EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
      v_last_ever := NULL;
    END;

    IF v_last_ever IS NULL THEN
      -- Truly no runs ever — job is new or never started. No alert.
      RAISE NOTICE 'fn_monitor_sync_cron_health: no runs at all for jobid % — job appears new or paused',
        p_jobid;
      RETURN jsonb_build_object(
        'jobid',         p_jobid,
        'jobname',       v_jobname,
        'runs_scanned',  0,
        'max_gap_min',   0,
        'alerts_raised', 0,
        'checked_at',    now()
      );
    ELSE
      -- Job was running before the lookback window; full window is a confirmed outage.
      -- Treat the silence as a gap of exactly p_lookback_hrs hours.
      v_max_gap_sec := p_lookback_hrs * 3600.0;
      v_prev_start  := v_last_ever;
      RAISE NOTICE 'fn_monitor_sync_cron_health: zero runs in lookback window but last run at %; treating as % h outage',
        v_last_ever, p_lookback_hrs;
    END IF;
  END IF;

  -- Trailing-gap check: if the job has gone silent since its last run, the open
  -- gap from v_prev_start → now() may be the largest and most actionable one.
  IF v_prev_start IS NOT NULL THEN
    v_trailing_gap := EXTRACT(EPOCH FROM (now() - v_prev_start));
    IF v_trailing_gap > (p_gap_minutes * 60) AND v_trailing_gap > v_max_gap_sec THEN
      v_max_gap_sec := v_trailing_gap;
    END IF;
  END IF;

  -- Raise a warroom alert if any significant gap was found.
  IF v_max_gap_sec > (p_gap_minutes * 60) THEN
    -- Anti-flood: skip if a cron_monitor alert for this entity was raised in the last 30 min.
    SELECT EXISTS (
      SELECT 1 FROM zapp.warroom_alerts wa
       WHERE wa.source     = 'cron_monitor'
         AND wa.entity     = coalesce(v_jobname, p_jobid::TEXT)
         AND wa.created_at > now() - INTERVAL '30 minutes'
    ) INTO v_flooded;

    IF NOT v_flooded THEN
      -- alert_type enum values: info, warning, critical, sla_breach
      -- P0 fix: warroom_alerts has NO 'severity' column — removed from INSERT
      v_alert_type := CASE
        WHEN v_max_gap_sec > 1800 THEN 'critical'   -- > 30 min
        ELSE                           'warning'    -- > p_gap_minutes min
      END;

      INSERT INTO zapp.warroom_alerts (
        alert_type, title, message, source, entity
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
        coalesce(v_jobname, p_jobid::TEXT)
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
  IS 'Cron health monitor (M36/M40/M43 fix/F6-10): scans cron.job_run_details for consecutive '
     'execution gaps and trailing outages exceeding p_gap_minutes in the last p_lookback_hrs '
     'hours. Zero-run-in-window with prior history → treated as confirmed outage (P1 fix). '
     'Inserts into zapp.warroom_alerts (alert_type: warning/critical; source: cron_monitor; '
     'entity: jobname) with 30-minute anti-flood guard. No severity column (P0 fix). '
     'pg_cron guards: returns early if cron.job or cron.job_run_details unavailable. '
     'SECURITY DEFINER search_path = pg_catalog, zapp.';

REVOKE EXECUTE ON FUNCTION zapp.fn_monitor_sync_cron_health(BIGINT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_monitor_sync_cron_health(BIGINT, INTEGER, INTEGER) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — Re-schedule the health monitor cron (dynamic jobid, name priority)
-- Idempotent: alter existing job if present, otherwise schedule.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_main_jobid    BIGINT;
  v_monitor_jobid BIGINT;
  v_cmd           TEXT;
BEGIN
  BEGIN
    SELECT jobid INTO v_main_jobid
      FROM cron.job
     WHERE jobid = 96
        OR jobname IN ('sync-instance-registry-status', 'sync_instance_registry_status')
     ORDER BY
       CASE WHEN jobname IN ('sync-instance-registry-status', 'sync_instance_registry_status')
            THEN 0 ELSE 1 END,
       jobid
     LIMIT 1;

    v_cmd := format(
      'SELECT zapp.fn_monitor_sync_cron_health(%s, 15, 3)',
      coalesce(v_main_jobid::TEXT, '96')
    );

    SELECT jobid INTO v_monitor_jobid
      FROM cron.job
     WHERE jobname = 'sync_cron_gap_monitor';

    IF v_monitor_jobid IS NOT NULL THEN
      PERFORM cron.alter_job(
        job_id   => v_monitor_jobid,
        command  => v_cmd,
        schedule => '*/30 * * * *'
      );
      RAISE NOTICE 'M43 STEP 3: sync_cron_gap_monitor (jobid %) updated → targeting jobid %',
        v_monitor_jobid, coalesce(v_main_jobid::TEXT, '96 (fallback)');
    ELSE
      PERFORM cron.schedule(
        'sync_cron_gap_monitor',
        '*/30 * * * *',
        v_cmd
      );
      RAISE NOTICE 'M43 STEP 3: sync_cron_gap_monitor created → targeting jobid % ✓',
        coalesce(v_main_jobid::TEXT, '96 (fallback)');
    END IF;

  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    RAISE NOTICE 'M43 STEP 3: pg_cron not available — skipping monitor cron creation';
  END;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- P0 fix: use position() instead of \btitle\b (PostgreSQL treats \b as backspace)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn_secdef    BOOLEAN;
  v_fn_body      TEXT;
  v_monitor_cron TEXT;
  v_main_sched   TEXT;
  v_ok           BOOLEAN := TRUE;
  v_report       TEXT    := '';
BEGIN
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
      v_report := v_report || E'\n  [OK]   M43: SECURITY DEFINER ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M43: NOT SECURITY DEFINER';
      v_ok := FALSE;
    END IF;

    -- P2: search_path must NOT contain 'public'
    IF position('public' IN lower(v_fn_body)) > 0
       AND v_fn_body ~* 'set search_path.*(''|\s)public(''|\s)' THEN
      v_report := v_report || E'\n  [FAIL] M43/P2: search_path still contains public';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   M43/P2: search_path free of public ✓';
    END IF;

    -- P0: must not reference invalid enum 'cron_execution_gap'
    IF v_fn_body ~* 'cron_execution_gap' THEN
      v_report := v_report || E'\n  [FAIL] M43/P0: function body references cron_execution_gap (invalid enum)';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   M43/P0: no cron_execution_gap in body ✓';
    END IF;

    -- P0: must not reference non-existent 'severity' column on warroom_alerts
    IF v_fn_body ~* 'insert into.*warroom_alerts' AND v_fn_body ~* ',\s*severity' THEN
      v_report := v_report || E'\n  [FAIL] M43/P0: warroom_alerts INSERT still includes severity column (does not exist)';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   M43/P0: no severity in warroom_alerts INSERT ✓';
    END IF;

    -- P0: INSERT must include 'title' column (NOT NULL on warroom_alerts)
    -- Use position() — PostgreSQL \b is backspace (0x08), not a word boundary
    IF v_fn_body ~* 'insert into.*warroom_alerts'
       AND position('title' IN lower(v_fn_body)) > 0 THEN
      v_report := v_report || E'\n  [OK]   M43/P0: warroom_alerts INSERT includes title ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M43/P0: warroom_alerts INSERT missing title column';
      v_ok := FALSE;
    END IF;

    -- P0: anti-flood must use source='cron_monitor'
    IF v_fn_body ~* '''cron_monitor''' THEN
      v_report := v_report || E'\n  [OK]   M43/P0: anti-flood uses source=cron_monitor ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M43/P0: anti-flood does not use source=cron_monitor';
      v_ok := FALSE;
    END IF;

    -- P1: trailing-gap check must be present
    IF v_fn_body ~* 'v_trailing_gap' THEN
      v_report := v_report || E'\n  [OK]   M43/P1: trailing-gap check (v_trailing_gap) present ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M43/P1: trailing-gap check missing';
      v_ok := FALSE;
    END IF;

    -- P1: zero-run outage detection (v_last_ever)
    IF v_fn_body ~* 'v_last_ever' THEN
      v_report := v_report || E'\n  [OK]   M43/P1: zero-run outage detection (v_last_ever) present ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M43/P1: zero-run outage detection missing';
      v_ok := FALSE;
    END IF;

    -- P3: dead variable v_max_gap_at must NOT appear (removed)
    IF v_fn_body ~* 'v_max_gap_at' THEN
      v_report := v_report || E'\n  [FAIL] M43/P3: dead variable v_max_gap_at still present in function body';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   M43/P3: dead variable v_max_gap_at removed ✓';
    END IF;
  END IF;

  -- Cron checks (non-fatal if pg_cron absent)
  BEGIN
    SELECT jobname INTO v_monitor_cron
      FROM cron.job
     WHERE jobname = 'sync_cron_gap_monitor'
     LIMIT 1;

    IF v_monitor_cron IS NOT NULL THEN
      v_report := v_report || E'\n  [OK]   M43: sync_cron_gap_monitor cron exists ✓';
    ELSE
      v_report := v_report || E'\n  [WARN] M43: sync_cron_gap_monitor not found (non-fatal)';
    END IF;

    SELECT schedule INTO v_main_sched
      FROM cron.job
     WHERE jobid = 96
        OR jobname IN ('sync-instance-registry-status', 'sync_instance_registry_status')
     ORDER BY
       CASE WHEN jobname IN ('sync-instance-registry-status', 'sync_instance_registry_status')
            THEN 0 ELSE 1 END,
       jobid
     LIMIT 1;

    IF v_main_sched IS NOT NULL AND v_main_sched = '3-59/5 * * * *' THEN
      v_report := v_report || E'\n  [OK]   M43: sync-instance-registry-status schedule = 3-59/5 * * * * ✓';
    ELSIF v_main_sched IS NOT NULL THEN
      v_report := v_report || E'\n  [WARN] M43: sync-instance-registry-status schedule = ' || v_main_sched;
    ELSE
      v_report := v_report || E'\n  [WARN] M43: sync-instance-registry-status not found (non-fatal)';
    END IF;

  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    v_report := v_report || E'\n  [WARN] M43: pg_cron not available in this env — cron verification skipped (non-fatal)';
  END;

  RAISE NOTICE E'M43 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M43 verification FAILED — see notices above';
  END IF;
END;
$$;

COMMIT;
