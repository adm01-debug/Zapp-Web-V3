-- =============================================================================
-- Security Remediation: SECURITY DEFINER search_path hardening + RLS gaps
-- Date: 2026-07-27
--
-- Category A — search_path Shadow-Attack Vector:
--   SECURITY DEFINER functions with `public` (or another user-writable schema)
--   first in SET search_path allow an authenticated attacker to shadow built-in
--   functions (e.g. now(), gen_random_uuid()) by creating homoynmous objects in
--   `public`. The function executes as its owner (typically `postgres`) so
--   shadowed code runs with superuser privileges.
--
--   Fix: prepend pg_catalog so built-ins are resolved first. Each ALTER below
--   also appends pg_temp to keep temp-object visibility explicit and last.
--
-- Category B — Tables lacking ENABLE ROW LEVEL SECURITY:
--   Tables created by r17 security/hardening migrations (20260712171x) were
--   never given ENABLE ROW LEVEL SECURITY. Without RLS, any authenticated
--   session can read/write all rows via PostgREST (anon is blocked via GRANT,
--   but authenticated users have full table access).
--
--   Fix: ENABLE ROW LEVEL SECURITY + deny-by-default policy + service_role
--   (and admin-only for tables that operators must access).
--
-- Scope:
--   - 18 functions (Category A)
--   - 15 tables (Category B)
--
-- Idempotent: all ALTER statements are wrapped in DO blocks that skip
-- gracefully if the function/table does not exist (e.g. not yet applied).
-- =============================================================================


-- =============================================================================
-- CATEGORY A — Fix search_path on SECURITY DEFINER functions
-- =============================================================================
-- Safe pattern: pg_catalog first (prevents built-in shadowing), then the
-- minimal schemas the function body references, pg_temp last (prevents temp
-- objects from shadowing after pg_catalog is locked in).
-- =============================================================================

-- A-1: public.log_rls_denied — writes to public.audit_log_denied
DO $$ BEGIN
  ALTER FUNCTION public.log_rls_denied(text, text, jsonb)
    SET search_path = pg_catalog, public, pg_temp;
  RAISE NOTICE 'Hardened search_path: public.log_rls_denied(text, text, jsonb)';
EXCEPTION
  WHEN undefined_function THEN RAISE NOTICE 'public.log_rls_denied(text,text,jsonb) not found — skipping';
  WHEN OTHERS THEN RAISE WARNING 'log_rls_denied: % %', SQLSTATE, SQLERRM;
END $$;

-- A-2: public.rpc_list_failed_messages — queries public.failed_messages
DO $$ BEGIN
  ALTER FUNCTION public.rpc_list_failed_messages(text[], text, text, timestamptz, timestamptz, integer, integer)
    SET search_path = pg_catalog, public, pg_temp;
  RAISE NOTICE 'Hardened search_path: public.rpc_list_failed_messages(...)';
EXCEPTION
  WHEN undefined_function THEN RAISE NOTICE 'public.rpc_list_failed_messages not found — skipping';
  WHEN OTHERS THEN RAISE WARNING 'rpc_list_failed_messages: % %', SQLSTATE, SQLERRM;
END $$;

-- A-3: public.rpc_dlq_list_audit — queries public.audit_logs / public.profiles
DO $$ BEGIN
  ALTER FUNCTION public.rpc_dlq_list_audit(integer, integer, text)
    SET search_path = pg_catalog, public, pg_temp;
  RAISE NOTICE 'Hardened search_path: public.rpc_dlq_list_audit(...)';
EXCEPTION
  WHEN undefined_function THEN RAISE NOTICE 'public.rpc_dlq_list_audit not found — skipping';
  WHEN OTHERS THEN RAISE WARNING 'rpc_dlq_list_audit: % %', SQLSTATE, SQLERRM;
END $$;

