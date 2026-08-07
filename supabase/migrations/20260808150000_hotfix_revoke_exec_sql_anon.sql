-- 20260808150000_hotfix_revoke_exec_sql_anon.sql
-- P0 (descoberto pelo gate Edge Schema Parity / D-8 do PR #973):
--   public.exec_sql(text) era SECURITY DEFINER com EXECUTE para anon+authenticated
--   → leitura total do banco (bypass de RLS) via POST /rest/v1/rpc/exec_sql.
--   As 5 funções de jobs internos evo.* tinham EXECUTE default PUBLIC (proacl null).
-- Correção: manter apenas postgres + service_role (consumidor legítimo = MCP query).

REVOKE EXECUTE ON FUNCTION public.exec_sql(text) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION evo.fn_auto_resolve_alerts() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION evo.fn_check_401_rate() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION evo.fn_check_ack_stall() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION evo.fn_check_connection_saturation() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION evo.fn_retention_webhook_partitions(boolean, integer) FROM PUBLIC, anon;

-- Validação pós (deve retornar somente postgres/service_role):
-- SELECT p.proname, p.proacl FROM pg_proc p
--   WHERE p.proname IN ('exec_sql','fn_check_401_rate','fn_check_ack_stall',
--                       'fn_check_connection_saturation','fn_retention_webhook_partitions',
--                       'fn_auto_resolve_alerts');
