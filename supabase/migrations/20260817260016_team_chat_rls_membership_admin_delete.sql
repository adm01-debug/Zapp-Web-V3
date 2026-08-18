-- ============================================================================
-- Migration: 20260817260000_team_chat_rls_membership_admin_delete
-- ============================================================================
-- Hardening RLS do team-chat (achados E11 / fase-08 Etapa 79.4-79.5):
--
-- (1) INSERT em zapp.team_messages NÃO exigia membership de verdade:
--     a policy team_messages_insert tinha bug de escopo SQL — dentro do
--     EXISTS, `conversation_id` sem qualificador resolvia para a coluna da
--     própria subquery (tcm.conversation_id), virando a tautologia
--     `tcm.conversation_id = tcm.conversation_id`. Resultado: QUALQUER
--     authenticated que fosse membro de QUALQUER conversa podia inserir
--     mensagem em QUALQUER conversa (e o WITH CHECK de team_messages_update
--     tinha o MESMO bug — permitia até mover mensagens entre conversas).
--
-- (2) auth_secure_118 (legado Lovable, FOR ALL) ainda permitia INSERT em
--     team_messages sem membership (with_check: sender_id = próprio profile).
--     DROP: os comandos continuam cobertos pelas policies nomeadas
--     (team_messages_select/insert/update/delete + service_full_access).
--
-- (3) zapp.team_conversations NÃO tinha policy DELETE (nenhum authenticated
--     conseguia deletar; criadores também não). Adicionada policy DELETE
--     admin-only via zapp.is_admin_or_supervisor(auth.uid()).
--     Frontend não usa DELETE em team_conversations (grep src/ = 0), então
--     a policy é puramente aditiva para admins.
--
-- Canário: SET ROLE authenticated + JWT claims fake (padrão etapa44/65),
-- SEM DO grande — uids/conversa fixos (sem estado entre statements) e 1 DO
-- pequeno por asserção. Asserção positiva que falhar vira erro de migration;
-- negativa espera 42501 (ou 0 rows) e RAISE CANARY_FAIL se passar.
--
-- Rollback: recriar auth_secure_118 (with_check: is_admin_or_supervisor()
--   OR sender_id = get_profile_id_for_user(auth.uid())); reverter
--   team_messages_insert/update para as versões anteriores; DROP
--   team_conversations_delete.
-- ============================================================================

BEGIN;

-- ── (2) Legado Lovable: INSERT sem membership ───────────────────────────────
DROP POLICY IF EXISTS auth_secure_118 ON zapp.team_messages;

-- ── (1a) INSERT com membership REAL (conversation_id qualificado) ───────────
DROP POLICY IF EXISTS team_messages_insert ON zapp.team_messages;
DROP POLICY IF EXISTS team_messages_insert_v2 ON zapp.team_messages;
CREATE POLICY team_messages_insert ON zapp.team_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      sender_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM zapp.team_conversation_members tcm
        WHERE tcm.conversation_id = team_messages.conversation_id
          AND tcm.profile_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
      )
    )
    OR zapp.is_admin_or_supervisor(auth.uid())
  );

-- ── (1b) UPDATE: mesmo bug de escopo no WITH CHECK (membros só atualizam
--         mensagens DA PRÓPRIA conversa — sem mover entre conversas) ────────
DROP POLICY IF EXISTS team_messages_update ON zapp.team_messages;
CREATE POLICY team_messages_update ON zapp.team_messages
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM zapp.team_conversation_members tcm
      JOIN zapp.profiles p2 ON p2.id = tcm.profile_id
      WHERE tcm.conversation_id = team_messages.conversation_id
        AND p2.user_id = auth.uid()
    )
    OR zapp.is_admin_or_supervisor(auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM zapp.team_conversation_members tcm
      JOIN zapp.profiles p2 ON p2.id = tcm.profile_id
      WHERE tcm.conversation_id = team_messages.conversation_id
        AND p2.user_id = auth.uid()
    )
    OR zapp.is_admin_or_supervisor(auth.uid())
  );

-- ── (3) DELETE de conversa: admin/supervisor only ───────────────────────────
DROP POLICY IF EXISTS team_conversations_delete ON zapp.team_conversations;
CREATE POLICY team_conversations_delete ON zapp.team_conversations
  FOR DELETE TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- Canário RLS (SET ROLE authenticated + JWT fake; sem DO grande)
-- IDs fixos (sem estado entre statements):
--   uid  ...e001 = membro     | profile ...e101
--   uid  ...e002 = outsider   | profile ...e102
--   uid  ...e003 = admin      | profile ...e103
--   conversa ...e0c1 (type 'direct') | workspace ...e0a1
-- ═══════════════════════════════════════════════════════════════════════════

