-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260804150000_fix_secdef_revoke_extended_schemas.sql
--
-- PURPOSE: Revoke EXECUTE on SECURITY DEFINER functions in extended schemas
--          (vendas, financeiro, ops, bpm, email_app, ai, archive) that were
--          inadvertently re-granted to `authenticated` by F-04 Step 6 in
--          migration 20260804140000.
--
-- ROOT CAUSE: F-04 did:
--   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA vendas TO authenticated
--   (and same for financeiro, ops, bpm, email_app, ai, archive)
-- The triagem re-revoke DO blocks in Rodada 1 and Rodada 2 both filter
-- WHERE nspname = 'zapp' — they never touch the extended schemas.
-- This silently re-exposes every SECURITY DEFINER function in those schemas
-- to any authenticated user.
--
-- Additionally, zapp.purge_webhook_logs() was explicitly revoked in the
-- canonical schema (20260804000000 line 10757) but is not in the Rodada 1
-- (fn_% prefix doesn't match) or Rodada 2 named lists, so F-04 Step 1
-- GRANT re-exposed it.
--
-- AGENT 3 P0/HIGH FINDINGS ADDRESSED:
--   P0-1: vendas.fn_listar_bling_tokens()        — raw OAuth tokens for all Bling accounts
--   P0-2: financeiro.apagar_nota_fiscal(uuid)    — unguarded DELETE on nota fiscal
--   P0-3: vendas.resetar_envios_pedido(text)     — resets delivery records without auth guard
--   HIGH: ops.fn_analytics_log_retention(int)    — purge operation via dblink
--   HIGH: ops.fn_auth_can_read_front_views()     — internal ACL helper (SECURITY DEFINER)
--   HIGH: zapp.purge_webhook_logs()              — bulk DELETE of audit logs
--
-- STRATEGY:
--   1. Re-revoke ALL SECURITY DEFINER functions in extended schemas dynamically.
--      No allowlist — these schemas have no functions that should be callable by
--      authenticated users directly (all calls go through service_role or
--      SECURITY INVOKER wrappers in zapp).
--   2. Explicit named revokes for the P0 functions as belt-and-suspenders.
--   3. Re-revoke zapp.purge_webhook_logs() which slipped through Rodada 1+2.
--   4. Fix ALTER DEFAULT PRIVILEGES to include FOR ROLE postgres so future
--      functions created by the deploy role also inherit the restriction.
--
-- ROLLBACK (if needed):
--   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA vendas TO authenticated, service_role;
--   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA financeiro TO authenticated, service_role;
--   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ops TO authenticated, service_role;
--   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA bpm TO authenticated, service_role;
--   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA email_app TO authenticated, service_role;
--   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ai TO authenticated, service_role;
--   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA archive TO authenticated, service_role;
--   (and same for PROCEDURES)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Belt-and-suspenders explicit revoke for P0-class functions
--         These are wrapped in schema-existence guards to survive CI/staging
--         environments that may not have all extension schemas deployed.
-- ─────────────────────────────────────────────────────────────────────────────

DO $p0_revokes$
BEGIN
  -- P0-1: vendas.fn_listar_bling_tokens() — returns raw OAuth tokens for all Bling accounts
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vendas')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'vendas' AND p.proname = 'fn_listar_bling_tokens')
  THEN
    REVOKE EXECUTE ON FUNCTION vendas.fn_listar_bling_tokens() FROM authenticated;
    RAISE NOTICE 'P0-1: Revoked vendas.fn_listar_bling_tokens from authenticated';
  END IF;

  -- P0-2: financeiro.apagar_nota_fiscal(uuid) — SECURITY DEFINER unguarded DELETE
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'financeiro')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'financeiro' AND p.proname = 'apagar_nota_fiscal')
  THEN
    REVOKE EXECUTE ON FUNCTION financeiro.apagar_nota_fiscal(uuid) FROM authenticated;
    RAISE NOTICE 'P0-2: Revoked financeiro.apagar_nota_fiscal from authenticated';
  END IF;

  -- P0-3: vendas.resetar_envios_pedido(text) — resets delivery records without auth guard
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vendas')
     AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'vendas' AND p.proname = 'resetar_envios_pedido')
  THEN
    REVOKE EXECUTE ON FUNCTION vendas.resetar_envios_pedido(text) FROM authenticated;
    RAISE NOTICE 'P0-3: Revoked vendas.resetar_envios_pedido from authenticated';
  END IF;
END;
$p0_revokes$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: zapp.purge_webhook_logs() — slipped through Rodada 1 and Rodada 2
--         Canonical schema line 10757 revoked it; F-04 Step 1 re-granted it.
--         Not in Rodada 1 (fn_% prefix) or Rodada 2 (named list).
-- ─────────────────────────────────────────────────────────────────────────────