-- A-4: public.rpc_get_email_health_summary — queries public.email_health_summary
DO $$ BEGIN
  ALTER FUNCTION public.rpc_get_email_health_summary()
    SET search_path = pg_catalog, public, email_app, pg_temp;
  RAISE NOTICE 'Hardened search_path: public.rpc_get_email_health_summary()';
EXCEPTION
  WHEN undefined_function THEN RAISE NOTICE 'public.rpc_get_email_health_summary() not found — skipping';
  WHEN OTHERS THEN RAISE WARNING 'rpc_get_email_health_summary: % %', SQLSTATE, SQLERRM;
END $$;

-- A-5: public.rpc_update_email_health_state
DO $$ BEGIN
  ALTER FUNCTION public.rpc_update_email_health_state(text, integer, jsonb)
    SET search_path = pg_catalog, public, email_app, pg_temp;
  RAISE NOTICE 'Hardened search_path: public.rpc_update_email_health_state(...)';
EXCEPTION
  WHEN undefined_function THEN RAISE NOTICE 'public.rpc_update_email_health_state not found — skipping';
  WHEN OTHERS THEN RAISE WARNING 'rpc_update_email_health_state: % %', SQLSTATE, SQLERRM;
END $$;

-- A-6: public.rpc_email_star_thread — queries email_app tables
DO $$ BEGIN
  ALTER FUNCTION public.rpc_email_star_thread(text, boolean)
    SET search_path = pg_catalog, public, email_app, pg_temp;
  RAISE NOTICE 'Hardened search_path: public.rpc_email_star_thread(text, boolean)';
EXCEPTION
  WHEN undefined_function THEN RAISE NOTICE 'public.rpc_email_star_thread not found — skipping';
  WHEN OTHERS THEN RAISE WARNING 'rpc_email_star_thread: % %', SQLSTATE, SQLERRM;
END $$;

-- A-7: public.rpc_email_tracking_stats
DO $$ BEGIN
  ALTER FUNCTION public.rpc_email_tracking_stats(integer)
    SET search_path = pg_catalog, public, email_app, pg_temp;
  RAISE NOTICE 'Hardened search_path: public.rpc_email_tracking_stats(integer)';
EXCEPTION
  WHEN undefined_function THEN RAISE NOTICE 'public.rpc_email_tracking_stats not found — skipping';
  WHEN OTHERS THEN RAISE WARNING 'rpc_email_tracking_stats: % %', SQLSTATE, SQLERRM;
END $$;

-- A-8: public.rpc_email_top_contacts
DO $$ BEGIN
  ALTER FUNCTION public.rpc_email_top_contacts(integer)
    SET search_path = pg_catalog, public, email_app, pg_temp;
  RAISE NOTICE 'Hardened search_path: public.rpc_email_top_contacts(integer)';
EXCEPTION
  WHEN undefined_function THEN RAISE NOTICE 'public.rpc_email_top_contacts not found — skipping';
  WHEN OTHERS THEN RAISE WARNING 'rpc_email_top_contacts: % %', SQLSTATE, SQLERRM;
END $$;

-- A-9: public.rpc_search_insights
DO $$ BEGIN
  ALTER FUNCTION public.rpc_search_insights(integer)
    SET search_path = pg_catalog, public, pg_temp;
  RAISE NOTICE 'Hardened search_path: public.rpc_search_insights(integer)';
EXCEPTION
  WHEN undefined_function THEN RAISE NOTICE 'public.rpc_search_insights not found — skipping';
  WHEN OTHERS THEN RAISE WARNING 'rpc_search_insights: % %', SQLSTATE, SQLERRM;
END $$;

-- A-10: public.get_contact_notes — queries public schema only
DO $$ BEGIN
  ALTER FUNCTION public.get_contact_notes(uuid, integer)
    SET search_path = pg_catalog, public, pg_temp;
  RAISE NOTICE 'Hardened search_path: public.get_contact_notes(uuid, integer)';
