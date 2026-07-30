-- Migration: 20260727300028_missing_index_fixes
-- Purpose: Create confirmed missing indexes for hot query paths.
--          All identified via seq scan analysis + index_advisor on 2026-07-27.
-- Risk: LOW — CONCURRENTLY avoids table locks; additive only
-- Note: CONCURRENTLY cannot run inside a transaction block.
--       Each CREATE INDEX must run separately:
--       psql -h <host> -U postgres -d <db> -c "CREATE INDEX CONCURRENTLY ..."
-- Staging required: YES — validate execution plan improvement before prod

SET search_path = zapp, evo, public, pg_catalog;

-- ============================================================
-- AUDIT QUERIES (run first to confirm need)
-- ============================================================
/*
-- 1. Find seq scans on hot tables:
SELECT schemaname, relname, seq_scan, idx_scan, n_live_tup
FROM pg_stat_user_tables
WHERE schemaname IN ('zapp','evo','financeiro','email_app')
  AND seq_scan > 100
ORDER BY seq_scan DESC
LIMIT 20;

-- 2. Run index_advisor for specific queries (if extension installed):
SELECT * FROM index_advisor('
  SELECT * FROM zapp.contatos
  WHERE workspace_id = $1 AND nome ILIKE ''%acme%''
  LIMIT 20
');
*/

-- ============================================================
-- MISSING INDEX 1: zapp.contatos — trigram search (workspace + nome)
-- Pattern: WHERE workspace_id = $1 AND nome ILIKE '%term%'
-- ============================================================
/*
-- Requires pg_trgm extension (already in public schema as 'pg_trgm')
-- Confirm: SELECT installed_version FROM pg_available_extensions WHERE name = 'pg_trgm';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contatos_workspace_nome_trgm
    ON zapp.contatos
    USING GIN (workspace_id, nome gin_trgm_ops);

-- If GIN composite not supported, use two separate indexes:
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contatos_workspace_id
--     ON zapp.contatos (workspace_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contatos_nome_trgm
--     ON zapp.contatos USING GIN (nome gin_trgm_ops);
*/

-- ============================================================
-- MISSING INDEX 2: zapp.empresas — trigram search (workspace + razao_social)
-- Pattern: WHERE workspace_id = $1 AND razao_social ILIKE '%term%'
-- ============================================================
/*
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_empresas_workspace_razao_trgm
    ON zapp.empresas
    USING GIN (razao_social gin_trgm_ops)
    WHERE workspace_id IS NOT NULL;

-- Or composite btree for equality + trigram:
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_empresas_workspace_id
--     ON zapp.empresas (workspace_id)
--     WHERE workspace_id IS NOT NULL;
*/

-- ============================================================
-- MISSING INDEX 3: evo.evolution_contacts — cursor pagination
-- Pattern: WHERE remote_jid > $cursor ORDER BY remote_jid, updated_at DESC
-- ============================================================
/*
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_evolution_contacts_jid_updated
    ON evo.evolution_contacts (remote_jid, updated_at DESC);
*/

-- ============================================================
-- MISSING INDEX 4: zapp.failed_messages — cursor pagination
-- Pattern: WHERE workspace_id = $1 AND created_at < $cursor ORDER BY created_at DESC
-- ============================================================
/*
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_failed_messages_workspace_created
    ON zapp.failed_messages (workspace_id, created_at DESC);
*/

-- ============================================================
-- MISSING INDEX 5: zapp.dispatch_error_logs — cursor pagination
-- Pattern: WHERE workspace_id = $1 AND occurred_at < $cursor ORDER BY occurred_at DESC
-- ============================================================
/*
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dispatch_error_logs_workspace_occurred
    ON zapp.dispatch_error_logs (workspace_id, occurred_at DESC);
*/

-- ============================================================
-- REGISTER CANDIDATES IN OPS CATALOG
-- ============================================================
CREATE TABLE IF NOT EXISTS ops.index_missing_candidates (
    id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    schema_name     text        NOT NULL,
    table_name      text        NOT NULL,
    index_name      text        NOT NULL UNIQUE,
    index_def       text        NOT NULL,
    query_pattern   text,
    priority        text        NOT NULL DEFAULT 'medium'
                    CHECK (priority IN ('critical','high','medium','low')),
    status          text        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','created','skipped','deferred')),
    identified_at   timestamptz NOT NULL DEFAULT now(),
    created_at      timestamptz,
    notes           text
);

COMMENT ON TABLE ops.index_missing_candidates IS
    'Catalog of identified missing indexes with their creation status. '
    'Created by etapa 28 (2026-07-27). Indexes are CONCURRENTLY — run outside transaction.';

ALTER TABLE ops.index_missing_candidates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ops.index_missing_candidates FROM PUBLIC, anon;
GRANT SELECT ON ops.index_missing_candidates TO authenticated;
GRANT ALL    ON ops.index_missing_candidates TO service_role;

INSERT INTO ops.index_missing_candidates
    (schema_name, table_name, index_name, index_def, query_pattern, priority, status)
VALUES
    ('zapp', 'contatos', 'idx_contatos_workspace_nome_trgm',
     'CREATE INDEX CONCURRENTLY idx_contatos_workspace_nome_trgm ON zapp.contatos USING GIN (nome gin_trgm_ops)',
     'WHERE workspace_id = $1 AND nome ILIKE ''%term%'' LIMIT 20',
     'high', 'pending'),

    ('zapp', 'empresas', 'idx_empresas_workspace_razao_trgm',
     'CREATE INDEX CONCURRENTLY idx_empresas_workspace_razao_trgm ON zapp.empresas USING GIN (razao_social gin_trgm_ops)',
     'WHERE workspace_id = $1 AND razao_social ILIKE ''%term%'' LIMIT 20',
     'high', 'pending'),

    ('evo', 'evolution_contacts', 'idx_evolution_contacts_jid_updated',
     'CREATE INDEX CONCURRENTLY idx_evolution_contacts_jid_updated ON evo.evolution_contacts (remote_jid, updated_at DESC)',
     'cursor pagination: WHERE remote_jid > $cursor ORDER BY remote_jid ASC',
     'medium', 'pending'),

    ('zapp', 'failed_messages', 'idx_failed_messages_workspace_created',
     'CREATE INDEX CONCURRENTLY idx_failed_messages_workspace_created ON zapp.failed_messages (workspace_id, created_at DESC)',
     'cursor pagination: WHERE workspace_id=$1 AND created_at < $cursor ORDER BY created_at DESC',
     'medium', 'pending'),

    ('zapp', 'dispatch_error_logs', 'idx_dispatch_error_logs_workspace_occurred',
     'CREATE INDEX CONCURRENTLY idx_dispatch_error_logs_workspace_occurred ON zapp.dispatch_error_logs (workspace_id, occurred_at DESC)',
     'cursor pagination: WHERE workspace_id=$1 AND occurred_at < $cursor ORDER BY occurred_at DESC',
     'medium', 'pending')

ON CONFLICT (index_name) DO NOTHING;

SELECT 'Migration 20260727300028 complete. '
       '5 missing index candidates registered in ops.index_missing_candidates. '
       'Run CREATE INDEX CONCURRENTLY statements manually (outside transaction). '
       'Update status to ''created'' after each index is successfully built.' AS status;
