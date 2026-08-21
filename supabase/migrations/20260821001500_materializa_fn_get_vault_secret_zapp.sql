-- =============================================================================
-- Materializa zapp.fn_get_vault_secret no repositório (plano-100, 2026-08-20).
--
-- CONTEXTO: a função JÁ EXISTE em produção (com GRANT a service_role) e é o
-- que faz o fallback de Vault das edge functions funcionar —
-- supabase/functions/_shared/vault.ts chama `rpc('fn_get_vault_secret')` com
-- o client em `db: { schema: 'zapp' }`. Ela porém fazia parte do drift de 684
-- versões aplicadas via MCP sem arquivo no repo (ver
-- supabase/MIGRATION_DRIFT_2026-08-20.md). No repo só existia
-- ops.fn_get_vault_secret (20260817260004), que o PostgREST NÃO alcança
-- (`ops` fora de PGRST_DB_SCHEMAS) — auditoria de 2026-08-20 chegou a
-- classificar o caminho Vault como quebrado lendo apenas o repo.
--
-- Este arquivo é a definição EXATA do runtime (pg_get_functiondef,
-- 2026-08-20). CREATE OR REPLACE idempotente: em produção é no-op semântico;
-- em ambiente limpo (migration-smoke) cria a função corretamente.
--
-- SEGURANÇA: SECURITY DEFINER com search_path fixo (sem public/pg_temp).
-- EXECUTE restrito a service_role — nunca conceder a anon/authenticated
-- (a função lê vault.decrypted_secrets).
--
-- ROLLBACK:
--   REVOKE EXECUTE ON FUNCTION zapp.fn_get_vault_secret(text) FROM service_role;
--   DROP FUNCTION IF EXISTS zapp.fn_get_vault_secret(text);
--   (não recomendado em produção — o fallback de Vault das edge functions
--    zapp-email-inbound-webhook / zapp-notifications-dispatch / gmail-webhook /
--    evolution-group-sync / evolution-notification-dispatcher deixaria de
--    resolver segredos que não estão em env.)
-- =============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_get_vault_secret(p_name text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'monitoring'
AS $function$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = p_name
  LIMIT 1;
  RETURN v_secret;
END $function$;

REVOKE ALL ON FUNCTION zapp.fn_get_vault_secret(text) FROM PUBLIC;

DO $$
BEGIN
  -- Guard de ambiente limpo (migration-smoke): o role service_role só existe
  -- em instâncias Supabase; num Postgres vanilla o GRANT falharia.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION zapp.fn_get_vault_secret(text) TO service_role;
  ELSE
    RAISE NOTICE 'role service_role ausente (ambiente sem Supabase) — GRANT pulado';
  END IF;
END $$;
