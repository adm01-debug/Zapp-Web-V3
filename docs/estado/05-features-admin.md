# Estado: `src/features/admin/` — Módulo Administrativo

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 89/89

---

## 1. Visão Geral do Módulo

Módulo central de administração e supervisão do ZAPP-WEB. Engloba painel de controle com 11 abas (AdminView), monitoramento de mensagens falhas (DLQ), métricas de retry Evolution API, logs de rate limit, gamificação de agentes, copiloto do supervisor, diagnósticos de instância, controle de pausas, dashboard STS/telemetria, configuração de inbox e grants de visibilidade.

**Contagem:** 89 arquivos — 41 componentes/barrels, 32 hooks, 6 testes, 4 tipos/utilitários, 3 serviços, 2 data-access, 1 lib, 1 barrel raiz.

### Tabela de Arquivos por Categoria

| Categoria | Arquivo | Linhas |
|-----------|---------|--------|
| **Barrel raiz** | `index.ts` | 5 |
| **Componente principal** | `components/AdminView.tsx` | 338 |
| **Componente** | `components/AIUsageDashboard.tsx` | 246 |
| **Componente** | `components/AIUsageLogsTab.tsx` | 82 |
| **Componente** | `components/AIUsageUsersTab.tsx` | 117 |
| **Componente** | `components/AdminAuditTable.tsx` | 51 |
| **Componente** | `components/AdminCRMDashboard.tsx` | 226 |
| **Componente** | `components/AdminUsersTable.tsx` | 116 |
| **Componente** | `components/AgentVersionsPanel.tsx` | 267 |
| **Componente** | `components/BulkReprocessGuidedDialog.tsx` | 388 |
| **Componente** | `components/CrisisRoom.tsx` | 153 |
| **Componente** | `components/EvolutionFallbackStatusCard.tsx` | 178 |
| **Componente** | `components/FailedMessageKpiCard.tsx` | 34 |
| **Componente** | `components/FailedMessageStatusBadge.tsx` | 32 |
| **Componente** | `components/FailedMessageTableRow.tsx` | 192 |
| **Componente** | `components/ForceLogoutButton.tsx` | 43 |
| **Componente** | `components/GmailWebhookMonitor.tsx` | 245 |
| **Componente** | `components/InboxScopeConfig.tsx` | 368 |
| **Componente** | `components/InboxScopeConfigParts.tsx` | 103 |
| **Componente** | `components/MediaMigrationTool.tsx` | 181 |
| **Componente** | `components/PlaybooksManager.tsx` | 366 |
| **Componente** | `components/PublicApiDashboard.tsx` | 221 |
| **Componente** | `components/QrAttemptsPanel.tsx` | 348 |
| **Componente** | `components/RateLimitAlertsPanel.tsx` | 330 |
| **Componente** | `components/RateLimitLogDetails.tsx` | 275 |
| **Componente** | `components/RetryConfigBackoffTable.tsx` | 126 |
| **Componente** | `components/RetryConfigPanel.tsx` | 304 |
| **Componente** | `components/SicoobBridgeDashboard.tsx` | 479 |
| **Componente** | `components/SupervisorCopilot.tsx` | 182 |
| **Componente** | `components/SupervisorQueueBoard.tsx` | 201 |
| **Componente** | `components/TrainingMode.tsx` | 372 |
| **Componente** | `components/VisibilityGrantsManager.tsx` | 302 |
| **Componente alerts** | `components/alerts/AlertInstanceDetailDialog.tsx` | 320 |
| **Componente alerts** | `components/alerts/AlertInstanceSLACard.tsx` | 84 |
| **Barrel alerts** | `components/alerts/index.ts` | 2 |
| **Barrel components** | `components/index.ts` | 29 |
| **Componente pauses** | `components/instance-pauses/AuthEventTrendChart.tsx` | 321 |
| **Componente pauses** | `components/instance-pauses/IncidentDetailDialog.tsx` | 316 |
| **Barrel pauses** | `components/instance-pauses/index.ts` | 3 |
| **Componente telemetry** | `components/telemetry/StsCommercialDashboard.tsx` | 214 |
| **Componente telemetry** | `components/telemetry/TelemetryCharts.tsx` | 187 |
| **Barrel telemetry** | `components/telemetry/index.ts` | 3 |
| **Data-access** | `data-access/agentRepository.ts` | 57 |
| **Barrel data-access** | `data-access/index.ts` | 2 |
| **Lib** | `lib/supervisorPriority.ts` | 105 |
| **Hook** | `hooks/useAdminManagement.ts` | 1402 |
| **Hook** | `hooks/useAdminData.ts` | 346 |
| **Hook** | `hooks/useAIStats.ts` | 193 |
| **Hook** | `hooks/useAIUsageDashboard.ts` | 240 |
| **Hook** | `hooks/useAgentGamification.ts` | 97 |
| **Hook** | `hooks/useAgentReassignment.ts` | 62 |
| **Hook** | `hooks/useAgents.ts` | 163 |
| **Hook** | `hooks/useCrisisRoomData.ts` | 20 |
| **Hook** | `hooks/useDiagnosticsData.ts` | 353 |
| **Hook** | `hooks/useForceLogoutMutation.ts` | 8 |
| **Hook** | `hooks/useInboxCustomScopesData.ts` | 23 |
| **Hook** | `hooks/usePlaybooksData.ts` | 29 |
| **Hook** | `hooks/useRateLimitAlertNotifier.ts` | 123 |
| **Hook** | `hooks/useRateLimitAlerts.ts` | 137 |
| **Hook** | `hooks/useRateLimitLogs.ts` | 239 |
| **Hook** | `hooks/useSupervisorConversations.ts` | 179 |
| **Hook** | `hooks/useSupervisorQueuesData.ts` | 6 |
| **Hook** | `hooks/useVersions.ts` | 76 |
| **Hook** | `hooks/useVisibleAgents.ts` | 25 |
| **Barrel hooks** | `hooks/index.ts` | 12 |
| **Hook gamification** | `hooks/gamification/levelUtils.ts` | 17 |
| **Hook gamification** | `hooks/gamification/mutations.ts` | 174 |
| **Tipos gamification** | `hooks/gamification/types.ts` | 42 |
| **Barrel gamification** | `hooks/gamification/index.ts` | 4 |
| **Tipos monitoring** | `hooks/monitoring/failedMessagesTypes.ts` | 81 |
| **Util monitoring** | `hooks/monitoring/failedMessagesAggregates.ts` | 57 |
| **Hook monitoring** | `hooks/monitoring/useDispatchErrorLogs.ts` | 122 |
| **Hook monitoring** | `hooks/monitoring/useDlqAuditLog.ts` | 73 |
| **Hook monitoring** | `hooks/monitoring/useFailedMessages.ts` | 368 |
| **Hook monitoring** | `hooks/monitoring/useFailedMessagesUI.ts` | 86 |
| **Hook monitoring** | `hooks/monitoring/useIdempotencyMissAlerts.ts` | 252 |
| **Hook monitoring** | `hooks/monitoring/useRetryMetrics.ts` | 146 |
| **Hook monitoring** | `hooks/monitoring/useTransfersPaginated.ts` | 92 |
| **Barrel monitoring** | `hooks/monitoring/index.ts` | 35 |
| **Serviço** | `services/agentService.ts` | 85 |
| **Barrel services** | `services/index.ts` | 2 |
| **Utils** | `utils/profileMappers.ts` | 107 |
| **Teste** | `hooks/__tests__/calculateTrend.test.ts` | 139 |
| **Teste** | `hooks/gamification/__tests__/levelUtils.test.ts` | 101 |
| **Teste** | `hooks/gamification/__tests__/types.test.ts` | 114 |
| **Teste** | `hooks/monitoring/__tests__/useFailedMessagesUI.test.ts` | 411 |
| **Teste** | `hooks/monitoring/__tests__/useIdempotencyMissAlerts.helpers.test.ts` | 252 |
| **Teste** | `services/__tests__/agentService.test.ts` | 165 |
| **Teste** | `utils/__tests__/profileMappers.test.ts` | 224 |

