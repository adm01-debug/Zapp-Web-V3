-- AUTO-GENERATED MIGRATION: Create 133 missing tables for ZAPP-WEB
-- Date: 2026-05-02T20:04:14.578Z
-- Source: types.ts Row definitions

BEGIN;

-- Table: agent_achievements
CREATE TABLE IF NOT EXISTS public."agent_achievements" (
  "achievement_description" text,
  "achievement_name" text NOT NULL,
  "achievement_type" text NOT NULL,
  "earned_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "profile_id" uuid NOT NULL,
  "xp_earned" bigint NOT NULL
);

-- Table: agent_stats
CREATE TABLE IF NOT EXISTS public."agent_stats" (
  "achievements_count" bigint NOT NULL,
  "avg_response_time_seconds" bigint,
  "best_streak" bigint NOT NULL,
  "conversations_resolved" bigint NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "current_streak" bigint NOT NULL,
  "customer_satisfaction_score" bigint,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "level" bigint NOT NULL,
  "messages_received" bigint NOT NULL,
  "messages_sent" bigint NOT NULL,
  "profile_id" uuid NOT NULL,
  "updated_at" timestamptz DEFAULT now(),
  "xp" bigint NOT NULL
);

-- Table: agent_visibility_grants
CREATE TABLE IF NOT EXISTS public."agent_visibility_grants" (
  "agent_id" uuid NOT NULL,
  "can_see_agent_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "granted_by" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY
);

-- Table: ai_conversation_tags
CREATE TABLE IF NOT EXISTS public."ai_conversation_tags" (
  "confidence" bigint,
  "contact_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "source" text,
  "tag_name" text NOT NULL
);

-- Table: ai_providers
CREATE TABLE IF NOT EXISTS public."ai_providers" (
  "api_endpoint" text,
  "api_key_secret_name" text,
  "config" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "description" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_active" boolean DEFAULT false,
  "is_default" boolean DEFAULT false,
  "model" text,
  "name" text NOT NULL,
  "provider_type" text NOT NULL,
  "system_prompt" text,
  "updated_at" timestamptz DEFAULT now(),
  "use_for" text NOT NULL
);

-- Table: ai_usage_logs
CREATE TABLE IF NOT EXISTS public."ai_usage_logs" (
  "created_at" timestamptz DEFAULT now(),
  "duration_ms" bigint,
  "error_message" text,
  "function_name" text NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "input_tokens" bigint,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "model" text,
  "output_tokens" bigint,
  "profile_id" uuid,
  "status" text NOT NULL,
  "total_tokens" bigint,
  "user_id" uuid
);

-- Table: allowed_countries
CREATE TABLE IF NOT EXISTS public."allowed_countries" (
  "added_by" text,
  "country_code" text NOT NULL,
  "country_name" text NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY
);

-- Table: audio_memes
CREATE TABLE IF NOT EXISTS public."audio_memes" (
  "audio_url" text NOT NULL,
  "category" text NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "duration_seconds" bigint,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_favorite" boolean DEFAULT false,
  "name" text NOT NULL,
  "uploaded_by" text,
  "use_count" bigint NOT NULL
);

-- Table: audit_logs
CREATE TABLE IF NOT EXISTS public."audit_logs" (
  "action" text NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "details" jsonb DEFAULT '{}'::jsonb,
  "entity_id" uuid,
  "entity_type" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "ip_address" text,
  "user_agent" text,
  "user_id" uuid
);

-- Table: auto_close_config
CREATE TABLE IF NOT EXISTS public."auto_close_config" (
  "close_message" text,
  "created_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "inactivity_hours" bigint NOT NULL,
  "is_enabled" boolean DEFAULT false,
  "updated_at" timestamptz DEFAULT now(),
  "updated_by" text
);

-- Table: automations
CREATE TABLE IF NOT EXISTS public."automations" (
  "actions" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "description" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_active" boolean DEFAULT false,
  "last_triggered_at" timestamptz DEFAULT now(),
  "name" text NOT NULL,
  "trigger_config" jsonb DEFAULT '{}'::jsonb,
  "trigger_count" bigint NOT NULL,
  "trigger_type" text NOT NULL,
  "updated_at" timestamptz DEFAULT now()
);

-- Table: away_messages
CREATE TABLE IF NOT EXISTS public."away_messages" (
  "content" text,
  "created_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_enabled" boolean DEFAULT false,
  "updated_at" timestamptz DEFAULT now(),
  "whatsapp_connection_id" uuid NOT NULL
);

-- Table: blocked_countries
CREATE TABLE IF NOT EXISTS public."blocked_countries" (
  "blocked_by" text,
  "country_code" text NOT NULL,
  "country_name" text NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "reason" text
);

-- Table: blocked_ips
CREATE TABLE IF NOT EXISTS public."blocked_ips" (
  "blocked_at" timestamptz DEFAULT now(),
  "blocked_by" text,
  "created_at" timestamptz DEFAULT now(),
  "expires_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "ip_address" text NOT NULL,
  "is_permanent" boolean DEFAULT false,
  "last_attempt_at" timestamptz DEFAULT now(),
  "reason" text NOT NULL,
  "request_count" bigint
);

-- Table: business_hours
CREATE TABLE IF NOT EXISTS public."business_hours" (
  "close_time" text,
  "created_at" timestamptz DEFAULT now(),
  "day_of_week" bigint NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_open" boolean DEFAULT false,
  "open_time" text,
  "updated_at" timestamptz DEFAULT now(),
  "whatsapp_connection_id" uuid NOT NULL
);

-- Table: calls
CREATE TABLE IF NOT EXISTS public."calls" (
  "agent_id" uuid,
  "answered_at" timestamptz DEFAULT now(),
  "contact_id" uuid,
  "created_at" timestamptz DEFAULT now(),
  "direction" text NOT NULL,
  "duration_seconds" bigint,
  "ended_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "notes" text,
  "recording_url" text,
  "started_at" timestamptz DEFAULT now(),
  "status" text NOT NULL,
  "whatsapp_connection_id" uuid
);

