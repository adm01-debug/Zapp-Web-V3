> **📜 DOCUMENTO HISTÓRICO** — Reflete o estado do sistema na data indicada. A arquitetura atual usa um único Supabase Self-Hosted com schema `zapp`. Veja [SCHEMA_REFERENCE.md](docs/SCHEMA_REFERENCE.md).

# Auditoria de Paridade: Lovable Cloud → Supabase Self-Hosted (schema `zapp`)

**Data:** 2026-07-04
**Origem:** Projeto Lovable "ZAPP WEB" (`pronto-talk-suite`, id `1d419c34-35ac-4a71-96a5-146ca1b3ebf2`), schema `public`
**Destino:** Supabase self-hosted (`supabase.atomicabr.com.br`), schema `zapp` + schemas de domínio (`evo`, `ai`, `email_app`, `financeiro`, `vendas`, `public`)
**Método:** Inventário via MCPs (Lovable, Supabase self-hosted, Portainer) com cruzamento nome a nome de tabelas, views, functions, triggers, enums, cron jobs, buckets, edge functions e secrets.

---

## 1. Resumo executivo

| Categoria | Lovable Cloud | Self-hosted | Paridade |
|---|---:|---:|---|
| Tabelas (base) | 236 | 148 no `zapp` (+ demais schemas) | 🟡 **54 tabelas não existem em lugar nenhum** |
| Functions de banco (nomes distintos) | 210 | 158 encontradas | 🟡 **52 faltando** |
| Cron jobs (`cron.job`) | 11 | 49 (conjunto próprio) | 🔴 **0 dos 11 jobs do Lovable migrados por nome** |
| Edge functions | 111 (repo) | 119 deployadas | 🟢 111/111 deployadas; 106/108 com código idêntico |
| Buckets de storage | 8 | 16 | 🟢 8/8 presentes |
| Enums | 13 | 7 encontrados | 🟡 **6 faltando** |
| Secrets de edge functions | 16 | vault + env parcial | 🔴 **ELEVENLABS, GOOGLE, RESEND, SIP, MAPBOX, LOVABLE_API_KEY ausentes** |
| RLS no `zapp` | — | 0 tabelas sem RLS (148/148 com RLS) | 🟢 |
| Triggers no `zapp` | — | 73 | ✓ (não comparado 1:1) |

**Arquitetura observada no destino:** a migração NÃO foi 1:1 para o schema `zapp`. O domínio foi fatiado em múltiplos schemas — WhatsApp/Evolution → `evo` (176 tabelas, com particionamento por instância), IA → `ai` (31), e-mail → `email_app` (33), financeiro → `financeiro`, produtos → `vendas`, segurança/perfis → `public` — com **views de fachada** em `public` e `zapp` (ex.: `public.contacts`, `public.conversations`, `zapp.messages` são views). Portanto, ausência no `zapp` não significa ausência no sistema; a lista abaixo considera **todos** os schemas.

---

## 2. 🔴 Tabelas do Lovable que NÃO EXISTEM em nenhum schema do self-hosted (54)

Verificado contra `pg_class` em todos os schemas (tabelas, views, matviews, partições e foreign tables), excluindo `archive`/`graveyard`/`parity_audit`.

### 2.1 AI Agents / Autonomia (7) — *ver nota abaixo*
`ai_agents`, `ai_agent_runs`, `ai_agent_knowledge`, `ai_agent_experiments`, `ai_agent_contact_pauses`, `ai_autonomous_resolutions`, `mcp_clients`

> Nota: o `zapp` possui uma família nova (`agents`, `agent_memories`, `agent_traces`, `agent_versions`, `agent_templates`, `agent_usage`, `agent_permissions`, `agent_installed_skills`, `skill_registry`...) que aparenta ser uma plataforma de agentes redesenhada. Confirmar se substitui funcionalmente `ai_agent_*` antes de dar baixa.

### 2.2 Carrinho abandonado / recuperação (3)
`abandoned_carts`, `cart_recovery_attempts`, `cart_recovery_templates`

### 2.3 Knowledge Base RAG (3)
`kb_articles`, `kb_article_chunks`, `kb_search_logs`
(As tabelas `knowledge_base_articles`/`knowledge_base_files` existem no schema `ai`, mas a família `kb_*` com chunks/embeddings para RAG não foi migrada — functions `match_kb_chunks` e `search_knowledge_base_rag` também estão ausentes.)

