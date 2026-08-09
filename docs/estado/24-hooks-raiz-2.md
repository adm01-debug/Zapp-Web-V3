# Estado: hooks/raiz — chunk 2/4 (useContactData → useIncomingCallListener)

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 59/59

## 1. Visao Geral

Segundo chunk da raiz de `src/hooks/`. Cobre 59 arquivos com escopo que vai de hooks de contato/conversa até hooks de Gmail, metas e grupos. O padrão dominante é de **consolidação incompleta**: existem shims de re-export (4 no grupo 1, 3 no grupo 2) que apontam para módulos consolidados de ETAPAs anteriores, coexistindo com implementações legadas que ainda são amplamente usadas. Os hooks de email são o caso mais crítico — dois conjuntos paralelos (`useEmail.ts` + `useEmailManagement.ts`) com 13 e 8 importadores respectivos, ambos em uso simultâneo.

### Tabela de Arquivos

| arquivo | linhas | o que faz | status_uso | impl | o que falta |
|---------|--------|-----------|-----------|------|-------------|
| useContactData.ts | 47 | Busca contato por UUID via react-query | EM_USO | COMPLETA | — |
| useContactEnrichedData.ts | 10 | Re-export do hook em features/contacts | EM_USO | COMPLETA | — |
| useContactIntelligence.ts | 395 | Briefing/triggers/rapport/churn/DISC de contact_intelligence | EM_USO | COMPLETA | — |
| useContactNotes.ts | 4 | Re-export do hook em features/contacts | EM_USO | COMPLETA | — |
| useContactTyping.ts | 2 | Re-export do hook em features/contacts | EM_USO | COMPLETA | — |
| useContactsSearch.ts | 2 | Re-export do hook em features/contacts | EM_USO | COMPLETA | — |
| useConversationHeatmap.ts | 12 | Função async (não hook React) — timestamps de mensagens para heatmap | EM_USO | COMPLETA | Renomear para service |
| useConversationManagement.ts | 597 | 3 hooks: pin/favorite/snooze, análises, SLA timeline | EM_USO | COMPLETA | — |
| useCronScheduler.ts | 73 | Gerencia pg_cron jobs via RPCs | EM_USO | COMPLETA | — |
| useCurrentModule.ts | 31 | Resolve módulo ativo a partir do viewId | EM_USO | COMPLETA | — |
| useCustomShortcuts.ts | 10 | Shim → useKeyboardManagement (ETAPA 30) | EM_USO | COMPLETA | — |
| useDashboardData.ts | 177 | 3 queries de dashboard (profiles/contacts/queues) | EM_USO | COMPLETA | resolvedToday sempre 0 |
| useDashboardDataBatch.ts | 154 | Drop-in replacement via RPC única rpc_dashboard_init | **ORFAO** | COMPLETA | Nenhum importador; RPC pode não existir |
| useDashboardWidgets.ts | 9 | Shim → useDashboardVisualizationManagement (ETAPA 46) | EM_USO | COMPLETA | — |
| useDebounce.test.ts | 57 | Testes vitest de useDebounce | EM_USO (test) | COMPLETA | — |
| useDebounce.ts | 77 | Debounce de callback + useDebouncedValue com leading edge | EM_USO | COMPLETA | — |
| useDeliveryStats.ts | 289 | Estatísticas de entrega WA (sent/delivered/read) com timeline | EM_USO | COMPLETA | Modo simulação acoplado (localStorage) |
| useDemandPrediction.ts | 94 | Previsão de demanda por mensagens dos últimos 7 dias | EM_USO | COMPLETA | Modelo trivial (sem ML real) |
| useDensity.ts | 38 | Gerencia modo de densidade UI (comfortable/compact/dense) | EM_USO | COMPLETA | — |
| useDeviceDetection.ts | 9 | Shim → useDeviceDetectionManagement (ETAPA 32) | EM_USO | COMPLETA | — |
| useDocumentTitle.ts | 12 | Atualiza document.title com restore no unmount | EM_USO | COMPLETA | — |
| useDownloadPermission.ts | 30 | Consulta profiles.can_download do usuário logado | EM_USO | COMPLETA | — |
| useEmail.ts | 802 | Hook monolítico de email (LEGADO) — contas, threads, OAuth, Realtime | EM_USO | COMPLETA | Substituição por useEmailManagement |
| useEmailActions.test.ts | 123 | Testes de markAsRead/starThread/archiveThread/assignThread | EM_USO (test) | COMPLETA | — |
| useEmailDraft.test.ts | 127 | Testes de useEmailDraft com auto-save/discard | EM_USO (test) | COMPLETA | — |
| useEmailDraft.ts | 125 | Draft de email com auto-save 30s — LEGADO | EM_USO | COMPLETA | Substituição por useEmailManagement.useEmailDraft |
| useEmailManagement.ts | 1335 | Consolidação de 5 hooks de email (useEmail, useEmailDraft, useEmailSearch, SLA, signature) | EM_USO | COMPLETA | useEmailSLA sem testes; queryClient declarado não usado |
| useEmailSearch.ts | 191 | Busca dual local+remota com debounce 350ms — LEGADO | EM_USO | COMPLETA | Substituição por useEmailManagement.useEmailSearch |
| useEmailTemplates.ts | 172 | CRUD completo para email_templates | EM_USO | COMPLETA | — |
| useEvolutionApi.ts | 10 | Re-export de useEvolutionApiManagement + tipos | EM_USO | COMPLETA | — |
| useEvolutionApiLogs.ts | 94 | Consulta métricas de retry da Evolution API | EM_USO | COMPLETA | — |
| useEvolutionApiManagement.ts | 1610 | Orquestrador unificado de 12 hooks da Evolution API via Edge Function | EM_USO | COMPLETA | — |
| useEvolutionAutoReconnect.ts | 413 | Monitor Realtime + loop de reconexão com circuit breaker | EM_USO | COMPLETA | — |
| useEvolutionAutoSync.ts | 116 | Sincroniza instâncias Evolution com whatsapp_connections | EM_USO | COMPLETA | — |
| useEvolutionFallbackStats.ts | 51 | Estatísticas de fallbacks da Evolution (admin-only via RPC) | EM_USO | COMPLETA | — |
| useExportData.ts | 98 | Exportação CSV com proteção anti-injeção de fórmulas | EM_USO | PARCIAL | exportPDF/exportExcel são aliases de CSV |
| useExternalApiManagement.ts | 1430 | 11 hooks consolidados: CRM360, mensagens, catálogo, DB genérico | EM_USO | COMPLETA | — |
| useExternalContact360Batch.ts | 3 | Shim de re-export de useExternalContact360Batch | EM_USO | MORTA | Wrapper dispensável |
| useExternalDB.ts | 270 | Duplicata da Seção 5 de useExternalApiManagement | EM_USO | COMPLETA | — |
| useExternalEvolution.ts | 817 | Versão legada dos hooks de sidebar/mensagens | EM_USO | COMPLETA | Sem mapWithConcurrency, sem backoff adaptativo |
| useFailedAuthMessages.ts | 60 | Lista tentativas de login falhas com filtro de data | EM_USO | COMPLETA | — |
| useFollowupBridge.ts | 122 | Dispara sequência de follow-up via edge function followup-bridge | **ORFAO** | COMPLETA | Nenhum componente usa ainda |
| useForgotPassword.ts | 67 | Solicita redefinição de senha via password_reset_requests | EM_USO | COMPLETA | — |
| useForwardMessage.ts | 176 | Gerencia encaminhamento de mensagens para contatos e grupos WA | EM_USO | COMPLETA | — |
| useGeoBlocking.ts | 155 | CRUD de países na whitelist/blacklist de geo-blocking | EM_USO | COMPLETA | — |
| useGlobalKeyboardShortcuts.ts | 12 | Shim → useKeyboardManagement (ETAPA 30) | EM_USO | COMPLETA | — |
| useGlobalSearchShortcut.ts | 16 | Shim → useSearchManagement (ETAPA 29) | EM_USO | COMPLETA | — |
| useGlobalSettings.ts | 86 | CRUD de global_settings com getSetting/updateSetting | EM_USO | COMPLETA | — |
| useGmailHealth.ts | 52 | Monitora saúde do serviço de email via emailHealthService (poll 30s) | EM_USO | COMPLETA | — |
| useGmailLabels.ts | 198 | CRUD de labels Gmail via email_labels + edge gmail-sync | EM_USO | COMPLETA | — |
| useGmailOAuthFlow.ts | 365 | OAuth2 Gmail: iniciar fluxo, trocar code, refresh, revogar, pub/sub watch | EM_USO | COMPLETA | — |
| useGoalNotifications.ts | 74 | Poll 5min em queue_goals e dispara toast nos limites 50/75/100% | EM_USO | PARCIAL | check.value sempre null — comparação nunca ocorre |
| useGoalsConfig.ts | 76 | CRUD de goals_configurations por perfil (query + upsert) | EM_USO | COMPLETA | — |
| useGoalsDashboard.ts | 32 | Wrapper/re-export de useDashboardVisualizationManagement + utils de cor | EM_USO | COMPLETA | — |
| useGroupsManager.ts | 124 | Gerencia grupos WA: busca, filtro, seleção, sync, broadcast | EM_USO | COMPLETA | — |
| useIPWhitelist.ts | 32 | Utilitários (não hook React) para CRUD de ip_whitelist | EM_USO | COMPLETA | — |
| useImportData.ts | 264 | Wrapper de useImportDataManagement + useImportDataTyped (CSV/Excel → Zod) | EM_USO | COMPLETA | — |
| useInViewport.ts | 71 | IntersectionObserver com margem e sticky delay configuráveis | EM_USO | COMPLETA | — |
| useIncomingCallListener.ts | 102 | Realtime INSERT em zapp.calls filtrando por agent_id, busca contato | EM_USO | COMPLETA | — |