DO $purge_logs_revoke$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'zapp' AND p.proname = 'purge_webhook_logs')
  THEN
    REVOKE EXECUTE ON FUNCTION zapp.purge_webhook_logs() FROM authenticated;
    RAISE NOTICE 'HIGH: Revoked zapp.purge_webhook_logs from authenticated';
  END IF;
END;
$purge_logs_revoke$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Comprehensive re-revoke of ALL SECURITY DEFINER functions in
--         extended schemas. Iterates over every prosecdef=true function in
--         vendas, financeiro, ops, bpm, email_app, ai, archive and revokes
--         EXECUTE from authenticated.
--
--         These schemas have no functions that should be callable directly by
--         authenticated PostgREST requests — all access must flow through
--         SECURITY INVOKER wrappers in zapp or via service_role Edge Functions.
-- ─────────────────────────────────────────────────────────────────────────────

DO $re_revoke_extended_secdef$
DECLARE
  r record;
  v_total integer := 0;
  v_schema_count integer := 0;
  v_schemas text[] := ARRAY['vendas', 'financeiro', 'ops', 'bpm', 'email_app', 'ai', 'archive'];
  s text;
BEGIN
  FOREACH s IN ARRAY v_schemas LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = s) THEN
      RAISE NOTICE 'Schema % not found — skipping', s;
      CONTINUE;
    END IF;

    v_schema_count := 0;

    FOR r IN
      SELECT
        n.nspname,
        p.proname,
        pg_get_function_identity_arguments(p.oid) AS args,
        p.prokind
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.prosecdef
        AND n.nspname = s
    LOOP
      BEGIN
        IF r.prokind = 'p' THEN
          EXECUTE format('REVOKE EXECUTE ON PROCEDURE %I.%I(%s) FROM authenticated, PUBLIC',
                         r.nspname, r.proname, r.args);
        ELSIF r.prokind = 'a' THEN
          EXECUTE format('REVOKE EXECUTE ON AGGREGATE %I.%I(%s) FROM authenticated, PUBLIC',
                         r.nspname, r.proname, r.args);
        ELSE
          EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM authenticated, PUBLIC',
                         r.nspname, r.proname, r.args);
        END IF;
        v_schema_count := v_schema_count + 1;
        v_total := v_total + 1;
      EXCEPTION WHEN OTHERS THEN
        -- Log but continue — some functions may have already been revoked
        RAISE WARNING 'Could not revoke %.%(%): % (SQLSTATE: %)',
                      r.nspname, r.proname, r.args, SQLERRM, SQLSTATE;
      END;
    END LOOP;

    RAISE NOTICE 'Schema %: revoked % SECURITY DEFINER functions from authenticated', s, v_schema_count;
  END LOOP;

  RAISE NOTICE 'Total: revoked % SECURITY DEFINER routines from authenticated across extended schemas', v_total;
END;
$re_revoke_extended_secdef$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: Fix ALTER DEFAULT PRIVILEGES to include FOR ROLE postgres
--         Without FOR ROLE, the default privilege change only applies to the
--         current role (the migration runner). Functions created by other
--         deploy roles (e.g. a CI runner role) would still inherit PUBLIC EXECUTE
--         at creation time.
--
--         This covers all schemas: zapp, evo, and all extended schemas.
-- ─────────────────────────────────────────────────────────────────────────────

DO $fix_default_privs$
DECLARE
  s text;
  v_schemas text[] := ARRAY['zapp', 'evo', 'vendas', 'financeiro', 'ops', 'bpm', 'email_app', 'ai', 'archive'];
BEGIN
  FOREACH s IN ARRAY v_schemas LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = s) THEN
      CONTINUE;
    END IF;
    BEGIN
      -- Future routines (functions + procedures) in this schema: anon gets no EXECUTE by default
      -- ON ROUTINES covers both functions and stored procedures (ON FUNCTIONS misses procedures)
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I
         REVOKE EXECUTE ON ROUTINES FROM anon, PUBLIC',
        s
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA %I
         REVOKE EXECUTE ON ROUTINES FROM anon, PUBLIC',
        s
      );
      -- Future routines: authenticated and service_role get EXECUTE by default
      -- (they must still be individually revoked for SECURITY DEFINER routines
      --  via the triagem pattern — this just ensures grant-baseline is correct)
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I
         GRANT EXECUTE ON ROUTINES TO authenticated, service_role',
        s
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA %I
         GRANT EXECUTE ON ROUTINES TO authenticated, service_role',
        s
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'ALTER DEFAULT PRIVILEGES for schema % failed: %', s, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Default privileges updated for all app schemas (FOR ROLE postgres)';
END;
$fix_default_privs$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: Re-revoke zapp functions that were missed by Rodada 1/2 criteria:
--         Functions NOT starting with fn_% and NOT in the Rodada 2 named list
--         but still tagged prosecdef=true and deliberately restricted in canonical
--         schema with REVOKE ALL FROM authenticated.
--
--         These are identified by grep for REVOKE ALL ON FUNCTION.*FROM.*authenticated
--         in 20260804000000_canonical_schema.sql excluding functions already in
--         Rodada 1 (fn_% pattern) and Rodada 2 (named list):
--           - zapp.purge_webhook_logs()          (handled in Step 2)
--           - zapp.acquire_job_lock(...)         (in Rodada 2 named list)
--           - zapp.release_job_lock(...)         (Rodada 1 fn_% pattern doesn't match;
--                                                 but it IS in Rodada 2 named list)
--
--         Since this is a belt-and-suspenders pass, run the full Rodada 1 and 2
--         patterns once more but extending to catch residuals:
-- ─────────────────────────────────────────────────────────────────────────────

