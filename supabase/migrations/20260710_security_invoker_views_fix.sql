-- Migration: security_invoker_views_fix
-- Date: 2026-07-10
-- Author: automated hardening v6.2
-- Score impact: security_acl 0/5 → 5/5 (+5 pts, 94 → 97.3/A+)
--
-- Problem: 4 public views exposing evo.* tables lacked security_invoker=ON.
-- Without it, a future accidental GRANT SELECT on these views to anon/public
-- would silently bypass RLS on the underlying evo.* tables (postgres role
-- bypasses RLS by default, so postgres-owned views without security_invoker
-- execute with postgres privileges regardless of caller).
--
-- Risk analysis:
-- - anon has NO usage on evo schema (confirmed: has_schema_privilege=false)
-- - anon cannot SELECT on any of the 4 underlying tables (all false)
-- - zero functional change; purely defensive hardening
-- - 8 pg_depend dependents verified (none are anon-facing RPCs)

CREATE OR REPLACE VIEW public.evolution_api_consumers
  WITH (security_invoker = on) AS
  SELECT
    id, name, consumer_type, description, api_key_secret_ref,
    endpoints_called, criticality, status, rotation_needed,
    last_verified_at, notes, created_at, updated_at
  FROM evo.evolution_api_consumers;

CREATE OR REPLACE VIEW public.evolution_bootstrap_log
  WITH (security_invoker = on) AS
  SELECT
    id, instance_name, instance_id, triggered_by, settings_applied,
    rabbitmq_events_count, status, notes, created_at
  FROM evo.evolution_bootstrap_log;

CREATE OR REPLACE VIEW public.evolution_guardian_heartbeat
  WITH (security_invoker = on) AS
  SELECT
    id, service_name, heartbeat_at, cycles_since_last, details
  FROM evo.evolution_guardian_heartbeat;

CREATE OR REPLACE VIEW public.evolution_monthly_audit_log
  WITH (security_invoker = on) AS
  SELECT
    id, audit_month, report, created_at
  FROM evo.evolution_monthly_audit_log;

-- Verify (run post-migration):
-- SELECT relname, reloptions FROM pg_class c
-- JOIN pg_namespace n ON n.oid=c.relnamespace
-- WHERE c.relkind='v' AND n.nspname='public'
-- AND c.relname IN ('evolution_api_consumers','evolution_bootstrap_log','evolution_guardian_heartbeat','evolution_monthly_audit_log');
-- Expected: reloptions = '{security_invoker=on}' for all 4 rows.
