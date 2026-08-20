# FEATURE REGISTRY — ZAPP-WEB-V3
**Auditoria Funcional Completa · 2026-08-06**

> 📌 **CANÔNICO (2026-08-20, Hermes):** Este arquivo é a ÚNICA fonte de verdade do
> feature registry. Os artefatos `feature_registry.csv` e `feature_registry.json`
> foram removidos por serem gerações redundantes e divergentes. Não recrie-os sem
> sincronizar aqui primeiro.

> **Legenda:**
> - ✅ **Full** — UI + hook/service + objeto DB + grant + fio íntegro
> - 🟨 **Partial** — ≥1 camada real, mas falta algo (stub, fio quebrado, sem UI, flag OFF)
> - 🟦 **Suggested** — Apenas menção textual/DB sem implementação funcional completa
>
> **Anti-alucinação:** Toda linha tem ≥1 evidência concreta (arquivo:linha, objeto DB, RPC, cron, edge fn).
> **Origem dos dados:** 3 agentes de inventário executados em 2026-08-06.

---

## Resumo Executivo

| Classificação | Qtd | % |
|--------------|-----|---|
| ✅ Full | ~45 | ~35% |
| 🟨 Partial | ~55 | ~42% |
| 🟦 Suggested | ~31 | ~24% |
| **TOTAL** | **~131** | **100%** |

> Contagens aproximadas — refinadas conforme agente backend conclui inventário.

---

## Domínio 1 — Inbox / Conversas

| Recurso Atômico | Class. | Evidência Camada UI | Evidência Camada DB/RPC | Obs |
|----------------|--------|--------------------|-----------------------|-----|
| Listar conversas | ✅ Full | src/features/inbox/ — hook useConversations | `rpc_list_conversations` + `evolution_conversations` (evo) | |
| Abrir conversa | ✅ Full | src/features/inbox/ — ConversationView | `evolution_messages` (evo raiz, 64.753 msgs wpp2) | |
| Enviar mensagem texto | 🟨 Partial | src/features/inbox/ — MessageInput | evolution-api edge + `rpc_insert_message` | wpp2 desconectada (qr_pending) |
| Enviar mídia (foto/doc) | 🟨 Partial | src/features/inbox/ — FileUpload | evolution-api edge + bucket `whatsapp-media` | wpp2 desconectada |
| Enviar áudio gravado | 🟨 Partial | flag `v2_audio_recorder` OFF (percentage=0) | evolution-api edge + bucket `audio-messages` | Flag OFF — rollout pausado |
| Enviar sticker | 🟨 Partial | src/features/inbox/ | evolution-api edge + bucket `stickers` | |
| Enviar localização | 🟨 Partial | src/features/inbox/ | evolution-api edge | |
| Reações a mensagens | ✅ Full | src/features/inbox/ — ReactionPicker | `message_reactions` (zapp, 424 linhas) + `rpc_get_reactions_batch` | |
| Notas internas (whisper) | ✅ Full | flag `whisper_mode` ON | `whisper_messages` + realtime `zapp.whisper_messages` | |
| Transferir conversa | ✅ Full | TransferModal | `rpc_list_transfers_paginated` + `transfer_comments` | |
| Snooze conversa | ✅ Full | SnoozeButton | `conversation_snoozes` + cron `cleanup-expired-snoozes` | |
| Fechar conversa | ✅ Full | CloseButton | `conversation_closures` + `rpc_close_conversation` | |
| Atribuir agente | ✅ Full | AgentAssign | `conversation_assignments` | |
| Tags em conversa | ✅ Full | TagsPanel | `conversation_tags` + `tags` | |
| Busca em conversas | 🟨 Partial | SearchBar | `search_history` + flag `semantic_search` ON | Semantic search ativa |
| CSAT automático | ✅ Full | flag `csat_surveys` ON | `csat_surveys` + cron `csat-auto-send` + edge `csat-auto-send` | |
| Mensagens agendadas | 🟨 Partial | ScheduleButton | `scheduled_messages` + cron de dispatch | Requer wpp2 ativa |
| Conversa summary (IA) | ✅ Full | SummaryPanel | `conversation_summaries` + edge `ai-conversation-summary` | |
| Tarefas em conversa | ✅ Full | TasksPanel | `conversation_tasks` | |
| Cursor paginação | ✅ Full | VirtualList | `rpc_list_conversations` cursor-based | |