---

## 2. Fluxos Funcionais do Módulo

### 2.1 Entrada no Painel Admin

```
AdminView.tsx
  → guard: isSupervisor (useAuth)            ← bloqueia roles < supervisor
  → renderiza 11 abas via Tab/TabsContent
  → cada aba é envolta em <SectionErrorBoundary>  ← tabs opcionais não quebram o painel
  → aba "Monitoramento": useAdminManagement
  → aba "Diagnostics":   useDiagnosticsData
  → aba "Rate Limit":    useRateLimitLogs + useRateLimitAlerts
  → aba "Gamificação":   useAgentGamification
  → aba "Supervisor":    useSupervisorConversations
  → aba "Versões":       useVersions
  → aba "DLQ":           useFailedMessages (via BulkReprocessGuidedDialog)
  → aba "Armazenamento": MediaMigrationTool (Edge Function migrate-media-storage)
  → aba "Treinamento":   TrainingMode
  → aba "STS/Telemetria":TelemetryCharts + StsCommercialDashboard
  → aba "Sicoob":        SicoobBridgeDashboard
```

**Arquivos:** `components/AdminView.tsx`, `hooks/useAdminManagement.ts`, `hooks/useDiagnosticsData.ts`

### 2.2 Dead-Letter Queue (DLQ) — Mensagens Falhas

```
useFailedMessages.ts
  → _rpc escape hatch (ignore-audit, linha 37)
       → rpc_list_failed_messages_cursor (cursor-based pagination)
       → rpc_dlq_stats
  → Realtime: schema='zapp', table='failed_messages' (tabela física)
  → retorna: rows, cursors, aggregates (via computeFailedMessagesAggregates)
  ↓
useFailedMessagesUI.ts    ← wrapper de estado UI (filtros, seleção, sort)
  → sortedRows: [...api.rows].sort(...)   ← cópia defensiva do array
  ↓
BulkReprocessGuidedDialog.tsx
  → passo 1: seleção de mensagens
  → passo 2: confirmação
  → passo 3: Edge Function 'reprocess-failed-messages' (fetch raw)
  ↓
Ações individuais DLQ (via useAdminManagement):
  → rpc_dlq_retry_now / rpc_dlq_abandon
  → rpc_dlq_bulk_retry_now / rpc_dlq_bulk_abandon
  → rpc_dlq_log_item_action / rpc_dlq_log_reprocess_trigger / rpc_dlq_log_reprocess_result
```

**Arquivos:** `hooks/monitoring/useFailedMessages.ts`, `hooks/monitoring/useFailedMessagesUI.ts`, `hooks/monitoring/failedMessagesAggregates.ts`, `hooks/monitoring/failedMessagesTypes.ts`, `components/BulkReprocessGuidedDialog.tsx`

### 2.3 Retry Metrics (Evolution API)

```
useRetryMetrics.ts
  → GET Edge Function 'evolution-retry-metrics' (com query params: instance, from, to, limit)
  → Realtime: schema='evo', table='evolution_retry_metrics'  ← tabela física (não VIEW)
  → agregação client-side: p95 de tentativas por instância
```

**Arquivo:** `hooks/monitoring/useRetryMetrics.ts`

### 2.4 Logs de Rate Limit

```
useRateLimitLogs.ts
  → supabase.from('rate_limit_logs')
      .ilike('ip_address', sanitizePostgrestFilter(ip))   ← proteção anti-injeção
      .ilike('endpoint', sanitizePostgrestFilter(ep))
      .order(sortBy).range(from, to)
  → Realtime: schema='zapp', table='rate_limit_logs' (INSERT)
       → Math.random() no nome do canal (padrão recorrente)
  ↓
useRateLimitAlerts.ts
  → classifica logs em alertas por IP e por endpoint (severity: low/medium/high/critical)
  → thresholds lidos de localStorage key 'zapp:admin:rate-limit-thresholds:v1'
  ↓
useRateLimitAlertNotifier.ts
  → toast notifications + Browser Notification API (opcional, com permissão)
  → sessionStorage dedup: 'zapp:admin:rate-limit-seen:v1'
  → cap de 5 toasts por ciclo
```

**Arquivos:** `hooks/useRateLimitLogs.ts`, `hooks/useRateLimitAlerts.ts`, `hooks/useRateLimitAlertNotifier.ts`

### 2.5 Gamificação de Agentes

```
useAgentGamification.ts
  → cast manual explícito 'db' (linhas 20-32) para bypass de tipos gerados
  → supabase.from('profiles') + supabase.from('agent_stats') + supabase.from('agent_achievements')
  ↓
hooks/gamification/mutations.ts
  → useGamificationMutations(profileId, currentStats)
  → addXp: lê agent_stats → calcula novo XP+level client-side → escreve (race condition!)
  → grantAchievement: insert em agent_achievements
  → updateStreak, incrementMessages, incrementResolutions
  ↓
hooks/gamification/levelUtils.ts (funções puras)
  → calculateLevel(xp) = Math.max(1, floor(sqrt(xp/50)) + 1)
  → xpForNextLevel(level) = level² × 50
  → levelProgress(xp, level) → 0-100 clampado
```

