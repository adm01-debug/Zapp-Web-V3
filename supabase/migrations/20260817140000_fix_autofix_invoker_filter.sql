-- ============================================================================
-- Migration: 20260817140000_fix_autofix_invoker_filter.sql
-- Fix (rodada 4): o filtro do autofix era CEGO — ILIKE '%security_invoker%' pulava
-- views com security_invoker=false EXPLICITO (causa raiz do acumulo das 7 views).
-- Novo filtro: captura reloptions NULL, outros reloptions, =false, =off;
-- pula apenas as DUAS grafias validas (=true, =on). APLICADO em prod 2026-08-17.
-- ============================================================================
CREATE OR REPLACE FUNCTION zapp.fn_autofix_security_invoker()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE v_fixed int := 0; v_revoked int := 0; r record;
BEGIN
  FOR r IN SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','zapp','evo','artes','financeiro','monitoring','ops','vendas','email_app','ai','bpm','archive','logistica')
      AND c.relkind='v'
      AND (c.reloptions IS NULL OR NOT (array_to_string(c.reloptions, ',') ILIKE ANY (ARRAY['%security_invoker=true%', '%security_invoker=on%'])))
  LOOP
    EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = true)', r.nspname, r.relname);
    v_fixed := v_fixed + 1;
  END LOOP;

  FOR r IN SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prokind
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('zapp','evo','public','artes','financeiro','monitoring','ops','vendas','email_app','ai','bpm','archive','logistica')
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    BEGIN
      IF r.prokind = 'p' THEN
        EXECUTE format('REVOKE EXECUTE ON PROCEDURE %I.%I(%s) FROM anon, PUBLIC', r.nspname, r.proname, r.args);
      ELSE
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon, PUBLIC', r.nspname, r.proname, r.args);
      END IF;
      v_revoked := v_revoked + 1;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  IF v_fixed > 0 OR v_revoked > 0 THEN
    RAISE LOG 'AUTOFIX: % views corrigidas, % fns revogadas de anon (ALL app schemas)', v_fixed, v_revoked;
  END IF;
END;
$function$;
CREATE OR REPLACE FUNCTION zapp.fn_trg_auto_security_invoker()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'pg_catalog'
AS $function$
DECLARE obj record; v_schema text; v_name text;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE VIEW','ALTER VIEW','CREATE OR REPLACE VIEW')
      AND object_type = 'view'
  LOOP
    v_schema := split_part(obj.object_identity, '.', 1);
    v_name   := split_part(obj.object_identity, '.', 2);
    IF v_schema IN ('public','zapp','evo','artes','financeiro','monitoring','ops','vendas','email_app','ai','bpm','archive','logistica') THEN
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname = v_schema AND c.relname = v_name AND c.relkind = 'v'
            AND c.reloptions IS NOT NULL
            AND (array_to_string(c.reloptions, ',') ILIKE ANY (ARRAY['%security_invoker=true%', '%security_invoker=on%']))
        ) THEN
          EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = true)', v_schema, v_name);
        END IF;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END LOOP;
END;
$function$;
