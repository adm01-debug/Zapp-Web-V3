-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 20260720000002_revoke_public_execute_internal_functions.sql
-- Purpose  : Security hardening — remove default PUBLIC EXECUTE from internal
--            functions that were created without explicit privilege management.
--
-- Root cause: PostgreSQL grants EXECUTE to PUBLIC by default on CREATE FUNCTION.
--   Migrations in the r23/r24 batch created internal functions (monitoring,
--   rate-limiting, triggers) without REVOKE, leaving them callable by anon via
--   PostgREST RPC (supabase.rpc with Content-Profile: zapp). None of these
--   functions are intended to be called directly by end-users or anon clients.
--
-- This migration is idempotent (REVOKE is a no-op if privilege was never granted).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. fn_score_security_acl ────────────────────────────────────────────────
-- Returns detailed ACL audit info (anon EXECUTE -> information disclosure).
-- Called only by pg_cron and service-role monitoring code.
REVOKE EXECUTE ON FUNCTION zapp.fn_score_security_acl() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION zapp.fn_score_security_acl() TO service_role;

-- ─── 2. fn_rate_limit_check ──────────────────────────────────────────────────
-- Internal rate-limiter called by SECURITY DEFINER RPCs and Edge Functions.
-- Authenticated users never call it directly; granting anon EXECUTE would
-- let untrusted callers pollute rpc_rate_limits with arbitrary identifiers.
REVOKE EXECUTE ON FUNCTION zapp.fn_rate_limit_check(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION zapp.fn_rate_limit_check(text, text, integer, integer) TO service_role;

-- ─── 3. ops.fn_analytics_log_retention ──────────────────────────────────────
-- pg_cron function that deletes rows from _analytics schema.
-- ops schema is not in PostgREST's exposed schema list, but REVOKE adds
-- defence-in-depth in case of future schema config changes.
REVOKE EXECUTE ON FUNCTION ops.fn_analytics_log_retention(integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION ops.fn_analytics_log_retention(integer) TO service_role;

-- ─── 4. ops.check_critical_fks ──────────────────────────────────────────────
-- Internal FK integrity check; writes to ops.schema_drift_log.
-- Called by monitoring cron and admin dashboards via service_role.
REVOKE EXECUTE ON FUNCTION ops.check_critical_fks(boolean) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION ops.check_critical_fks(boolean) TO service_role;

-- ─── 5. Trigger functions — block direct EXECUTE by end-users ────────────────
-- Trigger functions fire via their parent table DML; they should never be
-- called directly by any role other than the trigger mechanism (postgres).
-- REVOKE does not affect triggers — it only prevents explicit EXECUTE calls.
REVOKE EXECUTE ON FUNCTION zapp.prevent_role_escalation()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION zapp.fn_set_updated_at()               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION zapp.fn_app_notifications_insert()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION zapp.fn_app_notifications_update()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION zapp.fn_app_notifications_delete()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION zapp.fn_messages_view_insert_handler() FROM PUBLIC, anon, authenticated;

-- ─── VERIFICATION ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_anon_internal int;
BEGIN
  SELECT count(*) INTO v_anon_internal
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'zapp'
    AND p.proname IN (
      'fn_score_security_acl',
      'fn_rate_limit_check',
      'prevent_role_escalation',
      'fn_set_updated_at',
      'fn_app_notifications_insert',
      'fn_app_notifications_update',
      'fn_app_notifications_delete',
      'fn_messages_view_insert_handler'
    )
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_anon_internal > 0 THEN
    RAISE EXCEPTION 'VERIFICATION FAILED: % zapp internal function(s) still executable by anon', v_anon_internal;
  END IF;

  RAISE NOTICE 'OK: 0 internal zapp functions executable by anon';
  RAISE NOTICE 'OK: fn_score_security_acl, fn_rate_limit_check, trigger functions secured';
END;
$$;
