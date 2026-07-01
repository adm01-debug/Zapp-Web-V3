-- ops.check_schema_drift() - GUARD DE DRIFT como funcao no banco (fonte unica)
-- Consumido pelo cron in-cluster (stack schema-drift-guard) e por CI manual.
-- Idempotente. Read-only (so grava log em ops). Manifesto: 146 tabelas + 39 colunas criticas.

CREATE SCHEMA IF NOT EXISTS ops;

CREATE TABLE IF NOT EXISTS ops.schema_drift_log (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_at          timestamptz NOT NULL DEFAULT now(),
  status          text        NOT NULL CHECK (status IN ('OK','DRIFT')),
  missing_tables  integer     NOT NULL DEFAULT 0,
  missing_columns integer     NOT NULL DEFAULT 0,
  detail          jsonb       NOT NULL DEFAULT '{}'::jsonb
);
COMMENT ON TABLE ops.schema_drift_log IS 'Historico de execucoes do guard de drift Lovable->canonico.';

CREATE OR REPLACE FUNCTION ops.check_schema_drift(p_raise boolean DEFAULT false)
RETURNS ops.schema_drift_log
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_missing_tabs text[];
  v_missing_cols text[];
  v_row ops.schema_drift_log;
BEGIN
  WITH expected(t) AS (VALUES ('agent_achievements'),('agent_skills'),('agent_stats'),('agent_visibility_grants'),('ai_conversation_tags'),('ai_providers'),('ai_usage_logs'),('allowed_countries'),('audio_meme_favorites'),('audio_memes'),('audit_logs'),('auto_close_config'),('automations'),('away_messages'),('blocked_countries'),('blocked_ips'),('business_hours'),('calls'),('campaign_ab_variants'),('campaign_contacts'),('campaigns'),('channel_connections'),('channel_routing_rules'),('chatbot_executions'),('chatbot_flows'),('client_wallet_rules'),('connection_alert_preferences'),('connection_health_logs'),('contact_custom_fields'),('contact_notes'),('contact_purchases'),('contact_tags'),('contacts'),('conversation_analyses'),('conversation_closures'),('conversation_events'),('conversation_memory'),('conversation_sla'),('conversation_snoozes'),('conversation_tasks'),('conversation_transfers'),('crisis_room_alerts'),('csat_auto_config'),('csat_surveys'),('custom_emojis'),('deal_activities'),('department_invitations'),('departments'),('dispatch_error_logs'),('dlq_audit_log'),('email_accounts'),('email_labels'),('email_messages'),('email_threads'),('entity_versions'),('evolution_health_logs'),('evolution_instance_credentials'),('evolution_retry_metrics'),('failed_messages'),('favorite_contacts'),('followup_executions'),('followup_sequences'),('followup_steps'),('geo_blocking_settings'),('global_settings'),('gmail_accounts'),('goals_configurations'),('inbox_custom_scopes'),('instance_auth_events'),('instance_processing_pauses'),('instance_registry'),('ip_whitelist'),('knowledge_base_articles'),('knowledge_base_files'),('login_attempts'),('message_reactions'),('message_templates'),('messages'),('meta_capi_events'),('mfa_sessions'),('notifications'),('nps_surveys'),('number_reputation'),('passkey_credentials'),('password_reset_requests'),('payment_links'),('performance_snapshots'),('permissions'),('pinned_conversations'),('playbooks'),('processed_webhook_events'),('products'),('profiles'),('qr_attempts'),('query_telemetry'),('queue_goals'),('queue_members'),('queue_positions'),('queue_skill_requirements'),('queues'),('rate_limit_configs'),('rate_limit_logs'),('reconnection_logs'),('reminders'),('rls_denied_log'),('role_permissions'),('route_permissions'),('sales_deals'),('sales_pipeline_stages'),('saved_filters'),('scheduled_messages'),('scheduled_report_configs'),('scheduled_reports'),('security_alerts'),('security_audit_logs'),('sicoob_contact_mapping'),('sla_configurations'),('sla_rules'),('stickers'),('tags'),('talkx_blacklist'),('talkx_campaigns'),('talkx_recipients'),('team_conversation_members'),('team_conversations'),('team_message_receipts'),('team_messages'),('training_sessions'),('transfer_comments'),('user_devices'),('user_roles'),('user_service_accounts'),('user_sessions'),('user_settings'),('voice_command_logs'),('warroom_alerts'),('webauthn_challenges'),('webhook_rate_limits'),('whatsapp_cloud_webhook_pings'),('whatsapp_connection_queues'),('whatsapp_connections'),('whatsapp_flows'),('whatsapp_groups'),('whatsapp_official_credentials'),('whatsapp_templates'),('whisper_messages')),
  ren(lov,canon) AS (VALUES ('processed_webhook_events','webhook_events_processed')),
  live AS (
    SELECT c.relname AS rel FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('zapp','public') AND c.relkind IN ('r','v','p')
  )
  SELECT array_agg(e.t ORDER BY e.t) INTO v_missing_tabs
  FROM expected e
  WHERE NOT EXISTS (SELECT 1 FROM live l WHERE l.rel = e.t)
    AND NOT EXISTS (SELECT 1 FROM ren r JOIN live l ON l.rel=r.canon WHERE r.lov=e.t);

  WITH expected_c(t,c) AS (VALUES ('instance_registry','owner_id'),('instance_registry','api_key'),('instance_registry','connection_status'),('instance_registry','proxy_pass'),('instance_registry','metadata'),('conversation_transfers','from_agent_id'),('conversation_transfers','to_queue_id'),('conversation_transfers','sla_deadline'),('conversation_transfers','metadata'),('transfer_comments','agent_id'),('transfer_comments','metadata'),('department_invitations','email'),('department_invitations','role'),('department_invitations','status'),('department_invitations','invited_by'),('department_invitations','updated_at'),('departments','whatsapp_mode'),('departments','whatsapp_api_key'),('departments','whatsapp_instance_id'),('profiles','_admin_user_id'),('profiles','online_status'),('evolution_health_logs','connection_id'),('evolution_health_logs','error_count'),('evolution_health_logs','success_count'),('evolution_health_logs','created_at'),('rls_denied_log','resource'),('rls_denied_log','required_role'),('rls_denied_log','context'),('security_audit_logs','event_type'),('security_audit_logs','status'),('security_audit_logs','details'),('security_audit_logs','ip_address'),('inbox_custom_scopes','name'),('inbox_custom_scopes','label'),('inbox_custom_scopes','filter_criteria'),('inbox_custom_scopes','is_active'),('dlq_audit_log','action'),('dlq_audit_log','item_id'),('dlq_audit_log','performed_by')),
  ren(lov,canon) AS (VALUES ('processed_webhook_events','webhook_events_processed')),
  livec AS (
    SELECT table_name AS rel, column_name AS col FROM information_schema.columns
    WHERE table_schema IN ('zapp','public')
  )
  SELECT array_agg((e.t||'.'||e.c) ORDER BY e.t, e.c) INTO v_missing_cols
  FROM expected_c e
  WHERE NOT EXISTS (SELECT 1 FROM livec l WHERE l.rel=e.t AND l.col=e.c)
    AND NOT EXISTS (SELECT 1 FROM ren r JOIN livec l ON l.rel=r.canon WHERE r.lov=e.t AND l.col=e.c);

  INSERT INTO ops.schema_drift_log(status, missing_tables, missing_columns, detail)
  VALUES (
    CASE WHEN COALESCE(array_length(v_missing_tabs,1),0) + COALESCE(array_length(v_missing_cols,1),0) > 0
         THEN 'DRIFT' ELSE 'OK' END,
    COALESCE(array_length(v_missing_tabs,1),0),
    COALESCE(array_length(v_missing_cols,1),0),
    jsonb_build_object(
      'missing_tables',  to_jsonb(COALESCE(v_missing_tabs, ARRAY[]::text[])),
      'missing_columns', to_jsonb(COALESCE(v_missing_cols, ARRAY[]::text[]))
    )
  )
  RETURNING * INTO v_row;

  IF p_raise AND v_row.status = 'DRIFT' THEN
    RAISE EXCEPTION 'DRIFT DETECTADO -> % tabela(s), % coluna(s): %',
      v_row.missing_tables, v_row.missing_columns, v_row.detail;
  END IF;

  RETURN v_row;
END;
$fn$;

COMMENT ON FUNCTION ops.check_schema_drift(boolean) IS 'Verifica drift Lovable->canonico (146 tabelas + colunas criticas). Grava em ops.schema_drift_log. p_raise=true lanca excecao (uso em CI).';
