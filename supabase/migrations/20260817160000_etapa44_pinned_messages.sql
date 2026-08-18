-- 20260817160000 — zapp.pinned_messages (Fixar mensagem — Etapa 44 do plano 100 etapas)
-- Rollback: DROP TABLE zapp.pinned_messages;
-- Decisão de produto: fixação visível ao time que vê o contato (padrão pinned_conversations).

CREATE TABLE zapp.pinned_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  contact_id uuid,
  pinned_by uuid NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pinned_messages_user_message_key UNIQUE (pinned_by, message_id)
);

CREATE INDEX idx_pinned_messages_contact ON zapp.pinned_messages (contact_id, pinned_by);

ALTER TABLE zapp.pinned_messages ENABLE ROW LEVEL SECURITY;

-- Padrão pinned_conversations (squash 10349-10351)
CREATE POLICY pinned_messages_select ON zapp.pinned_messages
  FOR SELECT USING (
    pinned_by = zapp.get_profile_id_for_user(auth.uid())
    OR zapp.is_contact_visible_to_user(contact_id, auth.uid())
    OR zapp.is_admin_or_supervisor(auth.uid())
  );
CREATE POLICY pinned_messages_insert ON zapp.pinned_messages
  FOR INSERT WITH CHECK (
    pinned_by = zapp.get_profile_id_for_user(auth.uid())
    OR zapp.is_admin_or_supervisor(auth.uid())
  );
CREATE POLICY pinned_messages_update ON zapp.pinned_messages
  FOR UPDATE USING (
    pinned_by = zapp.get_profile_id_for_user(auth.uid())
    OR zapp.is_admin_or_supervisor(auth.uid())
  );
CREATE POLICY pinned_messages_delete ON zapp.pinned_messages
  FOR DELETE USING (
    pinned_by = zapp.get_profile_id_for_user(auth.uid())
    OR zapp.is_admin_or_supervisor(auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.pinned_messages TO authenticated;
GRANT EXECUTE ON FUNCTION zapp.is_contact_visible_to_user(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION zapp.get_profile_id_for_user(uuid) TO authenticated;

-- Canário RLS
DO $$
DECLARE v_user uuid := '00000000-0000-0000-0000-00000000c001';
DECLARE v_profile uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  SELECT zapp.get_profile_id_for_user(v_user) INTO v_profile;
  INSERT INTO zapp.pinned_messages (message_id, contact_id, pinned_by, position)
    VALUES (gen_random_uuid(), NULL, v_profile, 0);
  PERFORM 1 FROM zapp.pinned_messages WHERE pinned_by = v_profile LIMIT 1;
  RESET ROLE;
END $$;
