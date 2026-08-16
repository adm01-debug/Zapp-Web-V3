# Estado: src/hooks/ — Raiz, Parte 1 (batch 8A)

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 58/58

## 1. Visão Geral

Primeira metade dos hooks soltos na raiz de `src/hooks/` (a-c). Bloco denso: 57 EM_USO, 1 ORFÃO. A grande maioria está ativa em produção. Destaque negativo: vários arquivos com prefixo `use*` não são React hooks (funções async puras — sem `useState`/`useEffect`), e dois mega-hooks superam 400–1230 linhas, pedindo split.

### Tabela de Arquivos
| arquivo | linhas | o que faz | status | impl | o que falta |
|---------|--------|-----------|--------|------|-------------|
| dashboardTypes.ts | 41 | Interfaces TypeScript para filtros/stats/filas/atividade do dashboard | EM_USO | COMPLETA | — |
| evolutionApi.types.ts | 248 | Tipos completos da Evolution API v2 (SendMessage, Group, Poll, Contact) | EM_USO | COMPLETA | — |
| evolutionContactCache.ts | 51 | Cache in-memory de contatos com TTL e cooldown de falha | EM_USO | COMPLETA | — |
| evolutionFetchers.ts | 183 | Helpers de fetch para `evolution_messages` com constantes de polling | EM_USO | COMPLETA | — |
| evolutionReconcile.ts | 218 | Reconciliação optimistic→canonical de mensagens com telemetria | EM_USO | COMPLETA | — |
| use-mobile.tsx | 20 | Detecta breakpoint mobile via matchMedia | EM_USO | COMPLETA | — |
| use-toast.ts | 109 | Wrapper legado→Sonner com normalização de variante | EM_USO | COMPLETA | — |
| useACLAlerts.ts | 75 | Busca + realtime de `security_acl_alerts` | EM_USO | COMPLETA | — |
| useAIAutoTags.ts | 69 | Stats de tags IA + mutação para retag de contatos recentes | EM_USO | COMPLETA | — |
| useAIProviderHealth.ts | 35 | Busca logs `ai_usage_logs` com polling 30s | EM_USO | COMPLETA | — |
| useAbandonmentRateData.ts | 11 | Helper async (não hook) para cálculo de taxa de abandono | EM_USO | COMPLETA | — |
| useActionFeedback.ts | 284 | Hook de feedback tipado (success/error/warning/info/loading/undo) | EM_USO | COMPLETA | — |
| useActiveDepartments.ts | 20 | Lista departamentos ativos via React Query | EM_USO | COMPLETA | — |
| useActiveProfiles.ts | 39 | Busca perfis ativos (não é hook React — função async com cache module-level) | EM_USO | COMPLETA | — |
| useAdminInboxSync.ts | 254 | Dashboard de saúde do sync da inbox admin com polling | EM_USO | COMPLETA | — |
| useAgentPerformanceRanking.ts | 85 | Ranking de agentes por XP/nível/streak | EM_USO | COMPLETA | — |
| useAlertManagement.ts | 486 | Consolidado: war room, sentiment, webhook health (realtime + queries) | EM_USO | COMPLETA | — |
| useAmbientColor.ts | 12 | Re-export de `useAmbientColorManagement` (shim pós-ETAPA 31) | EM_USO | COMPLETA | — |
| useAnalyticsManagement.ts | 202 | Consolidado analytics: perf snapshots, erros, tentativas de mensagem | EM_USO | COMPLETA | — |
| useAppBootstrap.ts | 151 | Chama RPC `rpc_app_bootstrap` substituindo 6+ queries no boot | EM_USO | COMPLETA | — |
| useAriaAnnouncer.ts | 15 | Re-export de `useAriaAnnouncerManagement` (shim pós-ETAPA 32) | EM_USO | COMPLETA | — |
| useAudioManagement.ts | 1230 | Mega-hook: memes de áudio (CRUD, favoritos, realtime), upload, playback, PTT | EM_USO | COMPLETA | — |
| useAudioMemesMutations.ts | 15 | Insert direto em `audio_memes` (sem React Query mutation) | EM_USO | COMPLETA | — |
| useAudioRecorder.ts | 429 | Gravação de áudio (MediaRecorder, Web Speech API, upload, STT) | EM_USO | COMPLETA | — |
| useAuditLogsDashboard.ts | 29 | Busca `audit_logs` com filtros de ação/entidade | EM_USO | COMPLETA | — |
| useAuth.ts | 4 | Re-export de useAuth e AuthProvider de `@/features/auth` | EM_USO | COMPLETA | — |
| useAutomationLogs.ts | 129 | Lista execuções de automação paginadas com filtros + realtime | EM_USO | COMPLETA | — |
| useAutomationManagement.ts | 685 | Mega-hook: avalia regras, sugestões, auto-close, CRUD de automações | EM_USO | COMPLETA | — |
| useAutomationSuggestions.ts | 168 | Sugestões de automação pendentes para contato + realtime | EM_USO | COMPLETA | — |
| useAutomations.ts | 355 | Avalia regras ativas por polling e insere execuções pendentes | EM_USO | COMPLETA | — |
| useBackendDiagnostics.ts | 106 | Pinga REST/Auth/DB do Supabase e expõe latência/sessão | EM_USO | COMPLETA | — |
| useBitrixApi.ts | 100 | Operações Bitrix24 (leads/contacts/deals/calls/sync) via edge function | EM_USO | COMPLETA | — |
| useBlockedIPMutations.ts | 17 | Insert/delete em `blocked_ips` | EM_USO | COMPLETA | — |
| useBlockedIPs.ts | 11 | Busca lista de IPs bloqueados | EM_USO | COMPLETA | — |
| useBridgeStatus.ts | 363 | Saúde do bridge WhatsApp: pings, alertas, incidentes, uptime, realtime | EM_USO | COMPLETA | — |
| useBulkActions.ts | 200 | Gerencia seleção e ações em massa sobre qualquer tabela | **ORFÃO** | COMPLETA | — |
| useBusinessHoursManagement.ts | 197 | CRUD de horários comerciais e mensagem de ausência por conexão WA | EM_USO | COMPLETA | — |
| useCRMManagement.ts | 438 | Consolida 5 sub-hooks CRM (intelligence, notes, enriched, assignment, custom fields) | EM_USO | COMPLETA | — |
| useCSAT.ts | 122 | Query de pesquisas CSAT por período + stats + mutação de envio | EM_USO | COMPLETA | — |
| useCSATAutoConfig.ts | 104 | CRUD da config de envio automático CSAT | EM_USO | PARCIAL | Produtor ausente: nenhuma edge fn lê `csat_auto_config` para disparar envio |
| useCallsHistory.ts | 32 | Busca histórico de chamadas VoIP (top 50) | EM_USO | COMPLETA | — |
| useCampaignEditor.ts | 308 | Estado do formulário de edição de campanha TalkX (variáveis, templates, mídia) | EM_USO | COMPLETA | — |
| useCampaigns.ts | 139 | CRUD de campanhas clássicas | EM_USO | PARCIAL | RLS UPDATE/DELETE ausente → 403; edge `campanha-send` inexistente |
| useChannelConnections.ts | 10 | Função async (não hook) que busca conexões via view `channel_connections_safe` | EM_USO | COMPLETA | — |
| useChatSearch.ts | 2 | Re-export barrel de `@/features/inbox/hooks/useChatSearch` | EM_USO | COMPLETA | — |
| useChatbotFlows.ts | 163 | CRUD de fluxos de chatbot (nodes, edges, ativação) | EM_USO | COMPLETA | — |
| useChatbotL1Config.ts | 94 | Configura/cria fluxo AI-L1 e conta artigos KB publicados | EM_USO | COMPLETA | — |
| useClientWallet.ts | 151 | CRUD de regras de carteira de clientes (agente + conexão WA por prioridade) | EM_USO | COMPLETA | — |
| useConnectionAlertPreferences.ts | 39 | CRUD de prefs de alerta por usuário (não é hook React) | EM_USO | COMPLETA | — |
| useConnectionAlertsPush.ts | 61 | Escuta INSERT em `app_notifications` e dispara push do navegador | EM_USO | COMPLETA | — |
| useConnectionAuditLogs.ts | 19 | Busca `audit_logs` filtrados por instance_id (não é hook React) | EM_USO | COMPLETA | — |
| useConnectionHealthLogs.ts | 60 | Busca `connection_health_logs` + metadata (não é hook React) | EM_USO | COMPLETA | — |
| useConnectionManagement.ts | 335 | Consolidado: re-implementa alertsPush + queues + pool monitor | EM_USO | COMPLETA | — |
| useConnectionStatusIndicator.ts | 285 | Indicador de status de conexão no layout: fetch, realtime, reconexão | EM_USO | COMPLETA | — |
| useConnections.ts | 380 | Gerenciamento central de conexões Supabase: config URL, admin role, reconexão | EM_USO | COMPLETA | — |
| useConnectionsHealth.ts | 30 | Saúde de conexões via `channel_connections_safe` com polling 30s | EM_USO | COMPLETA | — |
| useContactAssignment.ts | 7 | Thin re-export de `useContactAssignmentManagement` via useCRMManagement | EM_USO | COMPLETA | — |
| useContactCustomFields.ts | 83 | CRUD de campos customizados de contato (fetch/upsert/delete) | EM_USO | COMPLETA | — |

