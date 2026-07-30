================================================================================
RELATÓRIO DE AUDITORIA — SCHEMA ZAPP (Supabase Self-Hosted)
================================================================================

Data: 2026-07-30
Schema auditado: zapp

────────────────────────────────────────────────────────────────────────────────
1. VISÃO GERAL
────────────────────────────────────────────────────────────────────────────────

Total de tabelas encontradas: 321
  Tabelas internas (prefixo _): 15
  Tabelas de negócio:           306

Documentação de referência alega: 312 tabelas base + 404 views
  Tabelas reais encontradas: 321 vs 312 documentadas

NOTA: A lista exata das '312 tabelas base' documentadas não está
disponível para comparação granular. Schema_migrations tem 39 entries.

────────────────────────────────────────────────────────────────────────────────
2. VIEWS NO SCHEMA ZAPP
────────────────────────────────────────────────────────────────────────────────

Views listadas (centenas): evolution_*, bpm_*, gmail_*, email_*,
v_*, vw_*, zapp_dash_*, audit_log*, e várias outras.

Views críticas que atuam como 'tabelas' no frontend:
  contacts        → View unificada sobre evo.evolution_contacts
  conversations   → View de conversas
  messages        → Bridge view: evolution_messages → ZAPP format
  ai_usage_logs   → View de uso de IA
  messages_whatsapp → View de mensagens WhatsApp
  ai_providers    → View de provedores de IA

────────────────────────────────────────────────────────────────────────────────
3. TOP 30 TABELAS/VIEWS CRÍTICAS
────────────────────────────────────────────────────────────────────────────────

 1. profiles                                   [TABLE]
    25 cols: id(uuid PK), user_id, name, email, avatar_url, role, max_chats, department, is_online, last_seen, created_at, updated_at, access_level, birthday, can_download, department_id, is_active, job_title, nickname, permissions, phone, session_invalidated_at, signature, _admin_user_id, online_status. FK: department_id→departments. 18 linhas.

 2. workspaces                                 [TABLE]
    8 cols: id(uuid PK), name, owner_id, slug, plan, config, created_at, updated_at. 1 linha.

 3. workspace_members                          [TABLE]
    8 cols: id(uuid PK), workspace_id, user_id(uq), role, email, name, invited_at, accepted_at. 15 linhas.

 4. whatsapp_connections                       [TABLE]
    39 cols: extensa (id PK, name, phone, instance_name, instance_id, api_url/key, status, qr, health_status, etc.). Unique: instance_name. 3 linhas.

 5. instance_registry                          [TABLE]
    44 cols: id PK, instance_name(uq), display_name, phone, department, operator info, proxy, api, settings, sla, etc. FK: owner_id→profiles. 22 linhas.

 6. empresas                                   [TABLE]
    6 cols: id(bigint PK), created_at, nome, email(jsonb), telefone, bitrix_empresa_id. 51.688 linhas.

 7. contatos                                   [TABLE]
    8 cols: id(bigint PK), created_at, nome, telefone, bitrix_empresa_id, bitrix_contato_id, sobrenome, email. 3.236 linhas.

 8. departments                                [TABLE]
    10 cols: id(uuid PK), name(uq), slug, description, is_active, created_at, updated_at, whatsapp_mode, whatsapp_api_key, whatsapp_instance_id. 0 linhas ativas.

 9. queues                                     [TABLE]
    31 cols: id(uuid PK), name(uq), description, color, icon, is_active, max_capacity, auto_assign, round_robin, priority, sla_policy_id, business_hours, etc. FKs: department_id→departments, sla_policy_id→sla_policies. 0 linhas.

10. webhook_audit_log                          [TABLE]
    16 cols: id(uuid PK), webhook_source, endpoint, method, status_code, request_body, response_body, duration_ms, created_at, request_id, status, error_message, instance, event_type, message_id, received_at. 258.075 linhas (93 MB!).

11. webhook_events_processed                   [TABLE]
    11 cols: id(uuid PK), event_id(uq), webhook_source, event_type, processed_at, idempotency_key(uq), instance, request_id, responded, message_key_id(uq), payload. 231.500 linhas (111 MB!).

12. app_notifications                          [TABLE]
    11 cols: id(uuid PK), user_id, title, body, type, entity_type, entity_id, is_read, action_url, metadata, created_at. 11.943 linhas.

13. audit_logs                                 [TABLE]
    12 cols: id(uuid PK), action, created_at, details, entity_id, entity_type, ip_address, user_agent, user_id, event_type, resource, status. 6.824 linhas.

