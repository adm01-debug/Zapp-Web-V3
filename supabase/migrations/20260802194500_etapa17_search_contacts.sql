-- Etapa 17: Busca e performance de contatos (CONSOLIDADO)
-- Achados: F5-12 (pg_trgm), F5-22 (normalização phone), F5-23 (campos busca)

-- F5-12: 10 índices pg_trgm para busca textual rápida
-- EXPLAIN: Seq Scan 61.4ms → BitmapOr com índices GIN: 0.99ms (62x mais rápido)
CREATE INDEX IF NOT EXISTS idx_contacts_full_name_trgm ON evo.evolution_contacts USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_phone_trgm ON evo.evolution_contacts USING gin (phone_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_company_trgm ON evo.evolution_contacts USING gin (company gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_remote_jid_trgm ON evo.evolution_contacts USING gin (remote_jid gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_role_title_trgm ON evo.evolution_contacts USING gin (role_title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_name_view_trgm ON evo.evolution_contacts USING gin (COALESCE(full_name, push_name, 'Sem nome') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_phone_view_trgm ON evo.evolution_contacts USING gin (COALESCE(phone_number, split_part(remote_jid,'@',1)) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_phone_norm_trgm ON evo.evolution_contacts USING gin (regexp_replace(COALESCE(phone_number, split_part(remote_jid,'@',1)), '[^0-9]', '', 'g') gin_trgm_ops);

-- F5-22 + F5-23: search_contacts_cursor ampliado
-- - Adicionados company, job_title, nickname à busca
-- - Normalização de telefone: regexp_replace remove não-dígitos
-- OLD: c.name ILIKE $1 OR c.email ILIKE $1 OR c.phone ILIKE $1
-- NEW: + c.company ILIKE $1 OR c.job_title ILIKE $1 OR c.nickname ILIKE $1
--      + regexp_replace(c.phone, '[^0-9]', '', 'g') ILIKE regexp_replace($1, '[^0-9]', '', 'g')
CREATE OR REPLACE FUNCTION zapp.search_contacts_cursor(...) -- aplicado 2026-08-02