**Arquivos:** `hooks/useAgentGamification.ts`, `hooks/gamification/mutations.ts`, `hooks/gamification/levelUtils.ts`, `hooks/gamification/types.ts`

### 2.6 Copiloto do Supervisor

```
useSupervisorConversations.ts
  → Promise.all([contacts, profiles, queues])
      → contacts: supabase.from('contacts').select(...).limit(200)
      → profiles: cast inline (is_active, role filtros não tipados)
      → queues: supabase.from('queues').limit(100)
  → isValidUUID(contactId) antes de qualquer update
  → computePriority(c, now)  ← lib/supervisorPriority.ts
  → sortByPriority(enriched)
  ↓
SupervisorCopilot.tsx / SupervisorQueueBoard.tsx
  → exibe rows com prioridade P1-P4
  → reassignAgent / moveQueue  ← mutations em contacts
```

**Arquivos:** `hooks/useSupervisorConversations.ts`, `lib/supervisorPriority.ts`, `components/SupervisorCopilot.tsx`, `components/SupervisorQueueBoard.tsx`

### 2.7 Diagnósticos de Sistema

```
useDiagnosticsData.ts
  → supabase.from('instance_registry').select(...) count: 'estimated'
  → supabase.from('webhook_audit_log').select(...) count: 'estimated'
  → supabase.from('evolution_messages').select(...) count: 'estimated'
  → supabase.from('evolution_conversations').select(...) count: 'estimated'
  → Edge Function 'connection-health-check' (fetch raw)
  → Edge Function 'webhook-hmac-selftest' (autotest HMAC)
```

**Arquivo:** `hooks/useDiagnosticsData.ts`

### 2.8 Controle de Agentes

```
agentRepository.ts
  → fetchProfiles(): supabase.from('profiles').select('*')
  → fetchQueuesAndMembers(): cast controlado → queues + queue_members (is_active não tipado)
  → fetchActiveChatsCounts(): dbFrom('contacts').select('assigned_to')
  ↓
agentService.ts
  → getAgentsWithStats(): Promise.all([profiles, queues+members, activeChatsCounts])
  → getAgentStatus(lastActivity): < 5min → online, 5-29min → away, ≥30min → offline
  ↓
useAgents.ts
  → useQuery via agentService.getAgentsWithStats()
  → Realtime: agent_presence (INSERT/UPDATE/DELETE)
  → fallback polling 120s quando Realtime está em estado 'error' ou 'closed'
  ↓
useAgentReassignment.ts
  → rpc reassign_absent_agents, reassign_overloaded_agents
  → cast data as unknown as number (RPC retorna bigint, JS espera number)
```

**Arquivos:** `data-access/agentRepository.ts`, `services/agentService.ts`, `hooks/useAgents.ts`, `hooks/useAgentReassignment.ts`

### 2.9 Logs de Erros de Dispatch / Transferências

```
useDispatchErrorLogs.ts
  → rpc_list_dispatch_error_logs_cursor (cursor-based pagination)
  → Realtime: schema='zapp', table='dispatch_error_logs'
  → reset automático de cursor map ao mudar filtros

useTransfersPaginated.ts
  → safeClient.rpc('rpc_list_transfers_paginated')
  → isRlsDeniedError → retorna deniedReason em PT-BR sem lançar exceção
```

**Arquivos:** `hooks/monitoring/useDispatchErrorLogs.ts`, `hooks/monitoring/useTransfersPaginated.ts`

### 2.10 Alertas de Idempotência

```
useIdempotencyMissAlerts.ts
  → poll a cada 60s: supabase.from('evolution_audit_log').select(*)
       .eq('action', 'idempotency_miss').gte('created_at', lastHour).limit(1000)
  → threshold DEFAULT_MISS_THRESHOLD = 50
  → quando excede: insert em warroom_alerts
  → localStorage dedup TTL 6h: 'zapp:idempotency-miss-alerts:v1'
  → exporta __test__ object com helpers puros (hourBucket, buildPersistKey, etc.)
```

**Arquivo:** `hooks/monitoring/useIdempotencyMissAlerts.ts`

### 2.11 Estatísticas de IA

```
useAIStats.ts
  → dbFrom('messages').select(...) — abstração datasource (não supabase direto)
  → count: 'planned' (não 'exact' nem 'estimated')
  → Edge Function 'ai-proxy' (Gemini 3 Flash)
  → exporta calculateTrend (testado em __tests__/calculateTrend.test.ts)
  ↓
useAIUsageDashboard.ts
  → supabase.from('ai_usage_logs') ou equivalente
  → CSV export com BOM (UTF-8 para Excel)
  → exporta TimeFilter, FUNCTION_COLORS, FUNCTION_LABELS
```

**Arquivos:** `hooks/useAIStats.ts`, `hooks/useAIUsageDashboard.ts`

### 2.12 Normalização de Profiles

```
utils/profileMappers.ts
  → normalizeProfileRef(raw): null | object | array → AdminProfileRef | undefined
       → pickFirst(): array→[0], null→null
       → default name: 'Sem nome' para null/vazio/whitespace
  → normalizeAgentProfile(raw): unknown → AdminAgentProfile | null
       → default is_active: true, max_chats: 5
  → normalizeAgentProfiles(rows): unknown → AdminAgentProfile[]
       → filtra linhas sem id
```

**Arquivo:** `utils/profileMappers.ts`

---

## 3. Tabelas e RPCs

### 3.1 Tabelas via `.from()`