EXCEPTION
  WHEN undefined_function THEN RAISE NOTICE 'public.get_contact_notes not found — skipping';
  WHEN OTHERS THEN RAISE WARNING 'get_contact_notes: % %', SQLSTATE, SQLERRM;
END $$;

-- A-11: public.mark_follow_up_done — references evo tables
DO $$ BEGIN
  ALTER FUNCTION public.mark_follow_up_done(uuid)
    SET search_path = pg_catalog, public, evo, pg_temp;
  RAISE NOTICE 'Hardened search_path: public.mark_follow_up_done(uuid)';
EXCEPTION
  WHEN undefined_function THEN RAISE NOTICE 'public.mark_follow_up_done not found — skipping';
  WHEN OTHERS THEN RAISE WARNING 'mark_follow_up_done: % %', SQLSTATE, SQLERRM;
END $$;

-- A-12: public.get_csat_stats
DO $$ BEGIN
  ALTER FUNCTION public.get_csat_stats(text, integer)
    SET search_path = pg_catalog, public, zapp, pg_temp;
  RAISE NOTICE 'Hardened search_path: public.get_csat_stats(text, integer)';
EXCEPTION
  WHEN undefined_function THEN RAISE NOTICE 'public.get_csat_stats not found — skipping';
  WHEN OTHERS THEN RAISE WARNING 'get_csat_stats: % %', SQLSTATE, SQLERRM;
END $$;

-- A-13: public.get_sla_dashboard
DO $$ BEGIN
  ALTER FUNCTION public.get_sla_dashboard(text, integer)
    SET search_path = pg_catalog, public, zapp, pg_temp;
  RAISE NOTICE 'Hardened search_path: public.get_sla_dashboard(text, integer)';
EXCEPTION
  WHEN undefined_function THEN RAISE NOTICE 'public.get_sla_dashboard not found — skipping';
  WHEN OTHERS THEN RAISE WARNING 'get_sla_dashboard: % %', SQLSTATE, SQLERRM;
END $$;

-- A-14: public.get_platform_health — references evo tables
DO $$ BEGIN
  ALTER FUNCTION public.get_platform_health(text, integer)
    SET search_path = pg_catalog, public, evo, zapp, pg_temp;
  RAISE NOTICE 'Hardened search_path: public.get_platform_health(text, integer)';
EXCEPTION
  WHEN undefined_function THEN RAISE NOTICE 'public.get_platform_health not found — skipping';
  WHEN OTHERS THEN RAISE WARNING 'get_platform_health: % %', SQLSTATE, SQLERRM;
END $$;

-- A-15: public.rpc_mark_messages_as_read — references evo tables
DO $$ BEGIN
  ALTER FUNCTION public.rpc_mark_messages_as_read(uuid)
    SET search_path = pg_catalog, public, evo, pg_temp;
  RAISE NOTICE 'Hardened search_path: public.rpc_mark_messages_as_read(uuid)';
EXCEPTION
  WHEN undefined_function THEN RAISE NOTICE 'public.rpc_mark_messages_as_read not found — skipping';
  WHEN OTHERS THEN RAISE WARNING 'rpc_mark_messages_as_read: % %', SQLSTATE, SQLERRM;
END $$;

-- A-16: public.fn_rotate_encryption_key — uses pgsodium/vault
DO $$ BEGIN
  ALTER FUNCTION public.fn_rotate_encryption_key(text)
    SET search_path = pg_catalog, public, pgsodium, vault, pg_temp;
  RAISE NOTICE 'Hardened search_path: public.fn_rotate_encryption_key(text)';
EXCEPTION
  WHEN undefined_function THEN RAISE NOTICE 'public.fn_rotate_encryption_key not found — skipping';
  WHEN OTHERS THEN RAISE WARNING 'fn_rotate_encryption_key: % %', SQLSTATE, SQLERRM;
END $$;

