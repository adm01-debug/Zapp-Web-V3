-- fix(gate): RPC de inventário para o audit-contract via PostgREST (2026-08-05)
--
-- Contexto: o gate CI "Audit front↔DB contract" precisa verificar se RPCs/tabelas
-- usadas pelo front existem no banco. O modo pg (DB_URL) falha no CI porque o
-- SUPABASE_DB_URL aponta para o IP interno do Swarm (ECONNREFUSED). O modo HTTP
-- via OpenAPI do PostgREST tem falsos negativos (funções com args obrigatórios
-- não aparecem no OpenAPI; GET /rpc/{name} retorna PGRST202 mesmo quando existe).
--
-- Solução: RPC SECURITY DEFINER que retorna o inventário real (pg_proc + EXECUTE)
-- consultável via POST /rest/v1/rpc/rpc_contract_inventory com service_role.

CREATE OR REPLACE FUNCTION zapp.rpc_contract_inventory()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = zapp, public
AS $$
  SELECT jsonb_build_object(
    'functions', (
      SELECT jsonb_agg(jsonb_build_object(
        'name', p.proname,
        'args', pg_get_function_identity_arguments(p.oid),
        'auth_exec', has_function_privilege('authenticated', p.oid, 'EXECUTE')
      ) ORDER BY p.proname)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'zapp'
        AND p.prokind = 'f'
    ),
    'tables', (
      SELECT jsonb_agg(jsonb_build_object(
        'name', c.relname,
        'kind', c.relkind::text
      ) ORDER BY c.relname)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'zapp'
        AND c.relkind IN ('r', 'v', 'm', 'f', 'p')
    )
  );
$$;

GRANT EXECUTE ON FUNCTION zapp.rpc_contract_inventory() TO service_role;
GRANT EXECUTE ON FUNCTION zapp.rpc_contract_inventory() TO authenticated;