| Tabela | Schema | Operação | Hook/Componente |
|--------|--------|----------|-----------------|
| `profiles` | `zapp` | SELECT, UPDATE | `agentRepository`, `useAdminData`, `useAgentGamification`, `useSupervisorConversations`, `useCrisisRoomData` |
| `agent_stats` | `zapp` | SELECT, UPSERT | `useAgentGamification`, `gamification/mutations` |
| `agent_achievements` | `zapp` | SELECT, INSERT | `useAgentGamification`, `gamification/mutations` |
| `contacts` | `zapp` | SELECT, UPDATE | `useSupervisorConversations`, `agentRepository` (via dbFrom), `useCrisisRoomData` |
| `queues` | `zapp` | SELECT | `agentRepository`, `useSupervisorConversations`, `useSupervisorQueuesData` |
| `queue_members` | `zapp` | SELECT | `agentRepository` (cast controlado — `is_active` fora dos tipos) |
| `failed_messages` | `zapp` | Realtime INSERT/UPDATE | `useFailedMessages` (subscription) |
| `rate_limit_logs` | `zapp` | SELECT, Realtime INSERT | `useRateLimitLogs` |
| `playbooks` | `zapp` | SELECT, INSERT, UPDATE, DELETE | `usePlaybooksData` |
| `inbox_custom_scopes` | `zapp` | SELECT, INSERT, DELETE | `useInboxCustomScopesData` |
| `conversation_sla` | `zapp` | SELECT (count breached) | `useCrisisRoomData` |
| `entity_versions` | `zapp` | SELECT, UPDATE (restore) | `useVersions` (via safeClient) |
| `agent_presence` | `zapp` | Realtime INSERT/UPDATE/DELETE | `useAgents` |
| `warroom_alerts` | `zapp` | INSERT | `useIdempotencyMissAlerts` |
| `evolution_audit_log` | `zapp` | SELECT (poll 60s) | `useIdempotencyMissAlerts` |
| `evolution_retry_metrics` | `evo` | Realtime INSERT (tabela física) | `useRetryMetrics` |
| `dispatch_error_logs` | `zapp` | Realtime (via RPC) | `useDispatchErrorLogs` |
| `messages` | `zapp` | SELECT | `useAIStats` (via dbFrom) |
| `instance_registry` | `zapp` | SELECT count='estimated' | `useDiagnosticsData` |
| `webhook_audit_log` | `zapp` | SELECT count='estimated' | `useDiagnosticsData` |
| `evolution_messages` | `zapp` | SELECT count='estimated' | `useDiagnosticsData` |
| `evolution_conversations` | `zapp` | SELECT count='estimated' | `useDiagnosticsData` |
| `sicoob_transacoes` | `zapp` | SELECT | `SicoobBridgeDashboard` (DASHBOARD-13, dados hardcoded) |

### 3.2 RPCs via `.rpc()`

| RPC | Via | Hook |
|-----|-----|------|
| `rpc_list_failed_messages_cursor` | `_rpc` escape hatch (ignore-audit) | `useFailedMessages` |
| `rpc_dlq_retry_now` | `_rpc` escape hatch | `useFailedMessages` |
| `rpc_dlq_abandon` | `_rpc` escape hatch | `useFailedMessages` |
| `rpc_dlq_bulk_retry_now` | `_rpc` escape hatch | `useFailedMessages` |
| `rpc_dlq_bulk_abandon` | `_rpc` escape hatch | `useFailedMessages` |
| `rpc_dlq_log_item_action` | `_rpc` escape hatch | `useFailedMessages` |
| `rpc_dlq_log_reprocess_trigger` | `_rpc` escape hatch | `useFailedMessages` |
| `rpc_dlq_log_reprocess_result` | `_rpc` escape hatch | `useFailedMessages` |
| `rpc_dlq_stats` | `_rpc` escape hatch | `useFailedMessages` |
| `rpc_dlq_list_audit` | supabase.rpc | `useDlqAuditLog` |
| `rpc_list_dispatch_error_logs_cursor` | supabase.rpc | `useDispatchErrorLogs` |
| `rpc_list_transfers_paginated` | `safeClient.rpc` | `useTransfersPaginated` |
| `reassign_absent_agents` | supabase.rpc | `useAgentReassignment` |
| `reassign_overloaded_agents` | supabase.rpc | `useAgentReassignment` |
| `get_visible_agent_ids` | supabase.rpc | `useVisibleAgents` |

### 3.3 Outras APIs

| API Externa | Chamador | Método |
|-------------|----------|--------|
| Edge Function `ai-proxy` | `useAIStats` | Gemini 3 Flash, POST |
| Edge Function `webhook-hmac-selftest` | `useDiagnosticsData` | autotest HMAC |
| Edge Function `create-user` | `useAdminData` | fetch raw (não supabase.functions) |
| Edge Function `reprocess-failed-messages` | `BulkReprocessGuidedDialog` | fetch raw |
| Edge Function `connection-health-check` | `useDiagnosticsData` | fetch raw |
| Edge Function `instance-pause-control` | `MediaMigrationTool` / painel de pausas | NAO_VERIFICADO |
| Edge Function `migrate-media-storage` | `MediaMigrationTool` | NAO_VERIFICADO método |
| Edge Function `evolution-retry-metrics` | `useRetryMetrics` | GET com query params |
| Browser Notification API | `useRateLimitAlertNotifier` | Web API nativa, permissão opcional |
| Sicoob API | `SicoobBridgeDashboard` | fetch (linhas 28-33, dados DASHBOARD-13) |

---

## 4. Exports Públicos

### 4.1 Componentes

Exportados via `components/index.ts` → re-exportado em `index.ts`:

- `AdminView`
- `AIUsageDashboard`, `AIUsageLogsTab`, `AIUsageUsersTab`
- `AdminAuditTable`, `AdminCRMDashboard`, `AdminUsersTable`
- `AgentVersionsPanel`
- `BulkReprocessGuidedDialog`
- `CrisisRoom`
- `EvolutionFallbackStatusCard`
- `FailedMessageKpiCard`, `FailedMessageStatusBadge`, `FailedMessageTableRow`
- `ForceLogoutButton`
- `GmailWebhookMonitor`
- `InboxScopeConfig`, `InboxScopeConfigParts`
- `MediaMigrationTool`
- `PlaybooksManager`
- `PublicApiDashboard`
- `QrAttemptsPanel`
- `RateLimitAlertsPanel`, `RateLimitLogDetails`
- `RetryConfigBackoffTable`, `RetryConfigPanel`
- `SicoobBridgeDashboard`
- `SupervisorCopilot`, `SupervisorQueueBoard`
- `TrainingMode`
- `VisibilityGrantsManager`
- Sub-barrels: `AlertInstanceDetailDialog`, `AlertInstanceSLACard` (alerts), `AuthEventTrendChart`, `IncidentDetailDialog` (instance-pauses), `TelemetryCharts`, `StsCommercialDashboard` (telemetry)

### 4.2 Hooks

Exportados via `hooks/index.ts`:

