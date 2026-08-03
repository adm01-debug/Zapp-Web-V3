-- =====================================================================
-- Provisiona role `ci_readonly` para o job de diff de schema no CI.
-- Aplicar APENAS em Supabase SELF-HOSTED (não roda em cloud).
--
-- Uso:
--   psql "$ADMIN_DB_URL" -v ci_password="'TROQUE_ME_FORTE'" \
--     -f db/ci/2026-07-01_provision_ci_readonly.sql
--
-- Idempotente: pode rodar múltiplas vezes.
-- =====================================================================

BEGIN;

-- 1) Role de login, sem herança de superuser
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ci_readonly') THEN
    EXECUTE format('CREATE ROLE ci_readonly LOGIN PASSWORD %L', :ci_password);
  ELSE
    EXECUTE format('ALTER ROLE ci_readonly WITH LOGIN PASSWORD %L', :ci_password);
  END IF;
END $$;

-- Sem privilégios perigosos
ALTER ROLE ci_readonly NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

-- Rate-limit defensivo (opcional)
ALTER ROLE ci_readonly CONNECTION LIMIT 4;
ALTER ROLE ci_readonly SET statement_timeout = '30s';
ALTER ROLE ci_readonly SET idle_in_transaction_session_timeout = '10s';

-- 2) Acesso somente aos catálogos + schema public (metadados)
GRANT CONNECT ON DATABASE postgres TO ci_readonly;
GRANT USAGE ON SCHEMA public TO ci_readonly;
GRANT USAGE ON SCHEMA pg_catalog TO ci_readonly;
GRANT USAGE ON SCHEMA information_schema TO ci_readonly;

-- 3) Leitura de METADADOS via views do information_schema já é pública.
--    Para pg_get_functiondef / pg_get_viewdef / pg_get_triggerdef precisamos
--    de SELECT nos catálogos (já é padrão para PUBLIC no Postgres).
--
--    NÃO concedemos SELECT em tabelas do public — o introspector só lê schema.
--    Se quiser permitir SELECT em tabelas (para dumps de dados), habilite abaixo:
--
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO ci_readonly;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public
--   GRANT SELECT ON TABLES TO ci_readonly;

-- 4) Revoga qualquer escrita herdada
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public FROM ci_readonly;
REVOKE CREATE ON SCHEMA public FROM ci_readonly;

-- 5) Auditoria: comentário identificando propósito
COMMENT ON ROLE ci_readonly IS
  'CI job (GitHub Actions) — read-only metadata for schema-diff. Provisioned by db/ci/2026-07-01_provision_ci_readonly.sql';

COMMIT;

-- Verificação pós-execução (rode manualmente):
--   \du ci_readonly
--   SELECT has_schema_privilege('ci_readonly','public','USAGE');   -- t
--   SELECT has_table_privilege('ci_readonly','public.profiles','SELECT');  -- f (esperado)
