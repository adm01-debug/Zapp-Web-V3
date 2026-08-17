-- 20260817150000 — zapp.favorite_messages (Favoritar mensagem — Etapa 44 do plano 100 etapas)
-- Rollback: DROP TABLE zapp.favorite_messages;
-- Contexto: sem FK para evo.evolution_messages (LIST-particionada por instance_name;
-- precedente: zapp.message_reactions.message_id uuid sem FK). contact_id denormalizado p/ RLS.

CREATE TABLE zapp.favorite_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  contact_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT favorite_messages_user_message_key UNIQUE (user_id, message_id)
);

CREATE INDEX idx_favorite_messages_user_created ON zapp.favorite_messages (user_id, created_at DESC);
CREATE INDEX idx_favorite_messages_contact ON zapp.favorite_messages (contact_id);

ALTER TABLE zapp.favorite_messages ENABLE ROW LEVEL SECURITY;

-- Padrão favorite_contacts (squash 10340-10348)
CREATE POLICY favorite_messages_select ON zapp.favorite_messages
  FOR SELECT USING (user_id = auth.uid() OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY favorite_messages_insert ON zapp.favorite_messages
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY favorite_messages_delete ON zapp.favorite_messages
  FOR DELETE USING (user_id = auth.uid() OR zapp.is_admin_or_supervisor(auth.uid()));

GRANT SELECT, INSERT, DELETE ON zapp.favorite_messages TO authenticated;
-- lição incidente PR #668 → fix 20260806700000
GRANT EXECUTE ON FUNCTION zapp.is_admin_or_supervisor(uuid) TO authenticated;

-- Canário RLS (SET ROLE authenticated com JWT fake de usuário)
DO $$
DECLARE v_user uuid := '00000000-0000-0000-0000-00000000c001';
BEGIN
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claims = json_build_object('sub', v_user, 'role', 'authenticated');
  -- INSERT como dono deve passar; DELETE de outro usuário deve falhar (0 rows).
  INSERT INTO zapp.favorite_messages (message_id, user_id, contact_id)
    VALUES (gen_random_uuid(), v_user, NULL);
  PERFORM 1 FROM zapp.favorite_messages WHERE user_id = v_user LIMIT 1;
  DELETE FROM zapp.favorite_messages
    WHERE user_id = '00000000-0000-0000-0000-00000000c002';
  RESET ROLE;
END $$;
