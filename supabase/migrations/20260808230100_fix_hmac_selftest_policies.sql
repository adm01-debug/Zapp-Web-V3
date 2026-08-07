-- Fix hmac_selftest_audit — regressão do C3 (VAL3-02-05, 3ª validação 2026-08-07)
-- O C3 (20260807235800) restringiu a tabela com SELECT USING(false) p/ authenticated,
-- mas o FRONT usa a tabela diretamente (admin-webhook-secret-status):
--   - INSERT: HmacSelfTestButton.tsx (cliente authenticated) — policy de INSERT não existia
--   - SELECT: useHmacAuditHistory.ts (admin lê histórico, limit 2000)
--   - Realtime: useHmacAuditHistory.ts subscribe INSERT
-- Fix: INSERT WITH CHECK(true) restaurada + SELECT com guard is_admin_or_supervisor().
-- service_role intocado (BYPASSRLS nativo).

DROP POLICY IF EXISTS "auth_secure_70" ON zapp.hmac_selftest_audit;
CREATE POLICY "auth_secure_70" ON zapp.hmac_selftest_audit
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "auth_secure_70_select" ON zapp.hmac_selftest_audit;
CREATE POLICY "auth_secure_70_select" ON zapp.hmac_selftest_audit
  FOR SELECT TO authenticated USING (zapp.is_admin_or_supervisor());