### 2.4 QA de conversas (3)
`qa_evaluations`, `qa_scorecards`, `conversation_qa_scores`

### 2.5 Monitoração de conexões/instâncias (7)
`connection_action_log`, `connection_recovery_attempts`, `connection_status_audit`, `instance_alerts`, `instance_members`, `instance_supervisors`, `whatsapp_instances`

### 2.6 Roteamento (2)
`routing_queues`, `routing_rules`

### 2.7 Webhooks de sistema / eventos (5)
`system_webhooks`, `system_webhook_deliveries`, `system_event_keys`, `system_connections`, `webhook_reprocess_queue`

### 2.8 SLA (3)
`sla_alert_thresholds`, `sla_risk_acknowledgements`, `sla_runbook_audit_log`

### 2.9 Evolution (resiliência) (2)
`evolution_incidents`, `evolution_outbox`

### 2.10 Diversos (19)
`auth_attempts`, `conversation_reads`, `conversation_registry`, `favorite_templates`, `feature_flags`, `integration_health_log`, `media_upload_queue`, `message_retry_queue`, `rls_violation_log`, `saved_searches`, `search_analytics`, `send_failures`, `service_logs`, `storage_cleanup_logs`, `sts_alert_config`, `sts_telemetry`, `template_performance`, `transfer_audit_log`, `voice_conversion_telemetry`

---

## 3. 🟢 Tabelas ausentes do `zapp` mas presentes em outros schemas (80)

Exemplos (nome → onde está): `ai_providers`/`ai_usage_logs`/`playbooks`/`training_sessions`/`knowledge_base_*` → `ai`; `email_labels`/`email_messages`/`email_threads`/`gmail_*`/`nps_*`/`meta_capi_events` → `email_app`; `evolution_fallback_events`/`evolution_health_logs`/`evolution_instance_credentials`/`evolution_retry_metrics`/`evolution_send_idempotency` → `evo`; `payment_links` → `financeiro`; `products` → `vendas`; `profiles`/`user_roles`/`user_settings`/`departments`/`tags`/`team_messages`/`whatsapp_connections`/`whatsapp_official_credentials`/`audit_logs`/`login_attempts`/`security_alerts` e todo o bloco de segurança/geo/IP → `public`. `contacts`, `conversations` e `messages` são **views** de fachada em `public`/`zapp`.

## 4. Tabelas extras no `zapp` (46 — evolução própria, não é gap)

`agents` + 12 tabelas `agent_*`, `audio_meme_categories/favorites`, `contact_export_log`, `contact_phones`, `contact_segments`, `contatos`, `conversation_pins`, `conversation_summaries`, `csat_responses`, `dead_letter_queue`, `dlq_audit_log`, `inbox_custom_scopes`, `interactions`, `media_download_queue`, `media_quarantine`, `media_scan_log`, `media_security_*`, `media_storage_config`, `message_queue`, `messages_whatsapp_deprecated`, `notification_channels_config`, `notification_templates`, `outbound_message_queue`, `queue_items`, `queue_routing_rules`, `quick_replies`, `scheduled_job_log`, `sla_policies`, `sla_violations`, `sticker_categories`, `sticker_favorites`, `task_queues`, `webhook_endpoints`, `webhook_events`, `webhook_events_processed`, `webhook_health_alerts`.

---

## 5. 🟡 Drift de colunas em tabelas compartilhadas (amostra crítica)

Tabelas onde o self-hosted tem MENOS colunas que o Lovable:

| Tabela (`zapp`) | Colunas do Lovable ausentes no self-hosted |
|---|---|
| `conversation_threads` | `sla_enabled`, `sla_warning_threshold_minutes`, `sla_critical_threshold_minutes`, `sla_notification_message` |
| `conversation_transfers` | `escalated_at`, `escalation_count`, `first_response_at`, `handle_time_seconds`, `idempotency_key`, `parent_transfer_id`, `queue_time_seconds`, `transfer_reason_key` (o zapp tem 7 colunas próprias no lugar: `from/to_agent_id`, `from/to_queue_id`, `sla_deadline`, `return_reason`, `metadata`) |
| `team_conversations` | `assigned_at`, `assigned_to`, `deleted_at`, `routing_status`, `whatsapp_api_key`, `whatsapp_instance_id`, `whatsapp_mode` |
| `message_reactions` | `whisper_message_id` |
| `media_cache` | `id`, `last_accessed_at` (renomeada para `accessed_at`) |

