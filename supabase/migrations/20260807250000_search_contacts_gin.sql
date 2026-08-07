-- Migration: evo.search_contacts_gin
-- Objetivo: Expor o índice GIN trgm (idx_contacts_search_consolidated) via RPC.
-- Contexto: O índice GIN foi criado sobre expressão concatenada de 5 campos de
--           evolution_contacts. Esta função usa OPERATOR(extensions.%) para
--           acionar o índice (O(log n) vs O(n) das queries ILIKE individuais).

CREATE OR REPLACE FUNCTION evo.search_contacts_gin(
  p_query    TEXT,
  p_limit    INT  DEFAULT 20,
  p_offset   INT  DEFAULT 0,
  p_min_sim  REAL DEFAULT 0.15
)
RETURNS TABLE (
  id UUID, remote_jid VARCHAR, push_name VARCHAR, phone_number TEXT,
  full_name VARCHAR, email VARCHAR, company VARCHAR,
  sim_score REAL, search_field TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'extensions','evo','public','pg_catalog'
AS $$
  SELECT * FROM (
    -- Branch 1: GIN trgm — aciona idx_contacts_search_consolidated (O(log n))
    SELECT
      c.id, c.remote_jid, c.push_name, c.phone_number, c.full_name, c.email, c.company,
      extensions.similarity(
        COALESCE(c.full_name::text,'')||' '||COALESCE(c.push_name::text,'')||' '||
        COALESCE(c.phone_number,'')||' '||COALESCE(c.email::text,'')||' '||
        COALESCE(c.company::text,''),
        p_query
      ) AS sim_score,
      'similarity'::text AS search_field
    FROM evo.evolution_contacts c
    WHERE c.deleted_at IS NULL
      AND (
        COALESCE(c.full_name::text,'')||' '||COALESCE(c.push_name::text,'')||' '||
        COALESCE(c.phone_number,'')||' '||COALESCE(c.email::text,'')||' '||
        COALESCE(c.company::text,'')
      ) OPERATOR(extensions.%) p_query

    UNION

    -- Branch 2: fallback exato para número/JID (busca por código de país etc.)
    SELECT
      c.id, c.remote_jid, c.push_name, c.phone_number, c.full_name, c.email, c.company,
      1.0::real AS sim_score,
      'phone_exact'::text AS search_field
    FROM evo.evolution_contacts c
    WHERE c.deleted_at IS NULL
      AND (
        c.phone_number    ILIKE '%'||p_query||'%'
        OR c.remote_jid::text ILIKE '%'||p_query||'%'
      )
  ) combined
  ORDER BY sim_score DESC, push_name
  LIMIT p_limit OFFSET p_offset;
$$;

COMMENT ON FUNCTION evo.search_contacts_gin IS
  'Busca de contatos em evo.evolution_contacts via GIN trgm. '
  'Branch 1: OPERATOR(extensions.%) sobre expressão de 5 campos concatenados '
  '          → aciona idx_contacts_search_consolidated (O log n). '
  'Branch 2: fallback ILIKE para phone_number/remote_jid (busca exata por número). '
  'p_min_sim=0.15 (default). Exemplos: search_contacts_gin(''João'',20,0,0.2)';

-- Permissão para authenticated (PostgREST expõe como RPC)
GRANT EXECUTE ON FUNCTION evo.search_contacts_gin(TEXT,INT,INT,REAL) TO authenticated;