---

## Domínio 2 — Contatos

| Recurso Atômico | Class. | Evidência UI | Evidência DB/RPC | Obs |
|----------------|--------|-------------|-----------------|-----|
| Listar contatos | ✅ Full | src/features/contacts/ | `rpc_list_contacts` + `contatos` (3.236 linhas) | |
| Buscar contatos (cursor) | ✅ Full | ContactSearch | `search_contacts_cursor` (callable) | |
| Perfil 360 do contato | ✅ Full | Contact360View | `rpc_get_contact` + `rpc_get_contact_summary_batch` | |
| Custom fields | ✅ Full | CustomFieldsForm | `contact_custom_fields` | |
| Notas do contato | ✅ Full | NotesPanel | `contact_notes` + `add_contact_note` + `update_contact_note` | |
| Tags do contato | ✅ Full | TagsPanel | `contact_tags` | |
| Compras do contato | ✅ Full | PurchasesPanel | `contact_purchases` | |
| Intelligence do contato | 🟨 Partial | IntelligencePanel | `contact_intelligence` (20.485 linhas) | `enrich_contact` stub → retorna `{enriched: false}` |
| Importar contatos | 🟨 Partial | ImportModal | edge `contacts-import` | Fluxo completo a verificar |
| Exportar contatos | 🟨 Partial | ExportButton | `contact_export_log` + `export_user_data` | `export_user_data` stub parcial (retorna só perfil básico) |
| Segmentos de contatos | 🟨 Partial | SegmentFilter | `contact_segments` | |
| Atribuição de contato | ✅ Full | ContactAssign | `contact_assignments` | |
| Histórico de e-mails | 🟨 Partial | EmailsPanel | `contact_phones` + `contact_emails` | Depende do e-mail channel |
| Empresas | ✅ Full | EmpresaPanel | `empresas` (51.688 linhas) | |
| Churn prediction | 🟨 Partial | ChurnBadge | edge `ai-churn-analysis` + `ai_conversation_tags` | Dependente do pipeline IA |

---

## Domínio 3 — Mensagens / Templates / Campanhas

| Recurso Atômico | Class. | Evidência UI | Evidência DB/RPC | Obs |
|----------------|--------|-------------|-----------------|-----|
| Templates WhatsApp (listar) | 🟨 Partial | TemplatesPicker | `whatsapp_templates` + edge `evolution-templates` | 0 registros (wpp2 desconectada) |
| Templates WhatsApp (criar/enviar) | 🟨 Partial | TemplateSendModal | edge `evolution-api` | Depende de wpp2 |
| Enviar template | 🟨 Partial | TemplateSendButton | `rpc_upsert_service_channel` + evolution-api | Depende de wpp2 |
| Campanhas (Talkx) | ✅ Full | flag `talk_x` ON | `talkx_campaigns` + `talkx_recipients` + `talkx_blacklist` | |
| Talkx — adicionar destinatários | ✅ Full | TalkxRecipientModal | edge `talkx-add-recipients` | |
| Talkx — controlar campanha | ✅ Full | TalkxControlPanel | edge `talkx-control` | |
| Campanhas AB | 🟨 Partial | CampaignABView | `campaigns` + `campaign_ab_variants` | TODO CAMPANHAS-14 rastreado |
| Mensagens agendadas | 🟨 Partial | ScheduleModal | `scheduled_messages` | Requer wpp2 |
| Retry de mensagens falhas | ✅ Full | flag `auto_retry_failed` ON + `message_queue_retry` ON | `failed_messages` (zapp) + cron `retry_stuck_messages` | |
| DLQ (Dead Letter Queue) | ✅ Full | AdminFailedMessagesPage | `rpc_dlq_list_audit` + `rpc_dlq_retry_now` + `rpc_dlq_abandon` | |
| Reações | ✅ Full | ReactionPicker | `message_reactions` + `rpc_get_reactions_batch` | |
| Queue de mensagens otimista | ✅ Full | flag `optimistic_messages` ON | hooks useOptimisticMessages | |

