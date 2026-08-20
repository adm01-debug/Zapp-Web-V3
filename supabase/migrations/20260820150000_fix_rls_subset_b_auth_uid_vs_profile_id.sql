-- 20260820150000 — Fix RLS subset B: auth.uid() vs profile_id
-- =============================================================================
-- Classe do bug: policies comparando FK→zapp.profiles.id com auth.uid()
-- (auth.users.id) em vez de usar get_profile_id_for_user(auth.uid()).
--
-- Tabelas afetadas:
--   tags (created_by)       → auth_secure_115
--   sales_deals (assigned_to) → auth_secure_97
--   scheduled_messages (created_by) → auth_secure_99
--   talkx_campaigns (created_by) → talkx_campaigns_update
--   whatsapp_flows (created_by)   → auth_secure_124
--   whatsapp_templates (created_by) → auth_secure_126
--
-- Evidencia do bug:
--   3/21 profiles tem id != user_id (ex.: andressa id=87e6... user_id=f4d5...).
--   Policy auth_secure_115: created_by = auth.uid() → mismatch quando
--   profile.id differe de auth.users.id → INSERT bloqueado.
--   Simulado 2026-08-20: SET LOCAL role + INSERT em tags RLS-violation.
--
-- Agora: zapp.get_profile_id_for_user(auth.uid()) → traduz auth.users.id
-- para zapp.profiles.id corretamente.
-- =============================================================================
BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- [1] zapp.tags — auth_secure_115 (ALL)
-- Antes: (is_admin_or_supervisor() OR (created_by = (SELECT auth.uid() AS uid)))
-- Depois: (is_admin_or_supervisor() OR (created_by = get_profile_id_for_user(auth.uid())))
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS auth_secure_115 ON zapp.tags;
CREATE POLICY auth_secure_115 ON zapp.tags
  FOR ALL TO authenticated
  USING (is_admin_or_supervisor() OR created_by = zapp.get_profile_id_for_user(auth.uid()))
  WITH CHECK (is_admin_or_supervisor() OR created_by = zapp.get_profile_id_for_user(auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- [2] zapp.sales_deals — auth_secure_97 (ALL)
-- Antes: (is_admin_or_supervisor() OR (assigned_to = (SELECT auth.uid() AS uid))
--         OR is_contact_visible_to_user(contact_id, (SELECT auth.uid() AS uid)))
-- Depois: assigned_to = get_profile_id_for_user(auth.uid())
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS auth_secure_97 ON zapp.sales_deals;
CREATE POLICY auth_secure_97 ON zapp.sales_deals
  FOR ALL TO authenticated
  USING (is_admin_or_supervisor()
         OR assigned_to = zapp.get_profile_id_for_user(auth.uid())
         OR is_contact_visible_to_user(contact_id, auth.uid()))
  WITH CHECK (is_admin_or_supervisor()
              OR assigned_to = zapp.get_profile_id_for_user(auth.uid())
              OR is_contact_visible_to_user(contact_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- [3] zapp.scheduled_messages — auth_secure_99 (ALL)
-- Antes: (is_admin_or_supervisor() OR (created_by = (SELECT auth.uid() AS uid))
--         OR is_contact_visible_to_user(contact_id, (SELECT auth.uid() AS uid)))
-- Depois: created_by = get_profile_id_for_user(auth.uid())
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS auth_secure_99 ON zapp.scheduled_messages;
CREATE POLICY auth_secure_99 ON zapp.scheduled_messages
  FOR ALL TO authenticated
  USING (is_admin_or_supervisor()
         OR created_by = zapp.get_profile_id_for_user(auth.uid())
         OR is_contact_visible_to_user(contact_id, auth.uid()))
  WITH CHECK (is_admin_or_supervisor()
              OR created_by = zapp.get_profile_id_for_user(auth.uid())
              OR is_contact_visible_to_user(contact_id, auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- [4] zapp.talkx_campaigns — talkx_campaigns_update (UPDATE)
-- Antes: tinha DUAS comparacoes (BUG + correta lado a lado):
--   (created_by = (SELECT auth.uid() AS uid))              ← BUG
--   OR (created_by = (SELECT p.id FROM zapp.profiles p ...)) ← correta
--   OR is_admin_or_supervisor(...)
-- Depois: so a versao correta via get_profile_id_for_user
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS talkx_campaigns_update ON zapp.talkx_campaigns;
CREATE POLICY talkx_campaigns_update ON zapp.talkx_campaigns
  FOR UPDATE TO authenticated
  USING (created_by = zapp.get_profile_id_for_user(auth.uid())
         OR is_admin_or_supervisor(auth.uid()))
  WITH CHECK (created_by = zapp.get_profile_id_for_user(auth.uid())
              OR is_admin_or_supervisor(auth.uid()));

-- ═══════════════════════════════════════════════════════════════════════════
-- [5] zapp.whatsapp_flows — auth_secure_124 (ALL)
-- Antes: ((created_by = (SELECT auth.uid() AS uid)) OR is_admin_or_supervisor())
-- Depois: created_by = get_profile_id_for_user(auth.uid())
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS auth_secure_124 ON zapp.whatsapp_flows;
CREATE POLICY auth_secure_124 ON zapp.whatsapp_flows
  FOR ALL TO authenticated
  USING (created_by = zapp.get_profile_id_for_user(auth.uid())
         OR is_admin_or_supervisor())
  WITH CHECK (created_by = zapp.get_profile_id_for_user(auth.uid())
              OR is_admin_or_supervisor());

-- ═══════════════════════════════════════════════════════════════════════════
-- [6] zapp.whatsapp_templates — auth_secure_126 (ALL)
-- Antes: ((created_by = (SELECT auth.uid() AS uid)) OR is_admin_or_supervisor())
-- Depois: created_by = get_profile_id_for_user(auth.uid())
-- ═══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS auth_secure_126 ON zapp.whatsapp_templates;
CREATE POLICY auth_secure_126 ON zapp.whatsapp_templates
  FOR ALL TO authenticated
  USING (created_by = zapp.get_profile_id_for_user(auth.uid())
         OR is_admin_or_supervisor())
  WITH CHECK (created_by = zapp.get_profile_id_for_user(auth.uid())
              OR is_admin_or_supervisor());

COMMIT;