---

## 2. Fluxos Funcionais

### Fluxo de Contato e Conversa
`useContactData` → `contacts` (zapp) | `useContactIntelligence` → `contact_intelligence` + `evolution_messages` (evo) | `useConversationManagement` (3 hooks) → `pinned_conversations`, `favorite_contacts`, `conversation_snoozes`, `conversation_analyses`, RPC `listMessagesLite` | `useConversationHeatmap` → `evolution_messages`

### Fluxo de Dashboard
`useDashboardData` → `profiles`, `contacts`, `queues`, `queue_members` (3 queries separadas) | `useDashboardDataBatch` (ORFÃO) → RPC `rpc_dashboard_init` (substituição planejada, nunca adotada) | `useDashboardWidgets` → `useDashboardVisualizationManagement`

### Fluxo de Email (LEGADO + NOVO em paralelo)
`useEmail.ts` (LEGADO, 802L, 13 importadores) → `email_accounts`, `gmail_threads`, `gmail_messages`, RPCs email, Edge `gmail-sync/oauth/webhook/send`, Realtime `email_app.email_threads` | `useEmailManagement.ts` (NOVO, 1335L, 8 importadores) → mesmo conjunto de tabelas/RPCs | `useEmailSearch.ts` (LEGADO) + versão interna do `useEmailManagement` ambas em uso simultâneo | `useEmailDraft.ts` (LEGADO) + versão interna ambas em uso

