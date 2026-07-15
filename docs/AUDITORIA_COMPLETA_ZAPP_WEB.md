# AUDITORIA EXAUSTIVA — ZAPP-WEB
## Checklist de Verificação Frontend vs Backend

**Projeto:** zapp-web (WhatsApp Multiatendimento)
**Repositório:** github.com/adm01-debug/zapp-web
**Data da auditoria:** 03/04/2026 (atualizado: 2026-07-15)
**Totais:** 431 componentes | 126 hooks | 18 páginas | 48 Edge Functions | **315 tabelas (schema zapp) + 193 tabelas (schema evo)** | 145 migrações | 49 views/rotas

> **⚠️ Banco correto**: Supabase Self-Hosted em `supabase.atomicabr.com.br`. Schema padrão da aplicação: `zapp` (315 tabelas). Mensagens WhatsApp: schema `evo` (193 tabelas). Schema `public` = zero tabelas. A contagem anterior de "117 tabelas" estava incorreta e foi corrigida em 2026-07-15 via auditoria MCP.

---

## COMO USAR ESTE DOCUMENTO

Para cada funcionalidade listada abaixo, verifique:
- ✅ **Implementado** — O front-end tem componente funcional conectado ao backend
- ⚠️ **Parcial** — Componente existe mas não está conectado ou está incompleto
- ❌ **Ausente** — Não existe componente no front-end para esta funcionalidade
- 🔌 **Backend only** — Edge Function ou tabela existe, mas sem interface

Marque o status de cada item e indique o que precisa ser criado/corrigido.

---

## 1. NAVEGAÇÃO PRINCIPAL (Sidebar)

### 1.1 Primary Nav
| # | View ID | Label | Componente Principal | Status |
|---|---------|-------|---------------------|--------|
| 1 | `inbox` | Chat | `RealtimeInboxView` → `ChatPanel` + `ConversationList` + `ContactDetails` | |
| 2 | `team-chat` | Chat Interno | `TeamChatView` → `TeamChatPanel` + `TeamConversationList` | |
| 3 | `contacts` | Contatos | `ContactsView` → `ContactForm` + `AdvancedCRMSearch` | |
| 4 | `groups` | Grupos | `GroupsView` | |
| 5 | `dashboard` | Dashboard | `DashboardView` → 23 widgets (heatmap, metrics, SLA, sentiment, goals, etc.) | |
| 6 | `agents` | Equipe | `AgentsView` → `InviteAgentDialog` + `ConfigurePermissionsDialog` | |

### 1.2 Comunicação
| # | View ID | Label | Componente Principal | Status |
|---|---------|-------|---------------------|--------|
| 7 | `campaigns` | Campanhas | `CampaignsView` | |
| 8 | `wa-templates` | Templates WA | `WhatsAppTemplatesManager` | |
| 9 | `gmail` | Gmail | `GmailInboxView` → `EmailThreadView` + `EmailComposer` | |
| 10 | `omnichannel` | Omnichannel | `OmnichannelManager` → `ChannelRoutingRules` | |
| 11 | `omni-inbox` | Inbox Omni | `OmnichannelInbox` | |
| 12 | `voip` | VoIP | `VoIPPanel` → `CallDialog` + `DialPad` + `IncomingCallAlert` | |

### 1.3 Automação & IA
| # | View ID | Label | Componente Principal | Status |
|---|---------|-------|---------------------|--------|
| 13 | `chatbot` | Chatbot | `ChatbotFlowsView` → `ChatbotFlowEditor` + `ChatbotExecutionsDashboard` | |
| 14 | `automations` | Automações | `AutomationsManager` | |
| 15 | `wa-flows` | WhatsApp Flows | `WhatsAppFlowsBuilder` | |
| 16 | `knowledge` | Base de Conhecimento | `KnowledgeBaseView` | |
| 17 | `churn` | Previsão Churn | `ChurnPredictionDashboard` | |
| 18 | `ticket-classifier` | Classificador IA | `AutoTicketClassifier` | |

### 1.4 Vendas & CRM
| # | View ID | Label | Componente Principal | Status |
|---|---------|-------|---------------------|--------|
| 19 | `pipeline` | Pipeline | `SalesPipelineView` | |
| 20 | `wallet` | Carteira | `ClientWalletView` | |
| 21 | `catalog` | Catálogo | `ExternalProductManagement` → `ExternalProductCatalog` + `ProductCard` + `ShoppingCart` | |
| 22 | `payments` | Pagamentos | `PaymentLinksView` | |
| 23 | `tags` | Etiquetas | `TagsView` | |
| 24 | `queues` | Filas | `QueuesView` → `CreateQueueDialog` + `AddMemberDialog` + `QueueCharts` + `QueueGoalsDialog` | |
| 25 | `schedule` | Agendamentos | `ScheduleCalendarView` | |

