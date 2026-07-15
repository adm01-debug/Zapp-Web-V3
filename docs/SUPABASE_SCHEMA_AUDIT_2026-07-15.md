# Auditoria Exaustiva: Schema Zapp vs Código — 2026-07-15

## Resumo Executivo

Auditoria completa comparando **todas as referências a tabelas no código-fonte** contra o schema `zapp` do Supabase self-hosted. Verificação feita via MCP queries diretas ao banco de dados.

| Métrica | Quantidade |
|---------|-----------|
| Tabelas no schema `zapp` | 315 |
| Views no schema `zapp` | 402 |
| Referências `.from()` únicas no código | 170 |
| RPCs referenciadas no código | 97 |
| Storage buckets referenciados | 7 |
| Storage buckets existentes | 13 |
| **Problemas encontrados** | **2 bugs + 1 bucket faltante** |

---

## Problemas Encontrados

### BUG 1: `queue_skills` — Tabela inexistente

- **Arquivo**: `src/features/admin/hooks/useAdminManagement.ts:552`
- **Código**: `supabase.from('queue_skills').select('*')`
- **Problema**: A tabela `queue_skills` **não existe** no schema zapp (nem como tabela, nem como view, nem em nenhum outro schema).
- **Tabela similar**: `queue_skill_requirements` existe em zapp.
- **Impacto**: A query retorna erro silencioso. A variável `queueSkills` no estado sempre fica vazia.
- **Correção sugerida**: Renomear para `queue_skill_requirements` ou criar a tabela `queue_skills`.

### BUG 2: `chat-media` — Storage bucket inexistente

- **Arquivo**: `src/features/inbox/components/chat/useAudioVoiceChange.ts:12-18`
- **Código**: `supabase.storage.from('chat-media').upload(...)` e `.getPublicUrl(...)`
- **Problema**: O bucket `chat-media` **não existe** no Storage. Buckets existentes: `audio-memes`, `audio-messages`, `avatars`, `comprovantes-financeiro`, `custom-emojis`, `email-attachments`, `etiquetas-remessa`, `fechamentos`, `quarantine`, `recibos-entrega`, `stickers`, `team-chat-files`, `whatsapp-media`.
- **Impacto**: Upload de áudio com voz alterada sempre falha.
- **Correção sugerida**: Criar o bucket `chat-media` ou redirecionar para `whatsapp-media` ou `audio-messages`.

### NOTA: `idempotency_rollback_failures` — Referência apenas em comentário SQL

- **Arquivo**: `supabase/migrations/20260712000010_fix_audit_table_permission_failures_s11.sql:82`
- **Contexto**: Aparece apenas como comentário documentando uma mudança (`-- Change: await supabase.from('idempotency_rollback_failures').insert(...)`). A tabela existe em `public` schema (não em `zapp`), e o código real usa `rpc('fn_insert_idempotency_failure_audit')` como wrapper. **Sem impacto.**

---

## Tabelas Externas (Não-Zapp) — Corretamente Excluídas

As seguintes referências `.from()` usam um **cliente externo** (`extClient`) apontando para outro banco Supabase (catálogo Promogifts), e **não devem** existir no schema zapp:

| Tabela | Arquivo | Nota |
|--------|---------|------|
| `categories` | `supabase/functions/promogifts-catalog/index.ts:294` | BD externo (catálogo) |
| `suppliers` | `supabase/functions/promogifts-catalog/index.ts:300` | BD externo (catálogo) |
| `product_variants` | `supabase/functions/promogifts-catalog/index.ts:286` | BD externo (catálogo) |

---

## Cross-Reference Completo: Código vs Schema Zapp

### Tabelas/Views presentes no Zapp (verificadas via MCP)

Todas as 170 referências `.from()` do código foram verificadas contra as 315 tabelas + 402 views do schema `zapp`. Abaixo, as que são **views bridge** (apontam para tabelas em outros schemas):

