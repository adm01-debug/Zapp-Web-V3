# Estado: supabase/functions — Fase 2A

> Runtime: NAO_VERIFICADO | Auditado em: 2026-08-16 | Funções cobertas: 107/107
> Fonte reconciliada: `ESTADO.md` (classificação A–F por chamador, 2026-08-08)
> Método: leitura em altitude de função (`index.ts` + docblock de cabeçalho) + extração
> mecânica de `Deno.env.get`/`requireEnv`, `.from(...)`, `.rpc(...)` sobre todos os `.ts`
> não-teste de cada diretório. Nenhum acesso a banco. Nenhuma afirmação de build/deploy.

---

## 1. Visão Geral

`supabase/functions/` tem **109 diretórios** no disco:

| Item | Qtd | Evidência |
|---|---|---|
| Diretórios totais | 109 | `ls -d supabase/functions/*/` |
| `_shared` (biblioteca, ~13.299 linhas TS) | 1 | `supabase/functions/_shared/` |
| `_archive` (3 funções arquivadas + README) | 1 | `supabase/functions/_archive/{auto-escalate-sla,queue-rebalance,sicoob-outbox-consumer}` |
| **Edge functions ativas** | **107** | 109 − `_shared` − `_archive` |
| Arquivos soltos (não são funções) | 2 | `supabase/functions/deno.json`, `supabase/functions/gmail-tests.test.ts` |

O número 107 **coincide** com o de `ESTADO.md`, mas **os conjuntos não são os mesmos** —
ver §3. Nenhum diretório de função está sem `index.ts`.

Distribuição de tamanho (linhas de `index.ts`):

| Faixa | Qtd | Exemplos |
|---|---|---|
| ≥ 400 | 12 | `ai-router` (4.225), `webhook-hmac-selftest` (662), `gmail-send` (630) |
| 150–399 | 40 | `gmail-webhook` (428), `whatsapp-cloud-webhook` (380) |
| 50–149 | 45 | maioria dos wrappers ElevenLabs / AI |
| < 50 | 10 | `get-mapbox-token` (31), `status` (37), `health-check` (42) |

**Estado de implementação agregado:** 0 stubs `RAISE`/`not implemented` no sentido dos stubs
de RPC do `CLAUDE.md`. Um único STUB declarado (`email-imap-bridge`), 13 PARCIAIS
(9 forwarders `ai-*`, `evolution-templates`, `evolution-credentials`, `send-email`,
`connection-health-check`), o resto COMPLETA no sentido "há lógica real de negócio no arquivo".
**Isso não é afirmação de que compila nem de que está deployada.**

Legenda de impl:
- **COMPLETA** — lógica de negócio própria e completa no arquivo.
- **PARCIAL** — funciona, mas com caminho morto/quebrado/delegado documentado no próprio código.
- **STUB** — declara no código que a funcionalidade não está implementada.
- **MORTA** — nenhum caminho de execução alcançável.

---

## 2. Tabela de Funções

Coluna "grupo": grupo em `ESTADO.md`. `—` = **ausente de `ESTADO.md`** (ver §3).
Tabelas listadas são os literais de `.from('...')`; sob `createZappAdminClient()` resolvem em
`zapp.*`. RPCs prefixados `rpc:`. Secrets = `Deno.env.get`/`requireEnv` fora de testes
(`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SELFHOSTED_*` omitidos por serem plataforma).

