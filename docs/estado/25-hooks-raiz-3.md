# Estado: src/hooks/ raiz — chunk 3/4 (useIndexKeyboardShortcuts → useRetryAndErrorPrevention)

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 56/56

## 1. Visão Geral

Chunk 3 da raiz de `src/hooks/` — 56 arquivos cobrindo teclado, integrações, base de conhecimento, LGPD, filas, realtime, notificações e utilitários variados. Predominância de módulos consolidados (ETAPAs 26–42) e re-exports (shims) para sub-módulos. Apenas 2 órfãos diretos identificados.

| arquivo | linhas | o que faz | status | impl |
|---------|--------|-----------|--------|------|
| useIndexKeyboardShortcuts.ts | 14 | Re-export shim → useIndexKeyboardShortcutsManagement | EM_USO | COMPLETA |
| useIndexNavigation.ts | 88 | Navegação de views: histórico, back/forward, deep-link `?view=`, bridge custom event | EM_USO | COMPLETA |
| useIntegrationManagement.ts | 215 | Consolida 5 sub-hooks de integrações (Evolution/Gmail/Bitrix/TalkX/SyncToCRM) | **ORFAO** | COMPLETA |
| useKeyboardHeight.ts | 7 | Re-export shim → useKeyboardHeightManagement | EM_USO | COMPLETA |
| useKeyboardManagement.ts | 401 | Mega-módulo: shortcuts personalizados, global keyboard, index shortcuts, keyboard height | **ORFAO** | COMPLETA |
| useKnowledgeBase.ts | 174 | CRUD de artigos KB + upload de arquivos | EM_USO | COMPLETA |
| useKnowledgeBaseSearch.ts | 75 | Busca debounced em artigos publicados da KB | EM_USO | COMPLETA |
| useLGPDAuditLogs.ts | 51 | Busca entradas de audit_log com prefixos LGPD/GDPR | EM_USO | COMPLETA |
| useLatestAnalysis.ts | 25 | Wrapper de análise de contato — queryFn retorna null incondicionalmente | EM_USO | **STUB** |
| useLeaderboard.ts | 9 | Re-export shim → useLeaderboardManagement | EM_USO | COMPLETA |
| useMFA.ts | 2 | Re-export → `@/features/auth/hooks/useMFA` | EM_USO | COMPLETA |
| useMarketingBudgets.ts | 33 | Lê `zapp.budgets` (somente leitura) | EM_USO | COMPLETA |
| useMediaManagement.ts | 233 | Módulo consolidado: stickers, emojis, export/import dados, permissão de download | EM_USO | COMPLETA |
| useMessageAttempts.ts | 37 | Re-export wrapper sobre useAnalyticsManagement | EM_USO | COMPLETA |
| useMessageReactions.ts | 3 | Re-export → `@/features/inbox/hooks/useMessageReactions` | EM_USO | COMPLETA |
| useMountedRef.ts | 17 | Guard ref contra setState pós-unmount | EM_USO | COMPLETA |
| useNPSSurveys.ts | 113 | CRUD + métricas de pesquisas NPS | EM_USO | COMPLETA |
| useNavigationHistory.ts | 141 | Pilha back/forward + breadcrumb + sync URL hash | EM_USO | COMPLETA |
| useNotificationChannels.ts | 189 | CRUD de `notification_channels_config` + `notification_templates` | EM_USO | PARCIAL |
| useNotificationManagement.ts | 506 | Módulo consolidado: push, settings, team-chat, security, goals, transcription | EM_USO | COMPLETA |
| useNotificationSettings.ts | 11 | Re-export wrapper → useNotificationManagement | EM_USO | COMPLETA |
| useNumberReputation.ts | 42 | Funções async puras (NÃO hook React) para `number_reputation` + `whatsapp_connections` | EM_USO | COMPLETA |
| useObjectionDetector.ts | 219 | Detecta objeções via Edge Function `ai-proxy` (Gemini) e sugere contra-argumentos | EM_USO | COMPLETA |
| useOfflineCache.ts | 103 | Persiste conversas em localStorage (TTL 30 min, 50 conv × 20 msgs) | EM_USO | COMPLETA |
| useOnboarding.ts | 92 | Rastreia conclusão de onboarding via `user_settings` + localStorage | EM_USO | COMPLETA |
| useOnboardingChecklist.ts | 84 | Verifica 4 etapas de onboarding via 4 queries paralelas | EM_USO | COMPLETA |
| useOpsAuditLogs.ts | 61 | Lista `audit_logs` filtrado por 5 entity_types de ops | EM_USO | COMPLETA |
| useParticipantStats.ts | 83 | Estatísticas de envio/entrega/leitura por participante em team_messages | EM_USO | COMPLETA |
| usePaymentLinks.ts | 25 | Funções async puras (NÃO hook React) — CRUD de `payment_links` | EM_USO | COMPLETA |
| usePerformanceMonitoring.ts | 15 | Re-export de usePerformanceMonitoringManagement; parâmetro `_componentName` ignorado | EM_USO | PARCIAL |
| usePeriodComparison.ts | 14 | Função utilitária (NÃO hook React) — count de `conversation_closures` num período | EM_USO | COMPLETA |
| usePermissions.ts | 3 | Re-export → `@/features/auth/hooks/usePermissions` | EM_USO | COMPLETA |
| usePersonalStickers.ts | 194 | CRUD completo de stickers pessoais via `stickers` + bucket Storage `stickers` | EM_USO | COMPLETA |
| usePrefetchOnHover.ts | 46 | Prefetch de queries ao hover em nav items (react-query) | EM_USO | COMPLETA |
| useProfileAvatarMutations.ts | 12 | Função async pura (NÃO hook React) — UPDATE de `avatar_url` em `profiles` | EM_USO | COMPLETA |
| useProviderPanel.ts | 137 | Lista providers WA e logs via RPCs; upsert/delete de `provider_configs` | EM_USO | COMPLETA |
| usePullToRefresh.ts | 63 | Gesto pull-to-refresh estilo iOS, sem acesso a DB | EM_USO | COMPLETA |
| usePushNotifications.ts | 30 | Wrapper fino sobre usePushNotificationsManagement | EM_USO | COMPLETA |
| useQrAttemptHistory.ts | 24 | Função async pura (NÃO hook React) — SELECT em `qr_attempts` | EM_USO | COMPLETA |
| useQueryTelemetry.ts | 104 | Lista e limpa `query_telemetry` com filtros por severidade/tempo | EM_USO | COMPLETA |
| useQueueAnalytics.ts | 64 | Adapter thin sobre useQueueAnalyticsManagement; normaliza DateRange legado | EM_USO | PARCIAL |
| useQueueDetails.ts | 158 | Busca fila + membros + contatos + métricas | EM_USO | COMPLETA |
| useQueueGoals.ts | 56 | Wrapper sobre useQueueGoalsManagement; upsert em `queue_goals` | EM_USO | COMPLETA |
| useQueueManagement.ts | 570 | Módulo consolidado (ETAPA 33): CRUD filas, analytics, goals, SLA, comparação | EM_USO | COMPLETA |
| useQueueRoutingRules.ts | 94 | CRUD de `queue_routing_rules` por fila | EM_USO | COMPLETA |
| useQueueSlaPanel.ts | 17 | Re-export de useQueueSlaManagement (ETAPA 26) | EM_USO | COMPLETA |
| useQueues.ts | 265 | Lista filas+membros+waiting_count, cache TTL 5 min, realtime subscriptions, CRUD | EM_USO | COMPLETA |
| useQueuesComparison.ts | 111 | Compara filas ativas por contacts, assignment rate, agentes em date range | EM_USO | COMPLETA |
| useRateLimitConfigs.ts | 47 | Funções async puras (NÃO hook React) — fetch/save de `rate_limit_configs` | EM_USO | COMPLETA |
| useRealtimeDashboard.ts | 6 | Re-export de useRealtimeDashboardManagement (ETAPA 37) | EM_USO | COMPLETA |
| useRealtimeManagement.ts | 248 | Módulo consolidado (ETAPA 37): dashboard realtime, mensagens, monitor | EM_USO | COMPLETA |
| useRealtimeMessages.ts | 315 | Carrega contacts+messages evo, mantém mapa de conversas, realtime INSERT/UPDATE | EM_USO | COMPLETA |
| useRealtimeMonitor.ts | 16 | Wrapper de useRealtimeMonitorManagement com flag `enabled` e `lastEventAt` | EM_USO | COMPLETA |
| useRealtimeSentimentAlerts.ts | 78 | Realtime INSERT em `zapp.sentiment_alerts`, toast + som + browser notification | EM_USO | COMPLETA |
| useReauthentication.ts | 2 | Re-export → `@/features/auth/hooks/useReauthentication` | EM_USO | COMPLETA |
| useRetryAndErrorPrevention.ts | 531 | Consolidação de retry (backoff exponencial) + silent error prevention + métricas | EM_USO | COMPLETA |

