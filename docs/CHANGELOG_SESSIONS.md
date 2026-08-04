# CHANGELOG DE SESSÕES — ZAPP-WEB

> **Arquivo histórico.** Contém o registro de bugs corrigidos e melhorias implementadas em cada sessão de desenvolvimento.
> O estado atual do sistema está em `CLAUDE.md` e `docs/SCHEMA_SNAPSHOT.md`.
> Para bugs abertos, ver seção "BUGS ABERTOS" no `CLAUDE.md`.

---

## Sessão 2026-07-17 (tarde) — Meta 10/10

### Melhorias Executadas

| Item | Ação | Status |
|---|---|---|
| Branches lovable-sync | Deletados (−106K/−104K linhas vs main se mergeados) | ✅ |
| `public._wal_slot_guard_events` | COMMENT documentando deny-all intencional | ✅ |
| `bpm_check_breached_slas` | Cron criado (job 198, */5 min) | ✅ |
| TypeScript 0 errors | `tsc --noEmit --skipLibCheck`: 0 erros | ✅ |
| Gates CI | Todos passando: schema-usage, casts, simulate-schema (300 cenários) | ✅ |
| `fn_rate_limit_check` | `p_window_minutes` agora usado (floor epoch) | ✅ |
| 56 RPCs auditadas | 53/53 existem; 3 são mocks/fail-open | ✅ |

### Estado Final do Banco (2026-07-17)
- Schemas: `zapp` (313 tab, 405 views, 1025 fns) / `evo` (189 tab RLS 100%) / `public` (1 tab)
- anon: 0 funções executáveis, 0 views sem security_invoker
- SECDEF: 0 sem search_path fixo (via query `p.proconfig @> ARRAY['search_path=zapp']`)
- Realtime: `zapp.failed_messages` na publication ✅
- Crons: 119 ativos (novo: bpm-check-breached-slas)

---

## Sessão 2026-07-20 — Auditoria de Schema e Correção de Bugs

### Melhorias Executadas

| Item | Arquivo / Migração | Ação | Status |
|---|---|---|---|
| BUG-12 — AuditLogPanel colunas erradas | `src/components/contacts/AuditLogPanel.tsx` | Interface e SELECT corrigidos: `old_values jsonb`, `new_values jsonb`, `reason text` | ✅ |
| BUG-13 — fromIso stale closure | `useDispatchErrorLogs.ts` | `useMemo([hours])` para estabilizar `fromIso` | ✅ |
| BUG-14 — currentPage não reseta | `useDlqAuditLog.ts` | `useEffect([action, limit])` → `setCurrentPage(0)` | ✅ |
| BUG-15 — SQL injection `sort_direction` | `20260802000003` | Whitelist + `RAISE EXCEPTION P0001` em `search_contacts_cursor` | ✅ |
| BUG-16 — COUNT decresce por página | `20260802000003` | CTE `total` antes do cursor predicate | ✅ |
| BUG-17 — Cursor keyset incompleto | `20260802000003` | `ROW(sort_col, id)` composto com pivot pré-buscado | ✅ |
| BUG-18 — GRANT ausente `search_contacts_cursor` | `20260802000003` | `REVOKE FROM PUBLIC, anon; GRANT TO authenticated` restaurado | ✅ |
| BUG-19 — occurred_at/created_at mismatch | `20260720000004` | `rpc_list_dispatch_error_logs_cursor`: `d.occurred_at` direto + cursor alinhado | ✅ |
| BUG-20 — `public.` view reference em SECDEF | `20260720000004` | `FROM public.dispatch_error_logs` → `FROM dispatch_error_logs` | ✅ |
| BUG-21 — `sentiment_alerts` fora da publication | `20260720000005` | `ALTER PUBLICATION supabase_realtime ADD TABLE zapp.sentiment_alerts` | ✅ |
| BUG-22 — Subscriptions em tabelas fantasma | `useNotificationManagement.ts` | `goal_notifications` / `transcription_notifications` → `app_notifications` com filtro client-side | ✅ |
| Security hardening — funções internas | `20260720000002` | REVOKE EXECUTE FROM PUBLIC/anon em funções internas | ✅ |
| Stub `check_download_permission` | `20260720000001` | Fail-open com SQLSTATE 42883 | ✅ |
| `useRealtimeDashboardManagement` | `useRealtimeManagement.ts` | Subscription `zapp.dashboard_data` (inexistente) → `zapp.app_notifications` | ✅ |
| TypeScript 0 erros | — | `tsc --noEmit --skipLibCheck`: 0 erros | ✅ |

