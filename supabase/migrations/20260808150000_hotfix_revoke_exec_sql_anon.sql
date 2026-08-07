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

-- Complemento D-8 (mesma rodada): funções internas adicionais com proacl default (PUBLIC)
REVOKE EXECUTE ON FUNCTION evo.fn_dedup_alert() FROM PUBLIC, anon;
REVOKE EXECUTE ON PROCEDURE evo.p_backfill_evolution_messages() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION ops.fn_alert_policy_churn() FROM PUBLIC, anon;

-- zapp.rpc_insert_message (SECURITY DEFINER, insere em evo.evolution_messages):
-- grant PUBLIC (=X) permitia anon inserir mensagens via REST. Callers legítimos
-- (authenticated/service_role) preservados. Overload com ordem de args alternativa
-- já estava sem PUBLIC (verificada).
REVOKE EXECUTE ON FUNCTION zapp.rpc_insert_message(text, text, boolean, text, text, text, text, text, jsonb) FROM PUBLIC;

-- Validação pós (deve retornar somente postgres/service_role):
-- SELECT p.proname, p.proacl FROM pg_proc p
--   WHERE p.proname IN ('exec_sql','fn_check_401_rate','fn_check_ack_stall',
--                       'fn_check_connection_saturation','fn_retention_webhook_partitions',
--                       'fn_auto_resolve_alerts');
