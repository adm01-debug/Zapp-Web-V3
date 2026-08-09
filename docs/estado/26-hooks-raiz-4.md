# Estado: hooks raiz src/hooks/ — chunk 4/4 (arquivos 1–59, letra S-Z)

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 59/59

## 1. Visao Geral

Último bloco da raiz de `src/hooks/`. Cobre os 59 hooks do intervalo S–Z. O padrão dominante é **módulo consolidado + thin-wrapper de re-export**: arquivos como `useSLAMetrics`, `useScreenProtection`, `useSearchInsights`, `useSidebarState`, `useTheme`, `useThemeAudit`, `useTeamChatNotifications`, `useVersions`, `useViewTransition`, `useVoiceAgent`, `useSwipeControl`, `useTeamChat`, `useZenMode` são barris de 1–17 linhas que delegam para módulos consolidados em `src/features/*/hooks/`. Zero orfãos confirmados — todos os 59 têm importadores identificados via grep.

### Tabela de Arquivos

| arquivo | linhas | o que faz em 1 linha | EM_USO/ORFAO |
|---------|--------|----------------------|--------------|
| useSLAMetrics.ts | 2 | Re-export barrel para features/sla/hooks/useSLAMetrics | EM_USO |
| useSLARulesCounts.ts | 31 | Conta campos preenchidos por scope em `sla_rules` | EM_USO |
| useSLAScopeNames.ts | 65 | Resolve nomes de contacts/queues/agents a partir de IDs de regras SLA | EM_USO |
| useScanResponseHandler.ts | 110 | Centraliza UX de resultado de scan de arquivo (toast, retry, bloqueio) | EM_USO |
| useScheduledMessages.ts | 139 | CRUD de mensagens agendadas por contato ou global | EM_USO |
| useScheduledReports.ts | 97 | CRUD de relatórios agendados com pg_cron pendente | EM_USO |
| useScreenProtection.ts | 1 | Re-export barrel para features/auth/hooks/useScreenProtection | EM_USO |
| useSearchHistory.ts | 64 | Histórico de buscas globais em localStorage (add/remove/clear) | EM_USO |
| useSearchInsightRows.ts | 27 | Lista top-50 linhas de search_insights por search_count | EM_USO |
| useSearchInsights.ts | 10 | Re-export de useSearchInsightsManagement de useSearchManagement | EM_USO |
| useSearchManagement.ts | 261 | Módulo consolidado: busca global Ctrl+K, KB, histórico, insights, chat | EM_USO |
| useSecurityAlerts.ts | 23 | Funções utilitárias (não hook React) para buscar/resolver security_alerts | EM_USO |
| useSecurityAuditLogs.ts | 173 | Busca security_audit_logs com Realtime postgres_changes | EM_USO |
| useSecurityPushNotifications.ts | 7 | Re-export de useSecurityPushNotificationsManagement (ETAPA 27) | EM_USO |
| useSentimentAlerts.ts | 90 | Dispara Edge Function sentiment-alert quando score abaixo do limiar | EM_USO |
| useSentimentAnalyses.ts | 61 | Agrega conversation_analyses por dia para gráfico de tendência | EM_USO |
| useServiceWorker.ts | 315 | Limpa caches workbox/zapp legados + coordena reload com buildVersion | EM_USO |
| useSettingsManagement.ts | 417 | Módulo consolidado: user_settings, global_settings, webhook_preferences, onboarding | EM_USO |
| useSidebarState.ts | 26 | Re-export de 3 hooks de sidebar (ETAPA 32) | EM_USO |
| useSpeechToText.ts | 98 | Web Speech API para transcrição de voz em pt-BR | EM_USO |
| useSupabaseConnectivity.ts | 64 | Estado online/offline/backend-down via connectivityMonitor singleton | EM_USO |
| useSwipeControl.ts | 25 | Re-export de useSwipeGestureManagement e useSwipeNavigationManagement | EM_USO |
| useSyncToCRM.ts | 129 | Chama RPC sync_conversation_to_crm (stub P0001 ativo) | EM_USO |
| useTags.ts | 261 | CRUD completo de tags e contact_tags com bulk-assign/remove | EM_USO |
| useTalkX.ts | 316 | Gerencia campanhas TalkX: listar, criar, pausar, retomar, arquivar | EM_USO |
| useTalkXBlacklist.ts | 109 | Blacklist TalkX com join em contacts | EM_USO |
| useTalkXCampaignLive.ts | 26 | Polling de campanha individual a cada 15s | EM_USO |
| useTeamChat.ts | 17 | Re-export barrel dos módulos features/inbox/hooks/team-chat/ | EM_USO |
| useTeamChatDraft.ts | 122 | Rascunho com auto-save localStorage + upload paste-image bucket team-chat-files | EM_USO |
| useTeamChatMembers.ts | 54 | Perfis ativos (profiles) + mutação em team_conversation_members | EM_USO |
| useTeamChatNotifications.ts | 10 | Re-export de useTeamChatNotificationsManagement (ETAPA 27) | EM_USO |
| useTeamMemberDetails.ts | 86 | Perfil de membro em conversa direta/grupo via React Query | EM_USO |
| useTeamPermissions.ts | 51 | Carrega user_roles, permissions e profiles para dialog de permissões | EM_USO |
| useTextToSpeech.ts | 147 | TTS via Web Speech API com controle de voz/velocidade/playback | EM_USO |
| useTheme.ts | 12 | Re-export de useThemeManagement + ThemeSync (ETAPA 31) | EM_USO |
| useThemeAudit.ts | 10 | Re-export de useThemeAuditManagement (ETAPA 31) | EM_USO |
| useTranscriptionNotifications.ts | 80 | Realtime UPDATE em evo.evolution_messages → notifica transcrição finalizada | EM_USO |
| useTypingPresence.ts | 109 | Canal de presença Supabase por conversationId (quem está digitando) | EM_USO |
| useUIInteractionManagement.ts | 722 | Módulo consolidado: swipe, device detection, aria, view transition, sidebar | EM_USO |
| useUIManagement.ts | 396 | Módulo consolidado: theme, zen mode, ambient color, theme audit | EM_USO |
| useUndoableAction.ts | 165 | Ação com janela de undo via toast Sonner (5 s antes de commit) | EM_USO |
| useUniversityHelp.ts | 160 | Respostas IA para chat via Edge Function ai-proxy | EM_USO |
| useUrlFilters.ts | 143 | Persiste filtros de inbox na URL (search params) | EM_USO |
| useUserSecurityAlerts.ts | 22 | Função helper (não hook React) que busca security_alerts do user | EM_USO |
| useUserSettings.ts | 299 | CRUD completo de user_settings (TTS, SLA, sons, horário comercial) | EM_USO |
| useVersions.ts | 2 | Re-export de features/admin/hooks/useVersions | EM_USO |
| useViewTransition.ts | 7 | Re-export de useViewTransitionManagement de useUIInteractionManagement | EM_USO |
| useVoiceActionHandler.ts | 76 | Despacha ações de voz e invoca Edge Function voice-copilot-action | EM_USO |
| useVoiceAgent.ts | 9 | Re-export de useVoiceAgentManagement de useVoiceManagement | EM_USO |
| useVoiceManagement.ts | 230 | Módulo consolidado (ETAPA 35): STT, TTS, ações de voz | EM_USO |
| useWarRoomAlerts.ts | 89 | Realtime INSERT/UPDATE em warroom_alerts + notificações push/som | EM_USO |
| useWarRoomData.ts | 49 | Re-export de useDashboardVisualizationManagement (alerts sempre []) | EM_USO |
| useWebAuthn.ts | 295 | CRUD de passkeys WebAuthn via passkey_credentials + Edge Function webauthn | EM_USO |
| useWebhookHealthAlerts.ts | 42 | Re-export de useAlertManagement; maioria dos campos são stubs vazios | EM_USO |
| useWebhookViewPreferences.ts | 159 | Preferências de visualização de webhook em localStorage | EM_USO |
| useWhatsAppFlows.ts | 90 | CRUD de fluxos WhatsApp via whatsapp_flows | EM_USO |
| useWhatsAppLogs.ts | 85 | Consulta logs WA em 3 tabelas com filtro por modo e busca textual | EM_USO |
| useWhatsAppTemplates.ts | 322 | CRUD de templates WA + sync com Meta via Edge Function evolution-templates | EM_USO |
| useZenMode.ts | 6 | Re-export de useZenModeManagement de useUIManagement | EM_USO |

