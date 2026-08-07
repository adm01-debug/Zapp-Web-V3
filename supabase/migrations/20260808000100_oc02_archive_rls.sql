-- OC-02 / REC-02-23: archive RLS
-- Tabelas com dados e RLS off, grants APENAS postgres (zero grants nao-owner):
--   archive._grant_backup_prewaveb_20260801 (902 rows)
--   archive._policy_backup_prewavea_20260801 (1552 rows)
-- Document-only (grants nao-owner): _rls_canary_20260801 (anon+authenticated INSERT),
--   _test_results_20260801 (authenticated INSERT) — ver AG-OC-02-rls.md.
-- ENABLE + policy na MESMA transacao (supabase_apply_migration).
ALTER TABLE archive._grant_backup_prewaveb_20260801 ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive._policy_backup_prewavea_20260801 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_full_access" ON archive._grant_backup_prewaveb_20260801 FOR ALL TO supabase_admin USING (true) WITH CHECK (true);
CREATE POLICY "admin_full_access" ON archive._policy_backup_prewavea_20260801 FOR ALL TO supabase_admin USING (true) WITH CHECK (true);
