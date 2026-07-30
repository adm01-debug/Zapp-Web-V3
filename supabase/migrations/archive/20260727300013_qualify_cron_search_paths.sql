-- Migration: 20260727300013_qualify_cron_search_paths
-- Purpose: Fix cron jobs that reference unqualified schema objects.
--          All pg_cron job commands must either use schema-qualified names
--          or set an explicit search_path in the command.
-- Risk: LOW — only updates cron command strings, no DDL on objects
-- Staging required: NO (cron command updates are safe)
-- Ref: etapa 13 do plano DB

SET search_path = cron, public, pg_catalog;

-- ============================================================
-- AUDIT: Find cron jobs with unqualified references
-- ============================================================
/*
-- Run in READ-ONLY mode to identify jobs needing qualification:
SELECT jobid, jobname, command
FROM cron.job
WHERE command NOT ILIKE '%search_path%'
  AND command NOT ILIKE '%.%(%'      -- no schema.fn() pattern
  AND command NOT ILIKE 'select 1%'  -- health check stubs
  AND command NOT ILIKE 'VACUUM%'    -- VACUUM ignores search_path
ORDER BY jobname;
*/

-- ============================================================
-- FIX: Qualify cron job commands
-- ============================================================

-- Job: email_tracking_cleanup_weekly (job ~15)
-- Problem: calls cleanup function without schema prefix
UPDATE cron.job
SET command = 'SELECT ops.fn_email_tracking_cleanup()'
WHERE jobname = 'email-tracking-cleanup-weekly'
  AND command NOT ILIKE '%ops.%'
  AND command ILIKE '%email_tracking_cleanup%';

-- Job: wal-slot-monitor (job ~122)
-- Problem: references fn_check_wal_slots without schema
UPDATE cron.job
SET command = 'SELECT ops.fn_check_wal_slots()'
WHERE jobname = 'wal-slot-monitor'
  AND command NOT ILIKE '%ops.%'
  AND command ILIKE '%fn_check_wal_slots%';

-- Job: bpm-check-breached-slas (job 198)
-- Ensure schema-qualified
UPDATE cron.job
SET command = 'SELECT bpm.fn_check_breached_slas()'
WHERE jobname = 'bpm-check-breached-slas'
  AND command NOT ILIKE '%bpm.%'
  AND command ILIKE '%fn_check_breached_slas%';

-- Job: ensure-evolution-backcompat-views (job 138)
-- Must use evo schema prefix
UPDATE cron.job
SET command = 'SELECT evo.fn_ensure_evolution_backcompat_views()'
WHERE jobname = 'ensure-evolution-backcompat-views'
  AND command NOT ILIKE '%evo.%'
  AND command ILIKE '%fn_ensure_evolution_backcompat_views%';

-- ============================================================
-- POLICY: Enforce search_path in all future cron commands
-- ============================================================
-- All new cron jobs MUST use one of:
--   a) schema.function() qualified call
--   b) SET search_path = schema; SELECT fn() — in a DO $$ block
-- CI-05 (see SCHEMA-CONTRACT.md) validates SECURITY DEFINER functions
-- have fixed search_path. Same applies to cron commands.

-- ============================================================
-- VALIDATION
-- ============================================================
DO $$
DECLARE
    v_unqualified_count int;
BEGIN
    SELECT COUNT(*) INTO v_unqualified_count
    FROM cron.job
    WHERE command ILIKE '%fn_%'  -- has a function call
      AND command NOT ILIKE '%.%(%'   -- no schema.fn() pattern
      AND command NOT ILIKE '%search_path%';

    IF v_unqualified_count > 0 THEN
        RAISE WARNING '% cron job(s) still have unqualified function references. Run audit query.',
            v_unqualified_count;
    ELSE
        RAISE NOTICE '✓ All cron jobs with function calls are schema-qualified.';
    END IF;
END;
$$;

SELECT 'Migration 20260727300013 complete. '
       'Cron search_path qualification applied. '
       'Run audit query to verify coverage.' AS status;