---

## 2. Fluxos funcionais

### Autenticação e sessão
`useAuth.ts` (re-export) → `@/features/auth/hooks/useAuth` → `auth.*` tables

### Bootstrap da aplicação
`useAppBootstrap.ts` → RPC `rpc_app_bootstrap` (substitui 6+ queries) → `IndexContentConnected.tsx`

### Mensagens Evolution / WhatsApp
`evolutionFetchers.ts` → `evolution_messages` (evo schema)
`evolutionReconcile.ts` → reconciliação optimistic→canonical + telemetria
`evolutionContactCache.ts` → cache in-memory TTL de contatos

### Áudio e mídia
`useAudioManagement.ts` (1230 linhas) → `audio_memes`, `audio-memes` bucket, `audio-messages` bucket → edge fns `speech-to-text`, `classify-audio`
`useAudioRecorder.ts` → MediaRecorder API → edge fn `speech-to-text`
`useAudioMemesMutations.ts` → insert direto em `audio_memes`

### Automações
`useAutomations.ts` + `useAutomationSuggestions.ts` ← englobados por `useAutomationManagement.ts` (685 linhas)
→ `automation_rules`, `automation_executions` → edge fn `automation-suggest-reply`
`useAutomationLogs.ts` → `automation_executions` (paginado + realtime)