### Fluxo de Evolution API
`useEvolutionApi.ts` (barrel) → `useEvolutionApiManagement.ts` (orquestrador) → Edge Function `evolution-api/{action}` | `useEvolutionAutoReconnect` → `whatsapp_connections`, Realtime, Edge `connection-health-check` | `useEvolutionAutoSync` → `whatsapp_connections` | `useEvolutionFallbackStats` → `evolution_fallback_events`, RPC `rpc_evolution_fallback_stats`

### Fluxo de Teclado/Atalhos (shims)
`useCustomShortcuts` → `useGlobalKeyboardShortcuts` → `useKeyboardManagement` (consolidado ETAPA 30) | `useGlobalSearchShortcut` → `useSearchManagement` (consolidado ETAPA 29)

### Fluxo de Gmail OAuth
`useGmailOAuthFlow` → `email_app.email_accounts`, Edge `gmail-oauth`, Realtime `email_accounts_changes` | `useGmailLabels` → `email_labels`, `email_threads`, Edge `gmail-sync` | `useGmailHealth` → `emailHealthService` (polling 30s)

### Fluxo de Metas e Filas
`useGoalNotifications` → `queue_goals` (poll 5min, BUG: valor nunca comparado) | `useGoalsConfig` → `goals_configurations`, `profiles` | `useGoalsDashboard` → `useDashboardVisualizationManagement`

### Fluxo de Follow-up (ORFÃO)
`useFollowupBridge` → Edge Function `followup-bridge` → `evo.evolution_followups` (view zapp) — sem consumidores frontend

---

## 3. Tabelas, RPCs, Canais Realtime e Edge Functions

