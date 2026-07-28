-- Migration: revoke_anon_usage_financeiro_artes
-- Data: 2026-07-28
-- Ticket: Security Audit — Gap #5
--
-- DESCRIÇÃO:
-- Remove o privilegéio USAGE do schema 'financeiro' e 'artes' para o role 'anon'.
--
-- IMPACTO:
-- - anon não pode mais enumerar objetos nesses schemas via PostgREST OpenAPI
-- - Não afeta 'authenticated' ou 'service_role' (verificado: ambos mantidos)
-- - Não afeta dados (0 grants de tabela para anon nesses schemas)
-- - Todas as 18 tabelas continuam com RLS ativo
--
-- ESTADO ANTERIOR:
-- has_schema_privilege('anon','financeiro','USAGE') = true (grant direto, não de PUBLIC)
-- has_schema_privilege('anon','artes','USAGE') = true (grant direto, não de PUBLIC)
--
-- ESTADO PÓS:
-- has_schema_privilege('anon','financeiro','USAGE') = false
-- has_schema_privilege('anon','artes','USAGE') = false
--
-- ROLLBACK:
-- GRANT USAGE ON SCHEMA financeiro TO anon;
-- GRANT USAGE ON SCHEMA artes TO anon;

REVOKE USAGE ON SCHEMA financeiro FROM anon;
REVOKE USAGE ON SCHEMA artes FROM anon;

-- Garantia: novos objetos criados nesses schemas nao obteram grants para anon
ALTER DEFAULT PRIVILEGES IN SCHEMA financeiro REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA financeiro REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA financeiro REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA artes REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA artes REVOKE EXECUTE ON FUNCTIONS FROM anon;
