-- Migration: fn_system_health_score — filtrar orphan cron runs (jobid não existe em cron.job)
-- Detectado em auditoria exaustiva 2026-08-14 BRT (B8)
--
-- Bug: a contagem de failures_1h e failures_24h incluía runs de jobids
-- que não existem mais em cron.job (jobs deletados/cancelados durante sessões anteriores).
-- Esses runs com return_message='job canceled' inflavam artificialmente o cron_health score.
-- 
-- Fix: adicionar AND jobid IN (SELECT jobid FROM cron.job) nas 2 queries COUNT.
-- Impacto: failures_24h 25→23 (2 orphan runs excluídos), score permanece 100.0 A+.
-- Cirúrgico: substitui apenas os trechos de COUNT, mantém toda a lógica restante intacta.

DO $$
DECLARE
  v_src text;
  v_old_1h  text := 'SELECT COUNT(*) INTO v FROM cron.job_run_details WHERE status=''failed'' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL ''1 hour'' AND return_message NOT LIKE ''%does not exist%'' AND return_message NOT LIKE ''%invalid input value for enum webhook_event_status%'' AND return_message NOT LIKE ''%health_status_check%'';';
  v_new_1h  text := 'SELECT COUNT(*) INTO v FROM cron.job_run_details WHERE status=''failed'' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL ''1 hour'' AND return_message NOT LIKE ''%does not exist%'' AND return_message NOT LIKE ''%invalid input value for enum webhook_event_status%'' AND return_message NOT LIKE ''%health_status_check%'' AND jobid IN (SELECT jobid FROM cron.job);';
  v_old_24h text := 'SELECT COUNT(*) FROM cron.job_run_details WHERE status=''failed'' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL ''24 hours''';
  v_new_24h text := 'SELECT COUNT(*) FROM cron.job_run_details WHERE status=''failed'' AND start_time IS NOT NULL AND start_time>NOW()-INTERVAL ''24 hours'' AND jobid IN (SELECT jobid FROM cron.job)';
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.proname='fn_system_health_score' AND n.nspname='zapp';

  -- Idempotência: só aplica se o fix ainda não estiver presente
  IF v_src LIKE '%jobid IN (SELECT jobid FROM cron.job)%' THEN
    RAISE NOTICE 'fn_system_health_score já possui o filtro de orphan runs — idempotente, nada a fazer.';
    RETURN;
  END IF;

  v_src := replace(v_src, v_old_1h,  v_new_1h);
  v_src := replace(v_src, v_old_24h, v_new_24h);

  IF v_src NOT LIKE '%jobid IN (SELECT jobid FROM cron.job)%' THEN
    RAISE EXCEPTION 'Substituição falhou — trecho não localizado. Verifique se a função foi alterada.';
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION zapp.fn_system_health_score() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = zapp, evo, ops, public, pg_catalog AS $fn$' || v_src || '$fn$';
  RAISE NOTICE 'fn_system_health_score atualizada — orphan cron runs excluídos do cron_health.';
END;
$$;
