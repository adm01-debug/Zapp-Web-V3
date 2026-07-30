-- ============================================================
-- Migration: 20260727000035_cron_failure_alerting
-- Objetivo: Alertar quando cron jobs falham consecutivamente
-- Criado: 2026-07-27
--参阅: Step 35
-- ============================================================

-- ============================================================================
-- Tabela: histórico de execuções de cron
-- ============================================================================
CREATE TABLE IF NOT EXISTS ops.cron_execution_history (
    id              BIGSERIAL PRIMARY KEY,
    job_id          INTEGER NOT NULL,
    job_name        TEXT,
    run_at          TIMESTAMPTZ DEFAULT now(),
    status          TEXT CHECK (status IN ('success','failure','running','timeout')),
    duration_ms     INTEGER,
    error_message   TEXT,
    details         JSONB
);

-- ============================================================================
-- Visão: jobs com falhas consecutivas
-- ============================================================================
CREATE OR REPLACE VIEW ops.v_cron_consecutive_failures AS
WITH ranked AS (
    SELECT
        h.job_name,
        h.status,
        h.run_at,
        row_number() OVER (
            PARTITION BY h.job_name
            ORDER BY h.run_at DESC
        ) AS rn
    FROM ops.cron_execution_history h
    WHERE h.run_at > now() - INTERVAL '24 hours'
)
SELECT
    r.job_name,
    count(*) FILTER (WHERE r.status = 'failure') AS failure_count,
    count(*) FILTER (WHERE r.status = 'success')  AS success_count,
    max(r.run_at)                               AS last_run,
    CASE
        WHEN count(*) FILTER (WHERE r.status = 'failure') >= 3
            THEN '🔴 CRITICAL: 3+ falhas consecutivas'
        WHEN count(*) FILTER (WHERE r.status = 'failure') >= 1
            THEN '🟡 WARNING: falha reciente'
        ELSE '🟢 OK'
    END AS alert
FROM ranked r
WHERE r.rn <= 10  -- últimos 10 runs
GROUP BY r.job_name
HAVING count(*) FILTER (WHERE r.status = 'failure') >= 1
ORDER BY failure_count DESC;

-- ============================================================================
-- Função: processar resultado de cron job (chamar no final de cada job)
-- ============================================================================
CREATE OR REPLACE FUNCTION ops.fn_log_cron_execution(
    p_job_name   TEXT,
    p_status      TEXT,
    p_duration_ms INTEGER DEFAULT NULL,
    p_error       TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ops, pg_catalog
AS $$
BEGIN
    INSERT INTO ops.cron_execution_history (job_name, status, duration_ms, error_message)
    VALUES (p_job_name, p_status, p_duration_ms, p_error);

    -- Alert se mais de 3 falhas consecutivas
    IF p_status = 'failure' THEN
        IF EXISTS (
            SELECT 1 FROM ops.cron_execution_history h
            WHERE h.job_name = p_job_name
              AND h.status    = 'failure'
              AND h.run_at   > now() - INTERVAL '24 hours'
            HAVING count(*) >= 3
        ) THEN
            RAISE WARNING 'CRON FAILURE ALERT: % tem 3+ falhas consecutivas', p_job_name;
        END IF;
    END IF;
END;
$$;

-- ============================================================================
-- Cron: processar cron.job_run_details via pg_cron extension
-- (requer pg_cron com logging configurado)
-- ============================================================================
-- SELECT cron.schedule(
--     'ops-cron-failure-monitor-5min',
--     '*/5 * * * *',
--     $$
--     INSERT INTO ops.cron_execution_history (job_name, status, run_at)
--     SELECT
--         jobid::TEXT,
--         CASE WHEN endtime IS NOT NULL THEN 'success' ELSE 'running' END,
--         starttime
--     FROM cron.job_run_details
--     WHERE starttime > now() - INTERVAL '10 minutes'
--     ON CONFLICT DO NOTHING;
--     $$
-- );
