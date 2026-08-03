-- M48: Fix M45-P0/P1, M43-P1, M44-P2 — cubic-dev-ai review findings
-- Branch: claude/plan-implementation-review-bq8j14
-- Date: 2026-08-03
--
-- Problems identified by cubic-dev-ai:
--
--   M45-P0 (BLOCKER — deterministic rollback):
--     Verification used position('wconn_id' IN lower(v_fn_body)) to confirm the
--     dead field was removed. But M45's own inline comment explained the fix by
--     mentioning the alias name, and pg_get_functiondef returns the full body
--     INCLUDING inline SQL comments. The check always evaluated TRUE →
--     always RAISE EXCEPTION → M45 could never commit.
--
--   M45-P1 (runtime crash on every alert call):
--     fn_alert_instance_disconnection_watchdog used pg_catalog.coalesce().
--     COALESCE is a SQL special form (keyword), not a regular function — it has
--     no entry in pg_proc and cannot be schema-qualified. Calling
--     pg_catalog.coalesce() fails at runtime with "function coalesce() does not
--     exist", crashing the alert-message build for every disconnected instance.
--
--   M43-P1 (all cron-gap alerts silently discarded):
--     v_alert_type was declared TEXT but warroom_alerts.alert_type is the ENUM
--     zapp.warroom_alert_type. Inserting a TEXT variable into an ENUM column
--     without an explicit cast fails with a type mismatch. Every cron-gap alert
--     INSERT fails, so nothing is ever persisted.
--
--   M44-P2 (official connections may clear Evolution alerts):
--     fn_wconn_status_auto_resolve had no api_type guard. The trigger fires on
--     ANY status→connected transition including official (Meta Cloud API)
--     connections, which could incorrectly resolve Evolution instance alerts.
--
-- Fix:
--   STEP 1: fn_alert_instance_disconnection_watchdog (M45-P0 + M45-P1)
--     Rewrite inline comment without the removed alias name; change
--     pg_catalog.coalesce → COALESCE; fix verification to check for the aliasing
--     PATTERN (wc.id as) instead of the alias name string.
--   STEP 2: fn_monitor_sync_cron_health (M43-P1)
--     Declare v_alert_type as zapp.warroom_alert_type instead of TEXT.
--   STEP 3: fn_wconn_status_auto_resolve (M44-P2)
--     Add api_type guard as first check: non-Evolution connections return NEW
--     immediately without touching Evolution-specific alerts.
--
-- Idempotent: CREATE OR REPLACE; safe to re-run.
--
-- Rollback:
--   Re-apply the original M45/M43/M44 CREATE OR REPLACE blocks.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — Fix fn_alert_instance_disconnection_watchdog
-- M45-P0: inline comment no longer contains the removed alias name.
-- M45-P1: COALESCE used unqualified (special form, cannot be schema-qualified).
-- Verification: checks for aliasing PATTERN wc.id as, not the alias name string.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_alert_instance_disconnection_watchdog(
  p_instance_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'zapp'
AS $fn$
DECLARE
  v_conn          RECORD;
  v_flooded       BOOLEAN;
  v_alerted       INTEGER := 0;
  v_skipped       INTEGER := 0;
  v_instance_info TEXT;
BEGIN
  -- Iterate active Evolution API connections, LEFT JOINed to instance_registry.
  -- LEFT JOIN: connections without a registry row are included so they can be
  -- explicitly logged and skipped rather than silently dropped.
  -- evolution_alerts.instance_id references instance_registry.id, NOT
  -- whatsapp_connections.id — they are different UUID namespaces.
  -- SELECT list contains only columns used in the loop body.
  FOR v_conn IN
    SELECT
      ir.id          AS registry_id,
      wc.instance_name,
      wc.display_name,
      wc.status
    FROM zapp.whatsapp_connections wc
    LEFT JOIN zapp.instance_registry ir ON ir.instance_name = wc.instance_name
    WHERE wc.is_active = TRUE
      AND wc.api_type  = 'evolution'
      AND (p_instance_name IS NULL OR wc.instance_name = p_instance_name)
  LOOP
    -- Only alert when the instance is not connected
    IF v_conn.status IS NOT DISTINCT FROM 'connected' THEN
      CONTINUE;
    END IF;

    -- Guard: no instance_registry row means no valid FK target for evolution_alerts.
    -- Log warning and skip rather than silently suppressing the alert.
    IF v_conn.registry_id IS NULL THEN
      RAISE NOTICE 'fn_alert_instance_disconnection_watchdog: active Evolution connection ''%'' has no instance_registry row — skipping alert (provision instance or add registry row)',
        v_conn.instance_name;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Anti-flood: skip if an unresolved disconnection alert was raised in the last 60 min.
    -- evolution_alerts.instance_id is a FK to instance_registry.id → use registry_id.
    SELECT EXISTS (
      SELECT 1
        FROM zapp.evolution_alerts ea
       WHERE ea.instance_id = v_conn.registry_id
         AND ea.alert_type  = 'disconnection'
         AND ea.resolved_at IS NULL
         AND ea.created_at  > pg_catalog.now() - INTERVAL '60 minutes'
    ) INTO v_flooded;

    IF v_flooded THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Build context string for the alert message.
    -- COALESCE is a SQL special form and cannot be schema-qualified (M48 P1 fix).
    v_instance_info := COALESCE(v_conn.display_name, v_conn.instance_name);

    -- Raise the alert using the single-alert helper (M26).
    -- p_instance_id must be instance_registry.id (v_conn.registry_id).
    PERFORM zapp.fn_alert_instance_disconnection(
      v_conn.registry_id,                              -- p_instance_id  UUID (instance_registry.id)
      'disconnection',                                  -- p_alert_type   TEXT
      'Instance disconnected: ' || v_instance_info,    -- p_message       TEXT
      pg_catalog.jsonb_build_object(
        'instance_name', v_conn.instance_name,
        'display_name',  v_conn.display_name,
        'status',        v_conn.status,
        'detected_at',   pg_catalog.now()
      )                                                 -- p_details       JSONB
    );

    v_alerted := v_alerted + 1;
    RAISE NOTICE 'M48 ALERT: disconnection alert raised for instance % (registry_id: %)',
      v_conn.instance_name, v_conn.registry_id;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'alerted',     v_alerted,
    'skipped',     v_skipped,
    'checked_at',  pg_catalog.now()
  );
