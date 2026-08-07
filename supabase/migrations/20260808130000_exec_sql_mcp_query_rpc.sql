-- ============================================================================
-- exec_sql — RPC read-only para a edge function mcp-query (P1 2026-08-07)
-- ============================================================================
-- Contexto: a edge function mcp-query (MCP interno, header x-mcp-secret)
-- executa consultas via PostgREST rpc/exec_sql com a service_role key. A
-- função NÃO existia no banco (PGRST202 em runtime) — o mcp-query nunca
-- funcionou de fato.
--
-- Segurança (defesa em profundidade, além da whitelist no edge):
--   - SECURITY DEFINER com search_path FIXO (pg_catalog, public) — sem
--     captura de search_path do chamador
--   - Whitelist read-only NA FUNÇÃO: somente SELECT/EXPLAIN/WITH (a edge
--     function também filtra — 403 READ_ONLY_VIOLATION — mas um chamador
--     direto do RPC não pode contornar)
--   - Retorno SETOF json: SELECT/WITH viram to_json(t) por linha; EXPLAIN
--     roda com (FORMAT JSON)
--   - Grants: service_role (uso real via edge), anon/authenticated (probe)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.exec_sql(query text)
RETURNS SETOF json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  q text := btrim(query);
BEGIN
  IF q !~* '^[[:space:]]*(SELECT|EXPLAIN|WITH)([^[:alnum:]_]|$)' THEN
    RAISE EXCEPTION 'read-only violation: somente SELECT/EXPLAIN/WITH'
      USING ERRCODE = '42501';
  END IF;
  IF q ~* '^[[:space:]]*EXPLAIN([^[:alnum:]_]|$)' THEN
    -- EXPLAIN (FORMAT JSON) retorna 1 coluna json — casa com SETOF json
    RETURN QUERY EXECUTE format('EXPLAIN (FORMAT JSON) %s', trim(substring(q from 8)));
    RETURN;
  END IF;
  -- SELECT/WITH: cada linha -> objeto json (qualquer shape de colunas)
  RETURN QUERY EXECUTE format('SELECT to_json(t) FROM (%s) t', q);
END;
$$;

GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role, authenticated, anon;
