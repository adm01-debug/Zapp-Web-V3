-- ============================================================
-- Migration: 20260727000025_index_baseline_catalog
-- Objetivo: Criar infraestrutura de baseline e quarantine de índices
-- Criado: 2026-07-27
--参阅: Step 25
-- ============================================================

-- Tabela de snapshots de uso de índices (90 dias de retenção)
CREATE TABLE IF NOT EXISTS ops.index_usage_snapshots (
    id              BIGSERIAL PRIMARY KEY,
    snapshot_at     TIMESTAMPTZ DEFAULT now(),
    schemaname      TEXT,
    tablename       TEXT,
    indexname       TEXT,
    idx_scan        BIGINT,
    idx_tup_read    BIGINT,
    idx_tup_fetch   BIGINT,
    index_size      BIGINT
);

-- Tabela de quarantine de índices
CREATE TABLE IF NOT EXISTS ops.index_quarantine (
    id              BIGSERIAL PRIMARY KEY,
    schemaname      TEXT NOT NULL,
    tablename       TEXT NOT NULL,
    indexname       TEXT NOT NULL,
    quarantine_at    TIMESTAMPTZ DEFAULT now(),
    quarantine_ends  TIMESTAMPTZ GENERATED ALWAYS AS (quarantine_at + INTERVAL '30 days') STORED,
    reason          TEXT,
    drop_authorized_by TEXT,
    status          TEXT DEFAULT 'quarantined'
        CHECK (status IN ('quarantined','authorized','dropped')),
    UNIQUE(schemaname, tablename, indexname)
);

-- Função de snapshot diário (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION ops.fn_snapshot_index_usage()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
BEGIN
    INSERT INTO ops.index_usage_snapshots
        (schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch, index_size)
    SELECT
        schemaname, tablename, indexname,
        idx_scan, idx_tup_read, idx_tup_fetch,
        pg_relation_size(indexrelid)
    FROM pg_stat_user_indexes
    WHERE schemaname NOT IN ('pg_catalog','information_schema');

    -- Limitar retenção a 90 dias
    DELETE FROM ops.index_usage_snapshots
    WHERE snapshot_at < now() - INTERVAL '90 days';
END;
$$;

-- Visão de candidatos a quarantine (não usados nos últimos 30 dias)
CREATE OR REPLACE VIEW ops.v_index_quarantine_candidates AS
SELECT DISTINCT ON (s.tablename, s.indexname)
    s.schemaname,
    s.tablename,
    s.indexname,
    max(s.idx_scan) AS max_idx_scan,
    max(s.index_size) AS last_size,
    min(s.snapshot_at) AS first_seen
FROM ops.index_usage_snapshots s
GROUP BY s.schemaname, s.tablename, s.indexname
HAVING max(s.idx_scan) = 0
   AND s.schemaname NOT IN ('pg_catalog','information_schema','cron')
   AND NOT EXISTS (
       SELECT 1 FROM pg_constraints c
       WHERE c.conindid::regclass::text = s.schemaname || '.' || s.indexname
         AND c.contype IN ('p','u')
   )
   AND s.indexname NOT LIKE '%pkey%'
   AND s.indexname NOT LIKE '%_pkey'
ORDER BY s.tablename, s.indexname;

-- Registrar cron de snapshot diário
SELECT cron.schedule(
    'index-usage-daily-snapshot',
    '0 2 * * *',
    'SELECT ops.fn_snapshot_index_usage()'
);
