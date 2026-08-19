-- Codifica o cron job 'evo-detect-401-bursts' como migration.
-- O job (jobid=173) existia no banco criado ad-hoc com active=false
-- e nunca havia rodado. Causa: ausência de migration de ativação.
-- Idempotente: cron.schedule() faz upsert por jobname; UPDATE é reentrante.

SELECT cron.schedule(
  'evo-detect-401-bursts',
  '8,23,38,53 * * * *',
  'SELECT evo.fn_detect_401_bursts()'
);

UPDATE cron.job
SET active = true
WHERE jobname = 'evo-detect-401-bursts'
  AND active = false;
