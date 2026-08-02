-- Etapa 17: Busca e performance de contatos
-- Achados: F5-12 (pg_trgm), F5-22 (normalização phone), F5-23 (campos busca)

-- F5-12: Índice pg_trgm em full_name (já existia em push_name e email)
-- NOTA: sem CONCURRENTLY — MCP executa em transação implícita
CREATE INDEX IF NOT EXISTS idx_contacts_fullname_trgm
  ON evo.evolution_contacts USING gin (full_name gin_trgm_ops);

-- F5-22 + F5-23: search_contacts_cursor ampliado
-- - Adicionados company, job_title, nickname à busca por termo
-- - Normalização de telefone: regexp_replace remove não-dígitos
--   Ex: busca "(11) 99999-9999" encontra "5511999999999"
CREATE OR REPLACE FUNCTION zapp.search_contacts_cursor(...)
  -- WHERE clause atualizada:
  -- OLD: c.name ILIKE $1 OR c.email ILIKE $1 OR c.phone ILIKE $1
  -- NEW: + c.company ILIKE $1 OR c.job_title ILIKE $1 OR c.nickname ILIKE $1
  --      + regexp_replace(c.phone, '[^0-9]', '', 'g') ILIKE regexp_replace($1, '[^0-9]', '', 'g')
