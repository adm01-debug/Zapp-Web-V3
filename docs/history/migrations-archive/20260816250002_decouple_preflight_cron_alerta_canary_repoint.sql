-- 2026-08-16: (a) preflight agendado + alerta; (b) repoint do canary (aux E70 parcial).
--
-- (a) ops.fn_preflight_hourly(): roda ops.fn_decouple_preflight() 1x/hora
--     (cron ops-decouple-preflight-hourly, '5 * * * *'); se ok=false, INSERT em
--     zapp.evolution_alerts tipo 'decouple_preflight_fail' (warning) com dedupe
--     (nao empilha enquanto houver alerta aberto do tipo). Smoke: dedupe validado
--     (2 runs -> 1 alerta); a proxima quebra de cron aparece em <=1h.
-- (b) zapp.fn_pipeline_canary_insert(): encapsula o INSERT do canario
--     (cron 429 pipeline-canary-keep-alive) — fn zapp->zapp, zero violacao;
--     INSERT na TABELA-MAE zapp.evolution_messages (roteia p/ particao; smoke
--     confirmou fallthrough p/ _wpp2). aux_cron_citando_zapp_evolution_tables 6->5.
--     Os 5 crons restantes do aux NAO sao repontaveis pre-I4: 3 DO-blocks mistos
--     (repopula-fila, schema-guardian, phonejid-watchdog — encapsular em fn
--     pioraria I1 ou I2; views de contrato zapp.* so existem pos-move E73-E77)
--     e 2 VACUUMs (VACUUM nao roda dentro de funcao). Ficam para o I4.
-- JA APLICADA em producao (registro 20260816250002).

CREATE OR REPLACE FUNCTION ops.fn_preflight_hourly()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ops, pg_catalog, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := ops.fn_decouple_preflight();
  IF (v_result->>'ok')::boolean IS DISTINCT FROM true THEN
    IF NOT EXISTS (SELECT 1 FROM zapp.evolution_alerts
                   WHERE alert_type = 'decouple_preflight_fail' AND resolved_at IS NULL) THEN
      INSERT INTO zapp.evolution_alerts (alert_type, severity, title, message, payload)
      VALUES ('decouple_preflight_fail', 'warning',
              'Preflight do desacoplamento falhou',
              'crons quebrados: ' || (v_result->'crons_quebrados')::text ||
              ' | cron_failures_1h: ' || (v_result->>'cron_failures_1h'),
              v_result);
    END IF;
  END IF;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION ops.fn_preflight_hourly() FROM PUBLIC;

SELECT cron.schedule('ops-decouple-preflight-hourly', '5 * * * *',
  $$SELECT ops.fn_preflight_hourly()$$);

CREATE OR REPLACE FUNCTION zapp.fn_pipeline_canary_insert()
RETURNS void LANGUAGE sql SECURITY DEFINER
SET search_path = zapp, pg_catalog, pg_temp
AS $$
  INSERT INTO zapp.evolution_messages (
    message_id, remote_jid, from_me, message_type, push_name,
    instance_name, content, created_at, direction, status, ingest_meta)
  VALUES (
    'pg-cron-canary-' || floor(extract(epoch from now()))::text,
    'pg-cron-canary-system@localhost',
    true, 'conversation', 'CANARY-SYSTEM', 'wpp2',
    '[pg-cron-canary] keep-alive ' || now()::text,
    now(), 'outbound', 'sent',
    jsonb_build_object('source', 'pg-cron-canary', 'type', 'synthetic', 'lid_safe', true, 'fixed_at', '20260816-repoint'))
  ON CONFLICT (message_id, instance_name) DO NOTHING;
$$;
REVOKE ALL ON FUNCTION zapp.fn_pipeline_canary_insert() FROM PUBLIC;

-- repoint do job 429 (idempotente por jobname)
DO $do$
DECLARE v_id bigint;
BEGIN
  SELECT jobid INTO v_id FROM cron.job WHERE jobname='pipeline-canary-keep-alive';
  IF v_id IS NOT NULL THEN
    PERFORM cron.alter_job(v_id, command := 'SELECT zapp.fn_pipeline_canary_insert()');
  END IF;
END $do$;