### 1.5 Conexões
| # | View ID | Label | Componente Principal | Status |
|---|---------|-------|---------------------|--------|
| 26 | `connections` | Conexões WhatsApp | `ConnectionsView` → `InstanceSettingsDialog` + `BusinessHoursDialog` + `ConnectionQueuesDialog` + `FarewellMessageConfig` | |
| 27 | `integrations` | Integrações | `IntegrationsHub` → `GmailIntegration` + `GoogleCalendarIntegration` + `GoogleSheetsIntegrationView` + `N8nIntegrationView` + `SentryIntegrationView` | |
| 28 | `meta-capi` | Meta CAPI | `MetaCAPIView` | |
| 29 | `google-calendar` | Calendário | `GoogleCalendarIntegration` | |

### 1.6 Analytics
| # | View ID | Label | Componente Principal | Status |
|---|---------|-------|---------------------|--------|
| 30 | `reports` | Relatórios | `AdvancedReportsView` → `AdvancedExportDialog` + `ExportButton` + `ScheduledReportsManager` | |
| 31 | `auto-export` | Export Auto | `AutoExportManager` → `ScheduledReportConfigs` | |
| 32 | `warroom` | War Room | `WarRoomDashboard` | |
| 33 | `sentiment` | Sentimento | `SentimentAlertsDashboard` → `SentimentTrendChart` | |
| 34 | `transcriptions` | Transcrições | `TranscriptionsHistoryView` | |
| 35 | `achievements` | Conquistas | `AchievementsSystem` → `AchievementsPanel` + `AchievementBadge` + `TrainingMiniGames` | |
| 36 | `diagnostics` | Diagnóstico | `DiagnosticsView` → `ConnectionHealthPanel` | |
| 37 | `performance` | Performance | `PerformanceMonitor` | |
| 38 | `telemetry` | Telemetria BD | `AdminTelemetriaPage` → `TelemetryCharts` | |
| 39 | `nps` | NPS | `NPSDashboard` | |

### 1.7 Sistema
| # | View ID | Label | Componente Principal | Status |
|---|---------|-------|---------------------|--------|
| 40 | `audit-logs` | Auditoria | `AuditLogDashboard` | |
| 41 | `privacy` | LGPD | `LGPDComplianceView` | |
| 42 | `security` | Segurança | `SecurityView` → `SecurityOverview` + `SecuritySettingsPanel` + `GeoBlockingPanel` + `IPWhitelistPanel` + `BlockedIPsPanel` + `DevicesPanel` + `PasskeysPanel` + `RateLimitConfigPanel` + `PasswordResetRequestsPanel` + `SecurityNotificationsPanel` | |
| 43 | `admin` | Admin | `AdminView` → `ForceLogoutButton` + `VisibilityGrantsManager` | |
| 44 | `themes` | Skins | `ThemeCustomizer` | |
| 45 | `docs` | Documentação | `SystemFeaturesView` | |
| 46 | `settings` | Configurações | `SettingsView` → 24 sub-componentes de settings | |

---

## 2. MÓDULO INBOX (Chat) — 98 componentes

### 2.1 Chat Core
| # | Componente | Função | Status |
|---|-----------|--------|--------|
| 1 | `ChatPanel` | Painel principal de conversa | |
| 2 | `ChatHeader` | Header com nome, badges CRM, status, SLA | |
| 3 | `ChatInputArea` | Área de digitação com toolbar | |
| 4 | `ChatMessageInput` | Input de texto com markdown, menções | |
| 5 | `ChatMessagesArea` | Área de mensagens com scroll infinito | |
| 6 | `ChatMessageBubble` | Bolha de mensagem (texto, mídia, interativa) | |
| 7 | `ChatAssignedBar` | Barra de atribuição de agente | |
| 8 | `ChatPanelHeader` | Header expandido com SLA | |
| 9 | `ChatDragOverlay` | Overlay para drag & drop de arquivos | |
| 10 | `ChatWatermark` | Marca d'água do sistema | |
| 11 | `ChatQuickRepliesPopover` | Popover de respostas rápidas | |

### 2.2 Mensagens Especiais
| # | Componente | Função | Status |
|---|-----------|--------|--------|
| 12 | `InteractiveMessage` | Renderiza botões, listas, CTA | |
| 13 | `InteractiveMessageBuilder` | Construtor de mensagens interativas | |
| 14 | `LocationMessage` | Mensagem de localização | |
| 15 | `LocationPicker` | Seletor de localização (Mapbox) | |
| 16 | `CarouselMessage` | Carrossel de produtos | |
| 17 | `LinkPreview` | Preview de links compartilhados | |
| 18 | `AudioMessagePlayer` | Player de áudio com waveform | |
| 19 | `DeletedMessagePlaceholder` | Placeholder para mensagem deletada | |
| 20 | `ReplyQuote` | Citação de mensagem respondida | |
| 21 | `MessageReactions` | Reações em mensagens (emojis) | |
| 22 | `MessageStatus` | Status da mensagem (enviado/entregue/lido) | |
| 23 | `StickerPicker` | Seletor de figurinhas | |
| 24 | `CustomEmojiPicker` | Seletor de emojis personalizados | |

