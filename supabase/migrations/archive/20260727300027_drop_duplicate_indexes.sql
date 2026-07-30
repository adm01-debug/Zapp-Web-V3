-- Migration: 20260727300027_drop_duplicate_indexes
-- Purpose: Remove confirmed duplicate indexes (3 known cases).
--          Uses CONCURRENTLY to avoid table locks.
-- Risk: LOW — duplicate indexes are redundant by definition
-- Staging required: YES — verify index names in staging first (names may differ)
-- Note: CONCURRENTLY cannot run inside a transaction block.
--       Execute each DROP separately: psql -c "DROP INDEX CONCURRENTLY ..."

SET search_path = evo, financeiro, public, pg_catalog;

-- ============================================================
-- AUDIT: Confirm duplicates before dropping
-- ============================================================
/*
-- Find duplicate indexes (same table, same columns, same order):
SELECT
    n.nspname AS schema_name,
    t.relname AS table_name,
    string_agg(i.relname, ', ') AS dup_index_names,
    COUNT(*) AS dup_count,
    array_agg(pg_get_indexdef(ix.indexrelid)) AS definitions
FROM pg_index ix
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_class t ON t.oid = ix.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname IN ('evo','financeiro','zapp')
  AND NOT ix.indisprimary
GROUP BY n.nspname, t.relname, ix.indkey, ix.indoption
HAVING COUNT(*) > 1
ORDER BY n.nspname, t.relname;
*/

-- ============================================================
-- DROP DUPLICATE INDEXES
-- These must be run OUTSIDE a transaction (CONCURRENTLY requires it).
-- Use: psql -h <host> -U postgres -d <db> -c "DROP INDEX CONCURRENTLY evo.idx_..."
-- ============================================================

/*
-- Case 1: evo.contact_id_graveyard
-- Before dropping, confirm which is the duplicate:
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'contact_id_graveyard' AND schemaname = 'evo';
-- DROP INDEX CONCURRENTLY evo.idx_contact_id_graveyard_jid_dup;  -- replace with actual duplicate name

-- Case 2: financeiro.colaboradores
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'colaboradores' AND schemaname = 'financeiro';
-- DROP INDEX CONCURRENTLY financeiro.idx_colaboradores_email_dup;  -- replace with actual duplicate name

-- Case 3: financeiro.vendas_unificadas
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'vendas_unificadas' AND schemaname = 'financeiro';
-- DROP INDEX CONCURRENTLY financeiro.idx_vendas_unificadas_data_dup;  -- replace with actual duplicate name
*/

-- ============================================================
-- Register in quarantine log (document as dropped)
-- ============================================================
/*
INSERT INTO ops.index_quarantine
    (schema_name, table_name, index_name, quarantine_reason, drop_approved, drop_approved_by, drop_approved_at, dropped_at)
VALUES
    ('evo', 'contact_id_graveyard', 'REPLACE_WITH_ACTUAL_NAME',
     'Duplicate index — same columns as primary index', true, 'migration_20260727300027', now(), now()),
    ('financeiro', 'colaboradores', 'REPLACE_WITH_ACTUAL_NAME',
     'Duplicate index — same columns as existing index', true, 'migration_20260727300027', now(), now()),
    ('financeiro', 'vendas_unificadas', 'REPLACE_WITH_ACTUAL_NAME',
     'Duplicate index — same columns as existing index', true, 'migration_20260727300027', now(), now())
ON CONFLICT (index_name) DO NOTHING;
*/

-- ============================================================
-- VERIFICATION (run after drops)
-- ============================================================
/*
-- Confirm no more duplicates:
SELECT n.nspname, t.relname, COUNT(*) AS idx_count
FROM pg_index ix
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_class t ON t.oid = ix.indrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname IN ('evo','financeiro')
  AND NOT ix.indisprimary
GROUP BY n.nspname, t.relname, ix.indkey
HAVING COUNT(*) > 1;
-- Should return 0 rows
*/

SELECT 'Migration 20260727300027 loaded. '
       'Duplicate index drops documented. '
       'Execute DROP INDEX CONCURRENTLY statements manually (outside transaction). '
       'Confirm index names with audit query first.' AS status;