- `useAdminManagement` (hook orquestrador principal)
- `useAdminData`
- `useAIStats`, `useAIUsageDashboard`
- `useAgentGamification`, `useAgentReassignment`, `useAgents`
- `useCrisisRoomData`, `useDiagnosticsData`
- `useForceLogoutMutation`
- `useIdempotencyMissAlerts` (via sub-barrel monitoring)
- `useInboxCustomScopesData`
- `usePlaybooksData`
- `useRateLimitAlertNotifier`, `useRateLimitAlerts`, `useRateLimitLogs`
- `useSupervisorConversations`, `useSupervisorQueuesData`
- `useVersions`, `useVisibleAgents`
- `useFailedMessages`, `useFailedMessagesUI` (monitoring)
- `useDispatchErrorLogs`, `useDlqAuditLog` (monitoring)
- `useRetryMetrics`, `useTransfersPaginated` (monitoring)

### 4.3 Serviços

- `agentService` — `getAgentStatus(lastActivity)`, `getAgentsWithStats()`
- `AgentWithStats` (interface)

### 4.4 Data-access

- `agentRepository` — `fetchProfiles()`, `fetchQueuesAndMembers()`, `fetchActiveChatsCounts()`
- `AgentProfile` (interface)

### 4.5 Tipos Relevantes

| Tipo | Origem |
|------|--------|
| `FailedMessageStatus` | `monitoring/failedMessagesTypes.ts` |
| `FailedMessageRow` | `monitoring/failedMessagesTypes.ts` |
| `FailedMessagesFilters` | `monitoring/failedMessagesTypes.ts` |
| `ErrorCodeAggregate`, `InstanceAggregate`, `RootCauseAggregate` | `monitoring/failedMessagesTypes.ts` |
| `FailedMessagesAggregates`, `DlqStats` | `monitoring/failedMessagesTypes.ts` |
| `DlqAuditAction`, `DlqAuditEntry` | `monitoring/useDlqAuditLog.ts` |
| `RetryMetricRow`, `RetryAggregates`, `RetryMetricsResponse`, `RetryMetricsFilters` | `monitoring/useRetryMetrics.ts` |
| `DispatchErrorLogRow`, `DispatchErrorLogFilters` | `monitoring/useDispatchErrorLogs.ts` |
| `TransferRow`, `TransfersFilters` | `monitoring/useTransfersPaginated.ts` |
| `AgentStats`, `Achievement`, `ACHIEVEMENT_TYPES` | `hooks/gamification/types.ts` |
| `PriorityLevel`, `PriorityInfo`, `SupervisorConversationInput` | `lib/supervisorPriority.ts` |
| `AdminProfileRef`, `AdminAgentProfile` | `utils/profileMappers.ts` |
| `AlertSeverity`, `AlertScope`, `RateLimitAlert`, `RateLimitAlertThresholds` | `hooks/useRateLimitAlerts.ts` |
| `RateLimitLog`, `RateLimitLogsFilters`, `RateLimitSortKey`, `RateLimitSortDir` | `hooks/useRateLimitLogs.ts` |
| `TimeFilter`, `FUNCTION_COLORS`, `FUNCTION_LABELS` | `hooks/useAIUsageDashboard.ts` |
| `NotifyPreferences` | `hooks/useRateLimitAlertNotifier.ts` |
| `Version` | `hooks/useVersions.ts` |
| `SupervisorConversationRow`, `AgentOption`, `QueueOption` | `hooks/useSupervisorConversations.ts` |

### 4.6 Funções Utilitárias

| Função | Origem | Testada |
|--------|--------|---------|
| `calculateLevel(xp)` | `hooks/gamification/levelUtils.ts` | Sim |
| `xpForNextLevel(level)` | `hooks/gamification/levelUtils.ts` | Sim |
| `levelProgress(xp, level)` | `hooks/gamification/levelUtils.ts` | Sim |
| `calculateTrend(...)` | `hooks/useAIStats.ts` | Sim |
| `computePriority(c, now)` | `lib/supervisorPriority.ts` | Não (não há teste dedicado) |
| `sortByPriority(rows)` | `lib/supervisorPriority.ts` | Não |
| `normalizeProfileRef(raw)` | `utils/profileMappers.ts` | Sim |
| `normalizeAgentProfile(raw)` | `utils/profileMappers.ts` | Sim |
| `normalizeAgentProfiles(rows)` | `utils/profileMappers.ts` | Sim |
| `computeFailedMessagesAggregates(rows)` | `hooks/monitoring/failedMessagesAggregates.ts` | Não |
| `loadThresholds()`, `saveThresholds(next)` | `hooks/useRateLimitAlerts.ts` | Não |
| `loadNotifyPrefs()`, `saveNotifyPrefs()` | `hooks/useRateLimitAlertNotifier.ts` | Não |
| `requestBrowserNotificationPermission()` | `hooks/useRateLimitAlertNotifier.ts` | Não |

---

## 5. Chama (Saída) — Dependências Externas

| Recurso | Origem |
|---------|--------|
| `@/integrations/supabase/client` (`supabase`) | quase todos os hooks |
| `@/integrations/datasource/db` (`dbFrom`) | `hooks/useAIStats.ts`, `data-access/agentRepository.ts` |
| `@/integrations/supabase/rowNormalizers` | referenciado externamente |
| `@/services/api/queryKeys` (`queryKeys.adminOps.*`) | `useRateLimitLogs`, demais hooks React Query |
| `@/lib/sanitize` (`sanitizePostgrestFilter`) | `hooks/useRateLimitLogs.ts` |
| `@/lib/logger` (`getLogger`, `logger`) | `agentService.ts`, `useSupervisorConversations.ts` |
| `@/lib/errors/rlsError` (`isRlsDeniedError`, `formatAdminError`) | `hooks/monitoring/useTransfersPaginated.ts` |
| `@/utils/uuid` (`isValidUUID`) | `hooks/useSupervisorConversations.ts` |
| `@tanstack/react-query` (`useQuery`, `useMutation`, `useQueryClient`) | hooks com React Query |
| `sonner` (`toast`) | hooks com notificações |
| `@/integrations/supabase/schema` | tipos canônicos |

---

## 6. Chamado Por (Entrada) — Quem Importa Deste Módulo

Resultado do grep `from.*features/admin` nos arquivos da aplicação:

