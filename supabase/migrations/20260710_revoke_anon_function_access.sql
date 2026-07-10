-- Migration: revoke_anon_function_access_20260710
-- Date: 2026-07-10
-- Author: automated hardening v6.2
-- Score impact: security hardening (no direct score pts; prevents anon calling sensitive RPCs)
--
-- Problem: 11 public functions accessible by anon via supabase.rpc() even though
-- they should only be called by postgres/service_role/authenticated. The PUBLIC
-- grant (PostgreSQL default) means any unauthenticated client could invoke them.
--
-- Approach: REVOKE FROM PUBLIC (the actual grantor), then regrant explicitly
-- to authenticated/service_role only. Trigger functions don't need PUBLIC —
-- PostgreSQL invokes trigger functions as the function owner (SECURITY DEFINER),
-- not by checking execute privilege of the caller.
--
-- Already executed on production via MCP (applied and verified).

-- Non-trigger functions (never callable by anon)
REVOKE EXECUTE ON FUNCTION public.fn_purge_api_key_from_logs(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_restore_integrity_check() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_system_health_score_cached(integer, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_zapp_web_smoke_test_v2() FROM PUBLIC;

-- Trigger functions (triggers fire as owner; anon rpc call to trigger fn is dangerous)
REVOKE EXECUTE ON FUNCTION public.auto_assign_contact_sh() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_assign_to_queue_agent_sh() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_conversation_pins_iud() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_contacts_view_insert_handler() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_contacts_view_update_handler() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_contacts_view_delete_handler() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.normalize_contact_phone_sh() FROM PUBLIC;

-- Explicit regrant to needed roles only
GRANT EXECUTE ON FUNCTION public.fn_system_health_score_cached(integer, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_zapp_web_smoke_test_v2() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_purge_api_key_from_logs(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_restore_integrity_check() TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_assign_contact_sh() TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_assign_to_queue_agent_sh() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_conversation_pins_iud() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_contacts_view_insert_handler() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_contacts_view_update_handler() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fn_contacts_view_delete_handler() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_contact_phone_sh() TO service_role;

-- VERIFY:
-- SELECT proname, has_function_privilege('anon', oid, 'execute') AS anon_execute
-- FROM pg_proc WHERE pronamespace='public'::regnamespace
-- AND proname IN ('auto_assign_contact_sh','fn_purge_api_key_from_logs','fn_restore_integrity_check');
-- Expected: anon_execute = false for all rows.