| função | linhas | o que faz | grupo | impl | tabelas/RPCs | secrets |
|---|---|---|---|---|---|---|
| `ai-auto-tag` | 65 | forwarder p/ `ai-router` (STEP 4B) | F | PARCIAL | — | AI_ROUTER_URL |
| `ai-churn-analysis` | 46 | forwarder p/ `ai-router` | A | PARCIAL | — | AI_ROUTER_URL |
| `ai-classify-tickets` | 44 | forwarder p/ `ai-router` | A | PARCIAL | — | AI_ROUTER_URL |
| `ai-conversation-analysis` | 57 | forwarder p/ `ai-router` | A | PARCIAL | — | AI_ROUTER_URL |
| `ai-conversation-summary` | 57 | forwarder p/ `ai-router` | A | PARCIAL | — | AI_ROUTER_URL |
| `ai-enhance-message` | 46 | forwarder p/ `ai-router` | A | PARCIAL | — | AI_ROUTER_URL |
| `ai-proxy` | 127 | roteia chamadas IA p/ provider configurado, fallback Lovable | A | COMPLETA | ai_providers | AI_GATEWAY_KEY, LOVABLE_API_KEY |
| `ai-router` | 4.225 | router IA unificado (12+ ações), rate-limit, circuit breaker | A | COMPLETA | app_notifications, contact_custom_fields, contact_notes, contacts, conversation_analyses, knowledge_base_articles, messages, queues, user_roles, webhook_events_processed · rpc:acquire_idempotency_lock, check_duplicate_request, record_ai_metrics, record_processed_request, upsert_conversation_tags_atomic | AI_GATEWAY_KEY, AI_ROUTER_SIGNING_SECRET, ELEVENLABS_API_KEY, LOVABLE_API_KEY |
| `ai-suggest-reply` | 52 | forwarder p/ `ai-router` | A | PARCIAL | — | AI_ROUTER_URL |
| `ai-transcribe-audio` | 61 | forwarder p/ `ai-router` | A | PARCIAL | — | AI_ROUTER_URL |
| `approve-password-reset` | 197 | reset de senha em 2 passos com aprovação de admin | A | COMPLETA | password_reset_requests · rpc:store_reset_token | APP_URL |
| `auto-close-conversations` | 99 | fecha conversas inativas conforme `auto_close_config` | F | COMPLETA | auto_close_config, contacts, conversation_closures, messages | — |
| `automation-suggest-reply` | 414 | sugestão de resposta p/ execução de automação (KB + tags) | A | COMPLETA | automation_executions, automation_rules, evolution_tags · rpc:search_knowledge_base | AI_GATEWAY_KEY, LOVABLE_API_KEY |
| `batch-fetch-avatars` | 111 | busca avatares WhatsApp em lote | A | COMPLETA | avatars, contacts, whatsapp_connections | — |
| `bitrix-api` | 232 | ponte p/ webhook Bitrix24 | A | COMPLETA | contacts | BITRIX_ALLOW_NO_ORIGIN, BITRIX_WEBHOOK_URL |
| `chatbot-l1` | 199 | chatbot nível 1 sobre KB (interno, service role) | A | COMPLETA | chatbot_flows, contacts, knowledge_base_articles, messages · rpc:search_knowledge_base | AI_GATEWAY_KEY, LOVABLE_API_KEY |
| `classify-audio-meme` | 93 | classifica áudio em 15 categorias de meme | A | COMPLETA | — | AI_GATEWAY_KEY, LOVABLE_API_KEY |
| `classify-sticker` | 90 | classifica sticker em categorias | A | COMPLETA | — | AI_GATEWAY_KEY, LOVABLE_API_KEY |
| `cleanup-rate-limit-logs` | 60 | purga `rate_limit_logs`/`blocked_ips` (cron/service) | F | COMPLETA | blocked_ips, rate_limit_logs, security_alerts | — |
| `cleanup-storage-orphans` | 171 | remove objetos de storage órfãos | E | COMPLETA | evolution_messages, storage_cleanup_logs | — |
| `client-observability` | 91 | ingestão de Web Vitals do frontend | F | COMPLETA | query_telemetry | — |
| `connection-health-check` | 463 | health 3 camadas de conexões Evolution (socket/identidade/atividade) | A | PARCIAL | app_notifications, audit_logs, connection_alert_preferences, connection_health_logs, evolution_messages, warroom_alerts, whatsapp_connections | CRON_SECRET, EVOLUTION_API_KEY, **EVOLUTION_API_URL**, EXTERNAL_SUPABASE_* |
| `connection-test` | 414 | teste de conexão por modo (Evolution / Meta Cloud) | A | COMPLETA | — | EVOLUTION_API_KEY, EVOLUTION_DEFAULT_INSTANCE, EVOLUTION_WEBHOOK_SECRET(S), WEBHOOK_SECRET, WHATSAPP_CLOUD_* |
| `contact-media` | 201 | mídia paginada (cursor/offset) de um contato | F | COMPLETA | messages | — |
| `contacts-import` | 174 | import CSV em massa (50k linhas), upsert por `remote_jid` | A | COMPLETA | contact_export_log, evolution_contacts, whatsapp_connections | — |
| `create-user` | 133 | cria usuário + perfil + roles + service accounts | A | COMPLETA | gmail_accounts, profiles, user_roles, user_service_accounts | — |
| `csat-auto-send` | 231 | dispara pesquisa CSAT automática pós-atendimento | A | COMPLETA | contacts, csat_auto_config, csat_surveys, evolution_message_queue, whatsapp_connections | — |
| `db-health-monitor` | 107 | health do Postgres + report Sentry | F | COMPLETA | profiles · rpc:pg_stat_database_simple | — |
| `detect-new-device` | 201 | detecta login em novo dispositivo e alerta por e-mail | A | COMPLETA | security_alerts, user_devices, user_sessions | RESEND_API_KEY |
| `elevenlabs-dialogue` | 73 | TTS multi-locutor ElevenLabs | A | COMPLETA | — | ELEVENLABS_API_KEY |
| `elevenlabs-scribe-token` | 51 | emite token efêmero p/ Scribe STT | A | COMPLETA | — | ELEVENLABS_API_KEY |
| `elevenlabs-sfx` | 73 | geração de efeitos sonoros | A | COMPLETA | — | ELEVENLABS_API_KEY |
| `elevenlabs-tts` | 79 | text-to-speech | A | COMPLETA | — | ELEVENLABS_API_KEY |
| `elevenlabs-tts-stream` | 84 | TTS em streaming | A | COMPLETA | — | ELEVENLABS_API_KEY |
| `elevenlabs-voice` | 123 | listVoices / textToSpeech (contrato p/ `ElevenLabsVoiceDesign.tsx`) | A | COMPLETA | — | ELEVENLABS_API_KEY |
| `email-health` | 98 | status da infra de e-mail via 2 RPCs | F | COMPLETA | rpc:rpc_email_health_check, rpc_get_email_health_summary | — |
| `email-imap-bridge` | 300 | provedores IMAP/SMTP genéricos | A | **STUB** | imap_smtp_accounts | IMAP_ENCRYPTION_KEY |
| `email-track-link` | 113 | registra clique e redireciona 302 | B | COMPLETA | rpc:rpc_email_register_click | — |
| `email-track-pixel` | 133 | pixel 1x1 de abertura de e-mail | B | COMPLETA | email_tracked_messages · rpc:rpc_email_register_open | — |
| `evolution-api` | 281 (354 dir) | fachada de ações Evolution (send, read-messages, etc.) | A | COMPLETA | — | EVOLUTION_API_KEY, EVOLUTION_SEND_RATE_PER_INSTANCE |
| `evolution-bitrix-sync` | 114 | drena fila `evolution_bitrix_queue` p/ Bitrix24 | F | COMPLETA | evolution_bitrix_queue, evolution_contacts, evolution_deals, evolution_performance_metrics | — |
| `evolution-credentials` | 161 | CRUD de credenciais da instância (POST-only) | A | PARCIAL | rpc:fn_edge_delete_evolution_credentials, fn_edge_upsert_evolution_credentials | — |
| `evolution-group-sync` | 470 | sync de grupos WhatsApp Evolution→Supabase, LID, isOnWhatsApp | **—** | COMPLETA | whatsapp_connections · rpc:fn_upsert_lid_identity, zapp_isonwa_mark, zapp_isonwa_pull, zapp_upsert_group_from_event, zapp_upsert_group_participants | EVOLUTION_INSTANCE_TOKEN_WPP2 |
| `evolution-notification-dispatcher` | 502 | despacha outbox de notificações por canal (in_app/e-mail/…) | **—** | COMPLETA | contacts · rpc:fn_evo_outbox_claim, fn_evo_outbox_mark, fn_evo_outbox_release, zapp_notif_config_get | RESEND_API_KEY |
| `evolution-proxy` | 209 | proxy server-side p/ Evolution via registry de providers | **—** | COMPLETA | — | (via gateway) |
| `evolution-retry-metrics` | 166 | agrega métricas de retry (admin-only) | F | COMPLETA | evolution_retry_metrics · rpc:is_admin_or_supervisor | — |
| `evolution-sync` | 115 | orquestra syncContacts/Messages/fullSync de `_shared` | A | COMPLETA | — | — |
| `evolution-templates` | 158 | CRUD/envio de templates WhatsApp | A | PARCIAL | evolution_message_queue, evolution_message_templates · rpc:fn_get_vault_secret, fn_use_template | — |
| `evolution-webhook` | 539 (619 dir) | webhook Evolution: HMAC, idempotência, dead-letter, roteamento | D | COMPLETA | ingest_ledger, instance_registry, webhook_events_processed, whatsapp_connections | EVOLUTION_WEBHOOK_ALLOW_SHARED_SECRET, EVOLUTION_WEBHOOK_STRICT, QR_ALERT_WEBHOOK_TOKEN/URL, WEBHOOK_SECRET |
| `fetch-whatsapp-avatar` | 153 | busca avatar de 1 número | F | COMPLETA | avatars, contacts, whatsapp_connections | — |
| `file-security-scanner` | 283 | scan VirusTotal + quarentena de uploads | F | COMPLETA | file_scan_logs, quarantine | VIRUSTOTAL_API_KEY |
| `followup-bridge` | 215 | ponte `followup_sequences` → `evolution_followups` | F ⚠ | COMPLETA | evolution_contacts, evolution_followups, followup_sequences, followup_steps | — |
| `get-mapbox-token` | 31 | entrega token público Mapbox | A | COMPLETA | — | MAPBOX_PUBLIC_TOKEN |
| `get-sip-password` | 43 | entrega senha SIP ao usuário autenticado | A | COMPLETA | profiles | SIP_PASSWORD |
| `gmail-oauth` | 168 | fluxo OAuth Google com state HMAC anti-CSRF | A | COMPLETA | gmail_accounts | GMAIL_REDIRECT_URI, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET |
| `gmail-send` | 630 | envio/markRead/trash/labels/drafts + tracking pixel/link | A | COMPLETA | email_tracked_links, email_tracked_messages, gmail_accounts, gmail_messages, gmail_threads | EMAIL_TRACKING_ENABLED, GOOGLE_CLIENT_ID/SECRET |
| `gmail-sync` | 916 | sync de threads/mensagens/labels/anexos (limite 20 MB) | A | COMPLETA | email_attachments, gmail_accounts, gmail_labels, gmail_messages, gmail_threads | GOOGLE_CLIENT_ID/SECRET |
| `gmail-token-refresh` | 353 | refresh de access_token e de subscription Pub/Sub | A | COMPLETA | evolution_alerts, gmail_accounts | GMAIL_PUBSUB_TOPIC, GOOGLE_CLIENT_ID/SECRET |
| `gmail-webhook` | 428 | push Pub/Sub do Gmail | A | COMPLETA | email_accounts, email_watch_history, gmail_accounts, gmail_messages, gmail_threads | GMAIL_PUBSUB_TOKEN, GMAIL_PUBSUB_TOPIC, GOOGLE_CLIENT_ID/SECRET |
| `health` | 161 | health consolidado (edge+realtime+DB+Evolution) p/ Prometheus | D | COMPLETA | profiles | EVOLUTION_INSTANCE_NAME, HEALTH_SECRET |
| `health-check` | 42 | probe mínimo | D | COMPLETA | profiles | — |
| `instance-pause-control` | 160 | painel admin de pausas de instância (list/history/pause/unpause) | A | COMPLETA | instance_auth_events, instance_processing_pauses · rpc:mark_pause_investigated, pause_instance, unpause_instance | — |
| `lgpd-scheduled-jobs` | 45 | dispara 3 RPCs LGPD (anonimizar/purgar) | F | COMPLETA | rpc:fn_lgpd_anonymize_deleted_contacts, fn_lgpd_purge_contact_activity, fn_lgpd_purge_message_metadata | — |
| `login-attempts` | 192 | registra/consulta tentativas de login | F ⚠ | COMPLETA | login_attempts | — |
| `main` | 229 | entrypoint do Edge Runtime; allowlist `PUBLIC_FNS` + verificação JWT | D | COMPLETA | — | JWT_SECRET, JWT_SECRET_FILE, VERIFY_JWT |
| `mcp` | 143 | servidor MCP auto-gerado por `@lovable.dev/mcp-js` | D | COMPLETA | contacts, whatsapp_connections | SUPABASE_PUBLISHABLE_KEY, SUPABASE_ANON_KEY |
| `mcp-query` | 65 | query MCP protegida por segredo | D | COMPLETA | — | MCP_QUERY_SECRET |
| `mcp-server` | 55 | MCP sobre HTTP p/ agentes | D | COMPLETA | — | — |
| `metrics` | 181 | exposição Prometheus (text 0.0.4) | D | COMPLETA | evolution_retry_metrics, failed_messages, rate_limit_logs, webhook_audit_log, whatsapp_connections | METRICS_SCRAPE_TOKEN |
| `migrate-media-storage` | 345 | migra mídia entre buckets/paths | A | COMPLETA | messages, whatsapp_connections | — |
| `nps-scheduler` | 143 | convites NPS diários (cron/service) | A | COMPLETA | contacts, failed_messages, nps_invitations, whatsapp_connections | — |
| `promogifts-catalog` | 330 | catálogo do Supabase EXTERNO PromoGifts (schema-check-exempt) | A | COMPLETA | categories, product_variants, products, suppliers | PROMOGIFTS_SUPABASE_URL, PROMOGIFTS_SUPABASE_ANON_KEY |
| `provider-healthcheck` | 134 | pinga providers ativos + switchover automático | A | COMPLETA | channel_provider_routes, provider_configs, provider_session_logs | — |
| `provider-router` | 407 | roteamento multi-provider WhatsApp com failover | F | COMPLETA | channel_provider_routes, provider_configs, provider_session_logs, provider_sessions | — |
| `public-api` | 101 | API pública (chama `evolution-api`) | D | COMPLETA | evolution_contacts, global_settings, messages, whatsapp_connections | — |
| `recheck-webhook-signature` | 165 | recalcula HMAC de um evento e devolve diagnóstico | A | COMPLETA | evolution_webhook_events_v2 | EVOLUTION_WEBHOOK_SECRET, WEBHOOK_SECRET |
| `recover-corrupted-audios` | 144 | detecta/repara áudios corrompidos (magic bytes OGG) | F | COMPLETA | messages, whatsapp_connections | — |
| `reprocess-failed-messages` | 159 (173 dir) | reprocessa DLQ `failed_messages` (batch 25) | A | COMPLETA | failed_messages | — |
| `secure-upload` | 243 | upload com validação VirusTotal | A | COMPLETA | — | VIRUSTOTAL_API_KEY |
| `send-email` | 142 | endpoint legado: com `accountId` delega a `gmail-send`; sem ele, fallback Resend | A | PARCIAL | — | RESEND_API_KEY |
| `send-rate-limit-alert` | 91 | alerta admins sobre rate-limit/IP bloqueado | F | COMPLETA | app_notifications, blocked_ips, security_alerts, user_roles | — |
| `send-scheduled-report` | 252 | monta e envia relatórios agendados por e-mail | F | COMPLETA | agent_stats, contacts, conversation_analyses, conversation_sla, messages, scheduled_report_configs | RESEND_API_KEY |
| `sentiment-alert` | 150 | alerta de sentimento negativo (interno, service role) | A | COMPLETA | audit_logs, contacts, conversation_analyses, profiles | RESEND_API_KEY |
| `sicoob-bridge` | 103 | ponte de entrada Sicoob | A | COMPLETA | contacts, messages, profiles, sicoob_contact_mapping | SICOOB_BRIDGE_SECRET |
| `sicoob-bridge-reply` | 133 | resposta p/ `chat-bridge` de projeto Supabase externo | A | COMPLETA | contacts, profiles, sicoob_contact_mapping | SICOOB_GIFTS_BRIDGE_SECRET, SICOOB_GIFTS_URL |
| `sla-alert-forward` | 141 | encaminha `sla_alert` p/ webhook externo configurável | A | COMPLETA | global_settings | SLA_ALERT_WEBHOOK_SECRET |
| `sla-alert-log-failure` | 117 | registra falha de entrega de alerta SLA | A | COMPLETA | conversation_events, profiles | — |
| `speech-to-text` | 103 | STT (contrato `useAudioRecorder.ts`) | A | COMPLETA | — | ELEVENLABS_API_KEY |
| `status` | 37 | healthcheck mínimo (evita 503 do runtime em GET /status) | D | COMPLETA | — | — |
| `talkx-add-recipients` | 140 | upsert em lote de destinatários de campanha | A | COMPLETA | contacts, talkx_campaigns, talkx_recipients | — |
| `talkx-control` | 159 | start/pause/cancel de campanha; dispara `talkx-send` | A | COMPLETA | talkx_campaigns | TALKX_INTERNAL_SECRET |
| `talkx-scheduler` | 134 | cron 1min: campanhas prontas → `talkx-send` | A | COMPLETA | talkx_campaigns | — |
| `talkx-send` | 413 | motor de disparo em massa com simulação de digitação | B | COMPLETA | talkx_blacklist, talkx_campaigns, talkx_recipients, whatsapp_connections | — |
| `ticket-router` | 156 | sticky agent + round-robin com skills | A | COMPLETA | contacts | — |
| `virustotal-test` | 65 | testa conexão/API key VirusTotal | A | COMPLETA | — | — |
| `voice-agent` | 294 | interpreta comando de voz → ação/rota do app | A | COMPLETA | — | AI_GATEWAY_KEY, LOVABLE_API_KEY |
| `voice-changer` | 288 | conversão de voz (presets + fila) | A | COMPLETA | sts_telemetry, voice_conversion_queue · rpc:claim_next_voice_task | ELEVENLABS_API_KEY |
| `voice-copilot-action` | 230 | executa ação do copiloto de voz sobre contato/conversa | A | COMPLETA | contact_notes, contacts, conversation_analyses, profiles, queues | — |
| `webauthn` | 335 | registro/autenticação de passkeys | A | COMPLETA | passkey_credentials, webauthn_challenges · rpc:cleanup_expired_challenges | — |
| `webhook-diagnostic` | 117 | diagnóstico do pipeline de webhook | A | COMPLETA | messages, whatsapp_connections | — |
| `webhook-hmac-selftest` | 662 (736 dir) | self-test HMAC + cenários anti-replay | A | COMPLETA | — | EVOLUTION_WEBHOOK_SECRET, WEBHOOK_SECRET |
| `webhook-secret-status` | 53 | presença/hash-prefix de `WEBHOOK_SECRET` (não expõe valor) | A | COMPLETA | — | WEBHOOK_SECRET |
| `whatsapp-cloud-api` | 327 | espelho de `evolution-api` sobre Meta Graph | A | COMPLETA | whatsapp_connections, whatsapp_official_credentials · rpc:rpc_insert_message | EXTERNAL_SUPABASE_*, SUPABASE_ANON_KEY |
| `whatsapp-cloud-secrets-status` | 59 | presença (não valor) dos secrets do modo oficial | A | COMPLETA | — | — |
| `whatsapp-cloud-send` | 220 | envio Meta Cloud (text/media/template/sticker/reaction/…) | A | COMPLETA | — | WHATSAPP_CLOUD_ACCESS_TOKEN, WHATSAPP_CLOUD_PHONE_NUMBER_ID |
| `whatsapp-cloud-webhook` | 380 (398 dir) | webhook Meta: handshake GET + HMAC X-Hub-Signature-256 | A | COMPLETA | evolution_messages, whatsapp_cloud_webhook_pings · rpc:rpc_insert_message, rpc_upsert_contact | WHATSAPP_CLOUD_APP_SECRET, WHATSAPP_CLOUD_INSTANCE, WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN, EXTERNAL_SUPABASE_* |
| `whatsapp-cloud-webhook-verify` | 177 | validador de configuração do webhook Cloud (admin) | A | COMPLETA | whatsapp_cloud_webhook_pings | WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN |

