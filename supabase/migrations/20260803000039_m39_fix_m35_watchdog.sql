-- M39: Fix M35 — fn_alert_instance_disconnection_watchdog (5 bugs)
-- Branch: claude/plan-implementation-review-bq8j14
-- Date: 2026-08-03
--
-- Problem (cubic P0/P1/P2 review of M35):
--
--   P2 (M35:39): search_path includes 'evo' and 'public' in a SECURITY DEFINER function.
--       Rule: SECURITY DEFINER functions must use only 'pg_catalog', 'zapp' (plus 'vault'
--       if vault access is needed). Including 'evo' or 'public' allows an attacker to
--       shadow functions by creating same-named objects in those schemas.
--
--   P0 (M35:85): fn_alert_instance_disconnection(v_conn.id, ...) passes
--       whatsapp_connections.id (UUID) as p_instance_id, but the function created in M26
--       expects instance_registry.id (a different UUID namespace). The FOR loop did not
--       JOIN zapp.instance_registry, so the correct UUID was never selected.
--       Result: every alert is attributed to a non-existent instance_registry row, causing
--       FK violation or a dangling reference with zero matching alerts in the monitor.
--
--   Bug (M35:69): The anti-flood guard also uses v_conn.id (whatsapp_connections.id):
--       ea.instance_id = v_conn.id — same mismatch; no alerts are ever suppressed
--       because evolution_alerts.instance_id stores instance_registry.id values.
--
--   P1 (M35:129): STEP 2 DO block accesses cron.job without a pg_cron exception guard.
--       On environments without pg_cron (staging, CI, fresh installs) the migration
--       fails with undefined_table, rolling back the entire transaction including STEP 1
--       (the corrected function body). The pg_cron guard (EXCEPTION WHEN undefined_table
--       OR invalid_schema_name THEN RAISE NOTICE ...; RETURN;) is the canonical pattern
--       for optional cron interactions.
--
--   Bug (M35 verification): The verification block queries cron.job directly without an
--       exception guard — same failure mode as P1 above.
--
-- Fix (CREATE OR REPLACE — no git history rewrite):
--   1. SECURITY DEFINER SET search_path TO 'pg_catalog', 'zapp' (drop 'evo', 'public').
--   2. FOR loop JOINs zapp.instance_registry to fetch ir.id AS registry_id.
--   3. Anti-flood uses v_conn.registry_id (evolution_alerts.instance_id FK target).
--   4. Alert call uses v_conn.registry_id as p_instance_id.
--   5. STEP 2 DO block: pg_cron guard wraps cron.job + cron.alter_job.
--   6. Verification: pg_cron guard, missing cron → WARN (non-fatal).
--
-- Rollback:
--   Run the original M35 STEP 1 CREATE OR REPLACE to restore the buggy version.
--   (Not recommended — all 5 bugs would re-appear.)

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — Replace with corrected function
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
  -- Iterate active Evolution API connections, joined to instance_registry to
  -- obtain the correct UUID for fn_alert_instance_disconnection (M26).
  -- evolution_alerts.instance_id references instance_registry.id, NOT
  -- whatsapp_connections.id — they are different UUID namespaces.
  FOR v_conn IN
    SELECT
      wc.id          AS wconn_id,
      ir.id          AS registry_id,
      wc.instance_name,
      wc.display_name,
      wc.status
    FROM zapp.whatsapp_connections wc
    JOIN zapp.instance_registry ir ON ir.instance_name = wc.instance_name
    WHERE wc.is_active = TRUE
      AND wc.api_type  = 'evolution'
      AND (p_instance_name IS NULL OR wc.instance_name = p_instance_name)
  LOOP
    -- Only alert when the instance is not connected
    IF v_conn.status IS NOT DISTINCT FROM 'connected' THEN
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
         AND ea.created_at  > now() - INTERVAL '60 minutes'
    ) INTO v_flooded;

    IF v_flooded THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Build context string for the alert message
    v_instance_info := coalesce(v_conn.display_name, v_conn.instance_name);

    -- Raise the alert using the single-alert helper (M26).
    -- p_instance_id must be instance_registry.id (v_conn.registry_id), NOT
    -- whatsapp_connections.id (v_conn.wconn_id).
    PERFORM zapp.fn_alert_instance_disconnection(
      v_conn.registry_id,                              -- p_instance_id  UUID (instance_registry.id)
      'disconnection',                                  -- p_alert_type   TEXT
      'Instance disconnected: ' || v_instance_info,    -- p_message       TEXT
      jsonb_build_object(
        'instance_name', v_conn.instance_name,
        'display_name',  v_conn.display_name,
        'status',        v_conn.status,
        'detected_at',   now()
      )                                                 -- p_details       JSONB
    );

    v_alerted := v_alerted + 1;
    RAISE NOTICE 'M39 ALERT: disconnection alert raised for instance % (registry_id: %)',
      v_conn.instance_name, v_conn.registry_id;
  END LOOP;

  RETURN jsonb_build_object(
    'alerted',     v_alerted,
    'skipped',     v_skipped,
    'checked_at',  now()
  );
END;
$fn$;

COMMENT ON FUNCTION zapp.fn_alert_instance_disconnection_watchdog(text)
  IS 'Watchdog (M35/M39 fix/F6-06): iterates all active evolution connections (JOINed '
     'to instance_registry for correct UUID) and fires disconnection alerts for any '
     'instance not in connected state. Anti-flood: skips instances with unresolved '
     'alerts in the last 60 minutes. SECURITY DEFINER search_path = pg_catalog, zapp. '
     'Optional p_instance_name restricts scan to a single instance for testing.';

