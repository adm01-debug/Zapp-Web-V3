-- M35: F6-06 — Refactor instance disconnection watchdog to generic multi-instance
-- Branch: claude/plan-implementation-review-bq8j14
-- Date: 2026-08-03
--
-- Problem: fn_alert_wpp2_disconnection() is hardcoded to the 'wpp2' instance.
--   As more Evolution API connections are added (whatsapp_connections WHERE
--   is_active = true AND api_type = 'evolution'), only the wpp2 instance is
--   monitored for disconnections. All other instances silently disconnect
--   without any alert being raised.
--
-- Fix:
--   1. Create generic watchdog fn_alert_instance_disconnection_watchdog()
--      that iterates all active evolution connections and raises alerts via the
--      single-alert helper fn_alert_instance_disconnection(UUID,TEXT,TEXT,JSONB)
--      created in M26.
--   2. Rename the cron: wpp2_disconnection_watchdog → instance_disconnection_watchdog
--      and update it to call the new function.
--   3. Drop the old fn_alert_wpp2_disconnection() (hardcoded 0-arg variant).
--
-- Anti-flood guard: skip if an unresolved alert was created in the past 60 min.
-- Optional param p_instance_name allows targeted testing of a single instance.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS zapp.fn_alert_instance_disconnection_watchdog(text);
--   -- Restore fn_alert_wpp2_disconnection() from M27 backup if needed.
--   -- Restore cron name/command via cron.alter_job().

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — Create the generic multi-instance watchdog function
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION zapp.fn_alert_instance_disconnection_watchdog(
  p_instance_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'zapp', 'evo', 'public'
AS $fn$
DECLARE
  v_conn          RECORD;
  v_flooded       BOOLEAN;
  v_alerted       INTEGER := 0;
  v_skipped       INTEGER := 0;
  v_instance_info TEXT;
BEGIN
  -- Iterate active Evolution API connections (optionally filtered to one instance)
  FOR v_conn IN
    SELECT
      wc.id,
      wc.instance_name,
      wc.display_name,
      wc.status
    FROM zapp.whatsapp_connections wc
    WHERE wc.is_active = TRUE
      AND wc.api_type  = 'evolution'
      AND (p_instance_name IS NULL OR wc.instance_name = p_instance_name)
  LOOP
    -- Only alert when the instance is not connected
    IF v_conn.status IS NOT DISTINCT FROM 'connected' THEN
      CONTINUE;
    END IF;

    -- Anti-flood: skip if an unresolved disconnection alert was raised in the last 60 min
    SELECT EXISTS (
      SELECT 1
        FROM zapp.evolution_alerts ea
       WHERE ea.instance_id   = v_conn.id
         AND ea.alert_type    = 'disconnection'
         AND ea.resolved_at   IS NULL
         AND ea.created_at    > now() - INTERVAL '60 minutes'
    ) INTO v_flooded;

    IF v_flooded THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Build context string for the alert message
    v_instance_info := coalesce(v_conn.display_name, v_conn.instance_name);

    -- Raise the alert using the single-alert helper created in M26
    PERFORM zapp.fn_alert_instance_disconnection(
      v_conn.id,                    -- p_instance_uuid UUID
      'disconnection',              -- p_alert_type    TEXT
      'Instance disconnected: ' || v_instance_info,  -- p_message TEXT
      jsonb_build_object(
        'instance_name', v_conn.instance_name,
        'display_name',  v_conn.display_name,
        'status',        v_conn.status,
        'detected_at',   now()
      )                             -- p_details JSONB
    );

    v_alerted := v_alerted + 1;
    RAISE NOTICE 'M35 ALERT: disconnection alert raised for instance % (id: %)', v_conn.instance_name, v_conn.id;
  END LOOP;

  RETURN jsonb_build_object(
    'alerted', v_alerted,
    'skipped', v_skipped,
    'checked_at', now()
  );
END;
$fn$;

COMMENT ON FUNCTION zapp.fn_alert_instance_disconnection_watchdog(text)
  IS 'Watchdog (M35/F6-06): iterates all active evolution connections and fires '
     'disconnection alerts for any instance not in connected state. Anti-flood: '
     'skips instances with unresolved alerts created in the last 60 minutes. '
     'Optional p_instance_name restricts scan to a single instance for testing.';

REVOKE EXECUTE ON FUNCTION zapp.fn_alert_instance_disconnection_watchdog(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_alert_instance_disconnection_watchdog(text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Update the cron job: rename and point to the new function
-- M27 created/updated the cron; here we rename it and change the command.
-- cron.alter_job() requires the jobid — we look it up by name.
-- If neither the old nor new name is found, skip gracefully.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_jobid BIGINT;
BEGIN
  -- Look for the cron by old name first, then by new name (idempotent re-run)
  SELECT jobid INTO v_jobid
    FROM cron.job
   WHERE jobname IN ('wpp2_disconnection_watchdog', 'instance_disconnection_watchdog')
   ORDER BY jobid  -- stable order
   LIMIT 1;

  IF v_jobid IS NULL THEN
    RAISE NOTICE 'M35 SKIP: cron job not found (neither old nor new name) — manual cron setup required';
    RETURN;
  END IF;

  PERFORM cron.alter_job(
    job_id      => v_jobid,
    job_name    => 'instance_disconnection_watchdog',
    command     => 'SELECT zapp.fn_alert_instance_disconnection_watchdog()',
    schedule    => '*/10 * * * *'
  );

  RAISE NOTICE 'M35 CRON: jobid % renamed to instance_disconnection_watchdog and command updated', v_jobid;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — Drop the old hardcoded fn_alert_wpp2_disconnection()
-- M27 made it SECURITY DEFINER; M35 replaces it with the generic watchdog.
-- We look up the exact arg signature dynamically to avoid hard-coding it.
-- If it doesn't exist (already dropped or never created), skip gracefully.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_args TEXT;
BEGIN
  SELECT pg_catalog.pg_get_function_identity_arguments(p.oid)
    INTO v_args
    FROM pg_catalog.pg_proc     p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp'
     AND p.proname = 'fn_alert_wpp2_disconnection'
   LIMIT 1;

  IF v_args IS NULL THEN
    RAISE NOTICE 'M35 SKIP: fn_alert_wpp2_disconnection not found — already dropped or never created';
    RETURN;
  END IF;

  EXECUTE format(
    'DROP FUNCTION IF EXISTS zapp.fn_alert_wpp2_disconnection(%s)',
    v_args
  );

  RAISE NOTICE 'M35 DROPPED: zapp.fn_alert_wpp2_disconnection(%)', v_args;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn_exists      BOOLEAN;
  v_fn_secdef      BOOLEAN;
  v_old_fn_gone    BOOLEAN;
  v_cron_ok        BOOLEAN;
  v_cron_name      TEXT;
  v_cron_cmd       TEXT;
  v_ok             BOOLEAN := TRUE;
  v_report         TEXT    := '';
BEGIN
  -- New watchdog function exists and is SECURITY DEFINER
  SELECT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp' AND p.proname = 'fn_alert_instance_disconnection_watchdog'
  ) INTO v_fn_exists;

  IF v_fn_exists THEN
    v_report := v_report || E'\n  [OK]   F6-06: fn_alert_instance_disconnection_watchdog exists ✓';

    SELECT prosecdef INTO v_fn_secdef
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'zapp' AND p.proname = 'fn_alert_instance_disconnection_watchdog'
     LIMIT 1;

    IF v_fn_secdef IS TRUE THEN
      v_report := v_report || E'\n  [OK]   F6-06: fn_alert_instance_disconnection_watchdog is SECURITY DEFINER ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] F6-06: fn_alert_instance_disconnection_watchdog NOT SECURITY DEFINER';
      v_ok := FALSE;
    END IF;
  ELSE
    v_report := v_report || E'\n  [FAIL] F6-06: fn_alert_instance_disconnection_watchdog NOT FOUND';
    v_ok := FALSE;
  END IF;

  -- Old hardcoded function is gone
  SELECT NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp' AND p.proname = 'fn_alert_wpp2_disconnection'
  ) INTO v_old_fn_gone;

  IF v_old_fn_gone THEN
    v_report := v_report || E'\n  [OK]   F6-06: fn_alert_wpp2_disconnection removed ✓';
  ELSE
    v_report := v_report || E'\n  [WARN] F6-06: fn_alert_wpp2_disconnection still exists (non-blocking; may be in use by other callers)';
    -- Not a hard failure — could be referenced by something else
  END IF;

  -- Cron renamed and command updated
  SELECT jobname, command
    INTO v_cron_name, v_cron_cmd
    FROM cron.job
   WHERE jobname = 'instance_disconnection_watchdog'
   LIMIT 1;

  IF v_cron_name IS NOT NULL THEN
    v_report := v_report || E'\n  [OK]   F6-06: cron renamed to instance_disconnection_watchdog ✓';

    IF position('fn_alert_instance_disconnection_watchdog' IN v_cron_cmd) > 0 THEN
      v_report := v_report || E'\n  [OK]   F6-06: cron command calls fn_alert_instance_disconnection_watchdog ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] F6-06: cron command does not reference fn_alert_instance_disconnection_watchdog (got: ' || coalesce(v_cron_cmd,'<null>') || ')';
      v_ok := FALSE;
    END IF;
  ELSE
    v_report := v_report || E'\n  [WARN] F6-06: cron instance_disconnection_watchdog not found — may need manual cron setup (non-fatal if pg_cron not available in this env)';
    -- Non-fatal: pg_cron may not be available in all environments (e.g., local dev)
  END IF;

  RAISE NOTICE E'M35 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M35 verification FAILED — see notices above';
  END IF;
END;
$$;

COMMIT;
