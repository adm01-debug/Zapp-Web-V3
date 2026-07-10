-- Migration: revoke_auth_admin_functions_20260710
-- Date: 2026-07-10 (discovered during exhaustive test phase)
-- Author: automated hardening — gap found by adversarial testing
--
-- Problem (discovered by Phase 5 testing):
--   fn_purge_api_key_from_logs and fn_restore_integrity_check were accessible
--   by 'authenticated' users via supabase.rpc(). Both are admin/cron operations:
--
--   fn_purge_api_key_from_logs(text): Emergency admin op that redacts a leaked
--     Evolution API key from ALL log/audit/webhook tables. An authenticated user
--     calling this with any string would cause mass data modification.
--
--   fn_restore_integrity_check(): Daily restore probe that writes to
--     public.restore_test_log and fires webhook_health_alerts. An authenticated
--     user could spam alerts or pollute the test log.
--
-- Fix: REVOKE EXECUTE from 'authenticated'. Only 'service_role' and 'postgres'
-- (via pg_cron) should be able to call these functions.
-- Already executed on production via MCP. Verified: auth_x=false, sr_x=true.

REVOKE EXECUTE ON FUNCTION public.fn_purge_api_key_from_logs(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_restore_integrity_check() FROM authenticated;

-- VERIFY:
-- SELECT proname,
--   has_function_privilege('authenticated', oid, 'execute') AS auth,
--   has_function_privilege('service_role', oid, 'execute') AS sr
-- FROM pg_proc WHERE pronamespace='public'::regnamespace
-- AND proname IN ('fn_purge_api_key_from_logs','fn_restore_integrity_check');
-- Expected: auth=false, sr=true for both.