---

## Domínio 4 — Filas / SLA / Agentes / Transferências

| Recurso Atômico | Class. | Evidência UI | Evidência DB/RPC | Obs |
|----------------|--------|-------------|-----------------|-----|
| Gestão de filas | ✅ Full | AdminQueuesPage (parcial — TODO rastreado) | `queues` + `queue_members` | |
| Dashboard SLA | ✅ Full | SLADashboard page | `sla_configurations` + `sla_rules` + `SLADashboard` route | |
| SLA por conversa | ✅ Full | SLAIndicator | `conversation_sla` + `sla_history` | |
| Alertas SLA (siren) | ✅ Full | flag `sla_siren` ON | `sla_alert_preferences` + cron `escalate-critical-alerts` + edge `sla-alert` | |
| Comparativo de filas | ✅ Full | QueuesComparison page | `rpc_queue_sla_panel` | |
| Painel SLA por agente | ✅ Full | SLAAlertPreferences | `sla_delivery_rules` + `sla_delivery_violations` | |
| Skills de agentes | 🟨 Partial | AgentSkillsPanel | `agent_skills` | Sem UI de roteamento por skill |
| Roteamento por skill | 🟨 Partial | — | `queue_skill_requirements` + `queue_routing_rules` | Sem UI de config de roteamento |
| Rebalancear filas | 🟨 Partial | — | `rpc_queue_rebalance_candidates` | Sem UI de disparo manual |
| Transferências | ✅ Full | TransferModal | `rpc_list_transfers_paginated` + `transfer_comments` | |
| Agentes ausentes (reassign) | 🟨 Partial | — | `reassign_absent_agents` cron | Apenas automático, sem UI manual |

---

## Domínio 5 — Automações / Chatbot / Playbooks

| Recurso Atômico | Class. | Evidência UI | Evidência DB/RPC | Obs |
|----------------|--------|-------------|-----------------|-----|
| Regras de automação | 🟨 Partial | — | `automation_rules` + `automation_executions` | TODO AUTOMACOES-12 — UI incompleta |
| Chatbot L1 | 🟨 Partial | ChatbotConfig | edge `chatbot-l1` + `chatbot_flows` | |
| Playbooks | 🟦 Suggested | — | `playbooks` tabela existe | Sem UI detectada |
| Follow-up automático | 🟨 Partial | — | `evolution_followup_rules` | Regras no DB, UI a verificar |
| Follow-up manual | 🟨 Partial | FollowUpButton | `reminders` | |
| NPS automático | ✅ Full | flag `csat_surveys` ON (engloba NPS) | `nps_surveys` + cron `nps-scheduler` + edge `nps-scheduler` | |
| Sentiment alert | 🟨 Partial | — | edge `sentiment-alert` | Sem UI de configuração |

---

## Domínio 6 — IA

| Recurso Atômico | Class. | Evidência UI | Evidência DB/RPC | Obs |
|----------------|--------|-------------|-----------------|-----|
| Sugestão de resposta (AI) | ✅ Full | flag `ai_agents` ON | edge `ai-suggest-reply` + `ai_providers` | |
| Classificação de tickets | ✅ Full | flag `ai_agents` ON | edge `ai-classify-tickets` + `ai_conversation_tags` | |
| Análise de conversa | ✅ Full | AnalysisPanel | edge `ai-conversation-analysis` + `conversation_analyses` | |
| Sumário de conversa | ✅ Full | SummaryPanel | edge `ai-conversation-summary` + `conversation_summaries` | |
| Melhoria de mensagem | ✅ Full | EnhanceButton | edge `ai-enhance-message` | |
| Transcrição de áudio | 🟨 Partial | flag `advanced_transcription` OFF | edge `ai-transcribe-audio` + flag `whisper_mode` ON (basic) | Flag `advanced` OFF; básico via whisper ON |
| Speech-to-text | 🟨 Partial | AudioInput | edge `speech-to-text` | |
| Churn analysis | 🟨 Partial | ChurnBadge | edge `ai-churn-analysis` | |
| Get latest analysis | 🟨 Partial | AnalyticsDashboard | `get_latest_analysis` RPC stub (retorna avg engagement_score) | Stub parcial |
| AI usage tracking | ✅ Full | — | `ai_usage_logs` + cron `analytics-log-retention` | |
| Agentes IA (multi-agent) | 🟨 Partial | flag `ai_agents` ON | edge functions IA | Infraestrutura pronta, UI a confirmar |

