# PENDENCIAS CONSOLIDADAS (Onda 1 - docs/estado)

Total de itens nao-total: 538

## Itens 🟡/❌/📋 por finding

### findings-01.md
- 🟡 PARC **Páginas órfãs: 128 arquivos não referenciados em AppRoutes.tsx**
- 🟡 PARC Código morto/defeituoso em páginas órfãs (return-null / empty-handlers)
- 🟡 PARC `business-logic` — hook A/B variants (`useBusinessLogicCampaignsManagement`)
- 🟡 PARC `business-logic` — catalog send (`useBusinessLogicCatalogManagement` / `sendProductToContact`)
- 🟡 PARC `business-logic` — sales pipeline (`useBusinessLogicPipelineManagement`)
- 🟡 PARC `useDashboardVisualizationManagement` — consolida 5 hooks do dashboard
- 🟡 PARC `useCustomEmojis` — CRUD emojis + upload Storage + favoritos
- 🟡 PARC `useEvolutionApiIntegration` — credenciais Evolution + health check
- 🟡 PARC `QueueRoutingRules` — CRUD de `queue_routing_rules` (5 tipos de regra)
- 🟡 PARC `useContactTyping` — broadcast `typing:{remoteJid}`
- 🟡 PARC `useContactAssignment` — atualiza `assigned_to`/`queue_id`
- 🟡 PARC `useContactEnrichedData` — resolve JID→UUID + 3 queries paralelas
- 🟡 PARC `useCampaignContactOptions` — opções p/ dialogs de campanha
- 🟡 PARC `dataDeletionRequestService` — direito ao esquecimento (LGPD)
- 🟡 PARC Módulo `connections` — `useConnectionsManager` (QR flow, pairing, audit no disconnect)
- 🟡 PARC `connections` — `handleAddConnection` sem rollback (instância órfã)
- 🟡 PARC `connections` — Realtime com tópico aleatório acumula canais
- 🟡 PARC `useSLAConfigurations` — CRUD `sla_configurations`
- 🟡 PARC `useSLAHistory` — agregação por dia + trend
- 🟡 PARC `useSLAMetrics` — métricas globais/agente (refetch 60s)
- 🟡 PARC `useSLAAlertPreferences` — prefs por usuário (upsert, fail-open)
- 🟡 PARC `SLACharts` / `SLAHistoryDashboard` / `SLADeliveryHistoryDashboard`
- 🟡 PARC 🟡 PARCIAL
- ❌ NÃO  ❌ NÃO INICIADA
- 📋 PLAN 📋 PLANO/FUTURO

### findings-02.md
- 🟡 PARC A9
- 🟡 PARC A10
- 🟡 PARC A12
- 🟡 PARC A16
- 🟡 PARC A17
- 🟡 PARC A30
- 🟡 PARC A31
- 🟡 PARC A32
- 🟡 PARC B11
- 🟡 PARC B13
- 🟡 PARC B16
- 🟡 PARC B20
- 🟡 PARC B23
- 🟡 PARC B28
- 🟡 PARC B30
- 🟡 PARC B48
- 🟡 PARC B49
- 🟡 PARC B50
- 🟡 PARC B51
- 🟡 PARC B52
- 🟡 PARC 🟡 PARCIAL
- ❌ NÃO  ❌ NÃO INICIADA
- 📋 PLAN 📋 PLANO/FUTURO

### findings-03.md
- 🟡 `useMessageQueue` (fila de retry)
- 🟡 `useSendThrottle` (throttle envio)
- 🟡 `useRetryFailedMessage`
- 🟡 `useSafeInteractiveMessage`
- 🟡 `useChatMediaSending` (sticker/emoji/audio meme)
- 🟡 `useNewConversation`
- 🟡 `sendMessageToContact` (`realtime/messageSender.ts`, caminho legado zapp)
- 🟡 `sendExternalText` (`realtime/externalMessageSender.ts`, caminho evo)
- 🟡 `sendExternalAudio` (`realtime/externalAudioSender.ts`, PTT/voz)
- 🟡 `useMessageSendHistory`
- 🟡 `useAgentRecentSends`
- 🟡 `useRealtimeInbox` (orquestrador primário)
- 🟡 `useRealtimeMessages` (orquestrador maior)
- 🟡 `useMessageStatus` (canal por contactId + sendStatusBus)
- 🟡 `useRealtimeContacts` (evo.evolution_contacts)
- 🟡 `useRealtimeFallbackRefetch`
- 🟡 `useRealtimePresenceAndConnections`
- 🟡 `useRealtimeNotifications`
- 🟡 `useMessageUpdateBatcher`
- 🟡 `useInboxSource` (unifica fontes)
- 🟡 `useConversationActions` (envio + markAsRead)
- 🟡 `useFailedMessageAlerts`
- 🟡 `useAutomationFailureAlerts`
- 🟡 `useRetryResolutionAlerts`
- 🟡 `useContactAvatar`
- 🟡 `useMessages` (LEGADO — zapp.messages)
- 🟡 `sendStatusBus` (singleton pub/sub)
- 🟡 `avatarBatchStore` (singleton batch)
- 🟡 `playerStateStore` (singleton)
- 🟡 `reconciliationTelemetry`
- 🟡 `realtimeUtils.ts`
- 🟡 `useInboxFilters`
- 🟡 `useInboxHeartbeat`
- 🟡 `useMessageTemplates`
- 🟡 `useQuickReplies`
- 🟡 `useScheduledMediaUpload`
- 🟡 `useMediaUrl`
- 🟡 `useMediaRefresh`
- 🟡 `useSipClient`
- 🟡 `useCalls`
- 🟡 `useInboxBulkActions`
- 🟡 `useMessageReactions`
- 🟡 `useConversationMessagesData`
- 🟡 `useConversationEventsData`
- 🟡 `useConversationSLAData`
- 🟡 `useConversationTasksData`
- 🟡 `useContactSummaryBatch` (IA)
- 🟡 `useContactDetailStats`
- 🟡 `useFailureMetricsBatch`
- 🟡 `useFailureReason`
- 🟡 `useFallbackContact`
- 🟡 `useMessageSignature`
- 🟡 `useContactNotesMutations`
- 🟡 `useAuxiliaryMessageLog`
- 🟡 `useTicketStatus`
- 🟡 `useChatAutoScroll`
- 🟡 `useChatSearch`
- 🟡 `useInboxShortcuts`
- 🟡 `useInboxDeepLinks`
- 🟡 `useInboxDataQueries`
- 🟡 Edge Fn `evolution-api/get-media-base64`
- 🟡 PARC 🟡 PARCIAL
- ❌ NÃO  ❌ NÃO INICIADA
- 📋 PLAN 📋 PLANO/FUTURO

### findings-04.md
- 🟡 PARC **Compositor de mensagem** — ChatInputArea.tsx
- 🟡 PARC **Área de mensagens (scroll virtual + realtime)** — ChatMessagesArea.tsx
- 🟡 PARC **Toolbar hover (reply/forward/copy/speak + pin/star/deletar)** — MessageHoverToolbar.tsx
- 🟡 PARC Chips HH:mm — MessageStatusTimestamps.tsx
- 🟡 PARC **Header da conversa** — ChatHeader.tsx
- 🟡 PARC **Menu do header** — ChatHeaderMenu.tsx
- 🟡 PARC Resultados da busca — ChatSearchResultsList.tsx
- 🟡 PARC **Orchestrator central** — useChatPanelHandlers.ts (send/edit/retry/whisper/snooze/archive)
- 🟡 PARC **Handlers teclado + slash commands** — useInputHandlers.ts (/resolve /snooze /tag /note…)
- 🟡 PARC **Produto / interativo / localização** — useProductHandlers.ts
- 🟡 PARC **Agendamento de mensagem** — useChatScheduleMessage.ts
- 🟡 PARC **Stickers** — StickerManager/StickerGrid/PersonalStickers/StickerCategoryBar/CategorySelector/StickerUploadPreview
- 🟡 PARC **Atribuição de agente/fila** — AssignmentSection.tsx
- 🟡 PARC **Ações do contato** — ContactActionButtons.tsx (ligação, vídeo, email, VIP, bloquear, arquivar)
- 🟡 PARC **Tags do contato/conversa** — ContactTagsContent.tsx
- 🟡 PARC **Item da lista de conversas (monolito)** — ConversationItem.tsx
- 🟡 PARC Variante compact — ConversationItemCompact.tsx
- 🟡 PARC **Persistência de sumários IA** — conversationSummaryStorage.ts
- 🟡 PARC Definição das seções — contactDetailSections.ts
- 🟡 PARC Barrel conversation-list/index.ts
- 🟡 PARC Testes — contactDetailSections.test.ts, ConversationItem.test.tsx, StickerTypes.test.ts, analysisConfigs.test.ts, sla-ti

### findings-05.md
- 🟡 PARC BulkActionsToolbar.tsx
- 🟡 PARC BusinessHoursBadge.tsx
- ❌ NÃO  CRMAutoSync.tsx
- 🟡 PARC ChatPanel.tsx
- 🟡 PARC ContactDetails.tsx
- 🟡 PARC ContactPurchasesPanel.tsx
- 🟡 PARC ContactTypeFilter.tsx
- 🟡 PARC ConversationContextMenu.tsx
- 🟡 PARC EmojiPicker.tsx
- 🟡 PARC InboxFilters.tsx
- 🟡 PARC LinkPreview.tsx
- 🟡 PARC MediaGallery.tsx
- 🟡 PARC MessageContextMenu.tsx
- 🟡 PARC NextBestActionEngine.tsx
- 🟡 PARC QueuePositionNotifier.tsx
- 🟡 PARC ScheduleMessageDialog.tsx
- 🟡 PARC VisualValidationChecklist.tsx
- 🟡 PARC media-gallery/index.ts
- 🟡 PARC quick-replies/QuickReplyDialog.tsx
- 🟡 PARC search/index.ts
- 🟡 PARC templates/TemplateEditorDialog.tsx
- 🟡 PARC 🟡 PARCIAL
- ❌ NÃO  ❌ NÃO INICIADA
- 📋 PLAN 📋 PLANO/FUTURO

### findings-06.md
- 🟡 PARC `hover-card.tsx`
- 🟡 PARC `menubar.tsx`
- 🟡 PARC `pagination.tsx`
- 🟡 PARC `SkeletonList.tsx`
- 🟡 PARC `UnifiedEmptyState.tsx`
- 🟡 PARC `accessible-toast.tsx` (toast acessível aria-live)
- 🟡 PARC `empty-states.tsx` (barrel)
- 🟡 PARC `emoji-picker.tsx`
- 🟡 PARC `icon-button.tsx` / `mobile-components.tsx`
- 🟡 PARC `motion.tsx` (deprecated)
- 🟡 PARC `motion/variants.ts`
- 🟡 PARC `use-toast.ts`
- ❌ NÃO  `stories/` (9 arquivos `.stories.tsx`, 832 linhas)
- 🟡 PARC Acessibilidade (sistemas de toast acessível)
- 🟡 PARC Sistema de Empty States (5 implementações paralelas)
- 🟡 PARC Órfãos totais `ui/`
- 🟡 PARC `AppearanceSettings.tsx`
- 🟡 PARC `AutomationSettings.tsx`
- 🟡 PARC `LanguageSelector.tsx`
- 🟡 PARC `MarketingBudgets.tsx`
- 🟡 PARC Duplicação conceitual SLA (SettingsView × SLADashboard)
- 🟡 PARC `ContactsTableVirtual.tsx` (376L, virtualizada)
- 🟡 PARC `ContactKanbanView.tsx`
- 🟡 PARC `ContactMapView.tsx`
- 🟡 PARC `ContactAnalyticsDashboard.tsx`
- 🟡 PARC `DuplicateContactsPanel.tsx`
- 🟡 PARC `ContactMergeDialog.tsx` (merge manual)
- 🟡 PARC Exportação: `ContactExportDialog` + `contactExportFields.ts`
- 🟡 PARC `SegmentsManagerDialog.tsx` (contact_segments)
- 🟡 PARC `FilterPresets.tsx`
- 🟡 PARC `ContactsRichHeader.tsx`
- 🟡 PARC `types.ts` (tipo `Contact`)
- ❌ NÃO  `AddConnectionDialog.tsx` (criar conexão WA)
- 🟡 PARC `QrCountdown.tsx`
- 🟡 PARC `OfficialApiConfigDialog.tsx` (WA Cloud API/Meta)
- 🟡 PARC `ConnectionQueuesDialog.tsx`
- 🟡 PARC `ConnectionsStats.tsx`
- 🟡 PARC `connectionCardHelpers.ts` + `types.ts` + `useConnectionCardActions.ts`
- 🟡 PARC `DashboardView.tsx` (5 tabs)
- ❌ NÃO  `DashboardToolbar.tsx`
- 🟡 PARC `ConversationHeatmap.tsx`
- 🟡 PARC `ActivityHeatmap.tsx`
- 🟡 PARC `AgentPerformancePanel.tsx`
- ❌ NÃO  `SatisfactionMetrics.tsx`
- 🟡 PARC `AIQuickAccess.tsx`
- 🟡 PARC `SentimentAlertsDashboard.tsx`
- 🟡 PARC `SentimentTrendChart.tsx`
- 🟡 PARC `SLAMetricsDashboard.tsx`
- 🟡 PARC `GamificationEffects.tsx`
- 🟡 PARC 🟡 PARCIAL
- ❌ NÃO  ❌ NÃO INICIADA
- 📋 PLAN 📋 PLANO/FUTURO