---

## 3. Divergências vs ESTADO.md (disco × documento)

Ambos contam 107, mas por caminhos diferentes. Diff exato:

```
comm -23 <disco> <ESTADO.md>  →  evolution-group-sync
                                 evolution-notification-dispatcher
                                 evolution-proxy
```

### 3.1 No disco, ausentes de `ESTADO.md` — 3

| Função | Linhas | Chamador real encontrado |
|---|---|---|
| `evolution-proxy` | 209 | **Grupo A** — `src/pages/admin/ZappWebbDemoPage.tsx:56` (`supabase.functions.invoke('evolution-proxy', …)`) e documentado em `src/integrations/zappweb/evolutionClient.ts:8-10` |
| `evolution-group-sync` | 470 | **Nenhum** em `src/`, `.github/`, `supabase/functions/`. Só menções em migrations (`supabase/migrations/20260811180000_depreca_funcoes_pgnet.sql:7`) → candidata a **grupo F**; cron no banco = NAO_VERIFICADO |
| `evolution-notification-dispatcher` | 502 | **Nenhum** em `src/`. Só menção em `supabase/migrations/20260811150400_evo_notification_outbox_dispatcher.sql:1` → candidata a **grupo F**; cron no banco = NAO_VERIFICADO |

Correção proposta ao resumo A–F: A = 73 (72 + `evolution-proxy`), F = 20 (18 + as 2 acima),
descontando as 3 arquivadas de §3.2 — total 107.