### Alertas e monitoramento
`useAlertManagement.ts` → `warroom_alerts`, `sentiment_alerts`, `webhook_health_checks`
`useBridgeStatus.ts` → `system_health_incidents`, `v_connection_uptime`, `v_alerts_active`
`useACLAlerts.ts` → `security_acl_alerts` (realtime)

### Conexões WhatsApp
`useConnections.ts` → `whatsapp_connections`, `user_roles`
`useConnectionManagement.ts` → `app_notifications` (realtime), `whatsapp_connection_queues`
`useConnectionStatusIndicator.ts` → `whatsapp_connections` (realtime) + edge fn `evolution-api`
`useConnectionsHealth.ts` → `channel_connections_safe` (view)

### CRM e Contatos
`useCRMManagement.ts` → `contact_intelligence`, `contact_notes`, `contact_assignments`, `contact_custom_fields` → RPC `enrich_contact`
`useContactAssignment.ts` → thin shim para useCRMManagement
`useContactCustomFields.ts` → `contact_custom_fields`

### Campanhas / TalkX
`useCampaigns.ts` → `campaigns` (RLS UPDATE/DELETE ausente → bug ativo)
`useCampaignEditor.ts` → formulário de campanha TalkX + `useTalkX`

### Segurança e IPs bloqueados
`useBlockedIPs.ts` + `useBlockedIPMutations.ts` → `blocked_ips`
`useACLAlerts.ts` → `security_acl_alerts`

---

## 3. Tabelas, RPCs, canais realtime e edge functions

### Tabelas (schema `zapp` salvo indicação)
`security_acl_alerts`, `ai_conversation_tags`, `ai_usage_logs`, `departments`, `profiles`, `evolution_messages` (evo), `failed_messages`, `audit_logs`, `warroom_alerts`, `conversation_sla`, `webhook_health_checks`, `sentiment_alerts`, `agent_stats`, `performance_snapshots`, `message_attempts`, `audio_memes`, `automation_executions`, `automation_rules`, `auto_close_config`, `blocked_ips`, `contacts`/`contatos`, `provider_message_log`, `system_health_incidents`, `business_hours`, `away_messages`, `contact_intelligence`, `contact_notes`, `contact_assignments`, `contact_custom_fields`, `csat_surveys`, `csat_auto_config`, `whatsapp_connections`, `calls`, `campaigns`, `chatbot_flows`, `knowledge_base_articles`, `client_wallet_rules`, `connection_alert_preferences`, `connection_health_logs`, `whatsapp_connection_queues`, `app_notifications`

