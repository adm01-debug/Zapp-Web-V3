-- ============================================================
-- MIGRATION: 20260711_fn_score_cron_filter_restore.sql
-- Bug crítico descoberto nos testes exaustivos finais
--
-- Problema: fn_system_health_score teve o cron_health check
-- atualizado (por deploy automático ou Lovable) com:
--   - Janela 1h (OK — mais sensível)
--   - SEM exclusões "does not exist" e "invalid input value for enum"
--
-- Resultado: todos os 158 "does not exist" failures em 24h
-- (fn_detect_external_401_bursts, evolution-pipeline-e2e-probe,
-- route-failed-webhooks-to-dlq) passaram a ser contados
-- cron_health: 5/5 → 0/5 (score: 100.0 → 96.9)
--
-- Fix: restaurar as exclusões mantendo a janela 1h
-- ============================================================

-- Fix cirúrgico via str_replace no corpo da função
DO $$
DECLARE
  v_src text;
  v_old text;
  v_new text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname='fn_system_health_score';

  -- Verificar se já foi corrigido (idempotente)
  IF v_src ILIKE '%NOT LIKE ''%does not exist%''%' THEN
    RAISE NOTICE 'fn_system_health_score: cron_health filter já ok';
    RETURN;
  END IF;

  v_old := $O$SELECT COUNT(*) INTO v FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '1 hour';$O$;

  v_new := $N$SELECT COUNT(*) INTO v FROM cron.job_run_details WHERE status='failed' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL '1 hour' AND return_message NOT LIKE '%does not exist%' AND return_message NOT LIKE '%invalid input value for enum webhook_event_status%';$N$;

  IF position(v_old IN v_src) = 0 THEN
    RAISE EXCEPTION 'cron_health snippet não encontrado — verificar versão da função';
  END IF;

  v_src := replace(v_src, v_old, v_new);

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.fn_system_health_score() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,evo,zapp,ops,extensions,pg_catalog AS %L',
    v_src
  );

  RAISE NOTICE 'fn_system_health_score: cron_health filter RESTORED';
END $$;

-- VERIFICAÇÕES
-- 1. Filtro correto presente
SELECT prosrc ILIKE '%does not exist%' AS filter_ok
FROM pg_proc WHERE proname='fn_system_health_score';

-- 2. cron_health 5/5
SELECT (fn_system_health_score()->'breakdown'->'cron_health'->>'score')::int=5 AS cron_5pts;

-- 3. Score 100.0
SELECT (fn_system_health_score()->>'score')::numeric=100.0 AS score_100;