---

## 2. Fluxos funcionais

### SLA
`useSLAMetrics` (barrel) → `features/sla/hooks/useSLAMetrics` → `safeClient` → `conversation_sla`, `profiles`  
`useSLARulesCounts` → `supabase` → `sla_rules`  
`useSLAScopeNames` → `supabase` → `contacts`, `queues`, `profiles`

### Mensagens agendadas / TalkX
`useScheduledMessages` → `supabase` → `scheduled_messages` (INSERT/UPDATE com RLS ausente — CAMPANHAS-09)  
`useTalkX` → `supabase` → `talkx_campaigns`, `talkx_recipients` (cron talkx-scheduler-check a confirmar)  
`useTalkXBlacklist` → `supabase` → `talkx_blacklist` + join `contacts`  
`useTalkXCampaignLive` → polling 15s → `talkx_campaigns`

### Team Chat
`useTeamChat` (barrel) → `features/inbox/hooks/team-chat/*`  
`useTeamChatDraft` → localStorage + Storage `team-chat-files` (upload paste-image)  
`useTeamChatMembers` → `profiles`, `team_conversation_members`  
`useTeamChatNotifications` (barrel) → `features/inbox/hooks/team-chat/useTeamChatNotificationsManagement`

### Segurança / WebAuthn
`useSecurityAuditLogs` → `security_audit_logs` + Realtime `postgres_changes`  
`useSecurityAlerts` → `security_alerts` (helper, não hook React)  
`useSecurityPushNotifications` (barrel) → features/  
`useWebAuthn` → `passkey_credentials` + Edge Function `webauthn` (registro, autenticação, exclusão)  
`useUserSecurityAlerts` → `security_alerts` (helper, não hook React)