### Tabelas (schema zapp salvo indicação)
`contacts`, `contact_intelligence`, `pinned_conversations`, `favorite_contacts`, `conversation_snoozes`, `conversation_analyses`, `profiles`, `queues`, `queue_members`, `email_accounts` (email_app), `gmail_threads`, `gmail_messages`, `email_drafts`, `email_threads`, `email_labels`, `email_templates`, `whatsapp_connections`, `evolution_retry_metrics`, `evolution_fallback_events`, `login_attempts`, `password_reset_requests`, `whatsapp_groups`, `geo_blocking_settings`, `allowed_countries`, `blocked_countries`, `global_settings`, `queue_goals`, `goals_configurations`, `ip_whitelist`, `calls`

### Tabelas (schema evo)
`evolution_messages` (acessada via view zapp e diretamente)

### RPCs
`rpc_list_cron_jobs`, `rpc_toggle_cron_job`, `rpc_dashboard_init` (ORFÃO), `rpc_email_token_status`, `rpc_email_mark_thread_read`, `rpc_email_star_thread`, `rpc_email_archive_thread`, `rpc_email_assign_thread`, `fn_log_reconnection_attempt`, `rpc_evolution_fallback_stats`, `rpc_get_contact`, `RPC.getContact360ByPhone`, `RPC.getCompaniesByPhonesBatch`, `RPC.getContacts360Batch`, `RPC.searchContactsAdvanced`, `listMessages`, `listMessagesLite`

### Canais Realtime
`email_app.email_threads` (INSERT/UPDATE/DELETE por activeAccountId) | `email_accounts_changes:*` (email_app) | `whatsapp_connections` UPDATE (zapp, useEvolutionAutoReconnect) | `incoming-calls:*` (zapp.calls, INSERT)

### Edge Functions
`gmail-sync`, `gmail-oauth`, `gmail-webhook`, `gmail-send`, `connection-health-check`, `evolution-api/{action}`, `followup-bridge` (sem consumidor), `promogifts-catalog`

---

## 4. Exports Públicos por Categoria

**Re-exports / Shims (7):** `useContactEnrichedData`, `useContactNotes`, `useContactTyping`, `useContactsSearch`, `useCustomShortcuts`, `useDashboardWidgets`, `useDeviceDetection`, `useGlobalKeyboardShortcuts`, `useGlobalSearchShortcut`, `useExternalContact360Batch`, `useEvolutionApi`, `useGoalsDashboard`

**Hooks de dados via react-query (10+):** `useContactData`, `useContactIntelligence`, `useCronScheduler`, `useDashboardData`, `useDebounce`/`useDebouncedValue`, `useDeliveryStats`, `useDemandPrediction`, `useDownloadPermission`, `useEmailTemplates`, `useEvolutionApiLogs`, `useEvolutionFallbackStats`, `useFailedAuthMessages`, `useGeoBlocking`, `useGlobalSettings`, `useGmailLabels`, `useGoalNotifications`, `useGoalsConfig`

**Hooks de estado local:** `useDensity`, `useInViewport`, `useDocumentTitle`

**Hooks de ação/mutação:** `useConversationManagement` (3 exports), `useExportData`, `useForwardMessage`, `useForgotPassword`, `useGroupsManager`, `useImportData`

**Hooks God-object (múltiplos sub-hooks):** `useConversationManagement` (597L, 3 hooks), `useEmail` (802L, legado), `useEmailManagement` (1335L, 5 hooks), `useEvolutionApiManagement` (1610L, 12 hooks), `useExternalApiManagement` (1430L, 11 hooks), `useExternalEvolution` (817L)

**Não são hooks React:** `useConversationHeatmap` (função async), `useIPWhitelist` (módulo de serviço)

---

## 5. Chama (Saída)