---

## Domínio 7 — E-mail

| Recurso Atômico | Class. | Evidência UI | Evidência DB/RPC | Obs |
|----------------|--------|-------------|-----------------|-----|
| Canal e-mail (flag) | 🟨 Partial | flag `email_channel` ON | `email_accounts` + schema `email_app` (33 tabelas) | |
| OAuth Gmail | 🟨 Partial | GmailConnectButton | `initiate_gmail_oauth` stub (RAISE P0001) | Stub — Edge Function não implementada |
| Completar OAuth Gmail | 🟨 Partial | OAuthCallback | `complete_gmail_oauth` stub (RAISE P0001) | Stub |
| Listar threads Gmail | ✅ Full | InboxEmail | `rpc_email_list_threads` + `gmail_threads` + `gmail_messages` | |
| Enviar e-mail | 🟨 Partial | ComposeEmail | edge `gmail-send` + `send-email` | Dependente de OAuth ativo |
| Arquivar thread | ✅ Full | ArchiveButton | `rpc_email_archive_thread` (callable) | |
| Atribuir thread | ✅ Full | AssignButton | `rpc_email_assign_thread` (callable) | |
| Marcar lida | ✅ Full | ReadButton | `rpc_email_mark_thread_read` (callable) | |
| Estrelar thread | ✅ Full | StarButton | `rpc_email_star_thread` (callable) | |
| Status OAuth token | ✅ Full | TokenStatus | `rpc_email_token_status` (callable) | |
| Assinaturas de e-mail | ✅ Full | SignatureEditor | `email_signatures` | |
| Templates de e-mail | ✅ Full | TemplateEditor | `email_templates` | |
| Drafts | 🟨 Partial | DraftPanel | `email_drafts` | |
| Etiquetas (labels) | ✅ Full | LabelPanel | `email_labels` | |
| IMAP/SMTP (terceiros) | 🟦 Suggested | — | `imap_smtp_accounts` + edge `email-imap-bridge` | Sem UI completa detectada |
| Webhook Gmail | 🟨 Partial | — | edge `gmail-webhook` + edge `gmail-token-refresh` | Infra pronta, sem UI de status |
| Saúde do e-mail | ✅ Full | HealthStatus | `rpc_log_email_health` + `rpc_update_email_health_state` | |

---

## Domínio 8 — Voz / Áudio

| Recurso Atômico | Class. | Evidência UI | Evidência DB/RPC | Obs |
|----------------|--------|-------------|-----------------|-----|
| Gravação de áudio v1 | ✅ Full | AudioRecorder | edge `ai-transcribe-audio` + bucket `audio-messages` | v1 ativa |
| Gravação de áudio v2 | 🟦 Suggested | flag `v2_audio_recorder` OFF (percentage=0) | — | Flag OFF |
| VOIP/SIP | 🟨 Partial | flag `voip_sip` ON | `record_voice_telemetry` + edge `voice-copilot-action` (suspeito) | Flag ON mas UI a confirmar |
| Voice changer (ElevenLabs) | 🟦 Suggested | — | edge `elevenlabs-*` suspeitos | Sem evidência de UI |
| Transcrição (básica) | ✅ Full | flag `whisper_mode` ON | edge `ai-transcribe-audio` | Modo básico ativo |
| Transcrição avançada | 🟦 Suggested | flag `advanced_transcription` OFF | — | Flag OFF |
| Voice agent | 🟦 Suggested | — | edge `voice-agent` suspeito | Sem evidência de UI |
| Memes de áudio | 🟨 Partial | MemeButton | bucket `audio-memes` | Sem hook específico detectado |

