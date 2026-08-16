-- ============================================================================
-- Migration: 20260816090000_drop_dead_functions_zapp_evo
-- Data:       2026-08-16
-- Autor:      auditoria read-only via catálogo (pg_proc/pg_depend/cron/triggers/views)
-- Estado:     GERADO — NÃO APLICADO (aguarda revisão/aprovação)
--
-- Alvo: funções "mortas-quebradas" (zero callers no catálogo + corpo quebrado):
--   1) zapp.zapp_mark_status_viewed(p_message_id text, p_instance text)
--        - wrapper SECURITY DEFINER -> evo.fn_mark_status_viewed(...)
--        - base NAO EXISTE no banco (função quebrada em runtime)
--        - zero referências: prosrc, pg_depend (todos deptypes), cron.job,
--          pg_trigger, pg_rewrite (views/matviews), pg_policy, pg_attrdef,
--          pg_event_trigger; zero GRANTs (anon/auth/public = false)
--   2) evo.fn_burnin_monitor()
--        - SECURITY DEFINER -> evo.fn_burnin_disconnection_check() e
--          evo.fn_burnin_critical_alert_check() — AMBAS NAO EXISTEM (quebrada)
--        - zero referências nos mesmos 8 catálogos acima
--        - OBS: GRANT EXECUTE authenticated existe (superfície RPC exposta mas
--          quebrada) — o DROP elimina o grant junto.
--
-- Guardas embutidas: só executa DROP se (a) a função existir e (b) zero
-- dependências de objeto (pg_depend) E zero referências textuais em
-- funções/cron/views/triggers/policies/defaults. Se qualquer guarda falhar,
-- a função é pulada com RAISE NOTICE (nada é dropado por engano).
-- ============================================================================

DO $$
DECLARE
  v_fn      record;
  v_deps    int;
  v_refs    int;
  v_dropped text[] := '{}';
  v_skipped text[] := '{}';
  v_cron_ok boolean;
BEGIN
  v_cron_ok := to_regclass('cron.job') IS NOT NULL;

  FOR v_fn IN
    SELECT n.nspname AS schema, p.proname,
           pg_get_function_identity_arguments(p.oid) AS sig,
           p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE (n.nspname = 'zapp' AND p.proname = 'zapp_mark_status_viewed')
       OR (n.nspname = 'evo'  AND p.proname = 'fn_burnin_monitor')
  LOOP
    -- Guarda 1: dependentes de objeto (qualquer deptype, excluindo self)
    SELECT count(*) INTO v_deps
    FROM pg_depend d
    WHERE d.refobjid = v_fn.oid AND d.objid <> v_fn.oid;

    -- Guarda 2: referências textuais em outros objetos executáveis
    SELECT count(*) INTO v_refs
    FROM (
      SELECT p2.oid FROM pg_proc p2
       JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
       WHERE p2.prosrc ~* v_fn.proname AND p2.oid <> v_fn.oid
      UNION ALL
      SELECT c.jobid FROM cron.job c
       WHERE v_cron_ok AND c.command ~* v_fn.proname
      UNION ALL
      SELECT r.ev_class FROM pg_rewrite r
       WHERE r.ev_action::text ~* v_fn.proname
      UNION ALL
      SELECT tg.oid FROM pg_trigger tg
       JOIN pg_proc f2 ON f2.oid = tg.tgfoid
       WHERE f2.proname = v_fn.proname
      UNION ALL
      SELECT pol.oid FROM pg_policy pol
       WHERE (pol.polqual IS NOT NULL AND pg_get_expr(pol.polqual, pol.polrelid) ~* v_fn.proname)
          OR (pol.polwithcheck IS NOT NULL AND pg_get_expr(pol.polwithcheck, pol.polrelid) ~* v_fn.proname)
      UNION ALL
      SELECT d2.oid FROM pg_attrdef d2
       WHERE pg_get_expr(d2.adbin, d2.adrelid) ~* v_fn.proname
      UNION ALL
      SELECT evt.oid FROM pg_event_trigger evt
       WHERE evt.evtname ~* v_fn.proname
    ) refs;

    IF v_deps = 0 AND v_refs = 0 THEN
      EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s)',
                     v_fn.schema, v_fn.proname, v_fn.sig);
      v_dropped := v_dropped || format('%I.%I(%s)', v_fn.schema, v_fn.proname, v_fn.sig);
    ELSE
      v_skipped := v_skipped ||
        format('%I.%I(%s) [%s deps, %s refs]', v_fn.schema, v_fn.proname, v_fn.sig, v_deps, v_refs);
    END IF;
  END LOOP;

  RAISE NOTICE 'DROP_OK: %', COALESCE(array_to_string(v_dropped, ', '), '(nenhuma)');
  RAISE NOTICE 'DROP_SKIPPED: %', COALESCE(array_to_string(v_skipped, ', '), '(nenhuma)');
END $$;

-- Verificação pós-DROP (idempotente): deve retornar 0 linhas
SELECT n.nspname AS schema, p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE (n.nspname = 'zapp' AND p.proname = 'zapp_mark_status_viewed')
   OR (n.nspname = 'evo'  AND p.proname = 'fn_burnin_monitor');