### Voz / STT / TTS
`useVoiceManagement` (consolidado ETAPA 35) ← `useSpeechToText` + `useTextToSpeech` + `useVoiceAgent` + `useVoiceActionHandler`  
`useVoiceAgent` (barrel) → `useVoiceManagement`  
`useVoiceActionHandler` → `supabase` functions → Edge Function `voice-copilot-action`  
`useSpeechToText` → Web Speech API (zero Supabase)  
`useTextToSpeech` → Web Speech API (zero Supabase)

### UI Consolidada
`useUIInteractionManagement` (722 linhas, ETAPA 32) ← `useSwipeControl`, `useViewTransition`, `useSidebarState`, `useDeviceDetection`, `useAriaAnnouncer`  
`useUIManagement` (396 linhas, ETAPA 31) ← `useTheme`, `useThemeAudit`, `useZenMode`, `useAmbientColor`

### Configurações
`useSettingsManagement` (417 linhas, consolidado ETAPA 41) ← `useUserSettings`, `useGlobalSettings`, `useWebhookViewPreferences`, `useOnboardingChecklist`  
`useUserSettings` → `safeClient` → `user_settings`

### WhatsApp
`useWhatsAppTemplates` → `whatsapp_templates` + Edge Function `evolution-templates` (sync Meta)  
`useWhatsAppFlows` → `whatsapp_flows`  
`useWhatsAppLogs` → `provider_message_log`, `whatsapp_cloud_webhook_pings`, `dispatch_error_logs` (via safeClient)

### War Room / Alertas
`useWarRoomAlerts` → `warroom_alerts` + Realtime + push notifications  
`useWarRoomData` (wrapper) → `useDashboardVisualizationManagement` (alerts sempre [])  
`useWebhookHealthAlerts` (wrapper) → `useAlertManagement` (stubs ativos)

---

## 3. Tabelas, RPCs, canais realtime e edge functions

### Tabelas (schema zapp, salvo indicação)
| tabela | hooks |
|--------|-------|
| `sla_rules` | useSLARulesCounts |
| `conversation_sla` | useSLAMetrics (via features/sla) |
| `contacts` | useSLAScopeNames, useTalkXBlacklist |
| `queues` | useSLAScopeNames |
| `profiles` | useSLAScopeNames, useTeamChatMembers, useTeamMemberDetails, useTeamPermissions |
| `scheduled_messages` | useScheduledMessages |
| `scheduled_reports` | useScheduledReports |
| `search_insights` | useSearchInsightRows |
| `search_history` | useSearchManagement (safeClient) |
| `security_alerts` | useSecurityAlerts, useUserSecurityAlerts |
| `security_audit_logs` | useSecurityAuditLogs |
| `audit_logs` | useSentimentAlerts |
| `conversation_analyses` | useSentimentAnalyses |
| `user_settings` | useSettingsManagement, useUserSettings |
| `global_settings` | useSettingsManagement |
| `webhook_preferences` | useSettingsManagement |
| `onboarding_steps` | useSettingsManagement |
| `tags`, `contact_tags` | useTags |
| `talkx_campaigns`, `talkx_recipients` | useTalkX, useTalkXCampaignLive |
| `talkx_blacklist` | useTalkXBlacklist |
| `team_conversation_members` | useTeamChatMembers |
| `user_roles`, `permissions` | useTeamPermissions |
| `user_devices`, `user_sessions` | useUIInteractionManagement |
| `warroom_alerts` | useWarRoomAlerts |
| `passkey_credentials` | useWebAuthn |
| `whatsapp_flows` | useWhatsAppFlows |
| `whatsapp_templates` | useWhatsAppTemplates |
| `provider_message_log` | useWhatsAppLogs |
| `whatsapp_cloud_webhook_pings` | useWhatsAppLogs |
| `dispatch_error_logs` | useWhatsAppLogs |

