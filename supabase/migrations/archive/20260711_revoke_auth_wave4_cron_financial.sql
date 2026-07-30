-- Migration: revoke_auth_wave4_cron_financial_20260711
-- Date: 2026-07-11
-- Author: automated hardening wave 4 — discovered by full SECURITY DEFINER scan
--
-- Functions revoked from authenticated (all SECURITY DEFINER, no auth guard):
--
-- CRON-ONLY functions (should only be called by pg_cron/service_role):
--   fn_auto_archive_inactive_conversations — bulk archives inactive conversations
--   fn_archive_expired_media              — archives expired media in batches
--   fn_mirror_kill_zombie_runs            — kills stuck processing runs
--   fn_batch_normalize_status             — normalizes status for up to 50K records
--   fn_check_followup_triggers            — inserts followup records
--   fn_backfill_queue_get_batch           — admin backfill operation
--   fn_claim_media_batch                  — claims media records for processing
--
-- FINANCIAL functions (should be service_role or have explicit admin checks):
--   fin_bulk_insert_parcelas              — bulk inserts financial installments
--   fin_bulk_upsert_vendas                — bulk upserts sales records
--   fin_sync_parcelas_planilha            — syncs financial spreadsheet data
--
-- All 10 had authenticated=X/postgres explicit grant from DEFAULT PRIVILEGES.
-- None had auth.uid()/is_admin/auth.role() guards.
-- Verified: still_auth_accessible=0 after revoke.

DO $$
DECLARE v_fn record; v_count int := 0; BEGIN
  FOR v_fn IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND has_function_privilege('authenticated',p.oid,'execute')
      AND p.proname IN (
        'fn_auto_archive_inactive_conversations','fn_archive_expired_media',
        'fn_mirror_kill_zombie_runs','fn_batch_normalize_status',
        'fn_check_followup_triggers','fn_backfill_queue_get_batch',
        'fn_claim_media_batch','fin_bulk_insert_parcelas',
        'fin_bulk_upsert_vendas','fin_sync_parcelas_planilha')
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated',
        v_fn.proname, v_fn.args);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;
  RAISE NOTICE 'Wave 4 revoked: % functions', v_count;
END; $$;
