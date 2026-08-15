-- =============================================================================
-- E38 — fn_send_bitrix_alert + notify_sicoob_on_reply (Fase 2 — Desacoplamento)
-- =============================================================================
-- Objetivo: substituir net.http_post direto por ops.pg_net_post() (invariante I4).
-- fn_send_bitrix_alert : MANTÉM zapp.fn_get_vault_secret() (vault zapp-local).
-- notify_sicoob_on_reply: vault.decrypted_secrets → ops.fn_get_vault_secret().
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. zapp.fn_send_bitrix_alert
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.fn_send_bitrix_alert(
  p_alert_key    text,
  p_severity     text,
  p_title        text,
  p_message      text,
  p_payload      jsonb    DEFAULT '{}'::jsonb,
  p_force_send   boolean  DEFAULT false,
  p_cooldown_min integer  DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = zapp, evo, monitoring, ops, public
AS $$
DECLARE
  v_severity_rank   smallint;
  v_cooldown_row    zapp.evolution_alert_cooldown%ROWTYPE;
  v_webhook_url     text;
  v_recipient_id    text;
  v_dry_run         boolean := false;
  v_skip_reason     text := NULL;
  v_emoji           text;
  v_formatted_msg   text;
  v_request_id      bigint;
  v_alert_id        uuid;
  v_dispatch_status text;
  v_result          jsonb;
  v_now             timestamptz := now();
  v_now_brt         text;
BEGIN
  IF p_alert_key IS NULL OR p_alert_key = '' THEN
    RAISE EXCEPTION 'alert_key is required';
  END IF;
  IF p_severity IS NULL OR p_severity = '' THEN
    RAISE EXCEPTION 'severity is required';
  END IF;

  v_severity_rank := zapp.fn_severity_rank(p_severity);
  v_now_brt := to_char(v_now AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') || ' BRT';

  SELECT * INTO v_cooldown_row
  FROM zapp.evolution_alert_cooldown
  WHERE alert_key = p_alert_key;

  IF v_cooldown_row.alert_key IS NOT NULL AND NOT p_force_send THEN
    IF v_severity_rank <= v_cooldown_row.last_severity_rank
       AND v_now - v_cooldown_row.last_sent_at < make_interval(mins => p_cooldown_min) THEN
      v_skip_reason := format('cooldown_active: %s remaining',
        make_interval(mins => p_cooldown_min) - (v_now - v_cooldown_row.last_sent_at));
      RETURN jsonb_build_object(
        'dispatched',    false,
        'skip_reason',   v_skip_reason,
        'alert_key',     p_alert_key,
        'severity',      p_severity,
        'cooldown_until', v_cooldown_row.last_sent_at + make_interval(mins => p_cooldown_min)
      );
    END IF;
  END IF;

  -- Vault lookup via função local do schema zapp (mantido intencional)
  BEGIN
    v_webhook_url := zapp.fn_get_vault_secret('bitrix24_webhook_alerts_url');
  EXCEPTION WHEN OTHERS THEN
    v_webhook_url := NULL;
  END;
  BEGIN
    v_recipient_id := zapp.fn_get_vault_secret('bitrix24_alert_recipient_user_id');
  EXCEPTION WHEN OTHERS THEN
    v_recipient_id := NULL;
  END;

  IF v_webhook_url IS NULL OR v_webhook_url = ''
     OR v_recipient_id IS NULL OR v_recipient_id = '' THEN
    v_dry_run := true;
    v_dispatch_status := 'dry_run_no_secret';
  END IF;

  v_emoji := CASE
    WHEN v_severity_rank >= 3 THEN '🚨'
    WHEN v_severity_rank = 2  THEN '🟠'
    WHEN v_severity_rank = 1  THEN '⚠️'
    ELSE 'ℹ️'
  END;

  v_formatted_msg := format(
    E'%s [B]%s[/B] · Pipeline ZAPP\n\n[B]📌 %s[/B]\n\n%s\n\n[I]🔑 alert_key:[/I] %s\n[I]🕐 %s[/I]\n[I]🌎 supabase.atomicabr.com.br[/I]',
    v_emoji,
    upper(p_severity),
    coalesce(p_title, '(sem título)'),
    coalesce(p_message, '(sem mensagem)'),
    p_alert_key,
    v_now_brt
  );

  IF NOT v_dry_run THEN
    BEGIN
      v_request_id := ops.pg_net_post(
        p_url        := rtrim(v_webhook_url, '/') || '/im.message.add.json',
        p_body       := jsonb_build_object(
          'USER_ID', v_recipient_id,
          'MESSAGE', v_formatted_msg
        ),
        p_headers    := '{"Content-Type": "application/json"}'::jsonb,
        p_timeout_ms := 5000
      );
      v_dispatch_status := 'sent';
    EXCEPTION WHEN OTHERS THEN
      v_request_id := NULL;
      v_dispatch_status := 'send_failed: ' || SQLERRM;
    END;
  END IF;

  INSERT INTO zapp.evolution_alerts (alert_type, severity, title, message, payload)
  VALUES (
    'bitrix_dispatch',
    p_severity,
    p_title,
    p_message,
    p_payload
      || jsonb_build_object(
           'alert_key',       p_alert_key,
           'dispatch_status', v_dispatch_status,
           'dry_run',         v_dry_run,
           'http_request_id', v_request_id,
           'severity_rank',   v_severity_rank,
           'sent_at',         v_now,
           'formatted_msg',   v_formatted_msg
         )
  )
  RETURNING id INTO v_alert_id;

  INSERT INTO zapp.evolution_alert_cooldown
    (alert_key, last_severity, last_severity_rank, consecutive_count, last_sent_at,
     last_payload, cooldown_minutes, last_dispatch_status, updated_at)
  VALUES
    (p_alert_key, p_severity, v_severity_rank, 1, v_now,
     p_payload, p_cooldown_min, v_dispatch_status, v_now)
  ON CONFLICT (alert_key) DO UPDATE SET
    last_severity        = EXCLUDED.last_severity,
    last_severity_rank   = EXCLUDED.last_severity_rank,
    consecutive_count    = CASE
      WHEN evolution_alert_cooldown.last_severity = EXCLUDED.last_severity
      THEN evolution_alert_cooldown.consecutive_count + 1
      ELSE 1
    END,
    last_sent_at         = EXCLUDED.last_sent_at,
    last_payload         = EXCLUDED.last_payload,
    last_dispatch_status = EXCLUDED.last_dispatch_status,
    updated_at           = EXCLUDED.updated_at;

  v_result := jsonb_build_object(
    'dispatched',          NOT v_dry_run AND v_request_id IS NOT NULL,
    'dry_run',             v_dry_run,
    'alert_id',            v_alert_id,
    'http_request_id',     v_request_id,
    'dispatch_status',     v_dispatch_status,
    'severity',            p_severity,
    'severity_rank',       v_severity_rank,
    'alert_key',           p_alert_key,
    'sent_at',             v_now,
    'formatted_msg_preview', left(v_formatted_msg, 200)
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION zapp.fn_send_bitrix_alert IS
  'Envia alerta para Bitrix24 via webhook configurável no vault. '
  'E38 (2026-08-15): net.http_post → ops.pg_net_post (invariante I4). '
  'Vault lookup via zapp.fn_get_vault_secret() — intencional, sem alteração. '
  'Acesso restrito: search_path=zapp,evo,monitoring,ops,public.';

-- ---------------------------------------------------------------------------
-- 2. zapp.notify_sicoob_on_reply (trigger function)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zapp.notify_sicoob_on_reply()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = zapp, ops, public
AS $$
DECLARE
  v_contact_type  text;
  v_supabase_url  text;
  v_service_key   text;
  v_resp          bigint;
BEGIN
  IF NEW.sender = 'agent' AND NEW.channel_type = 'internal_chat' THEN
    SELECT contact_type INTO v_contact_type
      FROM zapp.contacts WHERE id = NEW.contact_id;

    IF v_contact_type = 'sicoob_gifts' THEN
      v_supabase_url := COALESCE(
        NULLIF(current_setting('app.settings.supabase_url', true), ''),
        'https://supabase.atomicabr.com.br'
      );

      v_service_key := ops.fn_get_vault_secret('supabase_service_role_key');

      IF v_service_key IS NULL THEN
        RAISE WARNING '[notify_sicoob_on_reply] JWT nao encontrado no vault';
        RETURN NEW;
      END IF;

      BEGIN
        v_resp := ops.pg_net_post(
          p_url     := v_supabase_url || '/functions/v1/sicoob-bridge-reply',
          p_body    := jsonb_build_object(
            'contact_id',  NEW.contact_id,
            'content',     NEW.content,
            'message_id',  NEW.id,
            'agent_id',    NEW.agent_id,
            'created_at',  NEW.created_at
          ),
          p_headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || v_service_key
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[notify_sicoob_on_reply] http_post falhou: % / %', SQLSTATE, SQLERRM;
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION zapp.notify_sicoob_on_reply IS
  'Trigger: notifica bridge Sicoob via Edge Function ao receber resposta de agente. '
  'E38 (2026-08-15): net.http_post → ops.pg_net_post; vault.decrypted_secrets → ops.fn_get_vault_secret (invariante I4). '
  'Acesso restrito: search_path=zapp,ops,public.';
