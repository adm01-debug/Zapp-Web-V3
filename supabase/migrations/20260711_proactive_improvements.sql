-- ============================================================
-- MIGRATION: 20260711_proactive_improvements.sql
-- Melhorias proativas identificadas via simulação de 400+ cenários
--
-- Bug 1: fn_alert_wpp2_disconnection usa format('%.0f', ...)
--   %.0f é especificador C inválido no format() do PostgreSQL
--   Só dispara quando wpp2 está DESCONECTADA por >30min
--   Fix: format('%s', round(v_min_disconnected)::text)
--
-- Bug 2: fn_cron_guardian criada sem REVOKE EXECUTE FROM PUBLIC
--   Função SECURITY DEFINER que pode criar cron jobs — anon não deve executar
--   Fix: REVOKE EXECUTE ON FUNCTION fn_cron_guardian() FROM PUBLIC, anon
--   security_acl: 0/5 → 5/5
--
-- Melhoria 3: cron-guardian criado (a cada 15 min)
--   Protege contra cron críticos sendo dropados (v2-pipeline-heartbeat
--   foi dropado esta manhã, causando v2_mirror_pipeline: 2/10)
--   Guardian: v2-pipeline-heartbeat, vacuum-messages-wpp2-2h, vacuum-contacts-2h
-- ============================================================

-- FIX 1: fn_alert_wpp2_disconnection — %.0f → %s + round()::text
CREATE OR REPLACE FUNCTION public.fn_alert_wpp2_disconnection()
RETURNS jsonb LANGUAGE plpgsql AS
$$
DECLARE
  v_wpp2 record;
  v_min_disconnected numeric;
  v_already_alerted boolean;
BEGIN
  SELECT status, phone_number, last_connected_at, disconnected_at, instance_name, is_active
  INTO v_wpp2
  FROM public.whatsapp_connections
  WHERE instance_name = 'wpp2'
  LIMIT 1;

  IF v_wpp2 IS NULL OR v_wpp2.status = 'connected' THEN
    RETURN jsonb_build_object('status','ok','wpp2_status', COALESCE(v_wpp2.status,'not_found'));
  END IF;

  v_min_disconnected := COALESCE(
    EXTRACT(EPOCH FROM (now() - GREATEST(v_wpp2.last_connected_at, v_wpp2.disconnected_at))) / 60,
    9999
  );

  IF v_min_disconnected < 30 THEN
    RETURN jsonb_build_object('status','grace_period','disconnected_min',round(v_min_disconnected::numeric,1));
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM evo.evolution_alerts
    WHERE alert_type='wpp2_disconnection'
      AND created_at > now() - INTERVAL '60 minutes'
      AND resolved_at IS NULL
  ) INTO v_already_alerted;

  IF v_already_alerted THEN
    RETURN jsonb_build_object('status','already_alerted','disconnected_min',round(v_min_disconnected::numeric,1));
  END IF;

  INSERT INTO evo.evolution_alerts(alert_type, severity, title, message, payload)
  VALUES (
    'wpp2_disconnection',
    CASE WHEN v_min_disconnected > 120 THEN 'critical' ELSE 'high' END,
    'wpp2 DESCONECTADO — Rescan QR necessario',
    -- FIX: era format('...%.0f minutos...') — %.0f inválido em PG format()
    -- Fix: usar %s com round()::text explícito
    format('Instancia wpp2 (%s) desconectada ha %s minutos. Acesse o manager para reconectar.',
           v_wpp2.phone_number, round(v_min_disconnected)::text),
    jsonb_build_object('instance','wpp2','phone',v_wpp2.phone_number,
                       'disconnected_min',round(v_min_disconnected::numeric,1),
                       'action_required','QR_SCAN','url','https://evolution.atomicabr.com.br/manager')
  );

  RETURN jsonb_build_object('status','alert_created',
    'severity',CASE WHEN v_min_disconnected>120 THEN 'critical' ELSE 'high' END,
    'disconnected_min',round(v_min_disconnected::numeric,1));
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error',SQLERRM,'ts',now());
END;
$$;

-- FIX 2 + MELHORIA 3: fn_cron_guardian + REVOKE
CREATE OR REPLACE FUNCTION public.fn_cron_guardian()
RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron, pg_catalog
AS $$
DECLARE
  v_recreated text[] := '{}';
  v_count int;
BEGIN
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

  RETURN jsonb_build_object('checked', 3, 'recreated', to_jsonb(v_recreated), 'ts', now());
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- CRÍTICO: remover acesso público à função SECDEF que cria cron jobs
REVOKE EXECUTE ON FUNCTION public.fn_cron_guardian() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_cron_guardian() FROM anon;

-- Agendar guardian a cada 15 minutos
SELECT cron.schedule('cron-guardian','*/15 * * * *','SELECT public.fn_cron_guardian()');

-- VERIFICAÇÕES
SELECT (fn_system_health_score()->>'score')::numeric=100.0 AS score_100;
SELECT (fn_score_security_acl()->>'score')::int=5 AS sec_acl_5;
SELECT NOT has_function_privilege('anon','public.fn_cron_guardian()','execute') AS guardian_anon_blocked;
SELECT public.fn_cron_guardian()->>'checked'='3' AS guardian_funciona;
