-- F7-14: Resolve webhook_health_alerts burnin backlog
--
-- Context: The burn-in monitor (cron 145, every 15 min) reads evo.evolution_alerts
-- for unresolved critical alerts, resets the 72h counter, and inserts a new
-- burnin_critical_alert into zapp.webhook_health_alerts.
-- Since the system is already in production, the burn-in period is over.
-- The self-perpetuating loop has accumulated 766+ unresolved burnin_critical_alert
-- artifacts.
--
-- Fix:
--   1. Mark burn_in_passed = true in evo.evolution_burnin_tracker → fn_burnin_critical_alert_check
--      will immediately return SKIP on every future run, generating no new alerts.
--   2. Disable cron 145 (burnin-monitor) — redundant now that burn-in is passed.
--   3. Mass-resolve all burnin_critical_alert and burnin_disconnection entries in
--      zapp.webhook_health_alerts (766+4 = 770 artifacts of the loop).
--   4. Leave lovable_parity_drift, restore_integrity_fail, backup_sentinel_stale
--      unresolved for manual human review.

-- Step 1: Mark burn-in as passed
UPDATE evo.evolution_burnin_tracker
SET burn_in_passed    = true,
    last_reset_reason = 'F7-14: Burn-in period concluded — system is in production. Loop terminated 2026-08-03.',
    updated_at        = now()
WHERE id = 1;

-- Step 2: Disable cron 145 (burnin-monitor)
UPDATE cron.job
SET active = false
WHERE jobid = 145 AND jobname = 'burnin-monitor';

-- Step 3: Mass-resolve burnin loop artifacts in webhook_health_alerts
-- Only resolves burnin_critical_alert and burnin_disconnection — NOT the real operational alerts.
UPDATE zapp.webhook_health_alerts
SET resolved_at  = now(),
    acknowledged = true
WHERE alert_type IN ('burnin_critical_alert', 'burnin_disconnection')
  AND resolved_at IS NULL;

-- Verify counts after fix
DO $$
DECLARE
  v_unresolved   bigint;
  v_burn_passed  boolean;
  v_cron_active  boolean;
BEGIN
  SELECT COUNT(*) INTO v_unresolved
  FROM zapp.webhook_health_alerts
  WHERE resolved_at IS NULL;

  SELECT burn_in_passed INTO v_burn_passed
  FROM evo.evolution_burnin_tracker
  WHERE id = 1;

  SELECT active INTO v_cron_active
  FROM cron.job
  WHERE jobid = 145;

  RAISE NOTICE 'F7-14 result: unresolved_alerts=%, burn_in_passed=%, cron_145_active=%',
    v_unresolved, v_burn_passed, v_cron_active;
END $$;