---

## 2. Fluxos Funcionais

### Teclado e Navegação
- `useKeyboardManagement` (401 ln) → exporta implementação de shortcuts/height → shims `useIndexKeyboardShortcuts`, `useKeyboardHeight`, `useCustomShortcuts`, `useGlobalKeyboardShortcuts`
- `useIndexNavigation` → `GlobalKeyboardProvider` + `react-router-dom`
- `usePrefetchOnHover` → `@/services/api/queryKeys` → react-query prefetch em hover

### Base de Conhecimento
- `useKnowledgeBase` → `zapp.knowledge_base_articles`, `zapp.knowledge_base_files`, Storage `whatsapp-media` (bucket incorreto)
- `useKnowledgeBaseSearch` → `zapp.knowledge_base_articles` (busca debounced)

### Filas (Queue)
- `useQueueManagement` (ETAPA 33, 570 ln) → consolida `useQueueAnalyticsManagement`, `useQueueGoalsManagement`, `useQueueSlaManagement`, `useQueuesComparisonManagement`
- `useQueues` → `zapp.queues`, `zapp.queue_members` + realtime `zapp.queue_positions`
- `useQueueDetails` → `zapp.queues`, `zapp.queue_members`, `zapp.profiles`, `contacts`, `evolution_messages`
- `useQueueRoutingRules` → `zapp.queue_routing_rules`
- `useQueueGoals` → `zapp.queue_goals` (safeFrom)
- `useQueueAnalytics` → delega para `useQueueAnalyticsManagement` (agentPerformance hardcoded `[]`)