### findings-07.md
- 🟡 PARC Upload de mídia team-chat (bucket `team-chat-files`)
- 🟡 PARC Transferência de conversa entre departamentos
- ❌ NÃO  TeamPerformancePanel (métricas LCP/INP/renderTime)
- 🟡 PARC MonitoringEventTimeline
- 🟡 PARC Tipos TS dos RPCs DLQ (`types.ts` gerado)
- 🟡 PARC EF `evolution-api` por nome hardcoded (MonitoringConnectionsList)
- ❌ NÃO  Dead code confirmado: TeamChatMessageRow (333L) + teamChatParts (143L)
- ❌ NÃO  Testes team-chat (comprehensive 270 + security-gaps 52)
- ❌ NÃO  RLS team-chat (gaps documentados: INSERT em team_messages sem check de membership; sem DELETE policy em team_conversatio
- 📋 PLAN Consolidação `monitoring/hooks/` com `features/admin/hooks/monitoring/`
- 🟡 PARC Auditoria (AuditLogDashboard — audit_logs com filtros/paginação)
- 🟡 PARC Rate-limit (RateLimitConfigPanel)
- 🟡 PARC Reset de senha (PasswordResetRequestsPanel + EF approve-password-reset + realtime)
- 🟡 PARC Notificações push de segurança (SecurityNotificationsPanel)
- 🟡 PARC VirusTotal (VirusTotalConfig via EF virustotal-test)
- 🟡 PARC QueueCard duplicado (components/ 97L vs pages/admin/queues/ 187L)
- 🟡 PARC AddMemberDialog
- 🟡 PARC Rota SLA registrada em 2 lugares (AppRoutes.tsx:128 + ViewRouter.tsx:136)
- 🟡 PARC FAB mobile (nova conversa/contato/campanha)
- 🟡 PARC Notificações mobile (NotificationsPanel + InAppNotification/Provider)
- 🟡 PARC Testes mobile (MiniChatPiP, SwipeableMessage, VoiceDictationButton)
- 🟡 PARC Sentinel (validateEntityAccess/validateRpcAccess)
- ❌ NÃO  ConnectionPoolManager
- 🟡 PARC AI router (ai-router.ts 223L, 9 ações → EF ai-router)
- 🟡 PARC zappweb hooks (useZappContactSearch/Conversations/Messages + evolutionClient)
- ❌ NÃO  Realtime zappweb (evolution_messages/conversations)
- ❌ NÃO  externalClient.ts + externalSessionBridge.ts (no-ops pós-consolidação)
- ❌ NÃO  gmailHealthRLS.test.ts (34L, strings hardcoded)
- 🟡 PARC SafeQueryBuilder = any
- 🟡 PARC isArchived no adapter
- 🟡 PARC Ramo PTT (audio) em evolutionAdapter
- 🟡 PARC columnMap.test.ts (85L)
- ❌ NÃO  useZappConversations.test.tsx (127L)
- 🟡 PARC useZappMessages.test.tsx (97L)
- ❌ NÃO  ERRATA topologia (evo físico × zapp view; achados A1/A2 do doc INVERTIDOS)
- 🟡 PARC 🟡 PARCIAL
- ❌ NÃO  ❌ NÃO INICIADA/MORTA
- 📋 PLAN 📋 PLANO/FUTURO

### findings-08.md
- 🟡 PARC sidebarNavConfig (nav declarativa)
- 🟡 PARC ConnectionStatusIndicator (ícone wifi + popover)
- 🟡 PARC IndexContentConnected (orquestrador boot: auth, onboarding, realtime, atalhos)
- 🟡 PARC AchievementBadge
- 🟡 PARC TalkXLiveMonitor (monitor tempo real + export CSV)
- 🟡 PARC TalkXRecipientsList (status envio, poll 30s)
- 🟡 PARC ConversationHeatmap (heatmap horas×dias)
- 🟡 PARC DemandForecast (previsão de demanda)
- ❌ NÃO  AutoExportManager (rota `/auto-export`)
- 🟡 PARC UnifiedNotificationProviders (3 hooks realtime + compat legado)
- 🟡 PARC NotificationChannelsAdmin (CRUD canais/templates)
- 🟡 PARC EmailChatBubble-v2 / EmailChatBubbleDOMSafe
- 🟡 PARC EmailChatReplyBar (compose, templates, assinatura, SLA, DOMPurify)
- 🟡 PARC EmailThreadList (filtros, SLADot, seleção)
- 🟡 PARC ElevenLabsDialogue (edge `elevenlabs-dialogue`)
- 🟡 PARC crm360TabsData (30+ abas estáticas)
- 🟡 PARC TourOverlay (portal spotlight + tooltips)
- 🟡 PARC WelcomeModal (boas-vindas Framer Motion)
- 🟡 PARC IncomingCallAlert (dual source: legado + broadcast)
- 🟡 PARC VoIPPanel (painel SIP: config, histórico, discador)
- 🟡 PARC voip-security-gaps.test (documentação viva dos gaps)
- 🟡 PARC VoIPPanel.test
- 🟡 PARC EvolutionApiIntegrationView (gestão instâncias Evolution)
- 🟡 PARC BitrixIntegrationView (webhook Bitrix24)
- ❌ NÃO  GoogleCalendarIntegration
- ❌ NÃO  N8nIntegrationView
- ❌ NÃO  SentryIntegrationView
- 🟡 PARC api/types.ts (ListResponse, QueryParams…)
- 🟡 PARC api/genericService.ts (CRUD genérico + realtime + retry)
- 🟡 PARC api/queryFactory.ts (5 factories query)
- 🟡 PARC api/mutationFactory.ts (5 factories mutation)
- 🟡 PARC connections/BridgeService.ts (ping saúde Supabase externo)
- 🟡 PARC connections/index.ts
- 🟡 PARC contacts/useContactsMutations.ts (7 hooks)
- 🟡 PARC email/emailHealthRepository.ts (telemetria safeClient)
- 🟡 PARC messages/messagesRepository.ts (CRUD msgs/conversas)
- 🟡 PARC messages/useMessagesMutations.ts (8 hooks)
- 🟡 PARC settings/settingsRepository.ts (get/update/upsert + 2 subscriptions realtime)
- 🟡 PARC settings/useSettingsMutations + useSettingsQueries
- 🟡 PARC users/usersRepository.ts (CRUD users+agents sobre profiles)
- 🟡 PARC users/useUsersMutations.ts (6 hooks)
- 🟡 PARC users/useUsersQueries.ts (10 hooks)
- ❌ NÃO  Arquitetura Repository→Service→Hooks integrada à app
- 📋 PLAN AutoExportManager: decidir remover rota `/auto-export` ou implementar exportação agendada
- 📋 PLAN EmailChatBubble-v2: decidir adoção ou remoção (0 consumidores externos)
- 📋 PLAN services/settings: migrar padrão `dispose()` (REALTIME_CHANNELS_AUDIT) antes de qualquer remoção
- 📋 PLAN Refactor: extrair `formatPrice`/`handleImageError` (catalog), `TOOLTIP_STYLE` (lib/chartConfig), `SOUND_TYPES` (comparti
- 📋 PLAN Unificar `AchievementBadge` (gamification) com o local de LeaderboardHelpers
- 📋 PLAN Remover alias legado `communicationNav = automationNav`
- 📋 PLAN Converter 8 gaps VoIP documentados em testes para TODOs no código principal
- 📋 PLAN defaultTourSteps: validar existência dos seletores DOM; VoiceSuggestions: sugestões dinâmicas
- 🟡 PARC 🟡 PARCIAL
- ❌ NÃO  ❌ NÃO INICIADA
- 📋 PLAN 📋 PLANO/FUTURO

### findings-09.md
- 🟡 automations/AutomationEditorDialog.tsx
- 🟡 components/ExportDropdown.tsx
- 🟡 (STU components/ThemeProvider.tsx
- 🟡 components/nps/NPSDashboard.tsx
- 🟡 components/theme/ChatThemeSettings.tsx
- 🟡 useBulkActions.ts
- 🟡 useCSATAutoConfig.ts
- 🟡 useCampaigns.ts
- 📋 useDashboardDataBatch.ts
- 🟡 useEmail.ts
- 🟡 useEmailDraft.ts
- 🟡 useEmailSearch.ts
- 🟡 useExportData.ts
- 🟡 (MOR useExternalContact360Batch.ts
- 📋 useFollowupBridge.ts
- 🟡 useGoalNotifications.ts
- 🟡 PARC 🟡 PARCIAL
- 📋 PLAN 📋 PLANO/FUTURO
- ❌ NÃO  ❌ NÃO INICIADA

### findings-10.md
- 🟡 PARC useIntegrationManagement
- ❌ NÃO  useLatestAnalysis
- 🟡 PARC useMediaManagement
- 🟡 PARC useNotificationChannels
- 🟡 PARC usePerformanceMonitoring
- 🟡 PARC useQueueAnalytics
- 🟡 PARC useScheduledMessages
- 🟡 PARC useScheduledReports
- 🟡 PARC useSyncToCRM
- 🟡 PARC useWarRoomData
- 🟡 PARC useWebhookHealthAlerts
- 🟡 PARC campaigns/useCampaignABTesting
- 🟡 PARC contacts/useCompanies
- 🟡 PARC contacts/useContactSegments
- 🟡 PARC email/useImapAccounts
- 🟡 PARC followup/useFollowUpSequences
- 🟡 PARC gmail/gmailApi
- ❌ NÃO  gmail/gmailApiTypes
- 🟡 PARC useApplicableSLA.test
- ❌ NÃO  useAudioRecorder.cleanup.test
- 🟡 PARC useBusinessHours.test.tsx
- 🟡 PARC useCSAT.test.tsx
- 🟡 PARC useCampaigns.test.tsx
- 🟡 PARC useChatbotFlows.test.tsx
- 🟡 PARC useConnectionQueues.test.tsx
- 🟡 PARC useContactCustomFields.test.tsx
- 🟡 PARC useMarketingBudgets.test.tsx
- 🟡 PARC useOnboarding.test.tsx
- 🟡 PARC useOnboardingChecklist.test.tsx
- ❌ NÃO  usePushNotifications.test
- 🟡 PARC useQueueAnalytics.test.tsx
- 🟡 PARC useQueueGoals.test.tsx
- 🟡 PARC useQueues.test.tsx
- 🟡 PARC useQueuesComparison.test.tsx
- 🟡 PARC useRealtimeMessages.test.tsx
- 🟡 PARC useSLACalculation.test
- 🟡 PARC useSLAMetrics.test.tsx
- 🟡 PARC useScheduledMessages.test.tsx
- 🟡 PARC useTags.test.tsx
- ❌ NÃO  useTextToSpeech.test
- 🟡 PARC useTranscriptionNotifications.test
- 🟡 PARC useTypingPresence.test.tsx
- 🟡 PARC useUndoableAction.test
- 🟡 PARC useUrlFilters.test.tsx
- 🟡 PARC useWebAuthn.test.tsx
- 📋 PLAN TODO DASHBOARD-08 — executor de envio de canais de notificação ausente
- 📋 PLAN TODO EMAIL-04 — downloadAttachment retorna 501
- 📋 PLAN GAP-6 — RPC de useLatestAnalysis nunca implementada
- 📋 PLAN CAMPANHAS-09 — RLS INSERT/UPDATE de scheduled_messages
- 📋 PLAN DASHBOARD-16 — pg_cron de relatórios agendados não encontrado no repo
- 📋 PLAN RLS policies INSERT/UPDATE/DELETE para `companies` e `contact_segments`
- 📋 PLAN Testes duplicados useTheme (.ts + .tsx) e useUrlFilters (.ts + .tsx)
- 📋 PLAN useAudioRecorder.cleanup.test — migrar para Vitest ou excluir
- 🟡 PARC 🟡 PARCIAL
- ❌ NÃO  ❌ NÃO INICIADA
- 📋 PLAN 📋 PLANO/FUTURO

### findings-11.md
- 🟡 PARC businessAnalytics.ts
- 🟡 PARC clientRateLimiter.ts
- 🟡 PARC configBackup.ts
- 🟡 PARC contactsDB.ts
- 🟡 PARC env.ts
- 🟡 PARC healthCheck.ts
- 🟡 PARC instrumentedExternal.ts
- 🟡 PARC offlineQueue.ts
- 🟡 PARC optimisticConcurrency.ts
- 🟡 PARC queryTimeout.ts
- 🟡 PARC requestDeduplicator.ts
- 🟡 PARC sanitize-extra.ts
- 🟡 PARC schemaDrift.ts
- 🟡 PARC utils.test.ts
- 🟡 PARC crossTabDedupe.ts
- 🟡 PARC crossTabDedupeTypes.ts
- 🟡 PARC crossTabDedupeCache.ts
- 🟡 PARC crossTabDedupeLock.ts
- 🟡 PARC crossTabDedupeTransport.ts
- 🟡 PARC ticketStore.ts
- 🟡 PARC chatOptimizations.ts
- 🟡 PARC audio/useAudioPlayer.ts
- 🟡 PARC auth/roleMapping.ts
- 🟡 PARC schemas/supabase.ts
- 🟡 PARC types/branded.ts
- 🟡 PARC alertHistory.test.ts
- 🟡 PARC centenarias.simulacao.test.ts
- ❌ NÃO  clientRateLimiter.test.ts
- ❌ NÃO  contactsDB.test.ts
- ❌ NÃO  debug-dompurify-test.ts
- 🟡 PARC externalProxy.test.ts
- 🟡 PARC groupsAutoSync.test.ts
- ❌ NÃO  healthCheck.test.ts
- 🟡 PARC phoneNormalization.test.ts
- ❌ NÃO  queryTimeout.test.ts
- 🟡 PARC rateLimiter.test.ts
- 🟡 PARC resilienceSimulation.test.ts
- 🟡 PARC retryScheduleSimulation.test.ts
- 🟡 PARC rlsGroupAccess.test.ts
- ❌ NÃO  sanitize-extra.test.ts
- 🟡 PARC supabaseHelpers.test.ts
- 🟡 PARC undoToast.test.ts
- 🟡 PARC webhookStatusPriority.test.ts
- 🟡 PARC whatsappAdapter.sendInteractive.test.ts
- 🟡 PARC lib/evoApiHealth/proxy.test.ts
- 🟡 PARC utils/exportReport.test.ts
- 🟡 PARC utils/imageCompression.test.ts
- 🟡 PARC utils/whatsappFileTypes.test.ts
- 🟡 PARC features/inbox/components/TextToAudioButton.auth.test.tsx
- 📋 PLAN Fase 2 de `lib/types/branded.ts` (brand real) — declarada, nunca feita
- 📋 PLAN ADR-005 PWA offline — `offlineQueue` implementada, feature não concluída
- 📋 PLAN `instrumentedExternal` — header declara "adoção incremental"; 1 call site em 6 meses
- 📋 PLAN Decisão dos 22 órfãos (12 raiz + 10 subdirs) — 5 na dead-code-allowlist sem veredito
- 📋 PLAN Reativar suítes `externalProxy`/`resilienceSimulation` OU concluir remoção do módulo
- 📋 PLAN Corrigir comentários `whatsappInstances.ts:25-28` (wpp2=produtiva)
- 📋 PLAN Renomear `debug-dompurify-test.ts` → `.test.ts`
- 📋 PLAN Corrigir comentário bloco `// DENO` do vitest.config.ts (afirma execução que não ocorre)
- 📋 PLAN Apagar cópia inline de `shouldUpdateStatus`/`STATUS_PRIORITY` e importar de `evolution-helpers.ts`
- 📋 PLAN Escrever/remover `it.skip` placeholder em `proxy.test.ts:204` e justificar describe.skip :355/:498
- 🟡 PARC 🟡 PARCIAL
- ❌ NÃO  ❌ NÃO INICIADA
- 📋 PLAN 📋 PLANO/FUTURO

### findings-12.md
- 🟡 PARC 36-backend-edge-functions
- 🟡 PARC 38-infra-ci-scripts
- 🟡 PARC 40-e2e-harness-data
- 📋 PLAN _ERRATA-TOPOLOGIA
- 📋 PLAN _ORFAOS-1C-consolidado
- 🟡 PARC **9 forwarders `ai-*`** → `ai-router` (auto-tag, churn, classify-tickets, conversation-analysis/summary, enhance-message
- ❌ NÃO  **`email-imap-bridge`** (300 ln) — STUB declarado: `TODO(EMAIL-02) NÃO implementado de verdade… IMAP/SMTP real é INVIÁVE
- ❌ NÃO  **`evolution-templates`** (158 ln) — CRUD/envio templates; gate `requireServiceRoleOrCron()` rejeita único chamador (bro
- ❌ NÃO  **`connection-health-check`** (463 ln) — health 3 camadas; **2 fetch diretos à Evolution API** (`:40`, `:151`, `requireE
- 🟡 PARC **3 funções fora do `ESTADO.md`**: `evolution-proxy` (209 ln, chamador real `ZappWebbDemoPage.tsx:56`), `evolution-group
- 🟡 PARC **19 candidatas sem chamador** (grupo F − `login-attempts` + as 2 acima); cron no banco = NAO_VERIFICADO
- 🟡 PARC **`followup-bridge`** (215 ln) — chamador existe (`useFollowupBridge.ts:62-63`) mas hook órfão (0 imports); arquivar fun
- 🟡 PARC **`send-email`** (142 ln) — marcada `DEPRECADO` mas **não é só redirect**: fallback Resend vivo p/ transacionais (503 se
- 🟡 PARC **`main`** (229 ln) — `PUBLIC_FNS` não lista `health`, `metrics`, `mcp`, `mcp-query`, `mcp-server`; comentário órfão `:4
- 🟡 PARC **Grupo B edge→edge**: 3 declaradas × **9 reais** (`send-email→gmail-send`, `public-api→evolution-api`, `webhook-diagnos
- ❌ **AC **A8 — 6 docblocks `evo.*` marcados defasados** (`_shared/evolution-webhook-handlers.ts:386`, `public-api/index.ts:56`, 
- 🟡 PARC **`sicoob-bridge-reply`** — depende de edge fn `chat-bridge` de projeto Supabase EXTERNO (Sicoob Gifts), acoplamento não
- 🟡 PARC Impl agregada: 0 stubs RAISE; 1 STUB (`email-imap-bridge`), 13 PARCIAIS, resto COMPLETA "no sentido de haver lógica real
- ❌ NÃO  **Realtime**: publication `supabase_realtime` tem **14 relations**; `evolution_messages`/`evolution_conversations` **NÃO
- ❌ NÃO  **Migrations**: 648 aplicadas × 325 arquivos; **387 aplicadas sem arquivo** (160 rótulos alfanuméricos via MCP, 88 squas
- ❌ NÃO  **`20260815035000_decouple_ops_pgnet_wrappers`** — único arquivo nunca aplicado por caminho nenhum: `ops.pg_net_get`/`pg
- ❌ NÃO  **Cron**: 222 jobs (211 ativos, 11 inativos); só 15 declarados; **207 vivos sem declaração**; 3 rotinas de retenção decl
- ❌ NÃO  **`whatsapp_reconcile_dispatch`** (jobid 27) — 91 falhas/701 execs (**13%**) por `job startup timeout` (saturação launch
- ❌ NÃO  **3 crons com bug SQL determinístico**: jobid 206 (`evo.evolution_audit_log does not exist`), 334 (`missing FROM-clause 
- ❌ NÃO  **`ops-notify-critical-alerts`** (jobid 84) — falha `invalid symbol "\" found while decoding base64` no `vault.decrypted
- ❌ NÃO  **VIVO_SEM_DECLARACAO**: ~822 funções (1.162 vivas × 340 declaradas), ~398 triggers (421 × 23), ~422 views `public` — su
- 🟡 PARC **55 tabelas residuais backup/staging** (`_dedup_backup_*`, `_remap_backup_*`, `_snap_pre_upgrade_*`…); cron `expire-sta
- 🟡 PARC **11 tabelas `zapp` RLS on + 0 policies (deny-all)**: 9 backups OK; **`contact_identity_lid_staging` e `license_heartbea
- 🟡 PARC **Retenção `cron.job_run_details` ~2,4 dias** (succeeded desde 14/08) — investigação >3 dias inviável
- 🟡 PARC **CLAUDE.md defasado em 8 contagens** (zapp 323→386, evo 136→70, ops 20→51, public 0 tabelas; `_wal_slot_guard_events` e
- 🟡 PARC `zapp.evolution_messages_wpp2_archive` — vive em **zapp** (não `evo` como documenta CLAUDE.md); sem parent
- ❌ NÃO  **`security-invoker-gate.yml` — required com `paths:` filter** → PR que não toca os paths **nunca reporta o contexto** e
- ❌ NÃO  **`deploy-vps-selfhosted.yml` marcado "⚠️ DRAFT — NÃO ativar" está ATIVO** em todo push na main (paths comentados); conc
- ❌ NÃO  **Pós-deploy desligado por nome errado**: `post-deploy-check.yml` escuta `["deploy-vps.yml"]` (nome real `🚀 Build & Depl
- 🟡 PARC **A1 (orquestrador corrigiu)**: `INV-5` exige `schema:'evo'` — não é o CI errado, é o CLAUDE.md (regra 4) invertido; **s
- 🟡 PARC **Sentinel fail-open**: sem `BRANCH_PROT_PAT` emite `::warning` + `exit 0` (38:82-88); enumera 10 contextos, não 11 — pr
- ❌ NÃO  **Guarda documentada como ativa sem CI**: `check-column-map.mjs` ("bloqueia PRs" — README/columnMap.ts) e `phys-refs-gat
- 🟡 PARC **`seed-e2e-user.yml` reusable sem chamador** — se usuário E2E sumir, 4 suítes quebram no pré-check sem auto-recuperação
- ❌ NÃO  **Build não reprodutível**: `Dockerfile:6-8` removeu `--frozen-lockfile` (tag flutuante `oven/bun:1.3-alpine`); CI valid
- 🟡 PARC `zapp-functions-health.yml:14,17` referencia `scripts/check-functions-health.sh` **inexistente no repo** (ou vive só na 
- 🟡 PARC **3 `.pyc` versionados sem fonte** (`scripts/__pycache__/…`, `__pycache__/ci_cost_analysis.cpython-314.pyc` na raiz, `.h
- 🟡 PARC **Dois alvos de deploy**: `vercel.json` (CSP/HSTS) × Docker/Swarm/Portainer (`zapp.atomicabr.com.br`) — nada declara o c
- 🟡 PARC **~19 scripts órfãos** (7 se apresentam como gates); par legado psql seed E2E (6 arquivos, superado por REST/RPC); subár
- 🟡 PARC **INV-6 fail-open silencioso** (sem `SUPABASE_DB_URL` → `exit 0`) — drift na publication pode passar sem aviso (por desi
- ❌ NÃO  **6 dos 13 specs nunca executam asserção**: 4 inbox (847 ln) por gate `RUN_INBOX_E2E` (nenhuma var definida em workflow 
- ❌ NÃO  **Drift de porta**: `vite.config.ts:116` (8080) × `playwright.config.ts:19,24` (5173) × `playwright.e2e.config.ts` (4173
- ❌ NÃO  **3 specs validam produção, não o PR**: `no-workbox-after-reload` → `https://zapp-web-v3.vercel.app/`; 2 previews → `*.l
- ❌ NÃO  **`VITE_SUPABASE_PUBLISHABLE_KEY`**: definida no `ci.yml:26` mas **não** no `quality-gate.yml:17-22` nem no harness → me
- ❌ NÃO  **`realtimeFanoutWildcard.test.ts`** — 26 casos testam cópia local (espelho auto-declarado); SUT real é `@/lib/realtime/
- ❌ NÃO  **`webhook-fuzzer.test.ts`** — `validateWebhookPayload` definida no próprio teste; 1.100 execs de property sobre validad
- ❌ NÃO  **Blocos "RLS/segurança" tautológicos** (`security-and-performance.test.ts:43-77,150-170`, `dlq-transfers-rls.test.ts:52
- 🟡 PARC **`src/test/realtimeEventParser.ts` órfão** (92 ln, 0 importadores, excluído da cobertura); o arquivo que mais precisari
- 🟡 PARC **`stress-test.test.ts`** — único teste é `it.skip` (se reativado, faria 10 reqs contra **produção**); existe só para re
- 🟡 PARC **`MockAuthProvider` no-op** — recebe `value` e descarta (`value: _value`); teste de logout passaria pelo motivo errado
- 🟡 PARC **`tsconfig.app.json:34-35`** exclui 2 testes que não existem mais; `src/_archive/**` fora do tsconfig-exclude (604 ln c
- 🟡 PARC **`retry: 2` em CI** (`vitest.config.ts:14`) mascara flakiness que o próprio `flaky-test-detector` procura
- 🟡 PARC **`sprint1-security-hardening.test.ts`** — grep sobre texto de migration (17 expects, zero SUT); premissa desmentida pel
- 🟡 PARC Quarentena de 27 suites no `vitest.config.ts:exclude` (ORPHAN/FAILING/DENO/NEEDS-ENV), honesta e documentada
- 📋 PLAN **6 correções reais propostas (0 ALTA, 3 MÉDIA, 3 BAIXA)** em 5 docs — precisão de caminho de acesso (view-bridge zapp),
- 📋 PLAN **Nota global de topologia** recomendada para `_HANDOFF.md`/`_PROGRESSO.md`/`01-frontend.md` (carimbo de data)
- ❌ NÃO  **CLAUDE.md obsoleto (4.1)** — afirma "zapp físico, evo NÃO EXISTE", regra 4 de Realtime invertida; contagens 323/136 vs
- ❌ NÃO  **3 docs irmãos contaminados pela premissa (4.2)**: `31-` (🔴 recomenda trocar `schema:'evo'`→`'zapp'` — **quebraria Real
- 📋 PLAN **GATE obrigatório** antes de aplicar qualquer correção: SQL `relkind` (esperado: evo `p`/`r`, zapp `v`); se divergir, d
- 📋 PLAN **7 acionáveis**: 4 VERIFICAR (`ContactKanbanView.tsx` 207 ln, `ContactMapView.tsx` 269 ln nome enganoso/PARCIAL, `Conta
- 📋 PLAN **~122+ arquivos pendentes de classificação** (tag ORFAO sem veredito; `/tmp/orfao-files.json`); classificação por arqui
- 🟡 PARC 🟡 PARCIAL
- ❌ NÃO  ❌ NÃO INICIADA
- 📋 PLAN 📋 PLANO/FUTURO

### findings-13.md
- ❌ **NÃ ADR-016

### findings-15.md
- ❌ pend I6 soberania de plataforma (supabase.yml/obs-*.yml no evolution-stack; atomica-platform sem GitOps)
- ❌ pend I7 dono único de migrations evo (51+ legadas; gate E42 inativo)
- ❌ pend I9 troca real de provider (ensaio real evolution→cloud)
- ❌ pend `ops.fn_evo_url`/`fn_evo_key` não versionadas (DB-as-source)
- ❌ pend sql-gate fixture 12 vs prod 25 (5 fns fora do fixture)
- ❌ pend CLAUDE.md desatualizado (topologia evo/zapp, Realtime, 136 vs 58 tabelas)
- ❌ pend consumer.py:239 INSERT em relação inexistente (telemetria perdida)
- ❌ pend 5 invoke('evolution-*') direto do React fora do adapter
- ❌ pend 303 arquivos src com nome do provider
- ❌ pend 115 fns evo EXECUTE PUBLIC p/ authenticated
- ❌ pend Secrets evolution_*: 2 pares duplicados
- ❌ pend Ensaio RUNBOOK_TROCA_PROVIDER nunca executado

### findings-17.md
- Preenc Preencher status ✅/⚠️/❌ de ~700 itens (componentes/hooks/tabelas/EFs)

### findings-20.md
- L4 `** ADR-004-remover-modulo-bpm.md

### findings-21.md
- ❌ Docu Deploy pipeline versionado (E35)
- ❌ Não  Introspector versão COMMIT_SHA (E36)
- ❌ Requ Escrita direta ao volume (E40)
- 🟡 ALTO 1.131 SECDEF expostas p/ authenticated (zapp)
- 🟡 ALTO 272 policies USING(true) zapp + 141+ evo
- 🟡 MÉDI PUBLIC INSERT em audit_logs (2 tabelas)
- 🟡 MÉDI `n8n_variables` policy errada (service_role_all→authenticated)
- 🟡 MÉDI `feature_flags` SELECT anon
- 🟡 MÉDI PAT na URL git da workspace (issue #168)
- 🟡 BAIX CORS_ORIGIN=* no supabase-db-mcp
- ❌ Pend git filter-repo (histórico JWT)

### findings-22.md
- ❌ **PE DADO-03/REDE-05/SAUDE-03 — `evolution-db-purge` Exited(137) OOM + Exited(127) command not found
- 🟡 P2 #43 imgproxy sem IMGPROXY_KEY/SALT (URLs não assinadas) + 8 buckets vazios
- 🟡 P2 — #47 `VAULT_ENC_KEY=your-encryption-key-32-chars-min` (placeholder!) no supavisor
- 🟡 P2 — #41 domínios legados na URI_ALLOW_LIST (whats-your-line.lovable.app, zapp-web-v3.vercel.app)
- 🟡 P2 — #38 cross-tenant artes/vendas/financeiro no mesmo PostgREST (isolamento só por RLS)
- 🟡 `PUBLIC_BUCKETS` já divergiu (recibos-entrega só em mediaUrl.ts:202)


## Seções de críticos/TODOs por finding

### findings-01.md

1. **128 páginas órfãs não roteadas** em `src/pages` (16 com `return-null`/`empty-handlers`, 1 com TODO/FIXME) — superfície morta ou incompleta sem acesso pela árvore de rotas (01 L748-888).
2. **CRÍTICO (arquitetura) em connections:** confusão `instance_name` (rota da Evolution API) × `instance_id` (UUID interno) — comentário "NEVER use instance_id in API routes → 404"; risco real de erro operacional (03 L186).
3. **`handleAddConnection` sem rollback:** cria instância na Evolution ANTES do INSERT no DB; falha do INSERT deixa instância órfã na Evolution (03 L187).
4. **Dashboard com dados falsos/hardcoded:** `avgResponseTime: null` nunca calculado, `refetch` vazio, `messagesHandled: 0`, war room zerado, `recentActivity` com 'Contact'/'' sem busca real (02 L160-164).
5. **`sendProductToContact` sem timeout** na chain Edge Function + DB inserts — envio de catálogo pode pendurar indefinidamente (02 L52).
6. **Progress bar fake no upload de emojis** (`setInterval` simula progresso) + campo `aiCategory` morto (02 L238-240).
7. **`useSLAConfigurations` com `staleTime: Infinity`** — mudanças de admin em outro cliente nunca refletem sem reload (03 L292).
8. **`useSLAMetrics` subreporta:** join `contacts!inner(assigned_to)` exclui conversas sem contato vinculado (03 L291).
9. **`useSLAHistory` não invalida por mudança de dia** — `new Date()` fora da `queryKey` (03 L290).
10. **`useContactAssignment` fire-and-forget sem invalidação de cache** → stale data na UI (03 L95); e **`health_status` nunca atualizado após teste de conexão Evolution** (falha silenciosa, 02 L284).


### findings-03.md

1. **Nenhum item com verificação de runtime** — as duas docs são análise estática (NAO_VERIFICADO); qualquer conclusão de "funcionando" exige validação em produção (06:735, 07:615).
2. **Núcleo realtime sem testes e parcialmente não auditado:** `useRealtimeMessages` (1019 linhas) e `useRealtimeInbox` (513) são o coração do inbox e não têm cobertura nem leitura completa (06:376, 06:693-696).
3. **Dual-path de mensagens** (`zapp.messages` legado × `evo.evolution_messages` cursor): risco de dados inconsistentes sem mecanismo de migração/fallback documentado (06:688-691; usoMessages PARCIAL 06:627).
4. **Envio: 11 de 14 itens 🟡 PARCIAL**, incl. o caminho crítico `messageSender.ts` (503 linhas) e a fila de retry (maxRetries=3, MAX_CONCURRENT=5) — sem evidência de execução (06:621, 06:649).
5. **`useMediaUrl` invoca Edge Fn sem AbortSignal** — anti-storm hardening manual via mountedRef; upgrade de SDK pode quebrar (07:573-576).
6. **`useRetryResolutionAlerts` SOFT_CAP=500** pode gerar toasts duplicados para o mesmo messageId em sessões longas (06:718-721).
7. **`MARK_READ_FLUSH_MS=250` em `useConversationActions`** pode deixar mensagens permanentemente não lidas se o componente desmontar antes do flush (06:723-726).
8. **Contrato frágil `touchLastSeen` `.eq('user_id')`** — refactor para `.eq('id')` quebra silenciosamente (07:518-521).
9. **Dead code público e test-only em produção** — `getRealtimeDiscardedCount` deprecated (06:698-701) e `_clear()`/`_reset()` expostos (06:703-706).
10. **Inconsistências estruturais sem critério documentado:** mix `safeClient`+`supabase` em `useTeamChatMutations` (A17, 07:598-601) e mix `dbFrom`+`supabase` em `whatsappStatusRepository` (A18, 07:603-606); `inboxPresetsSync` sem paginação (06:728-731).

### findings-04.md

1. **Persistência de sumários IA morta p/ não-admins** — conversationSummaryStorage.ts:14-19 (RLS ausente; escrita falha silenciosamente).
2. **ContactTagsContent decorativo** — ContactTagsContent.tsx:31,48,60: nenhuma ação de tag funciona em produção.
3. **6+ stubs de UI expostos** — Favoritar/Fixar/Reportar (MessageHoverToolbar.tsx:188-233), tags/resolvido (ChatHeaderMenu.tsx:58,85), videochamada (ChatHeader.tsx:246), Vídeo (ContactActionButtons.tsx:91).
4. **BUG-21 virtualização** — ChatMessagesArea.tsx:255-266: scroll desalinha em conversas com alto engajamento.
5. **Slash commands quebrados** — `/priority` stub (useInputHandlers.ts:174) e `/summary`→`aiAssistant` bug (l.236).
6. **Falsa cobertura de testes P0** — p0-regressions.test.ts:16-48 reimplementa `resolveContactRef`/`isValidUUID` localmente.
7. **Stickers: "Recentes" quebrado + upload inacessível** — StickerManager.tsx:84-91, 34/180-192.
8. **ConversationItem monolito divergente** — ConversationItem.tsx:212-714 ignora variantes refatoradas; TruncatedTooltip duplicado (l.117-156).
9. **onArchive silent-fail** — useChatPanelHandlers.ts:548: `/archive` sem prop não falha nem arquiva.
10. **Edições perdidas em conflito** — EditContactDialog.tsx:99 `_pendingData` nunca lido; somado a signed URL 7d (useChatScheduleMessage.ts:43) que invalida agendamentos longos.

### findings-05.md

1. **Sistema de fila/roteamento dormente por completo** (runtime VERIFICADO): 0 filas, 0 membros, 0 contatos atribuídos, `queue_positions` sem produtor; `QueuePositionNotifier` nunca exibe posição; decisão de produto pendente (#1001). — doc11 l.470-478, A4 l.412-413
2. **CRMAutoSync: feature morta sem aviso** — RPC `sync_to_crm` é STUB (RAISE P0001), erro silenciado por `catch {}`, `sentiment` hardcoded. Único item ❌. — doc10 A2, l.361
3. **Anon key exposta em Edge Function paga** — `TextToAudioButton.tsx:76-77` envia `VITE_SUPABASE_PUBLISHABLE_KEY` como apikey à EF `elevenlabs-tts` (chamada paga); `VoiceChanger.tsx:163` inconsistente com `VoiceChangerPicker.tsx:150`. Risco de abuso/custo. — doc11 A1/A2
4. **ChatPanel: 4 atalhos de teclado registrados porém vazios** (`onNextConversation`, `onPrevConversation`, `onArchive`, `onRefresh` = `() => {}`, l.278-283) — atalhos prometidos sem efeito. — doc10 A10
5. **ConversationContextMenu ilegível** — `bg-foreground` em l.93/183/214 coloca texto sobre fundo da mesma cor. — doc10 A1
6. **Navegação por histórico quebrada** — `ConversationHistory.tsx:199` passa `dayKey` (data string) onde consumidor espera UUID de conversa. — doc10 A4
7. **NextBestActionEngine: cards visuais sem handler** — `action` nunca atribuído; "Responder agora"/"Follow-up"/"Escalar SLA" não executáveis. — doc11 A3
8. **CloseConversationDialog sem transação** — `Promise.all` (l.113-145): falha parcial deixa registro de fechamento órfão; sem rollback. — doc10 A3
9. **GlobalSearch: quick actions no-ops + navegação por `window.location.hash`** fora do React Router — "Nova conversa"/"Respostas rápidas" apenas fecham o modal. — doc10 A9
10. **Componentes mortos/candidatos**: `MediaPreview.DocumentPreview` não renderiza documento (`_url` ignorado, l.46); `EmojiPicker` e `InboxKpiBar` sem importador direto confirmado; `TypingIndicator` variantes bubble/avatar sem consumidor; `BulkActionsToolbar` sem animação de saída (l.33,42). — doc10 A5/A19/A14, doc11 A13

> **Nota metodológica:** todos os status seguem fielmente as classificações dos docs (§7 Implementação por Arquivo); a única reclassificação foi `QueuePositionNotifier` (doc diz "COMPLETA (cliente)" mas runtime verificado mostra feature sem produtor → 🟡). Linhas citadas são as registradas nos próprios docs de auditoria. Runtime global dos docs: NAO_VERIFICADO.

### findings-06.md

1. **Merge de contatos sem transação atômica** — `ContactMergeDialog` faz 3 UPDATEs sequenciais (contacts/conversations/messages) sem RPC/transação; falha parcial deixa dados inconsistentes. Assimetria com `mergeContacts` RPC. (15@L281-282)
2. **Stub de satisfação no dashboard** — `SatisfactionMetrics` com `dataUnavailable = true` hardcoded exibe "indisponível" sem ticket; CSAT/NPS não existe na UI. (16@L343-344)
3. **Criação de conexão WA não conectada** — `AddConnectionDialog` (144L) sem nenhum importador; botão de conectar WhatsApp não existe na UI atual. (16@L334-335)
4. **RLS pode bloquear segmentos silenciosamente** — `SegmentsManagerDialog` trata erro hardcoded "RLS só permite SELECT em contact_segments"; CRUD de segmentos possivelmente inoperante em produção. (15@L287-288)
5. **Métricas falsas no dashboard** — `ConversationHeatmap` (response_time/satisfaction sempre 0) e `ActivityHeatmap` (resolutions cai em branch errado) exibem dados enganosos sem indicador. (16@L340-341, L352-353)
6. **Gamificação fictícia** — XP=1250, coins=89, streak=7 hardcoded no JSX do DashboardView; CSS vars do tema podem nem existir. (16@L337-338, L370-371)
7. **4-5 sistemas paralelos de Empty State + barrel quebrado** — proliferação de UI com `empty-states.tsx` re-exportando componente nunca consumido e conflito de nome `EmptyState`. (13@L397-401)
8. **Dead code certificado** — 9 stories (832 linhas) sem config `.storybook/`; `DashboardToolbar` (46L) nunca renderizada; `use-toast.ts` sem importadores. (13@L409-410, 16@L331-332, 13@L389)
9. **Backend sem UI (Automações)** — tabelas cron_schedules/task_queues/batch_jobs existem no schema mas aba de Automações não as expõe (TODO no código). (14@L462)
10. **Riscos de dados silenciosos** — CSV com "Invalid Date" (15@L293-294), typo `messagessSent` no ranking (16@L346-347), parâmetro inconsistente entre RPCs de duplicatas (15@L296-297).

*Fim do findings-06 — 4 arquivos lidos integralmente, 155 itens inventariados.*

### findings-07.md
1. **Realtime zappweb sem eventos** — `evolution_messages`/`evolution_conversations` fora da publication `supabase_realtime`; subscriptions nunca recebem INSERT/UPDATE (31:29-34, 150-161). Fix proposto original (schema 'evo'→'zapp') está INVERTIDO per errata — agir com cautela.
2. **Testes fantasma em produção** — 270 testes team-chat (218 `expect(true)`) + 52 gaps RLS (`expect(true)`); CI sempre verde sem cobertura real; gaps RLS podem existir em produção sem detecção (17:279-280).
3. **RLS team-chat sem verificação** — INSERT em `team_messages` sem membership check e ausência de DELETE policy em `team_conversations` documentados mas nunca testados (17:280).
4. **Errata topologia 31** — auditoria anterior publicou fix invertido (schema evo×zapp); topologia mudou 3× em 7 dias; revalidar `relkind` ao vivo antes de qualquer ação (31:6-37).
5. **Contradição entre docs** — doc 30 A1 classifica SELECT em partição `_wpp2` como BUG ("12–13 instâncias invisíveis", 30:207) vs doc 31 A2 afirma que os mesmos `from()` "estão corretos" (31:157-159). Decisão de fix depende de resolução.
6. **TeamPerformancePanel com dados aleatórios** — `Math.random()*100` em painel real; decisões operacionais baseadas em ruído (17:283).
7. **Auditoria de transferência quebrada** — `transferred_by: 'Support Agent'` hardcoded; logs de transferência inauditáveis (17:286).
8. **sentinel.ts no-op** — `validateRpcAccess` sem implementação; clientes external/serviceRole podem chamar RPCs privilegiadas sem bloqueio (30:216).
9. **connectionPool nunca inicializado** — feature inerte em produção (30:213).
10. **VirusTotal não persiste chave + NotificationsPanel sempre vazio + RateLimit action fixa 'block'** — 3 funcionalidades de segurança pela metade (18:345, 354, 351).

### findings-08.md

1. **🔴 A2 (32:184) — 3 RPCs de email sem migration no repo** (`rpc_email_mark_thread_read`, `rpc_email_token_status`, `rpc_get_email_health_summary`) chamados por código EM_USO em produção — drift repo×DB ou quebra silenciosa; precisa confirmação no banco.
2. **🔴 A1 (19:430-431) — RLS ausente em `notification_templates`** (nenhuma policy) e `notification_channels_config` só com SELECT: salvar/excluir canal/template retorna 42501 em produção.
3. **🔴 (20:315-316) — Credenciais SIP compartilhadas por todos os agentes** (senha única, sem isolamento por perfil) + 8 gaps VoIP abertos (sem SRTP, sem transfer/hold/gravação) — risco de acesso cruzado a chamadas.
4. **🔴 (32:28-35) — Camada `src/services` não integrada**: 33/46 arquivos órfãos (~53%, ~2.900 linhas); app usa hooks próprios em `src/hooks`; arquitetura Repository→Service→Hooks construída mas nunca adotada.
5. **🟠 A7 (20:334-337) — 3 integrações STUB em produção sem feature flag** (GoogleCalendar, N8n, Sentry): UI funcional, nenhuma ação persiste — usuário enganado.
6. **🟠 (19:439-440) — AutoExportManager STUB**: rota `/auto-export` entrega tela bloqueada com ShieldAlert; feature morta exposta na navegação.
7. **🟠 A3/A6 (32:185-188) — Factories de services com defeitos latentes**: `deleteMany` sempre retorna 0; invalidação TanStack nunca casa (users A5, messages A6); `QueryParams` page/pageSize vs limit/offset (A7).
8. **🟠 A2 (19:434) — Leaks de subscription Realtime** com `Math.random()` sem deps estáveis em TalkXLiveMonitor:45, TalkXView:93 e useConnectionStatusIndicator:147 (StrictMode/hot-reload acumulam canais).
9. **🟠 A9 (20:342-343) — Acessibilidade**: TourOverlay (13+ motion.*) e WelcomeModal ignoram `prefers-reduced-motion`, inconsistente com transitions/PageTransition que já implementa.
10. **🟡 A8 (20:339-340) — URL de produção da Evolution hardcoded no bundle** (`https://evolution.atomicabr.com.br` via DEFAULT_URL em EvolutionApiIntegrationView.tsx:17).

> Nota geral: runtime **NAO_VERIFICADO** em todos os docs — nenhuma execução real foi feita (sem node_modules/build/banco). Itens ✅ refletem COMPLETA por leitura estática + cadeia de importadores documentada; itens 🟡 carregam achados abertos (A1–A15) documentados nos próprios docs.

### findings-09.md

1. **useBulkActions — deleção arbitrária por `tableName` não sanitizado** (23:48, 23:347): hook completo mas órfão; `.delete()` em qualquer tabela; risco ALTO se reconectado a UI. Status 🟡.
2. **useCampaigns — feature de campanhas incompleta em produção** (23:55, 23:350; 21:283): RLS UPDATE/DELETE ausente (403) + motor `campanha-send` inexistente; botão "Iniciar" sem efeito real. 🟡.
3. **Duplicação massiva de hooks de email** (24:36/39/41, 24:297): `useEmail` (802L, 13 importadores) × `useEmailManagement` (1335L, 8) com lógica quase idêntica — divergência de comportamento em produção. 🟡.
4. **useGoalNotifications — bug lógico: métricas nunca comparadas** (24:65, 24:300): `check.value` sempre null; toasts disparam sem base real; `NOTIFY_THRESHOLDS` não usado. 🟡.
5. **BuildValidationOverlay expõe internals em produção via `?debug=true`** (21:34, 21:274): vazamento de informação sensível de build para qualquer usuário. ✅ com risco.
6. **useCSATAutoConfig sem produtor (DASHBOARD-05)** (23:52, 23:353): toggle persiste config que nada consome — envio automático CSAT silenciosamente inoperante. 🟡.
7. **NPSDashboard — nps-scheduler sem trigger (DASHBOARD-04)** (22:29, 22:285): NPS automático não funciona; alerta visível na UI. 🟡.
8. **ThemeProvider é stub silencioso** (22:15, 22:279): corpo `<>{children}</>`; props `defaultTheme`/`storageKey` ignoradas sem aviso. 🟡.
9. **useDashboardDataBatch órfão com RPC possivelmente inexistente** (24:26, 24:303): 154 linhas desperdiçadas; `rpc_dashboard_init` fora dos tipos gerados. 📋.
10. **AutomationEditorDialog destrói dados ao editar** (21:18, 21:277/280): `actions[0]` hardcoded perde múltiplas ações silenciosamente; `trigger_config` nunca persistido. 🟡.

Menções honrosas: ExportDropdown morto (22:13/282), webhookEventSchemas sem whitelist de tabela (22:300), mega-hooks useAudioManagement 1230L / useAutomationManagement 685L (23:359/362), useExternalDB com cache duplicado (24:306), useEvolutionApiManagement importado por edge function Deno (24:309).

---
*Relatório gerado por auditoria read-only dos 4 docs de estado. Nenhum arquivo do worktree foi modificado.*

### findings-10.md

1. **useLatestAnalysis é STUB ativo com consumidor real** — `useLatestAnalysis.ts:18` queryFn retorna `null` sempre; `AnalysisBadges.tsx` depende e fica vazio permanentemente (25 L318-319, GAP-6).
2. **useScheduledMessages duplamente quebrado** — RLS INSERT/UPDATE ausentes (403 silencioso) + nenhum cron/edge dispara `scheduled_messages`: mensagens agendadas nunca são enviadas em produção (26 L402-403, CAMPANHAS-09).
3. **useSyncToCRM inoperante mascarado** — RPC `sync_conversation_to_crm` é stub RAISE P0001 e `isConfigured=false` esconde o erro do usuário; feature "visualmente presente mas inoperante" (26 L405-406).
4. **useRateLimitConfigs: perda de dados + valor mascarado** — DELETE+INSERT sem transação (falha no INSERT esvazia `rate_limit_configs`) e `action` hardcoded `'block'` (25 L321-322, L336-337).
5. **useQueryTelemetry: DELETE direto do cliente** — `supabase.from('query_telemetry').delete()` sem RPC intermediária; risco de qualquer `authenticated` apagar logs de auditoria (25 L324-325).
6. **useKnowledgeBase usa bucket público `whatsapp-media`** — upload/signed URLs de arquivos KB no bucket público → exposição pública de conteúdo sensível (25 L327-328, L345-346; A4/A10).
7. **Escrita bloqueada por RLS em companies/contact_segments** — hooks detectam `rlsBlocked:true` mas toda UI de escrita de empresas/segmentos está inoperante (27 L290-292).
8. **useWebhookHealthAlerts: stubs explícitos com 4 consumidores** — activeBreaches/recentAlerts/history/setConfig/reloadHistory marcados `/* stub */`; UI depende de dados que nunca chegam (26 L414-415). Mesmo padrão em useWarRoomData (`alerts: []` hardcoded, 26 L411-412).
9. **3 testes mortos/STUB fora do CI** — useAudioRecorder.cleanup (runner Deno, 28 L359-360), usePushNotifications e useTextToSpeech (só `typeof fn`, zero comportamento, 29 L339-343). Regressões reais passariam silenciosamente.
10. **Cobertura fantasma em useApplicableSLA.test** — `resolveApplicableSLA` duplicada inline no teste; hook real não é importado; mudanças na lógica real nunca quebram o teste (28 L356-357). + defaultShortcuts 24 vs 25 entries (29 L360-361).

*Base: leitura integral dos 5 documentos de estado (1893 linhas); nenhum arquivo do worktree foi modificado.*

### findings-11.md

| # | Achado | Severidade | Evidência |
|---|---|---|---|
| 1 | `webhookStatusPriority.test.ts` é cobertura **negativa**: testa cópia divergente — produção `played=4`/`failed` condicional vs teste `played=3`/`failed` incondicional; teste afirma o oposto do runtime | 🔴 Crítico | 35:A1; repo: `evolution-helpers.ts:321,332` × `webhookStatusPriority.test.ts:10,18,104-110` |
| 2 | `externalProxy.ts` vivo em produção (5 importadores, incl. fallback de contato na inbox) com única suíte **desligada** (601 linhas comentadas) | 🔴 Crítico | 35:A2; repo: 5 importadores confirmados; `externalProxy.test.ts:619` |
| 3 | Auth do gateway `evoApi` sem teste: 8/26 casos (~31%) skip em `proxy.test.ts`, incluindo cache de token TTL 30s e fallback anon — sem justificativa | 🔴 Crítico | 39:A2; repo: `proxy.test.ts:185,204,355,498` |
| 4 | `whatsappFileTypes.test.ts` espelho integral: tautologia l.10-14; 15 exports (validação de upload/executáveis) com cobertura zero aparentando barreira testada | 🔴 Alta | 39:A1 |
| 5 | Refactor `crossTabDedupe` abandonado: 4 módulos mortos (297 linhas) + monólito 953 linhas com semântica **divergida** (BroadcastMessage/LockPayload) — editar o modular não muda produção | 🔴 Alta | 34:A1 |
| 6 | `whatsappInstances.ts:25-28`: comentários descrevem `wpp_pink_test` como ATIVA (estado pré-2026-07-26 que zerou a sidebar); 25 importadores; convida a regressão | 🔴 Alta | 34:A2/A3; 39:A5; repo verificado |
| 7 | `env.ts` órfão: hardcode `SUPABASE_PUBLIC_URL` em `mediaUrl.ts:32` serve 14 importadores; troca de ambiente exige editar código | 🟠 Alto | 33:A1; repo: 0 importadores confirmado |
| 8 | `healthCheck` stub que sempre reporta `healthy:true` com único importador `_archive`; religamento futuro = painel de saúde que mente | 🟠 Alto | 33:A2; repo confirmado |
| 9 | 3 colisões de alto risco: `RetryConfig` (shapes incompatíveis), `PUBLIC_BUCKETS` (2 Sets → mídia quebrada), `generateCorrelationId` (cripto × contador) | 🟠 Alto | 33:A3; repo: `retryConfig.ts:18`×`retryStrategyAudit.ts:33`; `mediaUrl.ts:202`×`useMediaUrl.ts:41` |
| 10 | 5 testes-espelho adicionais (`rateLimiter`, `groupsAutoSync`, `phoneNormalization`, `rlsGroupAccess`, `centenarias`) — 934 linhas verdes sem tocar produção; A1 provou que o risco já materializou | 🟠 Alto | 35:A3; 35:246-267 |

Menções honrosas: 39:A3 asserção vácuo `TextToAudioButton.auth.test.tsx:50` (env var indefinida); 33:A6 22 órfãos (~2.676 linhas) sem decisão; 34:A4 `isValidUUID` duplicado com trim assimétrico.

### findings-12.md

1. 🔴 **Realtime de mensagens/conversas morto em produção** — fora da publication `supabase_realtime` (14 relations, nenhuma de mensagem); medição viva 37:351-358 + confirmado pelo orquestrador 38:19-22; contradiz premissa da ERRATA §3.1.
2. 🔴 **`schema_migrations` não é ledger confiável** — 387 aplicadas sem arquivo / 64 arquivos sem aplicação; impossível reconstruir prod a partir do repo (37:364-366).
3. 🔴 **Deploy DRAFT concorrente com produção** — `deploy-vps-selfhosted.yml` ativo em todo push, concurrency separado, retenção GHCR 9×30 (38:316).
4. 🔴 **Observabilidade pós-deploy desligada por nome errado** — `post-deploy-check` nunca dispara; `notify-ci-failure` mira 5 workflows inexistentes (38:317).
5. 🔴 **Errata: 3 docs irmãos contaminados pela premissa invertida** — doc 31- recomenda `schema:'zapp'` (quebraria Realtime); interceptar (ERRATA 174-211).
6. 🔴 **`evolution-templates` 401 em 100% das chamadas do browser** (falha silenciosa) + `email-imap-bridge` STUB anunciando IMAP inviável + `connection-health-check` violando gateway (36:330-332).
7. 🔴 **6 dos 13 specs e2e nunca executam asserção** (1.092 ln descartadas; gate verde) + 3 specs testam produção externa (40:299-326).
8. 🟠 **Required check com paths filter** (`security-invoker-gate`) pode travar merge para sempre (38:315).
9. 🟠 **Crons quebrados**: 13% de falha no reconciliador de despacho (jobid 27) + 3 bugs SQL determinísticos (206/334/311) + vault base64 no alerta crítico (37:372-384).
10. 🟠 **Build não reprodutível** (sem `--frozen-lockfile`, base flutuante) e **822 funções/398 triggers vivos sem declaração** no repo (38:321; 37:386-388).

### findings-13.md

1. **E92 / V4-FINAL #62 — ensaio REAL evolution→cloud**: aguarda credenciais Meta (`WHATSAPP_CLOUD_PHONE_ID`/`TOKEN`). [CHECKLIST L26; ENSAIO_TROCA_PROVIDER_MEDIDO L28–30]
2. **E89 — consumer sem `PG_EVOLUTION_URL` / dual-write**: PR separado no evolution-stack (código+testes). [CHECKLIST L27; ADR-I4-ROTA-A L53]
3. **Congelamento formal das tabelas `evo` (V4-FINAL #75 / F7)**: COMMENT congelado + decisão 115 fns PUBLIC; D2 fica 9/10 até lá. [SCORECARD L38, L100]
4. **evolution-templates 401 (V4-FINAL #31)**: corrigir (rotear via gateway) ou aposentar com banner — hoje quebrada em silêncio. [ADR-011 L127]
5. **Remoção do `evolution-proxy` + migração `ZappWebbDemoPage`** (4 critérios do ADR-011 não cumpridos; INDEP E82). [ADR-011 L91–110; E93 L20]
6. **VALIDACAO_V4.md (#95) e RETRO_V4.md (#100) não existem**; tag `decouple-v4-complete` e cleanup branch/worktree não verificados. [ausência nos artefatos]
7. **Merge PRs #1083/#1084 na main + exigir teste de contrato Zod em PRs de resolvers/gateway** (D10). [SCORECARD L91–92, L101–103]
8. **I6 — soberania de plataforma incompleta**: repo `atomica-platform` não criado (E26), obs-*.yml (E28), zapp_health_guard (E30), gitops/stack destino (E31–E33), E35/E36 gates inversos, E37 prova destrutiva (sem staging). [T3; CHECKLIST L28–29; ADR-I4-ROTA-A L50]
9. **E53 — roles `evo_writer`/`zapp_writer` não criados** (service_role ainda com CRUD em evo). [T3 detail]
10. **ADR-016 não existe** (porta P4 decidida na prática via `fn_provider_call`; falta o ADR da decisão). [INDEP L285]
11. **E78 READ_CONTRACT_v1.md e E79 gate PGRST_DB_SCHEMAS** sem evidência; E86 (métricas P4), E88 (rotação HMAC), E90 (testes de caos) sem evidência. [INDEP E78–E90]
12. **E97 — boundary-audit como gate bloqueante nos dois repos**: apenas E98 (ratchet advisory) criado; E100 retro final pendente. [CHECKLIST L17; ADR-I4-ROTA-A L54]
13. **E6 (backup restaurável validado), E9/E10/E12 (staging, dashboard 7d, log_min_duration)** — Fase 0 incompleta. [INDEP E6–E12]
14. **I7 residual** — classificação exaustiva arquivo-a-arquivo do E40 (51+ migrations legadas com DDL evo). [CHECKLIST L30; ADR-015 L17]
15. **E54** — migration de teste de roles criada mas **não aplicada no banco** (próximo passo pós-PR). [CHECKLIST L35]
16. **V4-FINAL #13 deploy-edge.sh `_shared/**` sync** — sem evidência explícita de correção/verificação de hash nos docs lidos; #71 branches zumbis e #72 check-publish-evo-fallbacks sem evidência.
17. **ADR-008 divergência espelho Deno** (`CanonicalMessage`/`'queued'` vs `ChannelMessage`/`'pending'`) — sync E45 a revisar. [ADR-008 L104–112]
18. **Escopo pós-V4 declarado como trabalho futuro**: Cloud real, DROP físico `evo`, adoção em massa do registry além do piloto, G5/G6 infra evolution-stack. [V4-FINAL L356–364]


---

# PENDENCIAS CONSOLIDADAS (Onda 2 - decouple/raiz/edge/decisions/subdirs)

Total de itens nao-total (onda 2): 32


### findings-13.md
- ❌ **NÃ ADR-016

### findings-15.md
- ❌ pend I6 soberania de plataforma (supabase.yml/obs-*.yml no evolution-stack; atomica-platform sem GitOps)
- ❌ pend I7 dono único de migrations evo (51+ legadas; gate E42 inativo)
- ❌ pend I9 troca real de provider (ensaio real evolution→cloud)
- ❌ pend `ops.fn_evo_url`/`fn_evo_key` não versionadas (DB-as-source)
- ❌ pend sql-gate fixture 12 vs prod 25 (5 fns fora do fixture)
- ❌ pend CLAUDE.md desatualizado (topologia evo/zapp, Realtime, 136 vs 58 tabelas)
- ❌ pend consumer.py:239 INSERT em relação inexistente (telemetria perdida)
- ❌ pend 5 invoke('evolution-*') direto do React fora do adapter
- ❌ pend 303 arquivos src com nome do provider
- ❌ pend 115 fns evo EXECUTE PUBLIC p/ authenticated
- ❌ pend Secrets evolution_*: 2 pares duplicados
- ❌ pend Ensaio RUNBOOK_TROCA_PROVIDER nunca executado

### findings-17.md
- Preenc Preencher status ✅/⚠️/❌ de ~700 itens (componentes/hooks/tabelas/EFs)

### findings-20.md
- L4 `** ADR-004-remover-modulo-bpm.md

### findings-21.md
- ❌ Docu Deploy pipeline versionado (E35)
- ❌ Não  Introspector versão COMMIT_SHA (E36)
- ❌ Requ Escrita direta ao volume (E40)
- 🟡 ALTO 1.131 SECDEF expostas p/ authenticated (zapp)
- 🟡 ALTO 272 policies USING(true) zapp + 141+ evo
- 🟡 MÉDI PUBLIC INSERT em audit_logs (2 tabelas)
- 🟡 MÉDI `n8n_variables` policy errada (service_role_all→authenticated)
- 🟡 MÉDI `feature_flags` SELECT anon
- 🟡 MÉDI PAT na URL git da workspace (issue #168)
- 🟡 BAIX CORS_ORIGIN=* no supabase-db-mcp
- ❌ Pend git filter-repo (histórico JWT)

### findings-22.md
- ❌ **PE DADO-03/REDE-05/SAUDE-03 — `evolution-db-purge` Exited(137) OOM + Exited(127) command not found
- 🟡 P2 #43 imgproxy sem IMGPROXY_KEY/SALT (URLs não assinadas) + 8 buckets vazios
- 🟡 P2 — #47 `VAULT_ENC_KEY=your-encryption-key-32-chars-min` (placeholder!) no supavisor
- 🟡 P2 — #41 domínios legados na URI_ALLOW_LIST (whats-your-line.lovable.app, zapp-web-v3.vercel.app)
- 🟡 P2 — #38 cross-tenant artes/vendas/financeiro no mesmo PostgREST (isolamento só por RLS)
- 🟡 `PUBLIC_BUCKETS` já divergiu (recibos-entrega só em mediaUrl.ts:202)


## Seções críticas/pendências

### findings-13.md


### findings-13.md

1. **E92 / V4-FINAL #62 — ensaio REAL evolution→cloud**: aguarda credenciais Meta (`WHATSAPP_CLOUD_PHONE_ID`/`TOKEN`). [CHECKLIST L26; ENSAIO_TROCA_PROVIDER_MEDIDO L28–30]
2. **E89 — consumer sem `PG_EVOLUTION_URL` / dual-write**: PR separado no evolution-stack (código+testes). [CHECKLIST L27; ADR-I4-ROTA-A L53]
3. **Congelamento formal das tabelas `evo` (V4-FINAL #75 / F7)**: COMMENT congelado + decisão 115 fns PUBLIC; D2 fica 9/10 até lá. [SCORECARD L38, L100]
4. **evolution-templates 401 (V4-FINAL #31)**: corrigir (rotear via gateway) ou aposentar com banner — hoje quebrada em silêncio. [ADR-011 L127]
5. **Remoção do `evolution-proxy` + migração `ZappWebbDemoPage`** (4 critérios do ADR-011 não cumpridos; INDEP E82). [ADR-011 L91–110; E93 L20]
6. **VALIDACAO_V4.md (#95) e RETRO_V4.md (#100) não existem**; tag `decouple-v4-complete` e cleanup branch/worktree não verificados. [ausência nos artefatos]
7. **Merge PRs #1083/#1084 na main + exigir teste de contrato Zod em PRs de resolvers/gateway** (D10). [SCORECARD L91–92, L101–103]
8. **I6 — soberania de plataforma incompleta**: repo `atomica-platform` não criado (E26), obs-*.yml (E28), zapp_health_guard (E30), gitops/stack destino (E31–E33), E35/E36 gates inversos, E37 prova destrutiva (sem staging). [T3; CHECKLIST L28–29; ADR-I4-ROTA-A L50]
9. **E53 — roles `evo_writer`/`zapp_writer` não criados** (service_role ainda com CRUD em evo). [T3 detail]
10. **ADR-016 não existe** (porta P4 decidida na prática via `fn_provider_call`; falta o ADR da decisão). [INDEP L285]
11. **E78 READ_CONTRACT_v1.md e E79 gate PGRST_DB_SCHEMAS** sem evidência; E86 (métricas P4), E88 (rotação HMAC), E90 (testes de caos) sem evidência. [INDEP E78–E90]
12. **E97 — boundary-audit como gate bloqueante nos dois repos**: apenas E98 (ratchet advisory) criado; E100 retro final pendente. [CHECKLIST L17; ADR-I4-ROTA-A L54]
13. **E6 (backup restaurável validado), E9/E10/E12 (staging, dashboard 7d, log_min_duration)** — Fase 0 incompleta. [INDEP E6–E12]
14. **I7 residual** — classificação exaustiva arquivo-a-arquivo do E40 (51+ migrations legadas com DDL evo). [CHECKLIST L30; ADR-015 L17]
15. **E54** — migration de teste de roles criada mas **não aplicada no banco** (próximo passo pós-PR). [CHECKLIST L35]
16. **V4-FINAL #13 deploy-edge.sh `_shared/**` sync** — sem evidência explícita de correção/verificação de hash nos docs lidos; #71 branches zumbis e #72 check-publish-evo-fallbacks sem evidência.
17. **ADR-008 divergência espelho Deno** (`CanonicalMessage`/`'queued'` vs `ChannelMessage`/`'pending'`) — sync E45 a revisar. [ADR-008 L104–112]
18. **Escopo pós-V4 declarado como trabalho futuro**: Cloud real, DROP físico `evo`, adoção em massa do registry além do piloto, G5/G6 infra evolution-stack. [V4-FINAL L356–364]

### findings-14.md
| Trocar `proxyToEvolution` pelo `evolutionClient` + validação Zod nas ações cobertas | PENDENTE | "Cobertura efetiva de roteamento | 0/41 (0%)" |

---


### findings-14.md
| Não materialização do risco E23 (realtime) — revalidar antes de remover do runbook | PENDENTE (revalidação) | §(b) veredito — "Revalidar antes de remover o risco E23 do runbook" |

---


### findings-14.md

| Ação prescrita | Status | Evidência |
|---|---|---|
| C1: implementar `providers/cloud/client.ts` (12 verbos, Bearer, retry/backoff) + `case 'cloud'` no registry | PENDENTE | §3 C1 — "providers/cloud/client.ts NÃO EXISTE" (registry.ts L58 lança) |
| C3/C4/C5: fixes no `whatsapp-cloud-normalizer.ts` (content vazio audio/sticker; epoch 1970 no parseInt; JID duplo sem sanitizar) | PENDENTE | §3 C3/C4/C5 — "Fix necessário" (spec pronta no harness) |
| C6: migrar produção `whatsapp-cloud-webhook/index.ts` (legado, statuses só logados) para handler v2 + normalizer | PENDENTE | §3 C6 — "documentado, sem assert" |
| C2: fake simétrico (12 verbos, com getProfilePicture, sem sendAudio) | FEITO | §3 C2 — "JÁ CORRIGIDO na branch work-cloud-sim"; W8 resolvido |
| Checklist ligar cloud: env/secrets vault (4), conta Meta/WABA produção + template aprovado (janela 24h), webhook Meta com `messages`+`statuses`, código C1/C3/C4/C5/C6 + mode.ts + `ops.fn_cloud_*` + script flip/rollback + baseline recalculado | PENDENTE (aguarda aprovação de Joaquim) | §4 — checklist 4.1-4.4 integralmente `[ ]`; "Pendentes (bloqueiam o ENSAIO real, inalterados)" |

---


### findings-14.md
5. **CI_GATES_V4** — gates verdes em 14/08 (inventory 0, ownership 0, verb 12/12, sql-gate 0 violações); único ressalva: ts-nocheck falha ambiental no git-bash (roda no CI ubuntu).
6. **VAULT_SECRETS_V4** — FEITO: `evolution_api_key_v2` e `evolution_webhook_secret` deletados (dedup F6, 15/08). Pendente: documentar cadeia vault×swarm×env; verificar consumo evolution-stack (2 secrets).
7. **CREDENTIAL_BOUNDARY** — FEITO: `evo_reconciler` least-privilege (removeu superuser do reconcile). Pendente: secrets dedicados por consumidor (E34 estendida, não bloqueante).
8. **EVO_RETIREMENT_V4** — congelamento de ~25 tabelas frias BLOQUEADO por pré-condição (aprovação Joaquim + janela); decisão dos 115 grants pendente; verificação de ambiente MCP pendente.
9. **PAUSE_INGEST** — runbook nunca usado (nenhum registro); ⚠️ SQL do runbook referencia `evo.evolution_messages` que NÃO existe (vive em zapp) — corrigir antes do primeiro uso.
10. **CLOUD_CLIENT** — C1/C3/C4/C5/C6 pendentes (módulos spec prontos no harness); checklist de ligar cloud 100% `[ ]`; C2 (fake simétrico) FEITO. Harness 67/67 verde é prova de viabilidade, não entrega.
11. **INDICES_CLEANUP_PROPOSTA** — proposta aguardando revisão sênior; NENHUM DDL executado; 13 índices candidatos seguem no DB.
12. **CRON_FAILURES_7D** — 3 ações abertas: job 27 (confirmar correção da função ambígua + estado connecting), job 138 (0 execuções em 7d — verificar), vault_healthcheck com validação base64; demais falhas resolvidas (311/41/206/149 succeeded).

**Achados transversais:** (a) `evolution-templates` quebrada e `evolution-proxy` aposentável são as únicas ações com dono explícito (etapa #31 V4-FINAL) ainda sem execução; (b) o caminho cloud (P2/P3 + C1-C6) é o maior bloco pendente, todo ele dependente de aprovação de Joaquim; (c) drift entre PAUSE_INGEST (referencia `evo.evolution_messages`, "pg14") e a realidade medida (tabelas em zapp, PG 15.8) — runbook precisa de revisão.

### findings-15.md

---


### findings-15.md


### findings-15.md


### findings-15.md


### findings-15.md


### findings-15.md


### findings-15.md


### findings-15.md


### findings-15.md


### findings-15.md


### findings-15.md


### findings-15.md

---


### findings-16.md
`no-direct-evo-url` no CI, fix bug 404 consumer-stats, validar 2 migrations sem registro, 6 refs STALE da
baseline E41, threshold/guard e demais resíduos já fechados nas rodadas 2-3 da validação V3.


### findings-16.md

1. **Ensaio real troca de provider (E92)** — runbook pronto, ensaio fake medido (E91), troca real aguarda `WHATSAPP_CLOUD_PHONE_ID`/`WHATSAPP_CLOUD_TOKEN` (RUNBOOK L.86, L.107; SCORECARD_V3 L.68).
2. **Plugar `no-direct-evo-url.ts` no CI** — 0 violações, regra "não plugada = teatro" (AUDIT_EVO_REFS LOG L.97; RELATORIO_FINAL L.51, L.66).
3. **Bug bilateral consumer-stats 404** — POST HTTP ~30s acumulando 404; fix do lado evolution-stack (RELATORIO_FINAL L.50; LOG L.60, L.73).
4. **Validar migrations sem registro** `20260808280000`/`20260813180000` (RELATORIO_FINAL L.52; LOG L.84).
5. **6 refs STALE na baseline E41** do evolution-stack (RELATORIO_FINAL L.53; LOG L.89).
6. **Decisão Joaquim: rpc_upsert_contact 3-args × 14-args** (HANDOFF_POS L.53-58) — VALIDACAO_V3 R3 diz 1 overload (14 args) já consolidado (L.28) → verificar se decisão formal ocorreu.
7. **Drift consumer runtime** digest `9b1a5b967` × stack `0f4b07cfb` (RELATORIO_FINAL L.55; LOG L.109) e **labels OCI 2.3.7 vs prod 2.4.0** (RELATORIO_FINAL L.57).
8. **Scanopy/EDGE-01** (fora de lane): discovery-cron nunca dispara; manifesto `guardrail_edge_functions_v4` defasado (AGENTES_LANES L.34-35, L.42-53).
9. **Dependência reversa** evo→zapp (`fn_normalize_send_jid` 13x, `is_admin_or_supervisor` 6x) — formalizar contrato no BOUNDARY (RELATORIO_FINAL L.54).
10. **Guard security_invoker** — 7 views sem security_invoker (drift pré-existente, cron autofix existe) (RELATORIO_FINAL L.56).
11. **Aposentar 27 tabelas evo órfãs / congelamento formal** — P2 do SCORECARD_V3 (L.84) e HANDOFF_POS (schema-registry já registra evo como dono pós-Rota A).
12. **v237Fallbacks / contract.zod assumem 2.3.x** — prod roda 2.4.0; reavaliar após 60d (RELATORIO_FINAL L.46-47).


### findings-17.md

| Achado/Recomendação | Status | Evidência |
|---|---|---|
| GAP#1 cooldown por (source,alert_type) | EXECUTADO/validado | linhas 8-14 |
| GAP#2 sims dry-run (p_persist=false) sem tocar config prod | EXECUTADO/validado (75/90 restaurado) | linhas 16-24 |
| GAP#3 DROP overload 6-params ("is not unique") | EXECUTADO/validado | linhas 26-32 |
| REVOKE ALL FROM PUBLIC nas sim-functions + grants mínimos | EXECUTADO | linhas 46-49 |


### findings-17.md
8. **IMPROVEMENT_PLAN**: declara 100% mas 13 itens P2 seguem ⏳ no corpo + seções duplicadas contraditórias — doc precisa correção; métricas de sucesso sem marcação.
9. **FORGOTTEN_FEATURES (03-17)**: 14 módulos + 5 EFs + ~19 tabelas continuam **não documentados** — COMPLETE_SYSTEM_FEATURES.md ainda termina na seção 34 (verificado 16/08).
10. **ANALISE_BACKEND_PROFUNDA (05-20)**: C1/C2/C4/C5/C7/C8/C9/C10 sem evidência de fix; C3 parcialmente resolvido (0 USING(true) na INFRA, mas 48 sem workspace filter no AUDIT_REPORT — números contraditórios entre auditorias da mesma rodada); C6 parcial (search_path ok só nas 4 RPCs do FIX-01).
11. **LOVABLE_VS_ZAPP (07-04)**: P0 secrets (~20 EFs quebram) e P0 11 cron jobs não recriados (NPS confirmado ausente em 06/08); P1 54 tabelas/52 functions sem decisão de destino; drift de colunas funcional.
12. **PARIDADE (07-04)**: 8 triggers não religados (2 de segurança em password_reset_requests), secrets edge-runtime crítico (6/16 vars), revisão semântica de policies consolidadas pendente.

**Contradição inter-docs a reconciliar:** INFRA item 1 "0 policies USING(true)" vs AUDIT_REPORT_2026-08-06 A-3 "48 políticas USING(true)" (mesma data, 06/08).

### findings-18.md


### findings-18.md
- **Não verificável em modo read-only local:** RLS/contagens de políticas, buckets storage, visibilidade do repo, checklist `ops.*` do API_CONTRACT — exigem DB/GitHub/runtime.

*Gerado por subagente de auditoria — 2026-08-16. Worktree intacto (nenhuma escrita).*

### findings-21.md

---


### findings-21.md

---


### findings-21.md

1. 🔴 **migrate-helper vivo no cloud** com ACCESS_KEY commitada → deletar + rotacionar credenciais cloud (edge E4/E5/E33).
2. 🔴 **JWT_SECRET em 33 commits históricos** → rotação self-hosted + filter-repo (security).
3. 🔴 **Buckets PII públicos** (`whatsapp-media` 9,56 GB, `recibos-entrega`) → privado (db etapa 22).
4. 🟡 Secrets edge ausentes (E26: CRON_SECRET, WHATSAPP_CLOUD_*, ELEVENLABS_WEBHOOK_SECRET, SICOOB_GIFTS_*) → provisionar no stack 35.
5. 🟡 RLS permissivo: 272+141 policies USING(true), 1.131 SECDEF p/ authenticated, 18 tabelas sem policy (`_lgpd_payload`).
6. 🟡 ~49 SECDEF sem search_path fixo; 3 índices duplicados; cron job 15 sem qualificação.
7. 🟡 Deploy edge manual (E35/E36/E40 não implementados); prod-snapshot desatualizado pós-PR #664.

### findings-22.md

---


### findings-22.md
| FINAL_AUDIT_REPORT_2026-08-03.md — consolidação single-DB, nota **8,5/10**. Backlog: GAP-01 🔴 `fn_generate_constraints_reference()` inexistente em prod; GAP-02 🔴 sem DOWN migrations M1/M2; GAP-04 🔴 `ops.check_schema_parity` acoplado a função deprecated; 🔴 TS2339 em `evolution-sender`+`log-idempotency-miss`; 🟠 GAP-03 M2 não registrada em `schema_migrations`; 🟠 cron 44 `evo.mv_daily_kpis` inexistente; 🟠 remover edge fn `analyze-external-db` da VPS; 🟠 limpar `.env.required` (EXTERNAL_SUPABASE_*); 🟠 2 testes comment-out; working tree com edições do Worker 8 pendentes de commit | Pendente (dívida formalizada) | FINAL_AUDIT_REPORT_2026-08-03.md §3 (dívida conhecida) e §1.3 (GAP-01 a GAP-12) |
| hermes-senior-audit-2026-07-28.md — 9 críticos/5 altos/4 médios. 🔴 `.env` commitado 4× (chaves expostas), credenciais Lalamove em texto plano, `.env.staging` rastreado (já corrigido); bloat ~201MB (types.ts 90MB, .dist-backups 75MB, lalamove 23MB); cobertura testes 20,3% (src/pages 1,3%); 23 TODOs | Rotação de chaves P0 + BFG P1 **sem evidência de execução** | hermes-senior-audit-2026-07-28.md (Ações Imediatas 1-8) |
| SECURITY_AUDIT_BANCO_2026-08-03.md — postura forte (0 SECDEF sem search_path; 0 anon grants; RLS 100%) mas: **78 policies `true/true` p/ authenticated** (11 críticas: `zapp.agents.service_role_all` com role=authenticated, `rpc_rate_limits`, `processed_webhook_events`…); 6 policies INSERT com polroles NULL (contact_phones, perfis_usuarios…); 133 SECDEF expostas a authenticated com autorização interna não verificada | Recomendações não aplicadas; sugerido cron mensal de verificação | SECURITY_AUDIT_BANCO_2026-08-03.md §3.3, §3.5, §5.1-5.2 |

---


### findings-22.md
| REVISAO_BACKLOG_172.md | ✅ 172/172 revisados (Lotes A-C, 2026-08-02); taxa de defeito de referência 28/172 = 16,3% | :6 |
| AUDITORIA_EXECUCAO.md — foto 2026-08-02: Blocos 1-2 executados; **"Blocos 3-10: 80 etapas ainda a executar"** (suplantado pelo plano 20 etapas posterior) | Histórico | :tail "Blocos 3-10: 80 etapas ainda a executar" |
| PLANO_IMPLEMENTACAO_100.md (222KB, 200 achados) + INDICE_ACHADOS.md (gerado por script; gate `check-audit-docs-integrity.sh` reprova se dessincronizar) | Base da esteira; índice é derivado | INDICE_ACHADOS.md:3-5 |
| SUPLEMENTO_AUDITORIA_2026-08-02.md — 10 achados novos + 1 correção crítica F2-13 | Registrado no plano | :3-5 |
| PLANO30_DIAGNOSTICO_REAL.md (2026-08-05) — verificação do plano 30 etapas contra código: **4 refutados** | Registrado | :4 "## REFUTADOS (4)" |
| Inventários read-only: crons E12, circuit-breakers F9-19 (3 CBs divergentes p/ mesma Evolution API), retry-backoff, connection-creation-flow, triggers-whatsapp-connections, REALTIME_CHANNELS_AUDIT (diagnóstico A refutado; bug de topic estático fixado) | Documentação de estado, sem correção | crons-inventory.md:8, circuit-breakers-inventory.md:3-5 |
| audits/history/ (9): CI_COST_ANALYSIS, FLUXO_CLIQUE_CHATPANEL, PLANO_CORRECOES_CI_CD, QUALITY_METRICS, audit-summary, auditoria-edge-functions, auditoria_tabelas_zapp, data-loss-simulation, health-check-banco-2026-07-30 | Títulos apenas (histórico) | ls audits/history/ |

---


### findings-22.md

---


### findings-22.md

| Item | Status | Evidência |
|---|---|---|
| Placar geral: 56 confirmados / 17 superdimensionados / **5 refutados** / 2 não-verificáveis; nenhum doc caiu por inteiro; severidade inflada em 17 casos | Validação concluída | _CONSOLIDADO.md §1 (placar) |
| 🔴 **ADR-005 quebrada em prod: fila offline NÃO funciona** — `offlineQueue.ts:137` registra tag `send-queued-messages`; `sw.js:149` escuta `send-messages`; handler `sendQueuedMessages()` (sw.js:152) é `console.log` vazio | 🔴 Achado novo — feature aparenta existir e não faz nada | _CONSOLIDADO.md §4.1 |
| 🟠 **3 bypasses reais do gateway Evolution** (2 enviam WhatsApp): `evolution-templates` (:53 `fn_get_vault_secret('evolution_api_url')`, :81 `fetch(.../message/sendText)`), `evolution-notification-dispatcher` (:257/:270), + 2 parciais; **gate I8 dá garantia falsa** (varre pg_proc, edge functions Deno invisíveis) — recomendação não aplicada | 🟠 Aberto (decisão de arquitetura) | _CONSOLIDADO.md §8.2, §9 |
| `login-attempts` é **fail-open** (arquivar = desprotege lockout/blocklist/geo silenciosamente) — erro repetido 2× pelo orquestrador, corrigido em estado_atualizado.md §3.5 | Severidade 🟠 mantida | _CONSOLIDADO.md §8.1 (loginAttempts.ts:118-145) |
| Grupo F: 15 candidatas a arquivar (não 19); crons 476/477/478 ativos chamam `evolution-group-sync`/`evolution-notification-dispatcher`; `evolution-retry-metrics` derruba tela se arquivada | Corrigido no ESTADO.md | _CONSOLIDADO.md §8.3 |
| "Subsistema de filas dormente" — **FALSO** (filas ativas: 1 queue, 14 members, 21.934/21.945 contatos atribuídos, cron 335 `* * * * *`); SLA/CSAT sim dormentes | Erro factual do orquestrador (n_live_tup é estimativa + handoff vencido) | _CONSOLIDADO.md §2.1 |
| `VITE_SUPABASE_PUBLISHABLE_KEY` definida em 8 arquivos mas **não no quality-gate.yml** → guarda de regressão (TextToAudioButton.auth.test) muda de força entre workflows | 🟠 | _CONSOLIDADO.md §4.2 |
| `PUBLIC_BUCKETS` já divergiu (recibos-entrega só em mediaUrl.ts:202) | 🟡 | _CONSOLIDADO.md §4.3 |
| Citações arquivo:linha deslocadas (20+ casos, V4: 13 citações erradas) — corrigir por símbolo, não linha | Lição registrada | _CONSOLIDADO.md §5, §7 |
| V1-V6 placares: V1 8/6/0/0; V2 9/2/1/0; V3 15/4/0/1; V4 6/0/0/0; V5 4/2/2/0; V6 5/2/1/1; 12 órfãos→7 estritos (5 têm importador de teste) | Detalhe por doc | V1-lib-raiz.md:14-15, V2:16-17, V3:15-16, V5:15-17, V6:16-17 |

---


### findings-22.md
| evolution-restart-rabbitmq-bindings.md — runbook CRÍTICO pós-incidente 2026-07-10 (outage 12min): `/rabbitmq/set` quebrado na v2.3.7; bindings via management API; AE só via policy | ✅ runbook vigente | :3-8 |
| APPLY_ZAPP_EVOLUTION_BRIDGES.md — aplicar bridges zapp.evolution_* (pós-desacoplamento 2026-08-12; via MCP) | ✅ procedimento | :1-3 |
| VERCEL-ENV-FIX-20260810.md — passos exatos do fix (3 envs + redeploy + verificação do payload do bundle) | ⚠️ execução = pendência do LOGIN-ONDA | :3-14 |
| media-pipeline-ops.md v3.0 — pipeline mídia pós-correção + monitoramento WAL | ✅ vigente | :3-15 |
| deploy.md, OPERATIONS_CALENDAR.md (**Q3 2026 simulações 2026-08-17 a 2026-08-28 — janela iminente**), session-followups-2026-07-11 (R13/R14), session-report-2026-07-11 (audit 10/10; alerta multi-sessão; follow-ups não bloqueantes), validation-battery-2026-07-11 (~490 cenários; conflito R13 arbitrado por Joaquim) | Histórico/calendário | heads |

---


### findings-22.md

1. 🔴 **Fila offline quebrada em produção (ADR-005)** — tag `send-queued-messages` ≠ `send-messages` + handler vazio (`sw.js:152`) — validacao/_CONSOLIDADO.md §4.1.
2. 🔴 **3 bypasses do gateway Evolution em prod** (2 enviam WhatsApp via vault) + gate I8 cego a edge functions — validacao/_CONSOLIDADO.md §8.2/§9.
3. 🟠 **Rotação MCP_QUERY_SECRET (P1, valor vazado)** não executada — ops/MCP-QUERY-SECRET-ROTATION.md:3-5.
4. 🟠 **Secrets do Swarm NÃO montados no service functions** — infra/2026-08-03_docker_secrets_migration.md:3.
5. 🟠 **Rotação AUTHENTICATION_API_KEY Evolution pendente (VPS)** — infra/git-secrets-rotation.md:4.
6. 🟠 **evolution-db-purge OOM (137)+cmd not found (127)** — audit-2026-08-06 (P1 aberto).
7. 🟠 **Vercel envs (www.zappweb.app.br bloqueado) + GAP-1 bundle com service_role key** — runbooks/LOGIN-ONDA-20260810.md tail; LOGIN-SIMULACAO GAP-1.
8. 🟠 **53 funções anon+SECDEF em financeiro/artes/vendas aguardam aprovação** — history/SECURITY_AUDIT_LEGADOS.md.
9. 🟠 **Avatar migration (1066 avatares só no Lovable Cloud) PLANEJADO-NÃO-EXECUTADO** — playbooks/AVATAR-MIGRATION-PLAN.md:3.
10. 🟠 **Bugs de upload/mídia (7, 1 P0 403) sem evidência de fix** — audit/CHAT_UPLOAD_AUDIT.md.
11. 🟡 Dívidas menores: 62 migrations pendentes de commit, D-1 cron 161, Google OAuth (decisão), `VAULT_ENC_KEY` placeholder, GAP-01..12 do relatório 8,5/10, `@ts-nocheck` CRM, 78 policies RLS true/true, watchdog lockout, decisão isolamento multi-tenant (Pink), provisionamento Grafana/CI schema-snapshot.
