-- Migration: fix fn_notify_critical_alerts v5 + analyze-catalogo-diario schema dinâmico
-- Auditoria exaustiva pós-desacoplamento 2026-08-13 22h BRT
-- Aplicado ao banco antes do commit (banco é source of truth).

-- ===========================================================================
-- FIX 1: ops.fn_notify_critical_alerts v5
-- Bug: headers := '{"Content-Type":"application/json"}'::jsonb com \" inválido
--      causava "invalid input syntax for type json" no external webhook.
-- Fix: jsonb_build_object('Content-Type','application/json') em todos os canais.
-- ===========================================================================
CREATE OR REPLACE FUNCTION ops.fn_notify_critical_alerts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, zapp, evo, pg_catalog
AS $$
DECLARE
  v_cfg        record;
  v_alert      record;
  v_sent_wpp   int := 0;
  v_sent_ext   int := 0;
  v_sent_email int := 0;
  v_pending    int := 0;
  v_conn_ok    boolean := false;
  v_req_wpp    bigint;
  v_req_ext    bigint;
  v_req_email  bigint;
  v_url        text;
  v_key        text;
  v_ext_url    text;
  v_resend_key text;
BEGIN
  SELECT * INTO v_cfg FROM ops.notification_config WHERE id = 1 AND enabled;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'reason','config_ausente_ou_desabilitada');
  END IF;
  SELECT decrypted_secret INTO v_url        FROM vault.decrypted_secrets WHERE name='evolution_api_url';
  SELECT decrypted_secret INTO v_key        FROM vault.decrypted_secrets WHERE name='evolution_api_key';
  SELECT decrypted_secret INTO v_resend_key FROM vault.decrypted_secrets WHERE name='resend_api_key';
  v_ext_url := v_cfg.external_webhook_url;
  SELECT count(*) INTO v_pending
  FROM zapp.evolution_alerts
  WHERE severity='critical' AND notified_at IS NULL
    AND coalesce(resolved,false)=false
    AND created_at > now()-interval '48 hours';
  IF v_pending=0 THEN
    RETURN jsonb_build_object('ok',true,'action','sem_pendentes','pendentes',0);
  END IF;
  IF v_url IS NOT NULL AND v_key IS NOT NULL THEN
    SELECT (wc.status='connected' AND ei.health_status IN ('healthy','degraded')
            AND wc.updated_at > now()-interval '10 minutes')
    INTO v_conn_ok
    FROM zapp.whatsapp_connections wc
    JOIN zapp.evolution_instance_credentials ei ON ei.instance_name=wc.instance_name
    WHERE wc.instance_name=v_cfg.instance;
  END IF;
  FOR v_alert IN
    SELECT id,alert_type,title,message,created_at
    FROM zapp.evolution_alerts
    WHERE severity='critical' AND notified_at IS NULL
      AND coalesce(resolved,false)=false
      AND created_at > now()-interval '48 hours'
    ORDER BY created_at LIMIT 5
  LOOP
    v_req_wpp:=NULL; v_req_ext:=NULL; v_req_email:=NULL;
    -- Canal 1: WhatsApp
    IF coalesce(v_conn_ok,false) THEN
      SELECT net.http_post(
        url     := rtrim(v_url,'/')||'/message/sendText/'||v_cfg.instance,
        headers := jsonb_build_object('Content-Type','application/json','apikey',v_key),
        body    := jsonb_build_object(
          'number',v_cfg.target_jid,
          'text',  chr(128680)||' *ALERTA CRITICO ZAPP WEBB*'||chr(10)||chr(10)
                   ||'*'||coalesce(v_alert.title,v_alert.alert_type)||'*'||chr(10)
                   ||coalesce(v_alert.message,'')||chr(10)||chr(10)
                   ||chr(9200)||' '
                   ||to_char(v_alert.created_at AT TIME ZONE 'America/Sao_Paulo','DD/MM HH24:MI')
                   ||chr(10)||'#'||v_alert.alert_type)
      ) INTO v_req_wpp;
      v_sent_wpp:=v_sent_wpp+1;
    END IF;
    -- Canal 2: External webhook (FIXED: jsonb_build_object, era string literal com \"-escapes)
    IF v_ext_url IS NOT NULL AND v_ext_url<>'' THEN
      SELECT net.http_post(
        url     := v_ext_url,
        headers := jsonb_build_object('Content-Type','application/json'),
        body    := jsonb_build_object(
          'severity','critical','alert_type',v_alert.alert_type,
          'message',coalesce(v_alert.message,''),
          'title',coalesce(v_alert.title,v_alert.alert_type),
          'created_at',v_alert.created_at::text,'source','fn_notify_critical_alerts')
      ) INTO v_req_ext;
      v_sent_ext:=v_sent_ext+1;
    END IF;
    -- Canal 3: Email Resend
    IF v_resend_key IS NOT NULL THEN
      SELECT net.http_post(
        url     := 'https://api.resend.com/emails',
        headers := jsonb_build_object('Authorization','Bearer '||v_resend_key,'Content-Type','application/json'),
        body    := jsonb_build_object(
          'from','AtomicaBR Alertas <alertas@promobrindes.com.br>',
          'to',ARRAY['ti@promobrindes.com.br'],
          'subject',chr(128680)||' [CRITICO] '||coalesce(v_alert.title,v_alert.alert_type),
          'html','<div style="font-family:Arial,sans-serif">'
                 ||'<div style="background:#c0392b;padding:16px;border-radius:6px 6px 0 0">'
                 ||'<h2 style="color:#fff;margin:0">Alerta Critico ZAP WEBB</h2></div>'
                 ||'<div style="padding:20px;border:1px solid #ddd">'
                 ||'<p><b>Tipo:</b> '||coalesce(v_alert.alert_type,'?')||'</p>'
                 ||'<p><b>Titulo:</b> '||coalesce(v_alert.title,'?')||'</p>'
                 ||'<p><b>Mensagem:</b><br>'||replace(coalesce(v_alert.message,'?'),chr(10),'<br>')||'</p>'
                 ||'<hr><p style="color:#999;font-size:12px">'
                 ||to_char(v_alert.created_at AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI:SS')
                 ||' BRT - v5-fix-json</p></div></div>')
      ) INTO v_req_email;
      v_sent_email:=v_sent_email+1;
    END IF;
    IF v_sent_wpp>0 OR v_sent_ext>0 OR v_sent_email>0 THEN
      UPDATE zapp.evolution_alerts
      SET notified_at=now(),
          payload=coalesce(payload,'{}'::jsonb)||jsonb_build_object(
            'notify_req_wpp',v_req_wpp,'notify_req_ext',v_req_ext,
            'notify_req_email',v_req_email,'notify_at',now()::text,
            'canal_wpp_tried',v_sent_wpp>0,'canal_ext_tried',v_sent_ext>0,
            'canal_email_tried',v_sent_email>0,'wpp_session_guard',v_conn_ok,
            'target_email','ti@promobrindes.com.br','delivery_verified',false)
      WHERE id=v_alert.id;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'enviados_wpp',v_sent_wpp,'enviados_ext',v_sent_ext,
    'enviados_email',v_sent_email,'wpp_session',v_conn_ok,
    'pendentes_res',v_pending-GREATEST(v_sent_wpp,v_sent_ext,v_sent_email),
    'triple_channel',true,'version','v5-fix-json-header-20260813');
END;
$$;

-- ===========================================================================
-- FIX 2: cron analyze-catalogo-diario — schema dinâmico pós-desacoplamento
-- Bug: WHERE ns.nspname='evo' + ANALYZE evo.%I hardcoded — silencioso após PR#1071
-- evolution_messages_wpp2 e evolution_contacts não existem mais em evo.
-- Fix: filtro IN ('evo','zapp') + EXECUTE format('ANALYZE %I.%I', nspname, relname)
-- evolution_reconcile_jobs → evo (Grupo A). evolution_alerts → zapp (Grupo B).
-- ===========================================================================
SELECT cron.alter_job(
  job_id  := (SELECT jobid FROM cron.job WHERE jobname='analyze-catalogo-diario'),
  command := $$
DO $an$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT ns.nspname, c.relname
    FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE c.relkind IN ('r','p')
      AND c.relname IN (
        'product_images','product_relationships','products','product_variants',
        'supplier_import_batches','product_category_assignments','admin_audit_log',
        'frontend_telemetry','supplier_products_raw','supplier_products_raw_history',
        'search_analytics','product_views','catalog_analytics','navigation_analytics',
        'dashboard_insights_cache','analytics_events','user_search_history',
        'pipeline_run_log','video_validation_log','product_ai_history',
        'audit_log_gravacao','ingestion_run_log','image_validation_log'
      )
  LOOP
    EXECUTE format('ANALYZE %I.%I', r.nspname, r.relname);
    n := n+1;
  END LOOP;
  -- FIXED 20260813: schema dinâmico — msgs_wpp2/contacts/alerts em zapp, reconcile em evo
  FOR r IN
    SELECT ns.nspname, c.relname
    FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
    WHERE c.relkind IN ('r','p')
      AND ns.nspname IN ('evo','zapp')
      AND c.relname IN ('evolution_messages_wpp2','evolution_contacts',
                        'evolution_reconcile_jobs','evolution_alerts')
  LOOP
    EXECUTE format('ANALYZE %I.%I', r.nspname, r.relname);
    n := n+1;
  END LOOP;
  RAISE NOTICE 'analyze-catalogo-diario: % tabelas analisadas — fixed-20260813', n;
END $an$;
$$
);
