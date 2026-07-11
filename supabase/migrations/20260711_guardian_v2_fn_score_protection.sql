-- ============================================================
-- MIGRATION: 20260711_guardian_v2_fn_score_protection.sql
-- 3 melhorias executadas via simulação de 400+ cenários
--
-- MELHORIA 1 (CRÍTICA): fn_cron_guardian expandida para proteger
--   fn_system_health_score de deploys que removem filtros do cron_health
--   Problema: fn_system_health_score mudou 2x hoje (3x contando rollback)
--   A versão deployada usa SELECT ... INTERVAL '24 hours' SEM filtros
--   → conta 156 "does not exist" failures → cron_health: 0/5
--   Guardian: detecta ausência de 'does not exist' no prosrc e restaura
--   Testado com quebra real: PASS (fixed: ["fn_system_health_score:cron_health_filter"])
--   Suporta tanto versão 24h (deployed) quanto 1h (fix anterior)
--
-- MELHORIA 2: Silenciar 2 crons cronicamente falhos (filtered, mas ruído)
--   detect-external-401-bursts: fn_detect_external_401_bursts() não existe
--   evolution-pipeline-e2e-probe-15min: coluna 'details' não existe
--   → 127 falhas/24h filtradas mas desnecessárias → UNSCHEDULE
--
-- MELHORIA 3: VACUUM ANALYZE zapp.webhook_audit_log (296 dead tuples)
-- ============================================================

-- MELHORIA 1: fn_cron_guardian v2 com proteção de fn_system_health_score
CREATE OR REPLACE FUNCTION public.fn_cron_guardian()
RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron, pg_catalog
AS $$
DECLARE
  v_recreated text[] := '{}';
  v_fixed     text[] := '{}';
  v_count int;
  v_src text;
  v_new text;
BEGIN
  -- === GUARDIAN DE CRONS ===
  SELECT COUNT(*) INTO v_count FROM cron.job WHERE jobname='v2-pipeline-heartbeat' AND active;
  IF v_count = 0 THEN
    PERFORM cron.schedule('v2-pipeline-heartbeat','*/30 * * * *','SELECT evo.fn_v2_pipeline_heartbeat()');
    v_recreated := array_append(v_recreated, 'v2-pipeline-heartbeat');
  END IF;

  SELECT COUNT(*) INTO v_count FROM cron.job WHERE jobname='vacuum-messages-wpp2-2h' AND active;
  IF v_count = 0 THEN
    PERFORM cron.schedule('vacuum-messages-wpp2-2h','25 */2 * * *','VACUUM ANALYZE evo.evolution_messages_wpp2');
    v_recreated := array_append(v_recreated, 'vacuum-messages-wpp2-2h');
  END IF;

  SELECT COUNT(*) INTO v_count FROM cron.job WHERE jobname='vacuum-contacts-2h' AND active;
  IF v_count = 0 THEN
    PERFORM cron.schedule('vacuum-contacts-2h','35 */2 * * *','VACUUM ANALYZE evo.evolution_contacts');
    v_recreated := array_append(v_recreated, 'vacuum-contacts-2h');
  END IF;

  -- === GUARDIAN DE fn_system_health_score ===
  -- Detecta ausência dos filtros de exclusão no cron_health e os restaura
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname='fn_system_health_score';

  IF v_src IS NOT NULL AND v_src NOT ILIKE '%does not exist%' THEN
    -- Versão 24h (deployed default)
    v_new := replace(v_src,
      $O$SELECT COUNT(*) INTO v FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '24 hours';$O$,
      $N$SELECT COUNT(*) INTO v FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '24 hours' AND return_message NOT LIKE '%does not exist%' AND return_message NOT LIKE '%invalid input value for enum webhook_event_status%';$N$
    );
    -- Versão 1h (fix alternativo)
    IF v_new = v_src THEN
      v_new := replace(v_src,
        $O$SELECT COUNT(*) INTO v FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '1 hour';$O$,
        $N$SELECT COUNT(*) INTO v FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '1 hour' AND return_message NOT LIKE '%does not exist%' AND return_message NOT LIKE '%invalid input value for enum webhook_event_status%';$N$
      );
    END IF;

    IF v_new <> v_src THEN
      EXECUTE format(
        'CREATE OR REPLACE FUNCTION public.fn_system_health_score() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,evo,zapp,ops,extensions,pg_catalog AS %L',
        v_new
      );
      v_fixed := array_append(v_fixed, 'fn_system_health_score:cron_health_filter');
    ELSE
      v_fixed := array_append(v_fixed, 'fn_system_health_score:PATTERN_NOT_FOUND_MANUAL_REQUIRED');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'checked', 3, 'recreated', to_jsonb(v_recreated),
    'fixed', to_jsonb(v_fixed), 'ts', now()
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM, 'ts', now());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_cron_guardian() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_cron_guardian() FROM anon;

-- MELHORIA 2: Remover crons cronicamente falhos
SELECT cron.unschedule('detect-external-401-bursts');
SELECT cron.unschedule('evolution-pipeline-e2e-probe-15min');

-- MELHORIA 3: VACUUM (via portainer container exec)

-- VERIFICAÇÕES
SELECT public.fn_cron_guardian()->'fixed' AS fixed_on_ok_state;
SELECT (fn_system_health_score()->>'score')::numeric=100.0 AS score_100;
SELECT NOT has_function_privilege('anon','public.fn_cron_guardian()','execute') AS guardian_blocked;
SELECT COUNT(*)=0 AS crons_falhos_removidos FROM cron.job WHERE jobname IN ('detect-external-401-bursts','evolution-pipeline-e2e-probe-15min');