### Views
`channel_connections_safe`, `v_alerts_active`, `v_connection_uptime`

### Storage buckets
`audio-memes`, `audio-messages`

### RPCs
`rpc_app_bootstrap`, `rpc_list_messages`, `rpc_get_contact`, `rpc_upsert_contact`, `rpc_record_automation_error`, `rpc_insert_message`, `enrich_contact`, `is_within_business_hours`, `add_contacts_to_campaign`, `fn_increment_meme_use`, `fn_toggle_user_meme_favorite`

### Canais Realtime
| canal | tabela | evento | schema |
|-------|--------|--------|--------|
| `security_acl_alerts:*` | security_acl_alerts | INSERT+UPDATE | zapp |
| `warroom-alerts-management:*` | warroom_alerts | * | zapp |
| `realtime-sentiment-alerts-*` | sentiment_alerts | * | zapp |
| `audio-memes-catalog:*` | audio_memes | * | zapp |
| `audio-memes-favorites:*` | audio_memes | * | zapp |
| `automation-executions-audit:*` | automation_executions | * | zapp |
| `automation-exec-{id}:*` | automation_executions | * | zapp |
| `automation-suggestions-{id}:*` | automation_executions | * | zapp |
| `traffic-changes:*` | provider_message_log | INSERT | zapp |
| `health-incidents:*` | system_health_incidents | * | zapp |
| `app_notifications` | app_notifications | INSERT | zapp |
| `whatsapp_connections` | whatsapp_connections | * | zapp |

### Edge Functions chamadas
`autoTag` (via ai-router), `sentiment-alert`, `speech-to-text`, `classify-audio`, `automation-suggest-reply`, `bitrix-api`, `evolution-api`

---

## 4. Exports Públicos por categoria

**Tipos puros**: `dashboardTypes.ts`, `evolutionApi.types.ts`

**Cache utilitário**: `evolutionContactCache.ts`

**Helpers de fetch/reconciliação (não hooks)**: `evolutionFetchers.ts`, `evolutionReconcile.ts`, `useAbandonmentRateData.ts`, `useActiveProfiles.ts`, `useChannelConnections.ts`, `useConnectionAlertPreferences.ts`, `useConnectionAuditLogs.ts`, `useConnectionHealthLogs.ts`

**Re-exports / barris**: `useAuth.ts`, `useAmbientColor.ts`, `useAriaAnnouncer.ts`, `useChatSearch.ts`, `useContactAssignment.ts`

**Hooks React simples**: `use-mobile.tsx`, `use-toast.ts`, `useACLAlerts.ts`, `useAIAutoTags.ts`, `useAIProviderHealth.ts`, `useActiveDepartments.ts`, `useAgentPerformanceRanking.ts`, `useAuditLogsDashboard.ts`, `useBlockedIPs.ts`, `useBlockedIPMutations.ts`, `useAudioMemesMutations.ts`, `useCallsHistory.ts`, `useConnectionsHealth.ts`, `useContactCustomFields.ts`

**Hooks compostos / mega-hooks**: `useActionFeedback.ts`, `useAdminInboxSync.ts`, `useAlertManagement.ts`, `useAnalyticsManagement.ts`, `useAppBootstrap.ts`, `useAudioManagement.ts`, `useAudioRecorder.ts`, `useAutomationLogs.ts`, `useAutomationManagement.ts`, `useAutomationSuggestions.ts`, `useAutomations.ts`, `useBackendDiagnostics.ts`, `useBitrixApi.ts`, `useBridgeStatus.ts`, `useBusinessHoursManagement.ts`, `useCRMManagement.ts`, `useCSAT.ts`, `useCSATAutoConfig.ts`, `useCampaignEditor.ts`, `useCampaigns.ts`, `useChatbotFlows.ts`, `useChatbotL1Config.ts`, `useClientWallet.ts`, `useConnectionAlertsPush.ts`, `useConnectionManagement.ts`, `useConnectionStatusIndicator.ts`, `useConnections.ts`

