-- ============================================================================
-- R25 P0-1 — restaura EXECUTE p/ authenticated nas funções usadas por policies de RLS
-- ----------------------------------------------------------------------------
-- Reverte o excesso do PR #668 (triagem SECURITY DEFINER — 316 revogadas) SEM
-- reabrir a superfície anon/PUBLIC.
--
-- Root cause: PR #668 revogou EXECUTE de zapp.current_user_is_privileged() e
-- zapp.is_admin_painel() do role authenticated. Essas funções aparecem no
-- USING/WITH CHECK de policies de RLS. Como public.messages → zapp.messages →
-- evo.evolution_messages é security_invoker=true em toda a cadeia, a policy da
-- base roda COMO authenticated, que precisa de EXECUTE e não tinha →
-- "permission denied for function current_user_is_privileged" → 403 no inbox.
--
-- Por que re-GRANT é seguro: ambas são SECURITY DEFINER e apenas informam se o
-- usuário corrente é privilegiado — não vazam dados nem elevam privilégio.
-- authenticated executá-las DENTRO da RLS é o uso pretendido. anon permanece
-- SEM EXECUTE e SEM SELECT nas views → superfície pública inalterada.
--
-- [S3/S4 R25] A varredura defensiva usa pg_depend (dependência REAL policy→fn)
-- em vez de regex por nome (evita homônimos/overloads/outros schemas) e filtra
-- prokind='f' (GRANT ON FUNCTION rejeita procedures/agregados).
--
-- Aplicado ao vivo em 2026-08-01 ~14:47 UTC. Validação:
--   SET ROLE authenticated; SELECT count(*) FROM public.messages;  → 59127 (OK)
--   SET ROLE anon;          SELECT count(*) FROM public.messages;  → permission denied (esperado)
--   Varredura pg_depend: broken = 0
-- ============================================================================

-- 1) Alvos diretos e confirmados (inbox + admin)
GRANT EXECUTE ON FUNCTION zapp.current_user_is_privileged() TO authenticated;
GRANT EXECUTE ON FUNCTION zapp.is_admin_painel()            TO authenticated;

-- 2) Garantia dupla: anon/PUBLIC NÃO executam (idempotente / no-op se já revogado)
REVOKE EXECUTE ON FUNCTION zapp.current_user_is_privileged() FROM anon;
REVOKE EXECUTE ON FUNCTION zapp.is_admin_painel()            FROM anon;
REVOKE EXECUTE ON FUNCTION zapp.current_user_is_privileged() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION zapp.is_admin_painel()            FROM PUBLIC;

-- 3) Varredura defensiva via pg_depend (dependência real pg_policy → pg_proc):
--    re-concede a QUALQUER função usada por policy de RLS que authenticated
--    ainda não consiga executar (à prova de futuras revogações em massa).
--    prokind='f' exclui procedures/agregados (S4); sem regex por nome (S3).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_depend d
    JOIN pg_proc p ON p.oid = d.refobjid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE d.classid = 'pg_policy'::regclass
      AND d.refclassid = 'pg_proc'::regclass
      AND n.nspname IN ('public','zapp','evo')
      AND p.prokind = 'f'
      AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated', r.sch, r.proname, r.args);
    RAISE LOG 'R25 P0-1: granted EXECUTE on %.%(%) to authenticated', r.sch, r.proname, r.args;
  END LOOP;
END $$;

-- Rollback:
--   REVOKE EXECUTE ON FUNCTION zapp.current_user_is_privileged() FROM authenticated;
--   REVOKE EXECUTE ON FUNCTION zapp.is_admin_painel()            FROM authenticated;
