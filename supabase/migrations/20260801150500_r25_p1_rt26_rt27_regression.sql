-- ============================================================================
-- R25 P1-7.a/b — RT26 + RT27 na regressão (fecha a lacuna do incidente #668)
-- ----------------------------------------------------------------------------
-- Lacuna: todos os testes validavam apenas anon/PUBLIC, nunca authenticated.
-- PR #668 revogou EXECUTE de funções de RLS p/ authenticated → 403 no inbox
-- passou silencioso pelo health score 5/5 e pela regressão 25/25.
--
-- RT26: nenhuma função referenciada em policy de RLS inexecutável por
--       authenticated (pg_depend, broken = 0).
-- RT27: authenticated consegue ler public.messages + public.contacts
--       (checagem estática com to_regclass/to_regprocedure guards — SET ROLE
--       é proibido dentro de SECURITY DEFINER; dblink exige senha).
-- ============================================================================

-- Helper usado pelo RT27 (SECURITY DEFINER com checagem estática; sem EXECUTE
-- público — S2 R25)
CREATE OR REPLACE FUNCTION ops.fn_auth_can_read_front_views()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'ops', 'pg_catalog'
AS $function$
DECLARE
  v_ok boolean := true;
  v_missing text := '';
BEGIN
  IF to_regclass('public.messages') IS NULL
     OR NOT has_table_privilege('authenticated', 'public.messages', 'SELECT') THEN
    v_ok := false; v_missing := v_missing || 'public.messages SELECT; ';
  END IF;
  IF to_regclass('public.contacts') IS NULL
     OR NOT has_table_privilege('authenticated', 'public.contacts', 'SELECT') THEN
    v_ok := false; v_missing := v_missing || 'public.contacts SELECT; ';
  END IF;
  IF to_regprocedure('zapp.current_user_is_privileged()') IS NULL
     OR NOT has_function_privilege('authenticated', 'zapp.current_user_is_privileged()', 'EXECUTE') THEN
    v_ok := false; v_missing := v_missing || 'current_user_is_privileged EXECUTE; ';
  END IF;
  IF to_regprocedure('zapp.is_admin_painel()') IS NULL
     OR NOT has_function_privilege('authenticated', 'zapp.is_admin_painel()', 'EXECUTE') THEN
    v_ok := false; v_missing := v_missing || 'is_admin_painel EXECUTE; ';
  END IF;
  IF v_missing <> '' THEN
    RAISE WARNING 'fn_auth_can_read_front_views: missing %', v_missing;
  END IF;
  RETURN v_ok;
END;
$function$;

REVOKE ALL ON FUNCTION ops.fn_auth_can_read_front_views() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- NOTA DE APLICAÇÃO: o rewrite completo de ops.fn_regression_tests() com os
-- 27 testes (RT01..RT27) está na migration 20260801150501 (arquivo canônico
-- completo CREATE OR REPLACE, Regra F3). Aplicado AO VIVO em 2026-08-01 15:35
-- UTC e validado 27/27 PASS.
-- ============================================================================

-- Validação:
--   SELECT test_name, status FROM ops.fn_regression_tests()
--   WHERE test_name IN ('RT26_rls_fns_exec_authenticated','RT27_authenticated_reads_front_views');
--   -- ambas PASS