**Orfão**: `useBulkActions.ts`

---

## 5. Chama (Saída)

| dependência externa | quem usa |
|--------------------|----------|
| `@tanstack/react-query` | maioria dos hooks |
| `@/integrations/supabase/client` | maioria dos hooks |
| `@/integrations/supabase/safeClient` | useAlertManagement, useAutomationManagement, useAutomations, useBridgeStatus, useConnectionManagement, useConnections |
| `@/integrations/supabase/connectionPool` | useConnectionManagement |
| `@/integrations/supabase/ai-router` | useAIAutoTags |
| `@/integrations/supabase/schema` | useAutomationManagement, useCSATAutoConfig, useCampaigns, useChatbotFlows, useCRMManagement, useContactCustomFields |
| `@/features/auth` | useAuth, useAnalyticsManagement, useCSATAutoConfig, useChatbotL1Config |
| `@/features/inbox/hooks/realtime/*` | evolutionReconcile |
| `@/features/connections/data-access/*` | useBridgeStatus |
| `@/services/api/queryKeys` | vários hooks |
| `@/lib/logger` | vários hooks |
| `@/lib/constants/whatsappInstances` | evolutionFetchers, useAutomationManagement, useAutomations |
| `@/lib/audio/pttLimits` | useAudioManagement, useAudioRecorder |
| `@/lib/evolutionDiagnostics` | useBridgeStatus |
| `@/lib/evolutionInstance` | useConnectionStatusIndicator |
| `@/components/layout/connectionStatusStorage` | useConnectionStatusIndicator |
| `@/pages/admin/*Helpers` | useAutomationLogs, useAdminInboxSync |
| `@/hooks/useTalkX` | useCampaignEditor |
| `@/hooks/useMountedRef` | useBridgeStatus |
| `@/hooks/useNotificationManagement` | useAlertManagement |
| `sonner` | use-toast, useAutomationManagement, useCampaigns, useChatbotFlows, useBulkActions, useConnectionStatusIndicator |

---

## 6. Chamado Por (Entrada)

