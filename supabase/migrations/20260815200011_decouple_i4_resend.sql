-- =============================================================================
-- 20260815200011_decouple_i4_resend.sql
-- Etapa I4 (Fase 2, E26–E40 do Plano de Independência ZAPP×Evolution)
-- Objetivo: eliminar a URL hardcoded do Resend (egresso de email) em
-- ops.fn_notify_critical_alerts, parametrizando via vault (padrão da onda).
-- Idempotente: CREATE OR REPLACE — aplicável em qualquer ordem com a E17.
-- Data: 2026-08-15
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.fn_notify_critical_alerts()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ops', 'zapp', 'evo', 'pg_catalog'
AS $function$
DECLARE
  v_cfg        record;
  v_alert      record;
  v_url        text;
  v_key        text;
  v_resend_key text;
  v_resend_url text;
  v_ext_url    text;
  v_payload    jsonb;
  v_sent       int := 0;
  v_conn_ok    boolean := false;
BEGIN
  SELECT * INTO v_cfg FROM ops.notification_config WHERE id=1 AND enabled;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'reason','config_ausente_ou_desabilitada');
  END IF;

  v_url        := ops.fn_evo_url();
  v_key        := ops.fn_evo_key();
  SELECT decrypted_secret INTO v_resend_key FROM vault.decrypted_secrets WHERE name='resend_api_key';
  SELECT decrypted_secret INTO v_ext_url FROM vault.decrypted_secrets WHERE name='external_notification_url';
  v_resend_url := COALESCE(ops.fn_get_vault_secret('resend_api_url'), 'https://api.resend.com');

  -- Verificar se wpp2 está conectado (guard de sessão)
  SELECT (wc.status='connected' AND wc.updated_at > now()-interval '10 minutes')
  INTO v_conn_ok
  FROM zapp.whatsapp_connections wc
  WHERE wc.instance_name = coalesce(v_cfg.instance,'wpp2')
  LIMIT 1;

  FOR v_alert IN
    SELECT * FROM ops.pending_critical_alerts
    WHERE notified_at IS NULL
    ORDER BY created_at
    LIMIT 5
  LOOP
    -- Canal WhatsApp
    IF coalesce(v_conn_ok, false) AND v_url IS NOT NULL AND v_key IS NOT NULL THEN
      PERFORM net.http_post(
        url     := rtrim(v_url,'/')||'/message/sendText/'||v_cfg.instance,
        headers := jsonb_build_object('Content-Type','application/json','apikey',v_key),
        body    := jsonb_build_object(
          'number', v_cfg.target_jid,
          'text',   chr(128680)||' *ALERTA CRITICO ZAPP WEBB*'||chr(10)||chr(10)
                    ||'*'||coalesce(v_alert.title,v_alert.alert_type)||'*'||chr(10)
                    ||coalesce(v_alert.message,'')||chr(10)||chr(10)
                    ||chr(9200)||' '||to_char(v_alert.created_at AT TIME ZONE 'America/Sao_Paulo','DD/MM HH24:MI')
                    ||chr(10)||'#'||v_alert.alert_type),
        params  := '{}',
        timeout_milliseconds := 5000
      );
    END IF;

    -- Canal webhook externo
    IF v_ext_url IS NOT NULL AND v_ext_url <> '' THEN
      PERFORM net.http_post(
        url     := v_ext_url,
        headers := jsonb_build_object('Content-Type','application/json'),
        body    := jsonb_build_object(
          'severity',   'critical',
          'alert_type', v_alert.alert_type,
          'message',    coalesce(v_alert.message,''),
          'title',      coalesce(v_alert.title,v_alert.alert_type),
          'created_at', v_alert.created_at::text,
          'source',     'fn_notify_critical_alerts_v6'),
        params  := '{}',
        timeout_milliseconds := 5000
      );
    END IF;

    -- Canal email Resend
    IF v_resend_key IS NOT NULL THEN
      PERFORM net.http_post(
        url     := v_resend_url || '/emails',
        headers := jsonb_build_object('Authorization','Bearer '||v_resend_key,'Content-Type','application/json'),
        body    := jsonb_build_object(
          'from',    'AtomicaBR Alertas <alertas@promobrindes.com.br>',
          'to',      ARRAY['ti@promobrindes.com.br'],
          'subject', chr(128680)||' [CRITICO] '||coalesce(v_alert.title,v_alert.alert_type),
          'html',    '<div style="font-family:Arial,sans-serif">'
                     ||'<div style="background:#c0392b;padding:16px;border-radius:6px 6px 0 0">'
                     ||'<h2 style="color:#fff;margin:0">Alerta Critico ZAP WEBB</h2></div>'
                     ||'<div style="padding:20px;border:1px solid #ddd">'
                     ||'<p><b>Tipo:</b> '||coalesce(v_alert.alert_type,'?')||'</p>'
                     ||'<p><b>Titulo:</b> '||coalesce(v_alert.title,'?')||'</p>'
                     ||'<p><b>Mensagem:</b><br>'||replace(coalesce(v_alert.message,'?'),chr(10),'<br>')||'</p>'
                     ||'<hr><p style="color:#999;font-size:12px">'
                     ||to_char(v_alert.created_at AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI:SS')
                     ||' BRT — ops.fn_notify_critical_alerts v6</p></div></div>'),
        params  := '{}',
        timeout_milliseconds := 10000
      );
    END IF;

    -- Marcar como notificado na VIEW (propaga para zapp.evolution_alerts)
    UPDATE ops.pending_critical_alerts
    SET notified_at = now()
    WHERE id = v_alert.id;

    v_sent := v_sent + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',           true,
    'sent',         v_sent,
    'wpp_session',  v_conn_ok,
    'triple_channel', true,
    'version',      'v6-fix-pending-view-20260814'
  );
EXCEPTION WHEN OTHERS THEN
  -- Apenas exceções reais chegam aqui (VIEW existe, v_conn_ok declarado)
  RETURN jsonb_build_object('ok',false,'error',SQLERRM,'version','v6');
END;
$function$
