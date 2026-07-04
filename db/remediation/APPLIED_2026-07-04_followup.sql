-- ============================================================================
-- APLICADO EM PRODUÇÃO — 2026-07-04 (sessão 2 da auditoria Evolution API)
-- Alvo: PostgreSQL 14 do stack `postgres` (host do db `evolution` + `n8n_queue`)
-- Executado como superuser `postgres` via exec no container, com pg_reload_conf
-- (sem restart do banco). Registro idempotente + reversão abaixo.
-- Contexto completo: docs/EVOLUTION_API_AUDIT_2026-07-04_followup.md §2
-- ============================================================================

-- PROBLEMA: log_statement=mod logava todo INSERT/UPDATE/DELETE com parâmetros:
--   * conteúdo integral de mensagens WhatsApp em texto puro nos logs Docker;
--   * segredos serializados em workflows n8n (JWT service_role, API key Evolution);
--   * I/O de log proporcional ao tráfego de mensagens.
-- 'ddl' preserva auditoria de mudanças de schema; queries lentas continuam
-- visíveis via log_min_duration_statement=5000 (inalterado).

ALTER SYSTEM SET log_statement = 'ddl';
SELECT pg_reload_conf();

-- Verificação (executada; resultado: log_statement=ddl):
-- SELECT name, setting FROM pg_settings
--  WHERE name IN ('log_statement','log_min_duration_statement');

-- ============================================================================
-- REVERSÃO (se necessário voltar ao comportamento anterior):
-- ALTER SYSTEM SET log_statement = 'mod';
-- SELECT pg_reload_conf();
-- (ou ALTER SYSTEM RESET log_statement; para voltar ao default 'none')
-- ============================================================================

-- ----------------------------------------------------------------------------
-- NÃO-SQL, registrado aqui pela rastreabilidade (mesma sessão):
-- * Hot-fix da Edge Function `evolution-webhook` (422/contract_violation):
--   arquivo /root/supabase/docker/volumes/functions/_shared/webhook-schemas.ts
--   substituído pela versão deste commit (apikey/sender -> z.string().nullish());
--   backup em webhook-schemas.ts.bak.20260704-422fix; serviço supabase_functions
--   reiniciado. Verificado: connection.update orgânicos processados às
--   00:03:53 / 00:05:53 / 00:06:15 UTC de 2026-07-04.
-- ----------------------------------------------------------------------------
