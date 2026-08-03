-- ══════════════════════════════════════════════════════════════
-- check_schema_drift.sql · GUARD DE DRIFT legado migrado -> canônico (compacto)
-- Uso: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/check_schema_drift.sql
-- Falha (RAISE) se alguma das 146 tabelas esperadas OU colunas críticas sumir.
-- ══════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
DO $drift$
DECLARE ft int; fc int;
BEGIN
  CREATE TEMP TABLE _rel ON COMMIT DROP AS
    SELECT c.relname rel FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('zapp','public') AND c.relkind IN ('r','v','p');
  CREATE TEMP TABLE _col ON COMMIT DROP AS
    SELECT table_name rel, column_name col FROM information_schema.columns
    WHERE table_schema IN ('zapp','public');
  CREATE TEMP TABLE _ren(lov text, canon text) ON COMMIT DROP;
  INSERT INTO _ren VALUES ('processed_webhook_events','webhook_events_processed');

  CREATE TEMP TABLE _et(t text) ON COMMIT DROP;
  INSERT INTO _et VALUES ('agent_achievements'),('agent_skills'),('agent_stats'),('agent_visibility_grants'),('ai_conversation_tags'),('ai_providers'),('ai_usage_logs'),('allowed_countries'),('audio_meme_favorites'),('audio_memes'),('audit_logs'),('auto_close_config'),('automations'),('away_messages'),('blocked_countries'),('blocked_ips'),('business_hours'),('calls'),('campaign_ab_variants'),('campaign_contacts'),('campaigns'),('channel_connections'),('channel_routing_rules'),('chatbot_executions'),('chatbot_flows'),('client_wallet_rules'),('connection_alert_preferences'),('connection_health_logs'),('contact_custom_fields'),('contact_notes'),('contact_purchases'),('contact_tags'),('contacts'),('conversation_analyses'),('conversation_closures'),('conversation_events'),('conversation_memory'),('conversation_sla'),('conversation_snoozes'),('conversation_tasks'),('conversation_transfers'),('crisis_room_alerts'),('csat_auto_config'),('csat_surveys'),('custom_emojis'),('deal_activities'),('department_invitations'),('departments'),('dispatch_error_logs'),('dlq_audit_log'),('email_accounts'),('email_labels'),('email_messages'),('email_threads'),('entity_versions'),('evolution_health_logs'),('evolution_instance_credentials'),('evolution_retry_metrics'),('failed_messages'),('favorite_contacts'),('followup_executions'),('followup_sequences'),('followup_steps'),('geo_blocking_settings'),('global_settings'),('gmail_accounts'),('goals_configurations'),('inbox_custom_scopes'),('instance_auth_events'),('instance_processing_pauses'),('instance_registry'),('ip_whitelist'),('knowledge_base_articles'),('knowledge_base_files'),('login_attempts'),('message_reactions'),('message_templates'),('messages'),('meta_capi_events'),('mfa_sessions'),('notifications'),('nps_surveys'),('number_reputation'),('passkey_credentials'),('password_reset_requests'),('payment_links'),('performance_snapshots'),('permissions'),('pinned_conversations'),('playbooks'),('processed_webhook_events'),('products'),('profiles'),('qr_attempts'),('query_telemetry'),('queue_goals'),('queue_members'),('queue_positions'),('queue_skill_requirements'),('queues'),('rate_limit_configs'),('rate_limit_logs'),('reconnection_logs'),('reminders'),('rls_denied_log'),('role_permissions'),('route_permissions'),('sales_deals'),('sales_pipeline_stages'),('saved_filters'),('scheduled_messages'),('scheduled_report_configs'),('scheduled_reports'),('security_alerts'),('security_audit_logs'),('sicoob_contact_mapping'),('sla_configurations'),('sla_rules'),('stickers'),('tags'),('talkx_blacklist'),('talkx_campaigns'),('talkx_recipients'),('team_conversation_members'),('team_conversations'),('team_message_receipts'),('team_messages'),('training_sessions'),('transfer_comments'),('user_devices'),('user_roles'),('user_service_accounts'),('user_sessions'),('user_settings'),('voice_command_logs'),('warroom_alerts'),('webauthn_challenges'),('webhook_rate_limits'),('whatsapp_cloud_webhook_pings'),('whatsapp_connection_queues'),('whatsapp_connections'),('whatsapp_flows'),('whatsapp_groups'),('whatsapp_official_credentials'),('whatsapp_templates'),('whisper_messages');
  SELECT count(*) INTO ft FROM _et e
    WHERE NOT EXISTS (SELECT 1 FROM _rel WHERE rel=e.t)
      AND NOT EXISTS (SELECT 1 FROM _ren r JOIN _rel l ON l.rel=r.canon WHERE r.lov=e.t);

  CREATE TEMP TABLE _ec(t text, c text) ON COMMIT DROP;
  INSERT INTO _ec VALUES ('instance_registry','owner_id'),('instance_registry','api_key'),('instance_registry','connection_status'),('instance_registry','proxy_pass'),('instance_registry','metadata'),('conversation_transfers','from_agent_id'),('conversation_transfers','to_queue_id'),('conversation_transfers','sla_deadline'),('conversation_transfers','metadata'),('transfer_comments','agent_id'),('transfer_comments','metadata'),('department_invitations','email'),('department_invitations','role'),('department_invitations','status'),('department_invitations','invited_by'),('department_invitations','updated_at'),('departments','whatsapp_mode'),('departments','whatsapp_api_key'),('departments','whatsapp_instance_id'),('profiles','_admin_user_id'),('profiles','online_status'),('evolution_health_logs','connection_id'),('evolution_health_logs','error_count'),('evolution_health_logs','success_count'),('evolution_health_logs','created_at'),('rls_denied_log','resource'),('rls_denied_log','required_role'),('rls_denied_log','context'),('security_audit_logs','event_type'),('security_audit_logs','status'),('security_audit_logs','details'),('security_audit_logs','ip_address'),('inbox_custom_scopes','name'),('inbox_custom_scopes','label'),('inbox_custom_scopes','filter_criteria'),('inbox_custom_scopes','is_active'),('dlq_audit_log','action'),('dlq_audit_log','item_id'),('dlq_audit_log','performed_by');
  SELECT count(*) INTO fc FROM _ec e
    WHERE NOT EXISTS (SELECT 1 FROM _col l WHERE l.rel=e.t AND l.col=e.c)
      AND NOT EXISTS (SELECT 1 FROM _ren r JOIN _col l ON l.rel=r.canon WHERE r.lov=e.t AND l.col=e.c);

  IF ft>0 OR fc>0 THEN
    RAISE EXCEPTION 'DRIFT DETECTADO -> % tabela(s), % coluna(s) ausente(s)', ft, fc;
  END IF;
  RAISE NOTICE 'check_schema_drift OK: 146 tabelas e % colunas criticas presentes.', (SELECT count(*) FROM _ec);
END $drift$;