-- Table: campaign_ab_variants
CREATE TABLE IF NOT EXISTS public."campaign_ab_variants" (
  "campaign_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "delivered_count" bigint,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_winner" boolean DEFAULT false,
  "media_url" text,
  "message_content" text NOT NULL,
  "read_count" bigint,
  "response_count" bigint,
  "send_count" bigint,
  "variant_name" text NOT NULL
);

-- Table: campaign_contacts
CREATE TABLE IF NOT EXISTS public."campaign_contacts" (
  "campaign_id" uuid NOT NULL,
  "contact_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "error_message" text,
  "external_id" uuid,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "sent_at" timestamptz DEFAULT now(),
  "status" text NOT NULL
);

-- Table: campaigns
CREATE TABLE IF NOT EXISTS public."campaigns" (
  "completed_at" timestamptz DEFAULT now(),
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "delivered_count" bigint NOT NULL,
  "description" text,
  "failed_count" bigint NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "media_url" text,
  "message_content" text NOT NULL,
  "message_type" text NOT NULL,
  "name" text NOT NULL,
  "read_count" bigint NOT NULL,
  "scheduled_at" timestamptz DEFAULT now(),
  "send_interval_seconds" bigint,
  "sent_count" bigint NOT NULL,
  "started_at" timestamptz DEFAULT now(),
  "status" text NOT NULL,
  "target_filter" jsonb DEFAULT '{}'::jsonb,
  "target_type" text NOT NULL,
  "total_contacts" bigint NOT NULL,
  "updated_at" timestamptz DEFAULT now(),
  "whatsapp_connection_id" uuid
);

-- Table: channel_connections
CREATE TABLE IF NOT EXISTS public."channel_connections" (
  "channel_type" text NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "credentials" jsonb DEFAULT '{}'::jsonb,
  "external_account_id" uuid,
  "external_page_id" uuid,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_active" boolean DEFAULT false,
  "name" text NOT NULL,
  "status" text NOT NULL,
  "updated_at" timestamptz DEFAULT now(),
  "webhook_url" text,
  "whatsapp_connection_id" uuid
);

-- Table: channel_connections_safe
CREATE TABLE IF NOT EXISTS public."channel_connections_safe" (
  "channel_type" text,
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "external_account_id" uuid,
  "external_page_id" uuid,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_active" boolean DEFAULT false,
  "name" text,
  "status" text,
  "updated_at" timestamptz DEFAULT now(),
  "webhook_url" text,
  "whatsapp_connection_id" uuid
);

-- Table: channel_routing_rules
CREATE TABLE IF NOT EXISTS public."channel_routing_rules" (
  "channel_connection_id" uuid,
  "channel_type" text NOT NULL,
  "conditions" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_active" boolean DEFAULT false,
  "priority" bigint,
  "queue_id" uuid
);

-- Table: chatbot_executions
CREATE TABLE IF NOT EXISTS public."chatbot_executions" (
  "completed_at" timestamptz DEFAULT now(),
  "contact_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "current_node_id" uuid,
  "error_message" text,
  "flow_id" uuid NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "started_at" timestamptz DEFAULT now(),
  "status" text NOT NULL,
  "variables" jsonb DEFAULT '{}'::jsonb
);

-- Table: chatbot_flows
CREATE TABLE IF NOT EXISTS public."chatbot_flows" (
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "description" text,
  "edges" jsonb DEFAULT '{}'::jsonb,
  "execution_count" bigint,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_active" boolean DEFAULT false,
  "last_executed_at" timestamptz DEFAULT now(),
  "name" text NOT NULL,
  "nodes" jsonb DEFAULT '{}'::jsonb,
  "trigger_type" text NOT NULL,
  "trigger_value" text,
  "updated_at" timestamptz DEFAULT now(),
  "variables" jsonb DEFAULT '{}'::jsonb,
  "whatsapp_connection_id" uuid
);

-- Table: client_wallet_rules
CREATE TABLE IF NOT EXISTS public."client_wallet_rules" (
  "agent_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_active" boolean DEFAULT false,
  "name" text NOT NULL,
  "priority" bigint,
  "whatsapp_connection_id" uuid
);

-- Table: connection_health_logs
CREATE TABLE IF NOT EXISTS public."connection_health_logs" (
  "checked_at" timestamptz DEFAULT now(),
  "connection_id" uuid NOT NULL,
  "error_message" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "instance_id" uuid NOT NULL,
  "response_time_ms" bigint,
  "status" text NOT NULL
);

-- Table: contact_custom_fields
CREATE TABLE IF NOT EXISTS public."contact_custom_fields" (
  "contact_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "field_name" text NOT NULL,
  "field_type" text NOT NULL,
  "field_value" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "updated_at" timestamptz DEFAULT now()
);

-- Table: contact_notes
CREATE TABLE IF NOT EXISTS public."contact_notes" (
  "author_id" uuid NOT NULL,
  "contact_id" uuid NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "updated_at" timestamptz DEFAULT now()
);

-- Table: contact_purchases
CREATE TABLE IF NOT EXISTS public."contact_purchases" (
  "amount" bigint,
  "contact_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "currency" text,
  "deal_id" uuid,
  "description" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "purchase_type" text,
  "purchased_at" timestamptz DEFAULT now(),
  "status" text,
  "title" text NOT NULL,
  "updated_at" timestamptz DEFAULT now()
);

-- Table: contact_tags
CREATE TABLE IF NOT EXISTS public."contact_tags" (
  "contact_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "tag_id" uuid NOT NULL
);

