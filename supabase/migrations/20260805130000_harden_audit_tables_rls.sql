-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: 20260805130000_harden_audit_tables_rls.sql
-- Purpose  : HIGH severity gap found in exhaustive validation (2026-08-04).
--            auth_secure_70 / auth_secure_72 (criadas espelhando produção na
--            migration delta_724) concediam ALL a authenticated em tabelas de
--            AUDITORIA — qualquer usuário logado podia UPDATE/DELETE o audit
--            trail (tampering): apagar evidência de ataques em
--            instance_auth_events, forjar resultados de HMAC self-test.
-- Fix      : hmac_selftest_audit → INSERT+SELECT p/ authenticated (frontend
--            HmacSelfTestButton.tsx:50 insere; useHmacAuditHistory.ts:31 lê).
--            UPDATE/DELETE: nenhuma policy (negado por RLS). instance_auth_events
--            → ZERO policies authenticated (nenhum consumidor frontend; só a
--            edge fn instance-pause.ts insere via service_role → svc_rw).
-- Verified : pg_policies 2026-08-04 + grep de consumidores no repo.
-- Idempotent: DROP IF EXISTS + CREATE.
-- Rollback  : recriar auth_secure_70/72 como ALL (estado anterior).
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- hmac_selftest_audit: manter INSERT + SELECT para authenticated
DROP POLICY IF EXISTS auth_secure_70 ON zapp.hmac_selftest_audit;
CREATE POLICY auth_secure_70 ON zapp.hmac_selftest_audit
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS auth_secure_70_select ON zapp.hmac_selftest_audit;
CREATE POLICY auth_secure_70_select ON zapp.hmac_selftest_audit
  FOR SELECT TO authenticated USING (true);

-- instance_auth_events: remover TODO acesso authenticated
DROP POLICY IF EXISTS auth_secure_72 ON zapp.instance_auth_events;
DROP POLICY IF EXISTS iae_admin_select ON zapp.instance_auth_events;

-- service_full_access (hmac) e svc_rw (iae) permanecem: service_role ALL.

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION: authenticated NÃO pode UPDATE/DELETE em nenhuma das duas
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_hmac_ud_policies INTEGER;
  v_iae_policies     INTEGER;
BEGIN
  -- Nenhuma policy UPDATE/DELETE p/ authenticated em hmac_selftest_audit
  SELECT count(*) INTO v_hmac_ud_policies
    FROM pg_policies
   WHERE schemaname = 'zapp'
     AND tablename  = 'hmac_selftest_audit'
     AND roles @> ARRAY['authenticated']
     AND cmd IN ('UPDATE', 'DELETE', 'ALL');

  IF v_hmac_ud_policies > 0 THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: authenticated ainda tem % policy(s) de escrita em hmac_selftest_audit', v_hmac_ud_policies;
  END IF;

  -- Zero policies p/ authenticated em instance_auth_events
  SELECT count(*) INTO v_iae_policies
    FROM pg_policies
   WHERE schemaname = 'zapp'
     AND tablename  = 'instance_auth_events'
     AND roles @> ARRAY['authenticated'];

  IF v_iae_policies > 0 THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: authenticated ainda tem % policy(s) em instance_auth_events', v_iae_policies;
  END IF;
END $$;

COMMIT;