### 3.2 Em `ESTADO.md`, ausentes do disco — 3 (movidas p/ `_archive`)

`ESTADO.md` ainda lista no **grupo E ("VERIFICAR")** três funções que **já foram arquivadas**;
a própria seção "Pendencias" do arquivo diz "arquivar" para as três, mas a tabela-resumo não foi
recontada.

| Função | Onde está | Veredicto já registrado em `ESTADO.md` |
|---|---|---|
| `auto-escalate-sla` | `supabase/functions/_archive/auto-escalate-sla/` | "substituida por SQL — arquivar" |
| `queue-rebalance` | `supabase/functions/_archive/queue-rebalance/` | "modulo SLA nunca ligado — arquivar" |
| `sicoob-outbox-consumer` | `supabase/functions/_archive/sicoob-outbox-consumer/` | "pipeline inativo — arquivar" |

Grupo E real hoje = **1** (`cleanup-storage-orphans`), não 4.

### 3.3 Grupo B subdimensionado

`ESTADO.md` lista 3 relações edge→edge. O disco tem **9** (excluindo auto-referências em strings
de log/URL própria):

| Chamador | Callee | Evidência |
|---|---|---|
| `gmail-send` | `email-track-link`, `email-track-pixel` | já em `ESTADO.md` |
| `talkx-control`, `talkx-scheduler` | `talkx-send` | já em `ESTADO.md` |
| `send-email` | `gmail-send` | `supabase/functions/send-email/index.ts` (redirect legado) |
| `public-api` | `evolution-api` | `supabase/functions/public-api/index.ts` |
| `webhook-diagnostic` | `evolution-webhook` | `supabase/functions/webhook-diagnostic/index.ts` |
| `whatsapp-cloud-webhook-verify` | `whatsapp-cloud-webhook` | `supabase/functions/whatsapp-cloud-webhook-verify/index.ts` |
| `_shared` (handlers de webhook) | `ai-transcribe-audio`, `classify-sticker`, `evolution-webhook` | `supabase/functions/_shared/evolution-webhook-*.ts` |

