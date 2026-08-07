-- =====================================================================
-- (incluído do merge com main — idempotente)
-- TOMBSTONE — Drop da extensão pgmq
-- ============================================================================
-- Aplicado em produção via MCP em 2026-08-06.
-- Este arquivo existe para registro histórico no git.
--
-- CONTEXTO:
--   A extensão pgmq (PostgreSQL Message Queue) foi instalada como experimento
--   para filas de mensagens assíncronas. A extensão nunca chegou a ser usada
--   em produção — nenhuma query em pg_stat_statements referenciava tabelas
--   pgmq.* e nenhuma Edge Function ou hook apontava para ela.
--
--   Auditoria confirmou:
--     - Extensão ausente em pg_extension (SELECT * FROM pg_extension WHERE extname='pgmq')
--     - Schema pgmq inexistente no banco
--     - Nenhuma referência no código-fonte (grep "pgmq" src/)
--
-- ESTADO APÓS MIGRATION:
--   - Extensão pgmq removida
--   - Schema pgmq (se existia) removido em cascata
-- ============================================================================

DROP EXTENSION IF EXISTS pgmq CASCADE;
=======
-- Item 58 da auditoria infra (AG-EX-01): pgmq sem uso
-- Verificacao previa: pg_depend sem dependencias externas (so membros internos da extensao),
-- 0 filas em pgmq.list_queues(), nenhuma referencia no repo (grep pgmq).
DROP EXTENSION IF EXISTS pgmq;
