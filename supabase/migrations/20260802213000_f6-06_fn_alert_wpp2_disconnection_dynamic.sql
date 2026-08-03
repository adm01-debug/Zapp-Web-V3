-- F6-06: fn_alert_wpp2_disconnection — remover hardcode 'wpp2', parâmetro instance_name dinâmico
-- Aplicado em produção via Supabase MCP (role postgres) em 2026-08-02.
--
-- Mudanças:
-- 1. Nova assinatura: fn_alert_wpp2_disconnection(p_instance_name text DEFAULT 'wpp2')
--    - DEFAULT preserva a chamada sem argumentos do pg_cron job 104
--      (SELECT zapp.fn_alert_wpp2_disconnection()) — comportamento idêntico para wpp2.
-- 2. Corpo 100% dinâmico: WHERE instance_name = p_instance_name; alert_type =
--    p_instance_name || '_disconnection' (para 'wpp2' produz exatamente 'wpp2_disconnection',
--    mantendo dedup e histórico); título/mensagem/payload usam p_instance_name.
-- 3. Retorno: chave 'wpp2_status' → 'instance_status' + 'instance_name' (único caller é o
--    cron, que ignora o retorno).
-- 4. DROP do overload antigo fn_alert_wpp2_disconnection() (sem args): sem ele, a chamada
--    sem args do cron ficaria ambígua ("function is not unique"). Único caller era o cron 104.

CREATE OR REPLACE FUNCTION zapp.fn_alert_wpp2_disconnection(p_instance_name text DEFAULT 'wpp2')
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_conn record;
  v_min_disconnected numeric;
  v_already_alerted boolean;
  v_alert_type text;
BEGIN
  SELECT status, phone_number, last_connected_at, disconnected_at, instance_name, is_active
  INTO v_conn
  FROM zapp.whatsapp_connections
  WHERE instance_name = p_instance_name
  LIMIT 1;

  IF v_conn IS NULL OR v_conn.status = 'connected' THEN
    RETURN jsonb_build_object('status','ok','instance_name',p_instance_name,'instance_status', COALESCE(v_conn.status,'not_found'));
  END IF;

  v_min_disconnected := COALESCE(
    EXTRACT(EPOCH FROM (now() - GREATEST(v_conn.last_connected_at, v_conn.disconnected_at))) / 60,
    9999
  );

  IF v_min_disconnected < 30 THEN
    RETURN jsonb_build_object('status','grace_period','disconnected_min',round(v_min_disconnected::numeric,1));
  END IF;

  v_alert_type := p_instance_name || '_disconnection';

  SELECT EXISTS(
    SELECT 1 FROM evo.evolution_alerts
    WHERE alert_type = v_alert_type
      AND created_at > now() - INTERVAL '60 minutes'
      AND resolved_at IS NULL
  ) INTO v_already_alerted;

  IF v_already_alerted THEN
    RETURN jsonb_build_object('status','already_alerted','disconnected_min',round(v_min_disconnected::numeric,1));
  END IF;

  INSERT INTO evo.evolution_alerts(alert_type, severity, title, message, payload)
  VALUES (
    v_alert_type,
    CASE WHEN v_min_disconnected > 120 THEN 'critical' ELSE 'high' END,
    format('%s DESCONECTADO — Rescan QR necessario', p_instance_name),
    format('Instancia %s (%s) desconectada ha %s minutos. Acesse o manager para reconectar.',
           p_instance_name, v_conn.phone_number, round(v_min_disconnected)::text),
    jsonb_build_object('instance',p_instance_name,'phone',v_conn.phone_number,
                       'disconnected_min',round(v_min_disconnected::numeric,1),
                       'action_required','QR_SCAN','url','https://evolution.atomicabr.com.br/manager')
  );

  RETURN jsonb_build_object('status','alert_created',
    'severity',CASE WHEN v_min_disconnected>120 THEN 'critical' ELSE 'high' END,
    'disconnected_min',round(v_min_disconnected::numeric,1));
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error',SQLERRM,'ts',now());
END;
$function$;

-- Remove o overload antigo (sem args, hardcoded 'wpp2'). Idempotente para fresh DB.
DROP FUNCTION IF EXISTS zapp.fn_alert_wpp2_disconnection();
