-- Migration: security_wave3_exhaustive_test_20260710
-- Discovered by: 400+ scenario adversarial test sweep (S01/S07/S09/S12/S14)
-- Date: 2026-07-10
-- Severity mix: CRITICAL (decrypt_gmail_token) / HIGH (health_fns, auto_pause) / MEDIUM (trigger fns)
--
-- GAPS FOUND AND FIXED:
--
-- GAP-D (S01/S07/S14): 4 _fn_health_* functions with anon EXECUTE
--   _fn_health_diag, _fn_health_min_test: SECURITY DEFINER — anon could extract
--   timing side-channel from vault.secrets, evo.*, zapp.* reads.
--   _fn_health_noexc, _fn_health_nosecdef: NOT security definer but still exposed.
--   Fix: REVOKE FROM PUBLIC; GRANT TO service_role.
--
-- GAP-E (S12): decrypt_gmail_token accessible by authenticated
--   SECURITY DEFINER function that calls pgp_sym_decrypt() with app.encryption_key.
--   Any authenticated user could pass any encrypted bytea to obtain decrypted content.
--   Fix: REVOKE EXECUTE ON FUNCTION public.decrypt_gmail_token(bytea) FROM authenticated;
--
-- GAP-F (S12): auto_pause_instance_on_auth_spike accessible by authenticated
--   No auth guard. Any authenticated user could pause any WhatsApp instance for up to
--   1440 minutes (24h) — effective DoS against the messaging platform.
--   Fix: REVOKE EXECUTE ON FUNCTION public.auto_pause_instance_on_auth_spike FROM authenticated;
--
-- GAP-G (S13): Trigger functions accessible by authenticated
--   auto_assign_contact_sh, auto_assign_to_queue_agent_sh, clear_qr_on_connect,
--   ensure_single_default_ai_provider, ensure_single_default_filter
--   These are trigger functions — triggers don't need EXECUTE privilege on the function
--   to fire. REVOKE is safe (was confirmed via is_trigger=true check).
--   Fix: REVOKE EXECUTE FROM authenticated on all 5.
--
-- COLLATERAL FINDINGS (no action needed):
-- - cron_health: fn_update_instance_health had a format('%.1f') bug already fixed
--   (current DB state uses string concatenation). 1 historical failure in 24h window.
-- - S11 hot indexes: All critical indexes still active (33K+ scans on contacts_pkey)
-- - S20 constraints: 474 PKs, 230 FKs, 163 UNIQUEs — all intact after index drops
-- - S22 pipeline: 1007 events/h, 0.2 min silent — production nominal
-- - Score stability: 100.0/A+ confirmed on 3/3 consecutive runs post-fixes

-- GAP-D: health diagnostic functions — benchmark tools, not public API
REVOKE EXECUTE ON FUNCTION public._fn_health_diag() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._fn_health_min_test() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._fn_health_noexc() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._fn_health_nosecdef() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._fn_health_diag() TO service_role;
GRANT EXECUTE ON FUNCTION public._fn_health_min_test() TO service_role;
GRANT EXECUTE ON FUNCTION public._fn_health_noexc() TO service_role;
GRANT EXECUTE ON FUNCTION public._fn_health_nosecdef() TO service_role;

-- GAP-E: Gmail token decryption — should never be called by end users
REVOKE EXECUTE ON FUNCTION public.decrypt_gmail_token(bytea) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.encrypt_gmail_token(text) FROM authenticated;

-- GAP-F: Instance pause — DoS vector via arbitrary duration
REVOKE EXECUTE ON FUNCTION public.auto_pause_instance_on_auth_spike(text, text, integer, integer) FROM authenticated;

-- GAP-G: Trigger functions — triggers fire via database engine, not by EXECUTE privilege
REVOKE EXECUTE ON FUNCTION public.auto_assign_contact_sh() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_assign_to_queue_agent_sh() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_qr_on_connect() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_single_default_ai_provider() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_single_default_filter() FROM authenticated;

-- VERIFY:
-- SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
-- WHERE n.nspname='public' AND has_function_privilege('anon',p.oid,'execute');
-- Expected: 0