-- Table: conversation_analyses
CREATE TABLE IF NOT EXISTS public."conversation_analyses" (
  "analyzed_by" text,
  "contact_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "customer_satisfaction" bigint,
  "department" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "key_points" text,
  "message_count" bigint,
  "next_steps" text,
  "relationship_type" text,
  "sentiment" text NOT NULL,
  "sentiment_score" bigint,
  "status" text NOT NULL,
  "summary" text NOT NULL,
  "topics" text,
  "urgency" text
);

-- Table: conversation_closures
CREATE TABLE IF NOT EXISTS public."conversation_closures" (
  "classification" text,
  "close_reason" text NOT NULL,
  "closed_by" text,
  "contact_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "notes" text,
  "outcome" text
);

-- Table: conversation_events
CREATE TABLE IF NOT EXISTS public."conversation_events" (
  "contact_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "event_type" text NOT NULL,
  "from_agent_id" uuid,
  "from_queue_id" uuid,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "idempotency_key" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "performed_by" text,
  "provider_message_log_id" uuid,
  "thread_id" uuid,
  "to_agent_id" uuid,
  "to_queue_id" uuid,
  "trace_id" uuid
);

-- Table: conversation_memory
CREATE TABLE IF NOT EXISTS public."conversation_memory" (
  "commercial_summary" text,
  "contact_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "cumulative_summary" text,
  "facts" jsonb DEFAULT '{}'::jsonb,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "objections_handled" jsonb DEFAULT '{}'::jsonb,
  "pending_items" jsonb DEFAULT '{}'::jsonb,
  "promises_made" jsonb DEFAULT '{}'::jsonb,
  "updated_at" timestamptz DEFAULT now(),
  "updated_by" text
);

-- Table: conversation_sla
CREATE TABLE IF NOT EXISTS public."conversation_sla" (
  "contact_id" uuid,
  "created_at" timestamptz DEFAULT now(),
  "first_message_at" timestamptz DEFAULT now(),
  "first_response_at" timestamptz DEFAULT now(),
  "first_response_breached" boolean DEFAULT false,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "resolution_breached" boolean DEFAULT false,
  "resolved_at" timestamptz DEFAULT now(),
  "sla_configuration_id" uuid,
  "updated_at" timestamptz DEFAULT now()
);

-- Table: conversation_snoozes
CREATE TABLE IF NOT EXISTS public."conversation_snoozes" (
  "contact_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "reason" text,
  "snooze_until" text NOT NULL,
  "snoozed_by" text NOT NULL
);

-- Table: conversation_tasks
CREATE TABLE IF NOT EXISTS public."conversation_tasks" (
  "assigned_to" text,
  "completed_at" timestamptz DEFAULT now(),
  "contact_id" uuid,
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "description" text,
  "due_date" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "priority" text NOT NULL,
  "status" text NOT NULL,
  "title" text NOT NULL,
  "updated_at" timestamptz DEFAULT now()
);

-- Table: conversations
CREATE TABLE IF NOT EXISTS public."conversations" (
  "contact_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "pinned_by" text NOT NULL,
  "position" bigint NOT NULL
);

-- Table: csat_auto_config
CREATE TABLE IF NOT EXISTS public."csat_auto_config" (
  "created_at" timestamptz DEFAULT now(),
  "delay_minutes" bigint,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_enabled" boolean DEFAULT false,
  "message_template" text,
  "updated_at" timestamptz DEFAULT now(),
  "updated_by" text,
  "whatsapp_connection_id" uuid
);

-- Table: csat_surveys
CREATE TABLE IF NOT EXISTS public."csat_surveys" (
  "agent_id" uuid NOT NULL,
  "contact_id" uuid NOT NULL,
  "conversation_resolved_at" timestamptz DEFAULT now(),
  "created_at" timestamptz DEFAULT now(),
  "feedback" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "rating" bigint NOT NULL
);

-- Table: custom_emojis
CREATE TABLE IF NOT EXISTS public."custom_emojis" (
  "category" text,
  "created_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "image_url" text NOT NULL,
  "is_favorite" boolean DEFAULT false,
  "name" text NOT NULL,
  "updated_at" timestamptz DEFAULT now(),
  "uploaded_by" text,
  "use_count" bigint
);

-- Table: deal_activities
CREATE TABLE IF NOT EXISTS public."deal_activities" (
  "activity_type" text NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "deal_id" uuid NOT NULL,
  "description" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "performed_by" text
);

-- Table: departments
CREATE TABLE IF NOT EXISTS public."departments" (
  "created_at" timestamptz DEFAULT now(),
  "description" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_active" boolean DEFAULT false,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "updated_at" timestamptz DEFAULT now()
);

-- Table: email_threads
CREATE TABLE IF NOT EXISTS public."email_threads" (
  "assigned_to" text,
  "contact_id" uuid,
  "created_at" timestamptz DEFAULT now(),
  "gmail_account_id" uuid NOT NULL,
  "gmail_thread_id" uuid NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_important" boolean DEFAULT false,
  "is_starred" boolean DEFAULT false,
  "is_unread" boolean DEFAULT false,
  "label_ids" text NOT NULL,
  "last_message_at" timestamptz DEFAULT now(),
  "message_count" bigint NOT NULL,
  "priority" text NOT NULL,
  "snippet" text NOT NULL,
  "status" text NOT NULL,
  "subject" text NOT NULL,
  "tags" text NOT NULL,
  "updated_at" timestamptz DEFAULT now()
);

-- Table: entity_versions
CREATE TABLE IF NOT EXISTS public."entity_versions" (
  "change_summary" text,
  "changed_by" text,
  "created_at" timestamptz DEFAULT now(),
  "data" jsonb DEFAULT '{}'::jsonb,
  "entity_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "version_number" bigint NOT NULL
);

-- Table: evolution_retry_metrics
CREATE TABLE IF NOT EXISTS public."evolution_retry_metrics" (
  "action" text NOT NULL,
  "attempt_count" bigint NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "final_http_status" bigint,
  "final_status" text NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "idempotency_key" text,
  "instance_name" text,
  "method" text NOT NULL,
  "retry_reasons" jsonb DEFAULT '{}'::jsonb,
  "total_duration_ms" bigint
);