Outras tabelas divergem para MAIS colunas no self-hosted (ex.: `instance_registry` 29→45, `queues` 25→31, `automation_executions` 20→25, `stickers` 10→18) — evolução local, não gap.

---

## 6. 🔴 Cron jobs — NENHUM dos 11 jobs do Lovable existe no self-hosted

Jobs do Lovable Cloud (todos ativos lá):

| Job | Schedule | Equivalente nominal no self-hosted |
|---|---|---|
| `cleanup-evolution-retry-metrics-daily` | `0 3 * * *` | ❌ |
| `cleanup-failed-messages-daily` | `0 3 * * *` | ❌ |
| `cleanup-storage-orphans-daily` | `0 3 * * *` | ❌ |
| `connection-health-check-every-5min` | `*/5 * * * *` | ❌ (existe `evolution-jid-health-check-5min`, escopo diferente) |
| `nps-scheduler-daily` | `0 14 * * *` | ❌ |
| `provider-healthcheck-every-2min` | `*/2 * * * *` | ❌ |
| `queue-rebalance-every-5min` | `*/5 * * * *` | ❌ |
| `reprocess-failed-messages-15m` / `-15min` (duplicado no Lovable) | `*/15 * * * *` | ❌ (existe `retry-stuck-messages`, escopo diferente) |
| `talkx-scheduler-check` | `* * * * *` | ❌ |
| `warroom-alert-resolver-1min` | `* * * * *` | ❌ |

O self-hosted tem 49 jobs próprios (pipeline evo, mídia, backups, reconcile etc.), mas os jobs que invocam as edge functions do ZAPP (`nps-scheduler`, `talkx-scheduler`, `queue-rebalance`, `provider-healthcheck`, `connection-health-check`, `reprocess-failed-messages`, `cleanup-*`) **não foram recriados** — as edge functions correspondentes estão deployadas porém órfãs de agendamento.

---

## 7. Edge Functions

- **111 functions** no repositório (`supabase/functions`, excluindo `tests`) → **todas deployadas** no container `supabase_functions` (`/home/deno/functions`). ✓
- **Código:** 106 de 108 `index.ts` comparados são byte a byte idênticos. Divergem apenas: `evolution-webhook` e `external-db-proxy` (provável adaptação intencional para self-hosted — validar diff).
- **9 extras** no self-hosted (fora do repo): `audio-transcribe`, `evolution-bitrix-sync`, `evolution-chatbot`, `evolution-followup`, `evolution-sender`, `evolution-sentiment`, `evolution-templates`, `hello`, `main`.

## 8. 🔴 Secrets de edge functions

