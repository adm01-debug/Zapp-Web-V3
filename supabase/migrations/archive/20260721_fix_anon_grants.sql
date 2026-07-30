-- =============================================================================
-- Fix: REVOKE EXECUTE from PUBLIC (anon) for functions that were exposed
--
-- Root causes:
--   1. rpc_list_failed_messages_cursor: DROPped+re-CREATEd in the previous
--      20260721 migration, which wiped the prior REVOKE PUBLIC. PostgreSQL
--      grants EXECUTE to PUBLIC by default on new functions.
--   2. fn_cookie_probe_*: pre-existing issue; REVOKE never applied.
--      These are SECURITY DEFINER internal/cron functions reading sensitive
--      zapp.cookies_config data (Lusha, LinkedIn, LeadContact cookies).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. rpc_list_failed_messages_cursor
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION zapp.rpc_list_failed_messages_cursor(
  text[], text, text, timestamptz, timestamptz, integer, uuid, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION zapp.rpc_list_failed_messages_cursor(
  text[], text, text, timestamptz, timestamptz, integer, uuid, text
) TO authenticated;

GRANT EXECUTE ON FUNCTION zapp.rpc_list_failed_messages_cursor(
  text[], text, text, timestamptz, timestamptz, integer, uuid, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. fn_cookie_probe_collect — internal SECURITY DEFINER, cron only
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION zapp.fn_cookie_probe_collect(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.fn_cookie_probe_collect(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. fn_cookie_probe_cycle — internal SECURITY DEFINER, cron only
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION zapp.fn_cookie_probe_cycle() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.fn_cookie_probe_cycle() TO service_role;

-- ---------------------------------------------------------------------------
-- 4. fn_cookie_probe_dispatch — internal SECURITY DEFINER, cron only
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION zapp.fn_cookie_probe_dispatch() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zapp.fn_cookie_probe_dispatch() TO service_role;
