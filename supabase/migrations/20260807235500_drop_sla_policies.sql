-- AG-04 (ONDA 3): DROP de zapp.sla_policies — tabela 100% órfã
-- Varredura exaustiva de consumidores (2026-08-07) sem NENHUM match:
--   • pg_stat_statements (janela desde 06/08 22:35Z): 0 consultas além da auditoria
--   • pg_proc prosrc word-boundary (^|[^a-zA-Z_])sla_policies([^a-zA-Z_]|$): 0 funções
--   • triggers: apenas set_updated_at interno (cai com o DROP)
--   • cron.job.command: 0 jobs
--   • views/matviews: 0
--   • repo (src, functions, migrations): só types.ts e policies do squash canônico
--     (nenhuma migration cria a tabela → sem risco de recriação, cenário C3 descartado)
--   • n8n: 254 workflows, 0 referências em nodes (n8n usa PG14 próprio, n8n_queue)
--   • Metabase: MB_DB_HOST=postgres (PG14, não supabase); única data source = Sample DB H2
-- Tabela com 0 linhas; colunas sla_policy_id 100% NULL em queues e sla_violations
-- (0 linhas NOT NULL) → nada a migrar.
-- Snapshot de rollback (estrutura completa, pg_dump --schema-only):
--   .hermes/auditoria-supabase-20260806/onda3/onda3-04-sla-policies-rollback-snapshot.sql
-- NOTA: as colunas sla_policy_id em zapp.queues e zapp.sla_violations PERMANECEM
-- (sem dados — ficam NULL); índices idx_fk_queues_sla_policy_id / idx_slav_policy
-- ficam inertes sobre coluna sempre NULL.

ALTER TABLE zapp.queues DROP CONSTRAINT queues_sla_policy_id_fkey;
ALTER TABLE zapp.sla_violations DROP CONSTRAINT sla_violations_sla_policy_id_fkey;
DROP TABLE zapp.sla_policies;
