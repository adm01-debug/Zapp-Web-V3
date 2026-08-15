-- =============================================================================
-- E42 — zapp.fn_archive_old_wpp2_messages (Fase 3 — Isolamento I1)
-- =============================================================================
-- Objetivo: remover referências diretas a evo.* (invariante I1).
-- Substituições:
--   evo.evolution_messages            → zapp.evolution_messages (view de contrato)
--   evo.evolution_messages_wpp2_archive → zapp.evolution_messages_wpp2_archive (view de contrato)
-- search_path: 'zapp','evo','pg_catalog' → zapp, pg_catalog
-- =============================================================================

CREATE OR REPLACE FUNCTION zapp.fn_archive_old_wpp2_messages(
  p_months_old integer DEFAULT 12,
  p_batch_size integer DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = zapp, pg_catalog
AS $$
DECLARE
  v_safe_months    INT := GREATEST(p_months_old, 12);
  v_cutoff         TIMESTAMPTZ := date_trunc('month', now()) - (v_safe_months || ' months')::interval;
  v_already_in_arc INT; v_newly_archived INT; v_deleted INT;
BEGIN
  SELECT count(*) INTO v_already_in_arc
  FROM (
    SELECT id, instance_name
    FROM zapp.evolution_messages
    WHERE created_at < v_cutoff AND instance_name = 'wpp2'
    ORDER BY created_at ASC
    LIMIT p_batch_size
  ) b
  WHERE EXISTS (
    SELECT 1 FROM zapp.evolution_messages_wpp2_archive a
    WHERE a.id = b.id AND a.instance_name = b.instance_name
  );

  WITH batch AS (
    SELECT * FROM zapp.evolution_messages
    WHERE created_at < v_cutoff AND instance_name = 'wpp2'
    ORDER BY created_at ASC
    LIMIT p_batch_size
  )
  INSERT INTO zapp.evolution_messages_wpp2_archive (
    id, message_id, remote_jid, from_me, message_type, content, media_url,
    media_mimetype, quoted_message_id, is_starred, is_important, category,
    sentiment, tags, notes, follow_up_at, follow_up_done, payload, created_at,
    contact_id, conversation_id, direction, status, status_at, caption,
    media_filename, media_size, sent_by_bot, template_name, instance_name,
    push_name, media_type, raw_data, deleted_at, edited_at, updated_at,
    media_meta, audio_meme_id, sticker_id, link_preview, is_read, reply_to_id,
    media_bucket, media_path, media_sha256, media_status, transcription_status,
    transcription
  )
  SELECT
    id, message_id, remote_jid, from_me, message_type, content, media_url,
    media_mimetype, quoted_message_id, is_starred, is_important, category,
    sentiment, tags, notes, follow_up_at, follow_up_done, payload, created_at,
    contact_id, conversation_id, direction, status, status_at, caption,
    media_filename, media_size, sent_by_bot, template_name, instance_name,
    push_name, media_type, raw_data, deleted_at, edited_at, updated_at,
    media_meta, audio_meme_id, sticker_id, link_preview, is_read, reply_to_id,
    media_bucket, media_path, media_sha256, media_status, transcription_status,
    transcription
  FROM batch
  ON CONFLICT (id, instance_name) DO NOTHING;
  GET DIAGNOSTICS v_newly_archived = ROW_COUNT;

  WITH td AS (
    SELECT m.id, m.instance_name
    FROM zapp.evolution_messages m
    WHERE m.created_at < v_cutoff AND m.instance_name = 'wpp2'
    ORDER BY m.created_at ASC
    LIMIT p_batch_size
  )
  DELETE FROM zapp.evolution_messages
  WHERE (id, instance_name) IN (
    SELECT t.id, t.instance_name FROM td t
    WHERE EXISTS (
      SELECT 1 FROM zapp.evolution_messages_wpp2_archive a
      WHERE a.id = t.id AND a.instance_name = t.instance_name
    )
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'newly_archived',     v_newly_archived,
    'already_in_archive', v_already_in_arc,
    'total_moved',        v_newly_archived + v_already_in_arc,
    'deleted_from_source',v_deleted,
    'cutoff_date',        v_cutoff,
    'months_old_requested', p_months_old,
    'months_old_applied',   v_safe_months,
    'batch_size',         p_batch_size,
    'ts',                 now()
  );
END;
$$;

COMMENT ON FUNCTION zapp.fn_archive_old_wpp2_messages IS
  'Arquiva mensagens wpp2 antigas via views de contrato zapp.*. '
  'E42 (2026-08-15): evo.evolution_messages → zapp.evolution_messages; '
  'evo.evolution_messages_wpp2_archive → zapp.evolution_messages_wpp2_archive (invariante I1). '
  'Acesso restrito: search_path=zapp,pg_catalog.';

REVOKE ALL ON FUNCTION zapp.fn_archive_old_wpp2_messages(integer, integer) FROM PUBLIC, anon, authenticated;