| Arquivo importador | O que importa |
|--------------------|---------------|
| `src/components/agents/AgentsView.tsx` | `useAgents`, `AgentWithStats` |
| `src/components/connections/IdempotencyMissBanner.tsx` | `useIdempotencyMissAlerts` |
| `src/components/dashboard/AIStatsWidget.tsx` | `useAIStats`, `PeriodOption`, `TrendData` |
| `src/components/dashboard/DashboardFilters.tsx` | `TimeFilter` |
| `src/components/diagnostics/DiagnosticsView.tsx` | `useDiagnosticsData`, `SystemHealth` |
| `src/components/gamification/AchievementBadge.tsx` | `Achievement` |
| `src/components/gamification/AchievementsPanel.tsx` | `ACHIEVEMENT_TYPES` |
| `src/components/gamification/AchievementsStats.tsx` | (gamification types) |
| `src/components/gamification/GamificationProvider.tsx` | `useAgentGamification`, `ACHIEVEMENT_TYPES`, `calculateLevel` |
| `src/components/monitoring/DLQAuditHistory.tsx` | `useDlqAuditLog`, `DlqAuditEntry` |
| `src/components/monitoring/DLQPanel.tsx` | `useFailedMessages`, `FailedMessageRow`, `FailedMessageStatus` |
| `src/components/monitoring/RetryMetricsPanel.tsx` | `useRetryMetrics`, `RetryMetricsFilters` |
| `src/components/monitoring/useRetryMetricsPanelState.ts` | tipos de monitoring |
| `src/components/reports/useReportsData.ts` | hooks de relatórios |
| `src/components/schedule/ScheduleCalendarView.tsx` | (schedule data) |
| `src/features/inbox/components/AgentReassignmentPanel.tsx` | `useAgentReassignment` |
| `src/features/inbox/components/InboxFilters.tsx` | tipos admin |
| `src/features/inbox/components/TicketTabsFilters.tsx` | tipos admin |
| `src/features/inbox/components/TransferDialog.tsx` | (transfer data) |
| `src/features/inbox/components/agents-ops/AgentOpsTable.tsx` | `AgentWithStats` |
| `src/features/inbox/components/contact-details/AssignmentSection.tsx` | `useAgents` |
| `src/hooks/__tests__/useAgents.test.tsx` | `useAgents` (via path direto) |
| `src/hooks/admin/useAdminAutomations.ts` | hooks admin |
| `src/hooks/admin/useAdminChannels.ts` | hooks admin |
| `src/hooks/admin/useAdminQueues.ts` | hooks admin |
| `src/hooks/admin/useDepartmentsAdmin.ts` | hooks admin |
| `src/hooks/admin/useHmacSelfTest.ts` | hooks admin |
| `src/hooks/admin/useRolesPageState.ts` | hooks admin |
| `src/hooks/admin/useRoutePermissions.ts` | hooks admin |
| `src/hooks/useVersions.ts` | re-exporta `useVersions` |
| `src/integrations/supabase/rowNormalizers.ts` | normalizeProfileRef (deduzido) |
| `src/pages/AdminAlertHistoryPage.tsx` | hooks de alertas |
| `src/pages/AdminDispatchErrorsHistoryPage.tsx` | `useDispatchErrorLogs` |
| `src/pages/AdminFailedMessagesPage.tsx` | `useFailedMessages`, `FailedMessageRow`, `FailedMessageStatus` |
| `src/pages/AdminInstancePausesPage.tsx` | componentes instance-pauses |
| `src/pages/AdminRealtimeMonitorPage.tsx` | hooks monitoring |
| `src/pages/AdminTelemetriaPage.tsx` | `TelemetryCharts` |
| `src/pages/admin-realtime-monitor/DispatchErrorsBlock.tsx` | `useDispatchErrorLogs` |
| `src/pages/admin-realtime-monitor/aggregations.ts` | tipos monitoring |
| `src/pages/admin/AdminChannelsPage.tsx` | hooks admin |
| `src/pages/admin/RateLimitDashboard.tsx` | `useRateLimitLogs`, `RateLimitLog`, `RateLimitSortKey` |
| `src/pages/admin/RolesPage.tsx` | hooks admin |
| `src/pages/admin/operations/OpsTransfersTab.tsx` | `useTransfersPaginated` |
| `src/pages/failed-messages/FailedMessageDetailsSheet.tsx` | tipos e hooks DLQ |
| `src/pages/failed-messages/FailedMessagesBulkAbandonDialog.tsx` | hooks DLQ |
| `src/pages/failed-messages/FailedMessagesErrorCodeChart.tsx` | `ErrorCodeAggregate` |
| `src/pages/failed-messages/FailedMessagesFilters.tsx` | `FailedMessageStatus`, `FailedMessageRow` |
| `src/pages/failed-messages/FailedMessagesRootCauseChart.tsx` | `RootCauseAggregate` |
| `src/pages/inbox/AgentsOperationsPage.tsx` | hooks agentes |

---

## 7. Implementação por Arquivo

