-- Migration: F4 Security + Unread Count Fixes
-- Version: 20260814110000
-- Session: 10-agents exhaustive audit + corrections (2026-08-14)
-- Applied directly to DB. This file documents and replays the changes.
--
-- C1: REVOKE authenticated from fn_process_whatsapp_message (SECURITY DEFINER injection risk)
-- C3: rpc_mark_messages_read(contact,instance) - remove DEFAULT p_instance (overload ambiguity)
-- A2: rpc_mark_conversation_read - parent table instead of _wpp2 partition
-- A1: unread_count under-count fix (2881 convs, last 90d, 44635 msgs recovered)
-- A3: NULL-ify 4160 orphaned conversation_ids
-- M3: deleted messages consistency fix (208+13 rows)
-- M1: CREATE INDEX idx_msgs_wpp2_conv_id_unread

-- C1: Revoke EXECUTE from authenticated on fn_process_whatsapp_message
-- Only service_role needed; authenticated had no legitimate reason to call this SECURITY DEFINER fn
REVOKE EXECUTE ON FUNCTION zapp.fn_process_whatsapp_message(jsonb, text)
  FROM authenticated;

-- C3: rpc_mark_messages_read(contact, instance) - remove DEFAULT from p_instance
-- Eliminates overload ambiguity with rpc_mark_messages_read(p_conversation_id uuid)
DROP FUNCTION IF EXISTS zapp.rpc_mark_messages_read(uuid, text);

CREATE OR REPLACE FUNCTION zapp.rpc_mark_messages_read(
  p_contact_id uuid,
  p_instance   text    -- NO DEFAULT: eliminates ambiguity with (p_conversation_id uuid) overload
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, public, auth
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION zapp.rpc_mark_messages_read(uuid, text)
  TO authenticated, service_role;

-- A2: rpc_mark_conversation_read - fix partition hard-code
-- Bug: UPDATE targeted zapp.evolution_conversations_wpp2 directly
-- Fix: UPDATE targets parent table (PostgreSQL routes to correct partition)
CREATE OR REPLACE FUNCTION zapp.rpc_mark_conversation_read(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = zapp, evo, public, auth
AS $$
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
  -- FIX A2: parent table instead of _wpp2 partition (instance-agnostic)
  UPDATE zapp.evolution_conversations
  SET unread_count = 0, updated_at = now()
  WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION zapp.rpc_mark_conversation_read(uuid)
  TO authenticated, service_role;

-- M3: Consistency fix - deleted messages with is_read=false
UPDATE zapp.evolution_messages
SET is_read = true, updated_at = now()
WHERE deleted_at IS NOT NULL AND status = 'deleted' AND is_read = false;

UPDATE zapp.evolution_messages
SET status = 'deleted', status_at = deleted_at, updated_at = now()
WHERE deleted_at IS NOT NULL AND status <> 'deleted';

-- A3: NULL-ify orphaned conversation_ids (4160 msgs pointing to deleted convs)
UPDATE zapp.evolution_messages m
SET conversation_id = NULL, updated_at = now()
WHERE m.conversation_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM zapp.evolution_conversations c WHERE c.id = m.conversation_id
  );

-- A1: Under-count correction (last 90 days only, 2881 convs, 44635 msgs)
UPDATE zapp.evolution_conversations c
SET unread_count = real.cnt, updated_at = now()
FROM (
  SELECT conversation_id, COUNT(*) AS cnt
  FROM zapp.evolution_messages
  WHERE is_read = false AND from_me = false AND deleted_at IS NULL
  GROUP BY conversation_id
) real
WHERE c.id = real.conversation_id
  AND c.unread_count = 0
  AND c.last_message_at >= NOW() - INTERVAL '90 days';

-- M1: Missing index for unread_count query path and rpc_mark_messages_read(conv_id)
-- Must run CONCURRENTLY in production (outside transaction block)
CREATE INDEX IF NOT EXISTS idx_msgs_wpp2_conv_id_unread
  ON zapp.evolution_messages_wpp2 (conversation_id, is_read)
  WHERE from_me = false AND deleted_at IS NULL;