-- Table: evolution_send_idempotency
CREATE TABLE IF NOT EXISTS public."evolution_send_idempotency" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "created_at" timestamptz DEFAULT now(),
  "expires_at" timestamptz DEFAULT now(),
  "external_message_id" uuid,
  "http_status" bigint NOT NULL,
  "idem_key" text NOT NULL,
  "instance_name" text NOT NULL,
  "path" text NOT NULL,
  "response" jsonb DEFAULT '{}'::jsonb
);

-- Table: failed_messages
CREATE TABLE IF NOT EXISTS public."failed_messages" (
  "created_at" timestamptz DEFAULT now(),
  "error_code" text,
  "error_message" text,
  "http_status" bigint,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "idempotency_key" text,
  "instance_name" text NOT NULL,
  "last_attempt_at" timestamptz DEFAULT now(),
  "last_retry_reason" text,
  "max_retries" bigint NOT NULL,
  "next_attempt_at" timestamptz DEFAULT now(),
  "payload" jsonb DEFAULT '{}'::jsonb,
  "remote_jid" text,
  "retry_count" bigint NOT NULL,
  "status" text NOT NULL,
  "succeeded_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);

-- Table: favorite_contacts
CREATE TABLE IF NOT EXISTS public."favorite_contacts" (
  "contact_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL
);

-- Table: followup_executions
CREATE TABLE IF NOT EXISTS public."followup_executions" (
  "completed_at" timestamptz DEFAULT now(),
  "contact_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "current_step" bigint,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "next_step_at" timestamptz DEFAULT now(),
  "sequence_id" uuid NOT NULL,
  "started_at" timestamptz DEFAULT now(),
  "status" text NOT NULL
);

-- Table: followup_sequences
CREATE TABLE IF NOT EXISTS public."followup_sequences" (
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_active" boolean DEFAULT false,
  "name" text NOT NULL,
  "trigger_event" text NOT NULL,
  "updated_at" timestamptz DEFAULT now(),
  "whatsapp_connection_id" uuid
);

-- Table: followup_steps
CREATE TABLE IF NOT EXISTS public."followup_steps" (
  "created_at" timestamptz DEFAULT now(),
  "delay_hours" bigint NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_active" boolean DEFAULT false,
  "message_template" text NOT NULL,
  "message_type" text NOT NULL,
  "sequence_id" uuid NOT NULL,
  "step_order" bigint NOT NULL
);

-- Table: geo_blocking_settings
CREATE TABLE IF NOT EXISTS public."geo_blocking_settings" (
  "created_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "mode" text NOT NULL,
  "updated_at" timestamptz DEFAULT now(),
  "updated_by" text
);

-- Table: global_settings
CREATE TABLE IF NOT EXISTS public."global_settings" (
  "created_at" timestamptz DEFAULT now(),
  "description" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "key" text NOT NULL,
  "updated_at" timestamptz DEFAULT now(),
  "updated_by" text,
  "value" text
);

-- Table: gmail_accounts
CREATE TABLE IF NOT EXISTS public."gmail_accounts" (
  "access_token_encrypted" text,
  "created_at" timestamptz DEFAULT now(),
  "email_address" text NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_active" boolean DEFAULT false,
  "last_error" text,
  "last_sync_at" timestamptz DEFAULT now(),
  "refresh_token_encrypted" text,
  "sync_status" text NOT NULL,
  "token_expires_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "user_id" uuid NOT NULL
);

-- Table: goals_configurations
CREATE TABLE IF NOT EXISTS public."goals_configurations" (
  "created_at" timestamptz DEFAULT now(),
  "daily_target" bigint NOT NULL,
  "goal_type" text NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_active" boolean DEFAULT false,
  "monthly_target" bigint NOT NULL,
  "profile_id" uuid,
  "queue_id" uuid,
  "updated_at" timestamptz DEFAULT now(),
  "weekly_target" bigint NOT NULL
);

-- Table: hmac_selftest_audit
CREATE TABLE IF NOT EXISTS public."hmac_selftest_audit" (
  "created_at" timestamptz DEFAULT now(),
  "duration_ms" bigint,
  "error" text,
  "executed_by" text,
  "good_accepted" boolean DEFAULT false,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "instance" text,
  "message" text,
  "ok" boolean DEFAULT false,
  "tampered_rejected" boolean DEFAULT false
);

-- Table: ip_whitelist
CREATE TABLE IF NOT EXISTS public."ip_whitelist" (
  "added_by" text,
  "created_at" timestamptz DEFAULT now(),
  "description" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "ip_address" text NOT NULL
);

-- Table: knowledge_base_articles
CREATE TABLE IF NOT EXISTS public."knowledge_base_articles" (
  "category" text,
  "content" text NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "embedding" text,
  "embedding_status" text,
  "embedding_updated_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_published" boolean DEFAULT false,
  "search_vector" text NOT NULL,
  "tags" text,
  "title" text NOT NULL,
  "updated_at" timestamptz DEFAULT now()
);

-- Table: knowledge_base_files
CREATE TABLE IF NOT EXISTS public."knowledge_base_files" (
  "article_id" uuid,
  "created_at" timestamptz DEFAULT now(),
  "extracted_text" text,
  "file_name" text NOT NULL,
  "file_size" bigint,
  "file_type" text,
  "file_url" text NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "processing_status" text
);

-- Table: message_reactions
CREATE TABLE IF NOT EXISTS public."message_reactions" (
  "contact_id" uuid,
  "created_at" timestamptz DEFAULT now(),
  "emoji" text NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "message_id" uuid NOT NULL,
  "user_id" uuid
);

-- Table: message_templates
CREATE TABLE IF NOT EXISTS public."message_templates" (
  "category" text,
  "content" text NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_global" boolean DEFAULT false,
  "shortcut" text,
  "title" text NOT NULL,
  "updated_at" timestamptz DEFAULT now(),
  "use_count" bigint,
  "user_id" uuid NOT NULL
);

-- Table: meta_capi_events
CREATE TABLE IF NOT EXISTS public."meta_capi_events" (
  "action_source" text,
  "contact_id" uuid,
  "created_at" timestamptz DEFAULT now(),
  "custom_data" jsonb DEFAULT '{}'::jsonb,
  "event_name" text NOT NULL,
  "event_source_url" text,
  "event_time" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "meta_response" jsonb DEFAULT '{}'::jsonb,
  "pixel_id" uuid,
  "sent_to_meta" boolean DEFAULT false
);

-- Table: nps_surveys
CREATE TABLE IF NOT EXISTS public."nps_surveys" (
  "agent_id" uuid,
  "contact_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "feedback" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "score" bigint NOT NULL,
  "survey_type" text NOT NULL
);

-- Table: number_reputation
CREATE TABLE IF NOT EXISTS public."number_reputation" (
  "complaints_count" bigint NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "daily_limit" bigint,
  "failures_today" bigint NOT NULL,
  "health_score" bigint NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "last_reset_at" timestamptz DEFAULT now(),
  "messages_sent_today" bigint NOT NULL,
  "updated_at" timestamptz DEFAULT now(),
  "warmup_day" bigint,
  "warmup_status" text NOT NULL,
  "whatsapp_connection_id" uuid NOT NULL
);

-- Table: passkey_credentials
CREATE TABLE IF NOT EXISTS public."passkey_credentials" (
  "backed_up" boolean DEFAULT false,
  "counter" bigint NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "credential_id" uuid NOT NULL,
  "device_type" text,
  "friendly_name" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "last_used_at" timestamptz DEFAULT now(),
  "public_key" text NOT NULL,
  "transports" text,
  "user_id" uuid NOT NULL
);

-- Table: password_reset_requests
CREATE TABLE IF NOT EXISTS public."password_reset_requests" (
  "created_at" timestamptz DEFAULT now(),
  "email" text NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "ip_address" text,
  "reason" text,
  "rejection_reason" text,
  "reviewed_at" timestamptz DEFAULT now(),
  "reviewed_by" text,
  "status" text NOT NULL,
  "token_expires_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  "user_agent" text,
  "user_id" uuid NOT NULL
);

-- Table: payment_links
CREATE TABLE IF NOT EXISTS public."payment_links" (
  "amount" bigint NOT NULL,
  "contact_id" uuid,
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "currency" text,
  "deal_id" uuid,
  "description" text,
  "expires_at" timestamptz DEFAULT now(),
  "external_id" uuid,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "paid_at" timestamptz DEFAULT now(),
  "payment_method" text,
  "payment_url" text,
  "status" text,
  "title" text NOT NULL,
  "updated_at" timestamptz DEFAULT now()
);

-- Table: performance_snapshots
CREATE TABLE IF NOT EXISTS public."performance_snapshots" (
  "created_at" timestamptz DEFAULT now(),
  "dom_nodes" bigint,
  "dom_ready" bigint,
  "fcp" bigint,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "memory_total" bigint,
  "memory_used" bigint,
  "network_type" text,
  "overall_score" bigint,
  "page_load" bigint,
  "profile_id" uuid NOT NULL,
  "rtt" bigint,
  "ttfb" bigint,
  "user_agent" text
);

-- Table: pinned_conversations
CREATE TABLE IF NOT EXISTS public."pinned_conversations" (
  "contact_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "pinned_by" text NOT NULL,
  "position" bigint NOT NULL
);

-- Table: playbooks
CREATE TABLE IF NOT EXISTS public."playbooks" (
  "category" text NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "description" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_active" boolean DEFAULT false,
  "name" text NOT NULL,
  "steps" jsonb DEFAULT '{}'::jsonb,
  "updated_at" timestamptz DEFAULT now()
);

-- Table: products
CREATE TABLE IF NOT EXISTS public."products" (
  "category" text,
  "created_at" timestamptz DEFAULT now(),
  "currency" text NOT NULL,
  "description" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "image_url" text,
  "is_active" boolean DEFAULT false,
  "name" text NOT NULL,
  "price" bigint NOT NULL,
  "retailer_id" uuid,
  "sku" text,
  "stock_quantity" bigint,
  "updated_at" timestamptz DEFAULT now(),
  "whatsapp_connection_id" uuid
);

-- Table: provider_configs
CREATE TABLE IF NOT EXISTS public."provider_configs" (
  "auth_token" text,
  "base_url" text NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_active" boolean DEFAULT false,
  "last_error" text,
  "last_ping_at" timestamptz DEFAULT now(),
  "last_ping_latency_ms" bigint,
  "name" text NOT NULL,
  "priority" bigint NOT NULL,
  "provider_type" text NOT NULL,
  "status" text NOT NULL,
  "updated_at" timestamptz DEFAULT now()
);

-- Table: qr_attempts
CREATE TABLE IF NOT EXISTS public."qr_attempts" (
  "connected_at" timestamptz DEFAULT now(),
  "connection_id" uuid,
  "connection_name" text,
  "created_at" timestamptz DEFAULT now(),
  "error_message" text,
  "expired_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "instance_id" uuid NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "requested_by" text,
  "status" text NOT NULL,
  "updated_at" timestamptz DEFAULT now()
);

-- Table: queue_goals
CREATE TABLE IF NOT EXISTS public."queue_goals" (
  "alerts_enabled" boolean DEFAULT false,
  "created_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "max_avg_wait_minutes" bigint,
  "max_messages_pending" bigint,
  "max_waiting_contacts" bigint,
  "min_assignment_rate" bigint,
  "queue_id" uuid NOT NULL,
  "updated_at" timestamptz DEFAULT now()
);

-- Table: queue_positions
CREATE TABLE IF NOT EXISTS public."queue_positions" (
  "contact_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "entered_at" timestamptz DEFAULT now(),
  "estimated_wait_minutes" bigint,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "notified" boolean DEFAULT false,
  "position" bigint NOT NULL,
  "queue_id" uuid NOT NULL
);

-- Table: queue_skill_requirements
CREATE TABLE IF NOT EXISTS public."queue_skill_requirements" (
  "created_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "min_level" bigint,
  "queue_id" uuid NOT NULL,
  "skill_name" text NOT NULL
);

-- Table: rate_limit_configs
CREATE TABLE IF NOT EXISTS public."rate_limit_configs" (
  "block_duration_minutes" bigint NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "endpoint_pattern" text NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_active" boolean DEFAULT false,
  "max_requests" bigint NOT NULL,
  "name" text NOT NULL,
  "updated_at" timestamptz DEFAULT now(),
  "window_seconds" bigint NOT NULL
);

-- Table: reminders
CREATE TABLE IF NOT EXISTS public."reminders" (
  "contact_id" uuid,
  "created_at" timestamptz DEFAULT now(),
  "description" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_dismissed" boolean DEFAULT false,
  "profile_id" uuid NOT NULL,
  "remind_at" timestamptz DEFAULT now(),
  "title" text NOT NULL
);

-- Table: route_permissions
CREATE TABLE IF NOT EXISTS public."route_permissions" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "allowed_roles" text NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "description" text,
  "is_system" boolean DEFAULT false,
  "path" text NOT NULL,
  "updated_at" timestamptz DEFAULT now(),
  "updated_by" text
);

