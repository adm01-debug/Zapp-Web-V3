-- Migration: 20260727300025_index_baseline_catalog
-- Purpose: Create infrastructure to track index usage over time.
--          This enables the 30-day quarantine window before dropping unused indexes.
-- Risk: LOW — additive only

SET search_path = ops, public, pg_catalog;

-- ============================================================
-- Create index usage snapshot table
-- ============================================================
CREATE TABLE IF NOT EXISTS ops.index_usage_snapshots (
    id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    snapshotted_at  timestamptz NOT NULL DEFAULT now(),
    schema_name     text        NOT NULL,
    table_name      text        NOT NULL,
    index_name      text        NOT NULL,
    idx_scan        bigint      NOT NULL DEFAULT 0,
    idx_tup_read    bigint      NOT NULL DEFAULT 0,
    idx_tup_fetch   bigint      NOT NULL DEFAULT 0,
    index_size_bytes bigint     NOT NULL DEFAULT 0,
    is_unique       boolean     NOT NULL DEFAULT false,
    is_primary      boolean     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_index_snapshots_idx_name
    ON ops.index_usage_snapshots (index_name, snapshotted_at DESC);

COMMENT ON TABLE ops.index_usage_snapshots IS
    'Daily snapshots of pg_stat_user_indexes for 30-day quarantine tracking. '
    'Populated by cron: ops.fn_snapshot_index_usage() (etapa 25). '
    'Retention: 90 days.';

ALTER TABLE ops.index_usage_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ops.index_usage_snapshots FROM PUBLIC, anon;
GRANT SELECT ON ops.index_usage_snapshots TO authenticated;
GRANT ALL    ON ops.index_usage_snapshots TO service_role;

-- ============================================================
-- Create index quarantine table
-- ============================================================
CREATE TABLE IF NOT EXISTS ops.index_quarantine (
    id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    schema_name     text        NOT NULL,
    table_name      text        NOT NULL,
    index_name      text        NOT NULL UNIQUE,
    quarantined_at  timestamptz NOT NULL DEFAULT now(),
    quarantine_ends timestamptz NOT NULL GENERATED ALWAYS AS (quarantined_at + INTERVAL '30 days') STORED,
    quarantine_reason text,
    drop_approved   boolean     NOT NULL DEFAULT false,
    drop_approved_by text,
    drop_approved_at timestamptz,
    dropped_at      timestamptz,
    notes           text
);

COMMENT ON TABLE ops.index_quarantine IS
    'Index quarantine log. Indexes here are candidates for DROP after 30-day observation period. '
    'drop_approved must be true before executing DROP INDEX CONCURRENTLY. '
    'Created: etapa 25 (2026-07-27).';

ALTER TABLE ops.index_quarantine ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ops.index_quarantine FROM PUBLIC, anon;
GRANT SELECT ON ops.index_quarantine TO authenticated;
GRANT ALL    ON ops.index_quarantine TO service_role;

CREATE POLICY "authenticated can view index quarantine"
    ON ops.index_quarantine FOR SELECT TO authenticated USING (true);

-- ============================================================
-- Function: Take daily snapshot of index usage
-- ============================================================
CREATE OR REPLACE FUNCTION ops.fn_snapshot_index_usage()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
BEGIN
    INSERT INTO ops.index_usage_snapshots
        (schema_name, table_name, index_name, idx_scan, idx_tup_read, idx_tup_fetch,
         index_size_bytes, is_unique, is_primary)
    SELECT
        s.schemaname,
        s.relname,
        s.indexrelname,
        s.idx_scan,
        s.idx_tup_read,
        s.idx_tup_fetch,
        pg_relation_size(s.indexrelid),
        ix.indisunique,
        ix.indisprimary
    FROM pg_stat_user_indexes s
    JOIN pg_index ix ON ix.indexrelid = s.indexrelid
    WHERE s.schemaname IN ('zapp','evo','ops','bpm','email_app','ai','financeiro','vendas','logistica','artes');

    -- Purge old snapshots (>90 days)
    DELETE FROM ops.index_usage_snapshots
    WHERE snapshotted_at < now() - INTERVAL '90 days';

    RAISE NOTICE '✓ Index usage snapshot taken (% rows).', (SELECT COUNT(*) FROM ops.index_usage_snapshots WHERE snapshotted_at > now() - INTERVAL '1 hour');
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.fn_snapshot_index_usage() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.fn_snapshot_index_usage() TO service_role;

-- ============================================================
-- View: Indexes safe for quarantine (non-PK, non-UNIQUE, idx_scan=0)
-- ============================================================
CREATE OR REPLACE VIEW ops.v_index_quarantine_candidates
WITH (security_invoker = on) AS
SELECT
    s.schemaname,
    s.relname   AS table_name,
    s.indexrelname AS index_name,
    s.idx_scan,
    pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size,
    ix.indisunique  AS is_unique,
    ix.indisprimary AS is_primary,
    CASE WHEN q.index_name IS NOT NULL THEN 'IN QUARANTINE' ELSE 'CANDIDATE' END AS status
FROM pg_stat_user_indexes s
JOIN pg_index ix ON ix.indexrelid = s.indexrelid
LEFT JOIN ops.index_quarantine q ON q.index_name = s.indexrelname AND q.schema_name = s.schemaname
WHERE s.schemaname IN ('zapp','evo','financeiro','email_app')
  AND s.idx_scan = 0
  AND NOT ix.indisunique
  AND NOT ix.indisprimary
ORDER BY pg_relation_size(s.indexrelid) DESC;

-- ============================================================
-- Register cron job for daily snapshot
-- ============================================================
SELECT cron.schedule(
    'index-usage-daily-snapshot',
    '0 2 * * *',  -- daily at 02:00 UTC
    'SELECT ops.fn_snapshot_index_usage()'
) WHERE NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'index-usage-daily-snapshot'
);

SELECT 'Migration 20260727300025 complete. '
       'ops.index_usage_snapshots and ops.index_quarantine created. '
       'ops.fn_snapshot_index_usage() registered as daily cron at 02:00 UTC.' AS status;
