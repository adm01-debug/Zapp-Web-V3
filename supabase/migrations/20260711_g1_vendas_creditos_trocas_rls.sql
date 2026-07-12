-- G1 2026-07-11: Enable RLS on vendas.creditos and vendas.trocas
-- Gap: Both tables had anon SELECT=true and RLS=OFF — financial data exposed to unauthenticated users
-- Fix: Enable RLS + create proper policies + revoke anon SELECT
-- Evidence: 0 rows in both tables (no data impact), no FK dependencies, no triggers

-- Enable RLS (deny all without explicit policy)
ALTER TABLE vendas.creditos ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendas.trocas ENABLE ROW LEVEL SECURITY;

-- Policies: service_role (full) + authenticated (full) — no anon policy intentional
DROP POLICY IF EXISTS "service_role_full" ON vendas.creditos;
CREATE POLICY "service_role_full" ON vendas.creditos
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_full_access" ON vendas.creditos;
CREATE POLICY "auth_full_access" ON vendas.creditos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_role_full" ON vendas.trocas;
CREATE POLICY "service_role_full" ON vendas.trocas
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_full_access" ON vendas.trocas;
CREATE POLICY "auth_full_access" ON vendas.trocas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Revoke anon table-level grants (defense-in-depth)
REVOKE SELECT ON vendas.creditos FROM anon;
REVOKE SELECT ON vendas.trocas FROM anon;

-- Verification:
-- SELECT has_table_privilege('anon','vendas.creditos','SELECT'); -- must be false
-- SELECT rowsecurity FROM pg_tables WHERE schemaname='vendas' AND tablename='creditos'; -- must be true
-- SELECT count(*) FROM pg_policies WHERE schemaname='vendas' AND tablename='creditos'; -- must be 2
