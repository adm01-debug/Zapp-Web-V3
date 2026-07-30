-- ============================================================
-- Migration: 20260727000034_cron_thundering_herd
-- Objetivo: Identificar e resolver cron jobs que executam no mesmo minuto
-- Criado: 2026-07-27
--参阅: Step 34
-- ============================================================

-- ============================================================================
-- Visão: Jobs por minuto (detectar thundering herd)
-- ============================================================================
CREATE OR REPLACE VIEW ops.v_crons_by_minute AS
WITH parsed AS (
    SELECT
        jobid,
        jobname,
        schedule,
        (regexp_match(schedule, '([0-9]+) ([0-9]+) \* \* \*'))[1]::INTEGER AS minute,
        (regexp_match(schedule, '([0-9]+) ([0-9]+) \* \* \*'))[2]::INTEGER AS hour
    FROM cron.job
    WHERE active = true
      AND schedule ~ '^[0-9]+ [0-9]+ \* \* \*$'  -- simple: min hour * * *
)
SELECT
    minute,
    hour,
    count(*) AS job_count,
    array_agg(jobname ORDER BY jobname) AS jobs,
    sum(max_runtime_sec) AS total_estimated_sec
FROM parsed
JOIN ops.cron_canonical_register r ON r.job_name = parsed.jobname
GROUP BY minute, hour
HAVING count(*) > 3   -- alerta se mais de 3 jobs no mesmo minuto
ORDER BY hour, minute;

-- ============================================================================
-- Resolução: espalhar jobs por minutos diferentes
-- ============================================================================
-- Estratégia: jobs com mais de 3 concorrentes redistribuídos:
--
-- MINUTO 0:  ops-snapshot-indexes-2h,  ops-vacuum-all-6h,  zapp-matview-refresh-15m
--            → manter aqui (ops críticas)
--
-- MINUTO 15: zapp-matview-refresh-15m (3x por hora)
--            → OK
--
-- MINUTO 30: ops-backup-verify-6h, ops-cleanup-old-snapshots-daily
--            → OK
--
-- MINUTO 45: zapp-matview-refresh-15m (3x por hora)
--            → OK

-- Cron SQL para redistribuir (executar APÓS identificar):
-- UPDATE cron.job SET schedule = '0 3 * * *' WHERE jobname = 'ops-backup-verify-6h';