-- Table: sales_deals
CREATE TABLE IF NOT EXISTS public."sales_deals" (
  "assigned_to" text,
  "contact_id" uuid,
  "created_at" timestamptz DEFAULT now(),
  "currency" text,
  "expected_close_date" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "lost_at" timestamptz DEFAULT now(),
  "lost_reason" text,
  "notes" text,
  "priority" text,
  "stage_id" uuid,
  "status" text,
  "tags" text,
  "title" text NOT NULL,
  "updated_at" timestamptz DEFAULT now(),
  "value" bigint,
  "won_at" timestamptz DEFAULT now()
);

-- Table: sales_pipeline_stages
CREATE TABLE IF NOT EXISTS public."sales_pipeline_stages" (
  "color" text NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_active" boolean DEFAULT false,
  "name" text NOT NULL,
  "position" bigint NOT NULL,
  "updated_at" timestamptz DEFAULT now()
);

-- Table: saved_filters
CREATE TABLE IF NOT EXISTS public."saved_filters" (
  "created_at" timestamptz DEFAULT now(),
  "entity_type" text NOT NULL,
  "filters" jsonb DEFAULT '{}'::jsonb,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_default" boolean DEFAULT false,
  "is_shared" boolean DEFAULT false,
  "name" text NOT NULL,
  "updated_at" timestamptz DEFAULT now(),
  "user_id" uuid NOT NULL
);

