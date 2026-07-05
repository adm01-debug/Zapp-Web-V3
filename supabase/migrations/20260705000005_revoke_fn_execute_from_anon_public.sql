-- ==========================================================================
-- FIX: Revogar EXECUTE ON ALL FUNCTIONS de anon e PUBLIC em public schema
-- ==========================================================================
-- Descoberta via teste de penetracao (A07):
-- 59 funcoes SECURITY DEFINER eram chamáveis por anon via PGRST RPC,
-- incluindo fn_force_autovacuum, fn_monitor_slow_queries, fn_vacuum_critical_tables.
-- Confirmado: anon recebia HTTP 200 ao chamar /rest/v1/rpc/fn_force_autovacuum
--
-- Analise de impacto:
-- - Todas as funcoes com grant PUBLIC (=X) tambem tem grant explícito para
--   authenticated (authenticated=X) - validado via A13: 0 funcoes com PUBLIC
--   apenas sem authenticated explicito.
-- - Logo, revogar PUBLIC mantem acesso para authenticated e service_role
--
-- Resultado apos fix:
--   anon_callable: 59 -> 0
--   authenticated_callable: 1025 (inalterado)
--   service_role_callable: 1038 (inalterado)
-- ==========================================================================

-- Revogar grants explícitos de anon em funcoes publicas
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- Revogar grants via PUBLIC (heranca) - o path pelo qual anon estava tendo acesso
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- Prevenir concessao automatica para anon/PUBLIC em novas funcoes
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Verificacao pos-apply:
-- SELECT COUNT(*) FROM pg_proc
-- WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
-- AND has_function_privilege('anon', oid, 'EXECUTE');
-- Esperado: 0