### Realtime
- `useRealtimeManagement` (ETAPA 37) → channel Supabase + `zapp.app_notifications`
- `useRealtimeMessages` → `evo.evolution_messages` (realtime INSERT/UPDATE), `zapp.evolution_contacts`
- `useRealtimeSentimentAlerts` → `zapp.sentiment_alerts` (realtime INSERT) + notificação browser
- `useRealtimeMonitor` → tabela parametrizável (evo ou zapp)

### Notificações
- `useNotificationManagement` (506 ln) → `zapp.user_settings`, `zapp.app_notifications` + realtime
- `useNotificationChannels` → `zapp.notification_channels_config`, `zapp.notification_templates` (executor ausente — TODO DASHBOARD-08)
- `useNotificationSettings` → wrapper de useNotificationManagement

### Integrações (ORFÃO)
- `useIntegrationManagement` (215 ln, ETAPA 42) → consolida Evolution/Gmail/Bitrix/TalkX/SyncToCRM; **sem consumidor externo**

### IA e Análise
- `useObjectionDetector` → Edge Function `ai-proxy` com modelo `google/gemini-3-flash-preview` (hardcoded)
- `useLatestAnalysis` → queryFn retorna `null` incondicionalmente (STUB)

---

## 3. Tabelas, RPCs, canais realtime e edge functions

**Tabelas `zapp`:**
`budgets`, `knowledge_base_articles`, `knowledge_base_files`, `audit_logs`, `user_settings`, `profiles`, `whatsapp_connections`, `personal_stickers`, `stickers`, `custom_emojis`, `nps_surveys`, `notification_channels_config`, `notification_templates`, `app_notifications`, `payment_links`, `queue_goals`, `queue_routing_rules`, `queue_analytics`, `queues`, `queue_members`, `query_telemetry`, `rate_limit_configs`, `number_reputation`, `sentiment_alerts`, `qr_attempts`, `conversation_closures`, `team_messages`, `team_message_receipts`, `provider_configs`, `quick_replies`

**Tabelas `evo`:**
`evolution_messages` (realtime raiz), `evolution_contacts`, `evolution_conversations`

**RPCs:**
`rpc_provider_panel`, `rpc_provider_session_timeline`, `rpc_queue_sla_panel`, `rpc_queue_rebalance_candidates`, `export_user_data` (STUB), `import_user_data` (STUB), `check_download_permission` (fail-open intencional)