-- Table: scheduled_messages
CREATE TABLE IF NOT EXISTS public."scheduled_messages" (
  "contact_id" uuid NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "error_message" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "media_url" text,
  "message_type" text NOT NULL,
  "scheduled_at" timestamptz DEFAULT now(),
  "sent_at" timestamptz DEFAULT now(),
  "status" text NOT NULL,
  "updated_at" timestamptz DEFAULT now(),
  "whatsapp_connection_id" uuid
);

-- Table: scheduled_report_configs
CREATE TABLE IF NOT EXISTS public."scheduled_report_configs" (
  "config" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "frequency" text NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_active" boolean DEFAULT false,
  "last_sent_at" timestamptz DEFAULT now(),
  "name" text NOT NULL,
  "next_send_at" timestamptz DEFAULT now(),
  "recipients" text NOT NULL,
  "report_type" text NOT NULL,
  "updated_at" timestamptz DEFAULT now()
);

-- Table: scheduled_reports
CREATE TABLE IF NOT EXISTS public."scheduled_reports" (
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "format" text NOT NULL,
  "frequency" text NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_active" boolean DEFAULT false,
  "last_sent_at" timestamptz DEFAULT now(),
  "name" text NOT NULL,
  "next_send_at" timestamptz DEFAULT now(),
  "recipients" text NOT NULL,
  "report_type" text NOT NULL,
  "updated_at" timestamptz DEFAULT now()
);

-- Table: security_alerts
CREATE TABLE IF NOT EXISTS public."security_alerts" (
  "alert_type" text NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "description" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "ip_address" text,
  "is_resolved" boolean DEFAULT false,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "resolved_at" timestamptz DEFAULT now(),
  "resolved_by" text,
  "severity" text NOT NULL,
  "title" text NOT NULL,
  "user_id" uuid
);

-- Table: sicoob_contact_mapping
CREATE TABLE IF NOT EXISTS public."sicoob_contact_mapping" (
  "contact_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "sicoob_singular_id" uuid NOT NULL,
  "sicoob_user_id" uuid NOT NULL,
  "sicoob_vendedor_id" uuid NOT NULL,
  "zappweb_agent_id" uuid
);

-- Table: sla_alert_preferences
CREATE TABLE IF NOT EXISTS public."sla_alert_preferences" (
  "alert_first_response" boolean DEFAULT false,
  "alert_resolution" boolean DEFAULT false,
  "created_at" timestamptz DEFAULT now(),
  "enabled" boolean DEFAULT false,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "severity_breached" boolean DEFAULT false,
  "severity_warning" boolean DEFAULT false,
  "updated_at" timestamptz DEFAULT now(),
  "user_id" uuid NOT NULL
);

-- Table: sla_configurations
CREATE TABLE IF NOT EXISTS public."sla_configurations" (
  "created_at" timestamptz DEFAULT now(),
  "first_response_minutes" bigint NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_active" boolean DEFAULT false,
  "is_default" boolean DEFAULT false,
  "name" text NOT NULL,
  "priority" text NOT NULL,
  "resolution_minutes" bigint NOT NULL,
  "updated_at" timestamptz DEFAULT now()
);

