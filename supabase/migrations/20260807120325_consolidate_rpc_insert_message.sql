-- Consolidate zapp.rpc_insert_message into a single guarded canonical function.
-- Removes the 'wpp_pink_test' default and the unguarded overload (IDOR); fixes direction.
-- Prereq: PR #947 (call-sites pass explicit p_instance) must be DEPLOYED first (expand/contract).
ALTER TABLE evo.evolution_messages ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE evo.evolution_messages ADD COLUMN IF NOT EXISTS payload jsonb;
DROP FUNCTION IF EXISTS zapp.rpc_insert_message(text, text, text, boolean, text, text, text);
DROP FUNCTION IF EXISTS zapp.rpc_insert_message(text, text, text, text, boolean, text, text);
DROP FUNCTION IF EXISTS zapp.rpc_insert_message(text, text, text, text, boolean, text, text, text, jsonb);
CREATE FUNCTION zapp.rpc_insert_message(
  p_remote_jid text, p_content text, p_instance text,
  p_message_id text DEFAULT NULL, p_from_me boolean DEFAULT true,
  p_direction text DEFAULT NULL, p_message_type text DEFAULT 'text',
  p_media_url text DEFAULT NULL, p_metadata jsonb DEFAULT NULL
) RETURNS evo.evolution_messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = zapp, evo, pg_catalog
AS $$
DECLARE v_contact_id uuid; v_row evo.evolution_messages; v_dir text;
BEGIN
  IF p_instance IS NULL OR btrim(p_instance) = '' THEN
    RAISE EXCEPTION 'p_instance is required' USING ERRCODE = '22004';
  END IF;
  SELECT id INTO v_contact_id FROM evo.evolution_contacts
   WHERE remote_jid = p_remote_jid AND instance_name = p_instance LIMIT 1;
  IF auth.role() <> 'service_role' THEN
    IF NOT (zapp.is_admin_or_supervisor()
            OR (v_contact_id IS NOT NULL AND zapp.is_contact_visible_to_user(v_contact_id, auth.uid()))) THEN
      RAISE EXCEPTION 'forbidden: contato nao visivel' USING ERRCODE = '42501';
    END IF;
  END IF;
  v_dir := COALESCE(p_direction, CASE WHEN p_from_me THEN 'outbound' ELSE 'inbound' END);
  INSERT INTO evo.evolution_messages(
    message_id, remote_jid, from_me, direction, message_type, content,
    instance_name, contact_id, status, created_at, media_url, payload
  ) VALUES (
    p_message_id, p_remote_jid, p_from_me, v_dir, p_message_type, p_content,
    p_instance, v_contact_id, CASE WHEN p_from_me THEN 'sent' ELSE 'received' END, now(),
    p_media_url, p_metadata
  ) RETURNING * INTO v_row;
  UPDATE evo.evolution_contacts SET last_message_at = now(),
    total_messages = COALESCE(total_messages, 0) + 1 WHERE id = v_contact_id;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION zapp.rpc_insert_message(text, text, text, text, boolean, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.rpc_insert_message(text, text, text, text, boolean, text, text, text, jsonb) TO authenticated, service_role;