### 2.3 Mídias
| # | Componente | Função | Status |
|---|-----------|--------|--------|
| 25 | `FileUploader` | Upload de arquivos | |
| 26 | `ImagePreview` | Preview de imagem | |
| 27 | `MediaPreview` | Preview genérico de mídia | |
| 28 | `MediaGallery` | Galeria de mídias da conversa | |
| 29 | `AudioRecorder` | Gravação de áudio | |
| 30 | `AudioMemePicker` | Seletor de áudios meme | |

### 2.4 IA & Automação no Chat
| # | Componente | Função | Status |
|---|-----------|--------|--------|
| 31 | `AISuggestions` | Sugestões de resposta por IA | |
| 32 | `AIConversationAssistant` | Assistente IA de conversa | |
| 33 | `AIEnhanceButton` | Botão para melhorar mensagem com IA | |
| 34 | `AIRewriteButton` | Botão para reescrever com IA | |
| 35 | `SentimentIndicator` | Indicador de sentimento da conversa | |
| 36 | `ConversationSummary` | Resumo automático da conversa | |
| 37 | `RealtimeTranscription` | Transcrição em tempo real | |
| 38 | `TextToSpeechButton` | Botão text-to-speech | |
| 39 | `TextToAudioButton` | Converter texto em áudio (ElevenLabs) | |
| 40 | `VoiceChanger` | Mudança de voz | |
| 41 | `VoiceSelector` | Seletor de voz (ElevenLabs) | |
| 42 | `SpeedSelector` | Seletor de velocidade de voz | |

### 2.5 Contato (Painel Lateral)
| # | Componente | Função | Status |
|---|-----------|--------|--------|
| 43 | `ContactDetails` | Painel lateral de detalhes | |
| 44 | `ContactHeaderSection` | Header com avatar, nome, badges VIP, logo empresa | |
| 45 | `ContactInfoSection` | Info editável (telefone, email, empresa, cargo) | |
| 46 | `ContactStatsSection` | Estatísticas (mensagens, tempo médio, conversas, CSAT) | |
| 47 | `AssignmentSection` | Atribuição de agente e fila | |
| 48 | `SLAAndAITagsSection` | SLA status + tags IA | |
| 49 | `EngagementScore` | Score visual circular de engajamento | |
| 50 | `PrivateNotes` | Notas privadas do contato | |
| 51 | `ConversationHistory` | Histórico de conversas anteriores | |
| 52 | `EditContactDialog` | Dialog para editar contato | |
| 53 | `WhatsAppStatusSection` | Status WhatsApp do contato | |

### 2.6 CRM 360° (integração externa)
| # | Componente | Função | Status |
|---|-----------|--------|--------|
| 54 | `ExternalContact360Panel` | Painel 360°: empresa, cliente, RFM, DISC, social, endereço | |
| 55 | `ContactIntelligencePanel` | Briefing, gatilhos mentais, rapport, horários, churn, DISC tips | |
| 56 | `CRMAutoSync` | Auto-sync conversa→CRM ao resolver + detecção sentimento | |
| 57 | `CRMSyncButton` | Botão manual de sync no header | |
| 58 | `CRMConversationBadge` | Badge de empresa na ConversationList (batch) | |
| 59 | `AdvancedCRMSearch` | Busca avançada com 6 filtros + paginação | |

### 2.7 Operações no Chat
| # | Componente | Função | Status |
|---|-----------|--------|--------|
| 60 | `TransferDialog` | Transferir conversa para agente/fila | |
| 61 | `ForwardMessageDialog` | Encaminhar mensagem | |
| 62 | `ScheduleMessageDialog` | Agendar envio de mensagem | |
| 63 | `TemplatesWithVariables` | Templates com variáveis dinâmicas | |
| 64 | `MessageTemplates` | Lista de templates de mensagem | |
| 65 | `SlashCommands` | Comandos slash no input | |
| 66 | `QuickRepliesManager` | Gerenciador de respostas rápidas | |
| 67 | `BulkActionsToolbar` | Ações em massa em conversas | |
| 68 | `TicketTabs` | Abas de tickets (abertas, pendentes, etc.) | |
| 69 | `WhisperMode` | Modo sussurro (supervisão) | |
| 70 | `GlobalSearch` | Busca global (mensagens, contatos, CRM) | |

### 2.8 Colaboração em Tempo Real
| # | Componente | Função | Status |
|---|-----------|--------|--------|
| 71 | `RealtimeCollaboration` | Colaboração em tempo real entre agentes | |
| 72 | `TypingIndicator` | Indicador de digitação | |
| 73 | `NewMessageIndicator` | Indicador de novas mensagens | |
| 74 | `QueuePositionNotifier` | Notificador de posição na fila | |
| 75 | `SLAIndicator` | Indicador visual de SLA | |

---

## 3. EDGE FUNCTIONS — 48 funções

