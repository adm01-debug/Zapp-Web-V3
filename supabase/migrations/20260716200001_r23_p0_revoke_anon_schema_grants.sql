-- ============================================================
-- Migration: 20260716200000_r23_p0_revoke_anon_schema_grants
-- Purpose  : P0/P1 – Revoke anon SELECT on all domain schemas
-- Trigger  : Audit 2026-07-16 – PGRST_DB_SCHEMAS exposed 'zapp',
--            'artes','vendas','financeiro' directly; anon had SELECT
--            on 312 zapp tables + 402 views + 5 matviews (NO RLS)
--            + 25 financeiro + 9 vendas + 2 artes + cron + net
-- Root cause: organic drift via GRANT after R22 (deploy re-grants)
-- Grantors  : postgres AND supabase_admin (both needed)
-- Applied   : 2026-07-16 live via Portainer psql
-- Idempotent: YES – REVOKE on already-revoked = no-op
-- Score before: unknown drift; score after: +security dimension
-- ============================================================

-- ----------------------------------------------------------------
-- STEP 1: Revoke explicit anon SELECT (grantors: postgres + supabase_admin)
-- Note: superuser REVOKE covers grants made by any grantor
-- ----------------------------------------------------------------
REVOKE SELECT ON ALL TABLES IN SCHEMA zapp        FROM anon;
REVOKE SELECT ON ALL TABLES IN SCHEMA public      FROM anon;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'artes') THEN
    EXECUTE 'REVOKE SELECT ON ALL TABLES IN SCHEMA artes FROM anon';
  END IF;
END $$;
REVOKE SELECT ON ALL TABLES IN SCHEMA vendas      FROM anon;
REVOKE SELECT ON ALL TABLES IN SCHEMA financeiro  FROM anon;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'logistica') THEN
    EXECUTE 'REVOKE SELECT ON ALL TABLES IN SCHEMA logistica FROM anon';
  END IF;
END $$;

-- Explicit revoke on extension tables (owned by supabase_admin)
-- Must revoke from PUBLIC pseudo-role (grantee=0), not anon
-- Guard: cron.job_run_details and net tables may not exist in all environments
DO $$ BEGIN
  REVOKE SELECT ON cron.job FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'cron' AND c.relname = 'job_run_details') THEN
    REVOKE SELECT, DELETE ON cron.job_run_details FROM PUBLIC;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'net' AND c.relname = 'http_request_queue') THEN
    REVOKE ALL ON net.http_request_queue FROM PUBLIC;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'net' AND c.relname = '_http_response') THEN
    REVOKE ALL ON net._http_response FROM PUBLIC;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- STEP 2: Seal default privileges – no future object auto-grants to anon
-- Must run for each creator role that could create objects
-- ----------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres      IN SCHEMA zapp       REVOKE SELECT ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres      IN SCHEMA public     REVOKE SELECT ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres      IN SCHEMA vendas     REVOKE SELECT ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres      IN SCHEMA financeiro REVOKE SELECT ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA zapp      REVOKE SELECT ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public    REVOKE SELECT ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA vendas    REVOKE SELECT ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA financeiro REVOKE SELECT ON TABLES FROM anon;
-- artes is an Evolution API instance name, not a PostgreSQL schema; guard with existence check
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'artes') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA artes REVOKE SELECT ON TABLES FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA artes REVOKE SELECT ON TABLES FROM anon';
  END IF;
END $$;

-- ----------------------------------------------------------------
-- STEP 3: Verification (run after applying)
-- Expected: 0 rows
-- ----------------------------------------------------------------
-- SELECT n.nspname, count(*) AS anon_select
-- FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
-- WHERE c.relkind IN ('r','v','m','p')
--   AND has_table_privilege('anon',c.oid,'SELECT')
--   AND n.nspname NOT IN ('pg_catalog','information_schema','extensions',
--     'pg_toast','pgmq','pgsodium','graphql','vault','pgmq_public',
--     'graphql_public','auth','storage','realtime','_realtime',
--     'supabase_functions','supabase_migrations')
-- GROUP BY 1;
-- Expected: 0 rows