### Schema evo
| tabela | hook |
|--------|------|
| `evolution_messages` (raiz particionada) | useTranscriptionNotifications (Realtime UPDATE) |

### RPCs
| RPC | hook | status |
|-----|------|--------|
| `sync_conversation_to_crm` | useSyncToCRM | stub ativo (RAISE P0001) |
| `search_knowledge_base` | useSearchManagement | cast `as unknown` — sem tipagem gerada |
| `get_search_insights` | useSearchManagement | cast `as unknown` — sem tipagem gerada |

### Canais Realtime
| canal | hook | evento |
|-------|------|--------|
| `security_audit_logs` (postgres_changes) | useSecurityAuditLogs | INSERT/UPDATE |
| `evolution_messages` schema evo | useTranscriptionNotifications | UPDATE |
| `typing-presence-{conversationId}` | useTypingPresence | Presence |
| `warroom-alerts-realtime:{random}` | useWarRoomAlerts | INSERT+UPDATE |

### Edge Functions
| função | hook |
|--------|------|
| `sentiment-alert` | useSentimentAlerts |
| `detect-new-device` | useUIInteractionManagement |
| `webauthn` | useWebAuthn |
| `ai-proxy` | useUniversityHelp |
| `voice-copilot-action` | useVoiceActionHandler |
| `evolution-templates` | useWhatsAppTemplates |

### Storage Buckets
| bucket | hook |
|--------|------|
| `team-chat-files` | useTeamChatDraft (upload paste-image) |

---

## 4. Exports Públicos por categoria

### Barris de re-export (thin wrappers)
`useSLAMetrics`, `useScreenProtection`, `useSearchInsights`, `useSidebarState`, `useSwipeControl`, `useTeamChat`, `useTeamChatNotifications`, `useTheme`, `useThemeAudit`, `useVersions`, `useViewTransition`, `useVoiceAgent`, `useZenMode`, `useSecurityPushNotifications`

### Módulos consolidados (god-hooks)
`useSearchManagement` (261 lin), `useSettingsManagement` (417 lin), `useUIInteractionManagement` (722 lin), `useUIManagement` (396 lin), `useVoiceManagement` (230 lin), `useTalkX` (316 lin), `useWhatsAppTemplates` (322 lin)

### Hooks de dados (React Query)
`useSLARulesCounts`, `useSLAScopeNames`, `useScheduledMessages`, `useScheduledReports`, `useSearchInsightRows`, `useSecurityAuditLogs`, `useSentimentAnalyses`, `useTags`, `useTalkXBlacklist`, `useTalkXCampaignLive`, `useTeamChatMembers`, `useTeamMemberDetails`, `useTeamPermissions`, `useUserSettings`, `useWarRoomAlerts`, `useWarRoomData`, `useWebAuthn`, `useWhatsAppFlows`, `useWhatsAppLogs`

### Hooks de browser API (zero Supabase)
`useSpeechToText` (Web Speech API), `useTextToSpeech` (Web Speech API), `useServiceWorker` (Workbox/SW), `useSearchHistory` (localStorage), `useWebhookViewPreferences` (localStorage), `useUrlFilters` (URLSearchParams), `useScreenProtection`, `useTypingPresence` (Presence channel), `useSwipeControl`, `useViewTransition`, `useUndoableAction` (Sonner toast)

### Helpers exportados como hooks (nomes enganosos)
`useSecurityAlerts` — funções async puras; sem useState/useCallback  
`useUserSecurityAlerts` — função async pura; sem estado React

---

## 5. Chama (Saída)