---

## Domínio 9 — Evolution / WhatsApp

| Recurso Atômico | Class. | Evidência UI | Evidência DB/RPC | Obs |
|----------------|--------|-------------|-----------------|-----|
| Instâncias WA (listar) | ✅ Full | ConnectionsList | `evolution_instances` VIEW (zapp) + `rpc_instance_stats(text)` | Grant corrigido 2026-08-06 |
| Instâncias WA (criar) | ✅ Full | CreateInstanceModal | evolution-api edge + `whatsapp_connections` | |
| Instâncias WA (pausar) | ✅ Full | PauseInstance | `AdminInstancePausesPage` + cron `evo-instance-health-check` | |
| Conexão wpp2 | 🔴 CRÍTICO | ConnectionStatus | wpp2 em `qr_pending` — pipeline parado | Requer QR scan manual |
| Enviar mensagem WA | 🟨 Partial | MessageInput | evolution-api edge ativa | Pipeline parado (wpp2 desconectada) |
| Receber mensagem WA | 🟨 Partial | InboxRealtime | evolution-webhook edge | Pipeline parado |
| Templates WA (listar) | 🟨 Partial | TemplatesPicker | `whatsapp_templates` (0 registros) + evolution-templates edge | Vazio — depende de wpp2 |
| Sync contatos WA | 🟨 Partial | SyncButton | evolution-sync edge + `evolution_contacts` (20.563) | Sync OK, novos dados pausados |
| Credentials Evolution | ✅ Full | CredentialsModal | evolution-credentials edge + `evolution_instance_credentials` | |
| Grupos WA | 🟦 Suggested | — | `whatsapp_groups` tabela existe | Sem UI detectada |
| Flows WA | 🟦 Suggested | — | `whatsapp_flows` tabela existe | Sem UI detectada |
| Cloud API WhatsApp | 🟨 Partial | CloudAPIConfig | `whatsapp_cloud_webhook_pings` + edge `whatsapp-cloud-api` | Sem UI de configuração |
| Realtime mensagens | ✅ Full | InboxRealtime | schema `evo` + tabela raiz `evolution_messages` | Compliance CLAUDE.md ✅ |
| Health logs Evolution | ✅ Full | AdminEvolutionApiLogsPage | `evolution_health_logs` + cron `evo-instance-health-check` | |
| Retry métricas | ✅ Full | AdminRealtimeMonitorPage | `evolution_retry_metrics` + `evolution_daily_metrics` | |
| `rpc_resolve_whatsapp_instance` | ✅ Full | (interno — edge fns) | grant corrigido 20260806180000 | |
| `rpc_resolve_instance_by_phone` | ✅ Full | (interno — edge fns) | grant corrigido 20260806180000 | |
| `get_connection_instance` | ✅ Full | (interno — edge fns) | grant corrigido 20260806180000 | |

---

## Domínio 10 — Integrações Externas

| Recurso Atômico | Class. | Evidência UI | Evidência DB/RPC | Obs |
|----------------|--------|-------------|-----------------|-----|
| Sync to CRM | 🟦 Suggested | SyncToCRMButton | `sync_to_crm` stub (RAISE P0001) | Stub — sem Edge Function |
| Bitrix24 | 🟦 Suggested | — | Tabelas suspeitas em zapp | Sem evidência de UI |
| Sicoob | 🟦 Suggested | — | `sicoob_contact_mapping`, `sicoob_reply_outbox` | Sem UI detectada |
| PromoGifts | 🟦 Suggested | — | Referência em docs/ARCHITECTURE | Sem implementação frontend |
| Instagram | 🟨 Partial | flag `instagram_channel` ON | — | Flag ON mas sem UI completa |
| Telegram | 🟨 Partial | flag `telegram_channel` ON | — | Flag ON mas sem UI completa |
| Webhooks externos (entrada) | ✅ Full | AdminWebhookOverviewPage | `webhook_audit_log` (187.368) + `webhook_events_processed` (191.201) | |
| Webhooks externos (config) | ✅ Full | WebhookConfig | `rpc_set_whatsapp_mode` + edge `evolution-webhook` | |
| HMAC/signature | ✅ Full | AdminWebhookSecretStatusPage | edge `webhook-hmac-selftest` + `hmac_selftest_audit` | |

