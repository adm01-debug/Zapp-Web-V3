-- ============================================================
-- Migration: 20260727000032_cron_canonical_register
-- Objetivo: Registrar cron jobs canonical e expandir CRONS.md
-- Criado: 2026-07-27
--参阅: Step 32
-- ============================================================

-- ============================================================================
-- Tabela de registro canônico de cron jobs
-- ============================================================================
CREATE TABLE IF NOT EXISTS ops.cron_canonical_register (
    job_id          INTEGER PRIMARY KEY,    -- jobid from cron.job
    job_name        TEXT NOT NULL UNIQUE,
    job_group       TEXT,                   -- 'maintenance', 'integration', 'cleanup'
    target_schema   TEXT,
    target_function TEXT,
    schedule        TEXT,                   -- cron expression
    is_active       BOOLEAN DEFAULT true,
    is_idempotent   BOOLEAN DEFAULT false,
    max_runtime_sec INTEGER DEFAULT 3600,   -- alert if longer
    owner_team      TEXT,                   -- 'dba', 'dev', 'infra'
    description     TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Seed dos cron jobs identificados (preencher job_id após consultar cron.job)
-- job_id deve ser preenchido via:
-- SELECT jobid, jobname FROM cron.job ORDER BY jobid;

-- ============================================================================
-- Função: sincronizar registro com cron.job real
-- ============================================================================
CREATE OR REPLACE FUNCTION ops.fn_sync_cron_register()
RETURNS TABLE(jobid INTEGER, jobname TEXT, status TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
BEGIN
    RETURN QUERY
    SELECT
        j.jobid,
        j.jobname,
        CASE
            WHEN r.job_name IS NULL THEN 'NEW: not registered'
            WHEN r.is_active != j.active THEN 'DRIFT: active mismatch'
            ELSE 'OK'
        END AS status
    FROM cron.job j
    LEFT JOIN ops.cron_canonical_register r ON r.job_name = j.jobname
    ORDER BY j.jobid;
END;
$$;

-- ============================================================================
-- Visão consolidada: status de todos os cron jobs
-- ============================================================================
CREATE OR REPLACE VIEW ops.v_cron_status AS
SELECT
    j.jobid,
    j.jobname,
    j.schedule,
    j.active,
    r.job_group,
    r.owner_team,
    r.is_idempotent,
    r.max_runtime_sec,
    r.description,
    CASE
        WHEN r.job_name IS NULL THEN 'UNREGISTERED'
        WHEN NOT j.active THEN 'DISABLED'
        WHEN r.is_idempotent = false THEN '⚠️ NON-IDEMPOTENT'
        ELSE 'OK'
    END AS health_status
FROM cron.job j
LEFT JOIN ops.cron_canonical_register r ON r.job_name = j.jobname
ORDER BY j.jobid;
