-- ============================================================================
-- FIX RLS (2026-08-18) — zapp.whisper_messages + zapp.conversation_tasks
-- ----------------------------------------------------------------------------
-- CAUSA RAIZ (provada com teste real como authenticated, BEGIN...ROLLBACK):
--   * profiles.id != auth.uid() (id do perfil vs id do usuário) — o front envia
--     sender_id/target_agent_id/created_by = profiles.id, mas as policies de
--     whisper_messages comparavam com auth.uid() → "new row violates row-level
--     security policy" em TODO INSERT de whisper (0 rows na tabela).
--   * conversation_tasks NÃO TINHA policy de INSERT (nem DELETE) → todo INSERT
--     do front (createConversationTask) falhava → 0 rows na tabela.
-- FIX: policies alinhadas ao padrão do projeto
--   (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()).
-- ============================================================================

-- ── whisper_messages: corrigir policies existentes (definição errada) ────────
DROP POLICY IF EXISTS whisper_insert ON zapp.whisper_messages;
SELECT ops.safe_create_policy(
  'zapp', 'whisper_messages', 'whisper_insert',
  'FOR INSERT TO authenticated WITH CHECK (
     sender_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
   )'
);

DROP POLICY IF EXISTS whisper_select ON zapp.whisper_messages;
SELECT ops.safe_create_policy(
  'zapp', 'whisper_messages', 'whisper_select',
  'FOR SELECT TO authenticated USING (
     sender_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
     OR target_agent_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
     OR EXISTS (SELECT 1 FROM zapp.profiles p
                WHERE p.user_id = auth.uid() AND p.role = ANY (ARRAY[''admin''::text, ''supervisor''::text]))
   )'
);

DROP POLICY IF EXISTS whisper_update ON zapp.whisper_messages;
SELECT ops.safe_create_policy(
  'zapp', 'whisper_messages', 'whisper_update',
  'FOR UPDATE TO authenticated USING (
     sender_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
     OR target_agent_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
     OR EXISTS (SELECT 1 FROM zapp.profiles p
                WHERE p.user_id = auth.uid() AND p.role = ANY (ARRAY[''admin''::text, ''supervisor''::text]))
   ) WITH CHECK (
     sender_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
     OR target_agent_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
     OR EXISTS (SELECT 1 FROM zapp.profiles p
                WHERE p.user_id = auth.uid() AND p.role = ANY (ARRAY[''admin''::text, ''supervisor''::text]))
   )'
);

-- ── conversation_tasks: policies AUSENTES (INSERT e DELETE) ─────────────────
SELECT ops.safe_create_policy(
  'zapp', 'conversation_tasks', 'conv_tasks_insert',
  'FOR INSERT TO authenticated WITH CHECK (
     created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
     OR zapp.is_admin_or_supervisor(auth.uid())
   )'
);

SELECT ops.safe_create_policy(
  'zapp', 'conversation_tasks', 'conv_tasks_delete',
  'FOR DELETE TO authenticated USING (
     created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
     OR assigned_to = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
     OR zapp.is_admin_or_supervisor(auth.uid())
   )'
);