| categoria | imports externos ao diretório |
|-----------|------------------------------|
| Supabase | `@/integrations/supabase/client`, `@/integrations/supabase/safeClient`, `@/integrations/supabase/schema` |
| Datasource | `@/integrations/datasource/db`, `@/integrations/datasource/rpcCatalog` |
| Services | `@/services/api/queryKeys`, `@/services/email/emailHealthService`, `@/services/email/types` |
| Lib | `@/lib/logger`, `@/lib/sanitize`, `@/lib/constants/whatsappInstances`, `@/lib/queryStaleTimes`, `@/lib/supabase-helpers`, `@/lib/silentErrorPrevention`, `@/lib/phoneUtils` |
| Features | `@/features/contacts/hooks/*`, `@/features/dashboard/hooks/useDashboardVisualizationManagement`, `@/features/auth`, `@/features/connections/hooks/parts/*` |
| Hooks internos | `./useAuth`, `./useDownloadPermission`, `./useMountedRef`, `./useMediaManagement`, `./useImportDataManagement`, `./groups/actions`, `./groups/types`, `./gmail/gmailApi`, `./gmail/gmailTypes`, `./email/useEmailSignature` |
| Utils | `@/utils/uuid`, `@/utils/emailMappers`, `@/types/gmail`, `@/types/incomingCall` |
| Externos | `@tanstack/react-query`, `date-fns`, `sonner`, `xlsx`, `zod` |

---

## 6. Chamado Por (Entrada)

| arquivo | quem importa (fora de src/hooks/) | importadores |
|---------|----------------------------------|-------------|
| useContactData | ChatPopup.tsx | 1 |
| useContactEnrichedData | inbox features, useCRMManagement, testes | 8 |
| useContactIntelligence | ContactIntelligencePanel, ChatHeader, useCRMManagement, testes | 5+ |
| useContactNotes | inbox, collaboration, testes | 7 |
| useContactTyping | ChatPanel, ConversationItem, testes | 3 |
| useContactsSearch | useContactsCRUD, useContactsQueries | 3 |
| useConversationHeatmap | ConversationHeatmap.tsx, DemandForecast.tsx | 2 |
| useConversationManagement | ConversationList, ContactDetails, VirtualizedRealtimeList, realtime hook, SLATimelineSection, AIConversationAssistant, testes | 7 |
| useCronScheduler | CronSchedulerPage.tsx | 1 |
| useCurrentModule | ViewRouter.tsx, testes | 2 |
| useCustomShortcuts | KeyboardShortcutsHelp, KeyboardShortcutsDialog, KeyboardShortcutsSettings, defaultShortcuts | 4 |
| useDashboardData | DashboardWidgetRenderer, DashboardView, useDashboardVisualizationManagement | 3 |
| useDashboardDataBatch | **zero** | 0 |
| useDashboardWidgets | DashboardSectionHeader, DashboardView, DashboardWidgetRenderer, ProgressiveDisclosureDashboard | 4 |
| useDebounce | useBusinessLogicManagement, ConversationListSidebar, useGlobalSearchData, command-palette, TeamConversationList, useTeamChatPanel | 6 |
| useDeliveryStats | DeliveryStatsPanel, MessageStatusPanel | 2 |
| useDemandPrediction | DemandPrediction.tsx | 1 |
| useDensity | TicketTabs, ConversationList, ChatHeader, AppearanceSettings, + 5 | 9 |
| useDeviceDetection | DevicesPanel, SecurityOverview | 2 |
| useDocumentTitle | ViewRouter.tsx | 1 |
| useDownloadPermission | useExportData, useMediaManagement, ImagePreview, ExportDropdown, testes | 5 |
| useEmail | GmailStatusPanel, GmailInboxView, EmailChatInbox, useGmailHealth, IndexContentConnected, useGmailOAuthFlow, GmailLabelSidebar, useGmailLabels, EmailChatReplyBar, useEmailHealthStatus, EmailTemplatesSettings, EmailTemplatesManager, AdminEmailStatusPage | 13 |
| useEmailDraft | EmailChatReplyBar, gmailApi.ts | 2 |
| useEmailManagement | GmailInboxView, EmailChatReplyBar, EmailChatThread, EmailSLABadge, EmailThreadList, EmailChatBubble, EmailSearchBar, useEmailHealthStatus | 8 |
| useEmailSearch | EmailChatInbox, EmailSearchBar | 2 |
| useEmailTemplates | EmailChatReplyBar, EmailTemplatesSettings, EmailTemplatesManager | 3 |
| useEvolutionApi | ChatPanel, AdvancedMessageMenu, BlockContactDialog, StoryViewer, MessageContextActions, useFileUploadLogic, useReactionMutations, useChatMediaSending, MessageHoverToolbar, EvolutionApiIntegrationView, useConnectionCardActions, useEvolutionAutoSync, useIntegrationManagement, useEvolutionApiLogs, IntegrationsPanel, AdminEvolutionApiLogsPage, InstanceSettingsDialog, IntegrationKeysSection | 18 |
| useEvolutionApiLogs | AdminEvolutionApiLogsPage | 1 |
| useEvolutionApiManagement | useEvolutionAutoReconnect, useIntegrationManagement, useEvolutionApi, supabase/functions/evolution-api | 4 |
| useEvolutionAutoReconnect | RealtimeInboxView, ConnectionsView | 2 |
| useEvolutionAutoSync | phoneUtils, useConnectionsActions, ConnectionsView, IntegrationKeysSection | 4 |
| useEvolutionFallbackStats | EvolutionFallbackStatusCard | 1 |
| useExportData | ExportDropdownPermission.test, useMediaManagement, useExportData.test | 3 |
| useExternalApiManagement | ChatInputArea, ContactHeaderSection, ExternalContact360Panel, ExternalProductCatalog, ContactFormDialog, DataExplorerTable, CRM360StatsCards, AdminCRMDashboard, + 17 | 25+ |
| useExternalContact360Batch | ConversationListSidebar, VirtualizedRealtimeList, ContactsTableVirtual, ContactsTable, ContactGroupedList, ContactContentArea | 6 |
| useExternalDB | ContactFormDialog, CRM360StatsCards, AdminCRMDashboard, CompanyFormDialog, DataExplorerTable | 5 |
| useExternalEvolution | reconciliationTelemetry, externalMessageSender, evolutionReconcile, testes | 4 |
| useFailedAuthMessages | AdminFailedAuthMessagesPage | 1 |
| useFollowupBridge | **zero** | 0 |
| useForgotPassword | ForgotPassword.tsx | 1 |
| useForwardMessage | ForwardMessageDialog.tsx | 1 |
| useGeoBlocking | GeoBlockingPanel.tsx | 1 |
| useGlobalKeyboardShortcuts | useKeyboardManagement, GlobalKeyboardProvider | 2 |
| useGlobalSearchShortcut | RealtimeInboxView, useSearchManagement, testes | 3 |
| useGlobalSettings | whatsappConnectionsCache, useSettingsManagement, GlobalSettingsSection, IntegrationKeysSection, testes | 5 |
| useGmailHealth | GmailStatusPanel, AdminEmailStatusPage, useEmailHealthStatus | 3 |
| useGmailLabels | GmailLabelSidebar | 1 |
| useGmailOAuthFlow | GmailInboxView, EmailChatInbox, GmailAccountSelector, useIntegrationManagement, IndexContentConnected | 5 |
| useGoalNotifications | UnifiedNotificationProviders, useNotificationManagement | 2 |
| useGoalsConfig | GoalsConfigDialog | 1 |
| useGoalsDashboard | useDashboardVisualizationManagement, GoalsDashboard, DashboardFilters, AdvancedReportsView | 4 |
| useGroupsManager | GroupsView | 1 |
| useIPWhitelist | IPWhitelistPanel | 1 |
| useImportData | ContactImportDialog, useMediaManagement, testes | 3 |
| useInViewport | ConversationItem, useConversationDisplay, testes | 3 |
| useIncomingCallListener | App.tsx, inbox/hooks/index.ts, useIncomingCallBroadcast, IncomingCallAlert | 4 |

