-- Migration: ops.pending_critical_alerts VIEW + fn_notify_critical_alerts v6
-- Bug detectado em auditoria exaustiva 2026-08-14 07h BRT
--
-- PR#1072 (Hermes) sobrescreveu fn_notify_critical_alerts com versão que referencia
-- ops.pending_critical_alerts (VIEW de abstração) sem criá-la. A função também
-- não declarava v_conn_ok, causando falha silenciosa — EXCEPTION WHEN OTHERS capturava
-- o erro e o cron marcava succeeded enquanto NENHUMA notificação era disparada.
--
-- Fix: criar a VIEW de abstração que o Hermes planejou + corrigir a função (v6):
--   - Declarar v_conn_ok (boolean)
--   - Usar VIEW updatable (is_updatable=YES, SELECT simples sem GROUP BY/DISTINCT)
--   - Triple channel: WhatsApp + webhook externo + email Resend
--   - jsonb_build_object() em todos os headers (fix B3 preservado)
--   - EXCEPTION WHEN OTHERS apenas para erros reais (VIEW existe, v_conn_ok declarado)

-- 1. VIEW de abstração (design do Hermes respeitado)
CREATE OR REPLACE VIEW ops.pending_critical_alerts AS
SELECT id, alert_type, severity, title, message, payload,
       notified_at, resolved, resolved_at, created_at
FROM zapp.evolution_alerts
WHERE severity = 'critical'
  AND coalesce(resolved, false) = false
  AND created_at > now() - interval '48 hours';

GRANT SELECT, UPDATE ON ops.pending_critical_alerts TO service_role;

-- 2. Função v6 — design do Hermes + v_conn_ok declarado + triple channel
CREATE OR REPLACE FUNCTION ops.fn_notify_critical_alerts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, zapp, evo, pg_catalog
AS $$
DECLARE
  v_cfg        record;
  v_alert      record;
  v_url        text;
  v_key        text;
  v_resend_key text;
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
  SELECT decrypted_secret INTO v_ext_url   FROM vault.decrypted_secrets WHERE name='external_notification_url';

  SELECT (wc.status='connected' AND wc.updated_at > now()-interval '10 minutes')
  INTO v_conn_ok
  FROM zapp.whatsapp_connections wc
  WHERE wc.instance_name = coalesce(v_cfg.instance,'wpp2') LIMIT 1;

  FOR v_alert IN
    SELECT * FROM ops.pending_critical_alerts WHERE notified_at IS NULL ORDER BY created_at LIMIT 5
  LOOP
    IF coalesce(v_conn_ok,false) AND v_url IS NOT NULL AND v_key IS NOT NULL THEN
      PERFORM net.http_post(
        url:=rtrim(v_url,'/')||'/message/sendText/'||v_cfg.instance,
        headers:=jsonb_build_object('Content-Type','application/json','apikey',v_key),
        body:=jsonb_build_object('number',v_cfg.target_jid,'text',
          chr(128680)||' *ALERTA CRITICO ZAPP WEBB*'||chr(10)||chr(10)
          ||'*'||coalesce(v_alert.title,v_alert.alert_type)||'*'||chr(10)
          ||coalesce(v_alert.message,'')||chr(10)||chr(10)
          ||chr(9200)||' '||to_char(v_alert.created_at AT TIME ZONE 'America/Sao_Paulo','DD/MM HH24:MI')
          ||chr(10)||'#'||v_alert.alert_type),
        params:='{}', timeout_milliseconds:=5000);
    END IF;
    IF v_ext_url IS NOT NULL AND v_ext_url<>'' THEN
      PERFORM net.http_post(url:=v_ext_url,
        headers:=jsonb_build_object('Content-Type','application/json'),
        body:=jsonb_build_object('severity','critical','alert_type',v_alert.alert_type,
          'message',coalesce(v_alert.message,''),'title',coalesce(v_alert.title,v_alert.alert_type),
          'created_at',v_alert.created_at::text,'source','fn_notify_critical_alerts_v6'),
        params:='{}', timeout_milliseconds:=5000);
    END IF;
    IF v_resend_key IS NOT NULL THEN
      PERFORM net.http_post(url:='https://api.resend.com/emails',
        headers:=jsonb_build_object('Authorization','Bearer '||v_resend_key,'Content-Type','application/json'),
        body:=jsonb_build_object('from','AtomicaBR Alertas <alertas@promobrindes.com.br>',
          'to',ARRAY['ti@promobrindes.com.br'],
          'subject',chr(128680)||' [CRITICO] '||coalesce(v_alert.title,v_alert.alert_type),
          'html','<div style="font-family:Arial,sans-serif"><div style="background:#c0392b;padding:16px;border-radius:6px 6px 0 0"><h2 style="color:#fff;margin:0">Alerta Critico ZAP WEBB</h2></div><div style="padding:20px;border:1px solid #ddd"><p><b>Tipo:</b> '||coalesce(v_alert.alert_type,'?')||'</p><p><b>Titulo:</b> '||coalesce(v_alert.title,'?')||'</p><p><b>Mensagem:</b><br>'||replace(coalesce(v_alert.message,'?'),chr(10),'<br>')||'</p><hr><p style="color:#999;font-size:12px">'||to_char(v_alert.created_at AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI:SS')||' BRT - v6</p></div></div>'),
        params:='{}', timeout_milliseconds:=10000);
    END IF;
    UPDATE ops.pending_critical_alerts SET notified_at=now() WHERE id=v_alert.id;
    v_sent := v_sent+1;
  END LOOP;

  RETURN jsonb_build_object('ok',true,'sent',v_sent,'wpp_session',v_conn_ok,'triple_channel',true,'version','v6-fix-pending-view-20260814');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok',false,'error',SQLERRM,'version','v6');
END;
$$;