**Canais Realtime:**
- `schema: 'zapp'`, tabela `app_notifications` (useRealtimeManagement)
- `schema: 'evo'`, tabela `evolution_messages` raiz (useRealtimeMessages)
- `schema: 'zapp'`, tabela `sentiment_alerts` (useRealtimeSentimentAlerts)
- `schema: 'zapp'`, tabela `queue_positions` (useQueues)

**Edge Functions:**
- `ai-proxy` (useObjectionDetector — analyze + rewrite, modelo Gemini)
- `gmail-oauth` (useIntegrationManagement)

**Storage Buckets:**
- `whatsapp-media` (useKnowledgeBase — BUCKET ERRADO para arquivos KB)
- `stickers` (usePersonalStickers)

---

## 4. Exports Públicos por categoria

| categoria | hooks/funções |
|-----------|---------------|
| Re-exports / shims | useIndexKeyboardShortcuts, useKeyboardHeight, useLeaderboard, useMFA, useMessageReactions, useMessageAttempts, useNotificationSettings, usePushNotifications, useRealtimeDashboard, useQueueSlaPanel, useReauthentication, usePermissions |
| Módulos consolidados (ETAPA) | useKeyboardManagement, useMediaManagement, useNotificationManagement, useQueueManagement, useRealtimeManagement, useIntegrationManagement (ORFÃO) |
| Hooks React completos | useIndexNavigation, useKnowledgeBase, useKnowledgeBaseSearch, useLGPDAuditLogs, useMarketingBudgets, useNPSSurveys, useNavigationHistory, useNotificationChannels, useObjectionDetector, useOfflineCache, useOnboarding, useOnboardingChecklist, useOpsAuditLogs, useParticipantStats, usePersonalStickers, usePrefetchOnHover, useProviderPanel, usePullToRefresh, useQueueAnalytics, useQueueDetails, useQueueGoals, useQueueRoutingRules, useQueues, useQueuesComparison, useQueryTelemetry, useRealtimeMessages, useRealtimeMonitor, useRealtimeSentimentAlerts, useRetryAndErrorPrevention |
| Funções async (prefixo `use` enganoso) | useNumberReputation, usePaymentLinks, usePeriodComparison, useProfileAvatarMutations, useQrAttemptHistory, useRateLimitConfigs |
| Utilitários React | useMountedRef |
| STUBs ativos | useLatestAnalysis |
| Parcialmente implementados | useNotificationChannels, usePerformanceMonitoring, useQueueAnalytics |

---

## 5. Chama (Saída)

| dependência externa | usada por |
|--------------------|-----------|
| `@tanstack/react-query` | useKnowledgeBase, useKnowledgeBaseSearch, useLGPDAuditLogs, useLatestAnalysis, useNPSSurveys, useNotificationManagement, usePrefetchOnHover |
| `@/integrations/supabase/client` | useKnowledgeBase, useLGPDAuditLogs, useNotificationChannels, useQueues, useQueueManagement, useRateLimitConfigs, useRealtimeMessages, usePersonalStickers + 15 outros |
| `@/integrations/supabase/safeClient` | useParticipantStats, useQueueGoals, useQueueManagement |
| `@/integrations/supabase/schema` | useNotificationChannels, useQueueRoutingRules |
| `@/integrations/supabase/channelErrorLogging` | useRealtimeManagement, useRealtimeMessages |
| `@/lib/logger` | useKnowledgeBase, useKnowledgeBaseSearch, useQueues, useRealtimeManagement, useRealtimeMessages, useRetryAndErrorPrevention + 8 outros |
| `@/lib/sanitize` | useKnowledgeBaseSearch, useOpsAuditLogs |
| `@/services/api/queryKeys` | useNotificationChannels, useParticipantStats, useQueueManagement, useQueryTelemetry |
| `@/lib/mediaUrl` | usePersonalStickers |
| `@/utils/notificationSound` / `notificationSounds` | useRealtimeSentimentAlerts, useNotificationManagement |
| `@/lib/silentErrorPrevention`, `@/lib/retryStrategyAudit` | useRetryAndErrorPrevention |
| `@/lib/queryStaleTimes` | useQueues |
| `@/features/auth` | useOnboarding, useOnboardingChecklist, usePersonalStickers, useQueueManagement, useRealtimeSentimentAlerts |
| `@/features/inbox` (types) | useOfflineCache |
| `@/hooks/useAnalyticsManagement` | useMessageAttempts, usePerformanceMonitoring |
| `@/hooks/useQueueManagement` | useQueueAnalytics, useQueueGoals |
| `@/hooks/useNotificationManagement` | useNotificationSettings, usePushNotifications |
| `@/hooks/use-toast` | useKnowledgeBase, usePersonalStickers, useRetryAndErrorPrevention |
| `@/integrations/datasource/db` | useQueueDetails |
| `sonner` | useIntegrationManagement, useKnowledgeBase, useNPSSurveys, useOpsAuditLogs, useQueryTelemetry + 5 outros |
| `react-router-dom` | useIndexNavigation, useKeyboardManagement |
| Edge Function `ai-proxy` | useObjectionDetector |
| Edge Function `gmail-oauth` | useIntegrationManagement |

