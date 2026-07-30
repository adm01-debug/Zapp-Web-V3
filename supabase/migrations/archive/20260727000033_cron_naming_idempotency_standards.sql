-- ============================================================
-- Migration: 20260727000033_cron_naming_idempotency_standards
-- Objetivo: Padronizar nomes de cron jobs e garantir idempotência
-- Criado: 2026-07-27
--参阅: Step 33
-- ============================================================

-- ============================================================================
-- Regras de nomenclatura (documentação — não é DDL)
-- ============================================================================
-- Padrão: <schema>-<action>-<target>-<frequency>
-- Exemplos:
--   ops-vacuum-snapshots-daily
--   zapp-matview-refresh-all-5min
--   evo-backcompat-views-6h
--   email-cleanup-stale-weekly
--   wal-slot-monitor-continuous

-- Proibidos em nomes:
--   underscore "_" (usar hyphen "-")
--   espaços
--   pontuação especial
--   maiúsculas

-- ============================================================================
-- Função: verificar se um cron job é idempotente
-- ============================================================================
CREATE OR REPLACE FUNCTION ops.fn_check_cron_idempotency(p_job_name TEXT)
RETURNS TABLE(is_idempotent BOOLEAN, issues TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
DECLARE
    func_name TEXT;
BEGIN
    -- Extrair nome da function do comando cron
    func_name := regexp_replace(
        split_part(p_job_name, '-', 1) || '.' ||
        regexp_replace(p_job_name, '-', '_', 'g'),
        '[^a-zA-Z0-9_.]', '', 'g'
    );

    RETURN QUERY
    SELECT
        false AS is_idempotent,
        'Job name uses underscore instead of hyphen — violates naming standard' AS issues
    WHERE p_job_name ~ '_';

    -- Check 2: Function should handle concurrent runs
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname || '.' || p.proname = func_name
          AND NOT (
              p.prosrc ~ 'pg_try_advisory_lock'
              OR p.prosrc ~ 'SELECT.*FOR UPDATE'
              OR p.prosrc ~ 'pg_advisory_xact_lock'
          )
    ) THEN
        RETURN QUERY
        SELECT false, 'Function does not appear to use advisory locks or FOR UPDATE';
    END IF;
END;
$$;

-- ============================================================================
-- Migração de nomes (comentada — executar manualmente)
-- ============================================================================
-- -- Exemplo de rename de job:
-- UPDATE cron.job
-- SET jobname = 'ops-email-tracking-cleanup-weekly'
-- WHERE jobname = 'email-tracking-cleanup-weekly';