### Estado do Realtime (2026-07-20)
- `zapp.failed_messages` ✅ (física, publicada)
- `zapp.sentiment_alerts` ✅ (`20260720000005`)
- `zapp.app_notifications` ✅ (publicada, usada por dashboard + goal + transcription)
- `zapp.user_settings` ✅ (`20260720000006`)
- `zapp.workspace_settings` ✅ (`20260720000006`)
- `zapp.dispatch_error_logs` ✅ (`20260721_fix_cursor_rpcs_and_search_path.sql`)

---

## Sessão 2026-07-22 — QA Exaustiva de Infraestrutura

### Contexto
QA realizado diretamente no ambiente de produção AtomicaBR (VPS Docker Swarm).
144 containers auditados, 11 módulos testados, 7 bugs encontrados.

### Bugs Encontrados e Status (2026-07-22)

| # | Componente | Problema | Severidade | Status |
|---|---|---|---|---|
| BUG-A | CrowdSec Bouncer | 7 dias sem atualizar decisões | 🔴 CRÍTICO | ✅ Corrigido (restart) |
| BUG-B | WAL Slot | `cainophile_s7fgrb36` 278MB lag crescendo | 🔴 CRÍTICO | ✅ Corrigido (DB restart) |
| BUG-C | n8n | FK constraint violada em workflow_history | 🟠 ALTO | ⏳ **ABERTO** → ver CLAUDE.md |
| BUG-D | Edge Function | POST /rest/v1/contacts 404 | 🟠 ALTO | ⏳ **ABERTO** → ver CLAUDE.md |
| BUG-E | Glitchtip | DB disconnect pós-deploy | 🟡 MÉDIO | ✅ Corrigido (restart) |
| BUG-F | Backups | Falso alarme (backups R2 OK) | 🟡 MÉDIO | ✅ Investigado e limpo |
| BUG-G | bridge.js | Sem Express error handler | 🟢 BAIXO | Baixo risco |

### Shift-Left Items (runtime — recriar via docs)

| Item | Local | Como Recriar |
|---|---|---|
| alwaysOnline=true | Evolution DB | `infra/evolution/SETTINGS.md` |
| readMessages=true | Evolution DB | `infra/evolution/SETTINGS.md` |
| Webhook disabled | Evolution DB | `infra/evolution/SETTINGS.md` |
| Cron: WAL Monitor (15min) | Hermes Agent | `infra/runbooks/OPERATIONS.md` |
| Cron: Backup Check (6h) | Hermes Agent | `infra/runbooks/OPERATIONS.md` |
| VACUUM ANALYZE | PostgreSQL | Efeito temporário (re-aplicar) |
| BACKUP_FAILED purge | Filesystem | Já limpo (245MB) |

### Métricas do Ambiente (2026-07-22)

| Métrica | Valor |
|---|---|
| Docker | 28.1.1, Ubuntu 20.04, 12 vCPU, 24GB RAM |
| Disco | 119 GB usado (61%), 75 GB livre |
| Containers | 144 total (107 running) |
| Cache hit ratio | 99.91% |
| Evolution msgs | 46.700+ processadas |
| RabbitMQ | 17/17 filas, 0 erros |
| Backups R2 | 13 consecutivos (último: 22/07, 27MB) |
| WAL total | 1.024 GB |

---

## Sessão 2026-07-24 — Auditoria Evolution API v2.3.7

### Contexto
Auditoria da Evolution API v2.3.7 contra documentação oficial. 300+ cenários simulados.
13 tarefas de melhoria identificadas.

### Melhorias Implementadas

| # | Tarefa | Componente | Ação | Status |
|---|---|---|---|---|
| T5 | LGPD: sanitização de logs | Stack 25 (evolution) | Plaintext removido de logs, API key mascarada, limite 512B/msg | ✅ |
| T6 | C-1: Webhook site temporário | `public."Setting"` | Webhook desativado; URL dev removida | ✅ Mitigado |
| T7 | A-2: 4 eventos RabbitMQ faltando | `public."Rabbitmq"` | `RABBITMQ_EVENTS_*` adicionados ao stack como fallback | ⚠️ Parcial |
| T8 | T3: makeBucket R2 ausente | Evolution API | Bucket `wa-media` criado via R2 API | ✅ |
| T9 | Stack 25: features habilitadas | Docker Stack | `OPENAI_ENABLED`, `DIFY_ENABLED`, `TYPEBOT_ENABLED`, `N8N_ENABLED=true` | ✅ |
| T9 | Stack 25: 8 novos eventos RabbitMQ | Docker Stack | `LABELS_EDIT`, `MESSAGES_REACTION`, `SEND_MESSAGE`, `PRESENCE_UPDATE`, etc. | ✅ |
| T10 | DB: migrations novos handlers | Supabase | Sem migration adicional necessária | ✅ |
| T11 | Edge Function: routing `messages.reaction` | `evolution-webhook/index.ts` | Bloco de roteamento adicionado | ✅ |
| T12 | N8N: integração nativa | Evolution API wpp2 | Bot criado (`cmryc6jim0006nm07nkl49g8h`) | ✅ |