---

## 6. Chamado Por (Entrada)

| arquivo | quem importa (fora de hooks/) | qtd |
|---------|------------------------------|-----|
| useIndexKeyboardShortcuts | `components/layout/IndexContentConnected.tsx` | 1 |
| useIndexNavigation | `components/layout/IndexContentConnected.tsx` | 1 |
| useIntegrationManagement | — | **0** |
| useKeyboardHeight | `components/mobile/MobileShell.tsx` | 1 |
| useKeyboardManagement | — | **0** (via shims internos) |
| useKnowledgeBase | `lib/storageSignedUrls.ts`, `features/inbox/components/KnowledgeBaseSearchPanel.tsx`, `components/knowledge/KnowledgeBaseView.tsx` | 3 |
| useKnowledgeBaseSearch | `features/inbox/components/KnowledgeBaseSearchPanel.tsx` | 1 |
| useLGPDAuditLogs | `components/compliance/PrivacyAuditTrail.tsx` | 1 |
| useLatestAnalysis | `features/inbox/components/AnalysisBadges.tsx` | 1 |
| useLeaderboard | `features/dashboard/hooks/useDashboardVisualizationManagement.ts`, `components/leaderboard/Leaderboard.tsx`, `components/leaderboard/LeaderboardHelpers.tsx` | 3 |
| useMFA | `features/auth/components/mfa/*`, `pages/TwoFactorAuth.tsx`, `components/security/*`, `features/auth/hooks/index.ts` | 8 |
| useMarketingBudgets | `components/settings/MarketingBudgets.tsx` | 1 |
| useMediaManagement | `features/inbox/components/ImagePreview.tsx`, `components/ExportDropdown.tsx` | 2+ |
| useMessageAttempts | `features/inbox/components/chat/MessageAttemptsTimeline.tsx` | 1 |
| useMessageReactions | `features/inbox/components/MessageReactions.tsx` | 2+ |
| useMountedRef | 30+ arquivos em components/, features/, hooks/ | 30+ |
| useNPSSurveys | `components/nps/NPSDashboard.tsx` | 1 |
| useNavigationHistory | via useIndexNavigation (indireto) | 1 |
| useNotificationChannels | `components/notifications/NotificationChannelsAdmin.tsx`, `pages/admin/notifications/NotificationChannelsPage.tsx` | 2 |
| useNotificationManagement | `components/notifications/*` + features/inbox/ + features/sla/ + components/calls/ | 10+ |
| useNotificationSettings | `components/notifications/NotificationSettingsPanel.tsx`, `components/notifications/PushNotificationToggle.tsx` + 6 outros | 8 |
| useNumberReputation | `components/connections/NumberReputationMonitor.tsx` | 1 |
| useObjectionDetector | `features/inbox/components/ObjectionDetector.tsx` | 1 |
| useOfflineCache | `features/inbox/hooks/useRealtimeInbox.ts` | 1 |
| useOnboarding | `components/layout/IndexContentConnected.tsx`, `components/settings/SettingsView.tsx`, `pages/Index.tsx` | 3 |
| useOnboardingChecklist | `components/layout/IndexContentConnected.tsx` | 1 |
| useOpsAuditLogs | `pages/admin/operations/OpsLogsTab.tsx` | 1 |
| useParticipantStats | `components/team-chat/ParticipantStatsGraph.tsx` | 1 |
| usePaymentLinks | `components/payments/PaymentLinksView.tsx` | 1 |
| usePerformanceMonitoring | `components/reports/PeriodComparison.tsx`, `components/team-chat/useTeamChatPanel.ts`, `components/performance/PerformanceMonitor.tsx` | 3 |
| usePeriodComparison | `components/reports/PeriodComparison.tsx` | 1 |
| usePermissions | `features/inbox/*`, `components/settings/*`, `components/admin/*` | 7 |
| usePersonalStickers | `features/inbox/components/stickers/PersonalStickers.tsx` | 1 |
| usePrefetchOnHover | `components/layout/SidebarNavItem.tsx` | 1 |
| useProfileAvatarMutations | `components/settings/AvatarUpload.tsx` | 1 |
| useProviderPanel | `pages/admin/AdminProvidersPage.tsx` | 1 |
| usePullToRefresh | `features/inbox/components/RealtimeInboxView.tsx` | 1 |
| usePushNotifications | `components/security/SecurityNotificationsPanel.tsx`, `components/notifications/PushNotificationCard.tsx` | 3 |
| useQrAttemptHistory | `components/connections/QrAttemptHistory.tsx` | 1 |
| useQueryTelemetry | `pages/AdminTelemetriaPage.tsx` | 1 |
| useQueueAnalytics | `components/queues/QueueCharts.tsx`, `pages/QueueDetails.tsx` | 2 |
| useQueueDetails | `pages/QueueDetails.tsx` | 1 |
| useQueueGoals | `components/queues/QueueGoalsDialog.tsx`, `components/queues/QueuesView.tsx`, `components/queues/QueueAlertsDisplay.tsx` | 3 |
| useQueueManagement | `components/queues/QueueSlaPanel.tsx` + hooks internos | 1+ |
| useQueueRoutingRules | `features/queues/components/QueueRoutingRules.tsx` | 1 |
| useQueueSlaPanel | 2 arquivos de queues | 2 |
| useQueues | `features/queues/`, `components/queues/`, `TransferDialog`, `AssignmentSection`, `db.ts` etc. | 19 |
| useQueuesComparison | 4 arquivos | 4 |
| useRateLimitConfigs | `components/admin/RateLimitConfigPanel.tsx` | 2 |
| useRealtimeDashboard | 5 arquivos de dashboard | 5 |
| useRealtimeManagement | useRealtimeDashboard, useRealtimeMonitor + 1 outro | 3 |
| useRealtimeMessages | `hooks/useMessages`, `messageService`, `features/inbox/hooks/*` | 8 |
| useRealtimeMonitor | 3 arquivos | 3 |
| useRealtimeSentimentAlerts | 3 arquivos | 3 |
| useReauthentication | `components/security/SecuritySettingsPanel.tsx`, `features/auth/hooks/index.ts` | 4 |
| useRetryAndErrorPrevention | `components/contacts/EditContactDialog.tsx`, `hooks/useContactFormV3` | 3 |