END;
$fn$;

COMMENT ON FUNCTION zapp.fn_alert_instance_disconnection_watchdog(text)
  IS 'Watchdog (M35/M39/M45/M48 fix/F6-06): iterates all active Evolution connections '
     '(LEFT JOINed to instance_registry — INNER JOIN silently dropped unregistered '
     'instances) and fires disconnection alerts for any instance not in connected state. '
     'Anti-flood: skips instances with unresolved alerts in last 60 minutes. '
     'Connections without registry rows: logged and skipped, not silently dropped. '
     'Dead field alias removed from SELECT list (P3 fix — M45). '
     'COALESCE used unqualified — special form, not schema-qualifiable (P1 fix — M48). '
     'SECURITY DEFINER SET search_path = pg_catalog, zapp.';

REVOKE EXECUTE ON FUNCTION zapp.fn_alert_instance_disconnection_watchdog(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_alert_instance_disconnection_watchdog(text) TO service_role;

DO $$ BEGIN RAISE NOTICE 'M48 STEP 1: fn_alert_instance_disconnection_watchdog replaced (P0+P1 fix) ✓'; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn_secdef  BOOLEAN;
  v_fn_body    TEXT;
  v_ok         BOOLEAN := TRUE;
  v_report     TEXT    := '';
BEGIN
  SELECT p.prosecdef, pg_catalog.pg_get_functiondef(p.oid)
    INTO v_fn_secdef, v_fn_body
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp'
     AND p.proname = 'fn_alert_instance_disconnection_watchdog'
   LIMIT 1;

  IF v_fn_body IS NULL THEN
    v_report := v_report || E'\n  [FAIL] M48/S1: fn_alert_instance_disconnection_watchdog NOT FOUND';
    v_ok := FALSE;
  ELSE
    v_report := v_report || E'\n  [OK]   M48/S1: fn_alert_instance_disconnection_watchdog exists ✓';

    IF v_fn_secdef IS TRUE THEN
      v_report := v_report || E'\n  [OK]   M48/S1: SECURITY DEFINER ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M48/S1: NOT SECURITY DEFINER';
      v_ok := FALSE;
    END IF;

    -- P2 (M45): LEFT JOIN on instance_registry
    IF position('left join' IN lower(v_fn_body)) > 0
       AND position('instance_registry' IN lower(v_fn_body)) > 0
    THEN
      v_report := v_report || E'\n  [OK]   M48/S1 P2: LEFT JOIN instance_registry present ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M48/S1 P2: LEFT JOIN instance_registry not found';
      v_ok := FALSE;
    END IF;

    -- P2 (M45): NULL registry_id guard
    IF position('registry_id is null' IN lower(v_fn_body)) > 0 THEN
      v_report := v_report || E'\n  [OK]   M48/S1 P2: NULL registry_id guard present ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M48/S1 P2: NULL registry_id guard missing';
      v_ok := FALSE;
    END IF;

    -- P3 (M45): dead field alias wc.id must NOT appear in SELECT list
    -- Check for the aliasing PATTERN, not the alias name (which appeared in comments)
    IF position('wc.id as' IN lower(v_fn_body)) > 0 THEN
      v_report := v_report || E'\n  [FAIL] M48/S1 P3: dead field alias wc.id still in SELECT list';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   M48/S1 P3: dead field alias wc.id not in SELECT list ✓';
    END IF;

    -- P1 (M48): pg_catalog.coalesce is invalid — COALESCE must not be schema-qualified
    IF position('pg_catalog.coalesce' IN lower(v_fn_body)) > 0 THEN
      v_report := v_report || E'\n  [FAIL] M48/S1 P1: pg_catalog.coalesce found — COALESCE cannot be schema-qualified';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   M48/S1 P1: COALESCE not schema-qualified ✓';
    END IF;

    -- Anti-flood uses registry_id
    IF position('instance_id = v_conn.registry_id' IN lower(v_fn_body)) > 0 THEN
      v_report := v_report || E'\n  [OK]   M48/S1: anti-flood uses registry_id ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M48/S1: anti-flood does not use registry_id';
      v_ok := FALSE;
    END IF;

    -- Alert call uses registry_id
    IF position('fn_alert_instance_disconnection(' IN lower(v_fn_body)) > 0
       AND position('v_conn.registry_id' IN lower(v_fn_body)) > 0
    THEN
      v_report := v_report || E'\n  [OK]   M48/S1: alert call uses registry_id ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M48/S1: alert call does not use registry_id';
      v_ok := FALSE;
    END IF;

    -- search_path must not contain public
    IF position(', ''public''' IN lower(v_fn_body)) > 0 THEN
      v_report := v_report || E'\n  [FAIL] M48/S1: search_path still contains public';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   M48/S1: search_path free of public ✓';
    END IF;
  END IF;

  RAISE NOTICE E'M48 STEP 1 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M48 STEP 1 verification FAILED — see notices above';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Fix fn_monitor_sync_cron_health (M43-P1)
-- Change v_alert_type TEXT → zapp.warroom_alert_type to match column ENUM type.
-- All other logic is identical to M43 (no behavioural change).
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
  v_alert_type    zapp.warroom_alert_type;   -- M43-P1 fix: ENUM type, not TEXT
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

  -- Zero-run case (P1 fix from M43): distinguish "job genuinely has no history" from
  -- "continuous outage that started before the lookback window".
  -- Peek at the most recent run outside the lookback window.
  -- If one exists, the job WAS running — a full-window silence is a confirmed outage.
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
      -- P0 fix (M43): warroom_alerts has NO 'severity' column — removed from INSERT
      -- P1 fix (M48): v_alert_type is zapp.warroom_alert_type ENUM, not TEXT
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
  IS 'Cron health monitor (M36/M40/M43/M48 fix/F6-10): scans cron.job_run_details for '
     'consecutive execution gaps and trailing outages exceeding p_gap_minutes in the last '
     'p_lookback_hrs hours. Zero-run-in-window with prior history → confirmed outage (M43 P1). '
     'Inserts into zapp.warroom_alerts (alert_type: zapp.warroom_alert_type ENUM — M48 P1 fix; '
     'source: cron_monitor; entity: jobname) with 30-min anti-flood guard. '
     'No severity column (M43 P0 fix). pg_cron guards: returns early if unavailable. '
     'SECURITY DEFINER search_path = pg_catalog, zapp.';

REVOKE EXECUTE ON FUNCTION zapp.fn_monitor_sync_cron_health(BIGINT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_monitor_sync_cron_health(BIGINT, INTEGER, INTEGER) TO service_role;

DO $$ BEGIN RAISE NOTICE 'M48 STEP 2: fn_monitor_sync_cron_health replaced (v_alert_type ENUM fix) ✓'; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn_secdef  BOOLEAN;
  v_fn_body    TEXT;
  v_ok         BOOLEAN := TRUE;
  v_report     TEXT    := '';
BEGIN
  SELECT p.prosecdef, pg_catalog.pg_get_functiondef(p.oid)
    INTO v_fn_secdef, v_fn_body
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp'
     AND p.proname = 'fn_monitor_sync_cron_health'
   LIMIT 1;

  IF v_fn_body IS NULL THEN
    v_report := v_report || E'\n  [FAIL] M48/S2: fn_monitor_sync_cron_health NOT FOUND';
    v_ok := FALSE;
  ELSE
    v_report := v_report || E'\n  [OK]   M48/S2: fn_monitor_sync_cron_health exists ✓';

    IF v_fn_secdef IS TRUE THEN
      v_report := v_report || E'\n  [OK]   M48/S2: SECURITY DEFINER ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M48/S2: NOT SECURITY DEFINER';
      v_ok := FALSE;
    END IF;

    -- P1 fix (M48): v_alert_type must be declared as the ENUM type
    IF position('warroom_alert_type' IN lower(v_fn_body)) > 0 THEN
      v_report := v_report || E'\n  [OK]   M48/S2 P1: v_alert_type declared as warroom_alert_type ENUM ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M48/S2 P1: warroom_alert_type not found — v_alert_type may still be TEXT';
      v_ok := FALSE;
    END IF;

    -- P0 (M43): no severity column in INSERT
    IF v_fn_body ~* 'insert into.*warroom_alerts' AND v_fn_body ~* ',\s*severity' THEN
      v_report := v_report || E'\n  [FAIL] M48/S2 P0: warroom_alerts INSERT still includes severity column';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   M48/S2 P0: no severity in warroom_alerts INSERT ✓';
    END IF;

    -- P0 (M43): title column present in INSERT
    IF v_fn_body ~* 'insert into.*warroom_alerts'
       AND position('title' IN lower(v_fn_body)) > 0
    THEN
      v_report := v_report || E'\n  [OK]   M48/S2 P0: warroom_alerts INSERT includes title ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M48/S2 P0: warroom_alerts INSERT missing title column';
      v_ok := FALSE;
    END IF;

    -- P1 (M43): trailing-gap check present
    IF v_fn_body ~* 'v_trailing_gap' THEN
      v_report := v_report || E'\n  [OK]   M48/S2 P1: trailing-gap check present ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M48/S2 P1: trailing-gap check missing';
      v_ok := FALSE;
    END IF;

    -- P1 (M43): zero-run outage detection present
    IF v_fn_body ~* 'v_last_ever' THEN
      v_report := v_report || E'\n  [OK]   M48/S2 P1: zero-run outage detection present ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M48/S2 P1: zero-run outage detection missing';
      v_ok := FALSE;
    END IF;

    -- P3 (M43): dead variable v_max_gap_at must NOT be present
    IF v_fn_body ~* 'v_max_gap_at' THEN
      v_report := v_report || E'\n  [FAIL] M48/S2 P3: dead variable v_max_gap_at still present';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   M48/S2 P3: dead variable v_max_gap_at removed ✓';
    END IF;
  END IF;

  RAISE NOTICE E'M48 STEP 2 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M48 STEP 2 verification FAILED — see notices above';
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — Fix fn_wconn_status_auto_resolve (M44-P2)
-- Add api_type guard: only Evolution connections trigger alert resolution.
-- Official (Cloud API / Meta) connections must not clear Evolution alerts.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_wconn_status_auto_resolve()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'zapp'
AS $fn$
DECLARE
  v_registry_id UUID;
BEGIN
  IF NEW.status = 'connected' AND (OLD.status IS DISTINCT FROM 'connected') THEN

    -- Guard: only resolve Evolution API alerts (M44-P2 fix).
    -- Official (Meta Cloud API) connections use a separate alert path and must
    -- not touch Evolution instance alerts — they have no instance_registry rows.
    IF NEW.api_type IS DISTINCT FROM 'evolution' THEN
      RETURN NEW;
    END IF;

    -- Guard: Evolution connections should always have instance_name, but be defensive.
    IF NEW.instance_name IS NULL THEN
      RAISE NOTICE 'fn_wconn_status_auto_resolve: connection id=% has NULL instance_name — skipping alert resolution',
        NEW.id;
      RETURN NEW;
    END IF;

    -- Look up the instance_registry.id that corresponds to this connection's instance_name.
    -- evolution_alerts.instance_id FK references instance_registry(id), NOT whatsapp_connections(id).
    SELECT ir.id INTO v_registry_id
      FROM zapp.instance_registry ir
     WHERE ir.instance_name = NEW.instance_name
     LIMIT 1;

    IF v_registry_id IS NULL THEN
      -- No registry row found — instance was never provisioned or already removed.
      -- Silently skip; this is not an error condition.
      RAISE NOTICE 'fn_wconn_status_auto_resolve: no instance_registry row for instance_name=% (connection id=%) — skipping alert resolution',
        NEW.instance_name, NEW.id;
      RETURN NEW;
    END IF;

    -- Resolve all open disconnection/auth_failure/health_degraded alerts for this instance.
    UPDATE zapp.evolution_alerts
       SET resolved_at = pg_catalog.now(),
           updated_at  = pg_catalog.now()
     WHERE instance_id = v_registry_id        -- FK to instance_registry.id (correct UUID)
       AND resolved_at IS NULL
       AND alert_type IN ('disconnection', 'auth_failure', 'health_degraded');

    RAISE NOTICE 'fn_wconn_status_auto_resolve: resolved open alerts for instance_name=% (registry_id=%)',
      NEW.instance_name, v_registry_id;
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION zapp.fn_wconn_status_auto_resolve()
  IS 'Trigger: auto-resolves open evolution_alerts when a whatsapp_connections row '
     'transitions to status=connected. Looks up instance_registry.id via instance_name '
     'to resolve the correct UUID (evolution_alerts.instance_id FK → instance_registry.id, '
     'NOT whatsapp_connections.id). M44 fix: UUID namespace correction + search_path hardening. '
     'M48 P2 fix: api_type guard — only evolution connections trigger resolution; official '
     '(Cloud API) connections return early without touching Evolution alerts.';

REVOKE EXECUTE ON FUNCTION zapp.fn_wconn_status_auto_resolve() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_wconn_status_auto_resolve() TO service_role;

DO $$ BEGIN RAISE NOTICE 'M48 STEP 3: fn_wconn_status_auto_resolve replaced (api_type guard added) ✓'; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn_secdef  BOOLEAN;
  v_fn_body    TEXT;
  v_trg_exists BOOLEAN;
  v_ok         BOOLEAN := TRUE;
  v_report     TEXT    := '';
BEGIN
  SELECT p.prosecdef, pg_catalog.pg_get_functiondef(p.oid)
    INTO v_fn_secdef, v_fn_body
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp'
     AND p.proname = 'fn_wconn_status_auto_resolve'
   LIMIT 1;

  IF v_fn_body IS NULL THEN
    v_report := v_report || E'\n  [FAIL] M48/S3: fn_wconn_status_auto_resolve NOT FOUND';
    v_ok := FALSE;
  ELSE
    v_report := v_report || E'\n  [OK]   M48/S3: fn_wconn_status_auto_resolve exists ✓';

    IF v_fn_secdef IS TRUE THEN
      v_report := v_report || E'\n  [OK]   M48/S3: SECURITY DEFINER ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M48/S3: NOT SECURITY DEFINER';
      v_ok := FALSE;
    END IF;

    -- P2 fix (M48): api_type guard must be present
    IF position('api_type is distinct from' IN lower(v_fn_body)) > 0 THEN
      v_report := v_report || E'\n  [OK]   M48/S3 P2: api_type guard present ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M48/S3 P2: api_type guard missing';
      v_ok := FALSE;
    END IF;

    -- P2 fix (M48): guard must target evolution api_type
    IF position('''evolution''' IN lower(v_fn_body)) > 0 THEN
      v_report := v_report || E'\n  [OK]   M48/S3 P2: api_type guard targets ''evolution'' ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M48/S3 P2: api_type guard does not reference ''evolution''';
      v_ok := FALSE;
    END IF;

    -- M44 fix: must use v_registry_id (not NEW.id) in evolution_alerts WHERE
    IF v_fn_body ~* 'instance_id\s*=\s*NEW\.id' THEN
      v_report := v_report || E'\n  [FAIL] M48/S3: still uses instance_id = NEW.id (wrong UUID namespace)';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   M48/S3: no instance_id = NEW.id in function body ✓';
    END IF;

    IF v_fn_body ~* 'instance_id\s*=\s*v_registry_id' THEN
      v_report := v_report || E'\n  [OK]   M48/S3: uses instance_id = v_registry_id (correct UUID) ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M48/S3: v_registry_id not found in evolution_alerts WHERE clause';
      v_ok := FALSE;
    END IF;

    -- Must reference instance_registry for UUID lookup
    IF position('instance_registry' IN lower(v_fn_body)) > 0 THEN
      v_report := v_report || E'\n  [OK]   M48/S3: references instance_registry for UUID lookup ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M48/S3: no instance_registry reference (UUID lookup missing)';
      v_ok := FALSE;
    END IF;

    -- search_path must not contain evo or public
    IF v_fn_body ~* 'set search_path[^;]*(''evo''|, evo |,evo,)' THEN
      v_report := v_report || E'\n  [FAIL] M48/S3: search_path still contains evo';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   M48/S3: search_path free of evo ✓';
    END IF;

    IF v_fn_body ~* 'set search_path[^;]*(''public''|, public |,public,)' THEN
      v_report := v_report || E'\n  [FAIL] M48/S3: search_path still contains public';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   M48/S3: search_path free of public ✓';
    END IF;
  END IF;

  -- Trigger existence check (created by M44)
  SELECT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'zapp'
       AND c.relname = 'whatsapp_connections'
       AND t.tgname  = 'trg_wconn_auto_resolve_alerts'
       AND NOT t.tgisinternal
  ) INTO v_trg_exists;

  IF v_trg_exists THEN
    v_report := v_report || E'\n  [OK]   M48/S3: trg_wconn_auto_resolve_alerts trigger active ✓';
  ELSE
    v_report := v_report || E'\n  [FAIL] M48/S3: trg_wconn_auto_resolve_alerts trigger NOT FOUND';
    v_ok := FALSE;
  END IF;

  RAISE NOTICE E'M48 STEP 3 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M48 STEP 3 verification FAILED — see notices above';
  END IF;
END;
$$;

COMMIT;