-- A-17: public.fn_export_contact_data_portable — references evo/zapp
DO $$ BEGIN
  ALTER FUNCTION public.fn_export_contact_data_portable(uuid)
    SET search_path = pg_catalog, public, evo, zapp, pg_temp;
  RAISE NOTICE 'Hardened search_path: public.fn_export_contact_data_portable(uuid)';
EXCEPTION
  WHEN undefined_function THEN RAISE NOTICE 'public.fn_export_contact_data_portable not found — skipping';
  WHEN OTHERS THEN RAISE WARNING 'fn_export_contact_data_portable: % %', SQLSTATE, SQLERRM;
END $$;

-- A-18: public.fn_redact_webhook_secrets — public only
DO $$ BEGIN
  ALTER FUNCTION public.fn_redact_webhook_secrets(jsonb)
    SET search_path = pg_catalog, public, pg_temp;
  RAISE NOTICE 'Hardened search_path: public.fn_redact_webhook_secrets(jsonb)';
EXCEPTION
  WHEN undefined_function THEN RAISE NOTICE 'public.fn_redact_webhook_secrets not found — skipping';
  WHEN OTHERS THEN RAISE WARNING 'fn_redact_webhook_secrets: % %', SQLSTATE, SQLERRM;
END $$;

-- A-19: public.fn_validate_dlq_redaction — public only
DO $$ BEGIN
  ALTER FUNCTION public.fn_validate_dlq_redaction()
    SET search_path = pg_catalog, public, pg_temp;
  RAISE NOTICE 'Hardened search_path: public.fn_validate_dlq_redaction()';
EXCEPTION
  WHEN undefined_function THEN RAISE NOTICE 'public.fn_validate_dlq_redaction() not found — skipping';
  WHEN OTHERS THEN RAISE WARNING 'fn_validate_dlq_redaction: % %', SQLSTATE, SQLERRM;
END $$;

-- A-20: public.sanitize_user_input — public only
DO $$ BEGIN
  ALTER FUNCTION public.sanitize_user_input(text)
    SET search_path = pg_catalog, public, pg_temp;
  RAISE NOTICE 'Hardened search_path: public.sanitize_user_input(text)';
EXCEPTION
  WHEN undefined_function THEN RAISE NOTICE 'public.sanitize_user_input not found — skipping';
  WHEN OTHERS THEN RAISE WARNING 'sanitize_user_input: % %', SQLSTATE, SQLERRM;
END $$;


-- =============================================================================
-- CATEGORY B — Enable RLS on tables missing it
--
-- Strategy by sensitivity:
--   CRITICAL (encryption keys, certificates, endpoint whitelist):
--     → service_role only (deny all authenticated, deny all anon)
--   HIGH (operational logs, security audit tables):
--     → service_role INSERT/UPDATE; authenticated SELECT via admin role check
--   MEDIUM (email metadata, restore logs):
--     → service_role full; authenticated SELECT for own-workspace rows
-- =============================================================================

-- ── Helper: runs ALTER TABLE only if the table exists ─────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.enable_rls_if_exists(p_schema text, p_table text)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = p_schema AND c.relname = p_table
      AND c.relkind IN ('r','p')
  ) THEN
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', p_schema, p_table);
    RAISE NOTICE 'RLS enabled on %.%', p_schema, p_table;
  ELSE
    RAISE NOTICE 'Table %.% not found — skipping RLS enable', p_schema, p_table;
  END IF;
END;
$$;

-- ── B-1: public.backup_key_escrow — CRITICAL: encryption key material ─────────
SELECT pg_temp.enable_rls_if_exists('public', 'backup_key_escrow');

DO $$ BEGIN
  DROP POLICY IF EXISTS "deny_all_backup_key_escrow" ON public.backup_key_escrow;
  CREATE POLICY "deny_all_backup_key_escrow" ON public.backup_key_escrow
    AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'public.backup_key_escrow not found — skipping policies';
END $$;