| arquivo | importadores (exemplos) | contagem |
|---------|------------------------|----------|
| dashboardTypes.ts | useDashboardDataBatch, useDashboardData, useDashboardVisualizationManagement | 3 |
| evolutionApi.types.ts | useEvolutionApi, useEvolutionApiManagement | 2 |
| evolutionContactCache.ts | useExternalApiManagement | 1 |
| evolutionFetchers.ts | useFallbackContact, useExternalApiManagement | 2 |
| evolutionReconcile.ts | useExternalApiManagement, tests | 2 |
| use-mobile.tsx | TicketTabsFilters, ContactDetailsResponsive, useChatInputLogic, ChatPanelHeader, RealtimeInboxView | 5+ |
| use-toast.ts | useBusinessLogicManagement, useAudioMessagePlayer, ChatPanel, ScheduleMessageDialog | 5+ |
| useACLAlerts.ts | AdminACLAlertsPage | 1 |
| useAIAutoTags.ts | AIAutoTagsConfig | 1 |
| useAIProviderHealth.ts | AIProviderHealthPanel | 1 |
| useAbandonmentRateData.ts | AbandonmentRate | 1 |
| useActionFeedback.ts | useContactsCRUD, AvatarUpload, groups/actions | 4+ |
| useActiveDepartments.ts | NewConversationDialog, TransferConversationDialog | 2 |
| useActiveProfiles.ts | AddMemberDialog | 1 |
| useAdminInboxSync.ts | AdminInboxSyncStatusPage, re-export pages/ | 2 |
| useAgentPerformanceRanking.ts | AgentPerformancePanel | 1 |
| useAlertManagement.ts | useWebhookHealthAlerts | 1 |
| useAmbientColor.ts | useUIManagement, useAmbientColor.test | 2 |
| useAnalyticsManagement.ts | useMessageAttempts, usePerformanceMonitoring | 2 |
| useAppBootstrap.ts | IndexContentConnected | 1 |
| useAriaAnnouncer.ts | RealtimeInboxView, useUIInteractionManagement, ViewRouter | 3 |
| useAudioManagement.ts | AudioMessagePlayer, AudioMemePicker, AudioMemeUploadPreview, useAudioRecorderUI | 5+ |
| useAudioMemesMutations.ts | AIGenerateDialog | 1 |
| useAudioRecorder.ts | AudioRecorder, useAudioRecorderUI, useAudioManagement, storageSignedUrls | 4 |
| useAuditLogsDashboard.ts | AuditLogDashboard | 1 |
| useAuth.ts | ~100 arquivos (auth, hooks, pages, features, tests) | 100+ |
| useAutomationLogs.ts | AdminAutomationLogsPage, re-export pages/ | 2 |
| useAutomationManagement.ts | AutomationSuggestionsBar, AutomationCard, AutomationEditorDialog, AutomationsManager | 5+ |
| useAutomationSuggestions.ts | AutomationSuggestionsBar, useAutomationManagement | 2 |
| useAutomations.ts | ChatPanel, AutomationsManager, useAutomationManagement | 3 |
| useBackendDiagnostics.ts | BackendDiagnostics page | 1 |
| useBitrixApi.ts | BitrixIntegrationView, useIntegrationManagement | 2+ |
| useBlockedIPMutations.ts | BlockedIPDialogs | 1 |
| useBlockedIPs.ts | BlockedIPsPanel | 1 |
| useBridgeStatus.ts | AdminBridgeStatusPage, BridgeCoreServicesCard, BridgeSidebarPanel, BridgeStatusBanner | 4 |
| useBulkActions.ts | apenas testes | 0 produção |
| useBusinessHoursManagement.ts | BusinessHoursBadge, BusinessHoursIndicator, BusinessHoursDialog | 3 |
| useCRMManagement.ts | useContactAssignment, testes | 1+ |
| useCSAT.ts | CSATDashboard, CSATAutoConfig | 2 |
| useCSATAutoConfig.ts | CSATAutoConfig | 1 |
| useCallsHistory.ts | VoIPPanel | 1 |
| useCampaignEditor.ts | TalkXCampaignEditor | 1 |
| useCampaigns.ts | CampaignsView, CampaignCreateDialog | 2 |
| useChannelConnections.ts | OmnichannelInbox | 1 |
| useChatSearch.ts | ChatPanel, ChatSearchBar, useChatSearchState | 3 |
| useChatbotFlows.ts | ChatbotFlowEditor, ChatbotNodeDialogs, ChatbotFlowsView | 3 |
| useChatbotL1Config.ts | ChatbotL1Config | 1 |
| useClientWallet.ts | ClientWalletView | 1 |
| useConnectionAlertPreferences.ts | ConnectionAlertPreferences | 1 |
| useConnectionAlertsPush.ts | IndexContentConnected, useConnectionManagement | 2 |
| useConnectionAuditLogs.ts | ConnectionAuditDialog | 1 |
| useConnectionHealthLogs.ts | MonitoringEventTimeline, ConnectionHealthPanel | 2 |
| useConnectionManagement.ts | ConnectionQueuesDialog, testes | 1+ |
| useConnectionStatusIndicator.ts | ConnectionStatusIndicator | 1 |
| useConnections.ts | 22 arquivos (features/connections/hooks, tests, index.ts) | 22 |
| useConnectionsHealth.ts | ConnectionsHealthBlock | 1 |
| useContactAssignment.ts | AssignmentSection, features/contacts/index.ts | 2 |
| useContactCustomFields.ts | CustomFieldsSection, features/contacts/index.ts | 2 |

---

## 7. Órfãos

| arquivo | linhas | importadores fora do diretório | risco | veredito |
|---------|--------|-------------------------------|-------|---------|
| useBulkActions.ts | 200 | apenas testes (`contratoF4.simulacao.test.tsx`, `useBulkActions.test.tsx`) | ALTO | VERIFICAR |

**useBulkActions.ts** — ORFÃO de produção. O hook aceita `tableName: string` sem validação e executa `.delete()` diretamente, expondo potencial de deleção arbitrária em qualquer tabela passada como argumento. Como não há UI consumindo o hook, o risco de superfície ativa é zero — mas se for adicionado a uma UI futura sem sanitização do parâmetro, vira injection de operação destrutiva. Recomendação: **VERIFICAR** se o design de ação em massa foi abandonado ou se a implementação migrou para outro arquivo. Se descartado, remover e os testes associados.