Isso não muda o total, mas muda a **razão** de várias funções serem "mantidas": p.ex.
`ai-transcribe-audio` e `classify-sticker` têm chamador de backend além do front.

### 3.4 Falsos-negativos no grupo F — 2 funções têm chamador no front

`ESTADO.md` declara o critério "chamador = `invoke('nome')` ou `functions/v1/nome`". Esse regex
**não casa a forma genérica** `invoke<T>('nome')`, nem invocações com quebra de linha entre
`invoke(` e o nome. Duas funções do grupo F ("SEM CHAMADOR identificado") têm chamador real:

| Função | Chamador | Cadeia até a UI |
|---|---|---|
| `login-attempts` | `src/lib/loginAttempts.ts:88` — `supabase.functions.invoke<LoginAttemptsPayload>('login-attempts', …)` | `src/features/auth/hooks/useAuthForm.ts:15` e `src/pages/Auth.tsx:22` importam de `@/lib/loginAttempts` → **em uso real** |
| `followup-bridge` | `src/hooks/useFollowupBridge.ts:62-63` — `supabase.functions.invoke<TriggerSequenceResult>(\n 'followup-bridge', …)` | `useFollowupBridge` **não é importado por nenhum componente** (`grep -rn useFollowupBridge src/` → só o próprio arquivo) → chamador existe no código mas o hook está órfão |

