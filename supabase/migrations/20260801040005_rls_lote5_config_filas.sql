-- 20260801040005 — RLS Lote 5: configuracao e filas (auditoria etapa 39)
-- Aplicado em producao: 2026-08-01
-- Leitura coletiva LEGITIMA (todos os agents precisam ver filas/conexoes/config); escrita admin/supervisor.
-- Backup: zapp._policy_backup_20260801
-- Rollback: restaurar policies do backup

BEGIN;

DROP POLICY IF EXISTS auth_full_access ON zapp.queues;
DROP POLICY IF EXISTS auth_full_access ON zapp.queue_members;
DROP POLICY IF EXISTS auth_full_access ON zapp.queue_goals;
DROP POLICY IF EXISTS auth_full_access ON zapp.queue_positions;
DROP POLICY IF EXISTS auth_full_access ON zapp.whatsapp_connections;
DROP POLICY IF EXISTS auth_full_access ON zapp.departments;
DROP POLICY IF EXISTS auth_full_access ON zapp.department_invitations;
DROP POLICY IF EXISTS auth_full_access ON zapp.sla_rules;
DROP POLICY IF EXISTS auth_full_access ON zapp.global_settings;
DROP POLICY IF EXISTS queues_select ON zapp.queues;
DROP POLICY IF EXISTS queues_admin_write ON zapp.queues;
DROP POLICY IF EXISTS queue_members_select ON zapp.queue_members;
DROP POLICY IF EXISTS queue_goals_select ON zapp.queue_goals;
DROP POLICY IF EXISTS queue_positions_select ON zapp.queue_positions;
DROP POLICY IF EXISTS whatsapp_connections_select ON zapp.whatsapp_connections;
DROP POLICY IF EXISTS departments_select ON zapp.departments;
DROP POLICY IF EXISTS department_invitations_select ON zapp.department_invitations;
DROP POLICY IF EXISTS sla_rules_select ON zapp.sla_rules;
DROP POLICY IF EXISTS global_settings_select ON zapp.global_settings;
DROP POLICY IF EXISTS global_settings_admin_write ON zapp.global_settings;

CREATE POLICY queues_select ON zapp.queues FOR SELECT TO authenticated USING (true);
CREATE POLICY queues_admin_write ON zapp.queues FOR ALL TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid())) WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY queue_members_select ON zapp.queue_members FOR SELECT TO authenticated USING (true);
CREATE POLICY queue_members_admin_write ON zapp.queue_members FOR ALL TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid())) WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY queue_goals_select ON zapp.queue_goals FOR SELECT TO authenticated USING (true);
CREATE POLICY queue_goals_admin_write ON zapp.queue_goals FOR ALL TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid())) WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY queue_positions_select ON zapp.queue_positions FOR SELECT TO authenticated
  USING (zapp.is_contact_visible_to_user(contact_id, auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY whatsapp_connections_select ON zapp.whatsapp_connections FOR SELECT TO authenticated USING (true);
CREATE POLICY whatsapp_connections_admin_write ON zapp.whatsapp_connections FOR ALL TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid())) WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY departments_select ON zapp.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY departments_admin_write ON zapp.departments FOR ALL TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid())) WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY department_invitations_select ON zapp.department_invitations FOR SELECT TO authenticated USING (true);
CREATE POLICY department_invitations_admin_write ON zapp.department_invitations FOR ALL TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid())) WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY sla_rules_select ON zapp.sla_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY sla_rules_admin_write ON zapp.sla_rules FOR ALL TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid())) WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY global_settings_select ON zapp.global_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY global_settings_admin_write ON zapp.global_settings FOR ALL TO authenticated
  USING (zapp.is_admin_or_supervisor(auth.uid())) WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));

COMMIT;