### 3.1 IA & NLP
| # | Edge Function | Descrição | Componente Frontend que usa | Status |
|---|--------------|-----------|---------------------------|--------|
| 1 | `ai-auto-tag` | Auto-classificação de conversas com IA | `AutoTicketClassifier` | |
| 2 | `ai-churn-analysis` | Análise de risco de churn | `ChurnPredictionDashboard` | |
| 3 | `ai-classify-tickets` | Classificação de tickets | `AutoTicketClassifier` | |
| 4 | `ai-conversation-analysis` | Análise de sentimento/tópicos | `ConversationSummary` | |
| 5 | `ai-conversation-summary` | Resumo automático de conversa | `ConversationSummary` | |
| 6 | `ai-enhance-message` | Melhorar redação de mensagem | `AIEnhanceButton` | |
| 7 | `ai-suggest-reply` | Sugestão de resposta | `AISuggestions` | |
| 8 | `ai-transcribe-audio` | Transcrição de áudio | `RealtimeTranscription` | |
| 9 | `sentiment-alert` | Alertas de sentimento negativo | `SentimentAlertsDashboard` | |

### 3.2 ElevenLabs (Voz)
| # | Edge Function | Descrição | Componente Frontend | Status |
|---|--------------|-----------|-------------------|--------|
| 10 | `elevenlabs-tts` | Text-to-speech | `TextToSpeechButton` | |
| 11 | `elevenlabs-tts-stream` | TTS streaming | `TextToAudioButton` | |
| 12 | `elevenlabs-sts` | Speech-to-speech | `VoiceChanger` | |
| 13 | `elevenlabs-sfx` | Efeitos sonoros | `AudioMemePicker` | |
| 14 | `elevenlabs-dialogue` | Diálogos de voz | `ElevenLabsDialogue` | |
| 15 | `elevenlabs-voice-design` | Design de voz | `ElevenLabsVoiceDesign` | |
| 16 | `elevenlabs-scribe-token` | Token de transcrição | `RealtimeTranscription` | |
| 17 | `elevenlabs-webhook` | Webhook ElevenLabs | Webhook (sem UI) | |

### 3.3 WhatsApp / Evolution API
| # | Edge Function | Descrição | Componente Frontend | Status |
|---|--------------|-----------|-------------------|--------|
| 18 | `evolution-api` | Proxy para Evolution API | `useEvolutionApi` hook | |
| 19 | `evolution-sync` | Sincronização de mensagens | `ConnectionsView` | |
| 20 | `evolution-webhook` | Webhook de mensagens recebidas | Webhook (sem UI) | |
| 21 | `whatsapp-webhook` | Webhook WhatsApp Business | Webhook (sem UI) | |

### 3.4 Gmail
| # | Edge Function | Descrição | Componente Frontend | Status |
|---|--------------|-----------|-------------------|--------|
| 22 | `gmail-oauth` | Autenticação OAuth Gmail | `GmailIntegration` | |
| 23 | `gmail-send` | Envio de emails | `EmailComposer` | |
| 24 | `gmail-sync` | Sincronização de emails | `GmailInboxView` | |
| 25 | `gmail-webhook` | Webhook de novos emails | Webhook (sem UI) | |

### 3.5 Segurança & Auth
| # | Edge Function | Descrição | Componente Frontend | Status |
|---|--------------|-----------|-------------------|--------|
| 26 | `webauthn` | Autenticação biométrica/passkeys | `PasskeysPanel` | |
| 27 | `create-user` | Criação de usuário | `InviteAgentDialog` | |
| 28 | `approve-password-reset` | Aprovação de reset de senha | `PasswordResetRequestsPanel` | |
| 29 | `detect-new-device` | Detecção de novo dispositivo | `DevicesPanel` | |
| 30 | `cleanup-rate-limit-logs` | Limpeza de logs rate limit | `RateLimitConfigPanel` | |
| 31 | `send-rate-limit-alert` | Alerta de rate limit | `RateLimitRealtimeAlerts` | |
| 32 | `get-sip-password` | Senha SIP para VoIP | `VoIPPanel` | |

### 3.6 Integrações
| # | Edge Function | Descrição | Componente Frontend | Status |
|---|--------------|-----------|-------------------|--------|
| 33 | `bitrix-api` | Proxy para Bitrix24 | `useBitrixApi` hook | |
| 34 | `sicoob-bridge` | Bridge para sistema Sicoob | Integração específica | |
| 35 | `sicoob-bridge-reply` | Resposta via bridge Sicoob | Integração específica | |
| 36 | `external-db-bridge` | Bridge para banco CRM externo | `useExternalContact360` hooks | |
| 37 | `promogifts-catalog` | Catálogo de produtos externo | `ExternalProductCatalog` | |
| 38 | `get-mapbox-token` | Token Mapbox para mapas | `LocationPicker` | |
| 39 | `public-api` | API pública do sistema | API externa | |

### 3.7 Utilitários
| # | Edge Function | Descrição | Componente Frontend | Status |
|---|--------------|-----------|-------------------|--------|
| 40 | `send-email` | Envio de emails transacionais | `send-email` (Resend) | |
| 41 | `send-scheduled-report` | Envio de relatórios agendados | `ScheduledReportsManager` | |
| 42 | `connection-health-check` | Saúde das conexões WhatsApp | `ConnectionHealthPanel` | |
| 43 | `batch-fetch-avatars` | Busca batch de avatares | `ContactsView` | |
| 44 | `chatbot-l1` | Chatbot nível 1 (automático) | `ChatbotL1Config` | |
| 45 | `classify-audio-meme` | Classificação de áudio meme | `AudioMemePicker` | |
| 46 | `classify-emoji` | Classificação de emojis | `CustomEmojiPicker` | |
| 47 | `classify-sticker` | Classificação de stickers | `StickerPicker` | |
| 48 | `migrate-media-storage` | Migração de storage de mídias | Admin tool (sem UI) | |

