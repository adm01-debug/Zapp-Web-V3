-- ============================================================
-- Migration 20260728000006
-- security: pgbouncer.get_auth — SET search_path = pg_catalog, pg_temp
--
-- CONTEXTO:
--   pgbouncer.get_auth é uma função SECURITY DEFINER usada pelo
--   PgBouncer para autenticar conexões ao banco. Ela não era
--   acessível por roles web (anon=false, authenticated=false),
--   mas não tinha search_path definido, violando a regra
--   zero-exceptions de SECDEF sem search_path.
--
-- FIX:
--   Adiciona SET search_path = pg_catalog, pg_temp para:
--   1. Eliminar ambiguidade de schema (pg_shadow está em pg_catalog)
--   2. Satisfazer o gate CI secdef-search-path-guard
--   3. Manter compatibilidade total com PgBouncer
--      (a função referencia pg_catalog.pg_shadow explicitamente)
--
-- IMPACTO:
--   Nenhum. PgBouncer não é afetado: a função já usava
--   pg_catalog.pg_shadow com o schema qualificado. O fix é
--   puramente de hardening (príncipio de least privilege).
--
-- GATE FINAL:
--   SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n
--     ON n.oid=p.pronamespace WHERE prosecdef=true
--     AND (proconfig IS NULL OR NOT EXISTS(
--       SELECT 1 FROM unnest(proconfig) cfg
--       WHERE cfg LIKE 'search_path=%'))
--   EXCLUINDO system schemas
--   Esperado: 0 (ZERO EXCEPTIONS)
-- ============================================================

ALTER FUNCTION pgbouncer.get_auth(p_usename text)
  SET search_path = pg_catalog, pg_temp;

-- Validação inline
DO $gate$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname = 'pgbouncer' AND p.proname = 'get_auth'
      AND p.proconfig IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM unnest(p.proconfig) cfg
        WHERE cfg LIKE 'search_path=%'
      )
  ) THEN
    RAISE EXCEPTION 'GATE FAIL: pgbouncer.get_auth ainda sem search_path';
  END IF;
  RAISE NOTICE 'GATE OK: pgbouncer.get_auth com search_path = pg_catalog, pg_temp';
END $gate$;
