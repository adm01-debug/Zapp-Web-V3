-- 20260801040004 — RLS Lote 4: campanhas e agendamento (auditoria etapa 38)
-- Aplicado em producao: 2026-08-01 (tabelas vazias na aplicacao — risco zero)
-- Backup: zapp._policy_backup_20260801
-- Rollback: restaurar policies do backup

BEGIN;

DROP POLICY IF EXISTS auth_full_access ON zapp.campaigns;
DROP POLICY IF EXISTS auth_full_access ON zapp.campaign_contacts;
DROP POLICY IF EXISTS auth_full_access ON zapp.campaign_ab_variants;
DROP POLICY IF EXISTS auth_full_access ON zapp.talkx_campaigns;
DROP POLICY IF EXISTS auth_full_access ON zapp.talkx_recipients;
DROP POLICY IF EXISTS auth_full_access ON zapp.talkx_blacklist;
DROP POLICY IF EXISTS auth_full_access ON zapp.scheduled_messages;
DROP POLICY IF EXISTS auth_full_access ON zapp.scheduled_reports;
DROP POLICY IF EXISTS auth_full_access ON zapp.scheduled_report_configs;
DROP POLICY IF EXISTS campaigns_select ON zapp.campaigns;
DROP POLICY IF EXISTS campaigns_admin_write ON zapp.campaigns;
DROP POLICY IF EXISTS campaign_contacts_select ON zapp.campaign_contacts;
DROP POLICY IF EXISTS campaign_ab_select ON zapp.campaign_ab_variants;
DROP POLICY IF EXISTS talkx_campaigns_select ON zapp.talkx_campaigns;
DROP POLICY IF EXISTS talkx_recipients_select ON zapp.talkx_recipients;
DROP POLICY IF EXISTS talkx_blacklist_select ON zapp.talkx_blacklist;
DROP POLICY IF EXISTS scheduled_messages_select ON zapp.scheduled_messages;
DROP POLICY IF EXISTS scheduled_reports_select ON zapp.scheduled_reports;
DROP POLICY IF EXISTS scheduled_report_configs_select ON zapp.scheduled_report_configs;

CREATE POLICY campaigns_select ON zapp.campaigns FOR SELECT TO authenticated
  USING (created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY campaigns_admin_write ON zapp.campaigns FOR INSERT TO authenticated
  WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY campaign_contacts_select ON zapp.campaign_contacts FOR SELECT TO authenticated
  USING (zapp.is_contact_visible_to_user(contact_id, auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid())
         OR EXISTS (SELECT 1 FROM zapp.campaigns c WHERE c.id = campaign_contacts.campaign_id AND c.created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())));
CREATE POLICY campaign_ab_select ON zapp.campaign_ab_variants FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM zapp.campaigns c WHERE c.id = campaign_ab_variants.campaign_id
                 AND (c.created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()))));
CREATE POLICY talkx_campaigns_select ON zapp.talkx_campaigns FOR SELECT TO authenticated
  USING (created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY talkx_recipients_select ON zapp.talkx_recipients FOR SELECT TO authenticated
  USING (zapp.is_contact_visible_to_user(contact_id, auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid())
         OR EXISTS (SELECT 1 FROM zapp.talkx_campaigns tc WHERE tc.id = talkx_recipients.campaign_id AND tc.created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())));
CREATE POLICY talkx_blacklist_select ON zapp.talkx_blacklist FOR SELECT TO authenticated
  USING (zapp.is_contact_visible_to_user(contact_id, auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY scheduled_messages_select ON zapp.scheduled_messages FOR SELECT TO authenticated
  USING (created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid())
         OR zapp.is_contact_visible_to_user(contact_id, auth.uid()));
CREATE POLICY scheduled_reports_select ON zapp.scheduled_reports FOR SELECT TO authenticated
  USING (created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY scheduled_report_configs_select ON zapp.scheduled_report_configs FOR SELECT TO authenticated
  USING (created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));

COMMIT;