---

## 4. HOOKS — 126 hooks

### 4.1 Chat & Mensagens
| # | Hook | Função | Usado por | Status |
|---|------|--------|-----------|--------|
| 1 | `useMessages` | CRUD de mensagens | `ChatMessagesArea` | |
| 2 | `useRealtimeMessages` | Mensagens em tempo real | `RealtimeInboxView` | |
| 3 | `useMessageReactions` | Reações em mensagens | `MessageReactions` | |
| 4 | `useMessageStatus` | Status das mensagens | `MessageStatus` | |
| 5 | `useMessageSignature` | Assinatura de mensagens | `ChatInputArea` | |
| 6 | `useScheduledMessages` | Mensagens agendadas | `ScheduleMessageDialog` | |
| 7 | `useTypingPresence` | Presença de digitação | `TypingIndicator` | |
| 8 | `useChatKeyboardNavigation` | Navegação por teclado no chat | `ChatPanel` | |
| 9 | `useQuickReplies` | Respostas rápidas | `ChatQuickRepliesPopover` | |

### 4.2 Contatos & CRM
| # | Hook | Função | Usado por | Status |
|---|------|--------|-----------|--------|
| 10 | `useContactsSearch` | Busca local de contatos | `ContactsView` | |
| 11 | `useContactEnrichedData` | Dados enriquecidos do contato | `ContactDetails` | |
| 12 | `useContactStats` | Estatísticas do contato | `ContactStatsSection` | |
| 13 | `useContactNotes` | Notas privadas | `PrivateNotes` | |
| 14 | `useContactCustomFields` | Campos personalizados | `CustomFieldsSection` | |
| 15 | `useContactAssignment` | Atribuição de contato | `AssignmentSection` | |
| 16 | `useExternalContact360` | CRM 360° por telefone | `ExternalContact360Panel` | |
| 17 | `useExternalContact360Batch` | CRM batch para lista | `ConversationList` | |
| 18 | `useAdvancedContactSearch` | Busca avançada CRM | `AdvancedCRMSearch` | |
| 19 | `useContactIntelligence` | Inteligência comercial | `ContactIntelligencePanel` | |
| 20 | `useSyncToCRM` | Sync conversa→CRM | `CRMAutoSync` | |

### 4.3 Agentes & Filas
| # | Hook | Função | Usado por | Status |
|---|------|--------|-----------|--------|
| 21 | `useAgents` | Lista de agentes | `AgentsView` | |
| 22 | `useAgentGamification` | Gamificação de agentes | `AchievementsSystem` | |
| 23 | `useQueues` | Gestão de filas | `QueuesView` | |
| 24 | `useQueueAnalytics` | Analytics de filas | `QueueCharts` | |
| 25 | `useQueueGoals` | Metas de filas | `QueueGoalsDialog` | |
| 26 | `useQueuesComparison` | Comparação entre filas | `QueuesComparisonDashboard` | |
| 27 | `useConnectionQueues` | Filas por conexão | `ConnectionQueuesDialog` | |

### 4.4 Automação & IA
| # | Hook | Função | Usado por | Status |
|---|------|--------|-----------|--------|
| 28 | `useChatbotFlows` | Fluxos de chatbot | `ChatbotFlowsView` | |
| 29 | `useConversationAnalyses` | Análises de conversa | `ConversationSummary` | |
| 30 | `useSentimentAlerts` | Alertas de sentimento | `SentimentAlertsDashboard` | |
| 31 | `useRealtimeSentimentAlerts` | Alertas sentimento realtime | `RealtimeSentimentAlertProvider` | |
| 32 | `useAutoCloseConversations` | Auto-fechamento | `AutoCloseSettings` | |

### 4.5 WhatsApp & Evolution API
| # | Hook | Função | Usado por | Status |
|---|------|--------|-----------|--------|
| 33 | `useEvolutionApi` | API Evolution | `ChatPanel`, `ConnectionsView` | |
| 34 | `useBusinessHours` | Horário comercial | `BusinessHoursDialog` | |
| 35 | `useWhatsAppStatus` | Status da conexão WhatsApp | `WhatsAppStatusSection` | |
| 36 | `useIncomingCallListener` | Listener de chamadas recebidas | `IncomingCallAlert` | |

### 4.6 Dashboard & Analytics
| # | Hook | Função | Usado por | Status |
|---|------|--------|-----------|--------|
| 37 | `useDashboardData` | Dados do dashboard | `DashboardView` | |
| 38 | `useDashboardWidgets` | Widgets configuráveis | `DraggableWidgetContainer` | |
| 39 | `useRealtimeDashboard` | Dashboard em tempo real | `RealtimeMetricsPanel` | |
| 40 | `useWarRoomAlerts` | Alertas War Room | `WarRoomDashboard` | |
| 41 | `useSLAMetrics` | Métricas SLA | `SLAMetricsDashboard` | |
| 42 | `useSLAHistory` | Histórico SLA | `SLAHistoryDashboard` | |
| 43 | `useSLANotifications` | Notificações SLA | `SLANotificationProvider` | |

