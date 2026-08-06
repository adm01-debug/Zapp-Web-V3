-- =====================================================================
-- (incluído do merge com main — idempotente)
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
=======
-- Item 55 da auditoria infra (AG-EX-01): ai.model_pricing (v1) vs ai.model_pricing_v2 (ambas vazias)
-- Verificacao previa: v2 usada por zapp.model_pricing_v2, zapp.v_model_catalog, zapp.estimate_cost e
-- zapp.find_cheapest_model; v1 so tinha a view orfa zapp.model_pricing (nenhum consumidor no repo: grep src/).
-- Decisao: manter v2, dropar v1 + view orfa. Outras tabelas _v2 (evolution_webhook_events_v2_*) sao particoes legitimas — mantidas.
DROP VIEW IF EXISTS zapp.model_pricing;
DROP TABLE IF EXISTS ai.model_pricing;
