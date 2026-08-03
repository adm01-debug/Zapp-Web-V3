
-- ===== 20260716_fix_cloud_url_hardcodes.sql =====

-- ===== 20260716_fix_dispatch_error_logs_grant.sql =====

-- ===== 20260716_fix_messages_insert_trigger_return_id.sql =====
DROP FUNCTION IF EXISTS zapp.fn_messages_view_insert_handler();

-- ===== 20260716_fix_public_to_zapp_schema.sql =====

-- ===== 20260716_fix_rpc_list_failed_messages_cursor_columns.sql =====
DROP FUNCTION IF EXISTS zapp.rpc_list_failed_messages_cursor(p_status     text[], p_instance   text, p_search     text, p_from       timestamptz, p_to         timestamptz, p_limit      integer, p_cursor_id  uuid, p_error_code text);
-- MANUAL:
--   DROP FUNCTION DROP FUNCTION IF EXISTS public.rpc_list_failed_messages_cursor(text[], text, text, timesta — down = re-create (def in git history)
--   DROP FUNCTION DROP FUNCTION IF EXISTS public.rpc_list_failed_messages_cursor(text[], text, text, timesta — down = re-create (def in git history)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.rpc_list_failed_messages_cursor(text[], text, text, timestamptz, tim — down = reverse grant (manual)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.rpc_list_failed_messages_cursor(text[], text, text, timestamptz, time — down = reverse grant (manual)

-- ===== 20260716_harden_security_definer_search_path.sql =====

-- ===== 20260716_rls_service_role_only_tables.sql =====

-- ===== 20260716_schema_hardening.sql =====
ALTER TABLE IF EXISTS ZAPP.STORAGE_CLEANUP_LOGS ALTER COLUMN CREATED_AT DROP NOT NULL;
ALTER TABLE IF EXISTS ZAPP.WEBHOOK_REPROCESS_QUEUE ALTER COLUMN CREATED_AT DROP NOT NULL;
ALTER TABLE IF EXISTS ZAPP.WEBHOOK_REPROCESS_QUEUE ALTER COLUMN UPDATED_AT DROP NOT NULL;
ALTER TABLE IF EXISTS ZAPP.ONBOARDING_STEPS DROP CONSTRAINT IF EXISTS UQ_ONBOARDING_STEPS_USER_STEP;
ALTER TABLE IF EXISTS ZAPP.WEBHOOK_PREFERENCES DROP CONSTRAINT IF EXISTS UQ_WEBHOOK_PREFERENCES_USER;
DROP INDEX IF EXISTS IDX_SEARCH_HISTORY_USER_ID;
DROP INDEX IF EXISTS IDX_SENTIMENT_ALERTS_MESSAGE_ID;
DROP INDEX IF EXISTS IDX_SICOOB_OUTBOX_CONTACT_ID;
DROP INDEX IF EXISTS IDX_WEBHOOK_HEALTH_CHECKS_WEBHOOK_ID;
DROP INDEX IF EXISTS IDX_WEBHOOK_REPROCESS_CONNECTION_ID;
DROP INDEX IF EXISTS IDX_WEBHOOK_IDEMPOTENCY_EXPIRES_AT;
DROP INDEX IF EXISTS IDX_SICOOB_OUTBOX_PENDING;
DROP INDEX IF EXISTS IDX_WEBHOOK_REPROCESS_PENDING;
-- MANUAL:
--   DATA UPDATE zapp.storage_cleanup_logs SET created_at = now() WHERE created_at IS NULL — down = inverse data op (manual)
--   DATA UPDATE zapp.webhook_reprocess_queue SET created_at = now() WHERE created_at IS NULL — down = inverse data op (manual)
--   DATA UPDATE zapp.webhook_reprocess_queue SET updated_at = now() WHERE updated_at IS NULL — down = inverse data op (manual)

-- ===== 20260716_schema_hardening_v2.sql =====
ALTER TABLE IF EXISTS ZAPP.ONBOARDING_STEPS ALTER COLUMN STEP_KEY DROP NOT NULL;

-- ===== 20260716_schema_hardening_v3.sql =====
DROP POLICY IF EXISTS AUTH_USER_MANAGE_API_KEYS ON ZAPP.API_KEYS;
ALTER TABLE IF EXISTS ZAPP.API_KEYS ALTER COLUMN CREATED_AT DROP NOT NULL;
ALTER TABLE IF EXISTS ZAPP.GLOBAL_SETTINGS ALTER COLUMN CREATED_AT DROP NOT NULL;
ALTER TABLE IF EXISTS ZAPP.SCHEDULED_MESSAGES ALTER COLUMN CREATED_AT DROP NOT NULL;
ALTER TABLE IF EXISTS ZAPP.USER_SETTINGS ALTER COLUMN CREATED_AT DROP NOT NULL;
ALTER TABLE IF EXISTS ZAPP.API_KEYS ALTER COLUMN IS_ACTIVE DROP DEFAULT;
ALTER TABLE IF EXISTS ZAPP.API_KEYS DROP CONSTRAINT IF EXISTS UQ_API_KEYS_KEY_HASH;
ALTER TABLE IF EXISTS ZAPP.SCHEDULED_MESSAGES DROP CONSTRAINT IF EXISTS SCHEDULED_MESSAGES_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.WEBHOOK_IDEMPOTENCY DROP CONSTRAINT IF EXISTS WEBHOOK_IDEMPOTENCY_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.STORAGE_CLEANUP_LOGS DROP CONSTRAINT IF EXISTS STORAGE_CLEANUP_LOGS_STATUS_CHECK;
DROP INDEX IF EXISTS IDX_API_KEYS_USER_ID;
-- MANUAL:
--   ALTER ALTER POLICY auth_user_select_search_history
  ON zapp.search_history
  USING (true) — down = reverse alter (manual)
--   ALTER ALTER POLICY auth_user_write_search_history
  ON zapp.search_history
  USING (true)
  WITH CHECK (tr — down = reverse alter (manual)
--   ALTER ALTER POLICY auth_full_access
  ON zapp.user_settings
  USING (user_id = auth.uid())
  WITH CHECK (u — down = reverse alter (manual)
--   DROP INDEX DROP INDEX IF EXISTS zapp.idx_webhook_prefs_user — down = re-create (def in git history)

-- ===== 20260716_security_revoke_anon_cookies_update.sql =====
-- MANUAL:
--   DROP POLICY DROP POLICY IF EXISTS allow_anon_update_health ON zapp.cookies_config — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS allow_anon_select_cookies ON zapp.cookies_config — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS allow_auth_update_own_cookies ON zapp.cookies_config — down = re-create (def in git history)

-- ===== 20260716_zapp_evolution_retry_metrics_view.sql =====
DROP VIEW IF EXISTS ZAPP.EVOLUTION_RETRY_METRICS;
-- MANUAL:
--   PRIV GRANT SELECT ON zapp.evolution_retry_metrics TO authenticated, service_role — down = reverse grant (manual)

-- ===== 20260717_fix_dlq_mutation_rpcs_zapp_schema.sql =====
DROP FUNCTION IF EXISTS zapp.rpc_dlq_retry_now(p_id      uuid, p_item_id uuid);
DROP FUNCTION IF EXISTS zapp.rpc_dlq_abandon(p_id      uuid, p_item_id uuid, p_reason  text);
DROP FUNCTION IF EXISTS zapp.rpc_dlq_bulk_abandon(p_ids    uuid[], p_reason text);
DROP FUNCTION IF EXISTS zapp.rpc_dlq_log_reprocess_trigger(p_source text);
DROP FUNCTION IF EXISTS zapp.rpc_dlq_log_reprocess_result(p_processed integer, p_succeeded integer, p_failed    integer, p_abandoned integer, p_message   text, p_source    text);
DROP FUNCTION IF EXISTS zapp.rpc_dlq_bulk_retry_now(p_ids    uuid[], p_reason text);
-- MANUAL:
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_retry_now(uuid, uuid) FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_retry_now(uuid, uuid) TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_abandon(uuid, uuid, text) FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_abandon(uuid, uuid, text) TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_bulk_abandon(uuid[], text) FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_bulk_abandon(uuid[], text) TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_log_reprocess_trigger(text) FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_log_reprocess_trigger(text) TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_log_reprocess_result(integer, integer, integer, integer, tex — down = reverse grant (manual)
--   PRIV GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_log_reprocess_result(integer, integer, integer, integer, tex — down = reverse grant (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_bulk_retry_now(uuid[], text) FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_bulk_retry_now(uuid[], text) TO authenticated — down = reverse grant (manual)

-- ===== 20260717_fix_dlq_read_rpcs_zapp_schema.sql =====
DROP FUNCTION IF EXISTS zapp.rpc_list_dispatch_error_logs(p_from       TIMESTAMPTZ, p_to         TIMESTAMPTZ, p_instance   TEXT, p_agent      TEXT, p_error_code TEXT, p_search     TEXT, p_limit      INTEGER, p_offset     INTEGER);
DROP FUNCTION IF EXISTS zapp.rpc_dlq_list_audit(p_limit  INTEGER, p_offset INTEGER, p_action TEXT);
-- MANUAL:
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.rpc_list_dispatch_error_logs(
  TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT — down = reverse grant (manual)
--   PRIV GRANT  EXECUTE ON FUNCTION zapp.rpc_list_dispatch_error_logs(
  TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT — down = reverse grant (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_list_audit(INTEGER, INTEGER, TEXT) FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_list_audit(INTEGER, INTEGER, TEXT) TO authenticated — down = reverse grant (manual)

-- ===== 20260717_fix_dlq_rpc_schema_drift.sql =====
DROP FUNCTION IF EXISTS zapp.rpc_list_failed_messages(p_status   text[], p_instance text, p_search   text, p_from     timestamptz, p_to       timestamptz, p_limit    integer, p_offset   integer);
DROP FUNCTION IF EXISTS zapp.rpc_dlq_stats();
-- MANUAL:
--   DROP FUNCTION DROP FUNCTION IF EXISTS zapp.rpc_list_failed_messages(
  text, text, text, timestamptz, ti — down = re-create (def in git history)
--   DROP FUNCTION DROP FUNCTION IF EXISTS zapp.rpc_list_failed_messages(
  text[], text, text, timestamptz,  — down = re-create (def in git history)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.rpc_list_failed_messages(
  text[], text, text, timestamptz, timesta — down = reverse grant (manual)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.rpc_list_failed_messages(
  text[], text, text, timestamptz, timestam — down = reverse grant (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_stats() FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_stats() TO authenticated — down = reverse grant (manual)

-- ===== 20260717_fix_dlq_security_and_audit_gaps.sql =====
DROP FUNCTION IF EXISTS zapp.rpc_dlq_retry_now(p_id      uuid, p_item_id uuid);
DROP FUNCTION IF EXISTS zapp.rpc_dlq_abandon(p_id     uuid, p_reason text);
DROP FUNCTION IF EXISTS zapp.rpc_dlq_bulk_abandon(p_ids    uuid[], p_reason text);
DROP FUNCTION IF EXISTS zapp.rpc_dlq_bulk_retry_now(p_ids    uuid[], p_reason text);
DROP FUNCTION IF EXISTS zapp.rpc_dlq_list_audit(p_limit  integer, p_offset integer, p_action text);
DROP FUNCTION IF EXISTS zapp.rpc_dlq_log_item_action(p_action text, p_ids    uuid[], p_reason text);
DROP FUNCTION IF EXISTS zapp.rpc_dlq_log_reprocess_trigger(p_source text);
DROP FUNCTION IF EXISTS zapp.rpc_dlq_log_reprocess_result(p_processed integer, p_succeeded integer, p_failed    integer, p_abandoned integer, p_message   text, p_source    text);
DROP FUNCTION IF EXISTS zapp.search_contacts_cursor(search_term         text, sort_field          text, sort_direction      text, contact_type_filter text, company_filter      text, date_from           timestamptz, job_title_filter    text, tag_filter          text, page_size           integer, cursor_id           uuid);
DROP INDEX IF EXISTS IDX_FAILED_MESSAGES_CREATED_AT;
DROP INDEX IF EXISTS IDX_FAILED_MESSAGES_STATUS_CREATED;
DROP INDEX IF EXISTS IDX_FAILED_MESSAGES_NEXT_ATTEMPT;
-- MANUAL:
--   DROP FUNCTION DROP FUNCTION IF EXISTS zapp.rpc_dlq_retry_now(uuid) — down = re-create (def in git history)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_retry_now(uuid, uuid) FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_retry_now(uuid, uuid) TO authenticated — down = reverse grant (manual)
--   DROP FUNCTION DROP FUNCTION IF EXISTS zapp.rpc_dlq_abandon(uuid) — down = re-create (def in git history)
--   DROP FUNCTION DROP FUNCTION IF EXISTS zapp.rpc_dlq_abandon(uuid, uuid) — down = re-create (def in git history)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_abandon(uuid, text) FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_abandon(uuid, text) TO authenticated — down = reverse grant (manual)
--   DROP FUNCTION DROP FUNCTION IF EXISTS zapp.rpc_dlq_bulk_abandon(uuid[]) — down = re-create (def in git history)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_bulk_abandon(uuid[], text) FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_bulk_abandon(uuid[], text) TO authenticated — down = reverse grant (manual)
--   DROP FUNCTION DROP FUNCTION IF EXISTS zapp.rpc_dlq_bulk_retry_now(uuid[], text) — down = re-create (def in git history)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_bulk_retry_now(uuid[], text) FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_bulk_retry_now(uuid[], text) TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_list_audit(integer, integer, text) FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_list_audit(integer, integer, text) TO authenticated — down = reverse grant (manual)
--   DROP FUNCTION DROP FUNCTION IF EXISTS zapp.rpc_dlq_log_item_action(uuid, text, text) — down = re-create (def in git history)
--   DROP FUNCTION DROP FUNCTION IF EXISTS zapp.rpc_dlq_log_item_action(uuid, text, text, uuid[]) — down = re-create (def in git history)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_log_item_action(text, uuid[], text) FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_log_item_action(text, uuid[], text) TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_log_reprocess_trigger(text) FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_log_reprocess_trigger(text) TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_log_reprocess_result(integer, integer, integer, integer, tex — down = reverse grant (manual)
--   PRIV GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_log_reprocess_result(integer, integer, integer, integer, tex — down = reverse grant (manual)
--   DROP FUNCTION DROP FUNCTION IF EXISTS zapp.search_contacts_cursor(text, text, text, text, text, timestam — down = re-create (def in git history)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.search_contacts_cursor(text, text, text, text, text, timestamptz, te — down = reverse grant (manual)
--   PRIV GRANT  EXECUTE ON FUNCTION zapp.search_contacts_cursor(text, text, text, text, text, timestamptz, te — down = reverse grant (manual)
--   DROP INDEX DROP INDEX IF EXISTS zapp.idx_failed_messages_status — down = re-create (def in git history)

-- ===== 20260717_fix_missing_zapp_functions.sql =====
DROP FUNCTION IF EXISTS zapp.rpc_dlq_bulk_retry_now(p_ids    uuid[], p_reason text);
DROP FUNCTION IF EXISTS zapp.search_contacts_cursor(search_term         text, contact_type_filter text, company_filter      text, job_title_filter    text, tag_filter          text, date_from           timestamptz, sort_field          text, sort_direction      text, page_size           integer, cursor_id           uuid);
-- MANUAL:
--   DROP FUNCTION DROP FUNCTION IF EXISTS zapp.rpc_dlq_bulk_retry_now(uuid[], text) — down = re-create (def in git history)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_bulk_retry_now(uuid[], text) FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT  EXECUTE ON FUNCTION zapp.rpc_dlq_bulk_retry_now(uuid[], text) TO authenticated — down = reverse grant (manual)
--   DROP FUNCTION DROP FUNCTION IF EXISTS zapp.search_contacts_cursor(text, text, text, text, text, timestam — down = re-create (def in git history)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.search_contacts_cursor(text, text, text, text, text, timestamptz, te — down = reverse grant (manual)
--   PRIV GRANT  EXECUTE ON FUNCTION zapp.search_contacts_cursor(text, text, text, text, text, timestamptz, te — down = reverse grant (manual)

-- ===== 20260717_schema_hardening_v4.sql =====
DROP TRIGGER IF EXISTS SET_UPDATED_AT_CONVERSATION_THREADS ON ZAPP.CONVERSATION_THREADS;
DROP TRIGGER IF EXISTS SET_UPDATED_AT_OUTBOUND_MESSAGE_QUEUE ON ZAPP.OUTBOUND_MESSAGE_QUEUE;
DROP TRIGGER IF EXISTS SET_UPDATED_AT_OUTBOX_EVENTS ON ZAPP.OUTBOX_EVENTS;
DROP TRIGGER IF EXISTS SET_UPDATED_AT_REPROCESS_JOBS ON ZAPP.REPROCESS_JOBS;
ALTER TABLE IF EXISTS ZAPP.PROFILES ALTER COLUMN CREATED_AT DROP NOT NULL;
ALTER TABLE IF EXISTS ZAPP.DEPARTMENTS ALTER COLUMN CREATED_AT DROP NOT NULL;
ALTER TABLE IF EXISTS ZAPP.ROLES ALTER COLUMN CREATED_AT DROP NOT NULL;
ALTER TABLE IF EXISTS ZAPP.WORKSPACES ALTER COLUMN CREATED_AT DROP NOT NULL;
ALTER TABLE IF EXISTS ZAPP.CAMPAIGNS ALTER COLUMN CREATED_AT DROP NOT NULL;
ALTER TABLE IF EXISTS ZAPP.MESSAGE_TEMPLATES ALTER COLUMN CREATED_AT DROP NOT NULL;
ALTER TABLE IF EXISTS ZAPP.WHATSAPP_TEMPLATES ALTER COLUMN CREATED_AT DROP NOT NULL;
ALTER TABLE IF EXISTS ZAPP.CONVERSATION_THREADS ALTER COLUMN CREATED_AT DROP NOT NULL;
ALTER TABLE IF EXISTS ZAPP.SERVICE_CHANNELS ALTER COLUMN CREATED_AT DROP NOT NULL;
ALTER TABLE IF EXISTS ZAPP.CHANNEL_CONNECTIONS ALTER COLUMN CREATED_AT DROP NOT NULL;
ALTER TABLE IF EXISTS ZAPP.AUTOMATIONS ALTER COLUMN CREATED_AT DROP NOT NULL;
ALTER TABLE IF EXISTS ZAPP.CHATBOT_FLOWS ALTER COLUMN CREATED_AT DROP NOT NULL;
ALTER TABLE IF EXISTS ZAPP.SLA_CONFIGURATIONS ALTER COLUMN CREATED_AT DROP NOT NULL;
ALTER TABLE IF EXISTS ZAPP.WEBHOOK_ENDPOINTS ALTER COLUMN CREATED_AT DROP NOT NULL;
ALTER TABLE IF EXISTS ZAPP.CREDENTIAL_VAULT ALTER COLUMN CREATED_AT DROP NOT NULL;
ALTER TABLE IF EXISTS ZAPP.OUTBOX_EVENTS ALTER COLUMN CREATED_AT DROP NOT NULL;
ALTER TABLE IF EXISTS ZAPP.REPROCESS_JOBS ALTER COLUMN CREATED_AT DROP NOT NULL;
ALTER TABLE IF EXISTS ZAPP.NOTIFICATIONS ALTER COLUMN CREATED_AT DROP NOT NULL;
ALTER TABLE IF EXISTS ZAPP.TAGS ALTER COLUMN CREATED_AT DROP NOT NULL;
DROP INDEX IF EXISTS IDX_BATCH_JOBS_STATUS_PENDING;
DROP INDEX IF EXISTS IDX_MESSAGE_QUEUE_STATUS_PENDING;
DROP INDEX IF EXISTS IDX_QUEUE_ITEMS_STATUS_PENDING;

-- ===== 20260717_schema_hardening_v5.sql =====
ALTER TABLE IF EXISTS ZAPP.CONVERSATION_THREADS DROP CONSTRAINT IF EXISTS CONVERSATION_THREADS_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.CONVERSATION_TASKS DROP CONSTRAINT IF EXISTS CONVERSATION_TASKS_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.SERVICE_CHANNELS DROP CONSTRAINT IF EXISTS SERVICE_CHANNELS_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.CHANNEL_CONNECTIONS DROP CONSTRAINT IF EXISTS CHANNEL_CONNECTIONS_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.AUTOMATION_EXECUTIONS DROP CONSTRAINT IF EXISTS AUTOMATION_EXECUTIONS_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.FAILED_MESSAGES DROP CONSTRAINT IF EXISTS FAILED_MESSAGES_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.WHATSAPP_TEMPLATES DROP CONSTRAINT IF EXISTS WHATSAPP_TEMPLATES_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.WHATSAPP_FLOWS DROP CONSTRAINT IF EXISTS WHATSAPP_FLOWS_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.OUTBOX_EVENTS DROP CONSTRAINT IF EXISTS OUTBOX_EVENTS_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.REPROCESS_JOBS DROP CONSTRAINT IF EXISTS REPROCESS_JOBS_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.BATCH_JOBS DROP CONSTRAINT IF EXISTS BATCH_JOBS_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.MESSAGE_QUEUE DROP CONSTRAINT IF EXISTS MESSAGE_QUEUE_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.QUEUE_ITEMS DROP CONSTRAINT IF EXISTS QUEUE_ITEMS_STATUS_CHECK;
-- MANUAL:
--   DROP INDEX DROP INDEX IF EXISTS zapp.idx_contact_id_graveyard_lookup — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS zapp.idx_email_watch_history_account — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS zapp.idx_stickers_owner_id — down = re-create (def in git history)

-- ===== 20260717_schema_hardening_v6.sql =====
ALTER TABLE IF EXISTS ZAPP.CALLS DROP CONSTRAINT IF EXISTS CALLS_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.DEPARTMENT_INVITATIONS DROP CONSTRAINT IF EXISTS DEPARTMENT_INVITATIONS_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.QUEUES DROP CONSTRAINT IF EXISTS QUEUES_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.DOCUMENTS DROP CONSTRAINT IF EXISTS DOCUMENTS_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.CONTACT_EXPORT_LOG DROP CONSTRAINT IF EXISTS CONTACT_EXPORT_LOG_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.DATA_DELETION_REQUESTS DROP CONSTRAINT IF EXISTS DATA_DELETION_REQUESTS_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.INSTANCE_REGISTRY DROP CONSTRAINT IF EXISTS INSTANCE_REGISTRY_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.INTEGRATION_REGISTRY DROP CONSTRAINT IF EXISTS INTEGRATION_REGISTRY_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.CONVERSATION_ANALYSES DROP CONSTRAINT IF EXISTS CONVERSATION_ANALYSES_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.EVALUATION_RUNS DROP CONSTRAINT IF EXISTS EVALUATION_RUNS_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.FINETUNE_JOBS DROP CONSTRAINT IF EXISTS FINETUNE_JOBS_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.EMAIL_WATCH_HISTORY DROP CONSTRAINT IF EXISTS EMAIL_WATCH_HISTORY_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.FILE_SCAN_LOGS DROP CONSTRAINT IF EXISTS FILE_SCAN_LOGS_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.CRON_SCHEDULE_EXECUTIONS DROP CONSTRAINT IF EXISTS CRON_SCHEDULE_EXECUTIONS_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.FOLLOWUP_EXECUTIONS DROP CONSTRAINT IF EXISTS FOLLOWUP_EXECUTIONS_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.MESSAGE_ATTEMPTS DROP CONSTRAINT IF EXISTS MESSAGE_ATTEMPTS_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.CONNECTION_HEALTH_LOGS DROP CONSTRAINT IF EXISTS CONNECTION_HEALTH_LOGS_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.QR_ATTEMPTS DROP CONSTRAINT IF EXISTS QR_ATTEMPTS_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.RESTORE_TEST_LOG DROP CONSTRAINT IF EXISTS RESTORE_TEST_LOG_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.VAULT_HEALTHCHECK_LOG DROP CONSTRAINT IF EXISTS VAULT_HEALTHCHECK_LOG_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.WEBHOOK_AUDIT_LOG DROP CONSTRAINT IF EXISTS WEBHOOK_AUDIT_LOG_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.WHATSAPP_CLOUD_WEBHOOK_PINGS DROP CONSTRAINT IF EXISTS WHATSAPP_CLOUD_WEBHOOK_PINGS_STATUS_CHECK;
ALTER TABLE IF EXISTS ZAPP.AUDIT_LOGS DROP CONSTRAINT IF EXISTS AUDIT_LOGS_STATUS_CHECK;

-- ===== 20260720000006_fix_settings_realtime_publication.sql =====
ALTER PUBLICATION SUPABASE_REALTIME DROP TABLE ZAPP.USER_SETTINGS;
ALTER PUBLICATION SUPABASE_REALTIME DROP TABLE ZAPP.WORKSPACE_SETTINGS;

-- ===== 20260724000001_evo_drop_unused_indexes.sql =====
-- MANUAL:
--   DROP INDEX DROP INDEX IF EXISTS evo_whk_v2_remote_jid — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS pidx_msgs_unread_contact — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_evolution_conversations_contact_id — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_evolution_conversations_status_assigned — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_evo_msgs_conv_timeline — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_ec_pii_masked_null — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_evo_contacts_composite_search — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_evo_contacts_phone_active — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_evo_contacts_fullname_lower_active — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_contacts_score — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_contacts_nickname_trgm — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_contacts_first_name_trgm — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_contacts_job_title_trgm — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_ec_pii_masked_not_null — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_evolution_contacts_dedup_hash — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_wstatus_viewed_expires — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_wstatus_expires_at — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_wstatus_posted — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_wstatus_instance — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_wstatus_participant — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_conv_wpp2_agent_queue — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_conv_marketing_status — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_conv_marketing_contact — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS evolution_messages_wpp2_archive_follow_up_at_idx — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS evolution_messages_wpp2_archive_created_at_idx1 — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_msgs_artes_media_meta — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_msgs_comercial04_media_meta — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_msgs_comercial05_media_meta — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_msgs_comercial08_media_meta — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_msgs_comercial09_media_meta — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_msgs_comercial11_media_meta — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_msgs_comercial12_media_meta — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_msgs_comercial13_media_meta — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_msgs_comercial14_media_meta — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_msgs_comercial15_media_meta — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_msgs_compras_media_meta — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_msgs_financeiro_media_meta — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_msgs_gravacao_media_meta — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_msgs_logistica_media_meta — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_deal_value — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_deals_active_pipeline — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_deals_assigned — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_deals_expected_close — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_deals_stage — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_reactions_message — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_reactions_jid — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_reactions_emoji — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_reactions_created — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_calls_created — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_calls_missed — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_calls_remote_jid — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_fk_evolution_calls_contact_id — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_followups_deal_type_status — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_followups_scheduled_pending — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_bitrix_queue_local_id_status — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_bitrix_queue_worker — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_bitrix_queue_entity — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_srules_active — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_sreact_status — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_sreact_unsent — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_sreact_rule — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_evo_incident_runbook_severity — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_evo_incident_runbook_category — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_evo_media_stickers — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_evo_media_animated — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_evo_health_failures — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_evo_creds_health — down = re-create (def in git history)
--   DROP INDEX DROP INDEX IF EXISTS idx_evo_ip_watch_ip_ts — down = re-create (def in git history)

-- ===== 20260724000003_evo_schema_housekeeping.sql =====
DROP FUNCTION IF EXISTS zapp.fn_wal_slot_lag_check(p_threshold_mb INT);
-- MANUAL:
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.fn_wal_slot_lag_check(INT) FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT  EXECUTE ON FUNCTION zapp.fn_wal_slot_lag_check(INT) TO authenticated — down = reverse grant (manual)

-- ===== 20260724000004_fix_missing_realtime_publications.sql =====

-- ===== 20260724000005_fix_critical_sql_bugs.sql =====
DROP FUNCTION IF EXISTS zapp.initiate_gmail_oauth();
DROP FUNCTION IF EXISTS zapp.complete_gmail_oauth(auth_code text, p_state text);
DROP FUNCTION IF EXISTS zapp.sync_to_crm(entity_id   uuid, entity_data jsonb);
DROP FUNCTION IF EXISTS zapp.export_user_data(export_format text);
DROP FUNCTION IF EXISTS zapp.import_user_data(data jsonb);
DROP FUNCTION IF EXISTS zapp.enrich_contact(contact_id uuid);
DROP FUNCTION IF EXISTS zapp.get_latest_analysis(hours integer);
DROP FUNCTION IF EXISTS zapp.rpc_list_dispatch_error_logs_cursor(p_from        timestamptz, p_to          timestamptz, p_instance    text, p_agent       text, p_error_code  text, p_search      text, p_limit       int, p_cursor_id   uuid);
-- MANUAL:
--   ALTER ALTER ROLE authenticated SET statement_timeout = '120s' — down = reverse alter (manual)
--   ALTER ALTER ROLE authenticated SET lock_timeout      = '10s' — down = reverse alter (manual)
--   ALTER ALTER ROLE authenticated SET idle_in_transaction_session_timeout = '300s' — down = reverse alter (manual)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.initiate_gmail_oauth() TO authenticated — down = reverse grant (manual)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.complete_gmail_oauth(auth_code text, p_state text) TO authenticated — down = reverse grant (manual)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.sync_to_crm(uuid, jsonb) TO authenticated — down = reverse grant (manual)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.export_user_data(text) TO authenticated — down = reverse grant (manual)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.import_user_data(jsonb) TO authenticated — down = reverse grant (manual)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.enrich_contact(uuid) TO authenticated — down = reverse grant (manual)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.get_latest_analysis(integer) TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.rpc_list_dispatch_error_logs_cursor(
  timestamptz, timestamptz, tex — down = reverse grant (manual)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.rpc_list_dispatch_error_logs_cursor(
  timestamptz, timestamptz, text — down = reverse grant (manual)

-- ===== 20260724000006_fix_realtime_payment_links_correct_schema.sql =====

-- ===== 20260724000007_create_evolution_sentiment_analysis.sql =====

-- ===== 20260724000011_fix_evo_schema_blanket_auth_policies.sql =====

-- ===== 20260724000014_fix_secdef_search_path_bulk.sql =====

-- ===== 20260724000015_add_external_message_id_to_sentiment_analysis.sql =====

-- ===== 20260724000016_additional_realtime_publications.sql =====

-- ===== 20260727120000_qa_round_2_3_corrigido_consolidado.sql =====
DROP TRIGGER IF EXISTS TRG_ROLE_PERMISSIONS_UPDATED_AT ON ZAPP.ROLE_PERMISSIONS;
DROP TRIGGER IF EXISTS TRG_REFRESH_ROLE_PERMISSIONS_MV ON ZAPP.PERMISSIONS;
DROP TRIGGER IF EXISTS TRG_REFRESH_ROLE_PERMISSIONS_MV_RP ON ZAPP.ROLE_PERMISSIONS;
DROP MATERIALIZED VIEW IF EXISTS ZAPP.MV_ROLE_PERMISSIONS_FULL;
DROP FUNCTION IF EXISTS zapp.fn_evolution_status_unknown(p_instance_name text);
DROP FUNCTION IF EXISTS zapp.fn_normalize_phone(p_phone text);
DROP FUNCTION IF EXISTS zapp.fn_refresh_role_permissions_mv();
DROP FUNCTION IF EXISTS zapp.trg_fn_refresh_role_permissions_mv();
DROP FUNCTION IF EXISTS zapp.fn_touch_updated_at();
DROP FUNCTION IF EXISTS zapp.fn_touch_role_permissions_updated_at();
ALTER TABLE IF EXISTS ZAPP.ROLE_PERMISSIONS DROP COLUMN IF EXISTS UPDATED_AT;
ALTER TABLE IF EXISTS ZAPP.MV_ROLE_PERMISSIONS_FULL DROP CONSTRAINT IF EXISTS IDX_MV_ROLE_PERMISSIONS_FULL;
DROP INDEX IF EXISTS IDX_MV_ROLE_PERMISSIONS_FULL;
DROP INDEX IF EXISTS IDX_ZAPP_CONTACT_AUDIT_LOG_CONTACT_ID_CHANGED_AT;
-- MANUAL:
--   PRIV REVOKE ALL ON FUNCTION zapp.fn_evolution_status_unknown(text) FROM PUBLIC — down = reverse grant (manual)
--   PRIV REVOKE ALL ON FUNCTION zapp.fn_evolution_status_unknown(text) FROM anon — down = reverse grant (manual)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.fn_evolution_status_unknown(text) TO authenticated, service_role — down = reverse grant (manual)
--   PRIV REVOKE ALL ON FUNCTION zapp.fn_normalize_phone(text) FROM PUBLIC — down = reverse grant (manual)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.fn_normalize_phone(text) TO authenticated, service_role — down = reverse grant (manual)
--   PRIV REVOKE ALL ON zapp.mv_role_permissions_full FROM PUBLIC — down = reverse grant (manual)
--   PRIV REVOKE ALL ON zapp.mv_role_permissions_full FROM anon — down = reverse grant (manual)
--   PRIV REVOKE ALL ON zapp.mv_role_permissions_full FROM authenticated — down = reverse grant (manual)
--   PRIV GRANT SELECT ON zapp.mv_role_permissions_full TO authenticated, service_role — down = reverse grant (manual)
--   PRIV REVOKE ALL ON FUNCTION zapp.fn_refresh_role_permissions_mv() FROM PUBLIC — down = reverse grant (manual)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.fn_refresh_role_permissions_mv() TO service_role — down = reverse grant (manual)
--   DROP TRIGGER DROP TRIGGER IF EXISTS trg_role_permissions_updated_at ON zapp.role_permissions — down = re-create (def in git history)
--   DROP TRIGGER DROP TRIGGER IF EXISTS trg_refresh_role_permissions_mv ON zapp.permissions — down = re-create (def in git history)
--   DROP TRIGGER DROP TRIGGER IF EXISTS trg_refresh_role_permissions_mv_rp ON zapp.role_permissions — down = re-create (def in git history)

-- ===== 20260727200001_idx_evolution_contacts_instance_phone.sql =====
DROP INDEX IF EXISTS IDX_EC_INSTANCE_PHONE;
DROP INDEX IF EXISTS IDX_EC_INSTANCE_JID;

-- ===== 20260727200002_rpc_get_pipeline_health.sql =====
DROP FUNCTION IF EXISTS zapp.rpc_get_pipeline_health();
-- MANUAL:
--   PRIV GRANT EXECUTE ON FUNCTION zapp.rpc_get_pipeline_health() TO authenticated, service_role — down = reverse grant (manual)

-- ===== 20260727200003_fix_contact_audit_log_action_check.sql =====

-- ===== 20260727200004_idx_pipeline_health_gaps.sql =====
DROP INDEX IF EXISTS IDX_MESSAGES_STATUS_CREATED;
DROP INDEX IF EXISTS IDX_MESSAGES_PENDING_AGE;
DROP INDEX IF EXISTS IDX_DISPATCH_ERRORS_CREATED;
DROP INDEX IF EXISTS IDX_MEDIA_QUEUE_PENDING;

-- ===== 20260727200005_rpc_bulk_repair_dedup_hashes.sql =====
DROP FUNCTION IF EXISTS zapp.rpc_bulk_repair_dedup_hashes(p_limit  INT, p_dry_run BOOLEAN);
-- MANUAL:
--   PRIV GRANT EXECUTE ON FUNCTION zapp.rpc_bulk_repair_dedup_hashes(INT,BOOLEAN) TO service_role — down = reverse grant (manual)

-- ===== 20260727200006_rpc_get_pipeline_health_v2.sql =====
DROP FUNCTION IF EXISTS zapp.rpc_get_pipeline_health_v2(p_instance_name TEXT);
-- MANUAL:
--   PRIV GRANT EXECUTE ON FUNCTION zapp.rpc_get_pipeline_health_v2(TEXT) TO authenticated, service_role — down = reverse grant (manual)

-- ===== 20260727200007_rpc_backfill_messages_contact_id.sql =====
DROP FUNCTION IF EXISTS zapp.rpc_backfill_messages_contact_id(p_limit   INT, p_dry_run BOOLEAN);
-- MANUAL:
--   PRIV GRANT EXECUTE ON FUNCTION zapp.rpc_backfill_messages_contact_id(INT,BOOLEAN) TO service_role — down = reverse grant (manual)

-- ===== 20260727200008_harden_secdef_search_paths.sql =====

-- ===== 20260727200009_idx_webhook_audit_log_processed.sql =====
DROP INDEX IF EXISTS IDX_WEBHOOK_AUDIT_LOG_PROCESSED_AT;
DROP INDEX IF EXISTS IDX_WEBHOOK_AUDIT_LOG_SUCCESS_AT;

-- ===== 20260728000001_ddl_event_trigger_auto_security_invoker.sql =====
DROP EVENT TRIGGER IF EXISTS TRG_AUTO_SECURITY_INVOKER_ON_DDL;
DROP FUNCTION IF EXISTS zapp.fn_trg_auto_security_invoker();
-- MANUAL:
--   DROP EVENT TRIGGER DROP EVENT TRIGGER IF EXISTS trg_auto_security_invoker_on_ddl — down = re-create (def in git history)

-- ===== 20260728000002_expand_autofix_all_schemas.sql =====
DROP FUNCTION IF EXISTS zapp.fn_autofix_security_invoker();

-- ===== 20260728000003_rate_limit_null_guard_and_bridge_auth.sql =====
DROP FUNCTION IF EXISTS zapp.fn_rate_limit_check(p_identifier     text, p_rpc_name       text, p_max_calls      int, p_window_minutes int);
DROP FUNCTION IF EXISTS public.fn_messages_bridge_insert();
DROP FUNCTION IF EXISTS public.fn_messages_bridge_update();
DROP FUNCTION IF EXISTS public.fn_messages_bridge_delete();

-- ===== 20260728000004_explicit_policies_and_default_privileges.sql =====
-- MANUAL:
--   ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA artes REVOKE ALL ON TABLES FROM PUBLIC — down = reverse alter (manual)
--   ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA artes REVOKE ALL ON TABLES FROM anon — down = reverse alter (manual)
--   ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA artes REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC — down = reverse alter (manual)
--   ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA artes REVOKE EXECUTE ON FUNCTIONS FROM anon — down = reverse alter (manual)
--   ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA financeiro REVOKE ALL ON TABLES FROM PUBLIC — down = reverse alter (manual)
--   ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA financeiro REVOKE ALL ON TABLES FROM anon — down = reverse alter (manual)
--   ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA financeiro REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC — down = reverse alter (manual)
--   ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA financeiro REVOKE EXECUTE ON FUNCTIONS FROM anon — down = reverse alter (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.fn_trg_auto_security_invoker() FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.fn_trg_auto_security_invoker() TO postgres, supabase_admin — down = reverse grant (manual)

-- ===== 20260728000005_security_monitoring_rate_limit_hardening.sql =====
DROP FUNCTION IF EXISTS zapp.fn_rate_limit_check(p_identifier    text, p_rpc_name      text, p_max_calls     integer, p_window_minutes integer);
DROP FUNCTION IF EXISTS zapp.fn_autofix_security_invoker();
DROP FUNCTION IF EXISTS zapp.fn_trg_auto_security_invoker();

-- ===== 20260728000006_pgbouncer_get_auth_search_path_hardening.sql =====
-- MANUAL:
--   ALTER ALTER FUNCTION pgbouncer.get_auth(p_usename text)
  SET search_path = pg_catalog, pg_temp — down = reverse alter (manual)

-- ===== 20260728130001_revoke_anon_usage_financeiro_artes.sql =====
-- MANUAL:
--   PRIV REVOKE USAGE ON SCHEMA financeiro FROM anon — down = reverse grant (manual)
--   PRIV REVOKE USAGE ON SCHEMA artes FROM anon — down = reverse grant (manual)
--   ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA financeiro REVOKE ALL ON TABLES FROM anon — down = reverse alter (manual)
--   ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA financeiro REVOKE ALL ON SEQUENCES FROM anon — down = reverse alter (manual)
--   ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA financeiro REVOKE EXECUTE ON FUNCTIONS FROM anon — down = reverse alter (manual)
--   ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA artes REVOKE ALL ON TABLES FROM anon — down = reverse alter (manual)
--   ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA artes REVOKE EXECUTE ON FUNCTIONS FROM anon — down = reverse alter (manual)

-- ===== 20260729190001_drop_evo_to_zapp_foreign_keys.sql =====

-- ===== 20260729190003_harden_secdef_search_path.sql =====
-- MANUAL:
--   ALTER ALTER FUNCTION public.fn_apply_connection_update(p_event jsonb)
  SET search_path TO zapp, pg_catalo — down = reverse alter (manual)
--   ALTER ALTER FUNCTION public.fn_contacts_proxy_delete()
  SET search_path TO zapp, evo, pg_catalog — down = reverse alter (manual)
--   ALTER ALTER FUNCTION public.fn_contacts_proxy_insert()
  SET search_path TO zapp, evo, pg_catalog — down = reverse alter (manual)
--   ALTER ALTER FUNCTION public.fn_contacts_proxy_update()
  SET search_path TO zapp, evo, pg_catalog — down = reverse alter (manual)
--   ALTER ALTER FUNCTION public.is_instance_paused(p_instance_name text)
  SET search_path TO zapp, pg_catalog — down = reverse alter (manual)
--   ALTER ALTER FUNCTION vendas.handle_new_auth_user()
  SET search_path TO vendas, pg_catalog — down = reverse alter (manual)

-- ===== 20260729190004_reactivate_cron_analytics_log_retention.sql =====
-- MANUAL:
--   DATA UPDATE cron.job
SET active = true
WHERE jobid = 100 AND jobname = 'analytics-log-retention' — down = inverse data op (manual)

-- ===== 20260729190005_harden_secdef_search_path_remaining.sql =====
-- MANUAL:
--   ALTER ALTER FUNCTION archive.fn_refresh_schema_dependency_map() SET search_path TO archive, pg_catalog — down = reverse alter (manual)
--   ALTER ALTER FUNCTION archive.fn_schema_migration_readiness(p_schema text) SET search_path TO archive, pg_c — down = reverse alter (manual)
--   ALTER ALTER FUNCTION evo.sync_contact_intelligence() SET search_path TO zapp, evo — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.adicionar_parcelas(p_id uuid, p_quantidade integer) SET search_path TO fin — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.adicionar_valor_emprestimo(p_id uuid, p_valor numeric, p_data date, p_desc — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.apagar_nota_fiscal(p_nf_id uuid) SET search_path TO financeiro, vendas — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.atualizar_colaborador(p_id uuid, p_nome text, p_cpf text, p_cargo text, p_ — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.atualizar_colaborador(p_id uuid, p_nome text, p_cpf text, p_cargo text, p_ — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.bulk_insert_parcelas(p_payload jsonb) SET search_path TO financeiro — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.bulk_sync_parcelas_planilha(p_payload jsonb) SET search_path TO financeiro — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.bulk_upsert_vendas(p_payload jsonb) SET search_path TO financeiro — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.desfazer_unificacao(p_grupo_id uuid, p_usuario text) SET search_path TO fi — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.empresas_reativadas_ou_novas_hoje() SET search_path TO financeiro, vendas — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.fn_app_role() SET search_path TO financeiro — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.fn_atualizar_timestamp() SET search_path TO financeiro — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.fn_auto_liquidar_emprestimo() SET search_path TO financeiro — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.fn_is_admin() SET search_path TO financeiro — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.fn_is_admin_diretor() SET search_path TO financeiro — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.fn_sync_nf_para_vendas() SET search_path TO financeiro — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.fn_sync_status_ordem() SET search_path TO financeiro, vendas — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.fn_sync_status_ordem_delete() SET search_path TO financeiro, vendas — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.liquidar_parcela(p_id uuid, p_valor numeric, p_desconto_tipo text, p_data_ — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.liquidar_vale(p_id uuid, p_valor numeric, p_data date, p_responsavel text, — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.listar_irmaos_faturaveis(p_pedido_pai text, p_ano integer) SET search_path — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.pagar_parcela_emprestimo(p_id uuid, p_liquidado_por text) SET search_path  — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.prorrogar_parcela(p_id uuid, p_parcela_num integer, p_nova_data date) SET  — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.ranking_vendas_hoje() SET search_path TO financeiro, vendas — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.ranking_vendas_semana() SET search_path TO financeiro, vendas — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.remover_parcelas(p_id uuid, p_quantidade integer) SET search_path TO finan — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.sincronizar_nome_produto_nfs(p_pedido_pai text, p_cod_produto text, p_cor  — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.sync_parcela_planilha(p jsonb) SET search_path TO financeiro — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.unificar_pedidos(p_venda_ids uuid[], p_lider_id uuid, p_usuario text) SET  — down = reverse alter (manual)
--   ALTER ALTER FUNCTION financeiro.vendedores_acima_50k_hoje() SET search_path TO financeiro, vendas — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.auth_session_cleanup(p_keep_last integer, p_min_age_hours integer) SET search_pat — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.check_critical_fks(p_raise boolean) SET search_path TO ops, zapp, evo, email_app, — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.check_host_disk() SET search_path TO ops — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.check_infrastructure() SET search_path TO ops, zapp, evo, extensions — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.check_lovable_parity(p_raise boolean) SET search_path TO ops, zapp, pg_catalog — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.check_marketing_budget() SET search_path TO ops, evo — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.check_mirror_integrity(p_raise boolean) SET search_path TO ops, zapp, pg_catalog — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.check_schema_drift(p_raise boolean) SET search_path TO ops, zapp, pg_catalog — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.check_wal_health() SET search_path TO ops, pg_catalog — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.cloud_parity_report() SET search_path TO ops, pg_catalog — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.fn_alert_consumer_halt() SET search_path TO ops, evo — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.fn_analytics_log_retention(p_days integer) SET search_path TO ops, pg_catalog — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.fn_auth_session_overflow_alert() SET search_path TO auth, ops, pg_catalog — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.fn_auto_update_backup_sentinel() SET search_path TO ops, pg_catalog — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.fn_catalog_sanity_check() SET search_path TO ops, pg_catalog — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.fn_check_cron_health() SET search_path TO ops, pg_catalog, cron — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.fn_check_wal_slots() SET search_path TO ops — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.fn_dashboard() SET search_path TO ops, evo, zapp — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.fn_ddl_audit_drop() SET search_path TO ops, pg_catalog — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.fn_ddl_audit_log() SET search_path TO ops, pg_catalog — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.fn_ddl_drop_alert() SET search_path TO ops, evo, pg_catalog — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.fn_ddl_weekly_summary() SET search_path TO ops, evo, zapp — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.fn_guardrails_check() SET search_path TO ops, evo, zapp — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.fn_monitor_ingestion_persistence_gap(p_window interval, p_min_upserts integer, p_ — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.fn_notify_critical_alerts() SET search_path TO ops, evo — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.fn_payload_retention(p_days integer, p_dry_run boolean) SET search_path TO ops, e — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.fn_performance_report() SET search_path TO ops, zapp, evo, extensions — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.fn_regression_tests() SET search_path TO ops, pg_catalog — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.fn_regression_tests_backup_check() SET search_path TO ops, zapp — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.fn_update_backup_sentinel(p_file text, p_size_bytes bigint, p_table_count integer — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.fn_verify_alert_delivery(p_lookback interval, p_max_attempts integer, p_grace int — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.ingest_host_disk(p_used_pct integer, p_used_h text, p_avail_h text, p_total_h tex — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.run_all_checks() SET search_path TO ops, pg_catalog, evo, zapp, cron, monitoring, — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.sim_disk_alert_e2e() SET search_path TO ops — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.sim_disk_guard() SET search_path TO ops — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.sim_forensic_battery() SET search_path TO ops, evo — down = reverse alter (manual)
--   ALTER ALTER FUNCTION ops.sim_wa_budget_guard() SET search_path TO ops, evo — down = reverse alter (manual)
--   ALTER ALTER FUNCTION public.check_user_permission(p_permission_name text) SET search_path TO zapp, pg_cata — down = reverse alter (manual)
--   ALTER ALTER FUNCTION public.generate_transfer_ticket() SET search_path TO zapp, pg_catalog — down = reverse alter (manual)
--   ALTER ALTER FUNCTION public.get_contact_intelligence_by_phone(p_phone text) SET search_path TO zapp — down = reverse alter (manual)
--   ALTER ALTER FUNCTION public.handle_new_user_settings() SET search_path TO zapp, pg_catalog — down = reverse alter (manual)
--   ALTER ALTER FUNCTION public.increment_webhook_rate_limit(p_instance_id text, p_event_type text, p_window_s — down = reverse alter (manual)
--   ALTER ALTER FUNCTION public.is_queue_member_of_contact(_contact_id uuid, _user_id uuid) SET search_path TO — down = reverse alter (manual)
--   ALTER ALTER FUNCTION public.log_rls_denied(p_resource text, p_required_role text, p_context jsonb) SET sea — down = reverse alter (manual)
--   ALTER ALTER FUNCTION public.on_role_change() SET search_path TO zapp, pg_catalog — down = reverse alter (manual)
--   ALTER ALTER FUNCTION public.purge_old_query_telemetry(p_days integer) SET search_path TO zapp, pg_catalog — down = reverse alter (manual)
--   ALTER ALTER FUNCTION public.rpc_email_cleanup_old_events(p_retention_days integer) SET search_path TO zapp — down = reverse alter (manual)
--   ALTER ALTER FUNCTION public.rpc_get_contact(p_contact_id uuid) SET search_path TO evo — down = reverse alter (manual)
--   ALTER ALTER FUNCTION public.rpc_get_contact(p_remote_jid text, p_instance text) SET search_path TO evo — down = reverse alter (manual)
--   ALTER ALTER FUNCTION public.trg_fn_set_transfer_ticket() SET search_path TO zapp, pg_catalog — down = reverse alter (manual)
--   ALTER ALTER FUNCTION vendas.aplicar_envio_cotacao(p_cotacao_id uuid, p_enviado_por_email text, p_enviado_p — down = reverse alter (manual)
--   ALTER ALTER FUNCTION vendas.eh_admin() SET search_path TO vendas, auth, extensions — down = reverse alter (manual)
--   ALTER ALTER FUNCTION vendas.fn_listar_bling_tokens() SET search_path TO financeiro — down = reverse alter (manual)
--   ALTER ALTER FUNCTION vendas.fn_listar_produtos_para_ia_ncm(p_limit integer) SET search_path TO vendas — down = reverse alter (manual)
--   ALTER ALTER FUNCTION vendas.fn_propagar_ncm_para_ordens_compra() SET search_path TO vendas — down = reverse alter (manual)
--   ALTER ALTER FUNCTION vendas.fn_registrar_ncm_descoberto(p_cod_produto text, p_ncm text, p_nome_produto tex — down = reverse alter (manual)
--   ALTER ALTER FUNCTION vendas.fn_trg_ncm_auto() SET search_path TO vendas — down = reverse alter (manual)
--   ALTER ALTER FUNCTION vendas.fn_trg_ncm_enqueue_n8n() SET search_path TO vendas, net — down = reverse alter (manual)
--   ALTER ALTER FUNCTION vendas.registrar_acesso() SET search_path TO vendas, auth, extensions — down = reverse alter (manual)
--   ALTER ALTER FUNCTION vendas.resetar_envios_pedido(p_pedido_pai text) SET search_path TO vendas — down = reverse alter (manual)
--   ALTER ALTER FUNCTION zapp.fn_evolution_status_unknown(p_instance_name text) SET search_path TO zapp — down = reverse alter (manual)
--   ALTER ALTER FUNCTION zapp.fn_messages_instead_of_insert() SET search_path TO zapp, evo — down = reverse alter (manual)
--   ALTER ALTER FUNCTION zapp.fn_messages_view_insert_handler() SET search_path TO zapp, evo — down = reverse alter (manual)
--   ALTER ALTER FUNCTION zapp.fn_process_whatsapp_message(p_payload jsonb, p_instance text) SET search_path TO — down = reverse alter (manual)
--   ALTER ALTER FUNCTION zapp.fn_refresh_role_permissions_mv() SET search_path TO zapp — down = reverse alter (manual)
--   ALTER ALTER FUNCTION zapp.get_connection_id_for_instance(p_instance text) SET search_path TO zapp — down = reverse alter (manual)
--   ALTER ALTER FUNCTION zapp.get_contact_intelligence_by_phone(p_phone text) SET search_path TO zapp, evo, au — down = reverse alter (manual)
--   ALTER ALTER FUNCTION zapp.get_default_workspace_id() SET search_path TO zapp — down = reverse alter (manual)
--   ALTER ALTER FUNCTION zapp.is_feature_enabled(p_flag_key text, p_user_id uuid, p_user_role text) SET search — down = reverse alter (manual)
--   ALTER ALTER FUNCTION zapp.populate_contact_intelligence_batch(p_batch_size integer, p_offset integer) SET  — down = reverse alter (manual)
--   ALTER ALTER FUNCTION zapp.rpc_bulk_repair_dedup_hashes(p_instance_name text, p_batch_size integer, p_dry_r — down = reverse alter (manual)
--   ALTER ALTER FUNCTION zapp.trg_fn_refresh_role_permissions_mv() SET search_path TO zapp — down = reverse alter (manual)
--   ALTER ALTER FUNCTION zapp.upsert_contact_intelligence(p_contact_id uuid) SET search_path TO zapp, evo — down = reverse alter (manual)

-- ===== 20260729190006_harden_secdef_artes_monitoring.sql =====
-- MANUAL:
--   ALTER ALTER FUNCTION artes.listar_pedidos_novos(text)
  SET search_path TO vendas, artes — down = reverse alter (manual)
--   ALTER ALTER FUNCTION artes.notificar_bitrix_novo_pedido()
  SET search_path TO artes, net — down = reverse alter (manual)
--   ALTER ALTER FUNCTION artes.garantir_auth_tokens_nao_null()
  SET search_path TO artes, auth, extensions — down = reverse alter (manual)
--   ALTER ALTER FUNCTION artes.notificar_bitrix_fechamento_concluido()
  SET search_path TO artes, net — down = reverse alter (manual)
--   ALTER ALTER FUNCTION artes.salvar_fechamento_completo(jsonb, uuid)
  SET search_path TO artes, vendas — down = reverse alter (manual)
--   ALTER ALTER FUNCTION monitoring.fn_integration_health(jsonb)
  SET search_path TO monitoring, evo, zapp — down = reverse alter (manual)
--   ALTER ALTER FUNCTION monitoring.fn_migration_readiness_check()
  SET search_path TO monitoring, evo — down = reverse alter (manual)

-- ===== 20260730000000_baseline_schema.sql =====

-- ===== 20260730120000_r25_fix_rt05_rt21_fk_and_timeout.sql =====
-- MANUAL:
--   ALTER ALTER ROLE postgres      SET idle_in_transaction_session_timeout = '60s' — down = reverse alter (manual)
--   ALTER ALTER ROLE authenticated SET idle_in_transaction_session_timeout = '60s' — down = reverse alter (manual)
--   ALTER ALTER ROLE service_role  SET idle_in_transaction_session_timeout = '300s' — down = reverse alter (manual)

-- ===== 20260730130000_batch_rpcs_bootstrap_dashboard.sql =====
DROP FUNCTION IF EXISTS public.rpc_app_bootstrap();
DROP FUNCTION IF EXISTS public.rpc_dashboard_init(p_agent_id  uuid, p_queue_id  uuid, p_date_from timestamptz, p_date_to   timestamptz);
-- MANUAL:
--   PRIV REVOKE EXECUTE ON FUNCTION public.rpc_app_bootstrap() FROM PUBLIC — down = reverse grant (manual)
--   PRIV GRANT EXECUTE ON FUNCTION public.rpc_app_bootstrap() TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION public.rpc_dashboard_init(uuid,uuid,timestamptz,timestamptz) FROM PUBLIC — down = reverse grant (manual)
--   PRIV GRANT EXECUTE ON FUNCTION public.rpc_dashboard_init(uuid,uuid,timestamptz,timestamptz) TO authentica — down = reverse grant (manual)

-- ===== 20260730140000_batch_rpcs_v2_canonical_fixes.sql =====
DROP FUNCTION IF EXISTS public.rpc_app_bootstrap();
DROP FUNCTION IF EXISTS public.rpc_dashboard_init(p_agent_id  uuid, p_queue_id  uuid, p_date_from timestamptz, p_date_to   timestamptz);
-- MANUAL:
--   PRIV REVOKE EXECUTE ON FUNCTION public.rpc_app_bootstrap() FROM PUBLIC — down = reverse grant (manual)
--   PRIV GRANT  EXECUTE ON FUNCTION public.rpc_app_bootstrap() TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION public.rpc_dashboard_init(uuid,uuid,timestamptz,timestamptz) FROM PUBLIC — down = reverse grant (manual)
--   PRIV GRANT  EXECUTE ON FUNCTION public.rpc_dashboard_init(uuid,uuid,timestamptz,timestamptz) TO authentic — down = reverse grant (manual)

-- ===== 20260730150000_perf_notifications_partial_index.sql =====
DROP INDEX IF EXISTS IDX_APP_NOTIFICATIONS_USER_UNREAD;

-- ===== 20260731000001_e06_assert_realtime_publication.sql =====

-- ===== 20260731000002_e08_rls_impact_preview_view.sql =====
DROP VIEW IF EXISTS ZAPP.V_RLS_IMPACT_PREVIEW;
DROP FUNCTION IF EXISTS zapp.fn_count_total_rows(p_schema text, p_table text);
-- MANUAL:
--   PRIV REVOKE ALL ON FUNCTION zapp.fn_count_total_rows(text, text) FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.fn_count_total_rows(text, text) TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE ALL ON zapp.v_rls_impact_preview FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT SELECT ON zapp.v_rls_impact_preview TO authenticated — down = reverse grant (manual)

-- ===== 20260731000003_e09_revoke_excessive_privileges.sql =====
-- MANUAL:
--   ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA zapp
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authen — down = reverse alter (manual)
--   ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA zapp
  REVOKE ALL ON TABLES FROM anon — down = reverse alter (manual)
--   ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA zapp
  REVOKE ALL ON SEQUENCES FROM anon — down = reverse alter (manual)
--   ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA evo
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authent — down = reverse alter (manual)
--   ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA evo
  REVOKE ALL ON TABLES FROM anon — down = reverse alter (manual)
--   ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA bpm
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authent — down = reverse alter (manual)
--   ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA bpm
  REVOKE ALL ON TABLES FROM anon — down = reverse alter (manual)
--   ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA email_app
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM a — down = reverse alter (manual)
--   ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA email_app
  REVOKE ALL ON TABLES FROM anon — down = reverse alter (manual)
--   ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA financeiro
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM  — down = reverse alter (manual)
--   ALTER ALTER DEFAULT PRIVILEGES IN SCHEMA financeiro
  REVOKE ALL ON TABLES FROM anon — down = reverse alter (manual)

-- ===== 20260731000004_e10_anon_hardening.sql =====

-- ===== 20260801000001_p0_prevent_privilege_escalation.sql =====
DROP TRIGGER IF EXISTS ON_PROFILE_UPDATE_PREVENT_ESCALATION ON ZAPP.PROFILES;
-- MANUAL:
--   DROP TRIGGER DROP TRIGGER IF EXISTS on_profile_update_prevent_escalation ON zapp.profiles — down = re-create (def in git history)

-- ===== 20260801000002_p0_rls_security_tables.sql =====
DROP POLICY IF EXISTS AUDIT_LOGS_ADMIN_SELECT ON ZAPP.AUDIT_LOGS;
DROP POLICY IF EXISTS AUDIT_LOGS_SELF_SELECT ON ZAPP.AUDIT_LOGS;
DROP POLICY IF EXISTS BLOCKED_IPS_ADMIN_SELECT ON ZAPP.BLOCKED_IPS;
DROP POLICY IF EXISTS IP_WHITELIST_ADMIN_SELECT ON ZAPP.IP_WHITELIST;
DROP POLICY IF EXISTS LOGIN_ATTEMPTS_ADMIN_SELECT ON ZAPP.LOGIN_ATTEMPTS;
DROP POLICY IF EXISTS QUERY_TELEMETRY_ADMIN_SELECT ON ZAPP.QUERY_TELEMETRY;
DROP POLICY IF EXISTS RATE_LIMIT_CONFIGS_ADMIN_SELECT ON ZAPP.RATE_LIMIT_CONFIGS;
DROP POLICY IF EXISTS RATE_LIMIT_LOGS_ADMIN_SELECT ON ZAPP.RATE_LIMIT_LOGS;
DROP POLICY IF EXISTS RATE_LIMIT_LOGS_SELF_SELECT ON ZAPP.RATE_LIMIT_LOGS;
DROP POLICY IF EXISTS SECURITY_ALERTS_ADMIN_SELECT ON ZAPP.SECURITY_ALERTS;
DROP POLICY IF EXISTS SECURITY_ALERTS_SELF_SELECT ON ZAPP.SECURITY_ALERTS;
DROP POLICY IF EXISTS USER_DEVICES_SELF ON ZAPP.USER_DEVICES;
DROP POLICY IF EXISTS USER_DEVICES_ADMIN_SELECT ON ZAPP.USER_DEVICES;
DROP POLICY IF EXISTS USER_DEVICES_SELF_INSERT ON ZAPP.USER_DEVICES;
DROP POLICY IF EXISTS USER_DEVICES_SELF_UPDATE ON ZAPP.USER_DEVICES;
DROP POLICY IF EXISTS USER_SESSIONS_SELF ON ZAPP.USER_SESSIONS;
DROP POLICY IF EXISTS USER_SESSIONS_ADMIN_SELECT ON ZAPP.USER_SESSIONS;
DROP POLICY IF EXISTS USER_SESSIONS_SELF_INSERT ON ZAPP.USER_SESSIONS;
DROP POLICY IF EXISTS USER_SESSIONS_SELF_UPDATE ON ZAPP.USER_SESSIONS;
-- MANUAL:
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.audit_logs — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.blocked_ips — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.ip_whitelist — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_rls ON zapp.login_attempts — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_rls ON zapp.query_telemetry — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.rate_limit_configs — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.rate_limit_logs — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.security_alerts — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.user_devices — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.user_sessions — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_rw ON zapp.webauthn_challenges — down = re-create (def in git history)

-- ===== 20260801010002_warroom_alert_type_enum.sql =====
DROP VIEW IF EXISTS PUBLIC.WARROOM_ALERTS;
DROP TABLE IF EXISTS ZAPP._WARROOM_ALERTS_BACKUP_20260801;
-- MANUAL:
--   DROP VIEW DROP VIEW public.warroom_alerts — down = re-create (def in git history)
--   PRIV GRANT SELECT, INSERT, UPDATE, DELETE ON public.warroom_alerts TO authenticated — down = reverse grant (manual)
--   PRIV GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.warroom_alerts TO serv — down = reverse grant (manual)

-- ===== 20260801010003_p23_p26_omissions_decision.sql =====

-- ===== 20260801010004_unique_constraints.sql =====
ALTER TABLE IF EXISTS ZAPP.CONVERSATION_MEMORY DROP CONSTRAINT IF EXISTS UQ_CONVERSATION_MEMORY_CONTACT;
ALTER TABLE IF EXISTS ZAPP.PERMISSIONS DROP CONSTRAINT IF EXISTS UQ_PERMISSIONS_NAME;
ALTER TABLE IF EXISTS ZAPP.TAGS DROP CONSTRAINT IF EXISTS UQ_TAGS_NAME;
ALTER TABLE IF EXISTS ZAPP.TALKX_BLACKLIST DROP CONSTRAINT IF EXISTS UQ_TALKX_BLACKLIST_CONTACT;
ALTER TABLE IF EXISTS ZAPP.CONVERSATION_MEMORY DROP CONSTRAINT IF EXISTS UQ_CONVERSATION_MEMORY_CONTACT;
ALTER TABLE IF EXISTS ZAPP.PERMISSIONS DROP CONSTRAINT IF EXISTS UQ_PERMISSIONS_NAME;
ALTER TABLE IF EXISTS ZAPP.TAGS DROP CONSTRAINT IF EXISTS UQ_TAGS_NAME;
ALTER TABLE IF EXISTS ZAPP.TALKX_BLACKLIST DROP CONSTRAINT IF EXISTS UQ_TALKX_BLACKLIST_CONTACT;
DROP INDEX IF EXISTS UQ_CONVERSATION_MEMORY_CONTACT;
DROP INDEX IF EXISTS UQ_PERMISSIONS_NAME;
DROP INDEX IF EXISTS UQ_TAGS_NAME;
DROP INDEX IF EXISTS UQ_TALKX_BLACKLIST_CONTACT;

-- ===== 20260801010005_archive_cutover_backups.sql =====

-- ===== 20260801020001_merge_duplicate_contacts.sql =====
DROP TABLE IF EXISTS EVO._EVOLUTION_CONTACTS_BACKUP_20260801;
DROP TABLE IF EXISTS ZAPP._CONTACT_MERGE_MAP_20260801;
-- MANUAL:
--   DATA INSERT INTO zapp._contact_merge_map_20260801 (survivor_id, merged_id, phone_number, instance_name)
W — down = inverse data op (manual)
--   DATA INSERT INTO zapp.contact_id_graveyard (deleted_contact_id, original_workspace_id, deleted_at, expira — down = inverse data op (manual)
--   DATA DELETE FROM evo.evolution_contacts c USING zapp._contact_merge_map_20260801 m WHERE c.id = m.merged_ — down = inverse data op (manual)

-- ===== 20260801020002_unique_contact_phone_instance.sql =====
ALTER TABLE IF EXISTS EVO.EVOLUTION_CONTACTS DROP CONSTRAINT IF EXISTS UQ_EVOLUTION_CONTACTS_PHONE_INSTANCE;
ALTER TABLE IF EXISTS EVO.EVOLUTION_CONTACTS DROP CONSTRAINT IF EXISTS UQ_EVOLUTION_CONTACTS_PHONE_INSTANCE;
DROP INDEX IF EXISTS UQ_EVOLUTION_CONTACTS_PHONE_INSTANCE;

-- ===== 20260801040001_rls_lote1_conversas.sql =====
DROP POLICY IF EXISTS CONV_ANALYSES_SELECT ON ZAPP.CONVERSATION_ANALYSES;
DROP POLICY IF EXISTS CONV_CLOSURES_SELECT ON ZAPP.CONVERSATION_CLOSURES;
DROP POLICY IF EXISTS CONV_EVENTS_SELECT ON ZAPP.CONVERSATION_EVENTS;
DROP POLICY IF EXISTS CONV_MEMORY_SELECT ON ZAPP.CONVERSATION_MEMORY;
DROP POLICY IF EXISTS CONV_SLA_SELECT ON ZAPP.CONVERSATION_SLA;
DROP POLICY IF EXISTS CONV_SNOOZES_SELECT ON ZAPP.CONVERSATION_SNOOZES;
DROP POLICY IF EXISTS CONV_TASKS_SELECT ON ZAPP.CONVERSATION_TASKS;
DROP POLICY IF EXISTS CONV_TASKS_UPDATE ON ZAPP.CONVERSATION_TASKS;
DROP POLICY IF EXISTS CONV_TRANSFERS_SELECT ON ZAPP.CONVERSATION_TRANSFERS;
DROP POLICY IF EXISTS TRANSFER_COMMENTS_SELECT ON ZAPP.TRANSFER_COMMENTS;
DROP POLICY IF EXISTS WHISPER_MESSAGES_SELECT ON ZAPP.WHISPER_MESSAGES;
-- MANUAL:
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.conversation_analyses — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.conversation_closures — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.conversation_events — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.conversation_memory — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.conversation_sla — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.conversation_tasks — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS authenticated_read_only ON zapp.conversation_transfers — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS authenticated_read_only ON zapp.transfer_comments — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.conversation_snoozes — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.whisper_messages — down = re-create (def in git history)

-- ===== 20260801040002_rls_lote2_contatos.sql =====
DROP POLICY IF EXISTS CONTACT_FIELDS_SELECT ON ZAPP.CONTACT_CUSTOM_FIELDS;
DROP POLICY IF EXISTS CONTACT_NOTES_SELECT ON ZAPP.CONTACT_NOTES;
DROP POLICY IF EXISTS CONTACT_NOTES_INSERT ON ZAPP.CONTACT_NOTES;
DROP POLICY IF EXISTS CONTACT_PURCHASES_SELECT ON ZAPP.CONTACT_PURCHASES;
DROP POLICY IF EXISTS CONTACT_TAGS_SELECT ON ZAPP.CONTACT_TAGS;
DROP POLICY IF EXISTS FAVORITE_CONTACTS_SELECT ON ZAPP.FAVORITE_CONTACTS;
DROP POLICY IF EXISTS FAVORITE_CONTACTS_INSERT ON ZAPP.FAVORITE_CONTACTS;
DROP POLICY IF EXISTS FAVORITE_CONTACTS_DELETE ON ZAPP.FAVORITE_CONTACTS;
DROP POLICY IF EXISTS PINNED_CONVERSATIONS_SELECT ON ZAPP.PINNED_CONVERSATIONS;
DROP POLICY IF EXISTS SICOOB_MAPPING_SELECT ON ZAPP.SICOOB_CONTACT_MAPPING;
-- MANUAL:
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.contact_custom_fields — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.contact_notes — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.contact_purchases — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.contact_tags — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.favorite_contacts — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.pinned_conversations — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.sicoob_contact_mapping — down = re-create (def in git history)

-- ===== 20260801040003_rls_lote3_time_usuario.sql =====
DROP POLICY IF EXISTS USER_SETTINGS_SELECT ON ZAPP.USER_SETTINGS;
DROP POLICY IF EXISTS USER_SETTINGS_WRITE ON ZAPP.USER_SETTINGS;
DROP POLICY IF EXISTS SAVED_FILTERS_SELECT ON ZAPP.SAVED_FILTERS;
DROP POLICY IF EXISTS SAVED_FILTERS_WRITE ON ZAPP.SAVED_FILTERS;
DROP POLICY IF EXISTS NOTIFICATIONS_SELECT ON ZAPP.NOTIFICATIONS;
DROP POLICY IF EXISTS USER_ROLES_SELECT ON ZAPP.USER_ROLES;
DROP POLICY IF EXISTS USER_ROLES_ADMIN_WRITE ON ZAPP.USER_ROLES;
DROP POLICY IF EXISTS TEAM_CONVERSATIONS_SELECT ON ZAPP.TEAM_CONVERSATIONS;
DROP POLICY IF EXISTS TEAM_MEMBERS_SELECT ON ZAPP.TEAM_CONVERSATION_MEMBERS;
DROP POLICY IF EXISTS TEAM_MESSAGES_SELECT ON ZAPP.TEAM_MESSAGES;
DROP POLICY IF EXISTS TEAM_RECEIPTS_SELECT ON ZAPP.TEAM_MESSAGE_RECEIPTS;
-- MANUAL:
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.user_settings — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.saved_filters — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.notifications — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.user_roles — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.team_conversations — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.team_conversation_members — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.team_messages — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.team_message_receipts — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_notifications_access ON zapp.notifications — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS user_roles_select_authenticated ON zapp.user_roles — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS user_settings_select ON zapp.user_settings — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS user_settings_write ON zapp.user_settings — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS saved_filters_select ON zapp.saved_filters — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS saved_filters_write ON zapp.saved_filters — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS notifications_select ON zapp.notifications — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS user_roles_select ON zapp.user_roles — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS user_roles_admin_write ON zapp.user_roles — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS team_conversations_select ON zapp.team_conversations — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS team_members_select ON zapp.team_conversation_members — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS team_messages_select ON zapp.team_messages — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS team_receipts_select ON zapp.team_message_receipts — down = re-create (def in git history)

-- ===== 20260801040004_rls_lote4_campanhas.sql =====
DROP POLICY IF EXISTS CAMPAIGNS_SELECT ON ZAPP.CAMPAIGNS;
DROP POLICY IF EXISTS CAMPAIGNS_ADMIN_WRITE ON ZAPP.CAMPAIGNS;
DROP POLICY IF EXISTS CAMPAIGN_CONTACTS_SELECT ON ZAPP.CAMPAIGN_CONTACTS;
DROP POLICY IF EXISTS CAMPAIGN_AB_SELECT ON ZAPP.CAMPAIGN_AB_VARIANTS;
DROP POLICY IF EXISTS TALKX_CAMPAIGNS_SELECT ON ZAPP.TALKX_CAMPAIGNS;
DROP POLICY IF EXISTS TALKX_RECIPIENTS_SELECT ON ZAPP.TALKX_RECIPIENTS;
DROP POLICY IF EXISTS TALKX_BLACKLIST_SELECT ON ZAPP.TALKX_BLACKLIST;
DROP POLICY IF EXISTS SCHEDULED_MESSAGES_SELECT ON ZAPP.SCHEDULED_MESSAGES;
DROP POLICY IF EXISTS SCHEDULED_REPORTS_SELECT ON ZAPP.SCHEDULED_REPORTS;
DROP POLICY IF EXISTS SCHEDULED_REPORT_CONFIGS_SELECT ON ZAPP.SCHEDULED_REPORT_CONFIGS;
-- MANUAL:
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.campaigns — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.campaign_contacts — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.campaign_ab_variants — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.talkx_campaigns — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.talkx_recipients — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.talkx_blacklist — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.scheduled_messages — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.scheduled_reports — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.scheduled_report_configs — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS campaigns_select ON zapp.campaigns — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS campaigns_admin_write ON zapp.campaigns — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS campaign_contacts_select ON zapp.campaign_contacts — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS campaign_ab_select ON zapp.campaign_ab_variants — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS talkx_campaigns_select ON zapp.talkx_campaigns — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS talkx_recipients_select ON zapp.talkx_recipients — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS talkx_blacklist_select ON zapp.talkx_blacklist — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS scheduled_messages_select ON zapp.scheduled_messages — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS scheduled_reports_select ON zapp.scheduled_reports — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS scheduled_report_configs_select ON zapp.scheduled_report_configs — down = re-create (def in git history)

-- ===== 20260801040005_rls_lote5_config_filas.sql =====
DROP POLICY IF EXISTS QUEUES_SELECT ON ZAPP.QUEUES;
DROP POLICY IF EXISTS QUEUES_ADMIN_WRITE ON ZAPP.QUEUES;
DROP POLICY IF EXISTS QUEUE_MEMBERS_SELECT ON ZAPP.QUEUE_MEMBERS;
DROP POLICY IF EXISTS QUEUE_MEMBERS_ADMIN_WRITE ON ZAPP.QUEUE_MEMBERS;
DROP POLICY IF EXISTS QUEUE_GOALS_SELECT ON ZAPP.QUEUE_GOALS;
DROP POLICY IF EXISTS QUEUE_GOALS_ADMIN_WRITE ON ZAPP.QUEUE_GOALS;
DROP POLICY IF EXISTS QUEUE_POSITIONS_SELECT ON ZAPP.QUEUE_POSITIONS;
DROP POLICY IF EXISTS WHATSAPP_CONNECTIONS_SELECT ON ZAPP.WHATSAPP_CONNECTIONS;
DROP POLICY IF EXISTS WHATSAPP_CONNECTIONS_ADMIN_WRITE ON ZAPP.WHATSAPP_CONNECTIONS;
DROP POLICY IF EXISTS DEPARTMENTS_SELECT ON ZAPP.DEPARTMENTS;
DROP POLICY IF EXISTS DEPARTMENTS_ADMIN_WRITE ON ZAPP.DEPARTMENTS;
DROP POLICY IF EXISTS DEPARTMENT_INVITATIONS_SELECT ON ZAPP.DEPARTMENT_INVITATIONS;
DROP POLICY IF EXISTS DEPARTMENT_INVITATIONS_ADMIN_WRITE ON ZAPP.DEPARTMENT_INVITATIONS;
DROP POLICY IF EXISTS SLA_RULES_SELECT ON ZAPP.SLA_RULES;
DROP POLICY IF EXISTS SLA_RULES_ADMIN_WRITE ON ZAPP.SLA_RULES;
DROP POLICY IF EXISTS GLOBAL_SETTINGS_SELECT ON ZAPP.GLOBAL_SETTINGS;
DROP POLICY IF EXISTS GLOBAL_SETTINGS_ADMIN_WRITE ON ZAPP.GLOBAL_SETTINGS;
-- MANUAL:
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.queues — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.queue_members — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.queue_goals — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.queue_positions — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.whatsapp_connections — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.departments — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.department_invitations — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.sla_rules — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS auth_full_access ON zapp.global_settings — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS queues_select ON zapp.queues — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS queues_admin_write ON zapp.queues — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS queue_members_select ON zapp.queue_members — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS queue_goals_select ON zapp.queue_goals — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS queue_positions_select ON zapp.queue_positions — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS whatsapp_connections_select ON zapp.whatsapp_connections — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS departments_select ON zapp.departments — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS department_invitations_select ON zapp.department_invitations — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS sla_rules_select ON zapp.sla_rules — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS global_settings_select ON zapp.global_settings — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS global_settings_admin_write ON zapp.global_settings — down = re-create (def in git history)

-- ===== 20260801040006_feature_flags_anon_public.sql =====
DROP POLICY IF EXISTS FEATURE_FLAGS_ANON_PUBLIC ON ZAPP.FEATURE_FLAGS;
ALTER TABLE IF EXISTS ZAPP.FEATURE_FLAGS DROP COLUMN IF EXISTS IS_PUBLIC;
-- MANUAL:
--   DROP POLICY DROP POLICY IF EXISTS "Anon can read flags" ON zapp.feature_flags — down = re-create (def in git history)

-- ===== 20260801050001_blindar_triggers_auth_artes.sql =====
DROP FUNCTION IF EXISTS artes.handle_new_auth_user();
DROP FUNCTION IF EXISTS artes.garantir_auth_tokens_nao_null();
DROP TABLE IF EXISTS OPS.TRIGGER_ERROR_LOG;

-- ===== 20260801050002_webhook_logs_retention.sql =====
DROP FUNCTION IF EXISTS zapp.purge_webhook_logs();
DROP TABLE IF EXISTS OPS.MAINTENANCE_LOG;
-- MANUAL:
--   PRIV REVOKE ALL ON FUNCTION zapp.purge_webhook_logs() FROM PUBLIC, anon, authenticated — down = reverse grant (manual)

-- ===== 20260801050003_triagem_security_definer.sql =====

-- ===== 20260801060001_buckets_privados_lgpd.sql =====
-- MANUAL:
--   DROP TRIGGER DROP TRIGGER IF EXISTS trg_enforce_whatsapp_media_public ON storage.objects — down = re-create (def in git history)
--   DROP FUNCTION DROP FUNCTION IF EXISTS storage.fn_enforce_public_buckets CASCADE — down = re-create (def in git history)
--   DATA UPDATE storage.buckets SET public = false WHERE name IN ('whatsapp-media', 'audio-messages') — down = inverse data op (manual)

-- ===== 20260801060002_authoritative_time_fix.sql =====
-- MANUAL:
--   DATA INSERT INTO zapp._authoritative_time (id, server_time)
VALUES (1, NOW())
ON CONFLICT (id) DO UPDATE  — down = inverse data op (manual)

-- ===== 20260801140000_rls_gaps_validador_exaustivo.sql =====
DROP POLICY IF EXISTS AUTH_SECURE_133 ON EMAIL_APP.META_CAPI_EVENTS;
DROP POLICY IF EXISTS AUTH_SECURE_134 ON ZAPP.QUEUES;
DROP POLICY IF EXISTS AUTH_SECURE_135 ON ZAPP.PROFILES;
DROP POLICY IF EXISTS AUTH_SECURE_123 ON ZAPP.WHATSAPP_CONNECTIONS;
DROP POLICY IF EXISTS AUTH_SECURE_136 ON ZAPP.SESSIONS;
DROP POLICY IF EXISTS AUTH_SECURE_137 ON ZAPP.WEBHOOK_ENDPOINTS;
DROP POLICY IF EXISTS AUTH_SECURE_138 ON ZAPP.WEBHOOK_EVENTS;
DROP POLICY IF EXISTS AUTH_SECURE_139 ON ZAPP.DEAD_LETTER_QUEUE;
DROP POLICY IF EXISTS AUTH_SECURE_140 ON ZAPP.MESSAGE_QUEUE;
DROP POLICY IF EXISTS AUTH_SECURE_141 ON ZAPP.FORENSIC_SNAPSHOTS;
DROP POLICY IF EXISTS AUTH_SECURE_142 ON ZAPP.QUEUE_ITEMS;
DROP POLICY IF EXISTS AUTH_SECURE_143 ON ZAPP.SEARCH_INSIGHTS;
DROP POLICY IF EXISTS AUTH_SECURE_144 ON ZAPP.COLABORADORES;
DROP POLICY IF EXISTS AUTH_SECURE_145 ON ZAPP.EMPRESAS;
-- MANUAL:
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON email_app.meta_capi_events — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "system_connections_read_authenticated" ON zapp.system_connections — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "stickers_select_all" ON zapp.stickers — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "authenticated_write_queues" ON zapp.queues — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "q_modify" ON zapp.queues — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "Authenticated read sessions" ON zapp.provider_sessions — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "authenticated_read_profiles" ON zapp.profiles — down = re-create (def in git history)
--   PRIV REVOKE DELETE ON zapp.profiles FROM authenticated — down = reverse grant (manual)
--   DROP POLICY DROP POLICY IF EXISTS auth_secure_123 ON zapp.whatsapp_connections — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_access" ON zapp.sessions — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_access" ON zapp.webhook_endpoints — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.webhook_events — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.dead_letter_queue — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_rw" ON zapp.message_queue — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.forensic_snapshots — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.queue_items — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_select_search_insights" ON zapp.search_insights — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.colaboradores — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "empresas_select" ON zapp.empresas — down = re-create (def in git history)

-- ===== 20260801141500_r25_p0_fix_rls_exec_grants.sql =====
-- MANUAL:
--   PRIV GRANT EXECUTE ON FUNCTION zapp.current_user_is_privileged() TO authenticated — down = reverse grant (manual)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.is_admin_painel()            TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.current_user_is_privileged() FROM anon — down = reverse grant (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.is_admin_painel()            FROM anon — down = reverse grant (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.current_user_is_privileged() FROM PUBLIC — down = reverse grant (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.is_admin_painel()            FROM PUBLIC — down = reverse grant (manual)

-- ===== 20260801150000_r25_p1_cron_health_fixes.sql =====
DROP FUNCTION IF EXISTS zapp.fn_archive_old_wpp2_messages(p_months_old integer, p_batch_size integer);
DROP FUNCTION IF EXISTS ops.fn_analytics_log_retention(p_days integer);
ALTER TABLE IF EXISTS EVO.EVOLUTION_MESSAGES_WPP2_ARCHIVE DROP COLUMN IF EXISTS REPLY_TO_ID;
ALTER TABLE IF EXISTS EVO.EVOLUTION_MESSAGES_WPP2_ARCHIVE DROP COLUMN IF EXISTS MEDIA_BUCKET;
ALTER TABLE IF EXISTS EVO.EVOLUTION_MESSAGES_WPP2_ARCHIVE DROP COLUMN IF EXISTS MEDIA_PATH;
ALTER TABLE IF EXISTS EVO.EVOLUTION_MESSAGES_WPP2_ARCHIVE DROP COLUMN IF EXISTS MEDIA_SHA256;
ALTER TABLE IF EXISTS EVO.EVOLUTION_MESSAGES_WPP2_ARCHIVE DROP COLUMN IF EXISTS MEDIA_STATUS;
ALTER TABLE IF EXISTS EVO.EVOLUTION_MESSAGES_WPP2_ARCHIVE DROP COLUMN IF EXISTS TRANSCRIPTION_STATUS;
ALTER TABLE IF EXISTS EVO.EVOLUTION_MESSAGES_WPP2_ARCHIVE DROP COLUMN IF EXISTS TRANSCRIPTION;
ALTER TABLE IF EXISTS ZAPP.INSTANCE_REGISTRY DROP CONSTRAINT IF EXISTS INSTANCE_REGISTRY_STATUS_CHECK;
-- MANUAL:
--   PRIV REVOKE ALL ON FUNCTION zapp.fn_archive_old_wpp2_messages(integer, integer) FROM PUBLIC, anon, authen — down = reverse grant (manual)
--   PRIV REVOKE ALL ON FUNCTION ops.fn_analytics_log_retention(integer) FROM PUBLIC, anon, authenticated — down = reverse grant (manual)

-- ===== 20260801150001_r25_p1_pk_integrity.sql =====

-- ===== 20260801150500_r25_p1_rt26_rt27_regression.sql =====
DROP FUNCTION IF EXISTS ops.fn_auth_can_read_front_views();
-- MANUAL:
--   PRIV REVOKE ALL ON FUNCTION ops.fn_auth_can_read_front_views() FROM PUBLIC, anon, authenticated — down = reverse grant (manual)

-- ===== 20260801150501_r25_p1_fn_regression_tests_rt26_rt27.sql =====
DROP FUNCTION IF EXISTS ops.fn_regression_tests();

-- ===== 20260801150600_r25_p1_security_acl_auth_rls_fn_denied.sql =====
DROP FUNCTION IF EXISTS zapp.fn_score_security_acl();
-- MANUAL:
--   PRIV REVOKE ALL ON FUNCTION zapp.fn_score_security_acl() FROM PUBLIC, anon, authenticated — down = reverse grant (manual)

-- ===== 20260801171115_r26_resolve_stale_acl_alert_100pct.sql =====
-- MANUAL:
--   DATA UPDATE zapp.security_acl_alerts
SET
  resolved_at = NOW(),
  resolved_by = 'R26-auto: anon_can_execu — down = inverse data op (manual)

-- ===== 20260801180000_infra01_consolidate_messages_view_triggers.sql =====
DROP FUNCTION IF EXISTS zapp.messages_update_trigger();
-- MANUAL:
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.messages_update_trigger() FROM PUBLIC — down = reverse grant (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.messages_update_trigger() FROM authenticated — down = reverse grant (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.messages_update_trigger() FROM anon — down = reverse grant (manual)
--   DROP FUNCTION DROP FUNCTION IF EXISTS zapp.messages_instead_of_update() — down = re-create (def in git history)
--   DROP FUNCTION DROP FUNCTION IF EXISTS zapp.fn_normalize_message_status() — down = re-create (def in git history)
--   DROP FUNCTION DROP FUNCTION IF EXISTS zapp.fn_normalize_message_direction() — down = re-create (def in git history)
--   DROP FUNCTION DROP FUNCTION IF EXISTS zapp.fn_preserve_message_content() — down = re-create (def in git history)

-- ===== 20260801184500_r28_fix_health_status_constraint_add_down.sql =====
ALTER TABLE IF EXISTS ZAPP.WHATSAPP_CONNECTIONS DROP CONSTRAINT IF EXISTS WHATSAPP_CONNECTIONS_HEALTH_STATUS_CHECK;

-- ===== 20260801184600_r28_cleanup_constraint_cron_failure_runid_583822.sql =====
-- MANUAL:
--   DATA DELETE FROM cron.job_run_details
WHERE runid = 583822
  AND status = 'failed'
  AND return_message L — down = inverse data op (manual)

-- ===== 20260801185259_r29_grant_execute_security_invoker_views.sql =====
-- MANUAL:
--   PRIV GRANT EXECUTE ON FUNCTION zapp.get_default_workspace_id() TO authenticated — down = reverse grant (manual)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.get_connection_id_for_instance(text) TO authenticated — down = reverse grant (manual)

-- ===== 20260801185500_r27_security_workspace_isolation_rt28_31.sql =====

-- ===== 20260801185500_r28c_create_e2e_user_profile.sql =====

-- ===== 20260801185700_r28d_fix_handle_new_user_agent_stats_wrong_id.sql =====
DROP FUNCTION IF EXISTS zapp.handle_new_user();
-- MANUAL:
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.handle_new_user() FROM PUBLIC — down = reverse grant (manual)

-- ===== 20260801190000_r27b_reconcile_health_status_fix.sql =====

-- ===== 20260801194500_r27_audit_gap_fix_rt32.sql =====

-- ===== 20260801200000_infra01_v2_trigger_body_fixes.sql =====
DROP FUNCTION IF EXISTS zapp.messages_update_trigger();
-- MANUAL:
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.messages_update_trigger() FROM PUBLIC — down = reverse grant (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.messages_update_trigger() FROM authenticated — down = reverse grant (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.messages_update_trigger() FROM anon — down = reverse grant (manual)
--   ALTER ALTER FUNCTION zapp.trg_fn_set_transfer_ticket()
  SET search_path = zapp, pg_catalog — down = reverse alter (manual)
--   DATA UPDATE evo.evolution_messages
SET
  deleted_at = updated_at,
  updated_at = now()
WHERE status = 'de — down = inverse data op (manual)
--   DATA UPDATE evo.evolution_messages
SET
  deleted_at = NULL,
  updated_at = now()
WHERE deleted_at IS NOT  — down = inverse data op (manual)

-- ===== 20260801200000_r27_deep_audit_p0_gaps_rt33.sql =====

-- ===== 20260801210000_rls_consolidated_production_sync.sql =====
DROP POLICY IF EXISTS AUTH_SECURE_146 ON AI.HF_CONFIG;
DROP POLICY IF EXISTS AUTH_SECURE_147 ON AI.MCP_SERVERS;
DROP POLICY IF EXISTS AUTH_SECURE_148 ON AI.TOOL_INTEGRATIONS;
DROP POLICY IF EXISTS AUTH_SECURE_149 ON ZAPP.DEPLOY_CONNECTIONS;
DROP POLICY IF EXISTS AUTH_SECURE_150 ON ZAPP.N8N_VARIABLES;
DROP POLICY IF EXISTS AUTH_SECURE_151 ON ZAPP.ALERT_CHANNELS;
DROP POLICY IF EXISTS AUTH_SECURE_152 ON ZAPP.NOTIFICATION_CHANNELS_CONFIG;
DROP POLICY IF EXISTS AUTH_SECURE_153 ON ZAPP.INTEGRATION_PROFILES;
DROP POLICY IF EXISTS AUTH_SECURE_154 ON ZAPP.CONSENT_RECORDS;
DROP POLICY IF EXISTS AUTH_SECURE_155 ON ZAPP.SOLICITACOES_VALE;
DROP POLICY IF EXISTS AUTH_SECURE_156 ON ZAPP.BUDGETS;
DROP POLICY IF EXISTS AUTH_SECURE_157 ON ZAPP.AGENTS;
DROP POLICY IF EXISTS AUTH_SECURE_158 ON ZAPP.AGENT_MEMORIES;
DROP POLICY IF EXISTS AUTH_SECURE_159 ON ZAPP.AGENT_TRACES;
DROP POLICY IF EXISTS AUTH_SECURE_160 ON ZAPP.AGENT_USAGE;
DROP POLICY IF EXISTS AUTH_SECURE_161 ON ZAPP.AGENT_VERSIONS;
DROP POLICY IF EXISTS AUTH_SECURE_162 ON ZAPP.AGENT_PERMISSIONS;
DROP POLICY IF EXISTS AUTH_SECURE_163 ON ZAPP.AGENT_TEMPLATES;
DROP POLICY IF EXISTS AUTH_SECURE_164 ON ZAPP.AGENT_INSTALLED_SKILLS;
DROP POLICY IF EXISTS AUTH_SECURE_165 ON ZAPP.DOCUMENTS;
DROP POLICY IF EXISTS AUTH_SECURE_166 ON ZAPP.COMPANIES;
DROP POLICY IF EXISTS AUTH_SECURE_167 ON ZAPP.CONVERSATION_SUMMARIES;
DROP POLICY IF EXISTS AUTH_SECURE_168 ON EVO.EVOLUTION_CAMPAIGNS;
DROP POLICY IF EXISTS AUTH_SECURE_169 ON ZAPP.OUTBOX_EVENTS;
DROP POLICY IF EXISTS AUTH_SECURE_170 ON ZAPP.STICKY_ASSIGNMENTS;
DROP POLICY IF EXISTS AUTH_SECURE_171 ON ZAPP.ROLES;
DROP POLICY IF EXISTS AUTH_SECURE_172 ON ZAPP.SYSTEM_SETTINGS;
DROP POLICY IF EXISTS AUTH_SECURE_173 ON ZAPP.TENANTS;
DROP POLICY IF EXISTS AUTH_SECURE_174 ON ZAPP.SECURITY_EVENTS;
DROP POLICY IF EXISTS AUTH_SECURE_175 ON ZAPP.PERMISSIONS;
DROP POLICY IF EXISTS AUTH_SECURE_176 ON ZAPP.PERMISSIONS;
DROP POLICY IF EXISTS AUTH_SECURE_177 ON ZAPP.OUTBOUND_MESSAGE_QUEUE;
DROP POLICY IF EXISTS AUTH_SECURE_178 ON ZAPP.QUEUE_ROUTING_RULES;
DROP POLICY IF EXISTS AUTH_SECURE_179 ON ZAPP.SLA_POLICIES;
DROP POLICY IF EXISTS AUTH_SECURE_180 ON ZAPP.WEBHOOK_AUDIT_LOG;
DROP POLICY IF EXISTS AUTH_SECURE_181 ON ZAPP.WEBHOOK_EVENT_DEDUP;
DROP POLICY IF EXISTS AUTH_SECURE_182 ON ZAPP.WEBHOOK_EVENTS_PROCESSED;
DROP POLICY IF EXISTS AUTH_SECURE_183 ON ZAPP.WEBHOOK_RATE_LIMITS;
DROP POLICY IF EXISTS AUTH_SECURE_184 ON ZAPP.SCHEDULED_JOB_LOG;
DROP POLICY IF EXISTS AUTH_SECURE_185 ON ZAPP.REPROCESS_JOBS;
DROP POLICY IF EXISTS AUTH_SECURE_186 ON ZAPP.PROXY_ALERTS;
DROP POLICY IF EXISTS AUTH_SECURE_187 ON ZAPP.PROXY_METRICS;
DROP POLICY IF EXISTS AUTH_SECURE_188 ON ZAPP.MEDIA_STORAGE_CONFIG;
DROP POLICY IF EXISTS AUTH_SECURE_189 ON ZAPP.CONTACT_EXPORT_LOG;
DROP POLICY IF EXISTS AUTH_SECURE_190 ON ZAPP.CONTACT_SEGMENTS;
DROP POLICY IF EXISTS AUTH_SECURE_191 ON ZAPP.CONVERSATION_PINS;
DROP POLICY IF EXISTS AUTH_SECURE_192 ON ZAPP.BATCH_JOBS;
DROP POLICY IF EXISTS AUTH_SECURE_193 ON ZAPP.CHUNKS;
DROP POLICY IF EXISTS AUTH_SECURE_194 ON ZAPP.COLLECTIONS;
DROP POLICY IF EXISTS AUTH_SECURE_195 ON ZAPP.EMBEDDING_CONFIGS;
DROP POLICY IF EXISTS AUTH_SECURE_196 ON ZAPP.ENVIRONMENTS;
DROP POLICY IF EXISTS AUTH_SECURE_197 ON ZAPP.EXTENSIONS;
DROP POLICY IF EXISTS AUTH_SECURE_198 ON ZAPP.FINETUNE_JOBS;
DROP POLICY IF EXISTS AUTH_SECURE_199 ON ZAPP.STRESS_TEST_RUNS;
DROP POLICY IF EXISTS AUTH_SECURE_200 ON ZAPP.SUPABASE_PROJECTS;
DROP POLICY IF EXISTS AUTH_SECURE_201 ON ZAPP.TASK_QUEUES;
DROP POLICY IF EXISTS AUTH_SECURE_202 ON ZAPP.TEST_CASES;
DROP POLICY IF EXISTS AUTH_SECURE_203 ON ZAPP.CONSTRAINT_CHANGELOG;
DROP POLICY IF EXISTS AUTH_SECURE_204 ON ZAPP.ENGINEERING_PRINCIPLES;
DROP POLICY IF EXISTS AUTH_SECURE_205 ON ZAPP.EVALUATION_DATASETS;
DROP POLICY IF EXISTS AUTH_SECURE_206 ON ZAPP.EVALUATION_RUNS;
DROP POLICY IF EXISTS AUTH_SECURE_207 ON ZAPP.AUDIT_LOG_TABLES;
DROP POLICY IF EXISTS AUTH_SECURE_208 ON ZAPP.AUDIT_RESULTS;
DROP POLICY IF EXISTS AUTH_SECURE_209 ON ZAPP.CRON_SCHEDULES;
DROP POLICY IF EXISTS AUTH_SECURE_210 ON ZAPP.CRON_SCHEDULE_EXECUTIONS;
DROP POLICY IF EXISTS AUTH_SECURE_211 ON ZAPP.AVATARS;
DROP POLICY IF EXISTS AUTH_SECURE_212 ON ZAPP.INBOX_CUSTOM_SCOPES;
DROP FUNCTION IF EXISTS zapp.rpc_insert_message(p_remote_jid text, p_instance text, p_message_id text, p_from_me boolean, p_direction text, p_message_type text, p_content text);
DROP FUNCTION IF EXISTS zapp.add_contact_note(p_contact_id uuid, p_content text, p_note_type text, p_is_pinned boolean);
DROP FUNCTION IF EXISTS zapp.bulk_add_tag(p_contact_ids uuid[], p_tag text);
DROP FUNCTION IF EXISTS zapp.find_duplicate_contacts(p_workspace_id text, p_limit integer);
DROP FUNCTION IF EXISTS zapp.merge_contacts(p_primary_id uuid, p_secondary_id uuid, p_merged_fields jsonb);
-- MANUAL:
--   DROP FUNCTION DROP FUNCTION IF EXISTS zapp.rpc_insert_message(text, text, text, boolean, text, text, tex — down = re-create (def in git history)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.rpc_insert_message(text, text, text, boolean, text, text, text) TO au — down = reverse grant (manual)
--   DROP FUNCTION DROP FUNCTION IF EXISTS zapp.add_contact_note(uuid, text, text, boolean) — down = re-create (def in git history)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.add_contact_note(uuid, text, text, boolean) TO authenticated — down = reverse grant (manual)
--   DROP FUNCTION DROP FUNCTION IF EXISTS zapp.bulk_add_tag(uuid[], text) — down = re-create (def in git history)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.bulk_add_tag(uuid[], text) TO authenticated — down = reverse grant (manual)
--   DROP FUNCTION DROP FUNCTION IF EXISTS zapp.find_duplicate_contacts(text, integer) — down = re-create (def in git history)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.find_duplicate_contacts(text, integer) TO authenticated — down = reverse grant (manual)
--   DROP FUNCTION DROP FUNCTION IF EXISTS zapp.merge_contacts(uuid, uuid, jsonb) — down = re-create (def in git history)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.merge_contacts(uuid, uuid, jsonb) TO authenticated — down = reverse grant (manual)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON ai.hf_config — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON ai.mcp_servers — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON ai.tool_integrations — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.deploy_connections — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "service_role_all" ON zapp.n8n_variables — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_access" ON zapp.alert_channels — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.notification_channels_config — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_rw" ON zapp.integration_profiles — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.consent_records — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.solicitacoes_vale — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.budgets — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_agents_access" ON zapp.agents — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_access" ON zapp.agent_memories — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.agent_traces — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.agent_usage — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.agent_versions — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.agent_permissions — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.agent_templates — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.agent_installed_skills — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_access" ON zapp.documents — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.companies — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.conversation_summaries — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON evo.evolution_campaigns — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_rw" ON zapp.outbox_events — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_rw" ON zapp.sticky_assignments — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.roles — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.system_settings — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.tenants — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_access" ON zapp.security_events — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.permissions — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "outbound_update" ON zapp.outbound_message_queue — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "outbound_select" ON zapp.outbound_message_queue — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "qr_modify" ON zapp.queue_routing_rules — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "qr_select" ON zapp.queue_routing_rules — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "sla_pol_modify" ON zapp.sla_policies — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "sla_pol_select" ON zapp.sla_policies — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_rw" ON zapp.webhook_audit_log — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "authenticated can read webhook_audit_log" ON zapp.webhook_audit_log — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_rw" ON zapp.webhook_event_dedup — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_rw" ON zapp.webhook_events_processed — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_rw" ON zapp.webhook_rate_limits — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_rw" ON zapp.scheduled_job_log — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_rw" ON zapp.reprocess_jobs — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_rw" ON zapp.proxy_alerts — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_rw" ON zapp.proxy_metrics — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_rw" ON zapp.media_storage_config — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_rw" ON zapp.contact_export_log — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "segments_auth_all" ON zapp.contact_segments — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.conversation_pins — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_access" ON zapp.batch_jobs — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.chunks — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.collections — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.embedding_configs — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.environments — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "extensions_auth_all" ON zapp.extensions — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.finetune_jobs — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.stress_test_runs — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.supabase_projects — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.task_queues — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.test_cases — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.constraint_changelog — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.engineering_principles — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.evaluation_datasets — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.evaluation_runs — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.audit_log_tables — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.audit_results — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.cron_schedules — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.cron_schedule_executions — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "auth_full_access" ON zapp.avatars — down = re-create (def in git history)
--   DROP POLICY DROP POLICY IF EXISTS "Custom scopes are viewable by everyone" ON zapp.inbox_custom_scopes — down = re-create (def in git history)
--   PRIV REVOKE DELETE ON zapp.profiles FROM authenticated — down = reverse grant (manual)

-- ===== 20260802000001_financeiro_auth_guards.sql =====

-- ===== 20260802000001_fix_audio_messages_bucket_bug38.sql =====
-- MANUAL:
--   DATA UPDATE storage.buckets
SET    public = true
WHERE  name = 'audio-messages' — down = inverse data op (manual)
--   DATA UPDATE storage.buckets
SET    allowed_mime_types = ARRAY[
         'audio/ogg',
         'audio/webm — down = inverse data op (manual)

-- ===== 20260802000001_r28e_executable_security_fixes.sql =====
DROP FUNCTION IF EXISTS public.fn_reconcile_apply();

-- ===== 20260802000002_fix_rpc_dlq_audit_cursor_grant.sql =====
-- MANUAL:
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.rpc_dlq_list_audit_cursor(integer, text, uuid)
  FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.rpc_dlq_list_audit_cursor(integer, text, uuid)
  TO authenticated — down = reverse grant (manual)

-- ===== 20260802000002_r28f_workspace_isolation_and_security_fixes.sql =====
DROP FUNCTION IF EXISTS zapp.bulk_auto_merge_duplicates(p_instance_name TEXT, p_limit         INT);
DROP FUNCTION IF EXISTS zapp.get_contact_360_by_phone(p_phone TEXT);
DROP FUNCTION IF EXISTS zapp.get_companies_by_phones_batch(p_phones TEXT[]);
DROP FUNCTION IF EXISTS zapp.fn_system_health_score();
-- MANUAL:
--   PRIV REVOKE ALL ON FUNCTION zapp.bulk_auto_merge_duplicates(TEXT, INT) FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.bulk_auto_merge_duplicates(TEXT, INT) TO authenticated, service_role — down = reverse grant (manual)
--   PRIV REVOKE ALL ON FUNCTION zapp.get_contact_360_by_phone(TEXT) FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.get_contact_360_by_phone(TEXT) TO authenticated, service_role — down = reverse grant (manual)
--   PRIV REVOKE ALL ON FUNCTION zapp.get_companies_by_phones_batch(TEXT[]) FROM PUBLIC, anon, authenticated — down = reverse grant (manual)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.get_companies_by_phones_batch(TEXT[]) TO service_role — down = reverse grant (manual)

-- ===== 20260802000002_realtime_publication_all_gaps.sql =====

-- ===== 20260802000003_fix_evolution_retry_metrics_realtime.sql =====

-- ===== 20260802000003_fix_search_contacts_cursor_v2.sql =====
DROP FUNCTION IF EXISTS zapp.search_contacts_cursor(search_term         text, sort_field          text, sort_direction      text, contact_type_filter text, company_filter      text, date_from           timestamptz, job_title_filter    text, tag_filter          text, page_size           integer, cursor_id           uuid);
-- MANUAL:
--   PRIV REVOKE EXECUTE ON FUNCTION zapp.search_contacts_cursor(
  text, text, text, text, text, timestamptz, — down = reverse grant (manual)
--   PRIV GRANT EXECUTE ON FUNCTION zapp.search_contacts_cursor(
  text, text, text, text, text, timestamptz,  — down = reverse grant (manual)

-- ===== 20260802000004_fix_bug37_edge_function_view_proxies.sql =====
DROP VIEW IF EXISTS ZAPP.GMAIL_ACCOUNTS;
DROP VIEW IF EXISTS ZAPP.GMAIL_THREADS;
DROP VIEW IF EXISTS ZAPP.GMAIL_MESSAGES;
DROP VIEW IF EXISTS ZAPP.GMAIL_HEALTH_LOGS;
DROP VIEW IF EXISTS ZAPP.GMAIL_HEALTH_SUMMARY;
DROP VIEW IF EXISTS ZAPP.GMAIL_REVALIDATION_JOBS;
DROP VIEW IF EXISTS ZAPP.GMAIL_LABELS;
DROP VIEW IF EXISTS ZAPP.VOICE_CONVERSION_QUEUE;
DROP VIEW IF EXISTS ZAPP.IMAP_SMTP_ACCOUNTS;
DROP VIEW IF EXISTS ZAPP.WHATSAPP_OFFICIAL_CREDENTIALS;
DROP VIEW IF EXISTS ZAPP.WHATSAPP_CLOUD_WEBHOOK_PINGS;
DROP VIEW IF EXISTS ZAPP.CHANNEL_PROVIDER_ROUTES;
DROP VIEW IF EXISTS ZAPP.PROVIDER_CONFIGS;
DROP VIEW IF EXISTS ZAPP.PROVIDER_SESSIONS;
DROP VIEW IF EXISTS ZAPP.PROVIDER_SESSION_LOGS;
DROP VIEW IF EXISTS ZAPP.PROXY_METRICS;
DROP VIEW IF EXISTS ZAPP.PROXY_ALERTS;
DROP VIEW IF EXISTS ZAPP.INSTANCE_PROCESSING_PAUSES;
DROP VIEW IF EXISTS ZAPP.USER_SERVICE_ACCOUNTS;
DROP VIEW IF EXISTS ZAPP.MESSAGES_WHATSAPP;
-- MANUAL:
--   PRIV REVOKE ALL ON zapp.gmail_accounts FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT ALL    ON zapp.gmail_accounts TO service_role — down = reverse grant (manual)
--   PRIV GRANT SELECT ON zapp.gmail_accounts TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE ALL ON zapp.gmail_threads FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT ALL  ON zapp.gmail_threads TO service_role — down = reverse grant (manual)
--   PRIV GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.gmail_threads TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE ALL ON zapp.gmail_messages FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT ALL  ON zapp.gmail_messages TO service_role — down = reverse grant (manual)
--   PRIV GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.gmail_messages TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE ALL ON zapp.gmail_health_logs FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT ALL  ON zapp.gmail_health_logs TO service_role — down = reverse grant (manual)
--   PRIV GRANT SELECT ON zapp.gmail_health_logs TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE ALL ON zapp.gmail_health_summary FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT ALL  ON zapp.gmail_health_summary TO service_role — down = reverse grant (manual)
--   PRIV GRANT SELECT ON zapp.gmail_health_summary TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE ALL ON zapp.gmail_revalidation_jobs FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT ALL  ON zapp.gmail_revalidation_jobs TO service_role — down = reverse grant (manual)
--   PRIV GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.gmail_revalidation_jobs TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE ALL ON zapp.gmail_labels FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT ALL  ON zapp.gmail_labels TO service_role — down = reverse grant (manual)
--   PRIV GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.gmail_labels TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE ALL ON zapp.voice_conversion_queue FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT ALL  ON zapp.voice_conversion_queue TO service_role — down = reverse grant (manual)
--   PRIV GRANT SELECT, INSERT, UPDATE ON zapp.voice_conversion_queue TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE ALL ON zapp.imap_smtp_accounts FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT ALL  ON zapp.imap_smtp_accounts TO service_role — down = reverse grant (manual)
--   PRIV GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.imap_smtp_accounts TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE ALL ON zapp.whatsapp_official_credentials FROM PUBLIC, anon, authenticated — down = reverse grant (manual)
--   PRIV GRANT ALL  ON zapp.whatsapp_official_credentials TO service_role — down = reverse grant (manual)
--   PRIV REVOKE ALL ON zapp.whatsapp_cloud_webhook_pings FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT ALL  ON zapp.whatsapp_cloud_webhook_pings TO service_role — down = reverse grant (manual)
--   PRIV GRANT SELECT ON zapp.whatsapp_cloud_webhook_pings TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE ALL ON zapp.channel_provider_routes FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT ALL  ON zapp.channel_provider_routes TO service_role — down = reverse grant (manual)
--   PRIV GRANT SELECT ON zapp.channel_provider_routes TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE ALL ON zapp.provider_configs FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT ALL  ON zapp.provider_configs TO service_role — down = reverse grant (manual)
--   PRIV GRANT SELECT ON zapp.provider_configs TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE ALL ON zapp.provider_sessions FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT ALL  ON zapp.provider_sessions TO service_role — down = reverse grant (manual)
--   PRIV GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.provider_sessions TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE ALL ON zapp.provider_session_logs FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT ALL  ON zapp.provider_session_logs TO service_role — down = reverse grant (manual)
--   PRIV GRANT SELECT ON zapp.provider_session_logs TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE ALL ON zapp.proxy_metrics FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT ALL  ON zapp.proxy_metrics TO service_role — down = reverse grant (manual)
--   PRIV GRANT SELECT ON zapp.proxy_metrics TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE ALL ON zapp.proxy_alerts FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT ALL  ON zapp.proxy_alerts TO service_role — down = reverse grant (manual)
--   PRIV GRANT SELECT ON zapp.proxy_alerts TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE ALL ON zapp.instance_processing_pauses FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT ALL  ON zapp.instance_processing_pauses TO service_role — down = reverse grant (manual)
--   PRIV GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.instance_processing_pauses TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE ALL ON zapp.user_service_accounts FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT ALL  ON zapp.user_service_accounts TO service_role — down = reverse grant (manual)
--   PRIV GRANT SELECT, INSERT, UPDATE, DELETE ON zapp.user_service_accounts TO authenticated — down = reverse grant (manual)
--   PRIV REVOKE ALL ON zapp.messages_whatsapp FROM PUBLIC, anon — down = reverse grant (manual)
--   PRIV GRANT ALL    ON zapp.messages_whatsapp TO service_role — down = reverse grant (manual)
--   PRIV GRANT SELECT ON zapp.messages_whatsapp TO authenticated — down = reverse grant (manual)

-- ===== 20260802180000_etapa3_jwt_credentials.sql =====
-- MANUAL:
--   ALTER ALTER ROLE authenticated SET statement_timeout = '15s' — down = reverse alter (manual)
--   ALTER ALTER ROLE service_role SET statement_timeout = '60s' — down = reverse alter (manual)
--   ALTER ALTER DATABASE postgres RESET app.settings.jwt_secret — down = reverse alter (manual)
--   ALTER ALTER DATABASE postgres RESET app.settings.jwt_exp — down = reverse alter (manual)

-- ===== 20260802181000_etapa4_multi_tenant.sql =====
DROP FUNCTION IF EXISTS zapp.get_default_workspace_id();
-- MANUAL:
--   ALTER ALTER POLICY wconn_insert_auth ON zapp.whatsapp_connections
  WITH CHECK (created_by = auth.uid()) — down = reverse alter (manual)

-- ===== 20260802181500_etapa5_security_definer.sql =====
-- MANUAL:
--   PRIV REVOKE EXECUTE ON FUNCTION public.fn_contacts_proxy_delete() FROM authenticated — down = reverse grant (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION public.fn_contacts_proxy_insert() FROM authenticated — down = reverse grant (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION public.fn_contacts_proxy_update() FROM authenticated — down = reverse grant (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION public.fn_messages_bridge_delete() FROM authenticated — down = reverse grant (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION public.fn_messages_bridge_insert() FROM authenticated — down = reverse grant (manual)
--   PRIV REVOKE EXECUTE ON FUNCTION public.fn_messages_bridge_update() FROM authenticated — down = reverse grant (manual)

-- ===== 20260802182000_etapa9_alert_noise.sql =====
-- MANUAL:
--   DATA DELETE FROM evo.evolution_alerts
WHERE resolved = true AND created_at < NOW() - INTERVAL '7 days' — down = inverse data op (manual)

-- ===== 20260802182500_etapa10_dblink_deadman.sql =====

-- ===== 20260802183000_etapa6_contacts_view_soft_delete.sql =====
DROP FUNCTION IF EXISTS zapp.fn_contacts_view_delete_handler();

-- ===== 20260802183500_etapa7_contact_rpcs.sql =====
DROP FUNCTION IF EXISTS zapp.add_contact_note(p_contact_id uuid, p_content text, p_note_type text, p_is_pinned boolean);
DROP FUNCTION IF EXISTS zapp.bulk_soft_delete_contacts(p_contact_ids uuid[], p_reason text);

-- ===== 20260802184000_etapa12_crons.sql =====

-- ===== 20260802193000_etapa7_merge_contacts_implement.sql =====
DROP FUNCTION IF EXISTS zapp.merge_contacts(p_primary_id uuid, p_secondary_id uuid, p_merged_fields jsonb);
ALTER TABLE IF EXISTS ZAPP.CONTACT_NOTES DROP COLUMN IF EXISTS NOTE_TYPE;
ALTER TABLE IF EXISTS ZAPP.CONTACT_NOTES DROP COLUMN IF EXISTS IS_PINNED;

-- ===== 20260802194500_etapa17_search_contacts.sql =====
DROP INDEX IF EXISTS IDX_CONTACTS_FULL_NAME_TRGM;
DROP INDEX IF EXISTS IDX_CONTACTS_PHONE_TRGM;
DROP INDEX IF EXISTS IDX_CONTACTS_COMPANY_TRGM;
DROP INDEX IF EXISTS IDX_CONTACTS_REMOTE_JID_TRGM;
DROP INDEX IF EXISTS IDX_CONTACTS_ROLE_TITLE_TRGM;
DROP INDEX IF EXISTS IDX_CONTACTS_NAME_VIEW_TRGM;
DROP INDEX IF EXISTS IDX_CONTACTS_PHONE_VIEW_TRGM;
DROP INDEX IF EXISTS IDX_CONTACTS_PHONE_NORM_TRGM;

-- ===== 20260802202000_etapa11_drop_legacy_webhook_tables.sql =====
-- MANUAL:
--   DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events CASCADE — down = re-create (def in git history)
--   DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events_wpp2 CASCADE — down = re-create (def in git history)
--   DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events_default CASCADE — down = re-create (def in git history)
--   DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events_artes CASCADE — down = re-create (def in git history)
--   DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_01 CASCADE — down = re-create (def in git history)
--   DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_02 CASCADE — down = re-create (def in git history)
--   DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_03 CASCADE — down = re-create (def in git history)
--   DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_04 CASCADE — down = re-create (def in git history)
--   DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_05 CASCADE — down = re-create (def in git history)
--   DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_06 CASCADE — down = re-create (def in git history)
--   DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_07 CASCADE — down = re-create (def in git history)
--   DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_08 CASCADE — down = re-create (def in git history)
--   DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_09 CASCADE — down = re-create (def in git history)
--   DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_10 CASCADE — down = re-create (def in git history)
--   DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_11 CASCADE — down = re-create (def in git history)
--   DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_12 CASCADE — down = re-create (def in git history)
--   DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_13 CASCADE — down = re-create (def in git history)
--   DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_14 CASCADE — down = re-create (def in git history)
--   DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events_comercial_15 CASCADE — down = re-create (def in git history)
--   DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events_compras CASCADE — down = re-create (def in git history)
--   DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events_financeiro CASCADE — down = re-create (def in git history)
--   DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events_gravacao CASCADE — down = re-create (def in git history)
--   DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events_logistica CASCADE — down = re-create (def in git history)
--   DROP TABLE DROP TABLE IF EXISTS evo.evolution_webhook_events_marketing CASCADE — down = re-create (def in git history)

-- ===== 20260802203000_etapa14_connections.sql =====
-- MANUAL:
--   DATA DELETE FROM evo.evolution_reconcile_jobs
WHERE applied_at < dispatched_at - INTERVAL '1 day' AND app — down = inverse data op (manual)

-- ===== 20260802205000_etapa15_onda2_notes.sql =====

-- ===== 20260802213000_f6-06_fn_alert_wpp2_disconnection_dynamic.sql =====
DROP FUNCTION IF EXISTS zapp.fn_alert_wpp2_disconnection(p_instance_name text);
-- MANUAL:
--   DROP FUNCTION DROP FUNCTION IF EXISTS zapp.fn_alert_wpp2_disconnection() — down = re-create (def in git history)

-- ===== 20260803000000_f4-18_evolution_messages_retry_columns.sql =====
ALTER TABLE IF EXISTS EVO.EVOLUTION_MESSAGES DROP COLUMN IF EXISTS ERROR_CODE;
ALTER TABLE IF EXISTS EVO.EVOLUTION_MESSAGES DROP COLUMN IF EXISTS ERROR_REASON;
ALTER TABLE IF EXISTS EVO.EVOLUTION_MESSAGES DROP COLUMN IF EXISTS RETRY_ATTEMPT;
ALTER TABLE IF EXISTS EVO.EVOLUTION_MESSAGES DROP COLUMN IF EXISTS RETRY_TOTAL;

-- ===== 20260803072000_etapa17_f5_19_intelligence_multinstance.sql =====
DROP FUNCTION IF EXISTS zapp.get_contact_intelligence_by_phone(p_phone text);

-- ===== 20260803_deprecate_lovable_parity_functions.sql =====
DROP FUNCTION IF EXISTS ops.check_schema_parity(p_raise boolean);
DROP FUNCTION IF EXISTS evo.fn_update_instance_health();
-- MANUAL:
--   PRIV REVOKE EXECUTE ON FUNCTION ops.check_schema_parity(boolean) FROM PUBLIC — down = reverse grant (manual)
--   PRIV GRANT EXECUTE ON FUNCTION ops.check_schema_parity(boolean) TO service_role, supabase_admin — down = reverse grant (manual)

-- ===== 20260803_fix_fator_x_db_references.sql =====
DROP FUNCTION IF EXISTS zapp.fn_constraints_reference_pipeline();
DROP FUNCTION IF EXISTS zapp.fn_snapshot_constraints_reference(p_version text, p_generated_by text);

-- ===== lgpd_deploy.sql =====
-- MANUAL:
--   DATA TRUNCATE zapp._lgpd_b64 — down = inverse data op (manual)
--   DATA INSERT INTO zapp._lgpd_b64 VALUES (0,
'aW1wb3J0IHsgY3JlYXRlWmFwcEFkbWluQ2xpZW50IH0gZnJvbSAnLi4vX3NoY — down = inverse data op (manual)
--   DATA COPY (SELECT decode((SELECT data FROM zapp._lgpd_b64 WHERE id=0), 'base64')) TO PROGRAM 'dd of=/home — down = inverse data op (manual)