| View em `zapp` | Schema de origem |
|---------------|-----------------|
| `contacts` | view → multi-schema |
| `messages` | view → evo |
| `messages_whatsapp` | view → evo |
| `payment_links` | view → financeiro |
| `contact_emails` | view → email_app |
| `evolution_instances` | view → evo |
| `evolution_messages` | view → evo |
| `evolution_contacts` | view → evo |
| `evolution_conversations` | view → evo |
| `evolution_deals` | view → evo |
| `evolution_followups` | view → evo |
| `evolution_message_queue` | view → evo |
| `evolution_message_templates` | view → evo |
| `evolution_performance_metrics` | view → evo |
| `evolution_retry_metrics` | view → evo |
| `evolution_send_idempotency` | view → evo |
| `evolution_webhook_dlq` | view → evo |
| `evolution_webhook_events` | view → evo |
| `evolution_audit_log` | view → evo |
| `evolution_chatbot_responses` | view → evo |
| `evolution_fallback_events` | view → evo |
| `evolution_alerts` | view → evo |
| `evolution_bitrix_queue` | view → evo |
| `evolution_sentiment_alerts` | view → evo |
| `evolution_sentiment_analysis` | view → evo |
| `evolution_tags` | view → evo |
| `gmail_accounts` | view → email_app |
| `gmail_messages` | view → email_app |
| `gmail_threads` | view → email_app |
| `gmail_labels` | view → email_app |
| `gmail_health_logs` | view → email_app |
| `gmail_health_summary` | view → email_app |
| `gmail_revalidation_jobs` | view → email_app |
| `imap_smtp_accounts` | view → email_app |
| `ai_providers` | view → ai |
| `ai_usage_logs` | view → ai |
| `knowledge_base_articles` | view → ai |
| `nps_surveys` | view → multi-schema |
| `nps_invitations` | view → multi-schema |
| `products` | view → vendas/catálogo |
| `salespeople` | view → vendas |
| `meta_capi_events` | view → marketing |
| `playbooks` | view → ai |
| `training_sessions` | view → ai |
| `email_threads` | view → email_app |
| `email_tracked_messages` | view → email_app |
| `email_revalidation_jobs` | view → email_app |

### Tabelas nativas do Zapp referenciadas no código (amostra das 315)

Todas as seguintes existem como `BASE TABLE` em `zapp`:

`agents`, `agent_achievements`, `agent_skills`, `agent_stats`, `agent_visibility_grants`, `ai_conversation_tags`, `allowed_countries`, `app_settings`, `audio_memes`, `audit_logs`, `auto_close_config`, `automation_executions`, `automation_rules`, `automations`, `avatars`, `away_messages`, `blocked_countries`, `blocked_ips`, `calls`, `campaign_ab_variants`, `campaigns`, `channel_connections`, `channel_provider_routes`, `channel_queues`, `channel_routing_rules`, `chatbot_flows`, `client_wallet_rules`, `connection_alert_preferences`, `connection_health_logs`, `contact_assignments`, `contact_audit_log`, `contact_custom_fields`, `contact_export_log`, `contact_intelligence`, `contact_notes`, `contact_phones`, `contact_purchases`, `contact_tags`, `conversation_analyses`, `conversation_audit_logs`, `conversation_closures`, `conversation_events`, `conversation_memory`, `conversation_sla`, `conversation_snoozes`, `conversation_tasks`, `csat_auto_config`, `csat_surveys`, `custom_emojis`, `dashboard_queries`, `deal_activities`, `department_invitations`, `departments`, `entity_versions`, `failed_messages`, `favorite_contacts`, `file_scan_logs`, `followup_sequences`, `forwarded_messages`, `geo_blocking_settings`, `global_settings`, `goals_configurations`, `inbox_custom_scopes`, `instance_auth_events`, `instance_processing_pauses`, `instance_registry`, `integrations`, `login_attempts`, `message_attempts`, `message_queue`, `message_reactions`, `message_templates`, `migration_audit`, `notifications`, `number_reputation`, `onboarding_steps`, `passkey_credentials`, `password_reset_requests`, `performance_snapshots`, `permissions`, `personal_stickers`, `pinned_conversations`, `profiles`, `provider_configs`, `provider_message_log`, `provider_session_logs`, `provider_sessions`, `proxy_alerts`, `proxy_metrics`, `qr_attempts`, `query_telemetry`, `queue_goals`, `queue_members`, `queue_positions`, `queue_skill_requirements`, `queues`, `rate_limit_configs`, `rate_limit_logs`, `reconnection_logs`, `route_permissions`, `sales_deals`, `sales_pipeline_stages`, `scheduled_messages`, `scheduled_report_configs`, `scheduled_reports`, `search_history`, `search_insights`, `security_alerts`, `sentiment_alerts`, `service_channels`, `sicoob_contact_mapping`, `sicoob_reply_outbox`, `sla_configurations`, `sla_rules`, `stickers`, `storage_cleanup_logs`, `sts_telemetry`, `system_logs`, `system_settings`, `tags`, `talkx_blacklist`, `talkx_campaigns`, `talkx_recipients`, `team_conversation_members`, `team_conversations`, `team_messages`, `user_devices`, `user_roles`, `user_service_accounts`, `user_sessions`, `user_settings`, `voice_conversion_queue`, `warroom_alerts`, `webauthn_challenges`, `webhook_audit_log`, `webhook_events_processed`, `webhook_health_checks`, `webhook_idempotency`, `webhook_preferences`, `webhook_reprocess_queue`, `whatsapp_cloud_webhook_pings`, `whatsapp_connections`, `whatsapp_connection_queues`, `whatsapp_flows`, `whatsapp_groups`, `whatsapp_official_credentials`, `whatsapp_templates`, `whisper_messages`, `workspace_settings`

