-- Corrective migration: move objects from public to zapp schema
-- The 20260712* security/compliance migrations incorrectly created 51 tables
-- and 117 functions in the public schema instead of zapp.
-- This migration moves them to zapp (or drops the public duplicate if zapp already has it).
--
-- Idempotent: safe to run multiple times.

BEGIN;

-- ============================================================
-- 1. Move tables from public to zapp
-- ============================================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'account_lockouts') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'account_lockouts') THEN
      DROP TABLE public.account_lockouts CASCADE;
    ELSE
      ALTER TABLE public.account_lockouts SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'active_connections_log') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'active_connections_log') THEN
      DROP TABLE public.active_connections_log CASCADE;
    ELSE
      ALTER TABLE public.active_connections_log SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'alert_webhook_subscriptions') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'alert_webhook_subscriptions') THEN
      DROP TABLE public.alert_webhook_subscriptions CASCADE;
    ELSE
      ALTER TABLE public.alert_webhook_subscriptions SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'allowed_ssl_certificates') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'allowed_ssl_certificates') THEN
      DROP TABLE public.allowed_ssl_certificates CASCADE;
    ELSE
      ALTER TABLE public.allowed_ssl_certificates SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'anomaly_detection_baselines') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'anomaly_detection_baselines') THEN
      DROP TABLE public.anomaly_detection_baselines CASCADE;
    ELSE
      ALTER TABLE public.anomaly_detection_baselines SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'api_rate_limit_counters') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'api_rate_limit_counters') THEN
      DROP TABLE public.api_rate_limit_counters CASCADE;
    ELSE
      ALTER TABLE public.api_rate_limit_counters SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_logs_partitioned') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'audit_logs_partitioned') THEN
      DROP TABLE public.audit_logs_partitioned CASCADE;
    ELSE
      ALTER TABLE public.audit_logs_partitioned SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'auth_failure_tracker') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'auth_failure_tracker') THEN
      DROP TABLE public.auth_failure_tracker CASCADE;
    ELSE
      ALTER TABLE public.auth_failure_tracker SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'backup_integrity_registry') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'backup_integrity_registry') THEN
      DROP TABLE public.backup_integrity_registry CASCADE;
    ELSE
      ALTER TABLE public.backup_integrity_registry SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'backup_key_escrow') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'backup_key_escrow') THEN
      DROP TABLE public.backup_key_escrow CASCADE;
    ELSE
      ALTER TABLE public.backup_key_escrow SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'breach_detection_config') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'breach_detection_config') THEN
      DROP TABLE public.breach_detection_config CASCADE;
    ELSE
      ALTER TABLE public.breach_detection_config SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'cascade_deletion_audit') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'cascade_deletion_audit') THEN
      DROP TABLE public.cascade_deletion_audit CASCADE;
    ELSE
      ALTER TABLE public.cascade_deletion_audit SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'connection_limits') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'connection_limits') THEN
      DROP TABLE public.connection_limits CASCADE;
    ELSE
      ALTER TABLE public.connection_limits SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'data_lineage_audit') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'data_lineage_audit') THEN
      DROP TABLE public.data_lineage_audit CASCADE;
    ELSE
      ALTER TABLE public.data_lineage_audit SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'data_purge_audit') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'data_purge_audit') THEN
      DROP TABLE public.data_purge_audit CASCADE;
    ELSE
      ALTER TABLE public.data_purge_audit SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'data_retention_policies') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'data_retention_policies') THEN
      DROP TABLE public.data_retention_policies CASCADE;
    ELSE
      ALTER TABLE public.data_retention_policies SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'dedup_cache_ttl_config') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'dedup_cache_ttl_config') THEN
      DROP TABLE public.dedup_cache_ttl_config CASCADE;
    ELSE
      ALTER TABLE public.dedup_cache_ttl_config SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'encryption_key_refs') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'encryption_key_refs') THEN
      DROP TABLE public.encryption_key_refs CASCADE;
    ELSE
      ALTER TABLE public.encryption_key_refs SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'endpoint_rate_limit_counters') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'endpoint_rate_limit_counters') THEN
      DROP TABLE public.endpoint_rate_limit_counters CASCADE;
    ELSE
      ALTER TABLE public.endpoint_rate_limit_counters SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'endpoint_rate_limits') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'endpoint_rate_limits') THEN
      DROP TABLE public.endpoint_rate_limits CASCADE;
    ELSE
      ALTER TABLE public.endpoint_rate_limits SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'idempotency_rollback_failures') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'idempotency_rollback_failures') THEN
      DROP TABLE public.idempotency_rollback_failures CASCADE;
    ELSE
      ALTER TABLE public.idempotency_rollback_failures SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'key_rotation_history') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'key_rotation_history') THEN
      DROP TABLE public.key_rotation_history CASCADE;
    ELSE
      ALTER TABLE public.key_rotation_history SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'key_rotation_policies') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'key_rotation_policies') THEN
      DROP TABLE public.key_rotation_policies CASCADE;
    ELSE
      ALTER TABLE public.key_rotation_policies SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lgpd_consent_audit_archive') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'lgpd_consent_audit_archive') THEN
      DROP TABLE public.lgpd_consent_audit_archive CASCADE;
    ELSE
      ALTER TABLE public.lgpd_consent_audit_archive SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mfa_challenges') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'mfa_challenges') THEN
      DROP TABLE public.mfa_challenges CASCADE;
    ELSE
      ALTER TABLE public.mfa_challenges SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mfa_enforcement_rules') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'mfa_enforcement_rules') THEN
      DROP TABLE public.mfa_enforcement_rules CASCADE;
    ELSE
      ALTER TABLE public.mfa_enforcement_rules SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mfa_policies') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'mfa_policies') THEN
      DROP TABLE public.mfa_policies CASCADE;
    ELSE
      ALTER TABLE public.mfa_policies SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'partition_index_stats') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'partition_index_stats') THEN
      DROP TABLE public.partition_index_stats CASCADE;
    ELSE
      ALTER TABLE public.partition_index_stats SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payload_size_config') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'payload_size_config') THEN
      DROP TABLE public.payload_size_config CASCADE;
    ELSE
      ALTER TABLE public.payload_size_config SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payload_size_violation_audit') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'payload_size_violation_audit') THEN
      DROP TABLE public.payload_size_violation_audit CASCADE;
    ELSE
      ALTER TABLE public.payload_size_violation_audit SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pii_access_log') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'pii_access_log') THEN
      DROP TABLE public.pii_access_log CASCADE;
    ELSE
      ALTER TABLE public.pii_access_log SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'pii_field_registry') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'pii_field_registry') THEN
      DROP TABLE public.pii_field_registry CASCADE;
    ELSE
      ALTER TABLE public.pii_field_registry SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'production_excellence_checks') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'production_excellence_checks') THEN
      DROP TABLE public.production_excellence_checks CASCADE;
    ELSE
      ALTER TABLE public.production_excellence_checks SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'query_audit_log') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'query_audit_log') THEN
      DROP TABLE public.query_audit_log CASCADE;
    ELSE
      ALTER TABLE public.query_audit_log SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'query_complexity_limits') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'query_complexity_limits') THEN
      DROP TABLE public.query_complexity_limits CASCADE;
    ELSE
      ALTER TABLE public.query_complexity_limits SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'query_complexity_violations') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'query_complexity_violations') THEN
      DROP TABLE public.query_complexity_violations CASCADE;
    ELSE
      ALTER TABLE public.query_complexity_violations SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rate_limit_violations') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'rate_limit_violations') THEN
      DROP TABLE public.rate_limit_violations CASCADE;
    ELSE
      ALTER TABLE public.rate_limit_violations SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'recovery_codes') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'recovery_codes') THEN
      DROP TABLE public.recovery_codes CASCADE;
    ELSE
      ALTER TABLE public.recovery_codes SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rls_bypass_attempts') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'rls_bypass_attempts') THEN
      DROP TABLE public.rls_bypass_attempts CASCADE;
    ELSE
      ALTER TABLE public.rls_bypass_attempts SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rls_enforcement_registry') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'rls_enforcement_registry') THEN
      DROP TABLE public.rls_enforcement_registry CASCADE;
    ELSE
      ALTER TABLE public.rls_enforcement_registry SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'secret_encoding_config') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'secret_encoding_config') THEN
      DROP TABLE public.secret_encoding_config CASCADE;
    ELSE
      ALTER TABLE public.secret_encoding_config SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'secret_redaction_failures') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'secret_redaction_failures') THEN
      DROP TABLE public.secret_redaction_failures CASCADE;
    ELSE
      ALTER TABLE public.secret_redaction_failures SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'security_alert_incidents') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'security_alert_incidents') THEN
      DROP TABLE public.security_alert_incidents CASCADE;
    ELSE
      ALTER TABLE public.security_alert_incidents SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'security_alert_rules') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'security_alert_rules') THEN
      DROP TABLE public.security_alert_rules CASCADE;
    ELSE
      ALTER TABLE public.security_alert_rules SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'security_audit_chain') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'security_audit_chain') THEN
      DROP TABLE public.security_audit_chain CASCADE;
    ELSE
      ALTER TABLE public.security_audit_chain SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'session_blacklist') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'session_blacklist') THEN
      DROP TABLE public.session_blacklist CASCADE;
    ELSE
      ALTER TABLE public.session_blacklist SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'threat_correlation_rules') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'threat_correlation_rules') THEN
      DROP TABLE public.threat_correlation_rules CASCADE;
    ELSE
      ALTER TABLE public.threat_correlation_rules SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'threat_intelligence_events') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'threat_intelligence_events') THEN
      DROP TABLE public.threat_intelligence_events CASCADE;
    ELSE
      ALTER TABLE public.threat_intelligence_events SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'timed_privilege_grants') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'timed_privilege_grants') THEN
      DROP TABLE public.timed_privilege_grants CASCADE;
    ELSE
      ALTER TABLE public.timed_privilege_grants SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'trusted_endpoints_whitelist') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'trusted_endpoints_whitelist') THEN
      DROP TABLE public.trusted_endpoints_whitelist CASCADE;
    ELSE
      ALTER TABLE public.trusted_endpoints_whitelist SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'used_nonces') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'zapp' AND table_name = 'used_nonces') THEN
      DROP TABLE public.used_nonces CASCADE;
    ELSE
      ALTER TABLE public.used_nonces SET SCHEMA zapp;
    END IF;
  END IF;