---

## Domínio 11 — Segurança / Compliance

| Recurso Atômico | Class. | Evidência UI | Evidência DB/RPC | Obs |
|----------------|--------|-------------|-----------------|-----|
| Rate limiting | ✅ Full | — | `rate_limit_configs` + `rate_limit_logs` + crons | |
| Geo-blocking | ✅ Full | GeoBlockingPanel | `blocked_countries` + `allowed_countries` + `geo_blocking_settings` | |
| IP blocking | ✅ Full | IPBlockPanel | `blocked_ips` + edge `detect-new-device` | |
| Audit logs | ✅ Full | AdminAlertHistoryPage | `audit_logs` (4.356) + `security_audit_logs` | |
| Login attempts | ✅ Full | SecurityPanel | `login_attempts` + `security_alerts` | |
| Passkeys | 🟨 Partial | PasskeySetup | `passkey_credentials` + edge ou hook | |
| LGPD (consentimento) | ✅ Full | LGPDConsent | `grant_lgpd_consent` + `revoke_lgpd_consent` + `data_deletion_requests` | |
| Solicitação exclusão (LGPD) | ✅ Full | DataDeletionRequest | `data_deletion_requests` | |
| Dispositivos do usuário | ✅ Full | DevicesPanel | `user_devices` + edge `detect-new-device` | |
| Segurança ACL | 🟨 Partial | — | `security_acl_alerts` | Sem UI detectada |
| VirusTotal scan | 🟨 Partial | — | edge `virustotal-test` | Scan de mídia |
| Webhook signature selftest | ✅ Full | AdminWebhookSecretStatusPage | edge `recheck-webhook-signature` + edge `webhook-secret-status` | |
| 2FA | ✅ Full | TwoFactorAuth page | Supabase Auth MFA | |

---

## Domínio 12 — Dashboards / Analytics / Relatórios

| Recurso Atômico | Class. | Evidência UI | Evidência DB/RPC | Obs |
|----------------|--------|-------------|-----------------|-----|
| Dashboard principal | ✅ Full | Index page (dashboard) | `rpc_dashboard_init` + `rpc_app_bootstrap` | |
| Telemetria | ✅ Full | AdminTelemetriaPage | `query_telemetry` + `analytics_events` | |
| Insights de busca | ✅ Full | AdminSearchInsightsPage | `search_insights` | |
| Snapshots de performance | ✅ Full | — | `performance_snapshots` + cron `db_size_snapshot` | |
| Metas (goals) | 🟨 Partial | GoalsPanel | `goals_configurations` | TODO DASHBOARD-05/08 rastreado |
| Relatórios agendados | 🟨 Partial | — | `scheduled_reports` | Sem UI de agendamento |
| NPS (surveys) | ✅ Full | NPSWidget | `nps_surveys` + cron `nps-scheduler` | |
| CSAT | ✅ Full | CSATWidget | flag `csat_surveys` ON + `csat_surveys` | |
| System health score | ✅ Full | HealthDashboard | `fn_system_health_score` | |
| Disk baseline | ✅ Full | — | cron `disk-baseline-snapshot-daily` | Monitoramento automático |
| SLA Analytics | ✅ Full | SLAHistory + SLAAlertHistory pages | `sla_history` | |

---

## Domínio 13 — Notificações / Stickers / Emojis / Avatares