14. user_roles                                 [TABLE]
    7 cols: id(uuid PK), user_id(uq+workspace), role_key(uq), workspace_id, assigned_by, created_at, role(app_role enum). FK: user_id→profiles(user_id). 17 linhas.

15. contacts                                   [VIEW]
    View unificada sobre evo.evolution_contacts (schema evo). Updatable: YES. Usa funções STABLE no lugar de CTEs MATERIALIZED.

16. messages                                   [VIEW]
    Bridge view: evolution_messages → ZAPP format. Non-updatable.

17. conversations                              [VIEW]
    View de conversas. Updatable: YES.

18. message_reactions                          [TABLE]
    6 cols: id(uuid PK), contact_id, created_at, emoji, message_id, user_id. FK: user_id→profiles(id). 396 linhas. Uniques: (message_id,contact_id,emoji) e (message_id,user_id,emoji).

19. chatbot_flows                              [TABLE]
    15 cols: id(uuid PK), name, description, is_active, trigger_type, trigger_value, nodes(jsonb), edges(jsonb), variables, execution_count, etc. FK: whatsapp_connection_id→whatsapp_connections. 0 linhas.

20. campaigns                                  [TABLE]
    22 cols: id(uuid PK), name, description, status, target_type, target_filter, message_type, message_content, media_url, scheduled_at, started_at, completed_at, sent_count, delivered_count, read_count, failed_count, total_contacts, etc. FK: whatsapp_connection_id→whatsapp_connections. 0 linhas.

21. csat_surveys                               [TABLE]
    7 cols: id(uuid PK), agent_id, contact_id, conversation_resolved_at, created_at, feedback, rating. FK: agent_id→profiles. 0 linhas.

22. sla_rules                                  [TABLE]
    15 cols: id(uuid PK), name, is_active, priority, first_response_minutes, resolution_minutes, company, contact_id, contact_type, queue_id, agent_id, job_title, metadata, created_at, updated_at. FK: agent_id→profiles. 0 linhas.

23. user_settings                              [TABLE]
    36 cols: id(uuid PK), user_id(uq), theme, language, sound_enabled, message_sound_type, etc. RLS: user-scoped. 2 linhas.

24. ai_usage_logs                              [VIEW]
    View de uso de IA. Updatable: YES. Não é tabela física.

25. performance_snapshots                      [TABLE]
    14 cols: id(uuid PK), profile_id, fcp, dom_ready, dom_nodes, page_load, ttfb, rtt, memory_total, memory_used, network_type, overall_score, user_agent, created_at. 0 linhas.

26. voice_command_logs                         [TABLE]
    9 cols: id(uuid PK), user_id, transcript, action, response, data, duration_ms, success, created_at. RLS: user-scoped. 0 linhas.

27. team_messages                              [TABLE]
    12 cols: id(uuid PK), conversation_id, sender_id, content, message_type, media_type, media_url, reply_to_id, is_edited, status, created_at, updated_at. FKs: conversation_id→team_conversations, sender_id→profiles. 0 linhas. NOTA: nome real é team_messages, NÃO team_chat_messages.

28. sticker_favorites                          [TABLE]
    4 cols: id(uuid PK), user_id, sticker_id, created_at. FK: sticker_id→stickers. Unique: (user_id,sticker_id). 0 linhas.

29. auto_close_config                          [TABLE]
    7 cols: id(uuid PK), is_enabled, inactivity_hours, close_message, updated_by, created_at, updated_at. FK: updated_by→profiles. 0 linhas.

30. conversation_analyses                      [TABLE]
    16 cols: id(uuid PK), contact_id, analyzed_by, department, summary, sentiment, sentiment_score, customer_satisfaction, message_count, topics, key_points, next_steps, relationship_type, urgency, status, created_at. FK: analyzed_by→profiles. 0 linhas.

────────────────────────────────────────────────────────────────────────────────
4. ANÁLISE DE DISCREPÂNCIAS
────────────────────────────────────────────────────────────────────────────────

4.1 Discrepâncias de Nomenclatura

  Citado no request        → Nome real no banco
  ─────────────────────────────────────────────────
  team_chat_messages       → team_messages (não existe 'team_chat_messages')
  contacts (inglês)        → contacts (VIEW) + contatos (TABLE legacy)
  messages                 → messages (VIEW)
  conversations            → conversations (VIEW)
  ai_usage_logs            → ai_usage_logs (VIEW, não TABLE física)

4.2 Comparativo com Documentação (312 tabelas + 404 views)

  Tabelas reais:          321
  Documentação alega:     312 tabelas + 404 views
  Diferença (tabelas):    +9

  ⚠️  Lista exata das 312 tabelas documentadas não disponível para
     comparação granular. Views: centenas, mas impossível validar
     as 404 documentadas sem a lista de referência.

