-- fix(rls): Delta corrigido da migration 20260804130000_fix_rls_critical_gaps
--
-- POR QUE ESTA MIGRATION EXISTE:
-- A 20260804130000 (PR #781) NÃO pode ser aplicada como está em produção:
--   * C-1 mira public.voice_conversion_queue, mas o ground truth do banco vivo
--     (2026-08-04) prova: public.voice_conversion_queue = VIEW (relkind v);
--     a tabela FÍSICA é zapp.voice_conversion_queue (relkind r), que JÁ está
--     com RLS habilitado e 4 policies (voice_insert/voice_select/voice_update/
--     voice_queue_all). Aplicar C-1 como escrito causaria 42809
--     ("cannot change row level security of view") abortando a migration.
--   * A-6 (REVOKE anon de funções zapp/evo) JÁ está aplicado de facto:
--     has_function_privilege('anon', ...) = 0 funções em zapp+evo.
--   * RLS das 13 tabelas da 1200 JÁ está ON em produção (aplicado de facto).
--
-- ESTA MIGRATION APLICA SOMENTE O DELTA REAL PENDENTE (verificado no banco vivo):
--   A-1: zapp.team_messages — policies INSERT/UPDATE/DELETE (com RLS on, só
--        existem auth_secure_118 FOR ALL, team_messages_select e service_full_access)
--   A-2: zapp.talkx_campaigns — policies INSERT/UPDATE/DELETE (só existe SELECT;
--        com RLS on, criar/editar/excluir campanha por authenticated FALHA hoje)
--   A-3: zapp.user_roles — policy DELETE admin/supervisor
--   A-4: zapp.queues — auth_secure_134 trocada de FOR ALL (qualquer authenticated
--        pode DELETAR filas!) para FOR SELECT
--   A-5: zapp.whatsapp_connections — constraint health_status CHECK ampliada com
--        'disconnected' e 'timeout' (edge connection-health-check grava ambos)
--
-- Rollback: reverter na ordem inversa (A-5 → A-1). Policies: DROP POLICY
-- correspondente; constraint: DROP + ADD com valores originais
-- (healthy/ok/provisioned/degraded/error/unknown/down/offline).

-- ── A-1: zapp.team_messages — INSERT/UPDATE/DELETE ──────────────────────────

DROP POLICY IF EXISTS team_messages_insert ON zapp.team_messages;
CREATE POLICY team_messages_insert ON zapp.team_messages FOR INSERT TO authenticated
  WITH CHECK (
    (sender_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
     AND EXISTS (SELECT 1 FROM zapp.team_conversation_members tcm
                 JOIN zapp.profiles p2 ON p2.id = tcm.profile_id
                 WHERE tcm.conversation_id = conversation_id AND p2.user_id = auth.uid()))
    OR zapp.is_admin_or_supervisor(auth.uid())
  );

DROP POLICY IF EXISTS team_messages_update ON zapp.team_messages;
CREATE POLICY team_messages_update ON zapp.team_messages FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM zapp.team_conversation_members tcm
            JOIN zapp.profiles p2 ON p2.id = tcm.profile_id
            WHERE tcm.conversation_id = team_messages.conversation_id AND p2.user_id = auth.uid())
    OR zapp.is_admin_or_supervisor(auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM zapp.team_conversation_members tcm
            JOIN zapp.profiles p2 ON p2.id = tcm.profile_id
            WHERE tcm.conversation_id = conversation_id AND p2.user_id = auth.uid())
    OR zapp.is_admin_or_supervisor(auth.uid())
  );

DROP POLICY IF EXISTS team_messages_delete ON zapp.team_messages;
CREATE POLICY team_messages_delete ON zapp.team_messages FOR DELETE TO authenticated
  USING (sender_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
         OR zapp.is_admin_or_supervisor(auth.uid()));

-- ── A-2: zapp.talkx_campaigns — INSERT/UPDATE/DELETE ────────────────────────

DROP POLICY IF EXISTS talkx_campaigns_insert ON zapp.talkx_campaigns;
CREATE POLICY talkx_campaigns_insert ON zapp.talkx_campaigns FOR INSERT TO authenticated
  WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS talkx_campaigns_update ON zapp.talkx_campaigns;
CREATE POLICY talkx_campaigns_update ON zapp.talkx_campaigns FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
    OR zapp.is_admin_or_supervisor(auth.uid())
  )
  WITH CHECK (
    created_by = auth.uid()
    OR created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
    OR zapp.is_admin_or_supervisor(auth.uid())
  );

DROP POLICY IF EXISTS talkx_campaigns_delete ON zapp.talkx_campaigns;
CREATE POLICY talkx_campaigns_delete ON zapp.talkx_campaigns FOR DELETE TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid()));

-- ── A-3: zapp.user_roles — DELETE policy ────────────────────────────────────

DROP POLICY IF EXISTS user_roles_admin_delete ON zapp.user_roles;
CREATE POLICY user_roles_admin_delete ON zapp.user_roles FOR DELETE TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid()));

-- ── A-4: zapp.queues — auth_secure_134 FOR ALL → FOR SELECT ────────────────

DROP POLICY IF EXISTS auth_secure_134 ON zapp.queues;
CREATE POLICY auth_secure_134 ON zapp.queues FOR SELECT TO authenticated USING (true);

-- ── A-5: zapp.whatsapp_connections — constraint health_status ampliada ──────

ALTER TABLE zapp.whatsapp_connections
  DROP CONSTRAINT IF EXISTS whatsapp_connections_health_status_check;

ALTER TABLE zapp.whatsapp_connections
  ADD CONSTRAINT whatsapp_connections_health_status_check
  CHECK (
    health_status IS NULL OR
    health_status = ANY (ARRAY[
      'healthy'::text, 'ok'::text, 'provisioned'::text,
      'degraded'::text, 'error'::text, 'unknown'::text,
      'down'::text, 'offline'::text, 'disconnected'::text, 'timeout'::text
    ])
  );

-- ── Verificação pós-aplicação (canário) ─────────────────────────────────────
-- Esperado:
--   SELECT polname FROM pg_policy WHERE polrelid='zapp.team_messages'::regclass
--     → team_messages_insert, team_messages_update, team_messages_delete
--   SELECT polname FROM pg_policy WHERE polrelid='zapp.talkx_campaigns'::regclass
--     → talkx_campaigns_insert, talkx_campaigns_update, talkx_campaigns_delete
--   SELECT polname FROM pg_policy WHERE polrelid='zapp.user_roles'::regclass
--     → user_roles_admin_delete
--   SELECT polcmd FROM pg_policy WHERE polrelid='zapp.queues'::regclass AND polname='auth_secure_134'
--     → r (SELECT)
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid='zapp.whatsapp_connections'::regclass
--       AND conname='whatsapp_connections_health_status_check'
--     → contém 'disconnected'::text
