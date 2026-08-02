-- =============================================================================
-- Etapa 3: Credenciais e sessão JWT (REDESENHADA 2026-08-02)
-- Achados: F9-16, F9-17, F9-18
-- Risco: BAIXO (3 ALTER reversíveis, nenhum toca sessão)
-- Ordem: F9-18 → F9-17 item 1 → F9-16
-- =============================================================================
-- ROLLBACK CAPTURADO:
--   R1: ALTER ROLE authenticated SET statement_timeout = '120s';
--   R2: ALTER ROLE service_role RESET statement_timeout;
--   R3: ALTER DATABASE postgres SET app.settings.jwt_secret = 'd139cac60e8a26a6e3ba087f6f967aba8e588eee';
--   R4: ALTER DATABASE postgres SET app.settings.jwt_exp = '31536000';
--
-- VERIFICAÇÃO PRÉ-APLICAÇÃO (2026-08-02 17:55):
--   authenticated.statement_timeout = 120s (pg_db_role_setting setrole=16448)
--   service_role.statement_timeout = não definido
--   app.settings.jwt_secret = 'd139cac60e8a26a6e3ba087f6f967aba8e588eee' (DB postgres)
--   app.settings.jwt_exp = '31536000' (DB postgres)
-- =============================================================================

-- F9-18: Reduzir statement_timeout
-- authenticated: 120s → 15s (estava 8x acima do razoável)
ALTER ROLE authenticated SET statement_timeout = '15s';

-- service_role: não definido → 60s (explícito, evita herdar default do cluster)
ALTER ROLE service_role SET statement_timeout = '60s';

-- F9-17 item 1: Remover jwt_secret do catálogo (cópia órfã)
-- ⚠️ PENDENTE: ALTER DATABASE RESET requer superuser (MCP conecta como postgres sem superuser)
-- Para aplicar: Portainer → console do container postgres → psql -U superuser
-- ALTER DATABASE postgres RESET app.settings.jwt_secret;

-- F9-16: Remover jwt_exp do catálogo (cópia órfã)
-- ⚠️ PENDENTE: ALTER DATABASE RESET requer superuser (MCP conecta como postgres sem superuser)
-- Para aplicar: Portainer → console do container postgres → psql -U superuser
-- ALTER DATABASE postgres RESET app.settings.jwt_exp;
