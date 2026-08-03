-- M27: F6-07 (SECURITY DEFINER on fn_alert_wpp2_disconnection),
--      F6-09 (cron watchdog 24h coverage — remove 6h nocturnal gap),
--      F6-18 (rename policy auth_secure_123 → descriptive name)
-- Branch: claude/plan-implementation-review-bq8j14
-- Date: 2026-08-03
--
-- Rollback notes:
--   F6-07: ALTER FUNCTION zapp.fn_alert_wpp2_disconnection(...) SECURITY INVOKER RESET search_path;
--          REVOKE EXECUTE ON FUNCTION ... FROM service_role; GRANT EXECUTE ON FUNCTION ... TO PUBLIC;
--   F6-09: SELECT cron.alter_job(job_id => <id>, schedule => '*/10 6-23 * * *');
--   F6-18: ALTER POLICY whatsapp_connections_agent_or_admin_read ON zapp.whatsapp_connections
--          RENAME TO auth_secure_123;

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — F6-07: Make fn_alert_wpp2_disconnection SECURITY DEFINER
-- Problem: All other fn_alert_* functions are SECURITY DEFINER with fixed
--          search_path, but fn_alert_wpp2_disconnection is SECURITY INVOKER
--          (prosecdef=false). Inconsistency means it runs as the calling role
--          and may lack INSERT privileges on zapp.evolution_alerts when called
--          by RLS-restricted sessions or triggers.
-- Fix: Dynamically ALTER to SECURITY DEFINER + fixed search_path.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_sig     TEXT;
  v_secdef  BOOLEAN;
BEGIN
  SELECT p.prosecdef,
         'zapp.' || p.proname || '(' || COALESCE(pg_get_function_identity_arguments(p.oid), '') || ')'
  INTO   v_secdef, v_sig
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'zapp'
    AND  p.proname = 'fn_alert_wpp2_disconnection'
  LIMIT  1;

  IF v_sig IS NULL THEN
    RAISE NOTICE 'F6-07 SKIP: fn_alert_wpp2_disconnection not found in zapp';
    RETURN;
  END IF;

  IF v_secdef THEN
    RAISE NOTICE 'F6-07 SKIP: fn_alert_wpp2_disconnection already SECURITY DEFINER';
    RETURN;
  END IF;

  EXECUTE format(
    'ALTER FUNCTION %s SECURITY DEFINER SET search_path TO ''pg_catalog'', ''zapp'', ''evo'', ''public''',
    v_sig
  );
  -- Remove implicit public-execute ACL that ALTER preserves; grant only to service_role
  EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', v_sig);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);

  RAISE NOTICE 'F6-07 DONE: % is now SECURITY DEFINER with fixed search_path', v_sig;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — F6-09: Fix cron schedule for wpp2_disconnection_watchdog
-- Problem: Schedule */10 6-23 * * * leaves a 6-hour nocturnal blind spot
--          (00:00–06:00 UTC). Disconnections during night hours go undetected
--          until the morning run.
-- Fix: Update schedule to */10 * * * * (every 10 minutes, 24h/day).
--      The function itself handles time-of-day severity if applicable.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_jobid    BIGINT;
  v_schedule TEXT;
BEGIN
  SELECT jobid, schedule
    INTO v_jobid, v_schedule
    FROM cron.job
   WHERE jobname = 'wpp2_disconnection_watchdog';

  IF v_jobid IS NULL THEN
    RAISE NOTICE 'F6-09 SKIP: wpp2_disconnection_watchdog not found in cron.job';
  ELSIF v_schedule = '*/10 * * * *' THEN
    RAISE NOTICE 'F6-09 SKIP: wpp2_disconnection_watchdog already on 24h schedule';
  ELSE
    -- Use the official pg_cron API (never mutate cron.job directly)
    PERFORM cron.alter_job(job_id => v_jobid, schedule => '*/10 * * * *');
    RAISE NOTICE 'F6-09 DONE: wpp2_disconnection_watchdog rescheduled to */10 * * * * (24h)';
  END IF;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'F6-09 SKIP: pg_cron not available (cron.job table not found)';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3 — F6-18: Rename policy auth_secure_123 → descriptive name
-- Problem: Policy named "auth_secure_123" is cryptic and test-like. RLS policy
--          names should communicate intent at a glance.
-- Fix: ALTER POLICY ... RENAME TO (valid in PostgreSQL 9.5+).
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_old TEXT := 'auth_secure_123';
  v_new TEXT := 'whatsapp_connections_agent_or_admin_read';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp'
      AND tablename  = 'whatsapp_connections'
      AND policyname = v_old
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'zapp'
        AND tablename  = 'whatsapp_connections'
        AND policyname = v_new
    ) THEN
      RAISE NOTICE 'F6-18 SKIP: policy "%" already renamed to "%"', v_old, v_new;
    ELSE
      RAISE NOTICE 'F6-18 SKIP: policy "%" not found on zapp.whatsapp_connections', v_old;
    END IF;
    RETURN;
  END IF;

  EXECUTE format(
    'ALTER POLICY %I ON zapp.whatsapp_connections RENAME TO %I',
    v_old, v_new
  );

  RAISE NOTICE 'F6-18 DONE: policy "%" renamed to "%"', v_old, v_new;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_secdef        BOOLEAN;
  v_cron_schedule TEXT;
  v_policy_new    BOOLEAN;
  v_ok            BOOLEAN := TRUE;
  v_report        TEXT    := '';
BEGIN
  -- F6-07
  SELECT p.prosecdef INTO v_secdef
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'zapp' AND p.proname = 'fn_alert_wpp2_disconnection'
  LIMIT  1;

  IF v_secdef IS NULL THEN
    v_report := v_report || E'\n  [SKIP] F6-07: fn_alert_wpp2_disconnection not found';
  ELSIF v_secdef THEN
    v_report := v_report || E'\n  [OK]   F6-07: SECURITY DEFINER ✓';
  ELSE
    v_report := v_report || E'\n  [FAIL] F6-07: still SECURITY INVOKER';
    v_ok := FALSE;
  END IF;

  -- F6-09
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
      SELECT schedule INTO v_cron_schedule
      FROM   cron.job WHERE jobname = 'wpp2_disconnection_watchdog';
    END IF;
  EXCEPTION WHEN undefined_table OR invalid_schema_name THEN
    v_cron_schedule := NULL;
  END;

  IF v_cron_schedule IS NULL THEN
    v_report := v_report || E'\n  [SKIP] F6-09: cron job not found';
  ELSIF v_cron_schedule = '*/10 * * * *' THEN
    v_report := v_report || E'\n  [OK]   F6-09: schedule = */10 * * * * ✓';
  ELSE
    v_report := v_report || E'\n  [FAIL] F6-09: schedule still = "' || v_cron_schedule || '"';
    v_ok := FALSE;
  END IF;

  -- F6-18
  SELECT EXISTS(
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'zapp'
      AND tablename  = 'whatsapp_connections'
      AND policyname = 'whatsapp_connections_agent_or_admin_read'
  ) INTO v_policy_new;

  IF v_policy_new THEN
    v_report := v_report || E'\n  [OK]   F6-18: policy whatsapp_connections_agent_or_admin_read exists ✓';
  ELSE
    -- Not a hard failure — policy may not exist in all environments
    v_report := v_report || E'\n  [SKIP] F6-18: policy not found (may not exist in this environment)';
  END IF;

  RAISE NOTICE E'M27 Verification:%', v_report;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'M27 verification FAILED — see notices above';
  END IF;
END;
$$;

COMMIT;