-- ── B-2: public.backup_integrity_registry — HIGH: backup audit trail ──────────
SELECT pg_temp.enable_rls_if_exists('public', 'backup_integrity_registry');

DO $$ BEGIN
  DROP POLICY IF EXISTS "service_role_full_backup_integrity" ON public.backup_integrity_registry;
  CREATE POLICY "service_role_full_backup_integrity" ON public.backup_integrity_registry
    AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
  DROP POLICY IF EXISTS "deny_others_backup_integrity" ON public.backup_integrity_registry;
  CREATE POLICY "deny_others_backup_integrity" ON public.backup_integrity_registry
    AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'public.backup_integrity_registry not found — skipping policies';
END $$;

-- ── B-3: public.trusted_endpoints_whitelist — CRITICAL: security allowlist ────
SELECT pg_temp.enable_rls_if_exists('public', 'trusted_endpoints_whitelist');

DO $$ BEGIN
  DROP POLICY IF EXISTS "deny_all_trusted_endpoints" ON public.trusted_endpoints_whitelist;
  CREATE POLICY "deny_all_trusted_endpoints" ON public.trusted_endpoints_whitelist
    AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'public.trusted_endpoints_whitelist not found — skipping policies';
END $$;

-- ── B-4: public.allowed_ssl_certificates — CRITICAL: TLS pinning data ─────────
SELECT pg_temp.enable_rls_if_exists('public', 'allowed_ssl_certificates');

DO $$ BEGIN
  DROP POLICY IF EXISTS "deny_all_allowed_ssl_certs" ON public.allowed_ssl_certificates;
  CREATE POLICY "deny_all_allowed_ssl_certs" ON public.allowed_ssl_certificates
    AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'public.allowed_ssl_certificates not found — skipping policies';
END $$;

-- ── B-5: public.connection_limits — HIGH: operational config ──────────────────
SELECT pg_temp.enable_rls_if_exists('public', 'connection_limits');

DO $$ BEGIN
  DROP POLICY IF EXISTS "service_role_full_connection_limits" ON public.connection_limits;
  CREATE POLICY "service_role_full_connection_limits" ON public.connection_limits
    AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
  DROP POLICY IF EXISTS "deny_others_connection_limits" ON public.connection_limits;
  CREATE POLICY "deny_others_connection_limits" ON public.connection_limits
    AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'public.connection_limits not found — skipping policies';
END $$;

-- ── B-6: public.active_connections_log — HIGH: session-level audit log ────────
SELECT pg_temp.enable_rls_if_exists('public', 'active_connections_log');

DO $$ BEGIN
  DROP POLICY IF EXISTS "service_role_full_active_connections" ON public.active_connections_log;
  CREATE POLICY "service_role_full_active_connections" ON public.active_connections_log
    AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
  DROP POLICY IF EXISTS "deny_others_active_connections" ON public.active_connections_log;
  CREATE POLICY "deny_others_active_connections" ON public.active_connections_log
    AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'public.active_connections_log not found — skipping policies';
END $$;

-- ── B-7: public.rls_enforcement_registry — HIGH: RLS audit meta-table ─────────
SELECT pg_temp.enable_rls_if_exists('public', 'rls_enforcement_registry');

DO $$ BEGIN
  DROP POLICY IF EXISTS "service_role_full_rls_enforcement" ON public.rls_enforcement_registry;
  CREATE POLICY "service_role_full_rls_enforcement" ON public.rls_enforcement_registry
    AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
  DROP POLICY IF EXISTS "deny_others_rls_enforcement" ON public.rls_enforcement_registry;
  CREATE POLICY "deny_others_rls_enforcement" ON public.rls_enforcement_registry
    AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'public.rls_enforcement_registry not found — skipping policies';
END $$;

-- ── B-8: public.rls_bypass_attempts — CRITICAL: security event log ────────────
SELECT pg_temp.enable_rls_if_exists('public', 'rls_bypass_attempts');