| destino | hooks que dependem |
|---------|-------------------|
| `@/integrations/supabase/client` | maioria |
| `@/integrations/supabase/safeClient` | useTags, useSettingsManagement, useUserSettings, useWhatsAppLogs, useSearchManagement |
| `@/integrations/supabase/connectivityMonitor` | useSupabaseConnectivity |
| `@/features/sla/hooks/useSLAMetrics` | useSLAMetrics |
| `@/features/auth/hooks/useScreenProtection` | useScreenProtection |
| `@/features/auth` (useAuth) | useTags, useTeamChatDraft, useUserSettings, useWebAuthn, useWhatsAppTemplates |
| `@/features/inbox/hooks/team-chat/*` | useTeamChat |
| `@/features/inbox/hooks/voice/logVoiceCommand` | useVoiceActionHandler |
| `@/features/admin/hooks/useVersions` | useVersions |
| `@/features/dashboard/hooks/useDashboardVisualizationManagement` | useWarRoomData |
| `@/hooks/useAlertManagement` | useWebhookHealthAlerts |
| `@/hooks/useUIInteractionManagement` | useSwipeControl, useViewTransition |
| `@/hooks/useUIManagement` | useZenMode |
| `@/hooks/useVoiceManagement` | useVoiceAgent |
| `@/lib/logger` | múltiplos |
| `@/lib/webauthnUtils` | useWebAuthn |
| `@/lib/webhookHealthAlerts`, `@/lib/alertHistory` | useWebhookHealthAlerts |
| `@/lib/scanResponse` | useScanResponseHandler |
| `@/lib/normalizers` | useSecurityAlerts |
| `@/lib/queryStaleTimes` | múltiplos |
| `@/lib/storageSignedUrls` | useTeamChatDraft |
| `@/lib/safeStorage` | useUIInteractionManagement |
| `@/lib/sanitize` | useWhatsAppLogs |
| `@/services/api/queryKeys` | múltiplos |
| `@/utils/uuid` | useTags, useSLAScopeNames |
| `@/utils/notificationSound` | useUIInteractionManagement |
| `@/pages/admin/whatsappLogsHelpers` | useWhatsAppLogs |
| `@tanstack/react-query` | maioria |
| `sonner` | múltiplos |
| `react-router-dom` (useSearchParams) | useUrlFilters |
| `date-fns` | useSentimentAnalyses, useSLAMetrics (via features) |

---

## 6. Chamado Por (Entrada)

