-- ============================================================
-- Decouple I4 (pg_net): evo.fn_download_wa_status_media
-- Elimina URL hardcoded de infra (supabase.atomicabr.com.br)
-- -> vault secret 'supabase_api_url' via ops.fn_get_vault_secret
-- (com fallback). Cron 345 — corpo real de produção.
-- Data: 2026-08-15 | Idempotente — CREATE OR REPLACE.
-- ============================================================
CREATE OR REPLACE FUNCTION evo.fn_download_wa_status_media(p_batch_size integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'public'
AS $function$
DECLARE
  v_supabase_url text;
  v_service_key text; v_health_secret text;
  v_row RECORD; v_queued int := 0; v_recovered int := 0;
BEGIN
  v_supabase_url := COALESCE(ops.fn_get_vault_secret('supabase_api_url'), 'https://supabase.atomicabr.com.br');
  SELECT decrypted_secret INTO v_service_key FROM vault.decrypted_secrets WHERE name='supabase_service_role_key' LIMIT 1;
  IF v_service_key IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'JWT nao encontrado no vault'); END IF;
  SELECT decrypted_secret INTO v_health_secret FROM vault.decrypted_secrets WHERE name='health_secret' LIMIT 1;
  IF v_health_secret IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'health_secret nao encontrado no vault'); END IF;
  UPDATE zapp.evolution_whatsapp_status SET media_download_status='pending', media_downloaded_at=NULL
  WHERE media_download_status='processing' AND (media_downloaded_at IS NULL OR media_downloaded_at < now() - interval '15 minutes');
  GET DIAGNOSTICS v_recovered = ROW_COUNT;
  FOR v_row IN
    SELECT id, message_id, participant_jid, media_url FROM zapp.evolution_whatsapp_status
    WHERE media_url LIKE '%mmg.whatsapp.net%' AND media_download_status='pending' AND (expires_at IS NULL OR expires_at > now())
    LIMIT p_batch_size
  LOOP
    UPDATE zapp.evolution_whatsapp_status SET media_download_status='processing', media_downloaded_at=now() WHERE id=v_row.id;
    PERFORM net.http_post(
      url := v_supabase_url || '/functions/v1/download-wa-status-media',
      body := jsonb_build_object('statusId', v_row.id, 'messageId', v_row.message_id, 'mediaUrl', v_row.media_url, 'participantJid', v_row.participant_jid),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key, 'x-internal-secret', v_health_secret),
      timeout_milliseconds := 60000
    );
    v_queued := v_queued + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'queued', v_queued, 'recovered', v_recovered, 'executed_at', now());
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END; $function$;