### Estado do Realtime (2026-07-24)
- `financeiro.payment_links` ✅ (`20260724000006`)
- `email_app.email_accounts` ✅ (`20260724000006`)
- `email_app.email_threads` ✅ (`20260724000005`)
- `zapp.agent_stats`, `zapp.audio_memes`, `zapp.qr_attempts` ✅ (`20260724000005`)
- `zapp.queue_members`, `zapp.queue_positions`, `zapp.queues` ✅ (`20260724000005`)
- `zapp.sales_deals`, `zapp.talkx_campaigns`, `zapp.team_messages` ✅ (`20260724000005`)
- `zapp.warroom_alerts`, `zapp.whatsapp_connections` ✅ (`20260724000005`)
- `zapp.evolution_sentiment_analysis` ✅ (`20260724000007`)

### Pendências Pós-Sessão (2026-07-24)

| Item | Ação Necessária | Autorização |
|---|---|---|
| T7 — 4 eventos RabbitMQ na tabela DB | `UPDATE public."Rabbitmq" SET events = ARRAY[...21 events...]` via psql | **Sim — exec em container prod** |
| BUG-C (n8n FK) | Investigar workflow_history FK | Sim |
| BUG-D (Edge Function POST 404) | `POST /rest/v1/contacts` — verificar handler | Sim |

---

## Histórico Completo de Bugs Resolvidos

