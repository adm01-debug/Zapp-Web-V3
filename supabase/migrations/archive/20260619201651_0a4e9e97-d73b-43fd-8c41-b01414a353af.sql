
-- ----- whatsapp_connections -----
DROP POLICY IF EXISTS "Only admins can manage connections" ON public.whatsapp_connections;

DROP VIEW IF EXISTS public.whatsapp_connections_safe CASCADE;
CREATE VIEW public.whatsapp_connections_safe
WITH (security_invoker = on)
AS
SELECT
  id, name, phone_number, instance_id, status,
  (qr_code IS NOT NULL) AS has_qr_code,
  is_default, created_by, created_at, updated_at,
  farewell_message, farewell_enabled, battery_level, is_plugged,
  retry_count, max_retries, last_health_check, health_status,
  health_response_ms, auto_reconnect_enabled, reconnect_interval_seconds,
  max_reconnect_attempts, loop_protection_active
FROM public.whatsapp_connections;

GRANT SELECT ON public.whatsapp_connections_safe TO authenticated;

REVOKE SELECT (qr_code) ON public.whatsapp_connections FROM authenticated;
GRANT SELECT (qr_code) ON public.whatsapp_connections TO service_role;

-- ----- departments -----
DROP VIEW IF EXISTS public.departments_safe CASCADE;
CREATE VIEW public.departments_safe
WITH (security_invoker = on)
AS
SELECT
  id, name, description, whatsapp_mode, whatsapp_instance_id, is_active,
  created_at, updated_at,
  (whatsapp_api_key IS NOT NULL) AS has_whatsapp_api_key
FROM public.departments;

GRANT SELECT ON public.departments_safe TO authenticated;

REVOKE SELECT (whatsapp_api_key) ON public.departments FROM authenticated;
GRANT SELECT (whatsapp_api_key) ON public.departments TO service_role;

-- ----- audit_logs -----
DROP POLICY IF EXISTS "Authenticated users can insert their own audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Only system can insert audit logs" ON public.audit_logs;

DROP POLICY IF EXISTS "Users can insert their own audit logs" ON public.audit_logs;
CREATE POLICY "Users can insert their own audit logs"
ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role can insert any audit log"
ON public.audit_logs FOR INSERT TO service_role
WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Only admins can view audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Only admins/dev can view audit logs" ON public.audit_logs;

CREATE POLICY "Admins view all audit logs"
ON public.audit_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'dev'::app_role));

CREATE POLICY "Users view their own audit logs"
ON public.audit_logs FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- ----- security_audit_logs -----
CREATE POLICY "Service role inserts security audit logs"
ON public.security_audit_logs FOR INSERT TO service_role
WITH CHECK (true);

CREATE POLICY "Admins view all security audit logs"
ON public.security_audit_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'dev'::app_role));

CREATE POLICY "Block authenticated updates on security audit logs"
ON public.security_audit_logs FOR UPDATE TO authenticated USING (false);

CREATE POLICY "Block authenticated deletes on security audit logs"
ON public.security_audit_logs FOR DELETE TO authenticated USING (false);

-- ----- login_attempts -----
DROP POLICY IF EXISTS "Block authenticated inserts on login_attempts" ON public.login_attempts;
CREATE POLICY "Block authenticated inserts on login_attempts"
ON public.login_attempts FOR INSERT TO authenticated
WITH CHECK (false);

-- ----- Function hardening: revoke EXECUTE from anon/PUBLIC -----
REVOKE EXECUTE ON FUNCTION public.reassign_absent_agents(integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reassign_overloaded_agents() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pause_instance(text, text, integer, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unpause_instance(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.clear_login_attempts(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_failed_login(text, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_old_query_telemetry(integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_dlq_retry_now(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_dlq_abandon(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_dlq_bulk_abandon(uuid[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rpc_migrate_whatsapp_integration() FROM anon, PUBLIC;
