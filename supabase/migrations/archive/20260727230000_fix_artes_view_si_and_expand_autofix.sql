-- ============================================================
-- MIGRATION: fix_security_invoker_artes_and_autofix_expansion
-- DATE: 2026-07-27
-- ISSUE 1: artes.v_pedidos sem security_invoker (owned by supabase_admin, BYPASSRLS)
--   → authenticated users bypassing RLS on vendas.ordens_compra + artes.fechamentos
-- ISSUE 2: fn_autofix_security_invoker só cobria public/zapp/evo
--   → views em artes/financeiro criadas sem security_invoker não seriam autocorrigidas
-- ============================================================

-- FIX 1: corrigir artes.v_pedidos
ALTER VIEW artes.v_pedidos SET (security_invoker = true);

-- FIX 2: expandir fn_autofix para cobrir artes e financeiro
CREATE OR REPLACE FUNCTION zapp.fn_autofix_security_invoker()
RETURNS void LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, pg_catalog AS $$
DECLARE v_fixed int := 0; v_revoked int := 0; r record;
BEGIN
  -- Corrige views sem security_invoker em TODOS os schemas de aplicação
  FOR r IN SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','zapp','evo','artes','financeiro')
      AND c.relkind='v'
      AND NOT (c.reloptions IS NOT NULL AND array_to_string(c.reloptions,',') ILIKE '%security_invoker%')
  LOOP
    EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = true)', r.nspname, r.relname);
    v_fixed := v_fixed + 1;
  END LOOP;

  -- Revoga EXECUTE de anon/PUBLIC em zapp e evo
  FOR r IN SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prokind
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('zapp','evo') AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    BEGIN
      IF r.prokind = 'p' THEN
        EXECUTE format('REVOKE EXECUTE ON PROCEDURE %I.%I(%s) FROM anon, PUBLIC', r.nspname, r.proname, r.args);
      ELSE
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon, PUBLIC', r.nspname, r.proname, r.args);
      END IF;
      v_revoked := v_revoked + 1;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;

  IF v_fixed > 0 OR v_revoked > 0 THEN
    RAISE LOG 'AUTOFIX: % views corrigidas (artes+financeiro+public+zapp+evo), % funções revogadas de anon', v_fixed, v_revoked;
  END IF;
END;
$$;

-- VERIFICAÇÃO: artes.v_pedidos deve ter security_invoker=true
-- SELECT array_to_string(reloptions,',') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
-- WHERE n.nspname='artes' AND c.relname='v_pedidos'; -- expected: security_invoker=true
