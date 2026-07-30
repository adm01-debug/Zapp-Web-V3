-- ============================================================================
-- Cleanup de objetos legados vazios (E6-08)
-- Auditoria 2026-07-10
--
-- evolution_pipeline_health_log_legacy (evo schema): tabela legada com 0 linhas.
-- public.evolution_pipeline_health_log_legacy: view passthrough sem dependentes.
-- Verificado via pg_depend: nenhuma FK, função ou view externa depende destes.
-- Aplicado ao vivo via MCP em 2026-07-10 e confirmado (0 objetos restantes).
-- Idempotente: DROP IF EXISTS.
-- ============================================================================

-- View pública passthrough deve ser dropada antes da tabela base
DROP VIEW IF EXISTS public.evolution_pipeline_health_log_legacy;

-- Tabela legada vazia (0 linhas desde criação)
DROP TABLE IF EXISTS evo.evolution_pipeline_health_log_legacy;