### 4.7 Segurança
| # | Hook | Função | Usado por | Status |
|---|------|--------|-----------|--------|
| 44 | `useAuth` | Autenticação principal | `ProtectedRoute`, tudo | |
| 45 | `usePermissions` | Permissões RBAC | `PermissionGate` | |
| 46 | `useUserRole` | Role do usuário | `PermissionMatrix` | |
| 47 | `useMFA` | Multi-factor auth | `MFAEnroll`, `MFAVerify` | |
| 48 | `useWebAuthn` | Passkeys/biometria | `PasskeysPanel` | |
| 49 | `useScreenProtection` | Proteção de tela | `ScreenProtectionToggle` | |
| 50 | `useReauthentication` | Reautenticação | `ReauthDialog` | |
| 51 | `useRateLimitLogs` | Logs de rate limit | `RateLimitConfigPanel` | |

### 4.8 Mídia & Voz
| # | Hook | Função | Usado por | Status |
|---|------|--------|-----------|--------|
| 52 | `useAudioRecorder` | Gravação de áudio | `AudioRecorder` | |
| 53 | `useSpeechToText` | Speech-to-text | `VoiceDictationButton` | |
| 54 | `useTextToSpeech` | Text-to-speech | `TextToSpeechButton` | |
| 55 | `useSipClient` | Cliente SIP VoIP | `VoIPPanel` | |
| 56 | `useCalls` | Gestão de chamadas | `CallDialog` | |

### 4.9 UX & Utilidades
| # | Hook | Função | Usado por | Status |
|---|------|--------|-----------|--------|
| 57 | `useTheme` | Tema claro/escuro | `ThemeToggle` | |
| 58 | `useNotifications` | Notificações | `NotificationCenter` | |
| 59 | `useNotificationSettings` | Config notificações | `NotificationSettingsPanel` | |
| 60 | `usePushNotifications` | Push notifications | `PushNotificationSettings` | |
| 61 | `useGlobalSettings` | Configurações globais | `SettingsView` | |
| 62 | `useUserSettings` | Configurações do usuário | `SettingsView` | |
| 63 | `useOnboarding` | Fluxo de onboarding | `OnboardingTour` | |
| 64 | `useOnboardingChecklist` | Checklist onboarding | `OnboardingChecklist` | |
| 65 | `useGlobalKeyboardShortcuts` | Atalhos globais | `GlobalKeyboardProvider` | |
| 66 | `useServiceWorker` | Service Worker / PWA | `App.tsx` | |
| 67 | `useNetworkStatus` | Status de rede online/offline | `OfflineIndicator` | |
| 68 | `useImportData` | Importação de dados | `DataImporter` | |
| 69 | `useExportData` | Exportação de dados | `ExportDropdown` | |
| 70 | `useTags` | Gestão de tags | `TagsView` | |
| 71 | `useCampaigns` | Gestão de campanhas | `CampaignsView` | |
| 72 | `useCSAT` | Pesquisa de satisfação | `CSATDashboard` | |
| 73 | `useNPSSurveys` | Pesquisa NPS | `NPSDashboard` | |
| 74 | `useGmail` | Integração Gmail | `GmailInboxView` | |
| 75 | `useTeamChat` | Chat interno de equipe | `TeamChatView` | |
| 76 | `useExternalCatalog` | Catálogo externo | `ExternalProductCatalog` | |
| 77 | `useShoppingCart` | Carrinho de compras | `ShoppingCart` | |
| 78 | `useBitrixApi` | API Bitrix24 | `IntegrationsHub` | |

---

## 5. TABELAS SUPABASE — 117 entidades

### 5.1 Core
| # | Tabela | Descrição | CRUD no Frontend? | Status |
|---|--------|-----------|-------------------|--------|
| 1 | `profiles` | Perfis de agentes/usuários | | |
| 2 | `contacts` | Contatos (clientes WhatsApp) | | |
| 3 | `messages` | Mensagens de conversas | | |
| 4 | `tags` | Etiquetas | | |
| 5 | `contact_tags` | Tags vinculadas a contatos | | |
| 6 | `contact_notes` | Notas privadas | | |
| 7 | `contact_custom_fields` | Campos customizados | | |

### 5.2 Filas & Atribuição
| # | Tabela | Descrição | CRUD no Frontend? | Status |
|---|--------|-----------|-------------------|--------|
| 8 | `queues` | Filas de atendimento | | |
| 9 | `queue_members` | Membros das filas | | |
| 10 | `queue_positions` | Posições na fila | | |
| 11 | `queue_goals` | Metas das filas | | |
| 12 | `queue_skill_requirements` | Skills requeridas por fila | | |

