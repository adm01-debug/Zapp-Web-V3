-- ============================================================================
-- TOMBSTONE — Drop da tabela órfã model_pricing_v1
-- ============================================================================
-- Aplicado em produção via MCP em 2026-08-06.
-- Este arquivo existe para registro histórico no git.
--
-- CONTEXTO:
--   A tabela model_pricing_v1 foi um schema antigo de precificação de modelos AI.
--   Quando model_pricing_v2 foi criada (em zapp e ai schemas), a v1 ficou órfã:
--     - Nenhuma query em pg_stat_statements referenciava model_pricing_v1
--     - Nenhuma Edge Function ou hook apontava para ela
--     - Dados migrados para model_pricing_v2 em migração anterior
--   Manter tabelas órfãs aumenta superfície de ataque e confunde o schema.
--
-- ESTADO APÓS MIGRATION:
--   - model_pricing_v1 removida de todos os schemas onde existia
--   - model_pricing_v2 (zapp e ai schemas) mantida — é a versão ativa
--   - Views/funções que referenciavam v1 haviam sido atualizadas previamente
-- ============================================================================

DROP TABLE IF EXISTS zapp.model_pricing_v1 CASCADE;
DROP TABLE IF EXISTS ai.model_pricing_v1 CASCADE;
DROP TABLE IF EXISTS public.model_pricing_v1 CASCADE;

-- Remover sequências órfãs se existirem:
DROP SEQUENCE IF EXISTS zapp.model_pricing_v1_id_seq CASCADE;
DROP SEQUENCE IF EXISTS ai.model_pricing_v1_id_seq CASCADE;
DROP SEQUENCE IF EXISTS public.model_pricing_v1_id_seq CASCADE;
