-- =============================================================================
-- E38 — zapp.fn_send_bitrix_alert (Fase 2 — Desacoplamento ZAPPxEvolution)
-- ALINHADO 1:1 com o corpo vivo em produção (2026-08-18, auditoria migrations):
-- o corpo anterior do repo divergia do DB (drift). Este arquivo agora espelha
-- exatamente o pg_get_functiondef do objeto em produção. CREATE OR REPLACE
-- idempotente; aplicação em DB existente = no-op.
-- Registrado em supabase_migrations.schema_migrations (version 20260815160000).
-- notify_sicoob_on_reply (coberto pelo squash canonico) nao faz parte deste espelho.
-- =============================================================================
CREATE OR REPLACE FUNCTION zapp.fn_send_bitrix_alert(p_alert_key text, p_severity text, p_title text, p_message text, p_payload jsonb DEFAULT '{}'::jsonb, p_force_send boolean DEFAULT false, p_cooldown_min integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'monitoring'
AS $function$
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
  -- Input validation
  IF p_alert_key IS NULL OR p_alert_key = '' THEN
    RAISE EXCEPTION 'alert_key is required';
  END IF;
  IF p_severity IS NULL OR p_severity = '' THEN
    RAISE EXCEPTION 'severity is required';
  END IF;

  v_severity_rank := zapp.fn_severity_rank(p_severity);
  v_now_brt := to_char(v_now AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI:SS') || ' BRT';

  -- Cooldown check (com escalation bypass)
  SELECT * INTO v_cooldown_row
  FROM zapp.evolution_alert_cooldown
  WHERE alert_key = p_alert_key;

  IF v_cooldown_row.alert_key IS NOT NULL AND NOT p_force_send THEN
    -- Mesma severidade ou downgrade, dentro da janela de cooldown → skip
    IF v_severity_rank <= v_cooldown_row.last_severity_rank
       AND v_now - v_cooldown_row.last_sent_at < make_interval(mins => p_cooldown_min) THEN
      v_skip_reason := format('cooldown_active: %s remaining',
        make_interval(mins => p_cooldown_min) - (v_now - v_cooldown_row.last_sent_at));
      RETURN jsonb_build_object(
        'dispatched', false,
        'skip_reason', v_skip_reason,
        'alert_key', p_alert_key,
        'severity', p_severity,
        'cooldown_until', v_cooldown_row.last_sent_at + make_interval(mins => p_cooldown_min)
      );
    END IF;
  END IF;

  -- Lookup vault secrets (graceful: se faltar, vai pra DRY-RUN)
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

  IF v_webhook_url IS NULL OR v_webhook_url = '' OR v_recipient_id IS NULL OR v_recipient_id = '' THEN
    v_dry_run := true;
    v_dispatch_status := 'dry_run_no_secret';
  END IF;

  -- Format message (BB-code Bitrix24)
  v_emoji := CASE
    WHEN v_severity_rank >= 3 THEN '🚨'
    WHEN v_severity_rank = 2 THEN '🟠'
    WHEN v_severity_rank = 1 THEN '⚠️'
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

  -- Dispatch via pg_net se não for dry-run
  IF NOT v_dry_run THEN
    BEGIN
      v_request_id := net.http_post(
        url := rtrim(v_webhook_url, '/') || '/im.message.add.json',
        body := jsonb_build_object(
          'USER_ID', v_recipient_id,
          'MESSAGE', v_formatted_msg
        ),
        headers := '{"Content-Type": "application/json"}'::jsonb,
        timeout_milliseconds := 5000
      );
      v_dispatch_status := 'sent';
    EXCEPTION WHEN OTHERS THEN
      v_request_id := NULL;
      v_dispatch_status := 'send_failed: ' || SQLERRM;
    END;
  END IF;

  -- Always log in evolution_alerts
  INSERT INTO zapp.evolution_alerts (alert_type, severity, title, message, payload)
  VALUES (
    'bitrix_dispatch',
    p_severity,
    p_title,
    p_message,
    p_payload
      || jsonb_build_object(
        'alert_key', p_alert_key,
        'dispatch_status', v_dispatch_status,
        'dry_run', v_dry_run,
        'http_request_id', v_request_id,
        'severity_rank', v_severity_rank,
        'sent_at', v_now,
        'formatted_msg', v_formatted_msg
      )
  )
  RETURNING id INTO v_alert_id;

  -- Upsert cooldown
  INSERT INTO zapp.evolution_alert_cooldown
    (alert_key, last_severity, last_severity_rank, consecutive_count, last_sent_at,
     last_payload, cooldown_minutes, last_dispatch_status, updated_at)
  VALUES
    (p_alert_key, p_severity, v_severity_rank, 1, v_now,
     p_payload, p_cooldown_min, v_dispatch_status, v_now)
  ON CONFLICT (alert_key) DO UPDATE SET
    last_severity = EXCLUDED.last_severity,
    last_severity_rank = EXCLUDED.last_severity_rank,
    consecutive_count = CASE
      WHEN evolution_alert_cooldown.last_severity = EXCLUDED.last_severity
      THEN evolution_alert_cooldown.consecutive_count + 1
      ELSE 1
    END,
    last_sent_at = EXCLUDED.last_sent_at,
    last_payload = EXCLUDED.last_payload,
    last_dispatch_status = EXCLUDED.last_dispatch_status,
    updated_at = EXCLUDED.updated_at;

  v_result := jsonb_build_object(
    'dispatched', NOT v_dry_run AND v_request_id IS NOT NULL,
    'dry_run', v_dry_run,
    'alert_id', v_alert_id,
    'http_request_id', v_request_id,
    'dispatch_status', v_dispatch_status,
    'severity', p_severity,
    'severity_rank', v_severity_rank,
    'alert_key', p_alert_key,
    'sent_at', v_now,
    'formatted_msg_preview', left(v_formatted_msg, 200)
  );

  RETURN v_result;
END;
$function$
