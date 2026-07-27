-- ============================================================
-- Migration: 20260727000008_move_extensions_to_extensions_schema
-- Objetivo: Documentar migração de extensões de public para extensions
-- Status: HIGH RISK — DEFERIDO — NÃO EXECUTAR EM PRODUÇÃO
--参阅: ADR-DB-003
-- ============================================================

-- ⚠️ ESTA MIGRAÇÃO É APENAS DOCUMENTACÃO
-- ⚠️ NÃO EXECUTAR SEM ANTES VALIDAR EM STAGING COMPLETO

-- Extensões atualmente em public (consulta):
-- SELECT extname, extnamespace::regnamespace FROM pg_extension
-- WHERE extnamespace::regnamespace = 'public'::regnamespace;

-- As 9 extensões identificadas:
-- pg_trgm, vector, unaccent, pgjwt, uuid-ossp,
-- pg_stat_statements, pg_net, pg_cron, hypopg

-- Abordagem segura (DEFERIDA para fase 2):
-- 1. Criar schema extensions
-- 2. Mover extensões uma a uma com Validação em cada passo
-- 3. Atualizar search_path em todas as roles
-- 4. Testar todos os clientes PostgREST
-- 5. Verificar Supabase Auth (depende de uuid-ossp)
-- 6. Verificar Realtime (depende de pg_cron internamente)
-- 7. Backup completo antes de cada passo

-- Cronograma: após todas as outras melhorias (fase 2+)
