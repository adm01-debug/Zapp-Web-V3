-- =============================================================================
-- E30 — evo.fn_trigger_audio_transcription (Fase 2 — Desacoplamento ZAPP×Evolution)
-- =============================================================================
-- Objetivo: substituir net.http_post direto por ops.pg_net_post()
-- para corrigir a violação do invariante I4.
-- =============================================================================

CREATE OR REPLACE FUNCTION evo.fn_trigger_audio_transcription(p_batch_size integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = evo, ops, pg_catalog
AS $$
DECLARE
  v_supabase_url  text;
  v_service_key   text;
  v_health_secret text;
  v_row           record;
  v_request_id    bigint;
  v_count         integer := 0;
BEGIN
  v_supabase_url  := ops.fn_get_vault_secret('supabase_api_url');
  v_service_key   := ops.fn_get_vault_secret('supabase_service_role_key');
  v_health_secret := ops.fn_get_vault_secret('health_secret');

  IF v_supabase_url IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'supabase_api_url ausente no vault');
  END IF;

  FOR v_row IN
    SELECT message_id, media_url
    FROM evo.evolution_media
    WHERE transcription_status = 'pending'
      AND media_type IN ('audio', 'ptt')
      AND media_url IS NOT NULL
    ORDER BY created_at ASC
    LIMIT p_batch_size
  LOOP
    v_request_id := ops.pg_net_post(
      p_url     := v_supabase_url || '/functions/v1/transcribe-audio-internal',
      p_body    := jsonb_build_object(
                     'messageId', v_row.message_id,
                     'audioUrl',  v_row.media_url
                   ),
      p_headers := jsonb_build_object(
                     'Content-Type',      'application/json',
                     'Authorization',     'Bearer ' || v_service_key,
                     'x-internal-secret', v_health_secret
                   ),
      p_timeout_ms := 120000
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'dispatched', v_count);
END;
$$;

COMMENT ON FUNCTION evo.fn_trigger_audio_transcription IS
  'Despacha transcrição de áudios WA via edge function. '
  'E30 (2026-08-15): net.http_post substituido por ops.pg_net_post (invariante I4).';