END $$;

-- ============================================================
-- 2. Move functions from public to zapp
-- ============================================================

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'add_contacts_to_campaign'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'create_partitions_if_not_exists'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_acknowledge_alert_incident'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_aggressive_cleanup_dedup_table'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_alert_counter_overflow'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_alert_idempotency_failures'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_alert_rate_limit_timeout'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_apply_dedup_cache_ttl_config'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_apply_query_resource_limits'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_archive_old_audit_partitions'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_audit_log_month_start'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_audit_rls_status'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_calculate_threat_score'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_check_and_alert_overdue_rotations'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_check_api_version_support'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_check_circuit_breaker_status'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_check_connection_pool_health'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_check_deployment_health'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_check_endpoint_rate_limit'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_check_failover_status'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_check_mfa_compliance'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_check_recovery_readiness'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_check_schema_compatibility'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_check_transaction_isolation'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_cleanup_dedup_cache_global'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_cleanup_dedup_cache_per_instance'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_cleanup_dlq'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_cleanup_idempotency_audit'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_cleanup_idle_sessions'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_cleanup_memory_leaks'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_cleanup_orphaned_records'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_cleanup_stale_rate_limit_counters'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_cleanup_webhook_dedup_table'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_complete_deployment'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_decode_secret'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_detect_anomaly'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_detect_orphaned_records'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_detect_rollback'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_detect_sql_injection_patterns'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_detect_unicode_normalization_issues'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_emergency_truncate_audit'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_enable_graceful_degradation'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_encode_secret'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_execute_all_retention_policies'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_execute_disaster_recovery_runbook'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_execute_retention_policy'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_final_production_readiness_check'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_generate_production_readiness_report'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_generate_rate_limit_headers'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_generate_recovery_codes'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_generate_retry_after_header'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_get_connection_timeouts'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_get_user_complexity_class'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_insert_idempotency_failure_audit'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_invalidate_expired_cache'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_is_key_rotation_due'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_learn_baseline'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_log_payload_size_violation'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_log_query_violation'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_log_request_response'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_mask_secret'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_migrate_audit_logs_to_partitioned'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_monitor_connection_health'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_optimize_connection_pool'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_process_retry_queue'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_process_webhook_transaction'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_purge_processed_webhook_events'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_record_migration'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_record_threat_event'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_redact_webhook_secrets'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_resolve_alert_incident'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_resolve_endpoint_config'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_rollback_deployment'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_rotate_key'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_route_failed_webhooks_to_dlq_safe'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_schedule_orphan_cleanup'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_select_load_balanced_backend'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_snapshot_schema_state'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_start_deployment'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_system_health_score'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_test_backup_restore'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_trigger_security_alert'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_validate_backup_integrity'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_validate_cte_safety'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_validate_decompression_size'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_validate_deployment_readiness'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_validate_dlq_redaction'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_validate_instance_id'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_validate_json_depth'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_validate_partition_isolation'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_validate_payload_size'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_validate_performance_baselines'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_validate_production_excellence'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_validate_query_plan_cost'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_validate_recovery_code'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_validate_rls_policies'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_verify_backup_integrity'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_verify_data_integrity'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_verify_retention_compliance'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_verify_schema_requirements'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_verify_webhook_signature_enhanced'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'fn_webhook_health_check'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'increment_webhook_rate_limit'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'log_version_conflict'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'reassign_absent_agents'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'rpc_dlq_bulk_retry_now'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'rpc_dlq_list_audit_cursor'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'rpc_dlq_log_item_action'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'rpc_list_dispatch_error_logs_cursor'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'rpc_list_failed_messages_cursor'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'rpc_list_transfers_paginated_cursor'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'search_contacts_cursor'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'trg_cascade_cleanup_on_instance_delete'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'trg_cascade_cleanup_on_webhook_delete'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'upsert_user_settings'
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p2
      JOIN pg_namespace n2 ON p2.pronamespace = n2.oid
      WHERE n2.nspname = 'zapp' AND p2.proname = r.proname
        AND pg_get_function_identity_arguments(p2.oid) = r.args
    ) THEN
      EXECUTE format('DROP FUNCTION public.%I(%s) CASCADE', r.proname, r.args);
    ELSE
      EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA zapp', r.proname, r.args);
    END IF;
  END LOOP;
END $$;

COMMIT;