---

## 8. Implementação por Arquivo

| arquivo | status | o que falta |
|---------|--------|-------------|
| dashboardTypes.ts | COMPLETA | — |
| evolutionApi.types.ts | COMPLETA | — |
| evolutionContactCache.ts | COMPLETA | — |
| evolutionFetchers.ts | COMPLETA | — |
| evolutionReconcile.ts | COMPLETA | — |
| use-mobile.tsx | COMPLETA | — |
| use-toast.ts | COMPLETA | — |
| useACLAlerts.ts | COMPLETA | — |
| useAIAutoTags.ts | COMPLETA | — |
| useAIProviderHealth.ts | COMPLETA | — |
| useAbandonmentRateData.ts | COMPLETA | — |
| useActionFeedback.ts | COMPLETA | — |
| useActiveDepartments.ts | COMPLETA | — |
| useActiveProfiles.ts | COMPLETA | — |
| useAdminInboxSync.ts | COMPLETA | — |
| useAgentPerformanceRanking.ts | COMPLETA | — |
| useAlertManagement.ts | COMPLETA | — |
| useAmbientColor.ts | COMPLETA | — |
| useAnalyticsManagement.ts | COMPLETA | — |
| useAppBootstrap.ts | COMPLETA | — |
| useAriaAnnouncer.ts | COMPLETA | — |
| useAudioManagement.ts | COMPLETA | — |
| useAudioMemesMutations.ts | COMPLETA | — |
| useAudioRecorder.ts | COMPLETA | — |
| useAuditLogsDashboard.ts | COMPLETA | — |
| useAuth.ts | COMPLETA | — |
| useAutomationLogs.ts | COMPLETA | — |
| useAutomationManagement.ts | COMPLETA | — |
| useAutomationSuggestions.ts | COMPLETA | — |
| useAutomations.ts | COMPLETA | — |
| useBackendDiagnostics.ts | COMPLETA | — |
| useBitrixApi.ts | COMPLETA | — |
| useBlockedIPMutations.ts | COMPLETA | — |
| useBlockedIPs.ts | COMPLETA | — |
| useBridgeStatus.ts | COMPLETA | — |
| useBulkActions.ts | COMPLETA | — |
| useBusinessHoursManagement.ts | COMPLETA | — |
| useCRMManagement.ts | COMPLETA | — |
| useCSAT.ts | COMPLETA | — |
| useCSATAutoConfig.ts | PARCIAL | Nenhuma edge function lê `csat_auto_config` para disparar envio |
| useCallsHistory.ts | COMPLETA | — |
| useCampaignEditor.ts | COMPLETA | — |
| useCampaigns.ts | PARCIAL | RLS UPDATE/DELETE ausente; edge `campanha-send` inexistente |
| useChannelConnections.ts | COMPLETA | — |
| useChatSearch.ts | COMPLETA | — |
| useChatbotFlows.ts | COMPLETA | — |
| useChatbotL1Config.ts | COMPLETA | — |
| useClientWallet.ts | COMPLETA | — |
| useConnectionAlertPreferences.ts | COMPLETA | — |
| useConnectionAlertsPush.ts | COMPLETA | — |
| useConnectionAuditLogs.ts | COMPLETA | — |
| useConnectionHealthLogs.ts | COMPLETA | — |
| useConnectionManagement.ts | COMPLETA | — |
| useConnectionStatusIndicator.ts | COMPLETA | — |
| useConnections.ts | COMPLETA | — |
| useConnectionsHealth.ts | COMPLETA | — |
| useContactAssignment.ts | COMPLETA | — |
| useContactCustomFields.ts | COMPLETA | — |

---

## 9. Achados

### A1 — useBulkActions: orfão com deleção arbitrária por tableName não sanitizado
`src/hooks/useBulkActions.ts` — Aceita `tableName: string` e executa `.delete()` sem validação de qual tabela pode ser alvo. Nenhum componente de produção importa este hook; único uso é em testes. Risco latente: se reconectado a uma UI sem sanitização, permite que o chamador apague registros de qualquer tabela acessível via RLS.

### A2 — useCampaigns: RLS ausente + motor de disparo inexistente
`src/hooks/useCampaigns.ts:13` — `updateCampaign` e `deleteCampaign` falham com 403 (RLS UPDATE/DELETE ausente). O botão "Iniciar" faz update de `status` mas não chama nenhuma edge function — o motor de disparo `campanha-send` não existe no repositório. Feature de campanhas está incompleta em produção.