---

## 7. Orfãos

| arquivo | linhas | veredito | por que |
|---------|--------|---------|---------|
| useDashboardDataBatch.ts | 154 | VERIFICAR | Zero importadores. Criado como drop-in replacement de useDashboardData (3 queries → 1 RPC), mas nunca adotado. A RPC `rpc_dashboard_init` usa cast `supabase as unknown as {rpc:...}` — sinal de que não está nos tipos gerados; pode não existir em produção. Candidato a remoção ou adoção definitiva. |
| useFollowupBridge.ts | 122 | VERIFICAR | Zero importadores fora de src/hooks/. Implementação completa com documentação interna mencionando `evo.evolution_followups`. Edge function `followup-bridge` foi criada mas nenhum componente a aciona. Feature incompleta — verificar se foi abandonada ou aguarda wiring. |

**Nota sobre arquivos de teste orfãos:** `useEmailActions.test.ts` e `useEmailDraft.test.ts` não têm importadores de produção — comportamento esperado para testes. Não são orfãos no sentido do inventário.

---

## 8. Implementacao por Arquivo

| arquivo | status | o que falta |
|---------|--------|-------------|
| useContactData.ts | COMPLETA | — |
| useContactEnrichedData.ts | COMPLETA | — |
| useContactIntelligence.ts | COMPLETA | — |
| useContactNotes.ts | COMPLETA | — |
| useContactTyping.ts | COMPLETA | — |
| useContactsSearch.ts | COMPLETA | — |
| useConversationHeatmap.ts | COMPLETA | Renomear: não é hook React |
| useConversationManagement.ts | COMPLETA | — |
| useCronScheduler.ts | COMPLETA | — |
| useCurrentModule.ts | COMPLETA | — |
| useCustomShortcuts.ts | COMPLETA | — |
| useDashboardData.ts | COMPLETA | resolvedToday hardcoded 0 (sem coluna status em contacts) |
| useDashboardDataBatch.ts | COMPLETA | Adoção ou remoção pendente |
| useDashboardWidgets.ts | COMPLETA | — |
| useDebounce.test.ts | COMPLETA | — |
| useDebounce.ts | COMPLETA | — |
| useDeliveryStats.ts | COMPLETA | Modo simulação acoplado ao hook de produção |
| useDemandPrediction.ts | COMPLETA | Modelo preditivo trivial (sem ML real) |
| useDensity.ts | COMPLETA | — |
| useDeviceDetection.ts | COMPLETA | — |
| useDocumentTitle.ts | COMPLETA | — |
| useDownloadPermission.ts | COMPLETA | — |
| useEmail.ts | COMPLETA | Migração para useEmailManagement pendente |
| useEmailActions.test.ts | COMPLETA | — |
| useEmailDraft.test.ts | COMPLETA | — |
| useEmailDraft.ts | COMPLETA | Migração para useEmailManagement pendente |
| useEmailManagement.ts | COMPLETA | useEmailSLA sem testes; queryClient declarado não usado |
| useEmailSearch.ts | COMPLETA | Migração para useEmailManagement pendente |
| useEmailTemplates.ts | COMPLETA | — |
| useEvolutionApi.ts | COMPLETA | — |
| useEvolutionApiLogs.ts | COMPLETA | — |
| useEvolutionApiManagement.ts | COMPLETA | — |
| useEvolutionAutoReconnect.ts | COMPLETA | — |
| useEvolutionAutoSync.ts | COMPLETA | — |
| useEvolutionFallbackStats.ts | COMPLETA | — |
| useExportData.ts | PARCIAL | exportPDF/exportExcel são aliases de exportCSV |
| useExternalApiManagement.ts | COMPLETA | — |
| useExternalContact360Batch.ts | MORTA | Wrapper de 3 linhas dispensável |
| useExternalDB.ts | COMPLETA | Cache separado dos consumidores de useExternalApiManagement |
| useExternalEvolution.ts | COMPLETA | Sem mapWithConcurrency (usa Promise.all) |
| useFailedAuthMessages.ts | COMPLETA | — |
| useFollowupBridge.ts | COMPLETA | Feature sem consumidor frontend |
| useForgotPassword.ts | COMPLETA | — |
| useForwardMessage.ts | COMPLETA | — |
| useGeoBlocking.ts | COMPLETA | — |
| useGlobalKeyboardShortcuts.ts | COMPLETA | — |
| useGlobalSearchShortcut.ts | COMPLETA | — |
| useGlobalSettings.ts | COMPLETA | — |
| useGmailHealth.ts | COMPLETA | Nome arquivo ≠ nome export (useEmailHealth) |
| useGmailLabels.ts | COMPLETA | Cast defensivo por inconsistência de schema da view |
| useGmailOAuthFlow.ts | COMPLETA | Nome arquivo ≠ nome export (useEmailOAuthFlow) |
| useGoalNotifications.ts | PARCIAL | check.value sempre null — comparação de métricas nunca ocorre |
| useGoalsConfig.ts | COMPLETA | — |
| useGoalsDashboard.ts | COMPLETA | — |
| useGroupsManager.ts | COMPLETA | — |
| useIPWhitelist.ts | COMPLETA | Não é hook React (nome enganoso) |
| useImportData.ts | COMPLETA | — |
| useInViewport.ts | COMPLETA | — |
| useIncomingCallListener.ts | COMPLETA | — |

