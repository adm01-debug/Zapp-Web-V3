-- =============================================================================
-- E27 — evo.fn_download_wa_status_media (Fase 2 — Desacoplamento ZAPP×Evolution)
-- =============================================================================
-- Objetivo: substituir net.http_post direto por ops.pg_net_post()
-- para corrigir a violação do invariante I4.
-- =============================================================================

CREATE OR REPLACE FUNCTION evo.fn_download_wa_status_media(p_batch_size integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = zapp, evo, public
AS $$
DECLARE
  v_supabase_url text;
  v_service_key  text;
  v_health_secret text;
  v_row          record;
  v_req_id       bigint;
  v_count        integer := 0;
BEGIN
  v_supabase_url  := ops.fn_get_vault_secret('supabase_api_url');
  v_service_key   := ops.fn_get_vault_secret('supabase_service_role_key');
  v_health_secret := ops.fn_get_vault_secret('health_secret');

  IF v_supabase_url IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'supabase_api_url ausente no vault');
  END IF;

  FOR v_row IN
    SELECT id, message_id, media_url
    FROM evo.evolution_whatsapp_status
    WHERE media_downloaded = false
      AND media_url IS NOT NULL
    ORDER BY created_at ASC
    LIMIT p_batch_size
  LOOP
    v_req_id := ops.pg_net_post(
      p_url     := v_supabase_url || '/functions/v1/download-wa-status-media',
      p_body    := jsonb_build_object(
                     'statusId',  v_row.id,
                     'messageId', v_row.message_id,
                     'mediaUrl',  v_row.media_url
                   ),
      p_headers := jsonb_build_object(
                     'Content-Type',      'application/json',
                     'Authorization',     'Bearer ' || v_service_key,
                     'x-internal-secret', v_health_secret
                   ),
      p_timeout_ms := 60000
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'dispatched', v_count);
END;
$$;

COMMENT ON FUNCTION evo.fn_download_wa_status_media IS
  'Despacha download de midia de status WA via edge function. '
  'E27 (2026-08-15): net.http_post substituido por ops.pg_net_post (invariante I4).';