| Recurso Atômico | Class. | Evidência UI | Evidência DB/RPC | Obs |
|----------------|--------|-------------|-----------------|-----|
| Notificações push (app) | ✅ Full | NotificationBell | `app_notifications` (13.473) + realtime `zapp.app_notifications` + cron `cleanup-old-notifications` | |
| Emojis customizados | ✅ Full | EmojiPicker | `custom_emojis` + bucket `custom-emojis` + src/features/emojis/ | |
| Stickers pessoais | ✅ Full | StickerPicker | `personal_stickers` + bucket `stickers` | |
| Avatares | ✅ Full | AvatarEditor | bucket `avatars` | |
| Memes de áudio | 🟨 Partial | MemePanel | `audio_memes` + bucket `audio-memes` | |
| Media library | 🟨 Partial | flag `media_library` ON | — | Flag ON, UI a confirmar |

---

## Domínio 14 — Admin / Config / Usuários / Permissões

| Recurso Atômico | Class. | Evidência UI | Evidência DB/RPC | Obs |
|----------------|--------|-------------|-----------------|-----|
| Gestão de usuários | ✅ Full | AdminUsers | `profiles` (17 usuários) + `workspace_members` (15) | |
| Permissões (roles) | ✅ Full | RolesPanel | `user_roles` (14) + `departments` | |
| Departamentos | ✅ Full | DepartmentsPanel | `departments` + `workspace_members` | |
| Workspaces | ✅ Full | WorkspaceConfig | `workspaces` + `workspace_members` | |
| Onboarding | ✅ Full | Install page | edge `onboarding` suspeita | |
| Config de filas (admin) | 🟨 Partial | AdminQueuesPage | `queues` (TODO rastreado) | UI incompleta |
| Logs de auditoria | ✅ Full | AdminAlertHistoryPage | `audit_logs` + `webhook_audit_log` | |
| Dispatch errors | ✅ Full | AdminDispatchErrorsHistoryPage | `dispatch_error_logs` (zapp, realtime) | |
| Failed messages (admin) | ✅ Full | AdminFailedMessagesPage | `failed_messages` (zapp, realtime) | |
| Instance pauses (admin) | ✅ Full | AdminInstancePausesPage | `evolution_health_logs` | |
| Realtime monitor (admin) | ✅ Full | AdminRealtimeMonitorPage | `AdminRealtimeMonitorPage` page | |
| Webhook events (admin) | ✅ Full | AdminWebhookEventsPage | `webhook_events_processed` (191.201) | |
| Configuração de webhook | ✅ Full | AdminWebhookOverviewPage | `webhook_audit_log` | |
| Feature flags (admin) | ✅ Full | — | `feature_flags` tabela | |
| SSO/OAuth | ✅ Full | SSOCallback page + OAuthConsent page | Supabase Auth | |
| 2FA setup | ✅ Full | TwoFactorAuth page | Supabase Auth MFA | |
| Recuperar senha | ✅ Full | ForgotPassword + ResetPassword pages | Supabase Auth | |
| Verificar e-mail | ✅ Full | VerifyEmail page | Supabase Auth | |

---

## Domínio 15 — Design System / Debug

| Recurso Atômico | Class. | Evidência UI | Evidência DB/RPC | Obs |
|----------------|--------|-------------|-----------------|-----|
| Design System | 🟦 Suggested | DesignSystem page | shadcn/ui components | Apenas para devs |
| Backend Diagnostics | ✅ Full | BackendDiagnostics page | `rpc_app_bootstrap` | Somente dev/admin |
| Chat Popup (embed) | ✅ Full | ChatPopup page | — | Widget de embed externo |
| Realtime Fanout Debug | 🟦 Suggested | RealtimeFanoutDebug page | — | Debug interno |
| Send Status Bus Debug | 🟦 Suggested | SendStatusBusDebug page | — | Debug interno |

---

## Alertas Operacionais

