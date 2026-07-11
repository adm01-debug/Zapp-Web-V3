-- Migration: 20260711_autovacuum_hotfix
-- Autor: Claude (validação exaustiva 2026-07-11)
-- Descricao: Correcao encontrada durante o teste exaustivo de validacao
-- Problema: evolution_instance_credentials e evolution_burnin_tracker acumulam
--   dead tuples rapidamente (cron evo-instance-health-check roda a cada 10min e
--   faz UPDATE). Com autovacuum padrao (threshold=50), nunca dispara em tabelas
--   com apenas 1 row.
-- Solucao: Configurar autovacuum agressivo: scale_factor=0, threshold=2.
--   Resultado: autovacuum dispara quando n_dead_tup > 0*n_live + 2 = 2
--   (praticamente apos cada 2 updates)

ALTER TABLE evo.evolution_instance_credentials
  SET (
    autovacuum_vacuum_scale_factor = 0,
    autovacuum_vacuum_threshold = 2,
    autovacuum_analyze_scale_factor = 0,
    autovacuum_analyze_threshold = 2
  );

ALTER TABLE evo.evolution_burnin_tracker
  SET (
    autovacuum_vacuum_scale_factor = 0,
    autovacuum_vacuum_threshold = 2,
    autovacuum_analyze_scale_factor = 0,
    autovacuum_analyze_threshold = 2
  );

-- Verificacao:
-- SELECT c.relname, u.option_name, u.option_value
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- CROSS JOIN LATERAL pg_options_to_table(c.reloptions) u
-- WHERE n.nspname = 'evo'
--   AND c.relname IN ('evolution_instance_credentials', 'evolution_burnin_tracker')
-- ORDER BY c.relname, u.option_name;
-- Resultado esperado: 8 rows (4 por tabela), scale_factor=0, threshold=2
