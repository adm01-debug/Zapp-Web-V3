-- ============================================================
-- Decouple I4 (pg_net): evo.fn_trigger_audio_transcription
-- Elimina URL hardcoded do Supabase (supabase.atomicabr.com.br)
-- -> vault secret 'supabase_api_url' via ops.fn_get_vault_secret
-- (com fallback para o literal atual).
-- O LIKE '%supabase.atomicabr.com.br/storage%' no UPDATE é filtro de
-- dados (media_url) — intencionalmente mantido.
-- Data: 2026-08-15 | Idempotente — CREATE OR REPLACE.
-- ============================================================
CREATE OR REPLACE FUNCTION evo.fn_trigger_audio_transcription(p_batch_size integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'evo', 'pg_catalog'
AS $function$
DECLARE
  v_supabase_url    text;
  v_service_key     text;
  v_health_secret   text;
  v_row             RECORD;
  v_request_id      bigint;
  v_queued          int := 0;
  v_recovered       int := 0;
  v_in_processing   int := 0;
  MAX_CONCURRENT    CONSTANT int := 15;
BEGIN
  v_supabase_url := COALESCE(ops.fn_get_vault_secret('supabase_api_url'), 'https://supabase.atomicabr.com.br');
  SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets WHERE name='supabase_service_role_key' LIMIT 1;
  IF v_service_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'JWT nao encontrado no vault');
  END IF;

  SELECT decrypted_secret INTO v_health_secret FROM vault.decrypted_secrets WHERE name='health_secret' LIMIT 1;
  IF v_health_secret IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'health_secret nao encontrado no vault');
  END IF;

  UPDATE zapp.evolution_messages_wpp2
     SET transcription_status = 'queued', updated_at = now()
   WHERE message_type IN ('audio', 'audioMessage')
     AND transcription_status = 'processing'
     AND updated_at < now() - interval '15 minutes';
  GET DIAGNOSTICS v_recovered = ROW_COUNT;

  UPDATE zapp.evolution_messages_wpp2
     SET transcription_status = 'queued', media_status = 'ready', updated_at = now()
   WHERE message_type IN ('audio', 'audioMessage')
     AND transcription_status = 'expired'
     AND media_status IN ('expired', 'ready')
     AND media_url LIKE '%supabase.atomicabr.com.br/storage%'
     AND media_url IS NOT NULL;

  UPDATE zapp.evolution_messages_wpp2
     SET transcription_status = 'queued', error_code = NULL, error_reason = NULL, updated_at = now()
   WHERE message_type IN ('audio', 'audioMessage')
     AND transcription_status = 'failed'
     AND error_code = 'concurrent_limit_exceeded'
     AND updated_at < now() - interval '10 minutes';

  SELECT COUNT(*) INTO v_in_processing
    FROM zapp.evolution_messages_wpp2
   WHERE message_type IN ('audio', 'audioMessage')
     AND transcription_status = 'processing';

  IF v_in_processing >= MAX_CONCURRENT THEN
    RETURN jsonb_build_object(
      'ok', true, 'queued', 0, 'recovered', v_recovered,
      'skipped', true, 'reason', 'concurrent_limit_guard',
      'in_processing', v_in_processing, 'max_concurrent', MAX_CONCURRENT,
      'executed_at', now()
    );
  END IF;

  p_batch_size := LEAST(p_batch_size, GREATEST(0, MAX_CONCURRENT - v_in_processing));

  FOR v_row IN
    SELECT message_id, media_url
      FROM zapp.evolution_messages_wpp2
     WHERE message_type IN ('audio', 'audioMessage')
       AND media_status = 'ready'
       AND media_url IS NOT NULL
       AND (transcription_status IS NULL OR transcription_status = 'queued')
     ORDER BY created_at ASC
     LIMIT p_batch_size
  LOOP
    UPDATE zapp.evolution_messages_wpp2
       SET transcription_status = 'processing', updated_at = now()
     WHERE message_id = v_row.message_id;

    SELECT net.http_post(
      url                  := v_supabase_url || '/functions/v1/transcribe-audio-internal',
      body                 := jsonb_build_object('messageId', v_row.message_id, 'audioUrl', v_row.media_url),
      headers              := jsonb_build_object(
        'Content-Type',     'application/json',
        'Authorization',    'Bearer ' || v_service_key,
        'x-internal-secret', v_health_secret
      ),
      timeout_milliseconds := 120000
    ) INTO v_request_id;

    v_queued := v_queued + 1;
  END LOOP;

  IF v_queued = 0 THEN
    RETURN jsonb_build_object(
      'ok', true, 'queued', 0, 'recovered', v_recovered,
      'in_processing', v_in_processing,
      'message', 'Nenhum audio pendente', 'executed_at', now()
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'queued', v_queued, 'recovered', v_recovered,
    'in_processing', v_in_processing,
    'first_request_id', v_request_id,
    'timeout_ms', 120000, 'executed_at', now()
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$;