4.3 Top Tabelas por Volume de Dados

  webhook_audit_log:         258.075 linhas  (93 MB)
  webhook_events_processed:  231.500 linhas  (111 MB)
  empresas:                  51.688 linhas   (7 MB)
  contact_intelligence:      20.893 linhas   (6 MB)
  app_notifications:         11.943 linhas   (9 MB)
  media_scan_log:            11.314 linhas   (2 MB)
  media_download_queue:      9.580 linhas    (5 MB)
  audit_logs:                6.824 linhas    (2 MB)
  warroom_alerts:            3.842 linhas    (2,5 MB)

4.4 Tabelas Vazias (0 linhas estimadas)

  Dezenas de tabelas de configuração e funcionalidades futuras:
  campaigns, chatbot_flows, csat_surveys, sla_rules, queues, departments, performance_snapshots, voice_command_logs, team_messages, sticker_favorites, conversation_analyses, auto_close_config, automations, campaign_contacts, contact_notes, contact_phones, contact_purchases, conversation_events, conversation_memory, conversation_participants, conversation_threads, conversation_transfers

────────────────────────────────────────────────────────────────────────────────
5. LISTAGEM COMPLETA DAS 321 TABELAS
────────────────────────────────────────────────────────────────────────────────

(A-Z agrupadas por categoria)

  [Agentes IA (agent_*)] — 12 tabelas
    ├─ agent_achievements
    ├─ agent_installed_skills
    ├─ agent_memories
    ├─ agent_permissions
    ├─ agent_presence
    ├─ agent_skills
    ├─ agent_stats
    ├─ agent_templates
    ├─ agent_traces
    ├─ agent_usage
    ├─ agent_versions
    ├─ agent_visibility_grants

  [Alertas/Monitoria] — 2 tabelas
    ├─ alert_channels
    ├─ alert_dispatch_state

  [App/Config] — 12 tabelas
    ├─ app_error_logs
    ├─ app_notifications
    ├─ app_settings
    ├─ custom_emojis
    ├─ feature_flags
    ├─ global_settings
    ├─ system_connections
    ├─ system_docs
    ├─ system_health_incidents
    ├─ system_kill_switches
    ├─ system_logs
    ├─ system_settings

  [Auditoria] — 3 tabelas
    ├─ audit_log_tables
    ├─ audit_logs
    ├─ audit_results

  [Automação] — 2 tabelas
    ├─ automation_executions
    ├─ automation_rules

  [CSAT/SLA] — 11 tabelas
    ├─ csat_auto_config
    ├─ csat_responses
    ├─ csat_surveys
    ├─ sla_alert_preferences
    ├─ sla_configurations
    ├─ sla_delivery_rules
    ├─ sla_delivery_violations
    ├─ sla_history
    ├─ sla_policies
    ├─ sla_rules
    ├─ sla_violations

  [Campanhas/Marketing] — 2 tabelas
    ├─ campaign_ab_variants
    ├─ campaign_contacts

  [Canais] — 5 tabelas
    ├─ calls
    ├─ channel_connections
    ├─ channel_provider_routes
    ├─ channel_queues
    ├─ channel_routing_rules

  [Chatbot/IA] — 3 tabelas
    ├─ ai_conversation_tags
    ├─ chatbot_executions
    ├─ chatbot_flows

  [Contatos] — 12 tabelas
    ├─ contact_assignments
    ├─ contact_audit_log
    ├─ contact_custom_fields
    ├─ contact_export_log
    ├─ contact_id_graveyard
    ├─ contact_intelligence
    ├─ contact_notes
    ├─ contact_phones
    ├─ contact_purchases
    ├─ contact_segments
    ├─ contact_tags
    ├─ contatos

  [Conversas/Mensagens] — 18 tabelas
    ├─ conversation_analyses
    ├─ conversation_audit_logs
    ├─ conversation_closures
    ├─ conversation_events
    ├─ conversation_memory
    ├─ conversation_participants
    ├─ conversation_pins
    ├─ conversation_sla
    ├─ conversation_snoozes
    ├─ conversation_summaries
    ├─ conversation_tasks
    ├─ conversation_threads
    ├─ conversation_transfers
    ├─ message_attempts
    ├─ message_audit_log
    ├─ message_queue
    ├─ message_reactions
    ├─ message_templates

  [Cookies/Proxy] — 4 tabelas
    ├─ cookie_probe_log
    ├─ cookie_probe_pending
    ├─ proxy_alerts
    ├─ proxy_metrics

  [Cron/Schedule] — 2 tabelas
    ├─ cron_schedule_executions
    ├─ cron_schedules

  [Departamentos/Filas] — 10 tabelas
    ├─ department_invitations
    ├─ dept_mapping
    ├─ queue_analytics
    ├─ queue_goals
    ├─ queue_items
    ├─ queue_members
    ├─ queue_positions
    ├─ queue_routing_rules
    ├─ queue_skill_requirements
    ├─ queues

  [Email] — 4 tabelas
    ├─ email_health_logs
    ├─ email_health_summary
    ├─ email_revalidation_jobs
    ├─ email_watch_history

  [Empresas] — 1 tabelas
    ├─ empresas

  [Instâncias/WhatsApp] — 10 tabelas
    ├─ instance_auth_events
    ├─ instance_processing_pauses
    ├─ instance_registry
    ├─ whatsapp_cloud_webhook_pings
    ├─ whatsapp_connection_queues
    ├─ whatsapp_connections
    ├─ whatsapp_flows
    ├─ whatsapp_groups
    ├─ whatsapp_official_credentials
    ├─ whatsapp_templates

  [Integrações] — 3 tabelas
    ├─ integration_profiles
    ├─ integration_registry
    ├─ n8n_variables

  [Internas (_)] — 15 tabelas
    ├─ _audit_sim_results
    ├─ _authoritative_time
    ├─ _consumer_dlq
    ├─ _db_size_snapshots
    ├─ _encryption_keys
    ├─ _input_normalization_cache
    ├─ _lgpd_b64
    ├─ _lgpd_growth_stats
    ├─ _lgpd_payload
    ├─ _lgpd_retention_policies
    ├─ _pagination_state
    ├─ _snapshot_version_state
    ├─ _system_health_history
    ├─ _system_health_log
    ├─ _vault_corrupted_quarantine

  [LGPD/Segurança] — 4 tabelas
    ├─ consent_records
    ├─ lgpd_consent_audit
    ├─ lgpd_consent_audit_archive
    ├─ pii_access_log

  [ML/Embeddings] — 4 tabelas
    ├─ embedding_configs
    ├─ evaluation_datasets
    ├─ evaluation_runs
    ├─ finetune_jobs

  [Mídia/Arquivos] — 11 tabelas
    ├─ avatars
    ├─ chunks
    ├─ documents
    ├─ file_scan_logs
    ├─ media_cache
    ├─ media_download_queue
    ├─ media_quarantine
    ├─ media_scan_log
    ├─ media_security_alerts
    ├─ media_security_config
    ├─ media_storage_config

  [Notificações] — 2 tabelas
    ├─ notification_channels_config
    ├─ notification_templates

  [Outros] — 115 tabelas
    ├─ agents
    ├─ alerts
    ├─ allowed_countries
    ├─ api_circuit_breaker
    ├─ api_keys
    ├─ auto_close_config
    ├─ automations
    ├─ away_messages
    ├─ batch_jobs
    ├─ blocked_countries
    ├─ blocked_ips
    ├─ budgets
    ├─ business_hours
    ├─ campaigns
    ├─ client_wallet_rules
    ├─ colaboradores
    ├─ collections
    ├─ companies
    ├─ connection_alert_preferences
    ├─ connection_health_logs
    ├─ cookies_config
    ├─ credential_audit_logs
    ├─ credential_vault
    ├─ crisis_room_alerts
    ├─ dashboard_queries
    ├─ data_deletion_requests
    ├─ dead_letter_queue
    ├─ departments
    ├─ deploy_connections
    ├─ dispatch_error_logs
    ├─ dlq_audit_log
    ├─ extensions
    ├─ failed_messages
    ├─ favorite_contacts
    ├─ fn_health_score_cache
    ├─ fn_health_score_history
    ├─ followup_executions
    ├─ followup_sequences
    ├─ followup_steps
    ├─ forensic_snapshots
    ├─ forwarded_messages
    ├─ geo_blocking_settings
    ├─ goals_configurations
    ├─ hmac_selftest_audit
    ├─ inbox_custom_scopes
    ├─ installed_templates
    ├─ integrations
    ├─ interactions
    ├─ ip_whitelist
    ├─ lux_system_alerts
    ├─ notifications
    ├─ number_reputation
    ├─ onboarding_steps
    ├─ outbound_delivery_audit
    ├─ outbound_message_queue
    ├─ outbox_events
    ├─ perfis_usuarios
    ├─ performance_snapshots
    ├─ personal_stickers
    ├─ pinned_conversations
    ├─ processed_webhook_events
    ├─ provider_configs
    ├─ provider_message_log
    ├─ provider_session_logs
    ├─ provider_sessions
    ├─ qr_attempts
    ├─ query_telemetry
    ├─ quick_replies
    ├─ rate_limit_configs
    ├─ rate_limit_logs
    ├─ reconnection_logs
    ├─ reminders
    ├─ reprocess_jobs
    ├─ restore_test_log
    ├─ rls_denied_log
    ├─ roles
    ├─ rpc_rate_limits
    ├─ saved_filters
    ├─ scheduled_job_log
    ├─ scheduled_messages
    ├─ scheduled_report_configs
    ├─ scheduled_reports
    ├─ search_history
    ├─ search_insights
    ├─ security_acl_alerts
    ├─ security_alerts
    ├─ security_audit_logs
    ├─ security_events
    ├─ sentiment_alerts
    ├─ service_channels
    ├─ sicoob_contact_mapping
    ├─ sicoob_reply_outbox
    ├─ solicitacoes_vale
    ├─ stickers
    ├─ sticky_assignments
    ├─ storage_cleanup_logs
    ├─ supplier_pix_keys
    ├─ tags
    ├─ talkx_blacklist
    ├─ talkx_campaigns
    ├─ talkx_recipients
    ├─ task_queues
    ├─ team_conversation_members
    ├─ team_conversations
    ├─ team_message_reactions
    ├─ team_message_receipts
    ├─ team_messages
    ├─ tenants
    ├─ transfer_comments
    ├─ vault_healthcheck_log
    ├─ warroom_alerts
    ├─ whisper_files
    ├─ whisper_messages
    ├─ workspaces
    ├─ zapp_audit_log

  [Perfis/Usuários] — 6 tabelas
    ├─ profiles
    ├─ user_devices
    ├─ user_roles
    ├─ user_service_accounts
    ├─ user_sessions
    ├─ user_settings

  [Permissões/Roles] — 3 tabelas
    ├─ permissions
    ├─ role_permissions
    ├─ route_permissions

  [Schema/Migração] — 4 tabelas
    ├─ constraint_changelog
    ├─ entity_versions
    ├─ migration_audit
    ├─ schema_migrations

  [Sessões/Auth] — 7 tabelas
    ├─ login_attempts
    ├─ mfa_sessions
    ├─ passkey_credentials
    ├─ password_reset_requests
    ├─ password_reset_tokens
    ├─ sessions
    ├─ webauthn_challenges

  [Sistema/Dev] — 10 tabelas
    ├─ dev_diagnostic_logs
    ├─ engineering_principles
    ├─ environments
    ├─ stress_test_metrics
    ├─ stress_test_runs
    ├─ sts_performance_metrics
    ├─ sts_telemetry
    ├─ sts_troubleshooting_report
    ├─ supabase_projects
    ├─ test_cases

  [Stickers] — 2 tabelas
    ├─ sticker_categories
    ├─ sticker_favorites

  [Vendas/CRM] — 3 tabelas
    ├─ deal_activities
    ├─ sales_deals
    ├─ sales_pipeline_stages

  [Voz] — 2 tabelas
    ├─ voice_command_logs
    ├─ voice_conversion_queue

  [Webhooks] — 11 tabelas
    ├─ webhook_audit_log
    ├─ webhook_endpoints
    ├─ webhook_event_dedup
    ├─ webhook_events
    ├─ webhook_events_processed
    ├─ webhook_health_alerts
    ├─ webhook_health_checks
    ├─ webhook_idempotency
    ├─ webhook_preferences
    ├─ webhook_rate_limits
    ├─ webhook_reprocess_queue

  [Workspaces] — 3 tabelas
    ├─ workspace_members
    ├─ workspace_secrets
    ├─ workspace_settings

  [Áudio/Memes] — 3 tabelas
    ├─ audio_meme_categories
    ├─ audio_meme_favorites
    ├─ audio_memes

────────────────────────────────────────────────────────────────────────────────
6. CONSTATAÇÕES FINAIS
────────────────────────────────────────────────────────────────────────────────

  1) 321 tabelas encontradas (vs 312 documentadas) — diferença de +9
  2) Centenas de views (evolution_, bpm_, gmail_, v_, vw_, etc.)
  3) 30/30 tabelas/views críticas OK — todas existem
  4) Discrepância: 'team_chat_messages' não existe; nome real é 'team_messages'
  5) Maior volume: webhook_audit_log (93MB) + webhook_events_processed (111MB)
  6) 51.688 empresas, 3.236 contatos legacy, 18 perfis de usuário
  7) Schema híbrido: dados da Evolution API vivem no schema 'evo',
     mapeados via views no schema zapp (contacts, messages, conversations)
  8) RLS habilitado em todas as tabelas
