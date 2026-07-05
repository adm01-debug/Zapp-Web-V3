-- ============================================================================
-- APLICADO EM PRODUÇÃO — 2026-07-05 (sessão 6 da auditoria Evolution API)
-- Alvo: PostgreSQL 14 do stack `postgres` (host do db `evolution`, container
-- postgres_postgres), banco `evolution` (schema `public`, Prisma da Evolution API).
-- Executado como superuser `postgres` via exec no container.
-- Contexto completo: docs/EVOLUTION_API_AUDIT_2026-07-05_sessao6.md
-- ============================================================================

-- PROBLEMA 1: 4 índices FK ausentes nas tabelas de integração (N8n, OpenaiBot,
-- IntegrationSession) — só tinham índice na PK, forçando seq scan em qualquer
-- lookup/cascade por instanceId/openaiCredsId. Baixo impacto hoje (tabelas
-- pequenas), mas cresce com o uso de bots. CONCURRENTLY evita lock.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_n8n_instanceid ON "N8n"("instanceId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_openaibot_instanceid ON "OpenaiBot"("instanceId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_openaibot_openaicredsid ON "OpenaiBot"("openaiCredsId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_integrationsession_instanceid ON "IntegrationSession"("instanceId");

-- Verificação (executada; resultado: 4x "CREATE INDEX", exitCode=0):
-- SELECT indexname FROM pg_indexes WHERE indexname LIKE 'idx_n8n_%'
--   OR indexname LIKE 'idx_openaibot_%' OR indexname LIKE 'idx_integrationsession_%';

-- REVERSÃO:
-- DROP INDEX CONCURRENTLY IF EXISTS idx_n8n_instanceid;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_openaibot_instanceid;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_openaibot_openaicredsid;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_integrationsession_instanceid;

-- ----------------------------------------------------------------------------

-- PROBLEMA 2: effective_cache_size=6GB configurado acima do limite real de
-- memória do container (resources.limits.memory=5GB no stack `postgres`,
-- compartilhado por 6 bancos: evolution/n8n_queue/dify/flowise/typebot/nocodb).
-- Isso enviesa o planner a assumir mais cache do que existe de fato. Parâmetro
-- é reload-context (não precisa restart).

ALTER SYSTEM SET effective_cache_size = '3584MB';
SELECT pg_reload_conf();

-- Verificação (executada; pg_settings.setting=458752 → 458752*8kB=3584MB,
-- source='configuration file', pending_restart=false):
-- SELECT setting, source, pending_restart FROM pg_settings
--  WHERE name='effective_cache_size';

-- REVERSÃO:
-- ALTER SYSTEM SET effective_cache_size = '6GB';
-- SELECT pg_reload_conf();

-- ============================================================================
-- NÃO APLICADO NESTA SESSÃO (gated — requer janela/decisão humana):
--
-- * max_connections real=100 (env PG_MAX_CONNECTIONS=500 é ignorado pela
--   imagem postgres oficial — precisaria de `command: postgres -c
--   max_connections=...` no compose). Mudar max_connections é
--   postmaster-context: EXIGE RESTART do Postgres nativo, que hoje serve 6
--   bancos/apps (evolution, n8n_queue, dify, flowise, typebot, nocodb)
--   simultaneamente. Consistente com o item D já gatilhado em sessões
--   anteriores ("DB só deve reiniciar em janela") — não executado aqui.
--
-- * Vulnerabilidade crítica CVE-2026-48063 / GHSA-qvv5-jq5g-4cgg (CVSS 9.3)
--   na dependência baileys 7.0.0-rc.9 fixada pela Evolution API 2.3.7. Fix
--   só existe em 2.4.0 (ainda release candidate, com breaking change de
--   licenciamento). Requer teste em staging antes de qualquer mudança em
--   produção — não executado aqui.
--
-- * WEBHOOK_EVENTS_ERRORS_WEBHOOK (env global da Evolution) causando spam de
--   401 "Missing webhook signature" ao reportar seus próprios erros — fix
--   correto é WEBHOOK_EVENTS_ERRORS=false ou apontar para endpoint sem
--   STRICT_MODE, mas isso exige redeploy do serviço evolution_evolution
--   (container já frágil/instável hoje). Não executado nesta sessão.
-- ============================================================================
