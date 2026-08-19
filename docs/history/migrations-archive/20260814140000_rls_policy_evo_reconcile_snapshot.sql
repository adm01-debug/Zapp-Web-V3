-- GAP-01: zapp.evo_reconcile_contact_snapshot tinha RLS enabled mas 0 policies.
-- Efeito: fn_score_security_acl contava rls_zero_policy=1 → security_acl=0/5 → health score 96.9%.
-- Fix: policy SELECT para authenticated (tabela interna de reconciliação, acesso read-only para app).
-- service_role continua bypassando RLS (INSERT/UPDATE/DELETE via evo-reconcile).
--
-- Idempotência adicionada 2026-08-14 (onda correção P1): produção já tem a
-- policy; o guard DROP POLICY IF EXISTS + CREATE POLICY protege fresh
-- install/replay (re-executar com CREATE POLICY puro falhava com
-- 'policy already exists'). Padrão da casa: DROP POLICY IF EXISTS + CREATE
-- POLICY (PostgreSQL não tem CREATE POLICY IF NOT EXISTS).

DROP POLICY IF EXISTS "authenticated_read_reconcile_snapshot" ON zapp.evo_reconcile_contact_snapshot;

CREATE POLICY "authenticated_read_reconcile_snapshot"
ON zapp.evo_reconcile_contact_snapshot
FOR SELECT
TO authenticated
USING (true);