| hook | quem importa | contagem |
|------|-------------|---------|
| useSLAMetrics | SLADashboard.tsx, SLAMetricsDashboard.tsx, features/sla/hooks/index.ts | 3 |
| useSLARulesCounts | SLARulesManager.tsx | 1 |
| useSLAScopeNames | ScopeRulesList.tsx | 1 |
| useScanResponseHandler | useFileUploadLogic.ts | 1 |
| useScheduledMessages | ChatPanel.tsx, ScheduleCalendarView.tsx | 2 |
| useScheduledReports | ScheduledReportsManager.tsx | 1 |
| useScreenProtection | App.tsx, features/auth/hooks/index.ts | 2 |
| useSearchHistory | GlobalSearchHistory.tsx, useGlobalSearchData.ts, useSearchManagement.ts | 3 |
| useSearchInsightRows | SearchInsightsTables.tsx | 1 |
| useSearchInsights | useSearchManagement.ts, AdminSearchInsightsPage.tsx | 2 |
| useSearchManagement | useGlobalSearchShortcut.ts, useSearchInsights.ts (re-exports) | 2 |
| useSecurityAlerts | RateLimitRealtimeAlerts.tsx | 1 |
| useSecurityAuditLogs | AdminSecurityLogsPage.tsx, useACLAlerts.ts | 2 |
| useSecurityPushNotifications | SecurityNotificationsPanel.tsx, SecurityView.tsx, useNotificationManagement.ts | 3 |
| useSentimentAlerts | AIConversationAssistant.tsx, useAlertManagement.ts | 2 |
| useSentimentAnalyses | SentimentTrendChart.tsx, SentimentHelpers.tsx | 2 |
| useServiceWorker | App.tsx, buildVersion.ts, ServiceWorkerUpdateBanner.tsx | 3 |
| useSettingsManagement | useUserSettings.ts, useGlobalSettings.ts, useWebhookViewPreferences.ts, useOnboardingChecklist.ts + 10+ componentes | 14+ |
| useSidebarState | Sidebar.tsx, useUIInteractionManagement.ts | 2 |
| useSpeechToText | VoiceSearchOverlayConnected.tsx, VoiceDictationButton.tsx, useVoiceManagement.ts | 3 |
| useSupabaseConnectivity | supabase-connectivity-banner.tsx, __tests__/useSupabaseConnectivity.test.ts | 2 |
| useSwipeControl | ChatMessageBubble.tsx, AppShell.tsx, __tests__/useSwipeGesture.test.ts | 3 |
| useSyncToCRM | CRMAutoSync.tsx, useIntegrationManagement.ts | 2 |
| useTags | useReportsData.ts, InboxFilters.tsx, TagsView.tsx | 3 |
| useTalkX | TalkXCampaignCard.tsx, TalkXBlacklist.tsx, TalkXLiveMonitor.tsx | 3 |
| useTalkXBlacklist | TalkXBlacklist.tsx | 1 |
| useTalkXCampaignLive | TalkXLiveMonitor.tsx | 1 |
| useTeamChat | TeamChatInputArea.tsx, AddMembersDialog.tsx, NewConversationDialog.tsx | 3 |
| useTeamChatDraft | TeamChatInputArea.tsx | 1 |
| useTeamChatMembers | AddMembersDialog.tsx, NewConversationDialog.tsx | 2 |
| useTeamChatNotifications | TeamChatView.tsx, useNotificationManagement.ts | 2 |
| useTeamMemberDetails | TeamMemberDetails.tsx, TeamMemberProfileHeader.tsx | 2 |
| useTeamPermissions | ConfigurePermissionsDialog.tsx | 1 |
| useTextToSpeech | ChatPanel.tsx, VoiceSearchOverlayConnected.tsx, useTeamChatPanel.ts, useVoiceManagement.ts | 4 |
| useTheme | App.tsx, ThemeProvider.tsx, ThemeInitializer.tsx, Sidebar.tsx, ChatThemeSettings.tsx, MobileDrawerMenu.tsx, sonner.tsx, useUIManagement.ts, ThemeCustomizer.tsx, useThemePreset.ts, AppProviders.tsx, VisualValidationChecklist.tsx | 12 |
| useThemeAudit | VisualValidationChecklist.tsx, App.tsx, useUIManagement.ts | 3 |
| useTranscriptionNotifications | IndexContentConnected.tsx, useNotificationManagement.ts, RealtimeFanoutDebug.tsx | 3 |
| useTypingPresence | useContactTyping.ts, ChatPanel.tsx, useRealtimeManagement.ts | 3 |
| useUIInteractionManagement | useAriaAnnouncer.ts, useViewTransition.ts, useSidebarState.ts, useDeviceDetection.ts, useSwipeControl.ts | 5 |
| useUIManagement | useThemeAudit.ts, useZenMode.ts, useAmbientColor.ts, useTheme.ts | 4 |
| useUndoableAction | useInboxBulkActions.ts | 1 |
| useUniversityHelp | UniversityHelp.tsx | 1 |
| useUrlFilters | useInboxFilters.ts, useAdminWebhookStatus.ts + testes | 3+ |
| useUserSecurityAlerts | SecurityOverview.tsx | 1 |
| useUserSettings | ChatPanel.tsx, SettingsView.tsx, SoundCustomizationPanel.tsx, ParticipantStatsGraph.tsx, SLASettings.tsx, useSettingsManagement.ts, useTeamChatPanel.ts, useSettingsQueries.ts, settings/index.ts | 9 |
| useVersions | AgentVersionsPanel.tsx, features/admin/hooks/index.ts | 2 |
| useViewTransition | AppShell.tsx, useUIInteractionManagement.ts | 2 |
| useVoiceActionHandler | AppShell.tsx, useVoiceManagement.ts | 2 |
| useVoiceAgent | useVoiceManagement.ts | 1 |
| useVoiceManagement | VoiceSearchOverlayConnected.tsx, useVoiceAgent.ts | 2 |
| useWarRoomAlerts | WarRoomDashboard.tsx, useAlertManagement.ts, useIdempotencyMissAlerts.ts | 3 |
| useWarRoomData | WarRoomDashboard.tsx, WarRoomQueueRow.tsx, WarRoomAgentCard.tsx, WarRoomAlertRow.tsx, useDashboardVisualizationManagement.ts | 5 |
| useWebAuthn | useAuthForm.ts, PasskeysPanel.tsx, useWebAuthn.test.tsx | 3 |
| useWebhookHealthAlerts | IndexContentConnected.tsx, useAlertManagement.ts, useAdminWebhookStatus.ts, AlertThresholdsPanel.tsx | 4 |
| useWebhookViewPreferences | useSettingsManagement.ts, WebhookEventsTable.tsx, useAdminWebhookStatus.ts, AdvancedFiltersPanel.tsx | 4 |
| useWhatsAppFlows | WhatsAppFlowsBuilder.tsx | 1 |
| useWhatsAppLogs | pages/admin/useWhatsAppLogs.ts, AdminWhatsAppLogsPage.tsx | 2 |
| useWhatsAppTemplates | WhatsAppTemplatesManager.tsx | 1 |
| useZenMode | useUIManagement.ts, AppShell.tsx, useZenMode.test.ts | 3 |