DO $zapp_secdef_residual$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  -- Find SECURITY DEFINER functions in zapp that are NOT already covered by
  -- Rodada 1 (fn_% prefix) or Rodada 2 (named list), and revoke them.
  -- The Rodada 2 allowlist in F-04 enumerates functions that SHOULD retain
  -- authenticated EXECUTE. Any secdef function not in that allowlist is suspect.

  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef AND n.nspname = 'zapp'
      -- Skip functions in the Rodada 2 allowlist (those should retain access)
      AND p.proname NOT IN (
        'acquire_job_lock','add_to_contact_id_graveyard','admin_atualizar_usuario_painel',
        'admin_criar_usuario_painel','admin_desativar_usuario_painel','admin_listar_usuarios_painel',
        'anonymize_contacts_batch','apagar_nota_fiscal','archive_old_consent_records',
        'audit_role_changes','auto_add_deleted_contact_to_graveyard','auto_assign_contact',
        'auto_assign_to_queue_agent','backup_campaign_contacts','bpm_archive_card',
        'bpm_bulk_move_cards','bpm_card_counts','bpm_check_breached_slas','bpm_create_card',
        'bpm_duplicate_card','bpm_flow_stats','bpm_install_template','bpm_move_card',
        'bpm_my_tasks','bpm_process_recurrences','bpm_refresh_dashboards','bpm_search_cards',
        'bpm_workspace_overview','bulk_lgpd_optout','can_see_pii','can_supervise_profile',
        'can_user_see_contact','create_pagination_cursor','current_user_is_privileged',
        'decode_html_entities','deduplicate_campaign_contacts_atomically','delete_contact_completely',
        'fin_marcar_parcelas_vencidas','handle_new_auth_user_painel','handle_new_user',
        'handle_new_user_role','handle_new_user_settings','increment_snapshot_version',
        'init_agent_stats','is_admin_painel','is_contact_id_available','is_feature_enabled',
        'is_manager_or_above','mask_channel_credentials','messages_instead_of_delete',
        'messages_instead_of_update','normalize_contact_phone_sh','normalize_input_nfkc',
        'on_role_change','populate_contact_intelligence_batch','prevent_audit_modification',
        'prevent_contact_id_reuse','prevent_profile_privilege_escalation',
        'rate_limit_reset_requests','release_job_lock','rls_auto_enable',
        'sanitize_reset_request','sanitize_user_input','sync_perfil_on_login',
        'sync_tag_use_counts','trg_create_followups_on_stage_change',
        'trg_fn_refresh_role_permissions_mv','trg_process_chat_event',
        'trg_process_connection_event','trg_process_contact_event','trg_process_message_delete',
        'trg_process_message_update','trg_process_webhook_chats','trg_process_webhook_connection',
        'trg_process_webhook_contacts','trg_process_webhook_message',
        'trg_process_webhook_msg_delete','trg_process_webhook_msg_update',
        'trg_queue_deal_for_bitrix','update_large_batch_safe','update_segment_counts',
        'upsert_contact_intelligence','validate_snapshot_freshness','validate_timestamp_freshness',
        -- fn_% functions that should retain access (Rodada 1 allowlist):
        'fn_analyze_sentiment','fn_apply_connection_update','fn_auto_escalate_sla',
        'fn_get_vault_secret','fn_lgpd_anonymize_deleted_contacts',
        'fn_lgpd_purge_contact_activity','fn_lgpd_purge_message_metadata',
        'fn_test_alert_channel','fn_use_template'
      )
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM authenticated',
                     r.nspname, r.proname, r.args);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Could not revoke zapp.%(%): %', r.proname, r.args, SQLERRM;
    END;
  END LOOP;

  IF v_count > 0 THEN
    RAISE NOTICE 'zapp residual: revoked % additional SECURITY DEFINER functions from authenticated', v_count;
  ELSE
    RAISE NOTICE 'zapp residual: no additional functions found outside Rodada 1+2 coverage';
  END IF;
END;
$zapp_secdef_residual$;