### Schema-Prefixed Calls (Non-Zapp)

| Schema | Tabela | Arquivo |
|--------|--------|---------|
| `evo` | `evolution_messages` | `supabase/functions/_shared/evolution-webhook-handlers.ts`, `evolution-webhook-messages.ts` |

Estas chamadas usam `supabase.schema('evo').from(...)` e acessam diretamente o schema `evo`, sem passar pela view bridge em zapp. **Correto e intencional** para operações de escrita no webhook handler.

---

## Storage Buckets

| Bucket | Existe? | Referenciado no código? |
|--------|---------|------------------------|
| `audio-memes` | Sim | Sim |
| `audio-messages` | Sim | Sim |
| `avatars` | Sim (public) | Sim |
| `chat-media` | **NÃO** | Sim — `useAudioVoiceChange.ts` |
| `comprovantes-financeiro` | Sim | Não verificado (pode ser usado via edge functions) |
| `custom-emojis` | Sim (public) | Não diretamente via `.from()` |
| `email-attachments` | Sim | Não diretamente via `.from()` |
| `etiquetas-remessa` | Sim | Não diretamente via `.from()` |
| `fechamentos` | Sim | Não diretamente via `.from()` |
| `quarantine` | Sim | Sim — `file-security-scanner` |
| `recibos-entrega` | Sim (public) | Não diretamente via `.from()` |
| `stickers` | Sim (public) | Sim |
| `team-chat-files` | Sim | Sim |
| `whatsapp-media` | Sim | Sim |

---

## Metodologia

1. **Scan do código**: Grep exaustivo em todos os arquivos `.ts`, `.tsx`, `.sql`, `.md` por padrões `.from('...')`, `.rpc('...')`, `supabase.storage.from('...')`, `supabase.schema('...').from('...')`
2. **Verificação do banco**: Queries SQL via MCP tools (`supabase_db_query`) contra `information_schema.tables`, `pg_views`, e `storage.buckets`
3. **Cross-reference**: Cada nome de tabela do código foi verificado como tabela OU view no schema `zapp`
4. **Validação de contexto**: Referências em clientes externos (`extClient`) e comentários SQL foram identificadas e excluídas da análise de bugs

## Conclusão

O schema `zapp` está **99% alinhado** com o código. Dos 170 nomes de tabelas/views referenciados no código:
- **164** existem corretamente como tabela ou view em `zapp`
- **3** são tabelas externas (catálogo Promogifts) — correto
- **1** é referência apenas em comentário SQL — sem impacto
- **1** tabela inexistente: `queue_skills` → **BUG**
- **1** storage bucket inexistente: `chat-media` → **BUG**