| Arquivo | Status | O que falta |
|---------|--------|-------------|
| `index.ts` | COMPLETA | — |
| `components/AdminView.tsx` | COMPLETA | — |
| `components/AIUsageDashboard.tsx` | COMPLETA | — |
| `components/AIUsageLogsTab.tsx` | COMPLETA | — |
| `components/AIUsageUsersTab.tsx` | COMPLETA | — |
| `components/AdminAuditTable.tsx` | COMPLETA | — |
| `components/AdminCRMDashboard.tsx` | COMPLETA | — |
| `components/AdminUsersTable.tsx` | COMPLETA | — |
| `components/AgentVersionsPanel.tsx` | COMPLETA | — |
| `components/BulkReprocessGuidedDialog.tsx` | COMPLETA | — |
| `components/CrisisRoom.tsx` | COMPLETA | — |
| `components/EvolutionFallbackStatusCard.tsx` | COMPLETA | — |
| `components/FailedMessageKpiCard.tsx` | COMPLETA | — |
| `components/FailedMessageStatusBadge.tsx` | COMPLETA | — |
| `components/FailedMessageTableRow.tsx` | COMPLETA | — |
| `components/ForceLogoutButton.tsx` | COMPLETA | — |
| `components/GmailWebhookMonitor.tsx` | COMPLETA | — |
| `components/InboxScopeConfig.tsx` | COMPLETA | — |
| `components/InboxScopeConfigParts.tsx` | COMPLETA | — |
| `components/MediaMigrationTool.tsx` | COMPLETA | — |
| `components/PlaybooksManager.tsx` | COMPLETA | — |
| `components/PublicApiDashboard.tsx` | COMPLETA | — |
| `components/QrAttemptsPanel.tsx` | COMPLETA | — |
| `components/RateLimitAlertsPanel.tsx` | COMPLETA | — |
| `components/RateLimitLogDetails.tsx` | COMPLETA | — |
| `components/RetryConfigBackoffTable.tsx` | COMPLETA | — |
| `components/RetryConfigPanel.tsx` | COMPLETA | — |
| `components/SicoobBridgeDashboard.tsx` | PARCIAL | DASHBOARD-13 hardcoded (A2) — dados reais não implementados |
| `components/SupervisorCopilot.tsx` | COMPLETA | — |
| `components/SupervisorQueueBoard.tsx` | COMPLETA | — |
| `components/TrainingMode.tsx` | COMPLETA | — |
| `components/VisibilityGrantsManager.tsx` | COMPLETA | — |
| `components/alerts/AlertInstanceDetailDialog.tsx` | COMPLETA | — |
| `components/alerts/AlertInstanceSLACard.tsx` | COMPLETA | — |
| `components/alerts/index.ts` | COMPLETA | — |
| `components/index.ts` | COMPLETA | — |
| `components/instance-pauses/AuthEventTrendChart.tsx` | COMPLETA | — |
| `components/instance-pauses/IncidentDetailDialog.tsx` | COMPLETA | — |
| `components/instance-pauses/index.ts` | COMPLETA | — |
| `components/telemetry/StsCommercialDashboard.tsx` | COMPLETA | — |
| `components/telemetry/TelemetryCharts.tsx` | COMPLETA | — |
| `components/telemetry/index.ts` | COMPLETA | — |
| `data-access/agentRepository.ts` | COMPLETA | — |
| `data-access/index.ts` | COMPLETA | — |
| `lib/supervisorPriority.ts` | COMPLETA | testes unitários ausentes (A14) |
| `hooks/useAdminManagement.ts` | COMPLETA | — |
| `hooks/useAdminData.ts` | COMPLETA | — |
| `hooks/useAIStats.ts` | COMPLETA | — |
| `hooks/useAIUsageDashboard.ts` | COMPLETA | — |
| `hooks/useAgentGamification.ts` | COMPLETA | cast manual explícito (A6) |
| `hooks/useAgentReassignment.ts` | COMPLETA | cast bigint→number (A7) |
| `hooks/useAgents.ts` | COMPLETA | — |
| `hooks/useCrisisRoomData.ts` | COMPLETA | — |
| `hooks/useDiagnosticsData.ts` | COMPLETA | — |
| `hooks/useForceLogoutMutation.ts` | COMPLETA | — |
| `hooks/useInboxCustomScopesData.ts` | COMPLETA | — |
| `hooks/usePlaybooksData.ts` | COMPLETA | não é React Hook (A15) |
| `hooks/useRateLimitAlertNotifier.ts` | COMPLETA | — |
| `hooks/useRateLimitAlerts.ts` | COMPLETA | — |
| `hooks/useRateLimitLogs.ts` | COMPLETA | — |
| `hooks/useSupervisorConversations.ts` | COMPLETA | heavy type casts inline (A8) |
| `hooks/useSupervisorQueuesData.ts` | COMPLETA | não é React Hook (A16) |
| `hooks/useVersions.ts` | COMPLETA | — |
| `hooks/useVisibleAgents.ts` | COMPLETA | — |
| `hooks/index.ts` | COMPLETA | — |
| `hooks/gamification/levelUtils.ts` | COMPLETA | — |
| `hooks/gamification/mutations.ts` | COMPLETA | race condition XP (A9) |
| `hooks/gamification/types.ts` | COMPLETA | — |
| `hooks/gamification/index.ts` | COMPLETA | — |
| `hooks/monitoring/failedMessagesTypes.ts` | COMPLETA | — |
| `hooks/monitoring/failedMessagesAggregates.ts` | COMPLETA | sem testes (função pura) |
| `hooks/monitoring/useDispatchErrorLogs.ts` | COMPLETA | — |
| `hooks/monitoring/useDlqAuditLog.ts` | COMPLETA | — |
| `hooks/monitoring/useFailedMessages.ts` | COMPLETA | _rpc escape hatch (A1) |
| `hooks/monitoring/useFailedMessagesUI.ts` | COMPLETA | — |
| `hooks/monitoring/useIdempotencyMissAlerts.ts` | COMPLETA | dedup localStorage (A10) |
| `hooks/monitoring/useRetryMetrics.ts` | COMPLETA | — |
| `hooks/monitoring/useTransfersPaginated.ts` | COMPLETA | — |
| `hooks/monitoring/index.ts` | COMPLETA | — |
| `services/agentService.ts` | COMPLETA | — |
| `services/index.ts` | COMPLETA | — |
| `utils/profileMappers.ts` | COMPLETA | — |
| `hooks/__tests__/calculateTrend.test.ts` | COMPLETA | — |
| `hooks/gamification/__tests__/levelUtils.test.ts` | COMPLETA | — |
| `hooks/gamification/__tests__/types.test.ts` | COMPLETA | — |
| `hooks/monitoring/__tests__/useFailedMessagesUI.test.ts` | COMPLETA | — |
| `hooks/monitoring/__tests__/useIdempotencyMissAlerts.helpers.test.ts` | COMPLETA | — |
| `services/__tests__/agentService.test.ts` | COMPLETA | — |
| `utils/__tests__/profileMappers.test.ts` | COMPLETA | — |

---

## 8. Achados

### A1 — `_rpc` escape hatch com `ignore-audit` em useFailedMessages
**Arquivo:** `hooks/monitoring/useFailedMessages.ts:37`

Todas as chamadas RPC do DLQ são feitas via `(supabase as unknown as _SupaRpc).rpc(fn, args)` com comentário `// ignore-audit`. O motivo é que as funções DLQ não aparecem nos tipos gerados (`types.ts`). O cast é necessário mas silencia o TypeScript completamente para essas RPCs — erros de nome/assinatura só aparecem em runtime.

### A2 — DASHBOARD-13 hardcoded em SicoobBridgeDashboard
**Arquivo:** `components/SicoobBridgeDashboard.tsx:28-33`

O componente tem seções marcadas com `// DASHBOARD-13` indicando dados ou lógica parcialmente hardcoded. A integração com a API Sicoob parece incompleta ou em fase de stub — os dados reais podem não estar sendo carregados.

