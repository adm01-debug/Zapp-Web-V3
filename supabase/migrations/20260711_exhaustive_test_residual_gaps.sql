-- Migration: exhaustive_test_residual_gaps_20260711
-- Discovered by: exhaustive test battery T001-V007
-- Date: 2026-07-11
--
-- GAPS FOUND AND FIXED:
--
-- GAP-H (T007): _fn_health_* and fn_security_surface_audit had EXPLICIT authenticated
--   grant (not via PUBLIC). Previous REVOKE FROM PUBLIC removed grantee=0 entry but
--   left the authenticated=X/postgres explicit entry intact.
--   Fix: REVOKE EXECUTE ... FROM authenticated for all 5 functions.
--   Verified: auth=false, sr=true for all 5.
--
-- GAP-I (T021): fn_evolution_ef_logs_cleanup has authenticated access, no auth guard.
--   Cron-only operation that deletes evolution_ef_logs rows. Any authenticated user
--   could trigger mass deletion of EF logs.
--   Fix: REVOKE EXECUTE ON FUNCTION public.fn_evolution_ef_logs_cleanup() FROM authenticated.
--   Verified: auth_exec_ef_logs=false.
--
-- CONFIRMED WORKING (post-fix verifications V001-V007):
--   V001: fn_evolution_ef_logs_cleanup auth=false ✅
--   V002: e2e-probe 1 success post-fix (fixes applied at 10:25, probe at 10:32) ✅
--   V003: fn_pipeline_health_probe returns 'warn'/'ok' without SQL error ✅
--   V004: fn_detect_external_401_bursts works (evo.* schema) ✅
--   V005: security sentinel CLEAN, anon=0, auth_purge=0 ✅
--   V006: 8/8 views with security_invoker=ON ✅
--   V007: 5/5 consecutive runs = 100.0/A+ ✅

-- GAP-H: explicit authenticated grants on diagnostic functions
REVOKE EXECUTE ON FUNCTION public._fn_health_diag() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._fn_health_min_test() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._fn_health_noexc() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public._fn_health_nosecdef() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_security_surface_audit() FROM authenticated;

-- GAP-I: evolution EF logs cleanup — cron-only
REVOKE EXECUTE ON FUNCTION public.fn_evolution_ef_logs_cleanup() FROM authenticated;
