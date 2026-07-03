-- Migration: fix messages_update_trigger and public.messages view
-- Applied to prod 2026-07-03 (LIVE before this migration file was created)
--
-- BUG 1: messages_update_trigger did not update status_at when status changed via
-- the public.messages view. Calls like:
--   UPDATE messages SET status = 'delivered', status_updated_at = now() WHERE id = ...
-- wrote status correctly but status_at was never set (trigger didn't forward it).
-- Also: is_deleted → deleted_at was not handled, so handleChatsDelete could not
-- soft-delete messages via the view.
--
-- BUG 2: public.messages view returned `em.created_at AS updated_at` instead of
-- `em.updated_at`. The underlying column IS updated by RPCs/triggers but the view
-- always showed the stale created_at, breaking any consumer that relied on updated_at
-- to detect changes.
--
-- Both idempotent (CREATE OR REPLACE).

-- ─────────────────────────────────────────────────────────────────
-- 1. Fix messages_update_trigger to handle status_at + deleted_at
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.messages_update_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'evo'
AS $$
BEGIN
  UPDATE evo.evolution_messages
  SET
    is_read    = COALESCE(NEW.is_read, OLD.is_read),
    status     = CASE WHEN NEW.status IS DISTINCT FROM OLD.status
                      THEN NEW.status ELSE status END,
    -- Propagate status timestamp when status changes
    status_at  = CASE WHEN NEW.status IS DISTINCT FROM OLD.status
                      THEN COALESCE(NEW.status_updated_at::timestamptz, now())
                      ELSE status_at END,
    content    = CASE WHEN NEW.content IS DISTINCT FROM OLD.content
                      THEN NEW.content ELSE content END,
    -- Handle soft-delete via is_deleted: set/clear deleted_at
    deleted_at = CASE
                   WHEN NEW.is_deleted = true
                        AND (OLD.is_deleted IS NULL OR OLD.is_deleted = false)
                     THEN COALESCE(NEW.whatsapp_timestamp, now())
                   WHEN NEW.is_deleted = false
                     THEN NULL
                   ELSE deleted_at
                 END,
    updated_at = now()
  WHERE id = OLD.id;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 2. Fix public.messages view: return em.updated_at, not em.created_at
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.messages AS
 SELECT em.id,
    em.contact_id,
    ( SELECT wc.id
           FROM public.whatsapp_connections wc
          WHERE wc.instance_name = (em.instance_name)::text
            AND wc.is_active = true
         LIMIT 1) AS connection_id,
        CASE
            WHEN (em.direction)::text = 'inbound'::text THEN 'incoming'::text
            ELSE 'outgoing'::text
        END AS direction,
    em.content,
    (COALESCE(em.message_type, 'text'::character varying))::text AS message_type,
    em.media_url,
    em.media_mimetype AS media_mime_type,
    em.media_filename,
    em.media_size,
    em.message_id AS whatsapp_message_id,
    em.created_at AS whatsapp_timestamp,
    (COALESCE(em.status, 'delivered'::character varying))::text AS status,
    COALESCE(em.from_me, false) AS is_from_me,
    NULL::uuid AS sender_id,
    NULL::uuid AS reply_to_message_id,
        CASE
            WHEN em.quoted_message_id IS NOT NULL
              THEN jsonb_build_object('id', em.quoted_message_id)
            ELSE NULL::jsonb
        END AS quoted_message,
    COALESCE(em.payload, '{}'::jsonb) AS metadata,
    (em.deleted_at IS NOT NULL) AS is_deleted,
    (em.edited_at IS NOT NULL) AS is_edited,
    NULL::text AS reaction,
    NULL::double precision AS latitude,
    NULL::double precision AS longitude,
    em.message_id AS external_id,
    em.caption,
    em.instance_name,
    em.push_name,
    em.remote_jid,
    em.conversation_id,
    em.created_at,
    em.updated_at AS updated_at,  -- FIXED: was em.created_at
    ( SELECT wc.id
           FROM public.whatsapp_connections wc
          WHERE wc.instance_name = (em.instance_name)::text
            AND wc.is_active = true
         LIMIT 1) AS whatsapp_connection_id,
        CASE
            WHEN COALESCE(em.from_me, false) THEN 'agent'::text
            ELSE 'contact'::text
        END AS sender,
    em.is_read,
    NULL::uuid AS agent_id,
    NULL::text AS transcription,
    'pending'::text AS transcription_status,
    em.status_at AS status_updated_at,
    'whatsapp'::text AS channel_type,
    NULL::uuid AS channel_connection_id,
    NULL::text AS request_id,
    NULL::text AS error_code,
    NULL::text AS error_reason,
    NULL::smallint AS retry_attempt,
    NULL::smallint AS retry_total
   FROM evo.evolution_messages em
  WHERE em.deleted_at IS NULL;

-- Restore INSTEAD OF triggers (CREATE OR REPLACE VIEW preserves them in PG 16+,
-- but belt-and-suspenders for older PG versions or if triggers were dropped).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table = 'messages'
      AND trigger_name = 'trg_messages_view_insert'
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_messages_view_insert INSTEAD OF INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION fn_messages_view_insert_handler()';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table = 'messages'
      AND trigger_name = 'messages_instead_of_update'
  ) THEN
    EXECUTE 'CREATE TRIGGER messages_instead_of_update INSTEAD OF UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION messages_update_trigger()';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_schema = 'public'
      AND event_object_table = 'messages'
      AND trigger_name = 'messages_instead_of_delete_tg'
  ) THEN
    EXECUTE 'CREATE TRIGGER messages_instead_of_delete_tg INSTEAD OF DELETE ON public.messages FOR EACH ROW EXECUTE FUNCTION messages_instead_of_delete()';
  END IF;
END $$;

-- Self-validating assertions
DO $$
DECLARE
  v_has_status_at boolean;
  v_view_updated_at text;
  v_trigger_count int;
BEGIN
  -- Check trigger has status_at
  SELECT pg_get_functiondef(p.oid) LIKE '%status_at%'
  INTO v_has_status_at
  FROM pg_proc p WHERE p.proname = 'messages_update_trigger';
  IF NOT v_has_status_at THEN RAISE EXCEPTION 'ASSERT FAIL: messages_update_trigger missing status_at'; END IF;

  -- Check view uses updated_at (not created_at) for updated_at column
  SELECT definition INTO v_view_updated_at FROM pg_views WHERE schemaname='public' AND viewname='messages';
  IF v_view_updated_at NOT LIKE '%em.updated_at%' THEN RAISE EXCEPTION 'ASSERT FAIL: view still returns created_at for updated_at'; END IF;

  -- Check all 3 triggers present
  SELECT COUNT(*) INTO v_trigger_count FROM information_schema.triggers
  WHERE event_object_schema='public' AND event_object_table='messages';
  IF v_trigger_count < 3 THEN RAISE EXCEPTION 'ASSERT FAIL: expected 3 triggers on public.messages, got %', v_trigger_count; END IF;

  RAISE NOTICE 'PASS: messages_update_trigger + view + triggers all verified';
END $$;