-- Table: sla_rules
CREATE TABLE IF NOT EXISTS public."sla_rules" (
  "agent_id" uuid,
  "company" text,
  "contact_id" uuid,
  "contact_type" text,
  "created_at" timestamptz DEFAULT now(),
  "first_response_minutes" bigint NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_active" boolean DEFAULT false,
  "job_title" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "name" text NOT NULL,
  "priority" bigint NOT NULL,
  "queue_id" uuid,
  "resolution_minutes" bigint NOT NULL,
  "updated_at" timestamptz DEFAULT now()
);

-- Table: stress_test_runs
CREATE TABLE IF NOT EXISTS public."stress_test_runs" (
  "abort_reason" text,
  "ended_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "instance_name" text NOT NULL,
  "results" jsonb DEFAULT '{}'::jsonb,
  "started_at" timestamptz DEFAULT now(),
  "started_by" text NOT NULL,
  "status" text NOT NULL,
  "target_phone" text NOT NULL,
  "total_failed" bigint NOT NULL,
  "total_planned" bigint NOT NULL,
  "total_sent" bigint NOT NULL
);

-- Table: tags
CREATE TABLE IF NOT EXISTS public."tags" (
  "confidence" bigint,
  "contact_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "source" text,
  "tag_name" text NOT NULL
);

-- Table: talkx_blacklist
CREATE TABLE IF NOT EXISTS public."talkx_blacklist" (
  "blocked_by" text,
  "contact_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "reason" text
);

-- Table: talkx_campaigns
CREATE TABLE IF NOT EXISTS public."talkx_campaigns" (
  "completed_at" timestamptz DEFAULT now(),
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "delivered_count" bigint NOT NULL,
  "failed_count" bigint NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "media_type" text,
  "media_url" text,
  "message_template" text NOT NULL,
  "name" text NOT NULL,
  "scheduled_at" timestamptz DEFAULT now(),
  "send_interval_max" bigint NOT NULL,
  "send_interval_min" bigint NOT NULL,
  "sent_count" bigint NOT NULL,
  "started_at" timestamptz DEFAULT now(),
  "status" text NOT NULL,
  "total_recipients" bigint NOT NULL,
  "typing_delay_max" bigint NOT NULL,
  "typing_delay_min" bigint NOT NULL,
  "updated_at" timestamptz DEFAULT now(),
  "variables_config" jsonb DEFAULT '{}'::jsonb,
  "whatsapp_connection_id" uuid
);

-- Table: talkx_recipients
CREATE TABLE IF NOT EXISTS public."talkx_recipients" (
  "campaign_id" uuid NOT NULL,
  "contact_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "delivered_at" timestamptz DEFAULT now(),
  "error_message" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "personalized_message" text,
  "request_id" uuid,
  "sent_at" timestamptz DEFAULT now(),
  "status" text NOT NULL,
  "updated_at" timestamptz DEFAULT now()
);

-- Table: team_conversation_members
CREATE TABLE IF NOT EXISTS public."team_conversation_members" (
  "conversation_id" uuid NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_muted" boolean DEFAULT false,
  "joined_at" timestamptz DEFAULT now(),
  "last_read_at" timestamptz DEFAULT now(),
  "profile_id" uuid NOT NULL
);

-- Table: team_conversations
CREATE TABLE IF NOT EXISTS public."team_conversations" (
  "avatar_url" text,
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "name" text,
  "type" text NOT NULL,
  "updated_at" timestamptz DEFAULT now()
);

-- Table: team_messages
CREATE TABLE IF NOT EXISTS public."team_messages" (
  "content" text NOT NULL,
  "conversation_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_edited" boolean DEFAULT false,
  "media_type" text,
  "media_url" text,
  "message_type" text NOT NULL,
  "reply_to_id" uuid,
  "sender_id" uuid NOT NULL,
  "updated_at" timestamptz DEFAULT now()
);

-- Table: training_sessions
CREATE TABLE IF NOT EXISTS public."training_sessions" (
  "completed_at" timestamptz DEFAULT now(),
  "created_at" timestamptz DEFAULT now(),
  "feedback" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "messages" jsonb DEFAULT '{}'::jsonb,
  "profile_id" uuid NOT NULL,
  "scenario_name" text NOT NULL,
  "scenario_type" text,
  "score" bigint,
  "started_at" timestamptz DEFAULT now(),
  "status" text
);

-- Table: user_devices
CREATE TABLE IF NOT EXISTS public."user_devices" (
  "browser" text,
  "city" text,
  "country" text,
  "created_at" timestamptz DEFAULT now(),
  "device_fingerprint" text NOT NULL,
  "device_name" text,
  "first_seen_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "ip_address" text,
  "is_trusted" boolean DEFAULT false,
  "last_seen_at" timestamptz DEFAULT now(),
  "os" text,
  "user_id" uuid NOT NULL
);

-- Table: user_sessions
CREATE TABLE IF NOT EXISTS public."user_sessions" (
  "device_id" uuid,
  "ended_at" timestamptz DEFAULT now(),
  "expires_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "ip_address" text,
  "is_active" boolean DEFAULT false,
  "last_activity_at" timestamptz DEFAULT now(),
  "started_at" timestamptz DEFAULT now(),
  "user_agent" text,
  "user_id" uuid NOT NULL
);