Lovable Cloud (16): `CLIENTES_SUPABASE_URL/ANON_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `EVOLUTION_API_KEY/URL`, `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`, `LOVABLE_API_KEY`, `PROMOGIFTS_SUPABASE_URL/ANON_KEY`, `RESEND_API_KEY`, `SIP_PASSWORD`, `SUPABASE_URL/ANON_KEY`.

No self-hosted:
- Container de functions: só `PROMOGIFTS_SUPABASE_URL/ANON_KEY` (+ padrão SUPABASE_*).
- Vault: `evolution_api_key`, `evolution_api_url` ✓ (+ smtp/minio/r2/portainer).
- **Ausentes:** `ELEVENLABS_API_KEY` e `ELEVENLABS_AGENT_ID` (quebra as 11 functions `elevenlabs-*`, `voice-agent`, `voice-changer`, `speech-to-text`), `GOOGLE_CLIENT_*` (quebra `gmail-oauth`/`gmail-*`), `RESEND_API_KEY` (quebra `send-email`), `SIP_PASSWORD` (`get-sip-password`), `MAPBOX` (`get-mapbox-token`), `CLIENTES_SUPABASE_*` e `LOVABLE_API_KEY` (quebra `ai-proxy` e todas as functions de IA que roteiam pelo gateway Lovable — no self-hosted precisam de provider próprio).

## 9. 🟡 Enums faltantes (6 de 13)

`ai_agent_decision`, `ai_agent_mode`, `connection_provider`, `conversion_status`, `scan_verdict`, `voice_conversion_status` — coerentes com as tabelas ausentes das seções 2.1, 2.5 e 2.10. Presentes: `ai_provider_type`, `app_role`, `automation_execution_status`, `automation_trigger_type`, `channel_type`, `provider_type`, `service_account_type`.

## 10. 🟡 Functions de banco faltantes (52 de 210)

`audit_settings_changes`, `audit_sla_alert_thresholds`, `calculate_agent_load`, `check_ai_agent_feedback_degradation`, `check_login_rate_limit`, `check_send_failure_spike`, `cleanup_connection_status_audit`, `cleanup_expired_event_keys`, `cleanup_health_log`, `cleanup_old_connection_action_log`, `cleanup_old_evolution_incidents`, `cleanup_old_send_failures`, `cleanup_old_stress_metrics`, `cleanup_webhook_deliveries`, `fn_add_business_minutes`, `fn_auto_escalate_sla`, `fn_check_transfer_access`, `fn_escalate_overdue_transfers`, `fn_get_my_unread_summary`, `fn_is_instance_member`, `fn_log_connection_event`, `fn_log_sla_ack_event`, `fn_log_system_connection_event`, `fn_mark_conversation_as_read`, `fn_mark_transfer_as_read`, `fn_monitor_instance_health`, `fn_notify_status_change`, `fn_on_transfer_created`, `fn_process_escalations`, `fn_reopen_transfer`, `fn_test_concurrency_accept`, `increment_voice_task_attempt`, `is_feature_enabled`, `join_department_via_code`, `log_audit_event_as`, `log_storage_upload_error`, `match_kb_chunks`, `process_settings_audit`, `record_login_attempt`, `route_conversation`, `rpc_conversation_sla_panel`, `rpc_get_contacts`, `rpc_record_event_key_usage`, `search_knowledge_base_rag`, `set_connection_status_audit_created_by`, `trg_fn_set_transfer_sla`, `trg_log_transfer_status_change`, `trg_transfer_auto_sla`, `trg_transfer_notify`, `update_media_cache_access`, `upsert_department`, `validate_sla_alert_thresholds`.

Padrão: quase todas dependem das tabelas ausentes (transfers/SLA, connection audit, KB RAG, feature flags, send_failures, event keys) — os dois gaps andam juntos.

## 11. ✅ Itens em paridade

- **Buckets:** todos os 8 do Lovable (`audio-memes`, `audio-messages`, `avatars`, `custom-emojis`, `quarantine`, `stickers`, `team-chat-files`, `whatsapp-media`) existem no self-hosted, com mesmas flags de visibilidade.
- **RLS:** 148/148 tabelas do `zapp` com RLS habilitado.
- **Edge functions:** 100% deployadas, 98% com código idêntico ao repo.
- **Evolution API:** credenciais no vault, stack rodando (Portainer: `evolution_evolution`, `supabase_*` saudáveis).

---

## 12. Recomendações priorizadas

1. **P0 — Secrets:** provisionar `ELEVENLABS_*`, `GOOGLE_CLIENT_*`, `RESEND_API_KEY`, `SIP_PASSWORD`, `MAPBOX` e substituto do `LOVABLE_API_KEY` (gateway de IA próprio) no env do container de functions ou no vault; sem isso, ~20 edge functions deployadas falham em runtime.
2. **P0 — Cron:** recriar os 11 agendamentos do Lovable (via `cron.schedule` chamando as edge functions já deployadas), ou documentar formalmente quais foram substituídos por jobs equivalentes do pipeline evo.
3. **P1 — Decidir destino dos 54 grupos de tabelas ausentes:** para cada bloco da seção 2, marcar como (a) migrar, (b) substituído por redesign (ex.: `agent_*`, `sla_policies`/`sla_violations`, `webhook_endpoints`), ou (c) descontinuado — e registrar em `parity_audit`.
4. **P1 — Drift de colunas:** alinhar `conversation_threads` (SLA), `team_conversations` (roteamento/atribuição) e `message_reactions.whisper_message_id`, que têm impacto funcional direto no frontend.
5. **P2 — Diff das 2 edge functions divergentes** (`evolution-webhook`, `external-db-proxy`) para confirmar que a divergência é a adaptação self-hosted esperada.
