-- =============================================================================
-- Migration: revoke anon EXECUTE da guard zapp.fn_require_app_user()
--
-- Contexto (2026-08-06): a guard canônica "app user required" (P0, criada pela
-- auditoria da sessão paralela) foi criada DIRETO no banco SEM migration
-- versionada e herdou o grant default de CREATE FUNCTION (EXECUTE para PUBLIC)
-- → has_function_privilege('anon', ...) = true → o gate obrigatório
-- "Verify security_invoker on all views" falharia em TODO PR.
--
-- A função é SECURITY DEFINER e VOLATILE; para anon (auth.uid() = NULL) ela
-- não faz nada além de confirmar existência — mas viola a política do gate e
-- expõe uma SECURITY DEFINER a chamada anônima. Executores legítimos:
-- authenticated (via cadeias RPC), service_role, postgres/cron.
--
-- Fix: REVOKE de PUBLIC/anon + GRANT explícito a authenticated/service_role.
--
-- NOTA (follow-up P2, dono: sessão que criou a função): prosrc NÃO tem
-- `SET search_path` — convenção da casa exige em SECURITY DEFINER. Não alterei
-- o corpo (contrato anti-conflito); a dona deve versionar a função com
-- search_path fixo.
--
-- Rollback: GRANT EXECUTE ON FUNCTION zapp.fn_require_app_user() TO PUBLIC;
-- =============================================================================

REVOKE EXECUTE ON FUNCTION zapp.fn_require_app_user() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION zapp.fn_require_app_user() TO authenticated, service_role;