### 5.3 WhatsApp & Conexões
| # | Tabela | Descrição | CRUD no Frontend? | Status |
|---|--------|-----------|-------------------|--------|
| 13 | `whatsapp_connections` | Conexões WhatsApp (instâncias) | | |
| 14 | `whatsapp_connection_queues` | Filas por conexão | | |
| 15 | `whatsapp_templates` | Templates de mensagem | | |
| 16 | `whatsapp_groups` | Grupos WhatsApp | | |
| 17 | `whatsapp_flows` | WhatsApp Flows | | |
| 18 | `channel_connections` | Conexões multi-canal | | |
| 19 | `channel_routing_rules` | Regras de roteamento | | |
| 20 | `connection_health_logs` | Logs de saúde da conexão | | |
| 21 | `business_hours` | Horários comerciais | | |
| 22 | `away_messages` | Mensagens de ausência | | |

### 5.4 IA & Analytics
| # | Tabela | Descrição | CRUD no Frontend? | Status |
|---|--------|-----------|-------------------|--------|
| 23 | `conversation_analyses` | Análises de conversa | | |
| 24 | `conversation_sla` | SLA por conversa | | |
| 25 | `ai_conversation_tags` | Tags geradas por IA | | |
| 26 | `csat_surveys` | Pesquisas CSAT | | |
| 27 | `csat_auto_config` | Config auto CSAT | | |
| 28 | `nps_surveys` | Pesquisas NPS | | |
| 29 | `warroom_alerts` | Alertas War Room | | |

### 5.5 Automação
| # | Tabela | Descrição | CRUD no Frontend? | Status |
|---|--------|-----------|-------------------|--------|
| 30 | `automations` | Regras de automação | | |
| 31 | `chatbot_flows` | Fluxos de chatbot | | |
| 32 | `chatbot_executions` | Execuções de chatbot | | |
| 33 | `followup_sequences` | Sequências de follow-up | | |
| 34 | `followup_steps` | Passos de follow-up | | |
| 35 | `followup_executions` | Execuções de follow-up | | |
| 36 | `scheduled_messages` | Mensagens agendadas | | |
| 37 | `auto_close_config` | Config auto-fechamento | | |

### 5.6 Vendas & CRM
| # | Tabela | Descrição | CRUD no Frontend? | Status |
|---|--------|-----------|-------------------|--------|
| 38 | `sales_deals` | Negócios/oportunidades | | |
| 39 | `sales_pipeline_stages` | Estágios do pipeline | | |
| 40 | `deal_activities` | Atividades dos deals | | |
| 41 | `products` | Produtos internos | | |
| 42 | `campaigns` | Campanhas de marketing | | |
| 43 | `campaign_contacts` | Contatos das campanhas | | |
| 44 | `payment_links` | Links de pagamento | | |
| 45 | `client_wallet_rules` | Regras da carteira de clientes | | |

### 5.7 Gmail
| # | Tabela | Descrição | CRUD no Frontend? | Status |
|---|--------|-----------|-------------------|--------|
| 46 | `gmail_accounts` | Contas Gmail conectadas | | |
| 47 | `email_threads` | Threads de email | | |
| 48 | `email_messages` | Mensagens de email | | |
| 49 | `email_labels` | Labels do Gmail | | |

### 5.8 Gamificação
| # | Tabela | Descrição | CRUD no Frontend? | Status |
|---|--------|-----------|-------------------|--------|
| 50 | `agent_achievements` | Conquistas dos agentes | | |
| 51 | `agent_skills` | Skills dos agentes | | |
| 52 | `agent_stats` | Estatísticas dos agentes | | |
| 53 | `goals_configurations` | Configuração de metas | | |

### 5.9 Segurança
| # | Tabela | Descrição | CRUD no Frontend? | Status |
|---|--------|-----------|-------------------|--------|
| 54 | `audit_logs` | Logs de auditoria | | |
| 55 | `login_attempts` | Tentativas de login | | |
| 56 | `user_devices` | Dispositivos do usuário | | |
| 57 | `user_sessions` | Sessões ativas | | |
| 58 | `passkey_credentials` | Credenciais passkey | | |
| 59 | `webauthn_challenges` | Desafios WebAuthn | | |
| 60 | `mfa_sessions` | Sessões MFA | | |
| 61 | `security_alerts` | Alertas de segurança | | |
| 62 | `blocked_ips` | IPs bloqueados | | |
| 63 | `ip_whitelist` | IPs permitidos | | |
| 64 | `allowed_countries` | Países permitidos | | |
| 65 | `blocked_countries` | Países bloqueados | | |
| 66 | `geo_blocking_settings` | Config geo-blocking | | |
| 67 | `rate_limit_configs` | Config rate limit | | |
| 68 | `rate_limit_logs` | Logs rate limit | | |
| 69 | `webhook_rate_limits` | Rate limit de webhooks | | |
| 70 | `password_reset_requests` | Requests de reset senha | | |

### 5.10 Configurações & Permissões
| # | Tabela | Descrição | CRUD no Frontend? | Status |
|---|--------|-----------|-------------------|--------|
| 71 | `user_roles` | Roles dos usuários | | |
| 72 | `permissions` | Permissões do sistema | | |
| 73 | `role_permissions` | Permissões por role | | |
| 74 | `user_settings` | Configurações do usuário | | |
| 75 | `global_settings` | Configurações globais | | |
| 76 | `sla_configurations` | Configurações de SLA | | |
| 77 | `agent_visibility_grants` | Grants de visibilidade | | |
| 78 | `saved_filters` | Filtros salvos | | |
| 79 | `notification_settings` (via hook) | Config de notificações | | |

