-- C3 — restrição de policies RLS permissivas (authenticated, qual=true) — 2026-08-06
-- Escopo RESTRINGIR (conservador, só claramente sensível; sem consumidor direto do front):
--   zapp: alerts (tenant filter), alert_dispatch_state, processed_webhook_events,
--         rpc_rate_limits, webhook_health_alerts, lux_system_alerts, hmac_selftest_audit (SELECT)
--   evo : evolution_labels
--   archive: migration_audit | monitoring: architecture_changelog | ops: schema_changelog
-- service_role NÃO é afetado (BYPASSRLS nativo). Nomes de policy preservados (rastreabilidade).

-- 1) zapp.alerts — tem workspace_id → filtro tenant (padrão analytics_events)
DROP POLICY IF EXISTS "auth_access" ON zapp.alerts;
CREATE POLICY "auth_access" ON zapp.alerts FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM zapp.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM zapp.workspace_members WHERE user_id = auth.uid()));

-- 2) zapp.alert_dispatch_state — sem coluna de escopo → fail-closed
DROP POLICY IF EXISTS "auth_select_all" ON zapp.alert_dispatch_state;
CREATE POLICY "auth_select_all" ON zapp.alert_dispatch_state FOR SELECT TO authenticated USING (false);

-- 3) zapp.processed_webhook_events — sem coluna de escopo → fail-closed
DROP POLICY IF EXISTS "auth_select_all" ON zapp.processed_webhook_events;
CREATE POLICY "auth_select_all" ON zapp.processed_webhook_events FOR SELECT TO authenticated USING (false);

-- 4) zapp.rpc_rate_limits — sem coluna de escopo → fail-closed
DROP POLICY IF EXISTS "auth_select_all" ON zapp.rpc_rate_limits;
CREATE POLICY "auth_select_all" ON zapp.rpc_rate_limits FOR SELECT TO authenticated USING (false);

-- 5) zapp.webhook_health_alerts — sem coluna de escopo → fail-closed
DROP POLICY IF EXISTS "auth_select_all" ON zapp.webhook_health_alerts;
CREATE POLICY "auth_select_all" ON zapp.webhook_health_alerts FOR SELECT TO authenticated USING (false);

-- 6) zapp.lux_system_alerts — sem coluna de escopo → fail-closed
DROP POLICY IF EXISTS "authenticated_read_lux_alerts" ON zapp.lux_system_alerts;
CREATE POLICY "authenticated_read_lux_alerts" ON zapp.lux_system_alerts FOR SELECT TO authenticated USING (false);

-- 7) zapp.hmac_selftest_audit — SELECT fail-closed; INSERT (auth_secure_70) preservada p/ front
DROP POLICY IF EXISTS "auth_secure_70_select" ON zapp.hmac_selftest_audit;
CREATE POLICY "auth_secure_70_select" ON zapp.hmac_selftest_audit FOR SELECT TO authenticated USING (false);

-- 8) evo.evolution_labels — sem coluna de escopo → fail-closed
DROP POLICY IF EXISTS "authenticated_read_labels" ON evo.evolution_labels;
CREATE POLICY "authenticated_read_labels" ON evo.evolution_labels FOR SELECT TO authenticated USING (false);

-- 9) archive.migration_audit — ALL fail-closed (audit; service_role bypassa)
DROP POLICY IF EXISTS "auth_full_access" ON archive.migration_audit;
CREATE POLICY "auth_full_access" ON archive.migration_audit FOR ALL TO authenticated USING (false);

-- 10) monitoring.architecture_changelog — SELECT fail-closed (contém sql_executed/rollback_sql)
DROP POLICY IF EXISTS "arch_changelog_auth_read" ON monitoring.architecture_changelog;
CREATE POLICY "arch_changelog_auth_read" ON monitoring.architecture_changelog FOR SELECT TO authenticated USING (false);

-- 11) ops.schema_changelog — SELECT fail-closed (ops com applied_by/description)
DROP POLICY IF EXISTS "schema_changelog_read_authenticated" ON ops.schema_changelog;
CREATE POLICY "schema_changelog_read_authenticated" ON ops.schema_changelog FOR SELECT TO authenticated USING (false);
