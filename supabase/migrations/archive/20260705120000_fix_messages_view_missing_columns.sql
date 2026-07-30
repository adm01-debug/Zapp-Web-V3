-- =============================================================================
-- Fix: public.messages view missing columns referenced by UPDATE trigger
-- 2026-07-05
--
-- WHY: The UPDATE INSTEAD-OF trigger (messages_update_trigger) references
--      NEW.is_starred, NEW.is_important, NEW.follow_up_at, NEW.follow_up_done,
--      NEW.category, NEW.sentiment, NEW.tags, NEW.notes — but none of these
--      columns were included in the public.messages VIEW definition added by
--      20260704000000_fix_evo_schema_integration.sql.  Any UPDATE through the
--      view raised "column NEW.is_starred does not exist" at runtime.
--
--      The underlying evo.evolution_messages columns already exist (added by
--      Part 2 of the same migration).  The fix is to expose them in the view.
--
-- PostgreSQL constraint: CREATE OR REPLACE VIEW can only ADD columns at the END;
-- it cannot rename, reorder, or change existing column types.  The 8 new
-- columns are therefore appended after the last existing column (retry_total).
-- =============================================================================

CREATE OR REPLACE VIEW public.messages AS
SELECT
  em.id,
  em.contact_id,
  ( SELECT wc.id
    FROM public.whatsapp_connections wc
    WHERE wc.instance_name = em.instance_name::text
      AND wc.is_active = true
    LIMIT 1)                                                              AS connection_id,
  CASE
    WHEN em.direction::text = 'inbound'::text THEN 'incoming'::text
    ELSE 'outgoing'::text
  END                                                                     AS direction,
  em.content,
  COALESCE(em.message_type, 'text'::character varying)::text             AS message_type,
  em.media_url,
  em.media_mimetype                                                       AS media_mime_type,
  em.media_filename,
  em.media_size,
  em.message_id                                                           AS whatsapp_message_id,
  em.created_at                                                           AS whatsapp_timestamp,
  COALESCE(em.status, 'delivered'::character varying)::text              AS status,
  COALESCE(em.from_me, false)                                            AS is_from_me,
  NULL::uuid                                                              AS sender_id,
  NULL::uuid                                                              AS reply_to_message_id,
  CASE
    WHEN em.quoted_message_id IS NOT NULL
    THEN jsonb_build_object('id', em.quoted_message_id)
    ELSE NULL::jsonb
  END                                                                     AS quoted_message,
  COALESCE(em.payload, '{}'::jsonb)                                      AS metadata,
  (em.deleted_at IS NOT NULL)                                            AS is_deleted,
  (em.edited_at  IS NOT NULL)                                            AS is_edited,
  NULL::text                                                              AS reaction,
  NULL::double precision                                                  AS latitude,
  NULL::double precision                                                  AS longitude,
  em.message_id                                                           AS external_id,
  em.caption,
  em.instance_name,
  em.push_name,
  em.remote_jid,
  em.conversation_id,
  em.created_at,
  em.updated_at,
  ( SELECT wc.id
    FROM public.whatsapp_connections wc
    WHERE wc.instance_name = em.instance_name::text
      AND wc.is_active = true
    LIMIT 1)                                                              AS whatsapp_connection_id,
  CASE
    WHEN COALESCE(em.from_me, false) THEN 'agent'::text
    ELSE 'contact'::text
  END                                                                     AS sender,
  em.is_read,
  em.agent_id,
  em.transcription,
  em.transcription_status,
  em.status_at                                                            AS status_updated_at,
  'whatsapp'::text                                                        AS channel_type,
  NULL::uuid                                                              AS channel_connection_id,
  NULL::text                                                              AS request_id,
  NULL::text                                                              AS error_code,
  NULL::text                                                              AS error_reason,
  NULL::smallint                                                          AS retry_attempt,
  NULL::smallint                                                          AS retry_total,
  -- Columns added in this migration: previously missing from the view but
  -- referenced by messages_update_trigger, causing runtime errors on UPDATE.
  em.is_starred,
  em.is_important,
  em.follow_up_at,
  em.follow_up_done,
  em.category,
  em.sentiment,
  em.tags,
  em.notes
FROM evo.evolution_messages em
WHERE em.deleted_at IS NULL;

-- Verify the view now exposes the required columns
DO $$
DECLARE
  missing_cols text[];
BEGIN
  SELECT array_agg(col) INTO missing_cols
  FROM unnest(ARRAY[
    'is_starred','is_important','follow_up_at','follow_up_done',
    'category','sentiment','tags','notes'
  ]) AS col
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'messages'
      AND column_name  = col
  );

  IF missing_cols IS NOT NULL THEN
    RAISE EXCEPTION 'public.messages view still missing columns: %', missing_cols;
  END IF;

  RAISE NOTICE 'public.messages view now exposes all 8 previously-missing columns — UPDATE trigger is safe';
END $$;
