-- ============================================================================
-- TOMBSTONE — Drop de índices tsvector não utilizados
-- ============================================================================
-- Aplicado em produção via MCP em 2026-08-06.
-- Este arquivo existe para registro histórico no git.
--
-- CONTEXTO:
--   Auditoria de índices (item do checklist de auditoria) identificou múltiplos
--   índices GIN/TSVECTOR em tabelas zapp com zero scans (pg_stat_user_indexes).
--   O único índice tsvector mantido é:
--     CREATE INDEX idx_qr_search ON zapp.quick_replies USING gin (
--       to_tsvector('portuguese', title || ' ' || content)
--     )
--   pois é ativamente usado pela feature de busca de respostas rápidas.
--
-- ÍNDICES REMOVIDOS:
--   Os índices abaixo foram identificados com idx_scan=0 e não referenciados
--   por nenhuma query via pg_stat_statements.
-- ============================================================================

-- Índices tsvector removidos (IF EXISTS garante idempotência):
DROP INDEX IF EXISTS zapp.idx_empresas_search;
DROP INDEX IF EXISTS zapp.idx_empresas_tsvector;
DROP INDEX IF EXISTS zapp.idx_contatos_search;
DROP INDEX IF EXISTS zapp.idx_contatos_tsvector;
DROP INDEX IF EXISTS zapp.idx_contatos_nome_search;
DROP INDEX IF EXISTS zapp.idx_audit_logs_tsvector;
DROP INDEX IF EXISTS zapp.idx_messages_tsvector;
DROP INDEX IF EXISTS zapp.idx_app_notifications_tsvector;
DROP INDEX IF EXISTS zapp.idx_companies_full_text;
DROP INDEX IF EXISTS zapp.idx_contacts_full_text;
DROP INDEX IF EXISTS zapp.idx_whatsapp_messages_search;
DROP INDEX IF EXISTS evo.idx_evo_messages_tsvector;
DROP INDEX IF EXISTS evo.idx_evo_contacts_tsvector;
DROP INDEX IF EXISTS public.idx_contacts_fts;
DROP INDEX IF EXISTS public.idx_companies_fts;