`grep -rn "functions.invoke<" src/` retorna exatamente esses 2 casos — não há um terceiro
escapando pelo mesmo motivo. `login-attempts` deve sair do grupo F para o A;
`followup-bridge` permanece candidata a arquivar, mas o hook `useFollowupBridge.ts`
deve ser arquivado junto (hoje o diagnóstico "0 menções" esconde um hook morto no front).

---

## 4. Violações da regra de gateway Evolution

Regra: todo egresso HTTP p/ Evolution API via
`supabase/functions/_shared/providers/evolution/client.ts`.

### 4.1 Violação confirmada — 1 função

**`connection-health-check`** — resolve a URL do env e faz `fetch` direto, ignorando o gateway.
O próprio código admite:

- `supabase/functions/connection-health-check/index.ts:191-194`
  ```
  // Evolution API — URL/KEY via gateway (client.ts resolve a env; aqui só
  // para o detector de instância fantasma, que ainda usa fetch direto).
  const evolutionUrl = requireEnv('EVOLUTION_API_URL');
  const evolutionKey = requireEnv('EVOLUTION_API_KEY');
  ```
- `supabase/functions/connection-health-check/index.ts:201` — `const baseUrl = evolutionUrl.replace(/\/+$/, '')`
- `supabase/functions/connection-health-check/index.ts:40` — `fetch(\`${baseUrl}/instance/fetchInstances?instanceName=…\`)`
- `supabase/functions/connection-health-check/index.ts:151` — `fetch(\`${baseUrl}/instance/fetchInstances\`)`

São **2 chamadas HTTP de produção** fora do gateway (`fetchOwnerJid`, `fetchAllInstances`).

### 4.2 Usos de `EVOLUTION_API_URL` que **não** são violação

| Local | Por quê |
|---|---|
| `_shared/providers/evolution/client.ts:31-32` | é o próprio gateway |
| `evolution-api/index.ts:247` | só string de mensagem de erro |
| `connection-test/index.ts:114` | string de mensagem; o egresso usa `getBaseUrl()`/`evolutionClient.get()` (`connection-test/index.ts:100,120`) |
| `evolution-group-sync/index.ts:24`, `evolution-proxy/index.ts:9` | comentário/docblock |
| `*/__tests__/*`, `*.test.ts` | fixtures de teste (`Deno.env.set`) |

### 4.3 `callEvolutionApi`

`grep -rn "callEvolutionApi" supabase/functions/` → **0 ocorrências**. O símbolo já não existe nem
em mocks dentro de `supabase/functions/`. Remoção de runtime (F3, 2026-08-13) confirmada neste
diretório.

---

## 5. Funções STUB ou MORTAS (candidatas a arquivar)

