-- Migration: 20260814100000_f4_audit_rpc_fixes
-- Generated: 2026-08-14 (auditoria F4, fix B2 applied)
-- 10 funcoes: 9 RPCs + fn_process_whatsapp_message (com pre-check v_is_new)
-- IDEMPOTENTE via CREATE OR REPLACE FUNCTION
-- Registro em schema_migrations ja existe. Nao reinserir.

CREATE OR REPLACE FUNCTION zapp.fn_process_whatsapp_message(p_payload jsonb, p_instance text DEFAULT 'wpp2'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo'
AS $function$
DECLARE v_key jsonb; v_remote_jid text; v_message_id text; v_from_me boolean; v_push_name text; v_content text; v_message_type text; v_contact_id uuid; v_conversation_id uuid; v_msg_pk uuid; v_media_type text; v_media_url text; v_media_mimetype text; v_caption text; v_media_meta jsonb; v_link_preview jsonb; v_msg_subkey text; v_is_new boolean; v_media_filename text;
BEGIN
IF (p_payload->>'messageType') = 'reactionMessage' THEN RETURN fn_handle_reaction(p_payload, p_instance); END IF;
IF (p_payload->>'messageType') = 'protocolMessage' THEN RETURN fn_handle_message_delete(p_payload, p_instance); END IF;
IF (p_payload->'key'->>'remoteJid') = 'status@broadcast' THEN RETURN fn_handle_whatsapp_status(p_payload, p_instance); END IF;
-- Validar instance_name
IF NOT EXISTS (
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='evo' AND c.relname='evolution_messages_'||lower(regexp_replace(p_instance,'[^a-z0-9]','_','g'))
  UNION ALL
  SELECT 1 FROM zapp.whatsapp_connections wc WHERE wc.instance_name=p_instance
) THEN
  RETURN jsonb_build_object('ok',false,'error','Instance not registered','instance',p_instance);
END IF;
v_key := p_payload->'key'; v_remote_jid := v_key->>'remoteJid'; v_message_id := v_key->>'id'; v_from_me := COALESCE((v_key->>'fromMe')::boolean, false); v_push_name := p_payload->>'pushName'; v_message_type := COALESCE(p_payload->>'messageType', 'text');
v_content := COALESCE(p_payload->'message'->>'conversation', p_payload->'message'->'extendedTextMessage'->>'text', '');
v_media_url := COALESCE( p_payload->'message'->>'mediaUrl', p_payload->'message'->'imageMessage'->>'url', p_payload->'message'->'audioMessage'->>'url', p_payload->'message'->'videoMessage'->>'url', p_payload->'message'->'documentMessage'->>'url', p_payload->'message'->'ptvMessage'->>'url', p_payload->'message'->'stickerMessage'->>'url' );
v_media_mimetype := COALESCE( p_payload->'message'->'imageMessage'->>'mimetype', p_payload->'message'->'audioMessage'->>'mimetype', p_payload->'message'->'videoMessage'->>'mimetype', p_payload->'message'->'ptvMessage'->>'mimetype', p_payload->'message'->'stickerMessage'->>'mimetype', p_payload->'message'->'documentMessage'->>'mimetype' );
-- FIXED: media_filename somente de documentMessage.fileName (fonte confiável)
-- Content é texto da mensagem ou ID interno WA — não é filename
v_media_filename := p_payload->'message'->'documentMessage'->>'fileName';
-- Fallback apenas se content parecer filename real (tem extensão válida)
IF v_media_filename IS NULL AND v_message_type = 'document' THEN
  DECLARE v_cf text := COALESCE(p_payload->>'content', v_content);
  BEGIN
    IF v_cf ~ '\.[a-zA-Z0-9]{2,5}$' AND v_cf !~ '^DOC-[0-9]{8}-WA' THEN
      v_media_filename := v_cf;
    END IF;
  END;
END IF;
-- Inferir mimetype pelo filename
IF v_media_mimetype IS NULL AND v_media_filename IS NOT NULL THEN
  v_media_mimetype := CASE
    WHEN lower(v_media_filename) LIKE '%.pdf'  THEN 'application/pdf'
    WHEN lower(v_media_filename) LIKE '%.docx' THEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    WHEN lower(v_media_filename) LIKE '%.doc'  THEN 'application/msword'
    WHEN lower(v_media_filename) LIKE '%.xlsx' THEN 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    WHEN lower(v_media_filename) LIKE '%.xls'  THEN 'application/vnd.ms-excel'
    WHEN lower(v_media_filename) LIKE '%.pptx' THEN 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    WHEN lower(v_media_filename) LIKE '%.ppt'  THEN 'application/vnd.ms-powerpoint'
    WHEN lower(v_media_filename) LIKE '%.jpg'  THEN 'image/jpeg'
    WHEN lower(v_media_filename) LIKE '%.jpeg' THEN 'image/jpeg'
    WHEN lower(v_media_filename) LIKE '%.png'  THEN 'image/png'
    WHEN lower(v_media_filename) LIKE '%.mp4'  THEN 'video/mp4'
    WHEN lower(v_media_filename) LIKE '%.mp3'  THEN 'audio/mpeg'
    WHEN lower(v_media_filename) LIKE '%.zip'  THEN 'application/zip'
    WHEN lower(v_media_filename) LIKE '%.txt'  THEN 'text/plain'
    WHEN lower(v_media_filename) LIKE '%.csv'  THEN 'text/csv'
    WHEN lower(v_media_filename) LIKE '%.gif'  THEN 'image/gif'
    WHEN lower(v_media_filename) LIKE '%.xml'  THEN 'application/xml'
    ELSE 'application/octet-stream'
  END;
END IF;
v_media_type := CASE WHEN p_payload->'message'->'imageMessage' IS NOT NULL THEN 'image' WHEN p_payload->'message'->'audioMessage' IS NOT NULL THEN 'audio' WHEN p_payload->'message'->'videoMessage' IS NOT NULL THEN 'video' WHEN p_payload->'message'->'ptvMessage' IS NOT NULL THEN 'video' WHEN p_payload->'message'->'stickerMessage' IS NOT NULL THEN 'sticker' WHEN p_payload->'message'->'documentMessage' IS NOT NULL THEN 'document' ELSE NULL END;
v_caption := COALESCE(p_payload->'message'->'imageMessage'->>'caption', p_payload->'message'->'videoMessage'->>'caption', p_payload->'message'->'documentMessage'->>'caption');
IF p_payload->'message' ? 'extendedTextMessage' THEN
  v_link_preview := jsonb_build_object('url', p_payload->'message'->'extendedTextMessage'->>'matchedText','canonicalUrl', p_payload->'message'->'extendedTextMessage'->>'canonicalUrl','title', p_payload->'message'->'extendedTextMessage'->>'title','description', p_payload->'message'->'extendedTextMessage'->>'description','previewType', p_payload->'message'->'extendedTextMessage'->>'previewType','hasThumbnail', (p_payload->'message'->'extendedTextMessage' ? 'jpegThumbnail'));
  IF v_link_preview->>'url' IS NULL OR v_link_preview->>'url' = '' THEN v_link_preview := NULL; END IF;
END IF;
v_msg_subkey := CASE WHEN p_payload->'message' ? 'imageMessage' THEN 'imageMessage' WHEN p_payload->'message' ? 'audioMessage' THEN 'audioMessage' WHEN p_payload->'message' ? 'videoMessage' THEN 'videoMessage' WHEN p_payload->'message' ? 'ptvMessage' THEN 'ptvMessage' WHEN p_payload->'message' ? 'stickerMessage' THEN 'stickerMessage' WHEN p_payload->'message' ? 'documentMessage' THEN 'documentMessage' ELSE NULL END;
IF v_msg_subkey IS NOT NULL THEN v_media_meta := jsonb_build_object('mediaKey', p_payload->'message'->v_msg_subkey->>'mediaKey', 'directPath', p_payload->'message'->v_msg_subkey->>'directPath', 'mimetype', p_payload->'message'->v_msg_subkey->>'mimetype', 'ptt', p_payload->'message'->v_msg_subkey->>'ptt'); END IF;
INSERT INTO zapp.evolution_contacts (remote_jid, push_name, instance_name, first_contact_at) VALUES (v_remote_jid, CASE WHEN NOT v_from_me THEN v_push_name END, p_instance, now())
ON CONFLICT (remote_jid) DO UPDATE SET push_name=COALESCE(CASE WHEN NOT v_from_me THEN v_push_name END, evolution_contacts.push_name), updated_at=now() RETURNING id INTO v_contact_id;
SELECT NOT EXISTS (SELECT 1 FROM zapp.evolution_messages WHERE message_id = v_message_id AND instance_name = p_instance) INTO v_is_new;
INSERT INTO zapp.evolution_conversations (remote_jid, contact_id, last_message_content, last_message_type, last_message_at, last_inbound_at, last_outbound_at, unread_count, status, instance_name, first_message_at)
VALUES (v_remote_jid, v_contact_id, LEFT(COALESCE(v_content,''),200), v_message_type, now(), CASE WHEN NOT v_from_me THEN now() END, CASE WHEN v_from_me THEN now() END, CASE WHEN NOT v_from_me AND v_is_new THEN 1 ELSE 0 END, 'aberta', p_instance, now())
ON CONFLICT (remote_jid, instance_name) DO UPDATE SET contact_id=COALESCE(evolution_conversations.contact_id, EXCLUDED.contact_id), last_message_content=LEFT(COALESCE(v_content,''),200), last_message_type=v_message_type, last_message_at=now(), last_inbound_at=CASE WHEN NOT v_from_me THEN now() ELSE evolution_conversations.last_inbound_at END, last_outbound_at=CASE WHEN v_from_me THEN now() ELSE evolution_conversations.last_outbound_at END, unread_count=CASE WHEN NOT v_from_me AND v_is_new THEN COALESCE(evolution_conversations.unread_count,0)+1 ELSE evolution_conversations.unread_count END, updated_at=now() RETURNING id INTO v_conversation_id;
INSERT INTO zapp.evolution_messages (message_id, remote_jid, contact_id, conversation_id, from_me, content, message_type, push_name, media_type, media_url, media_mimetype, media_filename, caption, status, direction, instance_name, link_preview, media_meta)
VALUES (v_message_id, v_remote_jid, v_contact_id, v_conversation_id, v_from_me, v_content, v_message_type, v_push_name, v_media_type, v_media_url, v_media_mimetype, v_media_filename, v_caption, CASE WHEN v_from_me THEN 'sent' ELSE 'received' END, CASE WHEN v_from_me THEN 'outbound' ELSE 'inbound' END, p_instance, v_link_preview, v_media_meta)
ON CONFLICT (message_id, instance_name) DO UPDATE SET
  content = CASE
    WHEN NULLIF(EXCLUDED.content,'') IS NULL THEN evolution_messages.content
    WHEN evolution_messages.content IS NULL OR evolution_messages.content = '' THEN EXCLUDED.content
    WHEN evolution_messages.edited_at IS NOT NULL THEN EXCLUDED.content
    ELSE evolution_messages.content
  END,
  media_url = COALESCE(EXCLUDED.media_url, evolution_messages.media_url),
  media_filename = COALESCE(EXCLUDED.media_filename, evolution_messages.media_filename),
  media_mimetype = COALESCE(EXCLUDED.media_mimetype, evolution_messages.media_mimetype),
  status = CASE
    WHEN evolution_messages.status = 'deleted' THEN evolution_messages.status
    WHEN evolution_messages.status = 'read' AND EXCLUDED.status NOT IN ('deleted','failed') THEN evolution_messages.status
    WHEN evolution_messages.status = 'played' AND EXCLUDED.status IN ('received','pending','sent','delivered') THEN evolution_messages.status
    WHEN evolution_messages.status = 'delivered' AND EXCLUDED.status IN ('received','pending','sent') THEN evolution_messages.status
    WHEN evolution_messages.status = 'sent' AND EXCLUDED.status IN ('received','pending') THEN evolution_messages.status
    ELSE EXCLUDED.status
  END,
  link_preview = COALESCE(EXCLUDED.link_preview, evolution_messages.link_preview),
  media_meta = CASE
    WHEN EXCLUDED.media_meta IS NULL THEN evolution_messages.media_meta
    ELSE NULLIF(COALESCE(evolution_messages.media_meta,'{}') || jsonb_strip_nulls(EXCLUDED.media_meta), '{}')
  END,
  updated_at = now()
RETURNING id, (created_at = now()) INTO v_msg_pk, v_is_new;
RETURN jsonb_build_object('ok',true,'remote_jid',v_remote_jid,'message_external_id',v_message_id,'contact_id',v_contact_id,'conversation_id',v_conversation_id,'message_pk',v_msg_pk,'from_me',v_from_me,'message_type',v_message_type,'is_new_message',COALESCE(v_is_new,true),'media_url_extracted',v_media_url IS NOT NULL,'media_filename_extracted',v_media_filename IS NOT NULL,'media_meta_populated',v_media_meta IS NOT NULL,'link_preview_populated',v_link_preview IS NOT NULL);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('ok',false,'error',SQLERRM,'error_detail',SQLSTATE,'remote_jid',v_remote_jid,'message_external_id',v_message_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION zapp.rpc_delete_message(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'public', 'pg_catalog'
AS $function$
DECLARE v_cnt int;
BEGIN
  PERFORM zapp.fn_require_app_user();
  DELETE FROM zapp.evolution_messages WHERE id = p_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'deleted', v_cnt);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$function$
;

CREATE OR REPLACE FUNCTION zapp.rpc_insert_message(p_remote_jid text, p_content text, p_instance text, p_message_id text DEFAULT NULL::text, p_from_me boolean DEFAULT true, p_direction text DEFAULT NULL::text, p_message_type text DEFAULT 'text'::text, p_media_url text DEFAULT NULL::text, p_metadata jsonb DEFAULT NULL::jsonb, p_provider text DEFAULT 'evolution'::text, p_timestamp timestamp with time zone DEFAULT NULL::timestamp with time zone, p_contact_id uuid DEFAULT NULL::uuid, p_quoted_message_id text DEFAULT NULL::text, p_caption text DEFAULT NULL::text, p_ingest_meta jsonb DEFAULT NULL::jsonb, p_media_meta jsonb DEFAULT NULL::jsonb, p_media_bucket text DEFAULT NULL::text, p_media_path text DEFAULT NULL::text, p_media_status text DEFAULT NULL::text, p_status_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_push_name text DEFAULT NULL::text)
 RETURNS zapp.evolution_messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'auth'
AS $function$
DECLARE
  v_contact_id uuid;
  v_row        zapp.evolution_messages;
  v_dir        text;
  v_safe_msgid text;
BEGIN
  IF p_instance IS NULL OR btrim(p_instance) = '' THEN
    RAISE EXCEPTION 'p_instance is required' USING ERRCODE = '22004';
  END IF;

  v_safe_msgid := COALESCE(
    NULLIF(TRIM(COALESCE(p_message_id, '')), ''),
    'SYNTH-' || LEFT(md5(COALESCE(p_remote_jid,'') || COALESCE(p_content,'') || NOW()::text || random()::text), 16)
  );

  v_contact_id := p_contact_id;
  IF v_contact_id IS NULL THEN
    SELECT id INTO v_contact_id FROM zapp.evolution_contacts
    WHERE remote_jid = p_remote_jid AND instance_name = p_instance LIMIT 1;
  END IF;

  IF auth.role() <> 'service_role' THEN
    IF NOT (
      zapp.is_admin_or_supervisor() OR
      (v_contact_id IS NOT NULL AND zapp.is_contact_visible_to_user(v_contact_id, auth.uid()))
    ) THEN
      RAISE EXCEPTION 'forbidden: contato nao visivel' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_dir := COALESCE(p_direction, CASE WHEN p_from_me THEN 'outbound' ELSE 'inbound' END);

  INSERT INTO zapp.evolution_messages(
    message_id, remote_jid, from_me, direction,
    message_type, content, instance_name, contact_id,
    status, created_at, media_url, payload,
    quoted_message_id, caption, ingest_meta, media_meta,
    media_bucket, media_path, media_status, status_at, push_name
  ) VALUES (
    v_safe_msgid, p_remote_jid, p_from_me, v_dir,
    p_message_type, p_content, p_instance, v_contact_id,
    CASE WHEN p_from_me THEN 'sent' ELSE 'received' END,
    COALESCE(p_timestamp, now()), p_media_url, p_metadata,
    p_quoted_message_id, p_caption, p_ingest_meta, p_media_meta,
    p_media_bucket, p_media_path, p_media_status, p_status_at, p_push_name
  )
  ON CONFLICT (message_id, instance_name) DO NOTHING
  RETURNING * INTO v_row;

  -- Atualizar contato apenas quando realmente inseriu (evita duplicar contador em conflict)
  IF v_row IS NOT NULL AND v_contact_id IS NOT NULL THEN
    UPDATE zapp.evolution_contacts
    SET last_message_at = now(), total_messages = COALESCE(total_messages, 0) + 1
    WHERE id = v_contact_id;
  END IF;

  RETURN v_row;
END;
$function$
;

CREATE OR REPLACE FUNCTION zapp.rpc_mark_conversation_read(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'public', 'auth'
AS $function$
DECLARE
  v_contact_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    SELECT contact_id INTO v_contact_id
    FROM zapp.evolution_conversations
    WHERE id = p_id
    LIMIT 1;
    IF NOT (
      zapp.is_admin_or_supervisor() OR
      (v_contact_id IS NOT NULL AND zapp.is_contact_visible_to_user(v_contact_id, auth.uid()))
    ) THEN
      RAISE EXCEPTION 'forbidden: conversa nao visivel' USING ERRCODE = '42501';
    END IF;
  END IF;
  -- FIX A2: parent table em vez de _wpp2 (funciona para qualquer instancia)
  UPDATE zapp.evolution_conversations
  SET unread_count = 0, updated_at = now()
  WHERE id = p_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION zapp.rpc_mark_messages_as_read(p_contact_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo'
AS $function$
BEGIN
  PERFORM zapp.fn_require_app_user();

  IF p_contact_id IS NULL THEN
    RAISE EXCEPTION 'rpc_mark_messages_as_read: p_contact_id cannot be null';
  END IF;

  UPDATE zapp.evolution_messages
  SET
    is_read    = true,
    updated_at = now()
  WHERE contact_id = p_contact_id
    AND from_me    = false
    AND is_read    = false
    AND deleted_at IS NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION zapp.rpc_mark_messages_deleted(p_contact_id uuid, p_instance text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'public', 'auth'
AS $function$
DECLARE v_count int;
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NOT zapp.is_admin_or_supervisor() THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;
  UPDATE zapp.evolution_messages
  SET deleted_at = now(), status = 'deleted', status_at = now(), updated_at = now()
  WHERE contact_id = p_contact_id
    AND (p_instance IS NULL OR instance_name = p_instance);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION zapp.rpc_mark_messages_read(p_conversation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'evo', 'public', 'auth'
AS $function$
DECLARE
  v_contact_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    -- Mapear conversation_id → contact_id para checar visibilidade
    SELECT contact_id INTO v_contact_id
    FROM zapp.evolution_conversations
    WHERE id = p_conversation_id
    LIMIT 1;

    IF NOT (
      zapp.is_admin_or_supervisor() OR
      (v_contact_id IS NOT NULL AND zapp.is_contact_visible_to_user(v_contact_id, auth.uid()))
    ) THEN
      RAISE EXCEPTION 'forbidden: conversa nao visivel' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE zapp.evolution_messages
  SET is_read = true, updated_at = now()
  WHERE conversation_id = p_conversation_id
    AND is_read = false
    AND deleted_at IS NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION zapp.rpc_mark_messages_read(p_contact_id uuid, p_instance text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'public', 'auth'
AS $function$
DECLARE v_count int;
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NOT (
      zapp.is_admin_or_supervisor() OR
      zapp.is_contact_visible_to_user(p_contact_id, auth.uid())
    ) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;
  UPDATE zapp.evolution_messages
  SET is_read = true, updated_at = now()
  WHERE contact_id = p_contact_id
    AND (p_instance IS NULL OR instance_name = p_instance)
    AND from_me = false AND is_read = false AND deleted_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION zapp.rpc_reset_conversation_unread(p_contact_id uuid, p_instance text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'public', 'auth'
AS $function$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NOT (
      zapp.is_admin_or_supervisor() OR
      zapp.is_contact_visible_to_user(p_contact_id, auth.uid())
    ) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;
  UPDATE zapp.evolution_conversations
  SET unread_count = 0, updated_at = now()
  WHERE contact_id = p_contact_id
    AND (p_instance IS NULL OR instance_name = p_instance);
END;
$function$
;

CREATE OR REPLACE FUNCTION zapp.rpc_update_message_transcription(p_message_uuid uuid, p_status text, p_transcription text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'zapp', 'public', 'auth'
AS $function$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden: service_role required' USING ERRCODE = '42501';
  END IF;
  UPDATE zapp.evolution_messages
  SET transcription_status = p_status,
      transcription = COALESCE(p_transcription, transcription),
      updated_at = now()
  WHERE id = p_message_uuid;
END;
$function$
;

