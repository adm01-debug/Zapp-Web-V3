-- fix(rls): Wave 3 — gaps de RLS confirmados por ground truth (2026-08-04)
--
-- 1. email_app.imap_smtp_accounts: RLS OFF + grants authenticated (SELECT/INSERT/UPDATE/DELETE)
--    → CREDENCIAIS SMTP/IMAP DE QUALQUER CONTA legíveis por qualquer usuário logado.
--    Fix: RLS ON + policy por dono (user_id) + admin. (zapp.imap_smtp_accounts é VIEW —
--    a física é email_app; a view herda RLS da base via security_invoker.)
-- 2. campaigns: campaigns_admin_write só INSERT (polcmd='a') — UPDATE/DELETE
--    do hook useCampaigns quebram (RLS on sem policy de write).
--    Fix: policies campaigns_update/campaigns_delete (mesmo guard de campaigns_select).
-- 3. contact_segments: auth_secure_190 só SELECT (is_admin_or_supervisor) —
--    CRUD que a UI de segmentos vai precisar (CONTATOS-07).
--    Fix: policies insert/update/delete com o mesmo guard.
-- 4. campaign_contacts: só SELECT — RPC add_contacts_to_campaign é SECURITY DEFINER
--    (bypassa RLS), então INSERT via RPC funciona; mas INSERT direto de destinatários
--    (hook useCampaigns) quebra. Fix: policy INSERT para dono da campanha/admin.

BEGIN;

-- 1) email_app.imap_smtp_accounts — RLS ON + owner/admin
ALTER TABLE email_app.imap_smtp_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS imap_smtp_accounts_owner_select ON email_app.imap_smtp_accounts;
CREATE POLICY imap_smtp_accounts_owner_select ON email_app.imap_smtp_accounts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR zapp.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS imap_smtp_accounts_owner_insert ON email_app.imap_smtp_accounts;
CREATE POLICY imap_smtp_accounts_owner_insert ON email_app.imap_smtp_accounts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR zapp.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS imap_smtp_accounts_owner_update ON email_app.imap_smtp_accounts;
CREATE POLICY imap_smtp_accounts_owner_update ON email_app.imap_smtp_accounts
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR zapp.is_admin_or_supervisor(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR zapp.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS imap_smtp_accounts_owner_delete ON email_app.imap_smtp_accounts;
CREATE POLICY imap_smtp_accounts_owner_delete ON email_app.imap_smtp_accounts
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR zapp.is_admin_or_supervisor(auth.uid()));

-- 2) campaigns — UPDATE/DELETE (admin/owner, mesmo guard de campaigns_select)
DROP POLICY IF EXISTS campaigns_update ON zapp.campaigns;
CREATE POLICY campaigns_update ON zapp.campaigns
  FOR UPDATE TO authenticated
  USING ((created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()))
         OR zapp.is_admin_or_supervisor(auth.uid()))
  WITH CHECK ((created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()))
              OR zapp.is_admin_or_supervisor(auth.uid()));

DROP POLICY IF EXISTS campaigns_delete ON zapp.campaigns;
CREATE POLICY campaigns_delete ON zapp.campaigns
  FOR DELETE TO authenticated
  USING ((created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()))
         OR zapp.is_admin_or_supervisor(auth.uid()));

-- 3) contact_segments — write (admin, mesmo guard de auth_secure_190)
DROP POLICY IF EXISTS contact_segments_insert ON zapp.contact_segments;
CREATE POLICY contact_segments_insert ON zapp.contact_segments
  FOR INSERT TO authenticated
  WITH CHECK (zapp.is_admin_or_supervisor());

DROP POLICY IF EXISTS contact_segments_update ON zapp.contact_segments;
CREATE POLICY contact_segments_update ON zapp.contact_segments
  FOR UPDATE TO authenticated
  USING (zapp.is_admin_or_supervisor())
  WITH CHECK (zapp.is_admin_or_supervisor());

DROP POLICY IF EXISTS contact_segments_delete ON zapp.contact_segments;
CREATE POLICY contact_segments_delete ON zapp.contact_segments
  FOR DELETE TO authenticated
  USING (zapp.is_admin_or_supervisor());

-- 4) campaign_contacts — INSERT direto (dono da campanha ou admin; SELECT já existe)
DROP POLICY IF EXISTS campaign_contacts_insert ON zapp.campaign_contacts;
CREATE POLICY campaign_contacts_insert ON zapp.campaign_contacts
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM zapp.campaigns c
                      WHERE c.id = campaign_contacts.campaign_id
                        AND (c.created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
                             OR zapp.is_admin_or_supervisor(auth.uid()))));

COMMIT;
