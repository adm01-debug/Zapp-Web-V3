-- ============================================================
-- Migration: 20260727000031_slow_query_sla
-- Objetivo: Definir SLA de queries lentas e monitoramento
-- Criado: 2026-07-27
--参阅: Step 31
-- ============================================================

-- ============================================================================
-- Tabela de configuração de thresholds de SLA
-- ============================================================================
CREATE TABLE IF NOT EXISTS ops.query_sla_thresholds (
    query_class      TEXT PRIMARY KEY,
    threshold_ms     INTEGER NOT NULL,
    description     TEXT,
    escalation_level TEXT DEFAULT 'warning'
        CHECK (escalation_level IN ('info','warning','critical'))
);

INSERT INTO ops.query_sla_thresholds (query_class, threshold_ms, description, escalation_level)
VALUES
    ('api_read',            200, 'Queries de leitura via PostgREST', 'warning'),
    ('api_write',           500, 'Mutations via PostgREST',           'warning'),
    ('cron_job',           3000, 'Execução completa de cron job',     'warning'),
    ('matview_refresh',   60000, 'Refresh de materialized view',      'info'),
    ('migration',         300000, 'Execução de migration DDL',         'critical'),
    ('realtime_sync',      1000, 'Sincronização de Realtime events',  'warning'),
    ('export_csv',        120000, 'Exportação de dados em CSV',        'info')
ON CONFLICT (query_class) DO NOTHING;

-- ============================================================================
-- Visão de queries lentas atuais (pg_stat_statements)
-- ============================================================================
CREATE OR REPLACE VIEW ops.v_slow_queries AS
SELECT
    LEFT(query, 200)      AS query_preview,
    calls,
    total_exec_time_ms     AS total_ms,
    mean_exec_time_ms      AS mean_ms,
    max_exec_time_ms       AS max_ms,
    rows,
    CASE
        WHEN mean_exec_time_ms > 5000  THEN 'critical'
        WHEN mean_exec_time_ms > 1000  THEN 'warning'
        WHEN mean_exec_time_ms > 200   THEN 'info'
        ELSE 'ok'
    END AS status
FROM (
    SELECT
        query,
        calls,
        (total_exec_time / 1000)::BIGINT       AS total_exec_time_ms,
        (mean_exec_time)::BIGINT               AS mean_exec_time_ms,
        (max_exec_time)::BIGINT                AS max_exec_time_ms,
        returns
    FROM pg_stat_statements
    WHERE calls > 10
      AND NOT query LIKE '%pg_stat_statements%'
    ORDER BY mean_exec_time DESC
    LIMIT 50
) q;

-- ============================================================================
-- Função CI: verificar se há queries acima do SLA crítico
-- ============================================================================
CREATE OR REPLACE FUNCTION ops.fn_ci_check_query_sla()
RETURNS TABLE(status TEXT, query_class TEXT, current_mean_ms INTEGER, threshold_ms INTEGER, issue TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
BEGIN
    RETURN QUERY
    SELECT
        'WARNING'::TEXT,
        'api_read'::TEXT,
        coalesce(max(mean_exec_time_ms), 0)::INTEGER,
        t.threshold_ms,
        'API read queries acima do SLA' AS issue
    FROM pg_stat_statements p
    CROSS JOIN ops.query_sla_thresholds t
    WHERE t.query_class = 'api_read'
      AND p.calls > 10
      AND (p.mean_exec_time / 1000)::BIGINT > t.threshold_ms;
END;
$$;

COMMENT ON VIEW ops.v_slow_queries IS 'Top 50 queries por tempo médio — ordenadas por mean_exec_time DESC';
COMMENT ON TABLE ops.query_sla_thresholds IS 'SLAs de tempo de execução por classe de query';
