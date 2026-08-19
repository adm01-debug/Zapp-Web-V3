-- Migration: grant_execute_frontend_rpcs
-- Applied: 2026-08-07 (esta sessao — M-1 AUDIT_REPORT_2026-08-06.md)
-- Adiciona GRANT EXECUTE TO authenticated para 89 rpc_* frontend-callable.
-- Todas sao SECURITY DEFINER + search_path fixo -> seguro conceder.
-- 23 funcoes internas (backfill, repair, route, cron) mantem protecao (service_role only).

DO $$
DECLARE
  r RECORD;
  granted_count INT := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname,
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'zapp'
    AND p.proname = ANY(ARRAY[
      'rpc_associate_label','rpc_auto_save_sticker','rpc_change_deal_stage',
      'rpc_check_and_trigger_gmail_revalidation','rpc_check_audio_meme_duplicate',
      'rpc_check_sticker_duplicate','rpc_complete_task','rpc_confirm_message_sent',
      'rpc_contact_media_stats','rpc_contract_inventory','rpc_count_contact_media',
      'rpc_create_task','rpc_delete_contact','rpc_dispatch_error_stats',
      'rpc_dlq_list_audit_cursor','rpc_email_create_tracking','rpc_email_device_breakdown',
      'rpc_email_health_check','rpc_email_link_performance','rpc_email_message_details',
      'rpc_email_register_bounce','rpc_email_register_failure','rpc_email_search',
      'rpc_email_top_contacts','rpc_email_tracking_daily_series','rpc_email_tracking_stats',
      'rpc_email_unopened_followup','rpc_email_unopened_list','rpc_email_update_delivery',
      'rpc_find_contact_by_phone','rpc_get_conversation_media','rpc_get_gmail_health_summary',
      'rpc_get_media_public_url','rpc_get_media_url','rpc_get_metrics_dashboard',
      'rpc_get_notifications','rpc_get_pipeline','rpc_get_pipeline_health',
      'rpc_gmail_token_status','rpc_gmail_update_sla_status','rpc_increment_sticker_use',
      'rpc_integration_health','rpc_link_channel_queue','rpc_list_broadcasts',
      'rpc_list_channel_queues','rpc_list_contact_links','rpc_list_contact_media',
      'rpc_list_dispatch_error_logs','rpc_list_eligible_agents','rpc_list_groups',
      'rpc_list_labels','rpc_list_message_templates','rpc_list_messages_all',
      'rpc_list_quick_replies','rpc_list_tags','rpc_list_tasks',
      'rpc_log_assignment_change','rpc_log_gmail_health','rpc_mark_message_failed',
      'rpc_mark_messages_as_read','rpc_media_dashboard','rpc_media_download_stats',
      'rpc_message_stats','rpc_move_deal','rpc_pause_queue',
      'rpc_pipeline_dashboard','rpc_resolve_instance_by_phone','rpc_resolve_whatsapp_instance',
      'rpc_resume_queue','rpc_schedule_follow_up','rpc_search_audio_memes',
      'rpc_search_insights','rpc_search_media','rpc_search_messages',
      'rpc_search_stickers','rpc_send_sticker','rpc_system_health',
      'rpc_system_health_check','rpc_toggle_message_important','rpc_toggle_message_star',
      'rpc_toggle_sticker_favorite','rpc_unified_search','rpc_unlink_channel_queue',
      'rpc_upsert_deal','rpc_upsert_label','rpc_upsert_task',
      'rpc_zapp_dashboard','rpc_zapp_health_check'
    ])
    AND p.prokind = 'f'
  LOOP
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION zapp.%I(%s) TO authenticated',
      r.proname, r.args
    );
    granted_count := granted_count + 1;
  END LOOP;
  RAISE NOTICE '[grant_frontend_rpcs] Grants aplicados: %', granted_count;
END;
$$;