-- Table: user_settings
CREATE TABLE IF NOT EXISTS public."user_settings" (
  "auto_assignment_enabled" boolean DEFAULT false,
  "auto_assignment_method" text,
  "auto_transcription_enabled" boolean DEFAULT false,
  "away_message" text,
  "browser_notifications_enabled" boolean DEFAULT false,
  "business_hours_enabled" boolean DEFAULT false,
  "business_hours_end" text,
  "business_hours_start" text,
  "closing_message" text,
  "compact_mode" boolean DEFAULT false,
  "created_at" timestamptz DEFAULT now(),
  "goal_sound_type" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "inactivity_timeout" bigint,
  "inbox_filters" jsonb DEFAULT '{}'::jsonb,
  "language" text,
  "mention_sound_type" text,
  "message_sound_type" text,
  "quiet_hours_enabled" boolean DEFAULT false,
  "quiet_hours_end" text,
  "quiet_hours_start" text,
  "sentiment_alert_enabled" boolean DEFAULT false,
  "sentiment_alert_threshold" bigint,
  "sentiment_consecutive_count" bigint,
  "sla_sound_type" text,
  "sound_enabled" boolean DEFAULT false,
  "theme" text,
  "transcription_notification_enabled" boolean DEFAULT false,
  "transcription_sound_type" text,
  "tts_speed" bigint,
  "tts_voice_id" uuid,
  "updated_at" timestamptz DEFAULT now(),
  "user_id" uuid NOT NULL,
  "welcome_message" text,
  "work_days" text
);

-- Table: warroom_alerts
CREATE TABLE IF NOT EXISTS public."warroom_alerts" (
  "alert_type" text NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "dismissed_by" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_read" boolean DEFAULT false,
  "message" text NOT NULL,
  "resolved_at" timestamptz DEFAULT now(),
  "resolved_reason" text,
  "source" text,
  "title" text NOT NULL
);

-- Table: whatsapp_connection_queues
CREATE TABLE IF NOT EXISTS public."whatsapp_connection_queues" (
  "created_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "queue_id" uuid NOT NULL,
  "whatsapp_connection_id" uuid NOT NULL
);

-- Table: whatsapp_flows
CREATE TABLE IF NOT EXISTS public."whatsapp_flows" (
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "description" text,
  "flow_json" jsonb DEFAULT '{}'::jsonb,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "name" text NOT NULL,
  "published_at" timestamptz DEFAULT now(),
  "screens" jsonb DEFAULT '{}'::jsonb,
  "status" text,
  "updated_at" timestamptz DEFAULT now(),
  "whatsapp_connection_id" uuid,
  "whatsapp_flow_id" uuid
);

-- Table: whatsapp_groups
CREATE TABLE IF NOT EXISTS public."whatsapp_groups" (
  "avatar_url" text,
  "category" text,
  "created_at" timestamptz DEFAULT now(),
  "description" text,
  "group_id" uuid NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_admin" boolean DEFAULT false,
  "name" text NOT NULL,
  "participant_count" bigint,
  "updated_at" timestamptz DEFAULT now(),
  "whatsapp_connection_id" uuid
);

-- Table: whatsapp_official_credentials
CREATE TABLE IF NOT EXISTS public."whatsapp_official_credentials" (
  "access_token" text NOT NULL,
  "app_secret" text NOT NULL,
  "business_account_id" uuid,
  "connection_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "graph_api_version" text NOT NULL,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "phone_number_id" uuid NOT NULL,
  "updated_at" timestamptz DEFAULT now(),
  "verify_token" text NOT NULL,
  "waba_id" uuid
);

-- Table: whatsapp_templates
CREATE TABLE IF NOT EXISTS public."whatsapp_templates" (
  "buttons" jsonb DEFAULT '{}'::jsonb,
  "category" text NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "created_by" text,
  "footer_text" text,
  "header_text" text,
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "language" text NOT NULL,
  "name" text NOT NULL,
  "status" text NOT NULL,
  "updated_at" timestamptz DEFAULT now(),
  "variables" text,
  "whatsapp_connection_id" uuid
);

-- Table: whisper_messages
CREATE TABLE IF NOT EXISTS public."whisper_messages" (
  "contact_id" uuid NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "is_read" boolean DEFAULT false,
  "sender_id" uuid NOT NULL,
  "target_agent_id" uuid NOT NULL
);

COMMIT;

-- 15 tables not found in types.ts - creating with sensible defaults

CREATE TABLE IF NOT EXISTS public.app_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value jsonb DEFAULT '{}'::jsonb,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.avatars (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  url text NOT NULL,
  name text,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contact_audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id uuid,
  action text NOT NULL,
  changes jsonb DEFAULT '{}'::jsonb,
  performed_by uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversation_summaries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid,
  summary text,
  generated_by text DEFAULT 'ai',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.conversation_transfers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid,
  from_agent_id uuid,
  to_agent_id uuid,
  reason text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  subject text,
  body text,
  category text,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gmail_daily_metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id uuid,
  date date NOT NULL,
  sent_count bigint DEFAULT 0,
  received_count bigint DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gmail_drafts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id uuid,
  gmail_id text,
  subject text,
  body text,
  to_addresses jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gmail_labels (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id uuid,
  gmail_id text,
  name text NOT NULL,
  type text,
  color text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gmail_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id uuid,
  thread_id uuid,
  gmail_id text,
  subject text,
  body text,
  from_address text,
  to_addresses jsonb DEFAULT '[]'::jsonb,
  labels jsonb DEFAULT '[]'::jsonb,
  is_read boolean DEFAULT false,
  received_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gmail_signatures (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id uuid,
  name text NOT NULL,
  content text,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gmail_threads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id uuid,
  gmail_thread_id text,
  subject text,
  snippet text,
  last_message_at timestamptz,
  message_count bigint DEFAULT 0,
  is_read boolean DEFAULT false,
  labels jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.imap_smtp_accounts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  email text NOT NULL,
  display_name text,
  imap_host text,
  imap_port bigint DEFAULT 993,
  smtp_host text,
  smtp_port bigint DEFAULT 587,
  username text,
  password_encrypted text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.salespeople (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  name text NOT NULL,
  email text,
  phone text,
  team text,
  quota numeric DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value jsonb DEFAULT '{}'::jsonb,
  description text,
  category text DEFAULT 'general',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