| ID | Arquivo | Problema | Migração/Fix |
|----|---------|----------|-------------|
| BUG-1 | `useAdminManagement.ts` | `safeFrom('queue_skills')` → `safeFrom('queue_skill_requirements')` | Código |
| BUG-2 | `useAudioVoiceChange.ts` | Bucket `chat-media` → `audio-messages`; `mediaUrl` → `media_url` | Código |
| BUG-3 | `fn_messages_view_insert_handler` / `messageSender.ts` | Trigger INSTEAD OF INSERT não atribuía `NEW.id`; `data.id` retornava NULL | DB + Código |
| BUG-4 | `useCRMManagement.ts` | `contact_notes` INSERT omitia FK não-nula `author_id` | Código |
| BUG-5 | `20260712001500_cursor_pagination.sql:145` | GRANT em `rpc_list_dispatch_error_logs_cursor` tinha 7 params vs 8 | `20260716_fix_dispatch_error_logs_grant.sql` |
| BUG-6 | `useDispatchErrorLogs.ts` | `p_cursor_id` hardcoded como `null` | Código |
| BUG-7 | `useFailedMessages.ts:142` | Regressão: `schema: 'public'` → `schema: 'zapp'` (VIEW vs tabela física) | Código (revertido) |
| GAP-1 | `useCampaigns.ts:100` | `add_contacts_to_campaign` sem UNIQUE constraint | `20260721000004` |
| GAP-2 | `useIntegrationManagement.ts:54,69` | `initiate_gmail_oauth`, `complete_gmail_oauth` ausentes | `20260717000002` (stubs) |
| GAP-3 | `useIntegrationManagement.ts:156` | `sync_to_crm` ausente | `20260717000002` (stub) |
| GAP-4 | `useMediaManagement.ts:93,128` | `export_user_data`, `import_user_data` ausentes | `20260717000002` (stubs) |
| BUG-8 | `20260712001500.sql:8` | `rpc_list_failed_messages_cursor` 9 cols vs 15 esperadas | `20260716_fix_rpc_list_failed_messages_cursor_columns.sql` |
| BUG-9 | `useMediaManagement.ts:164` | `check_download_permission` ausente bloqueava downloads | `20260720000001` (fail-open) |
| GAP-5 | `useCRMManagement.ts:146` | `enrich_contact` ausente | `20260717000002` (stub) |
| GAP-6 | `useAnalyticsManagement.ts:168` | `get_latest_analysis` ausente | `20260717000002` (stub) |
| GAP-7 | `useFailedMessages.ts:78` | Cursor keyset sem ROW() / GRANT ausente em 4 RPCs | `20260721000008` + `20260721_fix_cursor_rpcs.sql` |
| GAP-8 | `useDispatchErrorLogs.ts:61` | `rpc_list_dispatch_error_logs_cursor` no schema `public` | `20260717000003` |
| GAP-9 | `useDlqAuditLog.ts:51` | `rpc_dlq_list_audit_cursor` no schema `public` | `20260717000003` |
| GAP-10 | `useQueueManagement.ts:203,415` | `zapp.queue_analytics` inexistente | `20260717000001` |
| BUG-10 | `useFailedMessages.ts:60` | `effectiveFrom` sem `useMemo` → loop infinito de refetch | Código |
| BUG-11 | `20260717000002.sql` | Stubs sem RAISE: `setIsAuthenticated(true)` incondicional | Código (stubs atualizados) |
| BUG-12 | `AuditLogPanel.tsx` | Colunas `field_name`/`old_value` → `old_values jsonb`/`new_values jsonb` | Código |
| BUG-13 | `useDispatchErrorLogs.ts` | `fromIso` sem `useMemo` → stale closure | Código |
| BUG-14 | `useDlqAuditLog.ts` | `currentPage` não resetava ao mudar filtros | Código |
| BUG-15 | `search_contacts_cursor` | `sort_direction` injetável no ORDER BY | `20260802000003` |
| BUG-16 | `search_contacts_cursor` | COUNT(*) OVER() pós-cursor → total decrescia | `20260802000003` |
| BUG-17 | `search_contacts_cursor` | Cursor keyset sem ROW() → ties pulavam linhas | `20260802000003` |
| BUG-18 | `search_contacts_cursor` | REVOKE/GRANT ausente em `20260717220000` | `20260802000003` |
| BUG-19 | `rpc_list_dispatch_error_logs_cursor` | `d.created_at AS occurred_at` mismatch cursor | `20260720000004` |
| BUG-20 | `rpc_list_dispatch_error_logs` | `FROM public.dispatch_error_logs` dentro de SECDEF | `20260720000004` |
| BUG-21 | `useAlertManagement.ts:363` | `sentiment_alerts` fora da publication `supabase_realtime` | `20260720000005` |
| BUG-22 | `useNotificationManagement.ts:420,447` | Subscriptions em tabelas fantasma | Código |
| BUG-23 | `settingsRepository.ts:114,130` | `user_settings`/`workspace_settings` fora da publication | `20260720000006` |
| BUG-24 | `useRealtimeSentimentAlerts.ts:18` | Subscription em `public.audit_logs` (VIEW) | Código |
| BUG-25 | `PaymentLinksView.tsx:61` | Schema errado `zapp` → `financeiro` | `20260724000006` |
| BUG-26 | `useGmailOAuthFlow.ts:292` | `email_app.email_accounts` fora da publication | `20260724000006` |
| BUG-27 | `20260724000004.sql` | `FOREACH t SLICE 1` com `t TEXT` (deveria ser `TEXT[]`) | Supercedido por `20260724000006` |
| BUG-28 | `evolution-sentiment/index.ts:66` | INSERT em `zapp.evolution_sentiment_alerts` (inexistente) | `evolution-sentiment/index.ts` |
| BUG-29 | `evolution-sentiment/index.ts:55` | `zapp.evolution_sentiment_analysis` sem migração de criação | `20260724000007` |
| BUG-30 | `20260724000007` + `20260724000008` | `CREATE TABLE IF NOT EXISTS` silenciosamente pulava VIEWs | `20260724000007`+`008` reescritos |
| BUG-31 | `evolution-sentiment/index.ts:55,68` | UUID type mismatch: `msgId` não-UUID → INSERT abortava | `evolution-sentiment/index.ts` |
| BUG-32 | `useConnectionAlertsPush.ts:26` | Subscription em `zapp.notifications` (VIEW proxy) | `20260724000048` |
| BUG-33 | `useIncomingCallListener.ts:29` | Subscription em `zapp.calls` (VIEW proxy) | `20260724000048` |
| BUG-34 | `TalkXLiveMonitor.tsx:59` | Subscription em `zapp.talkx_recipients` (VIEW proxy) | `20260724000048` |
| BUG-35 | 5 edge functions | `from('notifications')` → VIEW proxy | 5 edge functions atualizadas |
| BUG-36 | `useTransfersPaginated.ts` | `rpc_list_transfers_paginated` no schema `public` | `20260724000049` |
| BUG-37 | 14 edge functions | 25 tabelas sem VIEW proxy em `zapp` → PGRST205 | `20260802000004` |
| BUG-38 | Storage `audio-messages` | `public=false` + sem policy `anon SELECT` | `20260802000001` |
| DB-BUG-12 | `zapp.rpc_dlq_bulk_retry_now` | Chamava `public.has_role()` (inexistente) | DROP+CREATE com `zapp.has_role` |
| DB-BUG-13 | `zapp.rpc_dlq_list_audit` | JOIN `p.id = a.user_id` errado (deveria ser `p.user_id`) | DB fix |
| DB-BUG-14 | `zapp.rpc_dlq_log_item_action` | 2 overloads inseguros gravando em tabela errada | DB fix |
| DB-BUG-15 | `zapp.rpc_dlq_log_reprocess_*` | `search_path` inseguro com schemas múltiplos | DB fix |
| DB-BUG-16 | `zapp.search_contacts_cursor` | `sort_direction = 'asc'` case-sensitive + injetável | DB fix |