---

## 7. Órfãos

| arquivo | linhas | veredito | justificativa |
|---------|--------|----------|---------------|
| useIntegrationManagement.ts | 215 | **VERIFICAR** | Consolida 5 sub-hooks (ETAPA 42) mas nenhum consumidor externo a `src/hooks/` importa este arquivo. Os consumidores reais acessam diretamente `useEvolutionApiManagement.ts`, `useGmailOAuthFlowManagement.ts` etc. É provável dead code resultante de refactor incompleto. |
| useKeyboardManagement.ts | 401 | **NAO_REMOVER** | Implementação real dos 4 shims `useCustomShortcuts`, `useGlobalKeyboardShortcuts`, `useIndexKeyboardShortcuts` e `useKeyboardHeight`, todos com consumidores externos ativos. Não tem importador direto fora de hooks/ mas é transitivamente essencial. |

---

## 8. Implementação por Arquivo

| arquivo | status | o que falta |
|---------|--------|-------------|
| useIndexKeyboardShortcuts.ts | COMPLETA | — |
| useIndexNavigation.ts | COMPLETA | — |
| useIntegrationManagement.ts | COMPLETA | nenhum consumidor externo (ORFÃO) |
| useKeyboardHeight.ts | COMPLETA | — |
| useKeyboardManagement.ts | COMPLETA | ORFÃO indireto — só via shims |
| useKnowledgeBase.ts | COMPLETA | bucket `whatsapp-media` errado para arquivos KB |
| useKnowledgeBaseSearch.ts | COMPLETA | — |
| useLGPDAuditLogs.ts | COMPLETA | — |
| useLatestAnalysis.ts | STUB | queryFn retorna null; RPC nunca implementada (GAP-6) |
| useLeaderboard.ts | COMPLETA | — |
| useMFA.ts | COMPLETA | — |
| useMarketingBudgets.ts | COMPLETA | — |
| useMediaManagement.ts | COMPLETA | RPCs export/import são STUBS (RAISE P0001) |
| useMessageAttempts.ts | COMPLETA | — |
| useMessageReactions.ts | COMPLETA | — |
| useMountedRef.ts | COMPLETA | — |
| useNPSSurveys.ts | COMPLETA | `.limit(500)` hardcoded sem paginação |
| useNavigationHistory.ts | COMPLETA | — |
| useNotificationChannels.ts | PARCIAL | executor de envio ausente (TODO DASHBOARD-08) |
| useNotificationManagement.ts | COMPLETA | — |
| useNotificationSettings.ts | COMPLETA | — |
| useNumberReputation.ts | COMPLETA | nomenclatura `use*` enganosa (não é hook React) |
| useObjectionDetector.ts | COMPLETA | modelo AI hardcoded no código |
| useOfflineCache.ts | COMPLETA | — |
| useOnboarding.ts | COMPLETA | — |
| useOnboardingChecklist.ts | COMPLETA | — |
| useOpsAuditLogs.ts | COMPLETA | — |
| useParticipantStats.ts | COMPLETA | cliente inconsistente (safeClient vs supabase) |
| usePaymentLinks.ts | COMPLETA | nomenclatura `use*` enganosa (não é hook React) |
| usePerformanceMonitoring.ts | PARCIAL | `_componentName` declarado mas ignorado |
| usePeriodComparison.ts | COMPLETA | nomenclatura `use*` enganosa (não é hook React) |
| usePermissions.ts | COMPLETA | — |
| usePersonalStickers.ts | COMPLETA | padrão `as never` em 5 chamadas à tabela `stickers` |
| usePrefetchOnHover.ts | COMPLETA | — |
| useProfileAvatarMutations.ts | COMPLETA | nomenclatura `use*` enganosa (não é hook React) |
| useProviderPanel.ts | COMPLETA | — |
| usePullToRefresh.ts | COMPLETA | — |
| usePushNotifications.ts | COMPLETA | — |
| useQrAttemptHistory.ts | COMPLETA | nomenclatura `use*` enganosa (não é hook React) |
| useQueryTelemetry.ts | COMPLETA | DELETE direto do cliente sem RPC (risco RLS) |
| useQueueAnalytics.ts | PARCIAL | `agentPerformance` hardcoded `[]`; hourlyData/dailyData aproximados |
| useQueueDetails.ts | COMPLETA | `avgResponseTime` hardcoded `"N/A"` |
| useQueueGoals.ts | COMPLETA | — |
| useQueueManagement.ts | COMPLETA | `dateRange` descartado em useQueuesComparisonManagement |
| useQueueRoutingRules.ts | COMPLETA | — |
| useQueueSlaPanel.ts | COMPLETA | — |
| useQueues.ts | COMPLETA | — |
| useQueuesComparison.ts | COMPLETA | busca todos contacts em memória sem paginação |
| useRateLimitConfigs.ts | COMPLETA | `action` hardcoded `'block'`; DELETE+INSERT sem transação; não é hook React |
| useRealtimeDashboard.ts | COMPLETA | — |
| useRealtimeManagement.ts | COMPLETA | — |
| useRealtimeMessages.ts | COMPLETA | heurística `from_me` para derivar `sender` |
| useRealtimeMonitor.ts | COMPLETA | — |
| useRealtimeSentimentAlerts.ts | COMPLETA | — |
| useReauthentication.ts | COMPLETA | — |
| useRetryAndErrorPrevention.ts | COMPLETA | — |