### 5.1 STUB declarado — 1

**`email-imap-bridge`** (grupo A em `ESTADO.md`, ou seja, **chamada pelo front**).
`supabase/functions/email-imap-bridge/index.ts:10-16`:

> `TODO(EMAIL-02): NÃO implementado de verdade — Edge Functions são HTTP-only (sem TCP),`
> `então IMAP/SMTP real (fetchInbox/sendMessage) é INVIÁVEL aqui.`
> `Estado atual: apenas getProviderConfig/saveCredentials/testConnection (validação de formato)`
> `/listProviders. […] Não construir UI/worker até a decisão de broker.`

As ações `fetchInbox` e `sendMessage` são anunciadas no docblock (`:19-21`) mas não podem
funcionar no runtime Deno de Edge Function. **Não é candidata a arquivar cegamente** — é
candidata a *contrato honesto* (retornar 501 explícito) ou a broker externo.

### 5.2 Caminho morto dentro de função viva — 2

| Função | Caminho morto | Evidência |
|---|---|---|
| `evolution-credentials` | GET (entregava `X-Evolution-Key` ao browser) aterrado com **410 Gone** desde 2026-08-14 | `evolution-credentials/index.ts:18-23,151-158` |
| `send-email` | função inteira é redirect legado p/ `gmail-send`; marcada `DEPRECADO` no docblock | `send-email/index.ts` (docblock) |

### 5.3 Quebrada em produção — 1

**`evolution-templates`** (grupo A). `supabase/functions/evolution-templates/index.ts:1-19`
documenta a causa raiz: o gate `requireServiceRoleOrCron()` rejeita o único chamador real
(`src/hooks/useWhatsAppTemplates.ts`, que manda só JWT de usuário) → **401 em 100% das chamadas
do browser**; `syncFromEvolution` nunca funcionou. O hook tolera o 401 com fallback local, então
a falha é silenciosa para o usuário. Decisão pendente do plano de desacoplamento V4 #31.

### 5.4 Sem chamador no repo — 19 candidatas

As 18 do grupo F de `ESTADO.md` (todas COMPLETA em implementação — nenhuma é stub),
**menos** `login-attempts` (tem chamador real, §3.4), **mais** `evolution-group-sync` e
`evolution-notification-dispatcher` (§3.1) = 19. Cron no banco = **NAO_VERIFICADO**
(sem acesso a DB nesta auditoria); `ESTADO.md` de 2026-08-15 registra 218 jobs `cron.job` dos quais
apenas `nps-daily-trigger` chama edge fn, o que sustenta — mas não prova — a ausência de chamador
para as 20.

### 5.5 MORTA — 0

Nenhuma função com todos os caminhos de execução inalcançáveis.

---

## 6. Achados

