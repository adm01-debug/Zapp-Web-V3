-- MIGRATION: 20260808240000
-- FIX GAP-01: search_contacts_gin usava Seq Scan (expressão incompatível com índice GIN)
--
-- ROOT CAUSE: A função original usava concat_ws(' ', push_name, phone_number, remote_jid)
-- enquanto o índice idx_contacts_search_consolidated usa a expressão:
--   COALESCE(full_name,''::varchar)::text || ' ' || COALESCE(push_name,''::varchar)::text || ...
-- PostgreSQL exige match BYTE-A-BYTE entre query e indexdef para usar o índice.
-- Resultado: 100% Seq Scan — GIN de 14 MB era inútil.
--
-- FIX: Reescrever a função com expressão idêntica ao indexdef, incluindo:
--   1. Mesma ordem de colunas: full_name, push_name, phone_number, email, company
--   2. COALESCE(col, ''::varchar)::text — não COALESCE(col::text, '')
--   3. WHERE deleted_at IS NULL — condição do índice parcial
-- Validado: idx_scan subiu de 0 para 5+ após a correção.
-- lint:ok: DROP + CREATE intencional (signature idêntica, fix de bug crítico)

DROP FUNCTION IF EXISTS evo.search_contacts_gin(text, integer, integer, real);
DROP FUNCTION IF EXISTS evo.search_contacts_gin(text, integer, integer, double precision);

CREATE FUNCTION evo.search_contacts_gin(
  p_query  TEXT,
  p_limit  INT     DEFAULT 20,
  p_offset INT     DEFAULT 0,
  p_min_sim FLOAT  DEFAULT 0.1
)
RETURNS TABLE (
  id          UUID,
  remote_jid  TEXT,
  phone_number TEXT,
  push_name   TEXT,
  full_name   VARCHAR,
  email       VARCHAR,
  company     VARCHAR,
  sim_score   FLOAT
)
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path TO 'evo', 'extensions', 'public'
AS $$
  -- BRANCH 1: GIN trgm — expressão byte-a-byte idêntica ao idx_contacts_search_consolidated
  -- WHERE deleted_at IS NULL é obrigatório para acionar o índice PARCIAL
  SELECT c.id, c.remote_jid, c.phone_number, c.push_name, c.full_name, c.email, c.company,
    extensions.similarity(
      ((((((((COALESCE(c.full_name,  ''::character varying))::text || ' '::text)
             || (COALESCE(c.push_name,  ''::character varying))::text) || ' '::text)
             || COALESCE(c.phone_number, ''::text)) || ' '::text)
             || (COALESCE(c.email,    ''::character varying))::text) || ' '::text)
             || (COALESCE(c.company,  ''::character varying))::text,
      p_query
    ) AS sim_score
  FROM evo.evolution_contacts c
  WHERE c.deleted_at IS NULL
    AND (((((((((COALESCE(c.full_name,  ''::character varying))::text || ' '::text)
                || (COALESCE(c.push_name,  ''::character varying))::text) || ' '::text)
                || COALESCE(c.phone_number, ''::text)) || ' '::text)
                || (COALESCE(c.email,    ''::character varying))::text) || ' '::text)
                || (COALESCE(c.company,  ''::character varying))::text
              ) OPERATOR(extensions.%) p_query
    AND extensions.similarity(
      ((((((((COALESCE(c.full_name,  ''::character varying))::text || ' '::text)
             || (COALESCE(c.push_name,  ''::character varying))::text) || ' '::text)
             || COALESCE(c.phone_number, ''::text)) || ' '::text)
             || (COALESCE(c.email,    ''::character varying))::text) || ' '::text)
             || (COALESCE(c.company,  ''::character varying))::text,
      p_query
    ) >= p_min_sim

  UNION

  -- BRANCH 2: fallback numérico (phone_number / remote_jid) — btree/seqscan ok em tabela pequena
  SELECT c.id, c.remote_jid, c.phone_number, c.push_name, c.full_name, c.email, c.company,
    0.5::FLOAT
  FROM evo.evolution_contacts c
  WHERE c.deleted_at IS NULL
    AND (c.phone_number ILIKE '%' || p_query || '%'
         OR  c.remote_jid  ILIKE '%' || p_query || '%')
    AND NOT (((((((((COALESCE(c.full_name,  ''::character varying))::text || ' '::text)
                    || (COALESCE(c.push_name,  ''::character varying))::text) || ' '::text)
                    || COALESCE(c.phone_number, ''::text)) || ' '::text)
                    || (COALESCE(c.email,    ''::character varying))::text) || ' '::text)
                    || (COALESCE(c.company,  ''::character varying))::text
                  ) OPERATOR(extensions.%) p_query

  ORDER BY sim_score DESC
  LIMIT  p_limit
  OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION evo.search_contacts_gin TO authenticated;

COMMENT ON FUNCTION evo.search_contacts_gin IS
  'Busca fuzzy de contatos usando GIN trgm (idx_contacts_search_consolidated). '
  'Branch 1: expressão idêntica ao indexdef para acionar índice parcial. '
  'Branch 2: ILIKE fallback para números/JIDs. Fix GAP-01 2026-08-07.';
