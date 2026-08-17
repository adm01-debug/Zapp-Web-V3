-- =============================================================================
-- FIX CRON 84 — ops-notify-critical-alerts v8 (idempotente)
-- 2026-08-17 | audit 20260816 | SIM-4
--
-- PROBLEMA (A7 / CRON_FAILURES_7D): invalid symbol "\" found while decoding
--   base64 sequence ao ler vault.decrypted_secrets (secret corrompido) —
--   4-5 falhas 08-09 + 1 falha JSON escape 08-13. Leituras diretas do vault
--   no corpo fazem o cron FALHAR quando um secret está corrompido, em vez de
--   pular o canal.
--
-- ESTADO ATUAL EM PROD (17:47Z):
--   * Comando vivo: SELECT ops.fn_notify_critical_alerts() (já o formato-alvo).
--   * Corpo vivo = v7 (conferido via pg_get_functiondef): resend_api_url já
--     via ops.fn_get_vault_secret; MAS resend_api_key e external_notification_url
--     ainda lêem vault.decrypted_secrets DIRETO (base64 pode derrubar o run).
--   * ops.fn_get_vault_secret (i4, 20260815200010) NÃO tem EXCEPTION guard —
--     secret corrompido propaga erro para o chamador.
--
-- ESTA MIGRATION (v8):
--   1) blinda ops.fn_get_vault_secret com EXCEPTION WHEN OTHERS -> NULL
--      (secret corrompido/ausente NÃO derruba o chamador; canal é pulado);
--   2) v8 de ops.fn_notify_critical_alerts: TODAS as leituras de vault via
--      ops.fn_get_vault_secret (resend_api_key, external_notification_url,
--      resend_api_url) — mantém corpo v7 (provider_call E85, http_post);
--   3) guard idempotente do comando (padrão A — preserva jobid 84).
--   Re-run = UPDATE 0.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PASSO 1: resolver NULL-safe (upgrade do i4 — mesmo nome/assinatura)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ops.fn_get_vault_secret(p_name text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = vault, ops, public
AS $function$
DECLARE
  v_secret text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = p_name
    LIMIT 1;
    RETURN v_secret;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;  -- secret corrompido/ausente NÃO derruba o chamador; canal é pulado
  END;
END
$function$;

REVOKE EXECUTE ON FUNCTION ops.fn_get_vault_secret(text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- PASSO 2: v8 de ops.fn_notify_critical_alerts — leituras de vault NULL-safe
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ops.fn_notify_critical_alerts()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'ops', 'zapp', 'evo', 'pg_catalog'
AS $function$
DECLARE
  v_cfg        record;
  v_alert      record;
  v_resend_key text;
  v_resend_url text;
  v_ext_url    text;
  v_sent       int := 0;
  v_conn_ok    boolean := false;
BEGIN
  SELECT * INTO v_cfg FROM ops.notification_config WHERE id=1 AND enabled;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'reason','config_ausente_ou_desabilitada');
  END IF;

  -- v8: TODAS as leituras via resolver NULL-safe (secret corrompido = canal pulado)
  v_resend_key := ops.fn_get_vault_secret('resend_api_key');
  v_ext_url    := ops.fn_get_vault_secret('external_notification_url');
  v_resend_url := COALESCE(ops.fn_get_vault_secret('resend_api_url'), 'https://api.resend.com');

  -- Verificar se wpp2 esta conectado (guard de sessao)
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
    -- Canal WhatsApp (via porta unica ops.fn_provider_call — E85)
    IF coalesce(v_conn_ok, false) THEN
      PERFORM ops.fn_provider_call('POST', '/message/sendText/'||v_cfg.instance,
        jsonb_build_object(
          'number', v_cfg.target_jid,
          'text',   chr(128680)||' *ALERTA CRITICO ZAPP WEBB*'||chr(10)||chr(10)
                    ||'*'||coalesce(v_alert.title,v_alert.alert_type)||'*'||chr(10)
                    ||coalesce(v_alert.message,'')||chr(10)||chr(10)
                    ||chr(9200)||' '||to_char(v_alert.created_at AT TIME ZONE 'America/Sao_Paulo','DD/MM HH24:MI')
                    ||chr(10)||'#'||v_alert.alert_type),
        5000);
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
          'source',     'fn_notify_critical_alerts_v8'),
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
          'html',    '<div style=\"font-family:Arial,sans-serif\">'
                     ||'<div style=\"background:#c0392b;padding:16px;border-radius:6px 6px 0 0\">'
                     ||'<h2 style=\"color:#fff;margin:0\">Alerta Critico ZAP WEBB</h2></div>'
                     ||'<div style=\"padding:20px;border:1px solid #ddd\">'
                     ||'<p><b>Tipo:</b> '||coalesce(v_alert.alert_type,'?')||'</p>'
                     ||'<p><b>Titulo:</b> '||coalesce(v_alert.title,'?')||'</p>'
                     ||'<p><b>Mensagem:</b><br>'||replace(coalesce(v_alert.message,'?'),chr(10),'<br>')||'</p>'
                     ||'<hr><p style=\"color:#999;font-size:12px\">'
                     ||to_char(v_alert.created_at AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI:SS')
                     ||' BRT — ops.fn_notify_critical_alerts v8</p></div></div>'),
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
    'version',      'v8-vault-nullsafe-20260817'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok',false,'error',SQLERRM,'version','v8');
END $function$;

REVOKE EXECUTE ON FUNCTION ops.fn_notify_critical_alerts() FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- PASSO 3: guard idempotente do comando (padrão A — preserva jobid 84)
--   Em prod o comando JÁ é o alvo (conferido 17:47Z) -> re-run = UPDATE 0.
-- ---------------------------------------------------------------------------
UPDATE cron.job
SET command = 'SELECT ops.fn_notify_critical_alerts()'
WHERE jobid = 84
  AND command NOT LIKE 'SELECT ops.fn_notify_critical_alerts()';
