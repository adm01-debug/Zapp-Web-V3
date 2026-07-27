-- ============================================================
-- MIGRATION: Rate limit null guard + bridge function auth
-- DATE: 2026-07-28
-- ============================================================

-- 1. fn_rate_limit_check: fail-closed for all invalid inputs
CREATE OR REPLACE FUNCTION zapp.fn_rate_limit_check(
  p_identifier     text,
  p_rpc_name       text,
  p_max_calls      int DEFAULT 60,
  p_window_minutes int DEFAULT 1
) RETURNS boolean LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, pg_catalog AS $fn$
DECLARE
  v_count int;
  v_ws    timestamptz;
BEGIN
  IF p_identifier IS NULL OR p_rpc_name IS NULL
    OR p_window_minutes IS NULL OR p_window_minutes <= 0
    OR p_max_calls IS NULL OR p_max_calls <= 0
  THEN
    RETURN FALSE;
  END IF;

  v_ws := to_timestamp(
    floor(EXTRACT(epoch FROM now()) / (p_window_minutes * 60))
    * (p_window_minutes * 60)
  );

  INSERT INTO rpc_rate_limits (identifier, rpc_name, window_start, call_count)
  VALUES (p_identifier, p_rpc_name, v_ws, 1)
  ON CONFLICT (identifier, rpc_name, window_start)
    DO UPDATE SET call_count = rpc_rate_limits.call_count + 1
  RETURNING call_count INTO v_count;

  RETURN v_count <= p_max_calls;
END;
$fn$;

-- 2. fn_messages_bridge_insert: auth check
CREATE OR REPLACE FUNCTION public.fn_messages_bridge_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = zapp, evo, pg_catalog AS $fn$
DECLARE v_jwt_role text; v_id uuid;
BEGIN
  v_jwt_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  IF v_jwt_role IS NULL OR v_jwt_role = 'anon' THEN
    RAISE EXCEPTION 'Unauthorized: authentication required' USING ERRCODE = '42501';
  END IF;
  INSERT INTO zapp.messages (
    id, contact_id, whatsapp_connection_id, connection_id, content, message_type,
    media_url, sender, external_id, whatsapp_message_id, status, status_updated_at,
    created_at, is_from_me, push_name, conversation_id, metadata, agent_id
  ) VALUES (
    NEW.id, NEW.contact_id, NEW.whatsapp_connection_id, NEW.connection_id, NEW.content,
    NEW.message_type, NEW.media_url, NEW.sender, NEW.external_id, NEW.whatsapp_message_id,
    NEW.status, NEW.status_updated_at, NEW.created_at, NEW.is_from_me, NEW.push_name,
    NEW.conversation_id, NEW.metadata, NEW.agent_id
  ) RETURNING id INTO v_id;
  NEW.id := v_id;
  RETURN NEW;
END;
$fn$;

-- 3. fn_messages_bridge_update: auth check
CREATE OR REPLACE FUNCTION public.fn_messages_bridge_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = zapp, evo, pg_catalog AS $fn$
DECLARE v_jwt_role text;
BEGIN
  v_jwt_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  IF v_jwt_role IS NULL OR v_jwt_role = 'anon' THEN
    RAISE EXCEPTION 'Unauthorized: authentication required' USING ERRCODE = '42501';
  END IF;
  UPDATE zapp.messages SET
    content=NEW.content, status=NEW.status,
    status_updated_at=NEW.status_updated_at, external_id=NEW.external_id,
    whatsapp_message_id=NEW.whatsapp_message_id, media_url=NEW.media_url,
    contact_id=NEW.contact_id, message_type=NEW.message_type,
    sender=NEW.sender, is_from_me=NEW.is_from_me, created_at=NEW.created_at
  WHERE id=OLD.id;
  RETURN NEW;
END;
$fn$;

-- 4. fn_messages_bridge_delete: auth check
CREATE OR REPLACE FUNCTION public.fn_messages_bridge_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = zapp, evo, pg_catalog AS $fn$
DECLARE v_jwt_role text;
BEGIN
  v_jwt_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
  IF v_jwt_role IS NULL OR v_jwt_role = 'anon' THEN
    RAISE EXCEPTION 'Unauthorized: authentication required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM zapp.messages WHERE id=OLD.id;
  RETURN OLD;
END;
$fn$;
