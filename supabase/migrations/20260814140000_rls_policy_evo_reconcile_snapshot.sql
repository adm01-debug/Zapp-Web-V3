-- GAP-01: zapp.evo_reconcile_contact_snapshot tinha RLS enabled mas 0 policies.
-- Efeito: fn_score_security_acl contava rls_zero_policy=1 → security_acl=0/5 → health score 96.9%.
-- Fix: policy SELECT para authenticated (tabela interna de reconciliação, acesso read-only para app).
-- service_role continua bypassando RLS (INSERT/UPDATE/DELETE via evo-reconcile).

CREATE POLICY "authenticated_read_reconcile_snapshot"
ON zapp.evo_reconcile_contact_snapshot
FOR SELECT
TO authenticated
USING (true);