---

## 9. Achados

### A1 — STUB ativo com consumidor real: useLatestAnalysis retorna null permanentemente
`useLatestAnalysis.ts:18` — `queryFn` retorna `null` incondicionalmente. `AnalysisBadges.tsx` depende desta função; a UI fica em estado vazio permanente. GAP-6 documentado no cabeçalho mas RPC nunca implementada.

### A2 — DELETE + INSERT sem transação em useRateLimitConfigs
`useRateLimitConfigs.ts:41` — `saveRateLimitConfigs` executa DELETE seguido de INSERT sem transação atômica. Falha no INSERT deixa a tabela `rate_limit_configs` vazia até próxima chamada manual. Risco de perda de dados de configuração em produção.

### A3 — DELETE direto do cliente em useQueryTelemetry (risco RLS)
`useQueryTelemetry.ts:96` — `supabase.from('query_telemetry').delete().lt(...)` executado diretamente do frontend sem RPC intermediária. Se a política RLS permitir deleção por `authenticated`, qualquer usuário logado pode apagar logs de auditoria de outros usuários.

### A4 — Bucket errado em useKnowledgeBase
`useKnowledgeBase.ts:144,159` — upload e signed URLs de arquivos da Knowledge Base usam bucket `whatsapp-media` em vez de bucket dedicado. Risco de colisão de artefatos, falha de MIME policy e acesso público indevido (bucket `whatsapp-media` é público).

