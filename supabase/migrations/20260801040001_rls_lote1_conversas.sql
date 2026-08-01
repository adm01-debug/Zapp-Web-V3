-- 20260801040001 — RLS Lote 1: tabelas de conversa (auditoria etapa 35)
-- Aplicado em producao: 2026-08-01 (impacto medido: 0 invisiveis para agent e admin; tabelas majoritariamente vazias)
-- Backup: zapp._policy_backup_20260801 (1336 policies)
-- Rollback: restaurar policies do backup (DO block sobre zapp._policy_backup_20260801)

BEGIN;

DROP POLICY IF EXISTS auth_full_access ON zapp.conversation_analyses;
DROP POLICY IF EXISTS auth_full_access ON zapp.conversation_closures;
DROP POLICY IF EXISTS auth_full_access ON zapp.conversation_events;
DROP POLICY IF EXISTS auth_full_access ON zapp.conversation_memory;
DROP POLICY IF EXISTS auth_full_access ON zapp.conversation_sla;
DROP POLICY IF EXISTS auth_full_access ON zapp.conversation_tasks;
DROP POLICY IF EXISTS authenticated_read_only ON zapp.conversation_transfers;
DROP POLICY IF EXISTS authenticated_read_only ON zapp.transfer_comments;
DROP POLICY IF EXISTS auth_full_access ON zapp.conversation_snoozes;
DROP POLICY IF EXISTS auth_full_access ON zapp.whisper_messages;

CREATE POLICY conv_analyses_select ON zapp.conversation_analyses FOR SELECT TO authenticated
  USING (zapp.is_contact_visible_to_user(contact_id, auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY conv_closures_select ON zapp.conversation_closures FOR SELECT TO authenticated
  USING (zapp.is_contact_visible_to_user(contact_id, auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY conv_events_select ON zapp.conversation_events FOR SELECT TO authenticated
  USING (zapp.is_contact_visible_to_user(contact_id, auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY conv_memory_select ON zapp.conversation_memory FOR SELECT TO authenticated
  USING (zapp.is_contact_visible_to_user(contact_id, auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY conv_sla_select ON zapp.conversation_sla FOR SELECT TO authenticated
  USING (zapp.is_contact_visible_to_user(contact_id, auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY conv_snoozes_select ON zapp.conversation_snoozes FOR SELECT TO authenticated
  USING (zapp.is_contact_visible_to_user(contact_id, auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY conv_tasks_select ON zapp.conversation_tasks FOR SELECT TO authenticated
  USING (zapp.is_contact_visible_to_user(contact_id, auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid())
         OR assigned_to = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()));
CREATE POLICY conv_tasks_update ON zapp.conversation_tasks FOR UPDATE TO authenticated
  USING (assigned_to = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (assigned_to = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY conv_transfers_select ON zapp.conversation_transfers FOR SELECT TO authenticated
  USING (zapp.is_contact_visible_to_user(contact_id, auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY transfer_comments_select ON zapp.transfer_comments FOR SELECT TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid())
         OR EXISTS (SELECT 1 FROM zapp.conversation_transfers ct
                    WHERE ct.id = transfer_comments.transfer_id
                      AND zapp.is_contact_visible_to_user(ct.contact_id, auth.uid()))
         OR agent_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()));
CREATE POLICY whisper_messages_select ON zapp.whisper_messages FOR SELECT TO authenticated
  USING (zapp.is_contact_visible_to_user(contact_id, auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));

COMMIT;