-- Setup (role de migração — owner bypassa RLS)
-- [FIX 2026-08-18] usuários canário em auth.users (FK real de profiles).
INSERT INTO auth.users (id, aud, role, email) VALUES
  ('00000000-0000-0000-0000-00000000e001', 'authenticated', 'authenticated', 'canario-e001@invalid.local'),
  ('00000000-0000-0000-0000-00000000e002', 'authenticated', 'authenticated', 'canario-e002@invalid.local'),
  ('00000000-0000-0000-0000-00000000e003', 'authenticated', 'authenticated', 'canario-e003@invalid.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO zapp.profiles (id, user_id) VALUES
  ('00000000-0000-0000-0000-00000000e101', '00000000-0000-0000-0000-00000000e001'),
  ('00000000-0000-0000-0000-00000000e102', '00000000-0000-0000-0000-00000000e002'),
  ('00000000-0000-0000-0000-00000000e103', '00000000-0000-0000-0000-00000000e003');

INSERT INTO zapp.workspaces (id, name, owner_id)
VALUES (
  '00000000-0000-0000-0000-00000000e0a1',
  'canario-rls-g12-ws',
  '00000000-0000-0000-0000-00000000e103'
);

INSERT INTO zapp.user_roles (id, user_id, role_key, workspace_id, role, created_at)
VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-00000000e003',
  'admin',
  '00000000-0000-0000-0000-00000000e0a1',
  'admin',
  now()
);

INSERT INTO zapp.team_conversations (id, name, type, created_by)
VALUES (
  '00000000-0000-0000-0000-00000000e0c1',
  'canario-rls-g12',
  'direct',
  '00000000-0000-0000-0000-00000000e101'
);

INSERT INTO zapp.team_conversation_members (id, conversation_id, profile_id, joined_at)
VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-00000000e0c1',
  '00000000-0000-0000-0000-00000000e101',
  now()
);

-- A1: membro insere na própria conversa → deve PASSAR
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000e001', 'role', 'authenticated')::text, true);
  INSERT INTO zapp.team_messages (conversation_id, sender_id, content)
    VALUES ('00000000-0000-0000-0000-00000000e0c1', '00000000-0000-0000-0000-00000000e101', 'canario member insert');
  RESET ROLE;
END $$;

-- A2: outsider NÃO pode inserir (espera 42501; se passar → CANARY_FAIL)
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000e002', 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO zapp.team_messages (conversation_id, sender_id, content)
      VALUES ('00000000-0000-0000-0000-00000000e0c1', '00000000-0000-0000-0000-00000000e102', 'canario outsider insert');
    RAISE EXCEPTION 'CANARY_FAIL: INSERT team_messages sem membership passou';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'canario OK: outsider bloqueado (42501)';
  END;
  RESET ROLE;
END $$;

-- A3: admin insere em conversa sem ser membro → deve PASSAR (admin bypass)
DO $$
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000e003', 'role', 'authenticated')::text, true);
  INSERT INTO zapp.team_messages (conversation_id, sender_id, content)
    VALUES ('00000000-0000-0000-0000-00000000e0c1', '00000000-0000-0000-0000-00000000e103', 'canario admin insert');
  RESET ROLE;
END $$;

-- A4: não-admin NÃO deleta conversa (RLS filtra → 0 rows; se apagar → CANARY_FAIL)
DO $$
DECLARE v_deleted uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000e001', 'role', 'authenticated')::text, true);
  DELETE FROM zapp.team_conversations WHERE id = '00000000-0000-0000-0000-00000000e0c1' RETURNING id INTO v_deleted;
  IF v_deleted IS NOT NULL THEN
    RAISE EXCEPTION 'CANARY_FAIL: DELETE team_conversations sem admin passou';
  END IF;
  RESET ROLE;
END $$;

-- A5: admin deleta conversa → deve PASSAR (cascade apaga mensagens + membros)
DO $$
DECLARE v_deleted uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-00000000e003', 'role', 'authenticated')::text, true);
  DELETE FROM zapp.team_conversations WHERE id = '00000000-0000-0000-0000-00000000e0c1' RETURNING id INTO v_deleted;
  IF v_deleted IS NULL THEN
    RAISE EXCEPTION 'CANARY_FAIL: DELETE team_conversations admin nao passou';
  END IF;
  RESET ROLE;
END $$;

-- Cleanup (role de migração; conversa já foi apagada pelo canário A5)
DELETE FROM zapp.team_conversations WHERE id = '00000000-0000-0000-0000-00000000e0c1';
DELETE FROM zapp.user_roles WHERE user_id = '00000000-0000-0000-0000-00000000e003';
DELETE FROM zapp.workspaces WHERE id = '00000000-0000-0000-0000-00000000e0a1';
DELETE FROM zapp.profiles WHERE user_id IN (
  '00000000-0000-0000-0000-00000000e001',
  '00000000-0000-0000-0000-00000000e002',
  '00000000-0000-0000-0000-00000000e003'
);
DELETE FROM auth.users WHERE id IN (
  '00000000-0000-0000-0000-00000000e001',
  '00000000-0000-0000-0000-00000000e002',
  '00000000-0000-0000-0000-00000000e003'
);

COMMIT;
