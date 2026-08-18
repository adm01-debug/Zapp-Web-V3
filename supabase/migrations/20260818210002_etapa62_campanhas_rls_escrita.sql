-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 20260818210000_etapa62_campanhas_rls_escrita
-- Etapa     : E62 (PLANO-100-ETAPAS, fase 7) — subetapas 62.1/62.2
-- Purpose   : RLS de escrita de campanhas — só admin/supervisor ou o DONO da
--             campanha podem escrever (fail-closed, espelhando os guards de
--             SELECT já existentes).
--             * campaign_ab_variants: INSERT/UPDATE/DELETE (antes: só SELECT →
--               addVariant/deleteVariant/declareWinner davam 403 silencioso,
--               findings-10).
--             * campaign_contacts : UPDATE/DELETE (antes: só SELECT/INSERT →
--               atualização de status/progresso de destinatário por dono/admin
--               dava 403; findings-09/10).
--             * zapp.campaigns UPDATE/DELETE JÁ EXISTEM no banco e no repo
--               (20260804210100, guards dono/admin) — esta migration só os
--               VERIFICA no DO block final (invariante, sem recriar).
-- Idempotent: DROP POLICY IF EXISTS + CREATE POLICY — safe to re-run.
-- Rollback  : DROP POLICY IF EXISTS campaign_ab_variants_insert|update|delete
--             ON zapp.campaign_ab_variants; DROP POLICY IF EXISTS
--             campaign_contacts_update|delete ON zapp.campaign_contacts;
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. campaign_ab_variants — INSERT (dono da campanha ou admin/supervisor)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS campaign_ab_variants_insert ON zapp.campaign_ab_variants;
CREATE POLICY campaign_ab_variants_insert ON zapp.campaign_ab_variants
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM zapp.campaigns c
      WHERE c.id = campaign_ab_variants.campaign_id
        AND (c.created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
             OR zapp.is_admin_or_supervisor(auth.uid()))
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. campaign_ab_variants — UPDATE (dono da campanha ou admin/supervisor)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS campaign_ab_variants_update ON zapp.campaign_ab_variants;
CREATE POLICY campaign_ab_variants_update ON zapp.campaign_ab_variants
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM zapp.campaigns c
      WHERE c.id = campaign_ab_variants.campaign_id
        AND (c.created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
             OR zapp.is_admin_or_supervisor(auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM zapp.campaigns c
      WHERE c.id = campaign_ab_variants.campaign_id
        AND (c.created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
             OR zapp.is_admin_or_supervisor(auth.uid()))
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. campaign_ab_variants — DELETE (dono da campanha ou admin/supervisor)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS campaign_ab_variants_delete ON zapp.campaign_ab_variants;
CREATE POLICY campaign_ab_variants_delete ON zapp.campaign_ab_variants
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM zapp.campaigns c
      WHERE c.id = campaign_ab_variants.campaign_id
        AND (c.created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
             OR zapp.is_admin_or_supervisor(auth.uid()))
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. campaign_contacts — UPDATE (dono da campanha ou admin/supervisor)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS campaign_contacts_update ON zapp.campaign_contacts;
CREATE POLICY campaign_contacts_update ON zapp.campaign_contacts
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM zapp.campaigns c
      WHERE c.id = campaign_contacts.campaign_id
        AND (c.created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
             OR zapp.is_admin_or_supervisor(auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM zapp.campaigns c
      WHERE c.id = campaign_contacts.campaign_id
        AND (c.created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
             OR zapp.is_admin_or_supervisor(auth.uid()))
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. campaign_contacts — DELETE (dono da campanha ou admin/supervisor)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS campaign_contacts_delete ON zapp.campaign_contacts;
CREATE POLICY campaign_contacts_delete ON zapp.campaign_contacts
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM zapp.campaigns c
      WHERE c.id = campaign_contacts.campaign_id
        AND (c.created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
             OR zapp.is_admin_or_supervisor(auth.uid()))
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION — falha se qualquer policy esperada faltar no schema zapp
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing TEXT := '';
BEGIN
  -- novas (E62)
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'zapp' AND c.relname = 'campaign_ab_variants' AND p.polname = 'campaign_ab_variants_insert') THEN
    v_missing := v_missing || 'campaign_ab_variants_insert; ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'zapp' AND c.relname = 'campaign_ab_variants' AND p.polname = 'campaign_ab_variants_update') THEN
    v_missing := v_missing || 'campaign_ab_variants_update; ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'zapp' AND c.relname = 'campaign_ab_variants' AND p.polname = 'campaign_ab_variants_delete') THEN
    v_missing := v_missing || 'campaign_ab_variants_delete; ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'zapp' AND c.relname = 'campaign_contacts' AND p.polname = 'campaign_contacts_update') THEN
    v_missing := v_missing || 'campaign_contacts_update; ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'zapp' AND c.relname = 'campaign_contacts' AND p.polname = 'campaign_contacts_delete') THEN
    v_missing := v_missing || 'campaign_contacts_delete; ';
  END IF;
  -- invariantes pré-existentes (não recriadas aqui)
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'zapp' AND c.relname = 'campaigns' AND p.polname = 'campaigns_update') THEN
    v_missing := v_missing || 'campaigns_update(PRÉ-EXISTENTE); ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'zapp' AND c.relname = 'campaigns' AND p.polname = 'campaigns_delete') THEN
    v_missing := v_missing || 'campaigns_delete(PRÉ-EXISTENTE); ';
  END IF;
  IF v_missing <> '' THEN
    RAISE EXCEPTION 'MISSING after 20260818210000: %', v_missing;
  END IF;
END $$;

COMMIT;
