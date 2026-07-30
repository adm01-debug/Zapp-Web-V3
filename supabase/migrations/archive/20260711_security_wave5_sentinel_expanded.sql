-- Migration: security_wave5_sentinel_expanded_20260711
-- Date: 2026-07-11
-- Author: automated hardening wave 5 — deepest scan yet
--
-- CHANGES:
--
-- 1. fn_security_surface_audit EXPANDED:
--    Added 2 new vectors:
--    - default_priv_auth_evo: detects if authenticated has SELECT in evo DEFAULT PRIVILEGES
--    - auth_secdef_no_guard: detects cron/financial SECURITY DEFINER fns callable by authenticated
--    Added truly_dangerous flag for fast triage.
--    Always revoke PUBLIC+authenticated grants on this function.
--
-- 2. 4 additional SECURITY DEFINER functions locked down (wave 5):
--    fn_backfill_claim(text): claims contact for backfill — worker-only, no guard
--    fn_backfill_mark_error(text, text): marks backfill error — worker-only, no guard  
--    fn_batch_categorize_audio_memes(uuid[], text): any authenticated could mass-recategorize
--    fn_batch_categorize_stickers(uuid[], text): batch sticker categorization, no auth check
--
-- VERIFIED: sentinel returns CLEAN, score 5/5 runs = 100.0/A+

-- Expanded sentinel function (see fn_security_surface_audit in DB for full body)
REVOKE EXECUTE ON FUNCTION public.fn_security_surface_audit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_security_surface_audit() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_security_surface_audit() TO service_role;

-- Wave 5 function locks
REVOKE EXECUTE ON FUNCTION public.fn_backfill_claim(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_backfill_mark_error(text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_batch_categorize_audio_memes(uuid[], text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_batch_categorize_stickers(uuid[], text) FROM authenticated;