### A3 — `ignore-audit` em AdminView linha 231
**Arquivo:** `components/AdminView.tsx:231`

Cast `as unknown as` com `// ignore-audit` para contornar tipo não refletido nos tipos gerados. Padrão recorrente no módulo (ver A1).

### A4 — `maybeSingle()` como fix explícito para PGRST116 em TrainingMode
**Arquivo:** `components/TrainingMode.tsx:113` e `141`

Uso de `.maybeSingle()` em vez de `.single()` em duas queries. Comentário implícito: fix para `PGRST116` ("JSON object requested, multiple (or no) rows returned"). Indica que havia um bug de múltiplas linhas que foi corrigido localmente sem refactor da query.

### A5 — `Math.random()` no nome de canais Realtime (padrão recorrente)
**Arquivos:** `hooks/useRateLimitLogs.ts`, `hooks/useAgents.ts`, múltiplos outros

Todos os canais Realtime usam `Math.random().toString(36).slice(2, 10)` como sufixo para evitar colisão de subscriptions. Não é um bug, mas significa que cada montagem do componente cria um novo canal — se o componente for montado/desmontado rapidamente, podem acumular canais antes do cleanup.

### A6 — Cast manual explícito em useAgentGamification para bypass de tipos
**Arquivo:** `hooks/useAgentGamification.ts:20-32`

O hook define um objeto `db` como cast explícito de supabase para acessar `profiles`, `agent_stats` e `agent_achievements` cujos tipos não estão completos nos tipos gerados. Funciona, mas silencia erros de tipagem nas três tabelas afetadas.

### A7 — Cast `data as unknown as number` em useAgentReassignment
**Arquivo:** `hooks/useAgentReassignment.ts`

RPCs `reassign_absent_agents` e `reassign_overloaded_agents` retornam `bigint` do PostgreSQL, que o PostgREST serializa diferente de `number`. O cast `data as unknown as number` é necessário mas pode quebrar se a RPC mudar de contrato ou se o valor exceder `Number.MAX_SAFE_INTEGER`.

### A8 — Casts inline profundos em useSupervisorConversations
**Arquivo:** `hooks/useSupervisorConversations.ts:69-88`

Query a `profiles` usa um cast inline com 4 níveis de aninhamento de tipos para contornar colunas `is_active` e `role` ausentes nos tipos gerados. O cast `profiles as unknown as { select: (c: string) => { eq: ... } }` é extenso e frágil — qualquer mudança na API do builder quebra silenciosamente.

### A9 — Race condition no cálculo de XP em gamification/mutations
**Arquivo:** `hooks/gamification/mutations.ts`

A mutação `addXp` faz: (1) lê `agent_stats` para pegar XP atual, (2) calcula novo XP+level client-side, (3) escreve de volta. Se dois eventos de XP dispararem simultaneamente (ex: duas mensagens enviadas ao mesmo tempo), o segundo lê o valor antigo e sobrescreve o resultado do primeiro, perdendo XP. Sem transação ou `FOR UPDATE` no DB.

### A10 — Dedup localStorage em useIdempotencyMissAlerts com TTL de 6h
**Arquivo:** `hooks/monitoring/useIdempotencyMissAlerts.ts`

Alertas de idempotência são deduplicados por hora usando localStorage com TTL de 6h (`zapp:idempotency-miss-alerts:v1`). Se o localStorage estiver cheio ou indisponível (SSR, modo incógnito com restrição), o dedup falha silenciosamente e pode gerar alertas duplicados para o mesmo período.

### A11 — `useRetryMetrics` usa `schema: 'evo'` explícito (tabela física)
**Arquivo:** `hooks/monitoring/useRetryMetrics.ts`

O Realtime de `evolution_retry_metrics` usa `schema: 'evo'` explicitamente porque a tabela existe somente no schema `evo` (não há VIEW correspondente em `zapp`). Correto per regra 2 do CLAUDE.md. Serve como exemplo de uso legítimo do `schema: 'evo'`.

### A12 — `usePlaybooksData` e `useInboxCustomScopesData` não são React Hooks
**Arquivos:** `hooks/usePlaybooksData.ts`, `hooks/useInboxCustomScopesData.ts`, `hooks/useSupervisorQueuesData.ts`, `hooks/useCrisisRoomData.ts`

Apesar de estarem na pasta `hooks/` e terem prefixo `use`, esses arquivos exportam apenas funções assíncronas comuns (não usam `useState`, `useEffect`, `useQuery`, nem nenhum hook React). Nomear com prefixo `use` é enganoso — podem ser chamados em qualquer contexto, mas o linter pode reclamar se usados em posições de hook.

### A13 — `count: 'planned'` em useAIStats
**Arquivo:** `hooks/useAIStats.ts`

Uma query usa `count: 'planned'` (valor não documentado na API pública do supabase-js). Pode ser um tipo estendido localmente ou um valor que o PostgREST ignora graciosamente. Se a API mudar, a query pode falhar ou retornar count incorreto sem aviso.

### A14 — `computePriority` e `sortByPriority` sem testes unitários
**Arquivo:** `lib/supervisorPriority.ts`

As funções de priorização do copiloto do supervisor são funções puras sem dependências — candidatas ideais para testes unitários. Não há arquivo de teste correspondente. As regras de negócio (P1 = sem atendente há 30min, risco ≥80, IA urgente; P2 = 15min ou risco ≥60; etc.) não têm cobertura automatizada.

### A15 — `agentRepository.fetchQueuesAndMembers` usa cast por `is_active` ausente nos tipos
**Arquivo:** `data-access/agentRepository.ts:34-50`

O campo `is_active` existe fisicamente nas tabelas `queues` e `queue_members` mas não aparece nos tipos gerados. O repositório resolve com um cast inline controlado (comentado). Indica drift entre schema real e tipos gerados — `types.ts` pode precisar de regeneração.

### A16 — `useAdminData` cria usuário via `fetch` raw em vez de `supabase.functions`
**Arquivo:** `hooks/useAdminData.ts`

A criação de usuário chama a Edge Function `create-user` via `fetch` raw com headers manuais em vez de usar `supabase.functions.invoke`. Isso contorna a gestão de auth token automática do client. Se o token expirar durante a chamada, a requisição falha com 401 sem retry automático.

---

*Runtime: NAO_VERIFICADO — nenhuma execução real foi realizada durante esta análise.*
