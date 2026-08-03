-- Migration: document and harden 4 zapp tables with RLS enabled but zero policies
-- Audit finding 2026-07-16: these tables have RLS ON but no policies, meaning
-- all access is blocked for non-service_role callers (which is the correct behavior,
-- but it should be explicit and documented).
--
-- Tables:
--   zapp._authoritative_time    — internal clock reference, service_role only
--   zapp.dept_mapping           — department mapping, admin-only via service_role
--   zapp.message_audit_log      — audit trail, read by service_role only
--   zapp.password_reset_tokens  — sensitive auth tokens, service_role only
--
-- These tables INTENTIONALLY have no policies (deny-by-default for all roles
-- except service_role which bypasses RLS). Adding a comment makes the intent clear.

COMMENT ON TABLE zapp._authoritative_time IS
  'Internal clock reference table. RLS enabled with no policies = service_role only. '
  'Access via service_role (Edge Functions / cron jobs). '
  'Audit: 2026-07-16 — confirmed intentional zero-policy design.';

COMMENT ON TABLE zapp.dept_mapping IS
  'Department mapping configuration. RLS enabled with no policies = service_role only. '
  'Modified via admin Edge Functions only. '
  'Audit: 2026-07-16 — confirmed intentional zero-policy design.';

COMMENT ON TABLE zapp.message_audit_log IS
  'Message audit trail. RLS enabled with no policies = service_role only (write). '
  'No direct client access — populated exclusively by Edge Functions and triggers. '
  'Audit: 2026-07-16 — confirmed intentional zero-policy design.';

COMMENT ON TABLE zapp.password_reset_tokens IS
  'Password reset token store. RLS enabled with no policies = service_role only. '
  'Tokens generated and consumed by auth Edge Functions only. '
  'NEVER expose to anon or authenticated roles directly. '
  'Audit: 2026-07-16 — confirmed intentional zero-policy design.';