### A3 — useCSATAutoConfig: configuração sem produtor (TODO DASHBOARD-05)
`src/hooks/useCSATAutoConfig.ts:8-14` — O toggle persiste config em `csat_auto_config` mas nenhuma edge function lê essa tabela para disparar envio automático de CSAT. O comentário interno referencia `TODO DASHBOARD-05`. Feature de disparo automático é silenciosamente inoperante.

### A4 — Cinco arquivos nomeados `use*` não são React hooks
`useActiveProfiles.ts`, `useChannelConnections.ts`, `useConnectionAlertPreferences.ts`, `useConnectionAuditLogs.ts`, `useConnectionHealthLogs.ts` — São funções async puras sem `useState`/`useEffect`. O prefixo `use*` é enganoso e viola as regras de hooks do React (pode causar aviso no linter de hooks se chamados condicionalmente). Deveriam estar em `src/lib/` ou `src/services/`.

### A5 — useAudioManagement: 1230 linhas, mega-hook candidato a split
`src/hooks/useAudioManagement.ts` — Mistura CRUD de memes, upload de storage, playback, PTT, favoritos e 3 edge functions distintas num único hook. Dificuldade de manutenção elevada; qualquer regressão em áudio afeta toda a árvore de responsabilidades.

### A6 — useAutomationManagement duplica useAutomations + useAutomationSuggestions
`src/hooks/useAutomationManagement.ts:190,294,387,523` — Mega-hook de 685 linhas importa e re-implementa internamente os hooks `useAutomations` e `useAutomationSuggestions`. O cast `as unknown as SupabaseClient` é repetido 4 vezes para contornar tipagem do `safeClient`, indicando deficiência no tipo exportado.

### A7 — useConnectionManagement duplica useConnectionAlertsPush
`src/hooks/useConnectionManagement.ts:1-10` — Re-implementa o canal realtime de `app_notifications` e a lógica de push do navegador que já existem em `useConnectionAlertsPush.ts`. `IndexContentConnected` usa o arquivo standalone; `useConnectionManagement` re-implementa internamente. Divergência de lógica em produção é possível.

### A8 — useACLAlerts: canal realtime com sufixo randômico pode vazar
`src/hooks/useACLAlerts.ts:51` — Canal criado com sufixo `Math.random()` a cada montagem. Se o cleanup (`removeChannel`) falhar por qualquer razão (unmount abrupto, erro), canais WebSocket ficam abertos indefinidamente. Pattern visto em outros hooks com bugs de leak reportados.

### A9 — useAIAutoTags acessa `contacts` sem schema explícito
`src/hooks/useAIAutoTags.ts:44` — Query usa `.from('contacts')` sem `.schema()`. O cliente usa `schema: 'zapp'` por padrão, mas a tabela correta no schema `zapp` é `contatos` (com 't'). Se existir view `contacts` em `zapp`, funciona; se não existir, falha silenciosamente ou retorna vazio. Requer verificação no runtime.

### A10 — useConnectionManagement referenciado em migration SQL
`src/hooks/useConnectionManagement.ts` — Nome de arquivo TypeScript aparece dentro do script SQL `20260804000000_canonical_schema_squash`. Incomum e frágil: se o arquivo for renomeado, o SQL não atualiza automaticamente.

### A11 — useBridgeStatus: tabela `provider_message_log` ausente nos tipos TypeScript gerados
`src/hooks/useBridgeStatus.ts:128` — Usa cast forçado `{ from(t: string) }` para acessar `provider_message_log` porque o tipo gerado não reconhece a tabela. Indica que a tabela não foi incluída na geração de tipos ou foi adicionada posteriormente sem regeneração.

### A12 — Shims de re-export acumulando (ETAPAs 31/32)
`useAmbientColor.ts` (12 linhas) e `useAriaAnnouncer.ts` (15 linhas) são wrappers de compatibilidade pós-consolidação. Mantêm importadores existentes funcionando mas adicionam indireção desnecessária se os importadores puderem ser migrados para o import direto.

*Runtime: NAO_VERIFICADO — nenhuma execução real foi realizada durante esta análise.*
