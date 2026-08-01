-- 20260801040003 — RLS Lote 3: tabelas de time e usuario (auditoria etapa 37)
-- Aplicado em producao: 2026-08-01 (impacto medido: 0 — donos verificados)
-- Backup: zapp._policy_backup_20260801
-- Rollback: restaurar policies do backup

BEGIN;

DROP POLICY IF EXISTS auth_full_access ON zapp.user_settings;
DROP POLICY IF EXISTS auth_full_access ON zapp.saved_filters;
DROP POLICY IF EXISTS auth_full_access ON zapp.notifications;
DROP POLICY IF EXISTS auth_full_access ON zapp.user_roles;
DROP POLICY IF EXISTS auth_full_access ON zapp.team_conversations;
DROP POLICY IF EXISTS auth_full_access ON zapp.team_conversation_members;
DROP POLICY IF EXISTS auth_full_access ON zapp.team_messages;
DROP POLICY IF EXISTS auth_full_access ON zapp.team_message_receipts;
DROP POLICY IF EXISTS auth_notifications_access ON zapp.notifications;
DROP POLICY IF EXISTS user_roles_select_authenticated ON zapp.user_roles;
DROP POLICY IF EXISTS user_settings_select ON zapp.user_settings;
DROP POLICY IF EXISTS user_settings_write ON zapp.user_settings;
DROP POLICY IF EXISTS saved_filters_select ON zapp.saved_filters;
DROP POLICY IF EXISTS saved_filters_write ON zapp.saved_filters;
DROP POLICY IF EXISTS notifications_select ON zapp.notifications;
DROP POLICY IF EXISTS user_roles_select ON zapp.user_roles;
DROP POLICY IF EXISTS user_roles_admin_write ON zapp.user_roles;
DROP POLICY IF EXISTS team_conversations_select ON zapp.team_conversations;
DROP POLICY IF EXISTS team_members_select ON zapp.team_conversation_members;
DROP POLICY IF EXISTS team_messages_select ON zapp.team_messages;
DROP POLICY IF EXISTS team_receipts_select ON zapp.team_message_receipts;

CREATE POLICY user_settings_select ON zapp.user_settings FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY user_settings_write ON zapp.user_settings FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY saved_filters_select ON zapp.saved_filters FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY saved_filters_write ON zapp.saved_filters FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY notifications_select ON zapp.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY user_roles_select ON zapp.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY user_roles_admin_write ON zapp.user_roles FOR INSERT TO authenticated
  WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY team_conversations_select ON zapp.team_conversations FOR SELECT TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid())
         OR EXISTS (SELECT 1 FROM zapp.team_conversation_members tcm
                    JOIN zapp.profiles p ON p.id = tcm.profile_id
                    WHERE tcm.conversation_id = team_conversations.id AND p.user_id = auth.uid()));
CREATE POLICY team_members_select ON zapp.team_conversation_members FOR SELECT TO authenticated
  USING (profile_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY team_messages_select ON zapp.team_messages FOR SELECT TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid())
         OR EXISTS (SELECT 1 FROM zapp.team_conversation_members tcm
                    JOIN zapp.profiles p ON p.id = tcm.profile_id
                    WHERE tcm.conversation_id = team_messages.conversation_id AND p.user_id = auth.uid())
         OR sender_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()));
CREATE POLICY team_receipts_select ON zapp.team_message_receipts FOR SELECT TO authenticated
  USING (profile_id = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));

COMMIT;