---

## 9. Achados

### A1 — Duplicação massiva de hooks de email: useEmail.ts × useEmailManagement.ts
`src/hooks/useEmail.ts` (802L) e `src/hooks/useEmailManagement.ts` (1335L) implementam os mesmos hooks (`useEmail`, `useEmailDraft`, `useEmailSearch`) com lógica quase idêntica. O legado ainda recebe 13 importadores; o consolidado 8. A migração foi iniciada mas nunca concluída — risco alto de divergência de comportamento entre componentes que consomem versões diferentes.

### A2 — useGoalNotifications: BUG lógico — métricas nunca são comparadas
`src/hooks/useGoalNotifications.ts`: todos os `check.value` são `null` fixos. O hook emite toasts apenas pela *existência* de limites configurados, nunca pelo valor real do indicador de fila. `NOTIFY_THRESHOLDS` declarado com `@ts-unused-vars`, nunca usado. A feature de notificação de metas está estruturalmente incompleta.

### A3 — useDashboardDataBatch: orfão com RPC possivelmente inexistente
`src/hooks/useDashboardDataBatch.ts`: zero importadores. Usa `supabase as unknown as { rpc: ... }` para contornar tipagem — sinal forte de que `rpc_dashboard_init` não existe nos tipos gerados (e provavelmente não existe no DB de produção). Arquivo de 154 linhas desperdiçado.