---

## 7. Orfaos

**Nenhum arquivo deste bloco é órfão.** Todos os 59 hooks possuem importadores identificados via grep fora do próprio diretório `src/hooks/`.

O único candidato ambíguo é `useSearchManagement.ts` (261 linhas): não há imports diretos do nome `useSearchManagement`, pois os consumidores chamam os re-exports wrapper (`useGlobalSearchShortcut`, `useSearchInsights`) — padrão intencional da ETAPA 36 de consolidação. Considerado **EM_USO** (consumo indireto confirmado).

---

## 8. Implementacao por Arquivo

| arquivo | status | o que falta |
|---------|--------|-------------|
| useSLAMetrics.ts | COMPLETA (barrel) | — |
| useSLARulesCounts.ts | COMPLETA | — |
| useSLAScopeNames.ts | COMPLETA | — |
| useScanResponseHandler.ts | COMPLETA | — |
| useScheduledMessages.ts | PARCIAL | RLS INSERT/UPDATE ausentes (CAMPANHAS-09); nenhum cron/edge dispara as mensagens |
| useScheduledReports.ts | PARCIAL | RLS INSERT/UPDATE/DELETE suspeitos; pg_cron para disparo não existe no repo |
| useScreenProtection.ts | COMPLETA (barrel) | — |
| useSearchHistory.ts | COMPLETA | — |
| useSearchInsightRows.ts | COMPLETA | — |
| useSearchInsights.ts | COMPLETA (barrel) | — |
| useSearchManagement.ts | COMPLETA | RPCs search_knowledge_base e get_search_insights sem tipagem gerada (cast `as unknown`) |
| useSecurityAlerts.ts | COMPLETA | — |
| useSecurityAuditLogs.ts | COMPLETA | — |
| useSecurityPushNotifications.ts | COMPLETA (barrel) | — |
| useSentimentAlerts.ts | COMPLETA | — |
| useSentimentAnalyses.ts | COMPLETA | — |
| useServiceWorker.ts | COMPLETA | — |
| useSettingsManagement.ts | COMPLETA | webhook_preferences pode não existir como tabela (não consta no CLAUDE.md) |
| useSidebarState.ts | COMPLETA (barrel) | — |
| useSpeechToText.ts | COMPLETA | — |
| useSupabaseConnectivity.ts | COMPLETA | — |
| useSwipeControl.ts | COMPLETA (barrel) | — |
| useSyncToCRM.ts | COMPLETA | RPC é stub (RAISE P0001) — chamadas reais falham silenciosamente |
| useTags.ts | COMPLETA | — |
| useTalkX.ts | COMPLETA | Cron talkx-scheduler-check a confirmar em produção (CAMPANHAS-06) |
| useTalkXBlacklist.ts | COMPLETA | — |
| useTalkXCampaignLive.ts | COMPLETA | — |
| useTeamChat.ts | COMPLETA (barrel) | — |
| useTeamChatDraft.ts | COMPLETA | — |
| useTeamChatMembers.ts | COMPLETA | — |
| useTeamChatNotifications.ts | COMPLETA (barrel) | — |
| useTeamMemberDetails.ts | COMPLETA | — |
| useTeamPermissions.ts | COMPLETA | — |
| useTextToSpeech.ts | COMPLETA | — |
| useTheme.ts | COMPLETA (barrel) | — |
| useThemeAudit.ts | COMPLETA (barrel) | — |
| useTranscriptionNotifications.ts | COMPLETA | — |
| useTypingPresence.ts | COMPLETA | — |
| useUIInteractionManagement.ts | COMPLETA | — |
| useUIManagement.ts | COMPLETA | — |
| useUndoableAction.ts | COMPLETA | — |
| useUniversityHelp.ts | COMPLETA | — |
| useUrlFilters.ts | COMPLETA | — |
| useUserSecurityAlerts.ts | COMPLETA | — |
| useUserSettings.ts | COMPLETA | — |
| useVersions.ts | COMPLETA (barrel) | — |
| useViewTransition.ts | COMPLETA (barrel) | — |
| useVoiceActionHandler.ts | COMPLETA | — |
| useVoiceAgent.ts | COMPLETA (barrel) | — |
| useVoiceManagement.ts | COMPLETA | — |
| useWarRoomAlerts.ts | COMPLETA | — |
| useWarRoomData.ts | PARCIAL | `alerts: [] as WarRoomAlert[]` hardcoded — lógica real de alertas não implementada |
| useWebAuthn.ts | COMPLETA | — |
| useWebhookHealthAlerts.ts | PARCIAL | activeBreaches, recentAlerts, history, setConfig, reloadHistory são stubs com `/* stub */` |
| useWebhookViewPreferences.ts | COMPLETA | — |
| useWhatsAppFlows.ts | COMPLETA | — |
| useWhatsAppLogs.ts | COMPLETA | — |
| useWhatsAppTemplates.ts | COMPLETA | — |
| useZenMode.ts | COMPLETA (barrel) | — |

