-- 20260801000002 — P0: RLS nas 15 tabelas de segurança (auditoria etapa 7)
-- Aplicado em produção: 2026-08-01
-- Backup: zapp._policy_backup_20260801 (snapshot completo de pg_policies, 1336 linhas)
-- Rollback: restaurar policies do backup:
--   INSERT INTO pg_policies ... (via DO block lendo zapp._policy_backup_20260801)

BEGIN;

-- audit_logs: admin/dev SELECT + próprio usuário
DROP POLICY IF EXISTS auth_full_access ON zapp.audit_logs;
CREATE POLICY audit_logs_admin_select ON zapp.audit_logs FOR SELECT TO authenticated
  USING (zapp.has_role(auth.uid(),'admin') OR zapp.has_role(auth.uid(),'dev'));
CREATE POLICY audit_logs_self_select ON zapp.audit_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- blocked_ips / ip_whitelist: somente admin/dev
DROP POLICY IF EXISTS auth_full_access ON zapp.blocked_ips;
CREATE POLICY blocked_ips_admin_select ON zapp.blocked_ips FOR SELECT TO authenticated
  USING (zapp.has_role(auth.uid(),'admin') OR zapp.has_role(auth.uid(),'dev'));
DROP POLICY IF EXISTS auth_full_access ON zapp.ip_whitelist;
CREATE POLICY ip_whitelist_admin_select ON zapp.ip_whitelist FOR SELECT TO authenticated
  USING (zapp.has_role(auth.uid(),'admin') OR zapp.has_role(auth.uid(),'dev'));

-- login_attempts / query_telemetry: somente admin/dev
DROP POLICY IF EXISTS auth_rls ON zapp.login_attempts;
CREATE POLICY login_attempts_admin_select ON zapp.login_attempts FOR SELECT TO authenticated
  USING (zapp.has_role(auth.uid(),'admin') OR zapp.has_role(auth.uid(),'dev'));
DROP POLICY IF EXISTS auth_rls ON zapp.query_telemetry;
CREATE POLICY query_telemetry_admin_select ON zapp.query_telemetry FOR SELECT TO authenticated
  USING (zapp.has_role(auth.uid(),'admin') OR zapp.has_role(auth.uid(),'dev'));

-- rate_limit_configs / rate_limit_logs: admin/dev (+ próprio usuário em logs)
DROP POLICY IF EXISTS auth_full_access ON zapp.rate_limit_configs;
CREATE POLICY rate_limit_configs_admin_select ON zapp.rate_limit_configs FOR SELECT TO authenticated
  USING (zapp.has_role(auth.uid(),'admin') OR zapp.has_role(auth.uid(),'dev'));
DROP POLICY IF EXISTS auth_full_access ON zapp.rate_limit_logs;
CREATE POLICY rate_limit_logs_admin_select ON zapp.rate_limit_logs FOR SELECT TO authenticated
  USING (zapp.has_role(auth.uid(),'admin') OR zapp.has_role(auth.uid(),'dev'));
CREATE POLICY rate_limit_logs_self_select ON zapp.rate_limit_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- security_alerts: admin/dev + próprio usuário
DROP POLICY IF EXISTS auth_full_access ON zapp.security_alerts;
CREATE POLICY security_alerts_admin_select ON zapp.security_alerts FOR SELECT TO authenticated
  USING (zapp.has_role(auth.uid(),'admin') OR zapp.has_role(auth.uid(),'dev'));
CREATE POLICY security_alerts_self_select ON zapp.security_alerts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- user_devices: dono (SELECT/INSERT/UPDATE) + admin/dev SELECT
DROP POLICY IF EXISTS auth_full_access ON zapp.user_devices;
CREATE POLICY user_devices_self ON zapp.user_devices FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY user_devices_admin_select ON zapp.user_devices FOR SELECT TO authenticated
  USING (zapp.has_role(auth.uid(),'admin') OR zapp.has_role(auth.uid(),'dev'));
CREATE POLICY user_devices_self_insert ON zapp.user_devices FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY user_devices_self_update ON zapp.user_devices FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- user_sessions: dono (SELECT/INSERT/UPDATE) + admin/dev SELECT
DROP POLICY IF EXISTS auth_full_access ON zapp.user_sessions;
CREATE POLICY user_sessions_self ON zapp.user_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY user_sessions_admin_select ON zapp.user_sessions FOR SELECT TO authenticated
  USING (zapp.has_role(auth.uid(),'admin') OR zapp.has_role(auth.uid(),'dev'));
CREATE POLICY user_sessions_self_insert ON zapp.user_sessions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY user_sessions_self_update ON zapp.user_sessions FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- webauthn_challenges: remover auth_rw permissiva (mantém "Users can manage own challenges")
DROP POLICY IF EXISTS auth_rw ON zapp.webauthn_challenges;

COMMIT;

-- Validação pós-aplicação (esperado: 0):
-- SELECT count(*) FROM pg_policies
-- WHERE schemaname='zapp' AND tablename IN ('audit_logs','security_audit_logs','security_alerts',
--   'login_attempts','password_reset_requests','passkey_credentials','webauthn_challenges',
--   'mfa_sessions','user_sessions','user_devices','blocked_ips','ip_whitelist',
--   'rate_limit_logs','rate_limit_configs','query_telemetry')
--   AND qual='true' AND roles::text LIKE '%authenticated%';