### A4 — useExternalDB vs useExternalApiManagement: duplicata de cache ativa
`src/hooks/useExternalDB.ts` e Seção 5 de `src/hooks/useExternalApiManagement.ts` exportam `useExternalSelect`, `useExternalRPC`, `useExternalTableBrowser`, `useExternalMutation`. O primeiro usa query key `['evolution-db', ...]`; o segundo usa `queryKeys.external.db(...)`. Os 5 importadores de `useExternalDB` (todos em `src/components/crm360/`) operam com cache separado — risco de inconsistência de dados exibidos.

### A5 — useEvolutionApiManagement importado por edge function
`supabase/functions/evolution-api/index.ts` importa `src/hooks/useEvolutionApiManagement.ts` — hook React sendo referenciado em uma Edge Function Deno. Import possivelmente de tipos/constantes apenas (sem React runtime), mas é uma fronteira arquitetural perigosa: qualquer hook React adicionado ao módulo quebraria o bundle da edge function.

### A6 — useConversationHeatmap e useIPWhitelist: naming incorreto
`useConversationHeatmap.ts` é função async pura, sem hooks React. `useIPWhitelist.ts` exporta funções de módulo de serviço, sem hooks React. Ambos deveriam estar em `src/services/` ou `src/lib/`. O prefixo `use` implica hook React e enganará consumidores futuros.

### A7 — useDeliveryStats: lógica de simulação acoplada ao hook de produção
`src/hooks/useDeliveryStats.ts`: `queryFn` verifica `localStorage.getItem('zappweb:sla-simulation')` diretamente. Lógica de mock deveria estar isolada fora do hook de produção — risco de estado de simulação vazar inadvertidamente.

### A8 — useGmailHealth e useGmailOAuthFlow: nome de arquivo ≠ nome de export
`useGmailHealth.ts` exporta `useEmailHealth`. `useGmailOAuthFlow.ts` exporta `useEmailOAuthFlow`. Dessincronização entre nome de arquivo e símbolo exportado dificulta buscas e refatorações.

### A9 — useExternalEvolution: Promise.all sem limitação de concorrência
`src/hooks/useExternalEvolution.ts`: enriquecimento de contatos usa `Promise.all` sem `mapWithConcurrency`. Em conversas com muitos contatos novos, pode causar fan-out de requisições simultâneas ao `rpc_get_contact`, potencialmente sobrecarregando o DB.

### A10 — useExportData: PDF e Excel são aliases de CSV (stubs explícitos)
`src/hooks/useExportData.ts`: `exportPDF` e `exportExcel` chamam `exportCSV` internamente. Comentário interno indica consolidação incompleta da ETAPA 40. Features de exportação em formatos ricos não existem.

### A11 — useFollowupBridge: feature completa sem wiring no frontend
`src/hooks/useFollowupBridge.ts` (122L): Edge Function `followup-bridge` existe, código implementado, mas zero componentes disparam `triggerSequence`. Feature de follow-up automático está pronta no backend mas desconectada do UI.

*Runtime: NAO_VERIFICADO - nenhuma execução real foi realizada durante esta análise.*
