-- Migration: rls_explicit_policies_evo_sensitive_tables
-- Date: 2026-07-11
-- Author: automated hardening — improvement identified by simulation scan
--
-- Problem: 10 evo.* tables had RLS=ON but ZERO policies — relying on PostgreSQL's
-- implicit deny-by-default behavior. While technically safe (non-superusers get 0 rows),
-- this is fragile: a future BYPASSRLS grant or a superuser error could expose data.
--
-- Fix: Add explicit PERMISSIVE policies allowing ONLY service_role access.
-- This converts implicit deny-by-default into:
--   DENY: all roles except service_role (via default deny when no matching permissive policy)
--   ALLOW: service_role (via explicit srvc_only policy)
--
-- Tables protected:
--   _secure_config             - secure configuration values (MOST SENSITIVE)
--   evolution_api_consumers    - API key references
--   evolution_bootstrap_log    - instance bootstrap history
--   evolution_burnin_tracker   - burn-in test status
--   evolution_guardian_heartbeat - service heartbeats
--   evolution_incident_runbook - incident response runbooks
--   evolution_ip_blocklist     - blocked IP addresses
--   evolution_ip_watch         - IP monitoring data
--   evolution_monthly_audit_log - monthly audit reports
--   ops_runbooks               - operational runbooks
--
-- Verified post-migration: all 10 tables show policy_count=1

CREATE POLICY srvc_only ON evo._secure_config FOR ALL TO service_role USING (true);
CREATE POLICY srvc_only ON evo.evolution_api_consumers FOR ALL TO service_role USING (true);
CREATE POLICY srvc_only ON evo.evolution_bootstrap_log FOR ALL TO service_role USING (true);
CREATE POLICY srvc_only ON evo.evolution_burnin_tracker FOR ALL TO service_role USING (true);
CREATE POLICY srvc_only ON evo.evolution_guardian_heartbeat FOR ALL TO service_role USING (true);
CREATE POLICY srvc_only ON evo.evolution_incident_runbook FOR ALL TO service_role USING (true);
CREATE POLICY srvc_only ON evo.evolution_ip_blocklist FOR ALL TO service_role USING (true);
CREATE POLICY srvc_only ON evo.evolution_ip_watch FOR ALL TO service_role USING (true);
CREATE POLICY srvc_only ON evo.evolution_monthly_audit_log FOR ALL TO service_role USING (true);
CREATE POLICY srvc_only ON evo.ops_runbooks FOR ALL TO service_role USING (true);