---

## 9. Achados

### A1 — useScheduledMessages: RLS ausente + cron inexistente (bug duplo CAMPANHAS-09)
`useScheduledMessages.ts:4-10` — Comentário interno documenta dois bugs críticos: (1) RLS faltando para INSERT/UPDATE → mutations retornam 403 silenciosamente; (2) nenhum cron job ou Edge Function processa `scheduled_messages` → mensagens agendadas nunca são disparadas em produção.

### A2 — useSyncToCRM: RPC stub ativo mascarado por isConfigured
`useSyncToCRM.ts:53` — Cast `as unknown as` para contornar ausência da RPC nos tipos gerados. `sync_conversation_to_crm` é stub ativo (RAISE P0001 conforme CLAUDE.md). `isConfigured` retorna `false` silenciando o erro para o usuário — feature está visualmente presente mas inoperante.

### A3 — useSecurityAlerts e useUserSecurityAlerts: funções puras nomeadas como hooks
`useSecurityAlerts.ts:1` / `useUserSecurityAlerts.ts:1` — Nenhum dos dois é hook React (sem `useState`, `useEffect`, `useCallback`). São funções async exportadas. Nome com prefixo `use` induz erro em lint rules (react-hooks/rules-of-hooks). Deveriam estar em `src/lib/` ou `src/services/`.

### A4 — useWarRoomData: array de alertas hardcoded vazio
`useWarRoomData.ts:30` — `alerts: [] as WarRoomAlert[]` — campo `alerts` sempre retorna array vazio; a UI de alertas do War Room nunca exibe dados reais. Componentes `WarRoomAlertRow.tsx` e outros consumidores recebem lista vazia permanentemente.

### A5 — useWebhookHealthAlerts: stubs explícitos mascarados pelo hook público
`useWebhookHealthAlerts.ts:29-40` — `activeBreaches`, `recentAlerts`, `history`, `setConfig`, `reloadHistory` marcados com `/* stub */` e retornam valores fixos/vazios. O hook é consumido por 4 arquivos (`IndexContentConnected.tsx`, `AlertThresholdsPanel.tsx` etc.) que dependem de dados que nunca chegam.

### A6 — useSearchManagement: RPCs sem tipagem (cast duplo as unknown)
`useSearchManagement.ts:11` — `const dynamicRpc = supabase.rpc as unknown` para chamar `search_knowledge_base` e `get_search_insights`. Se a assinatura da RPC mudar, a falha é silenciosa em runtime — TypeScript não detecta.

### A7 — useTranscriptionNotifications: canal com sufixo Math.random()
`useTranscriptionNotifications.ts:37` — Canal Realtime usa `Math.random()` no nome para evitar colisões entre múltiplas instâncias montadas. Correto para o propósito, mas pode acumular canais não removidos se o componente for desmontado sem cleanup adequado.

### A8 — useSyncToCRM e useTalkX: crons/infra a confirmar em produção
`useTalkX.ts:1-12` — Comentário CAMPANHAS-06 documenta que cron `talkx-scheduler-check` consta na migration mas precisa confirmação em produção. `useScheduledReports.ts:1-16` — similarmente, pg_cron para relatórios agendados não encontrado no repo (DASHBOARD-16).

### A9 — Padrão de consolidação ETAPA 31/32/35/36/41: barris proliferados
14 arquivos são barris de re-export com 1–26 linhas. Servem como aliases públicos para módulos consolidados. Não são bugs, mas aumentam a contagem de arquivos sem adicionar lógica. Candidatos a remoção futura após migração de importadores para os módulos consolidados diretamente.

### A10 — useWhatsAppLogs: tabelas acessadas via safeClient sem verificação de existência
`useWhatsAppLogs.ts:4` — Usa `safeClient` para `provider_message_log` e `dispatch_error_logs`. `dispatch_error_logs` foi adicionada à publication Realtime (conforme CLAUDE.md), mas `provider_message_log` e `whatsapp_cloud_webhook_pings` não constam na lista canônica de tabelas — existência em produção não verificada nesta análise.

*Runtime: NAO_VERIFICADO - nenhuma execucao real foi realizada durante esta analise.*
