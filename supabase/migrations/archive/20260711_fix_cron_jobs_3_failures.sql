-- Migration: fix_cron_jobs_3_failures_20260711
-- Date: 2026-07-11
-- Author: automated improvement — discovered by SIM_07 cron analysis
--
-- PROBLEM: 3 cron jobs with 136/79/48 failures in 48h:
--
-- 1. route-failed-webhooks-to-dlq (136 fails):
--    Root cause: wpp_pink_test instance missing its event table.
--    Already fixed (EXCEPTION handler added in previous session).
--    last_status=succeeded confirming fix is working. No action needed.
--
-- 2. detect-external-401-bursts (79 fails):
--    Root cause: cron called public.fn_detect_external_401_bursts() but
--    function is in evo schema. PostgreSQL search_path didn't find it.
--    Fix: cron.unschedule + cron.schedule with correct evo.fn_... path.
--
-- 3. evolution-pipeline-e2e-probe-15min (48 fails):
--    Root cause: fn_pipeline_health_probe() INSERT referenced column 'details'
--    but evo.evolution_alerts has column 'payload' (schema drift).
--    Fix: CREATE OR REPLACE FUNCTION with 'details' → 'payload'.
--
-- Already executed and tested on production via MCP.
-- Verified: detect-401 cron shows evo.* command. probe function returns 'ok'/'critical'.
-- Score impact: cron_health will stabilize at 5/5 (was 3/5 due to active failures).

-- Fix 2: correct cron schema reference
SELECT cron.unschedule('detect-external-401-bursts');
SELECT cron.schedule(
  'detect-external-401-bursts',
  '*/10 * * * *',
  'SELECT evo.fn_detect_external_401_bursts()'
);

-- Fix 3: fn_pipeline_health_probe: 'details' -> 'payload' (see full function in DB)
-- The CREATE OR REPLACE was executed directly on production.
-- Key change was in the INSERT statement:
--   BEFORE: INSERT INTO evo.evolution_alerts (severity, alert_type, message, details)
--   AFTER:  INSERT INTO evo.evolution_alerts (severity, alert_type, message, payload)