| ID | Achado | Caminho:linha | Severidade |
|---|---|---|---|
| **A1** | **Violação da regra de gateway Evolution.** `connection-health-check` faz 2 `fetch` diretos à Evolution API usando `requireEnv('EVOLUTION_API_URL')`, contrariando a regra de gateway único. O comentário no código reconhece a exceção sem ADR que a autorize. | `supabase/functions/connection-health-check/index.ts:40`, `:151`, `:193` | **ALTA** |
| **A2** | **Função do grupo A é STUB.** `email-imap-bridge` está classificada como "chamada pelo front / manter", mas o próprio código declara que IMAP/SMTP real é inviável em Edge Function. Front pode estar exibindo UI para uma capacidade inexistente. | `supabase/functions/email-imap-bridge/index.ts:10-16` | **ALTA** |
| **A3** | **Função do grupo A quebrada em produção com falha silenciosa.** `evolution-templates` retorna 401 para o único chamador (browser); `syncFromEvolution` nunca funcionou. `ESTADO.md` a lista como "manter" sem sinalizar o defeito. | `supabase/functions/evolution-templates/index.ts:1-19` | **ALTA** |
| **A4** | **3 edge functions no disco não estão em `ESTADO.md`** — `evolution-proxy` (tem chamador no front), `evolution-group-sync`, `evolution-notification-dispatcher` (nenhum chamador no repo). Viola a "Regra permanente" do próprio `ESTADO.md` ("toda edge function nova declara seu chamador no mesmo commit"). | `supabase/functions/{evolution-proxy,evolution-group-sync,evolution-notification-dispatcher}/index.ts` vs `ESTADO.md:79-206` | **ALTA** |
| **A4b** | **O critério de detecção de chamador de `ESTADO.md` tem falso-negativo sistemático.** O regex `invoke('nome')` não casa `invoke<T>('nome')` nem invocações quebradas em duas linhas. Isso colocou `login-attempts` (em uso real via `Auth.tsx`) e `followup-bridge` no grupo F "SEM CHAMADOR — candidata a arquivar". Arquivar `login-attempts` com base nesse diagnóstico **quebraria o fluxo de login**. | `src/lib/loginAttempts.ts:88`, `src/hooks/useFollowupBridge.ts:62`; critério em `ESTADO.md:17` | **ALTA** |
| **A5** | **Grupo E de `ESTADO.md` está desatualizado.** Lista 4 funções; 3 (`auto-escalate-sla`, `queue-rebalance`, `sicoob-outbox-consumer`) já foram movidas para `_archive` — a própria seção "Pendencias" do arquivo registra o veredicto "arquivar", mas a tabela-resumo não foi recontada. Grupo E real = 1. | `supabase/functions/_archive/` vs `ESTADO.md:113-119` | **MÉDIA** |
| **A6** | **`main` (entrypoint, "FONTE DE VERDADE" de auth) não lista `health`, `metrics`, `mcp`, `mcp-query`, `mcp-server` em `PUBLIC_FNS`.** O comentário na linha 41 diz "health GET público (POST exige JWT)" mas `health` **não** está no `Set`. Com `VERIFY_JWT=true`, o scrape do Prometheus (`health` como gatekeeper de `metrics`) exigiria JWT — apesar de `health` e `metrics` terem segredo próprio (`HEALTH_SECRET`, `METRICS_SCRAPE_TOKEN`). Comportamento em runtime = NAO_VERIFICADO. | `supabase/functions/main/index.ts:28-58` (comentário órfão em `:41`) | **MÉDIA** |
| **A7** | **Grupo B subdimensionado (3 declarados × 9 reais).** Relações edge→edge não registradas: `send-email→gmail-send`, `public-api→evolution-api`, `webhook-diagnostic→evolution-webhook`, `whatsapp-cloud-webhook-verify→whatsapp-cloud-webhook`, `_shared→{ai-transcribe-audio, classify-sticker, evolution-webhook}`. Isso significa que a justificativa de "manter" de várias funções em `ESTADO.md` está incompleta. | ver §3.3 | **MÉDIA** |
| **A8** | **Defasagem de topologia `evo.*` em docblocks/comentários.** 6 comentários ainda descrevem tabelas de negócio no schema `evo` (`evo.evolution_contacts`, `evo.evolution_messages`, `evo.evolution_followups`), que **não existem mais** — as físicas estão em `zapp`. Nenhum é código executável (não há `.schema('evo')` em runtime), mas induz erro em quem lê. | `_shared/evolution-webhook-handlers.ts:386`, `_shared/evolution-webhook-msg-handlers.ts:115`, `public-api/index.ts:56`, `evolution-group-sync/index.ts:247`, `connection-health-check/index.ts` (docblock, "schema evo"), `followup-bridge/index.ts:2` | **MÉDIA** |
| **A9** | **Dependência em edge function de projeto Supabase EXTERNO não inventariada.** `sicoob-bridge-reply` faz `fetch(\`${SICOOB_GIFTS_URL}/functions/v1/chat-bridge\`)`; `chat-bridge` **não existe** neste repo. Acoplamento cross-projeto sem registro em `ESTADO.md`. | `supabase/functions/sicoob-bridge-reply/index.ts:105` | **MÉDIA** |
| **A10** | **9 funções `ai-*` são forwarders puros para `ai-router`** (STEP 4B) e continuam contadas como funções independentes no grupo A. Somam ~485 linhas de shim + 9 deploys + 9 cold starts, contra o objetivo declarado do próprio `ai-router` ("consolida 12+ funções em um entry point"). Consolidação incompleta. | `supabase/functions/ai-{auto-tag,churn-analysis,classify-tickets,conversation-analysis,conversation-summary,enhance-message,suggest-reply,transcribe-audio}/index.ts:1`; `ai-router/index.ts:1-6` | **BAIXA** |
| **A11** | **`ai-auto-tag` está no grupo F (sem chamador) mas é forwarder ativo p/ `ai-router`.** Se `ai-router` já expõe a ação, o forwarder é código morto; se não, há capacidade perdida. Não resolvível sem verificar as ações de `ai-router` (4.225 linhas) — **NAO_VERIFICADO**. | `supabase/functions/ai-auto-tag/index.ts`; `ESTADO.md:85` | **BAIXA** |
| **A12** | **`send-email` está marcada `DEPRECADO` no docblock mas não é um mero redirect** — mantém um segundo caminho vivo (fallback Resend p/ transacionais sem conta Gmail, 503 se `RESEND_API_KEY` ausente). Depreciar/remover assumindo "só redireciona p/ `gmail-send`" derrubaria os transacionais. | `supabase/functions/send-email/index.ts:83-87` (fallback) vs docblock `:1-5` | **BAIXA** |
| **A13** | **Hook órfão no front espelhando função órfã no backend.** `src/hooks/useFollowupBridge.ts` é o único chamador de `followup-bridge` e não é importado por nenhum componente. Se `followup-bridge` for arquivada, o hook deve ir junto. | `src/hooks/useFollowupBridge.ts` | **BAIXA** |

---

## 7. O que ficou NAO_VERIFICADO

- Se qualquer função **compila**, **passa em type-check** ou **está deployada**. Não foi executado
  nada; nenhuma inferência de runtime.
- Quais das 107 estão de fato publicadas na instância self-hosted (sem acesso ao banco nem à API
  de functions).
- Se algum dos 218 `cron.job` chama `evolution-group-sync` / `evolution-notification-dispatcher`
  ou qualquer função do grupo F. `ESTADO.md` (2026-08-15) afirma que só `nps-daily-trigger` chama
  edge fn, mas isso não foi reverificado aqui.
- Chamadores externos fora do repo (N8N, Cloudflare Workers, Bitrix, Sicoob Gifts). `ESTADO.md`
  registra "Cloudflare Workers: nao verificado nesta rodada" — continua assim.
- Cobertura das ações reais de `ai-router` (4.225 linhas) — lido apenas o docblock e os símbolos
  de tabela/RPC.
