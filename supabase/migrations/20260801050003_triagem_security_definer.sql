-- 20260801050003 — Governanca: triagem SECURITY DEFINER expostos (auditoria etapa 42)
-- Aplicado em producao: 2026-08-01
-- Rodada 1: 231 funcoes fn_* internas (triggers/cron/processamento) REVOKE de authenticated.
-- Rodada 2: 85 funcoes 'outra' sem NENHUMA referencia em src/ + supabase/functions/ REVOKE.
-- Resultado: SECDEF expostos para authenticated: 600 -> 284 (RPCs legitimas + get_* + rpc_* + referenciadas).
-- Rollback: GRANT EXECUTE ... TO authenticated (lista completa em infra/stack35/SECDEF_REVOKED_20260801.md)

-- Rodada 1: fn_* internas (exceto as 9 chamadas como RPC pelo codigo)
DO $$
DECLARE r record; v_count integer := 0;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.prosecdef AND n.nspname='zapp'
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND p.proname LIKE 'fn_%'
      AND p.proname NOT IN ('fn_analyze_sentiment','fn_apply_connection_update','fn_auto_escalate_sla','fn_get_vault_secret','fn_lgpd_anonymize_deleted_contacts','fn_lgpd_purge_contact_activity','fn_lgpd_purge_message_metadata','fn_test_alert_channel','fn_use_template')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM authenticated', r.nspname, r.proname, r.args);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'Rodada 1 (fn_*): % revogadas', v_count;
END $$;

-- Rodada 2: funcoes 'outra' sem referencia no codigo (lista nominal)
DO $$
DECLARE r record; v_count integer := 0;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.prosecdef AND n.nspname='zapp' AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND p.proname IN ('acquire_job_lock','add_to_contact_id_graveyard','admin_atualizar_usuario_painel','admin_criar_usuario_painel','admin_desativar_usuario_painel','admin_listar_usuarios_painel','anonymize_contacts_batch','apagar_nota_fiscal','archive_old_consent_records','audit_role_changes','auto_add_deleted_contact_to_graveyard','auto_assign_contact','auto_assign_to_queue_agent','backup_campaign_contacts','bpm_archive_card','bpm_bulk_move_cards','bpm_card_counts','bpm_check_breached_slas','bpm_create_card','bpm_duplicate_card','bpm_flow_stats','bpm_install_template','bpm_move_card','bpm_my_tasks','bpm_process_recurrences','bpm_refresh_dashboards','bpm_search_cards','bpm_workspace_overview','bulk_lgpd_optout','can_see_pii','can_supervise_profile','can_user_see_contact','create_pagination_cursor','current_user_is_privileged','decode_html_entities','deduplicate_campaign_contacts_atomically','delete_contact_completely','fin_marcar_parcelas_vencidas','handle_new_auth_user_painel','handle_new_user','handle_new_user_role','handle_new_user_settings','increment_snapshot_version','init_agent_stats','is_admin_painel','is_contact_id_available','is_feature_enabled','is_manager_or_above','mask_channel_credentials','messages_instead_of_delete','messages_instead_of_update','normalize_contact_phone_sh','normalize_input_nfkc','on_role_change','populate_contact_intelligence_batch','prevent_audit_modification','prevent_contact_id_reuse','prevent_profile_privilege_escalation','rate_limit_reset_requests','release_job_lock','rls_auto_enable','sanitize_reset_request','sanitize_user_input','sync_perfil_on_login','sync_tag_use_counts','trg_create_followups_on_stage_change','trg_fn_refresh_role_permissions_mv','trg_process_chat_event','trg_process_connection_event','trg_process_contact_event','trg_process_message_delete','trg_process_message_update','trg_process_webhook_chats','trg_process_webhook_connection','trg_process_webhook_contacts','trg_process_webhook_message','trg_process_webhook_msg_delete','trg_process_webhook_msg_update','trg_queue_deal_for_bitrix','update_large_batch_safe','update_segment_counts','upsert_contact_intelligence','validate_snapshot_freshness','validate_timestamp_freshness')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM authenticated', r.nspname, r.proname, r.args);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'Rodada 2 (outra): % revogadas', v_count;
END $$;
