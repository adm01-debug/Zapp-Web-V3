-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 20260804195000_talkx_recipients_write_policies
-- Purpose  : Alinhar repo ↔ banco canônico. Aplicada direto no banco em
--            2026-08-04 19:26 (registro manual via MCP) sem arquivo no repo.
--            Reconstruída fielmente do estado real do banco (pg_policies,
--            extração 2026-08-04) para que ambientes novos fiquem idênticos
--            ao canônico.
-- Idempotent: DROP POLICY IF EXISTS + CREATE POLICY — safe to re-run.
-- Rollback  : restaurar policies da canonical_schema (20260804000000).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. service_full_access — service_role ALL (presente no canônico)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS service_full_access ON zapp.talkx_recipients;
CREATE POLICY service_full_access ON zapp.talkx_recipients
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. talkx_recipients_select — leitura: contato visível, admin/supervisor,
--    ou dono da campanha (estado real do canônico, com is_contact_visible_to_user)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS talkx_recipients_select ON zapp.talkx_recipients;
CREATE POLICY talkx_recipients_select ON zapp.talkx_recipients
  FOR SELECT TO authenticated
  USING (
    zapp.is_contact_visible_to_user(contact_id, auth.uid())
    OR zapp.is_admin_or_supervisor(auth.uid())
    OR EXISTS (
      SELECT 1 FROM zapp.talkx_campaigns tc
      WHERE tc.id = talkx_recipients.campaign_id
        AND tc.created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. talkx_recipients_insert — escrita via edge function (service_role);
--    insert direto por authenticated restrito a admin/supervisor (fail-closed)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS talkx_recipients_insert ON zapp.talkx_recipients;
CREATE POLICY talkx_recipients_insert ON zapp.talkx_recipients
  FOR INSERT TO authenticated
  WITH CHECK (zapp.is_admin_or_supervisor(auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. talkx_recipients_update — dono da campanha ou admin/supervisor
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS talkx_recipients_update ON zapp.talkx_recipients;
CREATE POLICY talkx_recipients_update ON zapp.talkx_recipients
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM zapp.talkx_campaigns tc
      WHERE tc.id = talkx_recipients.campaign_id
        AND (tc.created_by = auth.uid()
          OR tc.created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()))
    )
    OR zapp.is_admin_or_supervisor(auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM zapp.talkx_campaigns tc
      WHERE tc.id = talkx_recipients.campaign_id
        AND (tc.created_by = auth.uid()
          OR tc.created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()))
    )
    OR zapp.is_admin_or_supervisor(auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. talkx_recipients_delete — dono da campanha ou admin/supervisor
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS talkx_recipients_delete ON zapp.talkx_recipients;
CREATE POLICY talkx_recipients_delete ON zapp.talkx_recipients
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM zapp.talkx_campaigns tc
      WHERE tc.id = talkx_recipients.campaign_id
        AND (tc.created_by = auth.uid()
          OR tc.created_by = (SELECT p.id FROM zapp.profiles p WHERE p.user_id = auth.uid()))
    )
    OR zapp.is_admin_or_supervisor(auth.uid())
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION — falha se qualquer policy esperada faltar no schema zapp
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_missing TEXT := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'zapp' AND c.relname = 'talkx_recipients' AND p.polname = 'service_full_access') THEN
    v_missing := v_missing || 'service_full_access; ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'zapp' AND c.relname = 'talkx_recipients' AND p.polname = 'talkx_recipients_select') THEN
    v_missing := v_missing || 'talkx_recipients_select; ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'zapp' AND c.relname = 'talkx_recipients' AND p.polname = 'talkx_recipients_insert') THEN
    v_missing := v_missing || 'talkx_recipients_insert; ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'zapp' AND c.relname = 'talkx_recipients' AND p.polname = 'talkx_recipients_update') THEN
    v_missing := v_missing || 'talkx_recipients_update; ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'zapp' AND c.relname = 'talkx_recipients' AND p.polname = 'talkx_recipients_delete') THEN
    v_missing := v_missing || 'talkx_recipients_delete; ';
  END IF;
  IF v_missing <> '' THEN
    RAISE EXCEPTION 'MISSING after 20260804195000: %', v_missing;
  END IF;
END $$;

COMMIT;