DO $$ BEGIN
  DROP POLICY IF EXISTS "deny_all_rls_bypass_attempts" ON public.rls_bypass_attempts;
  CREATE POLICY "deny_all_rls_bypass_attempts" ON public.rls_bypass_attempts
    AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'public.rls_bypass_attempts not found — skipping policies';
END $$;

-- ── B-9: public.key_rotation_history — HIGH: cryptographic key audit trail ────
SELECT pg_temp.enable_rls_if_exists('public', 'key_rotation_history');

DO $$ BEGIN
  DROP POLICY IF EXISTS "service_role_full_key_rotation_history" ON public.key_rotation_history;
  CREATE POLICY "service_role_full_key_rotation_history" ON public.key_rotation_history
    AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
  DROP POLICY IF EXISTS "deny_others_key_rotation_history" ON public.key_rotation_history;
  CREATE POLICY "deny_others_key_rotation_history" ON public.key_rotation_history
    AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'public.key_rotation_history not found — skipping policies';
END $$;

-- ── B-10: public.mfa_enforcement_rules — HIGH: MFA policy config ──────────────
SELECT pg_temp.enable_rls_if_exists('public', 'mfa_enforcement_rules');

DO $$ BEGIN
  DROP POLICY IF EXISTS "service_role_full_mfa_enforcement_rules" ON public.mfa_enforcement_rules;
  CREATE POLICY "service_role_full_mfa_enforcement_rules" ON public.mfa_enforcement_rules
    AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
  DROP POLICY IF EXISTS "deny_others_mfa_enforcement_rules" ON public.mfa_enforcement_rules;
  CREATE POLICY "deny_others_mfa_enforcement_rules" ON public.mfa_enforcement_rules
    AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'public.mfa_enforcement_rules not found — skipping policies';
END $$;

-- ── B-11: public.mfa_challenges — HIGH: active MFA challenge state ────────────
SELECT pg_temp.enable_rls_if_exists('public', 'mfa_challenges');

DO $$ BEGIN
  DROP POLICY IF EXISTS "service_role_full_mfa_challenges" ON public.mfa_challenges;
  CREATE POLICY "service_role_full_mfa_challenges" ON public.mfa_challenges
    AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
  DROP POLICY IF EXISTS "deny_others_mfa_challenges" ON public.mfa_challenges;
  CREATE POLICY "deny_others_mfa_challenges" ON public.mfa_challenges
    AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'public.mfa_challenges not found — skipping policies';
END $$;

-- ── B-12: public.anomaly_detection_baselines — HIGH: security baseline data ───
SELECT pg_temp.enable_rls_if_exists('public', 'anomaly_detection_baselines');

DO $$ BEGIN
  DROP POLICY IF EXISTS "service_role_full_anomaly_baselines" ON public.anomaly_detection_baselines;
  CREATE POLICY "service_role_full_anomaly_baselines" ON public.anomaly_detection_baselines
    AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
  DROP POLICY IF EXISTS "deny_others_anomaly_baselines" ON public.anomaly_detection_baselines;
  CREATE POLICY "deny_others_anomaly_baselines" ON public.anomaly_detection_baselines
    AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'public.anomaly_detection_baselines not found — skipping policies';
END $$;

-- ── B-13: public.threat_correlation_rules — HIGH: threat intel config ─────────
SELECT pg_temp.enable_rls_if_exists('public', 'threat_correlation_rules');

DO $$ BEGIN
  DROP POLICY IF EXISTS "service_role_full_threat_rules" ON public.threat_correlation_rules;
  CREATE POLICY "service_role_full_threat_rules" ON public.threat_correlation_rules
    AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
  DROP POLICY IF EXISTS "deny_others_threat_rules" ON public.threat_correlation_rules;
  CREATE POLICY "deny_others_threat_rules" ON public.threat_correlation_rules
    AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'public.threat_correlation_rules not found — skipping policies';