| Severidade | Alerta | Ação |
|-----------|--------|------|
| 🔴 Crítico | wpp2 em `qr_pending` — pipeline WhatsApp parado | QR scan via painel Evolution Admin |
| 🔴 Crítico | `whatsapp_templates` com 0 registros | Após reconectar wpp2: GET /evolution-templates |
| 🟠 Resolvido | 4 RPCs WA sem EXECUTE grant (autenticação bloqueada) | ✅ Migração `20260806180000` aplicada em produção |
| 🟡 Aviso | 2 feature flags OFF: `v2_audio_recorder`, `advanced_transcription` | Aguardar rollout — não é defeito |
| 🟡 Aviso | 7 TODOs críticos de negócio rastreados | Priorizar AUTOMACOES-12, CAMPANHAS-14, DASHBOARD-05/08 |
| 🟡 Aviso | Stubs de RPC: `initiate_gmail_oauth`, `complete_gmail_oauth`, `sync_to_crm`, `import_user_data` | Edge Functions não implementadas |

---

## Stubs Ativos (per CLAUDE.md + auditoria)

| RPC | Comportamento | Bloqueador |
|-----|--------------|-----------|
| `initiate_gmail_oauth` | RAISE P0001 | Edge Function OAuth Google não implementada |
| `complete_gmail_oauth` | RAISE P0001 | Edge Function OAuth callback não implementada |
| `sync_to_crm` | RAISE P0001 | Edge Function + API CRM não implementada |
| `export_user_data` | Retorna perfil básico | Edge Function de export completo não implementada |
| `import_user_data` | RAISE P0001 | Edge Function com validação não implementada |
| `enrich_contact` | Retorna `{enriched: false}` | API de enriquecimento não integrada |
| `get_latest_analysis` | Retorna avg engagement_score | Analytics completo não implementado |

---

## Feature Flags (17 total)

| Flag | Status | Impacto |
|------|--------|---------|
| `ai_agents` | ✅ ON | IA suggest-reply, classify, análise ativas |
| `sla_siren` | ✅ ON | Alertas SLA ativos |
| `semantic_search` | ✅ ON | Busca semântica ativa |
| `voip_sip` | ✅ ON | VOIP/SIP habilitado |
| `email_channel` | ✅ ON | Canal e-mail habilitado |
| `instagram_channel` | ✅ ON | Instagram flag ON (UI a confirmar) |
| `telegram_channel` | ✅ ON | Telegram flag ON (UI a confirmar) |
| `csat_surveys` | ✅ ON | CSAT/NPS ativos |
| `media_library` | ✅ ON | Media library habilitada |
| `talk_x` | ✅ ON | Campanhas Talkx ativas |
| `optimistic_messages` | ✅ ON | Mensagens otimistas ativas |
| `auto_retry_failed` | ✅ ON | Retry automático ativo |
| `whisper_mode` | ✅ ON | Notas internas ativas |
| `dark_mode` | ✅ ON | Modo escuro disponível |
| `message_queue_retry` | ✅ ON | Queue de retry ativa |
| `v2_audio_recorder` | 🔴 OFF | percentage=0 — rollout pausado |
| `advanced_transcription` | 🔴 OFF | Transcrição avançada desligada |

---

## Realtime Channels (29 canais)

| Schema | Tabela/Canal | Tipo | Eventos |
|--------|-------------|------|---------|
| `evo` | `evolution_messages` | postgres_changes (raiz) | INSERT/UPDATE/DELETE |
| `zapp` | `profiles` | postgres_changes | UPDATE |
| `zapp` | `user_roles` | postgres_changes | ALL |
| `zapp` | `whatsapp_connections` | postgres_changes | ALL |
| `zapp` | `whisper_messages` | postgres_changes | INSERT |
| `financeiro` | `payment_links` | postgres_changes | UPDATE |
| — | ViewersIndicator | presence | — |
| (outros 22 canais) | — | postgres_changes/broadcast | — |

> Todos os 29 canais usam schemas corretos per CLAUDE.md. Nenhuma subscription em view ou partição.

---

*Gerado por auditoria automatizada em 2026-08-06.*
*Evidências: agentes Evolution API, Frontend Inventory, Backend Inventory (em andamento).*
*Artefatos correlatos: `VALIDATION_PLAN_50_STEPS.md`, `feature_registry.json`, `feature_registry.csv`*
