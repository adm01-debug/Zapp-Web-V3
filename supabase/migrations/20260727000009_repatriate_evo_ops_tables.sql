-- ============================================================
-- Migration: 20260727000009_repatriate_evo_ops_tables
-- Objetivo: Migrar tabelas de infraestrutura de evo para ops
-- Status: DOCUMENTAÇÃO — requer Evolution API container freeze
-- CRÍTICO: Congelar Evolution API ANTES de executar
--参阅: Step 9 do plano de 50 etapas
-- ============================================================

-- Tabelas a migrar de evo → ops (12 tabelas):
-- evo.vps_comments               → ops.vps_comments
-- evo.vps_diagnostic_runs         → ops.vps_diagnostic_runs
-- evo.vps_etapas                  → ops.vps_etapas
-- evo.vps_performance_snapshots   → ops.vps_performance_snapshots
-- evo.vps_scenario_status         → ops.vps_scenario_status
-- evo.vps_scenarios               → ops.vps_scenarios
-- evo.vps_status_history          → ops.vps_status_history
-- ops.runbooks                    → ops.runbooks          (já em ops)
-- ops.migration_watermark         → ops.migration_watermark
-- ops._secure_config              → ops._secure_config
-- ops.idx_usage_audit             → ops.idx_usage_audit
-- ops._snapshot_version_state     → ops._snapshot_version_state

-- VALIDAÇÃO PRÉ-MIGRAÇÃO
-- DO $$
-- BEGIN
--     -- Verificar se nenhuma tabela está em uso
--     IF EXISTS (
--         SELECT 1 FROM pg_stat_activity
--         WHERE datname = current_database()
--           AND pid != pg_backend_pid()
--           AND state != 'idle'
--           AND query NOT LIKE '%pg_stat%'
--     ) THEN
--         RAISE EXCEPTION 'BLOQUEIO: tabelas em uso — espere todas conexões terminarem';
--     END IF;
-- END;
-- $$;

-- PASSO 1: Criar tabelas em ops com estrutura idêntica
-- (executar CREATE TABLE AS SELECT de cada tabela evo)

-- PASSO 2: Adicionar RLS e políticas em cada tabela ops
-- ALTER TABLE ops.<table> ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "service_role_all" ON ops.<table> FOR ALL TO service_role USING (true);
-- CREATE POLICY "authenticated_select" ON ops.<table> FOR SELECT TO authenticated USING (true);

-- PASSO 3: Migrar dados
-- INSERT INTO ops.<table> SELECT * FROM evo.<table>;

-- PASSO 4: Criar view de compatibilidade em evo (manter retrocompatibilidade)
-- CREATE OR REPLACE VIEW evo.<table> AS SELECT * FROM ops.<table>;

-- PASSO 5: Funções que referenciam evo.<table> atualizar para ops.<table>
-- (identificar com: SELECT DISTINCT proname FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'evo' AND prosrc LIKE '%<table>%';)

-- PASSO 6: Cron jobs que usam evo.<table> atualizar para ops.<table>
-- (identificar com: SELECT * FROM cron.job WHERE connfn LIKE '%<table>%';)
