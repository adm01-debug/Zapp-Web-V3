-- ============================================================
-- Migration: 20260727000029_vacuum_autovacuum_policy
-- Objetivo: Documentar e configurar políticas de VACUUM/autovacuum
-- Criado: 2026-07-27
--参阅: Step 29
-- ============================================================

-- ============================================================================
-- Tabela de configuração de VACUUM por tabela
-- ============================================================================
CREATE TABLE IF NOT EXISTS ops.vacuum_policy (
    schemaname        TEXT NOT NULL,
    tablename         TEXT NOT NULL,
    autovacuum_enabled BOOLEAN DEFAULT true,
    autovacuum_vacuum_scale_factor  REAL DEFAULT 0.1,   -- 10% de dead tuples
    autovacuum_vacuum_threshold     INTEGER DEFAULT 50,   -- min 50 dead tuples
    autovacuum_analyze_scale_factor REAL DEFAULT 0.05,   -- 5% de modified rows
    autovacuum_analyze_threshold    INTEGER DEFAULT 50,
    autovacuum_vacuum_cost_delay   INTEGER DEFAULT 2,     -- ms
    vacuum_enabled      BOOLEAN DEFAULT true,
    vacuum_scale_factor REAL DEFAULT 0.2,
    notes              TEXT,
    PRIMARY KEY (schemaname, tablename)
);

-- ============================================================================
-- Tabelas críticas que precisam de autovacuum tuning
-- ============================================================================
INSERT INTO ops.vacuum_policy (schemaname, tablename, autovacuum_enabled, autovacuum_vacuum_scale_factor, autovacuum_vacuum_threshold, notes)
VALUES
    -- Particionadas (alta taxa de DELETE/UPDATE)
    ('evo', 'evolution_messages',        true,  0.05, 1000, 'Alta rotatividade — 25 partições'),
    ('evo', 'evolution_conversations',   true,  0.05, 500,  'Alta rotatividade — 25 partições'),
    ('evo', 'evolution_webhook_events_v2', true, 0.05, 1000,'Alta rotatividade — 25 partições'),
    -- Tables com Muitos UPDATE
    ('zapp', 'messages',               true,  0.05, 500,  'Updates frequentes de status'),
    ('zapp', 'contatos',               true,  0.1,  200,  'Updates de aktivitas'),
    ('zapp', 'tickets',                true,  0.1,  100,  'Alta rotatividade de status'),
    -- Tables audit/log
    ('ops',  'ddl_violations_live',    true,  0.2,  100,  'Alta inserts, deletes ocasionais'),
    ('ops',  'index_usage_snapshots',  true,  0.3,  500,  'Bulk inserts diarios, deletes de 90d')
ON CONFLICT (schemaname, tablename) DO NOTHING;

-- ============================================================================
-- Função para aplicar políticas (executar via psql como superuser)
-- ============================================================================
CREATE OR REPLACE FUNCTION ops.fn_apply_vacuum_policies(dry_run BOOLEAN DEFAULT true)
RETURNS TABLE(schemaname TEXT, tablename TEXT, sql_cmd TEXT, success BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ops, pg_catalog
AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT v.schemaname, v.tablename, v.autovacuum_vacuum_scale_factor,
               v.autovacuum_vacuum_threshold, v.autovacuum_enabled
        FROM ops.vacuum_policy v
    LOOP
        IF dry_run THEN
            RETURN QUERY SELECT
                r.schemaname, r.tablename,
                format(
                    'ALTER TABLE %I.%I SET (autovacuum_vacuum_scale_factor = %s, autovacuum_vacuum_threshold = %s)',
                    r.schemaname, r.tablename,
                    r.autovacuum_vacuum_scale_factor, r.autovacuum_vacuum_threshold
                ) AS sql_cmd,
                false AS success;
        ELSE
            BEGIN
                EXECUTE format(
                    'ALTER TABLE %I.%I SET (autovacuum_vacuum_scale_factor = %s, autovacuum_vacuum_threshold = %s)',
                    r.schemaname, r.tablename,
                    r.autovacuum_vacuum_scale_factor, r.autovacuum_vacuum_threshold
                );
                RETURN QUERY SELECT r.schemaname, r.tablename,
                    'Applied'::TEXT AS sql_cmd, true AS success;
            EXCEPTION WHEN OTHERS THEN
                RETURN QUERY SELECT r.schemaname, r.tablename,
                    sqlerrm::TEXT AS sql_cmd, false AS success;
            END;
        END IF;
    END LOOP;
END;
$$;

COMMENT ON FUNCTION ops.fn_apply_vacuum_policies(BOOLEAN) IS
'Executar com dry_run=true primeiro. Depois dry_run=false para aplicar. Executar fora de transacao active.';
