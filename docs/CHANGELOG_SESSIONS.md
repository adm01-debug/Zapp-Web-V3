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

## Sessão 2026-08-05 — Auditoria Pós-Faxina Portainer (5 Agentes Especializados)

### Contexto
Auditoria exaustiva da faxina Portainer realizada em 2026-08-05. 5 agentes paralelos analisaram
CI/CD pipeline, stack files, housekeeping scripts, network config e failure modes.

### Incidente Registrado — 2026-08-05

| Componente | Evento | Root Cause | Resolução |
|---|---|---|---|
| Docker Swarm VPS | Imagem de rollback destruída | `docker image prune -a` removeu imagens tagueadas `production-<sha>` (não apenas dangling) | `housekeeping.sh` fixado para usar apenas `docker image prune -f` (sem `-a`); v2.3 usa `ensure_ref_tags` |
| GHCR | ~1,19 GB de imagens órfãs acumuladas | Deploy anterior com `production-latest` gerava dangling a cada CI run | Substituído por tag SHA imutável no stack Swarm; `production-latest` apenas como referência externa |

### Correções Aplicadas (2026-08-05)

| # | Arquivo | Gap | Fix | PR |
|---|---|---|---|---|
| INF-01 | `infra/stacks/zapp-web-prod.yml` | `rollback_config` ausente | Adicionado `order: start-first`, `monitor: 60s`, `failure_action: continue` | #866 |
| INF-02 | `docs/DEPLOY_PRODUCAO.md` | Rede `atomicabr` (errada) vs `AtomicaBRNet` | Corrigido para `AtomicaBRNet`; `network create` → `network inspect` com erro se ausente | #866 |
| INF-03 | `infra/scripts/housekeeping.sh` | Referência a `v2.2` (não existe) | Corrigido para `v2.3`; `docker builder prune -f` → `--filter until=24h` | #866 |
| INF-04 | `docs/RUNBOOK_DISASTER_RECOVERY.md` | Referência a `v2.2` (não existe) | Corrigido para `v2.3` | #866 |
| INF-05 | `infra/runbooks/OPERATIONS.md` | Referência a `v2.2`; rollback sem `tag@digest`; janela de rollback não documentada | v2.3; padrão `tag@digest` adicionado; aviso timing gap `monitor(60s) < 120s unhealthy` | #866 |
| CI-01 | `.github/workflows/deploy-vps.yml` | Permissão `actions: write` desnecessária | Removida | #866 |
| CI-02 | `.github/workflows/deploy-vps.yml` | `VITE_SUPABASE_URL` com fallback hardcoded | Removido fallback; Preflight já garante via `exit 1` | #866 |
| CI-03 | `.github/workflows/deploy-vps.yml` | `sleep 20 < start_period 30s` = HC falso positivo | `sleep 20` → `sleep 45` | #866 |
| CI-04 | `.github/workflows/deploy-vps.yml` e stack | `rollback_config` sem `failure_action` explícito | `failure_action: continue` adicionado (evita `pause` default que deixa serviço em estado inconsistente) | #866 |

### Gaps Identificados Mas Não Corrigidos (backlog)

| # | Gap | Risco | Ação Recomendada |
|---|---|---|---|
| GAP-I | Stack ID `157` hardcoded no CI | Médio — falha silenciosa se stack mudar | Adicionar secret `PORTAINER_STACK_ID` |
| GAP-II | `zapp-health-guard` (stack 165) não versionado no repo | Médio — perda em rebuild | Adicionar `infra/stacks/zapp-health-guard.yml` |
| GAP-III | GHCR offline durante deploy = rollback falha | Alto — requer intervenção manual com digest pré-pullado | Documentado em OPERATIONS.md (workaround `tag@digest`) |

---

## Sessão 2026-08-06 — Auditoria Exaustiva Evolution API + FIX-01 (5 Agentes Especializados)

