-- Migration: revoke_authenticated_purge_gc_fns_20260710
-- Discovered by: 400+ scenario adversarial test sweep (A03/A07/A08/A12)
-- Date: 2026-07-10
-- Severity: P0 — any authenticated user could call SECURITY DEFINER purge functions
--   and delete production data (e.g. fn_purge_processed_webhook_events(0,50000) wipes all events)
--
-- FINDINGS:
-- Wave 1 (A07/A08): 7 functions — fn_purge_processed_webhook_events, run_audit_log_purge,
--   run_contact_purge, run_lgpd_purge, run_pii_log_purge, fn_gc_deleted_contacts/messages
--   None had internal auth guards. Fixed in prior step.
--
-- Wave 2 (A12): 32 additional cleanup/GC functions, all SECURITY DEFINER,
--   none with auth guards, all callable by authenticated via supabase.rpc().
--   Fixed via dynamic REVOKE DO block using pg_get_function_identity_arguments.
--
-- Post-fix verification: remaining_cleanup_authenticated = 0
--
-- Note: cron jobs (pg_cron) use service_role, so they are unaffected by these REVOKEs.
-- The A13 test confirmed cron jobs call via SELECT public.fn_purge_... which runs as
-- service_role (still has EXECUTE). Zero functional regression expected.
--
-- DYNAMIC REVOKE (idempotent):
DO $$
DECLARE v_fn record; v_count int := 0; BEGIN
  FOR v_fn IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND has_function_privilege('authenticated',p.oid,'execute')
      AND (p.proname ILIKE 'cleanup_%' OR p.proname ILIKE 'fn_cleanup%'
        OR p.proname ILIKE 'fn_gc%' OR p.proname ILIKE 'fn_retention%'
        OR p.proname ILIKE 'fn_data_retention%' OR p.proname ILIKE 'fn_pipeline_health_log%'
        OR p.proname ILIKE 'purge_old_%' OR p.proname ILIKE 'fn_auto_cleanup%'
        OR p.proname ILIKE 'fn_auto_reset_failed%')
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated', v_fn.proname, v_fn.args);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
  RAISE NOTICE 'Revoked % cleanup/purge/gc functions from authenticated', v_count;
END; $$;

-- Also revoke the wave-1 functions (idempotent):
REVOKE EXECUTE ON FUNCTION public.fn_purge_processed_webhook_events(integer, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.run_audit_log_purge() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.run_contact_purge() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.run_lgpd_purge() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.run_pii_log_purge() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_gc_deleted_contacts(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_gc_deleted_messages(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_check_restore_validation_health() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_trigger_restore_validation() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_ingest_restore_logs_from_text(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_collect_restore_logs(text, integer) FROM authenticated;