REVOKE EXECUTE ON FUNCTION zapp.fn_alert_instance_disconnection_watchdog(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_alert_instance_disconnection_watchdog(text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — Update the cron job (with pg_cron guard)
-- Idempotent: safe to re-run if M35 already ran the cron update.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_jobid BIGINT;
BEGIN
  BEGIN
    SELECT jobid INTO v_jobid
      FROM cron.job
     WHERE jobname IN ('wpp2_disconnection_watchdog', 'instance_disconnection_watchdog')
     ORDER BY jobid
     LIMIT 1;
  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    RAISE NOTICE 'M39 STEP 2: pg_cron not available — skipping cron update';
    RETURN;
  END;

  IF v_jobid IS NULL THEN
    RAISE NOTICE 'M39 STEP 2: cron job not found by name — skipping (manual cron setup may be needed)';
    RETURN;
  END IF;

  PERFORM cron.alter_job(
    job_id   => v_jobid,
    job_name => 'instance_disconnection_watchdog',
    command  => 'SELECT zapp.fn_alert_instance_disconnection_watchdog()',
    schedule => '*/10 * * * *'
  );

  RAISE NOTICE 'M39 STEP 2: cron jobid % updated to instance_disconnection_watchdog ✓', v_jobid;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn_secdef   BOOLEAN;
  v_fn_body     TEXT;
  v_cron_name   TEXT;
  v_cron_cmd    TEXT;
  v_ok          BOOLEAN := TRUE;
  v_report      TEXT    := '';
BEGIN
  -- Function exists and is SECURITY DEFINER
  SELECT prosecdef, pg_catalog.pg_get_functiondef(p.oid)
    INTO v_fn_secdef, v_fn_body
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'zapp'
     AND p.proname = 'fn_alert_instance_disconnection_watchdog'
   LIMIT 1;

  IF v_fn_body IS NULL THEN
    v_report := v_report || E'\n  [FAIL] F6-06: fn_alert_instance_disconnection_watchdog NOT FOUND';
    v_ok := FALSE;
  ELSE
    v_report := v_report || E'\n  [OK]   F6-06: fn_alert_instance_disconnection_watchdog exists ✓';

    IF v_fn_secdef IS TRUE THEN
      v_report := v_report || E'\n  [OK]   M39: SECURITY DEFINER ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M39: NOT SECURITY DEFINER';
      v_ok := FALSE;
    END IF;

    -- search_path must NOT contain 'evo' or 'public'
    IF v_fn_body ~* 'set search_path.*\bevo\b' OR v_fn_body ~* 'set search_path.*\bpublic\b' THEN
      v_report := v_report || E'\n  [FAIL] M39/P2: search_path still contains evo or public';
      v_ok := FALSE;
    ELSE
      v_report := v_report || E'\n  [OK]   M39/P2: search_path free of evo/public ✓';
    END IF;

    -- Body must JOIN instance_registry for correct UUID
    IF v_fn_body ~* 'join.*instance_registry' AND v_fn_body ~* 'registry_id' THEN
      v_report := v_report || E'\n  [OK]   M39/P0: instance_registry JOIN + registry_id present ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M39/P0: instance_registry JOIN or registry_id missing';
      v_ok := FALSE;
    END IF;

    -- Anti-flood and alert call must use registry_id, not wconn_id
    IF v_fn_body ~* 'ea\.instance_id\s*=\s*v_conn\.registry_id' THEN
      v_report := v_report || E'\n  [OK]   M39: anti-flood uses registry_id ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M39: anti-flood does not use registry_id';
      v_ok := FALSE;
    END IF;

    IF v_fn_body ~* 'fn_alert_instance_disconnection\s*\(\s*v_conn\.registry_id' THEN
      v_report := v_report || E'\n  [OK]   M39/P0: alert call uses registry_id ✓';
    ELSE
      v_report := v_report || E'\n  [FAIL] M39/P0: alert call does not use registry_id';
      v_ok := FALSE;
    END IF;
  END IF;

  -- Cron check (non-fatal if pg_cron absent)
  BEGIN
    SELECT jobname, command
      INTO v_cron_name, v_cron_cmd
      FROM cron.job
     WHERE jobname = 'instance_disconnection_watchdog'
     LIMIT 1;

    IF v_cron_name IS NOT NULL THEN
      v_report := v_report || E'\n  [OK]   M39: cron instance_disconnection_watchdog exists ✓';
      IF position('fn_alert_instance_disconnection_watchdog' IN v_cron_cmd) > 0 THEN
        v_report := v_report || E'\n  [OK]   M39: cron command references correct function ✓';
      ELSE
        v_report := v_report || E'\n  [FAIL] M39: cron command does not reference fn_alert_instance_disconnection_watchdog';
        v_ok := FALSE;
      END IF;
    ELSE
      v_report := v_report || E'\n  [WARN] M39: cron instance_disconnection_watchdog not found (non-fatal — may need manual setup)';
    END IF;
  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    v_report := v_report || E'\n  [WARN] M39: pg_cron not available in this env — skipping cron verification (non-fatal)';
  END;

  RAISE NOTICE E'M39 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M39 verification FAILED — see notices above';
  END IF;
END;
$$;

COMMIT;