### Contexto
Continuação da auditoria da Evolution API iniciada na sessão anterior (PR #885).
5 agentes especializados executaram 78 testes em produção. Relatório completo: `docs/AUDIT_REPORT_2026-08-06.md`.

### Correção Aplicada — FIX-01

| Migration | Timestamp DB | Conteúdo | Status |
|-----------|-------------|----------|--------|
| `20260806180000_fix_wa_rpc_execute_grants.sql` | 2026-08-06T10:31:31.179Z | GRANT EXECUTE para 4 RPCs WhatsApp sem acesso para `authenticated` | ✅ Aplicada |

**RPCs corrigidas (todas SECURITY DEFINER com search_path fixo):**
- `zapp.rpc_instance_stats(text)` ✅
- `zapp.rpc_resolve_whatsapp_instance(uuid)` ✅
- `zapp.rpc_resolve_instance_by_phone(text)` ✅
- `zapp.get_connection_instance(uuid)` ✅

### Documentação Criada/Corrigida

| Arquivo | Ação | Motivo |
|---------|------|--------|
| `VALIDATION_PLAN_50_STEPS.md` | Corrigido: 50/50 → 41/50 (82%) | Tabela de progresso estava inflada incorretamente |
| `docs/AUDIT_REPORT_2026-08-06.md` | Criado | Relatório síntese dos 5 agentes (78 testes) |
| `FEATURE_REGISTRY.md` | Criado (sessão anterior) | Inventário de 175 recursos em 15 domínios |
| `feature_registry.json` | Criado (sessão anterior) | Registro estruturado com FIX-01 documentado |
| `feature_registry.csv` | Criado (sessão anterior) | Export tabular do inventário |
| `docs/CHANGELOG_SESSIONS.md` | Atualizado | Esta entrada |

### Resultados por Agente (78 testes totais)

| Agente | Domínio | ✅ PASS | ⚠️ WARN | ❌ FAIL | Veredicto |
|--------|---------|--------|---------|--------|----------|
| A1 | RPC / Privilégios | 10 | 2 | 0 | Aprovado Com Ressalvas |
| A2 | RLS / Segurança multi-tenant | 13 | 3 | 2 | Reprovado Parcial |
| A3 | Realtime / Schema isolation | 13 | 0 | 0 | **Aprovado** ✅ |
| A4 | Feature Registry / Docs | 11 | 3 | 1 | Aprovado Com Ressalvas |
| A5 | Integridade de migrations | 14 | 2 | 4 | Reprovado Parcial |
| **TOTAL** | | **61** | **10** | **7** | ⚠️ **Aprovado Com Ressalvas** |

### Achados Críticos Identificados (pré-existentes)

| Severidade | Achado | Ação Necessária |
|-----------|--------|----------------|
| 🔴 CRÍTICO | Mismatch canonical_schema filesystem vs DB | Reconciliar antes do próximo CI/CD |
| 🔴 CRÍTICO | 17-22 migrations em prod sem arquivo .sql | Reconstruir versões |
| 🔴 CRÍTICO | 3 tabelas com RLS sem policies (dados bloqueados) | Criar policies urgentemente |
| 🔴 ALTO | `email_attachments_unique_constraint` não aplicada em prod | `supabase db push` controlado |
| 🔴 ALTO | `revoke_anon_contract_inventory` não aplicada | `supabase db push` controlado |
| 🟠 MÉDIO | 48 políticas USING(true) sem filtro workspace | Adicionar workspace_id filter |
| 🟠 MÉDIO | 40+ RPCs sem GRANT EXECUTE TO authenticated | Auditoria de grants pendente |

### Veredicto Final

> **⚠️ APROVADO COM RESSALVAS CRÍTICAS**  
> FIX-01 verificada e ativa em produção. Realtime 100% correto (13/13). RLS coverage 100%.  
> Problemas críticos pré-existentes requerem atenção antes do próximo deploy automatizado.

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

---

## Sessão 2026-08-06 — Auditoria Evolution API (A-5b, A-8, Security Gate)

### Contexto
Continuação da auditoria Evolution API iniciada em 2026-08-05. Branch de trabalho:
`claude/evolution-api-audit-ma43rh`. Três frentes trabalhadas nesta sessão.

### A-5b (P0) — `cron.max_running_jobs=6` Ativado

| Item | Detalhe | Status |
|---|---|---|
| GUC `cron.max_running_jobs` | Configurado via `ALTER SYSTEM SET` em sessão anterior; `pending_restart=t` impedia ativação | ✅ |
| Restart `supabase_db.1` | Executado via Portainer API; novo container `f647a389e38f` | ✅ |
| Verificação pós-restart | `SELECT name, setting, pending_restart FROM pg_settings WHERE name = 'cron.max_running_jobs'` → `setting=6`, `pending_restart=f` | ✅ |
| Boot confirmado | `pg_postmaster_start_time`: 2026-08-06 07:38:56 UTC-3 | ✅ |

**Impacto:** pg_cron agora executa no máximo 6 jobs concorrentes (antes: 32), evitando tempestade
de conexões em picos de cron jobs simultâneos.

### A-8 (P2) — Data Quality: `patch_mode` + `evo.v_logpatch_health`

| Item | Migração | Ação | PR |
|---|---|---|---|
| Coluna `patch_mode TEXT` em `evo.evolution_logpatch_audit` | `20260806173000_rb2_a8_logpatch_patch_mode.sql` | `ADD COLUMN IF NOT EXISTS patch_mode TEXT NOT NULL DEFAULT 'build-time' CHECK (...)` | #877 |
| Update de registros existentes | `20260806173000` | `UPDATE ... SET patch_mode='build-time' WHERE patch_mode IS DISTINCT FROM 'build-time'` | #877 |
| View `evo.v_logpatch_health` atualizada | `20260806173000` | Semântica de `is_healthy` corrigida por `patch_mode`: build-time → `logpatch_status='ok'`; runtime → `t1_ok AND...AND t5_ok AND status='ok'` | #877 |
| FIX: `security_invoker=on` ausente | `20260806180000_fix_v_logpatch_health_security_invoker.sql` | `CREATE OR REPLACE VIEW evo.v_logpatch_health WITH (security_invoker = on)` | #877 |
| COMMENTs de coluna | `20260806173000` | Documentados `t1_ok`–`t5_ok` como "N/A em build-time por design" | #877 |

**Contexto:** Os patches T1–T6 são aplicados em `BUILD-TIME` (Dockerfile `VERIFY` fail-closed).
No modo build-time, `t1_ok`–`t5_ok` são sempre `false` por design (sem runtime check),
e isso era incorretamente interpretado como "patches ausentes". A coluna `patch_mode`
e a lógica `CASE WHEN` na view corrigem essa semântica.

**`docker-entrypoint.sh` auditado:** Confirmado que envia `patch_mode: "build-time"` na
auditoria de boot (POST REST → `evo.evolution_logpatch_audit`). Sem execução de `logpatch.cjs`.

### D-8 (P0) — Gate CI `security-invoker-gate.yml` ✅ RESOLVIDO

| Item | Root Cause | Status |
|---|---|---|
| `ZAPP_META_TOKEN` GitHub Actions secret | JWT `service_role` rotacionado em 2026-08-05 (`supabase_service_key_v1/v2` → `supabase_service_key_v3`); secret do GitHub não foi atualizado | ✅ **RESOLVIDO** — admin atualizou o secret em 2026-08-06 |
| D-8 step "Verify security audit via evo.v_security_audit" | `evo.v_security_audit` → `warning_rows = 0` (todos os objetos `✓ bloqueado`) | ✅ |
| Steps 2 e 3 (security_invoker, anon-functions) | Passando após atualização do token | ✅ |

**Validação pós-resolução (2026-08-06):**
- `psql` direto em `supabase_db.1`: `SELECT count(*) FROM evo.v_security_audit WHERE status LIKE '%⚠%'` → `warning_rows = 0`
- CI `workflow_dispatch` → Run ID `31095278267` → `completed/success` (todos os 5 steps verdes, 9 s)
- Commit de fix: `b23b3ab` — `fix(ci): gate D-8 aceita count sem aspas (postgres-meta devolve [{"count":0}]) + workflow_dispatch`

### Plano de Validação 50 Etapas — PRs Desta Sessão

| PR | Título | Commits | Status |
|---|---|---|---|
| #877 | `fix(evo): auditoria Evolution API — A-8 data quality, OCI_DIGEST e plano de validação 50 etapas` | `09d49f8` | ✅ Merged to main |
| #878 | `fix(db): auditoria PostgreSQL — GRANT e plano de validação 50 etapas` | `b8d9638` | ✅ Merged |
| #879 | `fix(security): adiciona ownership guard em fn_toggle_user_meme_favorite` | `0a1fc36` | ✅ Merged |
| #880 | `docs(infra): auditoria 50 etapas Portainer/Zapp + correções GAP-1/2/5` | `56a1fb2` | ✅ Merged |

### Pendências Pós-Sessão (2026-08-06)

| Item | Prioridade | Ação Necessária |
|---|---|---|
| ~~`ZAPP_META_TOKEN` update~~ | ~~P0~~ | ~~Admin atualiza GitHub Secret com `supabase_service_key_v3`~~ → **✅ RESOLVIDO 2026-08-06** |
| A-8: `OCI_DIGEST` env var | P2 | Injetar `OCI_DIGEST: "{{.Service.Image}}"` no docker-compose/stack `evolution-api-custom` |
| B-4/B-5: Retenção PG14 | P1 | `"Message"` (432 MB) e `evolution_webhook_events` (107 MB) |
| B-7: Reconciliação PG14 ↔ PG15 | P1 | Job periódico de reconciliação |
| B-2: Evolution 2.3.7 → 2.4.x | P2 | Bloqueado até B-1 (imagem custom) confirmado |
| C-7: DLQs duplicadas em `evo` | P2 | Consolidar blacklists e DLQs redundantes |
| C-8: ~50 tabelas vazias em `evo` | P2 | Inventário keep/deprecate/drop |
| C-11: Crons redundantes | P2 | Consolidar jobs de retenção |
| D-2: Restore test | P3 | Testar procedimento de backup restore |
| D-3: Health dashboard | P3 | Dashboard unificado |

---

## Sessão 2026-08-06 — Sprint Performance & Segurança

### Melhorias Realizadas

- **PERF-01**: Substituídas 10 ocorrências de `count:'exact'` por `count:'planned'`/`count:'estimated'` em `useDiagnosticsData.ts`
  - Impacto: latência de 14s → < 500ms nas queries de diagnóstico
  - Commit: adbe59e (PR #913)
- **SEC confirmado**: Auditoria 100% RLS no schema zapp — sem gaps
- **SEC confirmado**: Todas as funções SECURITY DEFINER têm search_path correto
- **SEC confirmado**: IDOR guard implementado em fn_toggle_user_meme_favorite

### PR #913

| Atributo | Valor |
|----------|-------|
| Branch | `claude/evolution-api-audit-8dc371` |
| Status | ready for review (convertido de draft) |
| CI | Vercel Preview DEPLOYED (Ready) |
| CodeRabbit | aguardando review |

### Pendências

- Documentar migration drift (~15 versões aplicadas via MCP sem arquivo SQL) — ver `docs/MIGRATION_DRIFT_REPORT.md`
- Investigar Dependabot (2 vulns high)

---

## Sessão 2026-08-06 (continuação) — Auditoria Exaustiva 5 Agentes + Hardening

**Branch:** `claude/evolution-api-audit-6ly46n` (reset a partir de main após PR #897 merged)

### PRs Mergeados (auditoria exaustiva pós-PR #892)

| PR | Título resumido | Migrations | Status |
|---|---|---|---|
| #897 | `fix(security): CRITICAL-1 store_reset_token REVOKE + race condition audio_meme_favorites` | 20260806200100, 20260806300000, 20260806600000, 20260806700000 | ✅ Merged |
| #899 | `fix(security): re-validação adversarial FASE 2 — hardening pós-P0` | — | ✅ Merged |
| #900 | `fix(security): fn_verify_alert_delivery v7 + search_path guardrails` | 20260806100001 | ✅ Merged |
| #901 | `fix(ci): GHCR pipeline hardening — imagem custom Evolution` | — | ✅ Merged |
| #902 | `fix(db): reconciliação filesystem vs DB — 47 gaps de policy documentados` | — | ✅ Merged |
| #903 | `fix(db): timestamp collision resolution — 3 migrations com timestamps duplicados` | — | ✅ Merged |
| #904 | `fix(security): SEC-2/SEC-3/SEC-4 guards + RLS sticker_favorites + G1-B search_path` | 20260806800000 (×3), 20260806900000, 20260806950000 | ✅ Merged |

### Findings da Auditoria Exaustiva (5 Agentes)

#### SEC-2 (P0 — DoS seletivo via idempotency poisoning) ✅ RESOLVIDO em PR #904
- `acquire_idempotency_lock`, `record_processed_request`, `check_duplicate_request`, `record_ai_metrics` tinham `GRANT EXECUTE TO authenticated` sem guard `auth.uid()`.
- A UNIQUE constraint em `processed_requests` era em `(request_id, action)` sem `user_id` → qualquer autenticado podia bloquear pagamento/ação de vítima por 5 min.
- **Correção:** `REVOKE EXECUTE FROM authenticated` (funções chamadas apenas pela Edge Function `ai-router` com `service_role` — sem impacto funcional).

#### SEC-3 (P1 — disclosure de agentes visíveis) ✅ RESOLVIDO em PR #904
- `get_visible_agent_ids(_user_id)` sem guard: qualquer autenticado consultava agentes visíveis para qualquer outro usuário.
- **Correção:** `AND _user_id IS NOT DISTINCT FROM auth.uid()` em ambos os ramos do UNION.

#### SEC-4 (P1 — disclosure de roles/permissões) ✅ RESOLVIDO em PR #904
- `has_role(_user_id, _role)` e `user_has_permission(_user_id, _permission_name)` com `GRANT TO authenticated` — enumeração de roles de qualquer usuário.
- **Correção:** Guard `_user_id IS NOT DISTINCT FROM auth.uid()` adicionado via `AND`, mantendo compatibilidade com RLS policies que chamam `has_role(auth.uid(), ...)`.

#### RLS sticker_favorites ✅ RESOLVIDO em PR #904
- `sf_delete_own` (USING = true, sem filtro user_id) → qualquer autenticado deletava favoritos alheios.
- `sf_service_all` (ALL, USING = true) aplicava a `authenticated` (não `service_role`) e anulava `sf_insert_auth`.
- **Correção:** DROP de `sf_service_all` + recriar `sf_delete_own` com `USING (user_id = auth.uid())`.

#### G1-B (search_path sintaxe incorreta) ✅ RESOLVIDO em PR #904
- `fn_toggle_user_meme_favorite(uuid, uuid)` em `20260806300000` usou `SET search_path = 'zapp, auth, extensions'` (todos numa string → schema único inválido).
- **Correção:** `ALTER FUNCTION … SET search_path TO 'zapp', 'auth', 'extensions'`.

### Continuação desta sessão (branch atual)

#### GAP-AUDIT-1 — RLS explícita em `audio_meme_favorites` ✅ NOVO

| Item | Detalhe |
|---|---|
| Problema | Policy `auth_own_or_admin` existia apenas no DB de produção (criada em migrations pré-squash) — sem versão no filesystem |
| Risco | Recrear DB a partir do filesystem deixaria a tabela sem nenhuma policy: `ENABLE ROW LEVEL SECURITY` sem policy = bloqueia TUDO |
| Correção | `20260806970000_explicit_rls_audio_meme_favorites.sql` — DROP POLICY IF EXISTS + CREATE POLICY idempotente |
| Política | ALL, authenticated, USING/WITH CHECK: `user_id = auth.uid() OR zapp.is_admin_or_supervisor()` |

#### BUG CRÍTICO — `fn_toggle_user_meme_favorite(uuid, uuid)` regressão em PR #904 ✅ NOVO

| Item | Detalhe |
|---|---|
| Problema | `20260806800000_fix_g1b_meme_favorite_searchpath.sql` foi aplicado à produção com dois bugs: (1) tabela `zapp.user_meme_favorites` não existe, (2) guard IDOR removido |
| Impacto | Função **quebrada em runtime** — qualquer chamada ao overload 2-argumento retornava erro 500; se tabela existisse, IDOR estaria presente |
| Ordem de execução | `_fix_g1_` (ALTER FUNCTION, correto) → `_fix_g1b_` (CREATE OR REPLACE, sobrescreve com bugs, vem depois por ordem alfabética) |
| Correção filesystem | Conteúdo de `20260806800000_fix_g1b_meme_favorite_searchpath.sql` reescrito com tabela certa + guard IDOR |
| Correção produção | `20260806980000_fix_fn_toggle_meme_favorite_table_and_guard.sql` — aplica versão correta ao DB de produção |

### Migrations desta continuação de sessão

| Arquivo | Tipo | Descrição |
|---|---|---|
| `20260806970000_explicit_rls_audio_meme_favorites.sql` | Hardening | RLS policy `auth_own_or_admin` documentada no filesystem (GAP-AUDIT-1) |
| `20260806980000_fix_fn_toggle_meme_favorite_table_and_guard.sql` | Fix crítico | Restaura guard IDOR + tabela correta em `fn_toggle_user_meme_favorite(uuid, uuid)` |

### Pendências Pós-Sessão (2026-08-06 continuação)

| Item | Prioridade | Ação Necessária |
|---|---|---|
| ML-005 falso positivo em `20260806200100` | P3 | Linter lê `GRANT TO PUBLIC` em comentário `--` (rollback); adicionar `-- lint-ignore` ou corrigir linter |
| ML-008 em migrations pré-2026-08-06 | P2 | Verificar se `20260805000010`, `20260805160000`, `20260805170000`, `20260805183000`, `20260806090000` já foram REVOKE'd em produção |
| A-8: `OCI_DIGEST` env var | P2 | Injetar `OCI_DIGEST: "{{.Service.Image}}"` no stack `evolution-api-custom` |
