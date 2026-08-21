# Modulos inativos — tabelas zapp sem dados (F-009)

> Gerado em 2026-08-20 (plano 100 etapas, etapa 77). 242 tabelas do schema zapp
> sem linhas em producao (reltuples=0). NADA aqui foi dropado — decisao de produto futura.
> Todos ja possuem COMMENT no banco apontando para este registro.
> Criterio: modulo declarado no comment quando existe; senao agrupamento por prefixo.

| Modulo / prefixo | Qtd | Tabelas |
|---|---:|---|
| prefixo:evolution | 26 | evolution_automation_logs, evolution_bitrix_queue, evolution_contact_rate_limits, evolution_fallback_events, evolution_followups, evolution_group_messages, evolution_group_rules, evolution_ip_blocklist, evolution_keyword_automations, evolution_label_associations, evolution_license_health_log, evolution_message_queue, evolution_message_templates, evolution_mirror_batches, evolution_mirror_checkpoints, evolution_mirror_media_queue, evolution_mirror_runs, evolution_sales_pipeline, evolution_scheduled_messages, evolution_send_idempotency, evolution_sentiment_analysis, evolution_source_schema_map, evolution_status_reactions, evolution_tag_assignments, evolution_template_usage, evolution_webhook_dlq |
| prefixo:conversation | 12 | conversation_analyses, conversation_audit_logs, conversation_closures, conversation_memory, conversation_participants, conversation_pins, conversation_sla, conversation_snoozes, conversation_summaries, conversation_tasks, conversation_threads, conversation_transfers |
| prefixo:contact | 8 | contact_assignments, contact_audit_log, contact_custom_fields, contact_export_log, contact_phones, contact_purchases, contact_segments, contact_tags |
| Agents | 7 | agent_achievements, agent_installed_skills, agent_memories, agent_presence, agent_skills, agent_visibility_grants, agents |
| prefixo:webhook | 7 | webhook_endpoints, webhook_event_dedup, webhook_events, webhook_health_checks, webhook_idempotency, webhook_preferences, webhook_reprocess_queue |
| prefixo:queue | 6 | queue_analytics, queue_goals, queue_items, queue_positions, queue_routing_rules, queue_skill_requirements |
| prefixo:message | 5 | message_attempts, message_audit_log, message_queue, message_reports, message_templates |
| prefixo:system | 5 | system_connections, system_docs, system_health_incidents, system_logs, system_settings |
| prefixo:channel | 4 | channel_connections, channel_provider_routes, channel_queues, channel_routing_rules |
| prefixo:scheduled | 4 | scheduled_job_log, scheduled_messages, scheduled_report_runs, scheduled_reports |
| prefixo:whatsapp | 4 | whatsapp_connection_queues, whatsapp_flows, whatsapp_official_credentials, whatsapp_templates |
| Providers | 4 | provider_configs, provider_message_log, provider_session_logs, provider_sessions |
| SLA | 4 | sla_alert_preferences, sla_configurations, sla_rules, sla_violations |
| Campaigns | 3 | campaign_ab_variants, campaign_contacts, campaigns |
| Follow-up | 3 | followup_executions, followup_sequences, followup_steps |
| prefixo:notification | 3 | notification_channels_config, notification_delivery_log, notification_templates |
| prefixo:user | 3 | user_devices, user_service_accounts, user_sessions |
| Security | 3 | security_alerts, security_audit_logs, security_events |
| TalkX | 3 | talkx_blacklist, talkx_campaigns, talkx_recipients |
| Chatbot Flows | 2 | chatbot_executions, chatbot_flows |
| E-mail | 2 | email_revalidation_jobs, email_watch_history |
| LGPD | 2 | lgpd_consent_audit, lgpd_consent_audit_archive |
| prefixo:ai | 2 | ai_conversation_tags, ai_function_metrics |
| prefixo:app | 2 | app_error_logs, app_settings |
| prefixo:auto | 2 | auto_close_config, auto_export_jobs |
| prefixo:automation | 2 | automation_executions, automation_rules |
| prefixo:blocked | 2 | blocked_countries, blocked_ips |
| prefixo:connection | 2 | connection_alert_preferences, connection_health_logs |
| prefixo:credential | 2 | credential_audit_logs, credential_vault |
| prefixo:cron | 2 | cron_schedule_executions, cron_schedules |
| prefixo:csat | 2 | csat_auto_config, csat_responses |
| prefixo:evaluation | 2 | evaluation_datasets, evaluation_runs |
| prefixo:favorite | 2 | favorite_contacts, favorite_messages |
| prefixo:password | 2 | password_reset_requests, password_reset_tokens |
| prefixo:pinned | 2 | pinned_conversations, pinned_messages |
| prefixo:processed | 2 | processed_requests, processed_webhook_events |
| prefixo:rate | 2 | rate_limit_configs, rate_limit_logs |
| prefixo:sales | 2 | sales_deals, sales_pipeline_stages |
| prefixo:search | 2 | search_history, search_insights |
| prefixo:team | 2 | team_message_receipts, team_messages |
| prefixo:voice | 2 | voice_command_logs, voice_conversion_queue |
| prefixo:workspace | 2 | workspace_secrets, workspace_settings |
| prefixo:_consumer | 1 | _consumer_dlq |
| prefixo:alert | 1 | alert_dispatch_state |
| prefixo:alerts | 1 | alerts |
| prefixo:allowed | 1 | allowed_countries |
| prefixo:analytics | 1 | analytics_events |
| prefixo:automations | 1 | automations |
| prefixo:avatars | 1 | avatars |
| prefixo:away | 1 | away_messages |
| prefixo:batch | 1 | batch_jobs |
| prefixo:budgets | 1 | budgets |
| prefixo:business | 1 | business_hours |
| prefixo:chunks | 1 | chunks |
| prefixo:collections | 1 | collections |
| prefixo:consent | 1 | consent_records |
| prefixo:constraint | 1 | constraint_changelog |
| prefixo:crisis | 1 | crisis_room_alerts |
| prefixo:crm | 1 | crm_sync_config |
| prefixo:custom | 1 | custom_emojis |
| prefixo:dashboard | 1 | dashboard_queries |
| prefixo:data | 1 | data_deletion_requests |
| prefixo:dead | 1 | dead_letter_queue |
| prefixo:deal | 1 | deal_activities |
| prefixo:department | 1 | department_invitations |
| prefixo:departments | 1 | departments |
| prefixo:deploy | 1 | deploy_connections |
| prefixo:dlq | 1 | dlq_audit_log |
| prefixo:documents | 1 | documents |
| prefixo:emails | 1 | emails |
| prefixo:embedding | 1 | embedding_configs |
| prefixo:engineering | 1 | engineering_principles |
| prefixo:entity | 1 | entity_versions |
| prefixo:environments | 1 | environments |
| prefixo:failed | 1 | failed_messages |
| prefixo:file | 1 | file_scan_logs |
| prefixo:finetune | 1 | finetune_jobs |
| prefixo:forensic | 1 | forensic_snapshots |
| prefixo:forwarded | 1 | forwarded_messages |
| prefixo:geo | 1 | geo_blocking_settings |
| prefixo:goals | 1 | goals_configurations |
| prefixo:google | 1 | google_calendar_config |
| prefixo:hmac | 1 | hmac_selftest_audit |
| prefixo:inbox | 1 | inbox_custom_scopes |
| prefixo:installed | 1 | installed_templates |
| prefixo:integrations | 1 | integrations |
| prefixo:interactions | 1 | interactions |
| prefixo:invites | 1 | invites |
| prefixo:ip | 1 | ip_whitelist |
| prefixo:mfa | 1 | mfa_sessions |
| prefixo:n8n | 1 | n8n_config |
| prefixo:notifications | 1 | notifications |
| prefixo:number | 1 | number_reputation |
| prefixo:onboarding | 1 | onboarding_steps |
| prefixo:outbox | 1 | outbox_events |
| prefixo:passkey | 1 | passkey_credentials |
| prefixo:performance | 1 | performance_snapshots |
| prefixo:personal | 1 | personal_stickers |
| prefixo:pii | 1 | pii_access_log |
| prefixo:quick | 1 | quick_replies |
| prefixo:reminders | 1 | reminders |
| prefixo:reprocess | 1 | reprocess_jobs |
| prefixo:rls | 1 | rls_denied_log |
| prefixo:role | 1 | role_permissions |
| prefixo:roles | 1 | roles |
| prefixo:route | 1 | route_permissions |
| prefixo:saved | 1 | saved_filters |
| prefixo:sentiment | 1 | sentiment_alerts |
| prefixo:service | 1 | service_channels |
| prefixo:sessions | 1 | sessions |
| prefixo:sla | 1 | sla_history |
| prefixo:sticker | 1 | sticker_favorites |
| prefixo:sticky | 1 | sticky_assignments |
| prefixo:storage | 1 | storage_cleanup_logs |
| prefixo:stress | 1 | stress_test_runs |
| prefixo:sts | 1 | sts_telemetry |
| prefixo:supabase | 1 | supabase_projects |
| prefixo:tags | 1 | tags |
| prefixo:task | 1 | task_queues |
| prefixo:test | 1 | test_cases |
| prefixo:transfer | 1 | transfer_comments |
| prefixo:voip | 1 | voip_profile_credentials |
| prefixo:webauthn | 1 | webauthn_challenges |
| prefixo:xp | 1 | xp_transactions |

## Recomendacao

1. Modulos com dono/roadmap (ex.: Campaigns, Chatbot Flows, SLA): manter estrutura.
2. Modulos sem dono ha >6 meses: candidatos a `graveyard`/DROP em GATE futuro (aprovacao explicita).
3. Antes de qualquer DROP: verificar referencias em edge functions e no front (grep) + snapshot.