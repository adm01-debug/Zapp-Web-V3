-- Migration: security_hardening_exhaustive_test_20260710
-- Discovered by: 300+ scenario adversarial test sweep (T01–T12)
-- Date: 2026-07-10
--
-- GAPS FOUND AND FIXED:
--
-- GAP-A: 4 public views pointing to evo.* WITHOUT security_invoker=ON
--   evolution_burnin_tracker, evolution_incident_runbook,
--   evolution_ip_blocklist (SENSITIVE: IPs), evolution_ip_watch
--   Fix: CREATE OR REPLACE VIEW ... WITH (security_invoker = on)
--
-- GAP-B: 2 public functions still accessible by anon after previous REVOKE session
--   fn_audit_security_invoker (SECURITY DEFINER audit fn — should be service_role only)
--   fn_auto_replica_identity_metabase (Metabase replica fn — no public access needed)
--   Fix: REVOKE EXECUTE ... FROM PUBLIC; GRANT ... TO service_role;
--
-- GAP-C: anon had SELECT on 5 operational evo-referencing views
--   evolution_api_consumers, evolution_bootstrap_log, evolution_guardian_heartbeat,
--   evolution_logpatch_audit, evolution_monthly_audit_log
--   (security_invoker=ON made it effectively safe, but SELECT grant is defense-in-depth gap)
--   Fix: REVOKE SELECT ... FROM anon;
--   Note: evolution_instances_public LEFT with anon SELECT (intentional "public" view)
--
-- VERIFICATION RESULTS (T10/T11/T12):
--   anon_execute functions in public schema: 0 (was 2)
--   anon SELECT on sensitive evo-views: 0 (was 5)
--   views without security_invoker pointing to evo.*: 0 (was 4)
--
-- Already executed on production via MCP. Score remains 100.0/A+.

-- GAP-A
CREATE OR REPLACE VIEW public.evolution_burnin_tracker WITH (security_invoker = on) AS
  SELECT id, burn_in_start, burn_in_passed, last_reset_reason, updated_at
  FROM evo.evolution_burnin_tracker;

CREATE OR REPLACE VIEW public.evolution_incident_runbook WITH (security_invoker = on) AS
  SELECT id, title, severity, category, triggers, steps, success_criteria,
    escalation, estimated_minutes, last_drilled_at, created_at, updated_at
  FROM evo.evolution_incident_runbook;

CREATE OR REPLACE VIEW public.evolution_ip_blocklist WITH (security_invoker = on) AS
  SELECT ip_address, reason, hit_count, first_seen, last_seen,
    auto_blocked, unblocked_at, created_at, updated_at
  FROM evo.evolution_ip_blocklist;

CREATE OR REPLACE VIEW public.evolution_ip_watch WITH (security_invoker = on) AS
  SELECT id, ip_address, endpoint, user_agent, http_status, created_at
  FROM evo.evolution_ip_watch;

-- GAP-B
REVOKE EXECUTE ON FUNCTION public.fn_audit_security_invoker() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_audit_security_invoker() TO service_role;

REVOKE EXECUTE ON FUNCTION public.fn_auto_replica_identity_metabase() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_auto_replica_identity_metabase() TO service_role;

-- GAP-C
REVOKE SELECT ON public.evolution_api_consumers FROM anon;
REVOKE SELECT ON public.evolution_bootstrap_log FROM anon;
REVOKE SELECT ON public.evolution_guardian_heartbeat FROM anon;
REVOKE SELECT ON public.evolution_logpatch_audit FROM anon;
REVOKE SELECT ON public.evolution_monthly_audit_log FROM anon;
