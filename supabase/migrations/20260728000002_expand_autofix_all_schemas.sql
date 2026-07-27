-- ============================================================
-- MIGRATION: Expand fn_autofix_security_invoker to all app schemas
-- DATE: 2026-07-28
-- Covers zapp, evo, public, artes, financeiro for both:
--   1. View security_invoker repair
--   2. Function EXECUTE revocation for anon/PUBLIC
-- ============================================================

CREATE OR REPLACE FUNCTION zapp.fn_autofix_security_invoker()
RETURNS void LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, pg_catalog AS $$
DECLARE v_fixed int := 0; v_revoked int := 0; r record;
BEGIN
  -- PARTE 1: Corrige views sem security_invoker
  FOR r IN SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','zapp','evo','artes','financeiro')
      AND c.relkind='v'
      AND NOT (c.reloptions IS NOT NULL AND array_to_string(c.reloptions,',') ILIKE '%security_invoker%')
  LOOP
    EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = true)', r.nspname, r.relname);
    v_fixed := v_fixed + 1;
  END LOOP;

  -- PARTE 2: Revoga EXECUTE de anon/PUBLIC em todos os schemas de aplicação
  FOR r IN SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prokind
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('zapp','evo','public','artes','financeiro')
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    BEGIN
      IF r.prokind = 'p' THEN
        EXECUTE format('REVOKE EXECUTE ON PROCEDURE %I.%I(%s) FROM anon, PUBLIC',
          r.nspname, r.proname, r.args);
      ELSE
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon, PUBLIC',
          r.nspname, r.proname, r.args);
      END IF;
      v_revoked := v_revoked + 1;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  IF v_fixed > 0 OR v_revoked > 0 THEN
    RAISE LOG 'AUTOFIX: % views corrigidas, % fns revogadas de anon (ALL app schemas)', v_fixed, v_revoked;
  END IF;
END;
$$;