### 5.11 Outros
| # | Tabela | Descrição | CRUD no Frontend? | Status |
|---|--------|-----------|-------------------|--------|
| 80 | `stickers` | Stickers/figurinhas | | |
| 81 | `custom_emojis` | Emojis personalizados | | |
| 82 | `audio_memes` | Áudios meme | | |
| 83 | `message_templates` | Templates de mensagem | | |
| 84 | `message_reactions` | Reações em mensagens | | |
| 85 | `entity_versions` | Versionamento de entidades | | |
| 86 | `knowledge_base_articles` | Artigos base conhecimento | | |
| 87 | `knowledge_base_files` | Arquivos base conhecimento | | |
| 88 | `scheduled_reports` | Relatórios agendados | | |
| 89 | `scheduled_report_configs` | Config relatórios agendados | | |
| 90 | `calls` | Registro de chamadas | | |
| 91 | `meta_capi_events` | Eventos Meta CAPI | | |
| 92 | `sicoob_contact_mapping` | Mapeamento Sicoob | | |
| 93 | `query_telemetry` | Telemetria de queries | | |
| 94 | `team_conversations` | Conversas chat interno | | |
| 95 | `team_messages` | Mensagens chat interno | | |
| 96 | `team_conversation_members` | Membros chat interno | | |
| 97 | `whisper_messages` | Mensagens sussurro | | |

---

## 6. PÁGINAS & ROTAS STANDALONE

| # | Página | Rota | Função | Status |
|---|--------|------|--------|--------|
| 1 | `Auth` | `/auth` | Login/cadastro | |
| 2 | `ForgotPassword` | `/forgot-password` | Recuperação de senha | |
| 3 | `ResetPassword` | `/reset-password` | Reset de senha | |
| 4 | `VerifyEmail` | `/verify-email` | Verificação de email | |
| 5 | `TwoFactorAuth` | `/2fa` | Autenticação 2 fatores | |
| 6 | `SSOCallback` | `/sso-callback` | Callback SSO | |
| 7 | `Install` | `/install` | PWA install page | |
| 8 | `ChatPopup` | `/chat-popup` | Chat em popup (widget) | |
| 9 | `QueueDetails` | `/queue/:id` | Detalhes de fila | |
| 10 | `QueuesComparison` | `/queues-comparison` | Comparação de filas | |
| 11 | `SLADashboard` | `/sla-dashboard` | Dashboard SLA | |
| 12 | `SLAHistory` | `/sla-history` | Histórico SLA | |
| 13 | `RolesPage` | `/admin/roles` | Gestão de roles/permissões | |
| 14 | `RateLimitDashboard` | `/admin/rate-limit` | Dashboard rate limit | |
| 15 | `NotFound` | `*` | Página 404 | |

---

## 7. RPCs DO CRM EXTERNO (bancodadosclientes)

| # | RPC | Input | Componente Frontend | Status |
|---|-----|-------|-------------------|--------|
| 1 | `get_contact_360_by_phone` | phone → JSONB 360° | `ExternalContact360Panel` | |
| 2 | `search_contacts_advanced` | 10 params → paginado | `AdvancedCRMSearch` | |
| 3 | `get_companies_by_phones_batch` | phones[] → Map | `CRMConversationBadge` (batch) | |
| 4 | `sync_interaction_from_zapp` | 11 params → sync | `CRMAutoSync` | |
| 5 | `get_contact_intelligence_by_phone` | phone → 7 seções | `ContactIntelligencePanel` | |
| 6 | `recalculate_rfm_for_company` | company_id → scores | Auto (chamado pelo sync) | |

---

## 8. RESUMO QUANTITATIVO

| Categoria | Total | Com Frontend | Sem Frontend | % Cobertura |
|-----------|-------|-------------|-------------|-------------|
| Views/Rotas na Sidebar | 46 | | | |
| Componentes | 431 | | | |
| Hooks | 126 | | | |
| Edge Functions | 48 | | | |
| Tabelas Supabase | ~97 (app) | | | |
| Páginas standalone | 15 | | | |
| RPCs CRM externo | 6 | | | |

---

## INSTRUÇÕES PARA O LOVABLE

1. **Percorra cada seção** deste documento e marque o status de cada item
2. **Para itens ❌ ou ⚠️**, crie ou corrija o componente frontend necessário
3. **Priorize** por impacto: Edge Functions sem frontend > Hooks não utilizados > Tabelas sem CRUD
4. **Verifique** se cada componente está realmente conectado ao backend (não apenas renderizando dados mock)
5. **Teste** cada rota da sidebar para garantir que abre corretamente
6. **Verifique conexão com Supabase** — cada hook deve fazer query real, não retornar dados hardcoded
7. **Reporte** um resumo de quantos itens estão ✅, ⚠️ e ❌ ao final
