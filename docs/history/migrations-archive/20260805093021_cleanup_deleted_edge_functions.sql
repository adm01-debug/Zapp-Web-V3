-- Migration: cleanup_deleted_edge_functions
-- Data: 2026-08-05
-- Correções pós-deleção de 6 edge functions obsoletas

BEGIN;

-- 1. Remove orphaned cron job run records (jobs 44, 145, 216 foram deletados do cron.job
--    mas deixaram registros órfãos em cron.job_run_details)
DELETE FROM cron.job_run_details
WHERE jobid IN (44, 145, 216)
  AND NOT EXISTS (
    SELECT 1 FROM cron.job j
    WHERE j.jobid = cron.job_run_details.jobid
  );

-- 2. Marcar edge functions deletadas como inativas no registry
--    (hello, seed-teams-users, backfill-messages, auth-email-hook,
--     analyze-external-db, external-db-bridge)
UPDATE ops.edge_function_registry
SET is_active = false
WHERE fn_name IN (
  'hello',
  'seed-teams-users',
  'backfill-messages',
  'auth-email-hook',
  'analyze-external-db',
  'external-db-bridge'
)
AND is_active = true;

COMMIT;
