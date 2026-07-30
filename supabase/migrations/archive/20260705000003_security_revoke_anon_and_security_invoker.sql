-- ==========================================================================
-- MELHORIA #1: Revogar acesso anon de TODAS as tabelas/views public
-- MELHORIA #2: security_invoker=ON em TODAS as 546 views public
-- ==========================================================================
-- Contexto:
-- O role `anon` tinha SELECT em 371 tabelas/views em `public`, incluindo
-- credential_vault, api_keys, channel_connections (credenciais WhatsApp),
-- gmail_accounts, passkey_credentials, workspace_secrets e mais.
-- Todas as 546 views em `public` eram owned por `postgres` (rolbypassrls=true),
-- o que causava bypass total de RLS das tabelas subjacentes em `zapp`.
-- Qualquer requisicao com apenas o anon_key retornava TODOS os dados.
--
-- Fix:
-- 1. REVOKE SELECT em todas as tabelas public de anon
-- 2. ALTER VIEW SET (security_invoker=ON) em todas as 546 views
-- ==========================================================================

-- -----------------------------------------------------------------------
-- MELHORIA #1: Revogar anon de public
-- -----------------------------------------------------------------------
REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE USAGE ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Tambem revogar DEFAULT PRIVILEGES para evitar vazamento em novas tabelas
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE INSERT ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE UPDATE ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE DELETE ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE ON SEQUENCES FROM anon;

-- -----------------------------------------------------------------------
-- MELHORIA #2: security_invoker=ON em TODAS as views public
-- -----------------------------------------------------------------------
-- Garante que queries atraves de views verificam RLS contra o usuario
-- chamador (authenticated), nao contra o owner da view (postgres/bypassrls).
DO $$
DECLARE
  v RECORD;
  cnt INTEGER := 0;
  err_cnt INTEGER := 0;
BEGIN
  FOR v IN
    SELECT viewname
    FROM pg_views
    WHERE schemaname = 'public'
      AND viewname NOT LIKE 'pg_%'
  LOOP
    BEGIN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = ON)', v.viewname);
      cnt := cnt + 1;
    EXCEPTION WHEN OTHERS THEN
      err_cnt := err_cnt + 1;
      RAISE WARNING 'Could not alter view %: %', v.viewname, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'security_invoker=ON aplicado em % views. Erros: %', cnt, err_cnt;
END $$;

-- Verificacao pos-apply (deve retornar 546)
-- SELECT COUNT(*) FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE c.relkind = 'v' AND n.nspname = 'public'
-- AND c.reloptions @> ARRAY['security_invoker=on'];
