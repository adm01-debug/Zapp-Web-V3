-- 20260801040002 — RLS Lote 2: tabelas de contato (auditoria etapa 36)
-- Aplicado em producao: 2026-08-01 (impacto medido: 0 — todos os contatos com assigned_to IS NULL)
-- Backup: zapp._policy_backup_20260801
-- Rollback: restaurar policies do backup

BEGIN;

DROP POLICY IF EXISTS auth_full_access ON zapp.contact_custom_fields;
DROP POLICY IF EXISTS auth_full_access ON zapp.contact_notes;
DROP POLICY IF EXISTS auth_full_access ON zapp.contact_purchases;
DROP POLICY IF EXISTS auth_full_access ON zapp.contact_tags;
DROP POLICY IF EXISTS auth_full_access ON zapp.favorite_contacts;
DROP POLICY IF EXISTS auth_full_access ON zapp.pinned_conversations;
DROP POLICY IF EXISTS auth_full_access ON zapp.sicoob_contact_mapping;

CREATE POLICY contact_fields_select ON zapp.contact_custom_fields FOR SELECT TO authenticated
  USING (zapp.is_contact_visible_to_user(contact_id, auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY contact_notes_select ON zapp.contact_notes FOR SELECT TO authenticated
  USING (zapp.is_contact_visible_to_user(contact_id, auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY contact_notes_insert ON zapp.contact_notes FOR INSERT TO authenticated
  WITH CHECK (zapp.is_contact_visible_to_user(contact_id, auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY contact_purchases_select ON zapp.contact_purchases FOR SELECT TO authenticated
  USING (zapp.is_contact_visible_to_user(contact_id, auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY contact_tags_select ON zapp.contact_tags FOR SELECT TO authenticated
  USING (zapp.is_contact_visible_to_user(contact_id, auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY favorite_contacts_select ON zapp.favorite_contacts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY favorite_contacts_insert ON zapp.favorite_contacts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY favorite_contacts_delete ON zapp.favorite_contacts FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY pinned_conversations_select ON zapp.pinned_conversations FOR SELECT TO authenticated
  USING (zapp.is_contact_visible_to_user(contact_id, auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));
CREATE POLICY sicoob_mapping_select ON zapp.sicoob_contact_mapping FOR SELECT TO authenticated
  USING (zapp.is_contact_visible_to_user(contact_id, auth.uid()) OR zapp.is_admin_or_supervisor(auth.uid()));

COMMIT;