### A5 — agentPerformance hardcoded `[]` em useQueueAnalytics
`useQueueAnalytics.ts:agentPerformance` — retorna `[] as Array<{name:string; agendamentos:number}>` permanentemente. `QueueCharts.tsx` e `pages/QueueDetails.tsx` dependem desta métrica; gráfico de performance de agentes nunca renderiza dados reais.

### A6 — dateRange descartado silenciosamente em useQueuesComparisonManagement
`useQueueManagement.ts` — parâmetro `_params` (underscore) indica que `dateRange` recebido é descartado; queries em `queue_analytics` não filtram por período. Relatórios de comparação de filas ignoram o intervalo de datas selecionado pelo usuário — bug silencioso.

### A7 — campo `action` hardcoded como `'block'` em useRateLimitConfigs
`useRateLimitConfigs.ts:26` — campo `action` fixo como `'block'` em `fetchRateLimitConfigs` em vez de ler o valor do banco. UI sempre exibe `'block'` independente do valor real salvo, mascarando configurações reais.

### A8 — Seis arquivos com prefixo `use` que não são hooks React
`useNumberReputation.ts`, `usePaymentLinks.ts`, `usePeriodComparison.ts`, `useProfileAvatarMutations.ts`, `useQrAttemptHistory.ts`, `useRateLimitConfigs.ts` — exportam funções `async` puras sem estado React (`useState`/`useEffect`/`useQuery` ausentes). Nomenclatura viola a convenção de hooks, engana linters (eslint-plugin-react-hooks) e pode levar ao uso incorreto em contextos não-React.

### A9 — useIntegrationManagement: possível dead code (ORFÃO VERIFICAR)
`useIntegrationManagement.ts:1` — módulo consolidado de ETAPA 42 com 5 sub-hooks exportados (`useEvolutionApiManagement`, `useGmailOAuthFlowManagement` etc.) mas zero importadores fora de `src/hooks/`. Os consumidores reais acessam as implementações separadas diretamente. Candidato a remoção após confirmar que nenhum import dinâmico o referencia.

### A10 — Bucket `whatsapp-media` público acessível via signed URL de KB
Achado derivado de A4: `whatsapp-media` é configurado como público (`BUG-MEDIA-20260806`). Arquivos da Knowledge Base enviados via `useKnowledgeBase` ficam acessíveis publicamente sem signed URL, podendo expor conteúdo sensível da KB.

### A11 — TODO DASHBOARD-08: canais de notificação configurados mas sem executor
`useNotificationChannels.ts:8-16` — TODO explícito: executor de envio ausente. Salvar canal/template configurado via `NotificationChannelsAdmin` não produz efeito real de envio. Feature parcialmente entregue.

### A12 — usePersonalStickers: padrão `as never` suprime tipagem da tabela `stickers`
`usePersonalStickers.ts:51,92,122,153,170` — 5 chamadas a `.from(STICKERS_TABLE as never)` e updates com cast idêntico. Tabela `stickers` existe no schema `zapp` mas o cast evita a checagem de tipo. Erros de schema divergente ficam silenciados em runtime.

*Runtime: NAO_VERIFICADO - nenhuma execução real foi realizada durante esta análise.*