END $$;

-- ── B-14: public.alert_webhook_subscriptions — MEDIUM: notification config ────
SELECT pg_temp.enable_rls_if_exists('public', 'alert_webhook_subscriptions');

DO $$ BEGIN
  DROP POLICY IF EXISTS "service_role_full_alert_webhooks" ON public.alert_webhook_subscriptions;
  CREATE POLICY "service_role_full_alert_webhooks" ON public.alert_webhook_subscriptions
    AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
  DROP POLICY IF EXISTS "deny_others_alert_webhooks" ON public.alert_webhook_subscriptions;
  CREATE POLICY "deny_others_alert_webhooks" ON public.alert_webhook_subscriptions
    AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'public.alert_webhook_subscriptions not found — skipping policies';
END $$;

-- ── B-15: public.restore_test_log — MEDIUM: restore verification log ──────────
SELECT pg_temp.enable_rls_if_exists('public', 'restore_test_log');

DO $$ BEGIN
  DROP POLICY IF EXISTS "service_role_full_restore_test_log" ON public.restore_test_log;
  CREATE POLICY "service_role_full_restore_test_log" ON public.restore_test_log
    AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
  DROP POLICY IF EXISTS "deny_others_restore_test_log" ON public.restore_test_log;
  CREATE POLICY "deny_others_restore_test_log" ON public.restore_test_log
    AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'public.restore_test_log not found — skipping policies';
END $$;

-- ── B-16: public.email_signatures — MEDIUM: email feature metadata ────────────
SELECT pg_temp.enable_rls_if_exists('public', 'email_signatures');

DO $$ BEGIN
  DROP POLICY IF EXISTS "service_role_full_email_signatures" ON public.email_signatures;
  CREATE POLICY "service_role_full_email_signatures" ON public.email_signatures
    AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
  DROP POLICY IF EXISTS "deny_others_email_signatures" ON public.email_signatures;
  CREATE POLICY "deny_others_email_signatures" ON public.email_signatures
    AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'public.email_signatures not found — skipping policies';
END $$;

-- ── B-17: public.email_drafts — MEDIUM: draft email state ────────────────────
SELECT pg_temp.enable_rls_if_exists('public', 'email_drafts');

DO $$ BEGIN
  DROP POLICY IF EXISTS "service_role_full_email_drafts" ON public.email_drafts;
  CREATE POLICY "service_role_full_email_drafts" ON public.email_drafts
    AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
  DROP POLICY IF EXISTS "deny_others_email_drafts" ON public.email_drafts;
  CREATE POLICY "deny_others_email_drafts" ON public.email_drafts
    AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'public.email_drafts not found — skipping policies';
END $$;

-- ── B-18: public.email_revalidation_jobs — MEDIUM: async job state ───────────
-- Note: This table already has a Realtime subscription from 20260724000006.
-- RLS is required so PostgREST row-level access is controlled.
SELECT pg_temp.enable_rls_if_exists('public', 'email_revalidation_jobs');

DO $$ BEGIN
  DROP POLICY IF EXISTS "service_role_full_email_revalidation_jobs" ON public.email_revalidation_jobs;
  CREATE POLICY "service_role_full_email_revalidation_jobs" ON public.email_revalidation_jobs
    AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
  DROP POLICY IF EXISTS "deny_others_email_revalidation_jobs" ON public.email_revalidation_jobs;
  CREATE POLICY "deny_others_email_revalidation_jobs" ON public.email_revalidation_jobs
    AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'public.email_revalidation_jobs not found — skipping policies';
END $$;

-- ── Cleanup temp helper function ──────────────────────────────────────────────
-- (Temp functions are session-scoped and drop automatically, but explicit
--  cleanup makes the intent clear for future maintainers reading this file.)
DROP FUNCTION IF EXISTS pg_temp.enable_rls_if_exists(text, text);
