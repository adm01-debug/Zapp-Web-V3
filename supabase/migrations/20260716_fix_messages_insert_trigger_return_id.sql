-- Fix: fn_messages_view_insert_handler INSTEAD OF INSERT trigger now assigns
-- NEW.id before the INSERT so RETURN NEW carries the generated UUID back to
-- PostgREST. Previously, callers that omitted id in the INSERT received
-- id = NULL in the RETURNING clause, causing all subsequent status-update
-- queries (eq('id', data.id)) to update 0 rows silently.
CREATE OR REPLACE FUNCTION zapp.fn_messages_view_insert_handler()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'evo', 'zapp', 'monitoring'
AS $function$
DECLARE
  v_db_direction text;
  v_remote_jid   text;
  v_push_name    text;
  v_instance     text;
  v_from_me      boolean;
  v_phone        text;
  v_contact_name text;
BEGIN
  -- Assign id first so RETURN NEW carries the generated UUID back to PostgREST.
  -- Without this, callers that omit id in the INSERT get NULL in the RETURNING clause.
  NEW.id := COALESCE(NEW.id, gen_random_uuid());

  -- direction (mantém comportamento existente)
  v_db_direction := CASE NEW.direction
    WHEN 'incoming' THEN 'inbound'
    WHEN 'outgoing' THEN 'outbound'
    ELSE COALESCE(NEW.direction, 'inbound')
  END;

  -- is_from_me: se NULL, deriva de direction
  v_from_me := COALESCE(
    NEW.is_from_me,
    CASE WHEN v_db_direction = 'outbound' THEN true ELSE false END
  );

  -- instance_name: se NULL, deriva via whatsapp_connection_id
  v_instance := NULLIF(NEW.instance_name, '');
  IF v_instance IS NULL THEN
    SELECT wc.instance_name INTO v_instance
    FROM zapp.whatsapp_connections wc
    WHERE wc.id = NEW.whatsapp_connection_id
    LIMIT 1;
  END IF;
  v_instance := COALESCE(v_instance, 'wpp2');

  -- remote_jid + push_name: se vazios, deriva via contact_id
  v_remote_jid := NULLIF(NEW.remote_jid, '');
  v_push_name  := NEW.push_name;
  IF v_remote_jid IS NULL OR v_push_name IS NULL THEN
    SELECT c.remote_jid, c.phone, c.name
    INTO v_remote_jid, v_phone, v_contact_name
    FROM zapp.contacts c
    WHERE c.id = NEW.contact_id
    LIMIT 1;
    -- se contact.remote_jid também vazio, reconstroi a partir do phone
    IF (v_remote_jid IS NULL OR v_remote_jid = '') AND v_phone IS NOT NULL AND v_phone <> '' THEN
      v_remote_jid := v_phone || '@s.whatsapp.net';
    END IF;
    v_push_name := COALESCE(NEW.push_name, v_contact_name);
  END IF;

  INSERT INTO zapp.evolution_messages (
    id, message_id, remote_jid, from_me,
    message_type, content, media_url, media_mimetype, media_filename, media_size,
    quoted_message_id, payload,
    contact_id, conversation_id, direction, status, status_at,
    caption, instance_name, push_name,
    deleted_at, edited_at, created_at, updated_at
  ) VALUES (
    NEW.id,
    COALESCE(NEW.whatsapp_message_id, NEW.external_id),
    COALESCE(v_remote_jid, ''),
    v_from_me,
    NEW.message_type,
    NEW.content,
    NEW.media_url,
    NEW.media_mime_type,
    NEW.media_filename,
    NEW.media_size,
    NEW.quoted_message->>'id',
    COALESCE(NEW.metadata, '{}'::jsonb),
    NEW.contact_id,
    NEW.conversation_id,
    v_db_direction,
    COALESCE(NEW.status, 'delivered'),
    NEW.status_updated_at,
    NEW.caption,
    v_instance,
    v_push_name,
    CASE WHEN NEW.is_deleted THEN COALESCE(NEW.created_at, now()) ELSE NULL END,
    CASE WHEN NEW.is_edited THEN COALESCE(NEW.created_at, now()) ELSE NULL END,
    COALESCE(NEW.created_at, now()),
    COALESCE(NEW.updated_at, now())
  )
  ON CONFLICT (message_id, instance_name) DO NOTHING;

  -- When the insert was skipped due to a conflict, FOUND is false.
  -- Re-fetch the existing row's id so RETURN NEW carries the correct UUID
  -- back to PostgREST — otherwise callers receive the transient NEW.id they
  -- provided, which may differ from the persisted row's id.
  IF NOT FOUND THEN
    SELECT em.id INTO NEW.id
    FROM zapp.evolution_messages em
    WHERE em.message_id = COALESCE(NEW.whatsapp_message_id, NEW.external_id)
      AND em.instance_name = v_instance
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$function$;
