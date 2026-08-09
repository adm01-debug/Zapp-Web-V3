# Estado: features/inbox/components — Raiz M–Z (segunda metade)

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 57/57

## 1. Visão Geral

Segunda metade alfabética dos arquivos soltos na raiz de `src/features/inbox/components/`, cobrindo de `MessageStatus.tsx` até `voiceChangerParts.tsx`. O conjunto abrange componentes de UI, hooks locais, utilitários e constantes que suportam o núcleo do inbox omnichannel.

### Tabela de Arquivos por Categoria

| arquivo | linhas | o que faz em 1 linha |
|---------|--------|----------------------|
| **Indicadores de status** | | |
| MessageStatus.tsx | 119 | Ícone+tooltip de status de mensagem (pending/sent/delivered/read/failed/retrying) |
| SentimentIndicator.tsx | 206 | 3 componentes visuais de sentimento (badge, emoji, barra de progresso) — recebe props |
| SLAIndicator.tsx | 196 | Anel SVG + badge de SLA com modos compact/full e tooltip |
| SLAIndicatorForContact.tsx | 198 | Wrapper que resolve regra SLA por hierarquia e repassa para SLAIndicator |
| TranscriptionStatusBadge.tsx | 74 | Badge animado de status de transcrição (processing/completed/failed) com retry |
| TypingIndicator.tsx | 325 | 6 variantes de indicador de digitação animado (default/bubble/minimal/avatar + compact + inline) |
| **Modais e Dialogs** | | |
| NewConversationModal.tsx | 129 | Modal de nova conversa (busca contato existente ou cria novo) |
| ScheduleMessageDialog.tsx | 214 | Dialog para agendar mensagem com atalhos rápidos e suporte a anexo |
| TransferDialog.tsx | 347 | Dialog de transferência para agente/fila/conexão WA |
| VideoFullscreen.tsx | 76 | Modal fullscreen de vídeo com mute/velocidade |
| **Painéis e Drawers** | | |
| PrivateNotes.tsx | 276 | CRUD de notas privadas por contato com controle de autoria |
| RemindersPanel.tsx | 200 | CRUD de lembretes por contato com atalhos de tempo |
| RealtimeCollaboration.tsx | 69 | Painel de colaboração (viewers, notas internas, handoff) |
| TicketHistorySheet.tsx | 323 | Drawer com histórico unificado de eventos, conversation_events e audit_logs |
| UniversityHelp.tsx | 239 | Painel de sugestão de resposta via IA com seleção de tom |
| WhisperMode.tsx | 262 | Painel colapsável de mensagens internas (whisper) com Realtime |
| TeamFiles.tsx | 320 | Gerencia documentos internos por contato (upload/download/delete) |
| QuickRepliesManager.tsx | 129 | Gerenciador de respostas rápidas com abas/favoritas/recentes |
| **IA e Funcionalidades de Voz** | | |
| NextBestActionEngine.tsx | 246 | Motor de sugestões de ação baseado em conversation_memory + RPC batch |
| ObjectionDetector.tsx | 257 | Detector de objeções de venda via IA (delega a useObjectionDetector) |
| RealtimeTranscription.tsx | 190 | STT em tempo real via ElevenLabs Scribe (WebSocket) |
| VoiceChanger.tsx | 333 | Troca de voz de áudio gravado via Edge Function voice-changer; fila em voice_conversion_queue |
| VoiceChangerPicker.tsx | 413 | Gravação de voz + transformação via EF voice-changer + upload para audio-memes |
| VoiceSelector.tsx | 317 | Dropdown de seleção de vozes ElevenLabs com preview via EF elevenlabs-tts |
| TextToAudioButton.tsx | 283 | Converte texto em áudio via EF elevenlabs-tts; permite preview e envio |
| TextToSpeechButton.tsx | 79 | Botão de TTS por mensagem individual; estado controlado pelo pai |
| **Templates** | | |
| MessageTemplates.tsx | 254 | Modal de CRUD de templates com busca, categorias e contador de uso |
| TemplatesWithVariables.tsx | 223 | Lista/filtra/cria/edita templates com variáveis dinâmicas |
| **Input e Interação** | | |
| SlashCommands.tsx | 273 | Painel flutuante de comandos `/` com navegação por teclado e dois níveis |
| StickerPicker.tsx | 248 | Popover de figurinhas com upload, busca, favoritos, recentes |
| SpeedSelector.tsx | 71 | Dropdown de velocidade TTS (0.5x–2x) |
| SwipeableListItem.tsx | 150 | Item de lista com swipe gesture, ações por lado, haptic feedback |
| ReplyQuote.tsx | 150 | ReplyPreview (barra ao compor) e QuotedMessage (citação inline na bolha) |
| NewMessageIndicator.tsx | 187 | Banner flutuante animado para nova mensagem com auto-dismiss 8s |
| **Tabs e Filtros** | | |
| TicketTabs.tsx | 304 | Tabs principais do inbox (Abertos/Resolvidos/Não lidas) com sub-tabs |
| TicketTabsFilters.tsx | 262 | Filtros de escopo/departamento/agente com audit event de acesso não autorizado |
| QueuePositionNotifier.tsx | 62 | Badge de posição na fila com polling a cada 15s |
| **Virtualização** | | |
| VirtualizedRealtimeList.tsx | 353 | Lista virtualizada de conversas com scroll infinito, dedup, pin-sort, CRM-enrich |
| VirtualMessageBubble.tsx | 170 | Bolha de mensagem virtualizada (texto, imagem, vídeo, áudio, documento, etc.) |
| **View raiz** | | |
| RealtimeInboxView.tsx | 416 | View raiz do inbox: layout responsivo, sidebar, ChatPanel, ContactDetails, SLA, modais |
| **Áudio** | | |
| WhisperAudioPlayer.tsx | 17 | Wrapper mínimo de `<audio controls>` para mensagens whisper |
| **QA / Ferramentas dev** | | |
| VisualValidationChecklist.tsx | 183 | Checklist de QA visual (tema, fonte, OLED) com localStorage e auto-validação |
| **Utils e Constantes** | | |
| audioMemeConstants.ts | 28 | Constantes de 21 categorias de áudio-meme (emoji + label) |
| emojiConstants.ts | 165 | Constantes de 25 categorias de emoji nativo (~500 emojis) |
| linkPreviewUtils.ts | 113 | URL_REGEX, isImageUrl, isVideoUrl, getYouTubeThumbnail, getFavicon, extractLinks |
| swipeActions.ts | 52 | Interface SwipeAction e factory functions para ações de swipe |
| template-utils.ts | 62 | AVAILABLE_VARIABLES, replaceVariables, extractVariables para templates {{key}} |
| **Hooks locais** | | |
| useAudioMessagePlayer.ts | 198 | Estado de transcrição + conversão de voz; realtime em evo.evolution_messages e voice_conversion_queue |
| useAudioRecorderUI.ts | 324 | UI de gravação: controle, swipe-to-cancel, playback, upload com retry exponencial |
| useFileUploadLogic.ts | 429 | Queue multi-arquivo, compressão, upload via EF secure-upload, retry com ScanBlockedError |
| useFileUploadLogicTypes.ts | 36 | Tipos e constantes: FileMessageData, FilePreview, QueuedFile, MAX_FILES |
| useGlobalSearchData.ts | 423 | Busca global: mensagens, transcrições, contatos, CRM; filtros data/tipo/tag; debounce 300ms |
| useInboxKeyboardShortcuts.ts | 50 | Atalhos globais: Ctrl+A, Delete, Esc, r para seleção em massa |
| useInboxSidebarResize.ts | 126 | Drag resize da sidebar (min 280/max 600px), persistência localStorage |
| **Sub-componentes (parts)** | | |
| objectionDetectorParts.tsx | 224 | UI pura: ConfidenceBadge, ActionBar, ObjectionCard, ShimmerBlock |
| voiceChangerParts.tsx | 196 | UI pura: VoiceChangerHeader, CloneWarningPanel, VoiceListItem, VoiceChangerFooter |
| **Barrel** | | |
| index.ts | 119 | Re-exporta todos os componentes do inbox |

---

## 2. Fluxos Funcionais de UI

### Gravação e envio de áudio
`AudioRecorder` → `useAudioRecorderUI` → `useFileUploadLogic` → EF `secure-upload` → Evolution API (`sendAudioMessage`)

### Mudança de voz
`VoiceChangerPicker` (gravar) ou `VoiceChanger` (pós-gravação) → EF `voice-changer` → tabela `voice_conversion_queue` → bucket `audio-memes`

### TTS — Text to Speech
`TextToAudioButton` → EF `elevenlabs-tts` → blob de áudio → envio via Evolution API
`TextToSpeechButton` → `AudioMessagePlayer` → playback controlado pelo pai

### STT — Transcrição em tempo real
`RealtimeTranscription` → EF `elevenlabs-scribe-token` → WebSocket `useScribe` (ElevenLabs SDK)

### Transcrição de áudio recebido
`useAudioMessagePlayer` → EF `ai-transcribe-audio` → realtime `transcription-{messageId}` em `evo.evolution_messages`

### Detecção de objeções
`ObjectionDetector` → `useObjectionDetector` hook → IA externa → `objectionDetectorParts` (UI pura)

### Next Best Action
`NextBestActionEngine` → `.from('conversation_memory')` + `.rpc('rpc_get_contact_summary_batch')` → cards visuais sem handler real

### Templates com variáveis
`TemplatesWithVariables` → `template-utils` (`replaceVariables`) → `MessageTemplates` / `useMessageTemplates`

### Busca global
`useGlobalSearchData` → `searchContactsAdvanced` (RPC) + `.from('tags')` → `GlobalSearch` (consumidor)

### SLA
`SLAIndicatorForContact` → `useApplicableSLA` → `SLAIndicator` (SVG ring) — hierarquia contact→company→system_default

### Transferência de atendimento
`TransferDialog` → `.from('whatsapp_connections')` → `onTransfer` prop (sem confirmação de sucesso)

### Histórico de ticket
`TicketHistorySheet` → `conversation_events` + `audit_logs` + `get_team_profiles` (RPC) + `ticketStore` local

### Upload de arquivos gerais
`useFileUploadLogic` → EF `secure-upload` (com scan antimalware) → Evolution API (`sendMediaMessage`)

### Whisper (mensagens internas)
`WhisperMode` → tabela `whisper_messages` + realtime `whisper-{contactId}` + `WhisperAudioPlayer` / `AudioRecorder`

---

## 3. Tabelas, RPCs, Canais Realtime e Edge Functions

### 3.1 Tabelas via .from()

| tabela | schema | arquivo(s) |
|--------|--------|------------|
| `conversation_memory` | zapp | NextBestActionEngine.tsx |
| `queue_positions` | public (VIEW security_invoker sobre zapp.queue_positions) — CONFIRMADA em runtime | QueuePositionNotifier.tsx |
| `queues` | zapp | QueuePositionNotifier.tsx |
| `whisper_files` | zapp | TeamFiles.tsx |
| `conversation_events` | zapp | TicketHistorySheet.tsx |
| `audit_logs` | zapp | TicketHistorySheet.tsx |
| `whatsapp_connections` | zapp | TransferDialog.tsx |
| `evolution_messages` | evo | useAudioMessagePlayer.ts (realtime) |
| `voice_conversion_queue` | zapp | VoiceChanger.tsx, useAudioMessagePlayer.ts |
| `messages` | zapp | useGlobalSearchData.ts |
| `contacts` | zapp | useGlobalSearchData.ts |
| `tags` | zapp | useGlobalSearchData.ts |
| `whisper_messages` | zapp | WhisperMode.tsx |
| `stickers` | zapp | StickerPicker.tsx (via hook) |
| `reminders` | zapp | RemindersPanel.tsx (via hook) |
| `audio-memes` | storage | VoiceChangerPicker.tsx |
| `audio-messages` | storage | WhisperMode.tsx |
| `whatsapp-media` | storage | TeamFiles.tsx |

### 3.2 RPCs via .rpc()

| RPC | arquivo |
|-----|---------|
| `rpc_get_contact_summary_batch` | NextBestActionEngine.tsx |
| `get_team_profiles` | TicketHistorySheet.tsx |
| `searchContactsAdvanced` | useGlobalSearchData.ts |
| `rpc_log_search_event` | useGlobalSearchData.ts (telemetria fire-and-forget) |
| `record_voice_telemetry` | VoiceChanger.tsx |

### 3.3 Canais Realtime

| canal | schema/tabela | evento | arquivo |
|-------|--------------|--------|---------|
| `transcription-{messageId}` | evo/evolution_messages | UPDATE | useAudioMessagePlayer.ts |
| `voice-conversion-{messageId}` | zapp/voice_conversion_queue | * | useAudioMessagePlayer.ts |
| `whisper-{contactId}` | zapp/whisper_messages | * | WhisperMode.tsx |

### 3.4 Edge Functions e APIs Externas

| edge function / API | arquivo(s) |
|--------------------|------------|
| `elevenlabs-tts` | TextToAudioButton.tsx, VoiceSelector.tsx |
| `voice-changer` | VoiceChanger.tsx, VoiceChangerPicker.tsx |
| `ai-transcribe-audio` | useAudioMessagePlayer.ts |
| `elevenlabs-scribe-token` | RealtimeTranscription.tsx |
| `secure-upload` | useFileUploadLogic.ts |
| ElevenLabs WebSocket (externo) | RealtimeTranscription.tsx via `@elevenlabs/react` |
| Evolution API (sendMedia/sendAudio) | useFileUploadLogic.ts, useAudioRecorderUI.ts |

---

## 4. Exports Públicos

| arquivo | exports |
|---------|---------|
| MessageStatus.tsx | `MessageStatusValue`, `MessageStatus` |
| MessageTemplates.tsx | `MessageTemplates` |
| NewConversationModal.tsx | `NewConversationModal` |
| NewMessageIndicator.tsx | `NewMessageIndicator` |
| NextBestActionEngine.tsx | `NextBestActionEngine` |
| ObjectionDetector.tsx | `ObjectionDetector` |
| PrivateNotes.tsx | `PrivateNotes` |
| QueuePositionNotifier.tsx | `QueuePositionNotifier` |
| QuickRepliesManager.tsx | `QuickRepliesManager` |
| RealtimeCollaboration.tsx | `RealtimeCollaboration` |
| RealtimeInboxView.tsx | `RealtimeInboxView` |
| RealtimeTranscription.tsx | `RealtimeTranscription` |
| RemindersPanel.tsx | `RemindersPanel` |
| ReplyQuote.tsx | `ReplyPreview`, `QuotedMessage` |
| SLAIndicator.tsx | `SLAIndicator` |
| SLAIndicatorForContact.tsx | `SLAIndicatorForContact` |
| ScheduleMessageDialog.tsx | `ScheduleMessageDialog` |
| SentimentIndicator.tsx | `SentimentLevel`, `getSentimentFromScore`, `SentimentIndicator`, `SentimentEmoji`, `SentimentBar` |
| SlashCommands.tsx | `SlashCommands` |
| SpeedSelector.tsx | `SpeedSelector` |
| StickerPicker.tsx | `StickerPicker` |
| SwipeableListItem.tsx | `SwipeableListItem` |
| TeamFiles.tsx | `TeamFiles` |
| TemplatesWithVariables.tsx | `TemplatesWithVariables` |
| TextToAudioButton.tsx | `TextToAudioButton` |
| TextToSpeechButton.tsx | `TextToSpeechButton` |
| TicketHistorySheet.tsx | `TicketHistorySheet` |
| TicketTabs.tsx | `MainTab`, `SubTab`, `InboxScope`, `TicketTabs` |
| TicketTabsFilters.tsx | `TicketTabsFilters` |
| TranscriptionStatusBadge.tsx | `TranscriptionStatusBadge` |
| TransferDialog.tsx | `TransferDialog` |
| TypingIndicator.tsx | `TypingIndicator`, `TypingIndicatorCompact`, `TypingIndicatorInline` |
| UniversityHelp.tsx | `UniversityHelp` |
| VideoFullscreen.tsx | `VideoFullscreen` |
| VirtualMessageBubble.tsx | `MessageBubble` |
| VirtualizedRealtimeList.tsx | `VirtualizedRealtimeList` |
| VisualValidationChecklist.tsx | `VisualValidationChecklist` |
| VoiceChanger.tsx | `VoiceChanger` |
| VoiceChangerPicker.tsx | `VoiceChangerPicker` |
| VoiceSelector.tsx | `ElevenLabsVoice`, `ELEVENLABS`, `VoiceSelector` |
| WhisperAudioPlayer.tsx | `WhisperAudioPlayer` |
| WhisperMode.tsx | `WhisperMode` |
| audioMemeConstants.ts | `CATEGORY`, `ALL` |
| emojiConstants.ts | `CATEGORY`, `ALL`, `NATIVE` |
| index.ts | (barrel — re-exporta tudo) |
| linkPreviewUtils.ts | `URL`, `isImageUrl`, `isVideoUrl`, `isYouTubeUrl`, `getYouTubeThumbnail`, `getDomain`, `getFavicon`, `extractLinks` |
| objectionDetectorParts.tsx | `Objection`, `ConfidenceBadge`, `ActionBar`, `ObjectionCard`, `ShimmerBlock` |
| swipeActions.ts | `SwipeAction`, `DEFAULT_LEFT_ACTION`, `DEFAULT_RIGHT_ACTION`, `SWIPE_ACTIONS` |
| template-utils.ts | `TemplateVariable`, `AVAILABLE_VARIABLES`, `replaceVariables`, `extractVariables` |
| useAudioMessagePlayer.ts | `useAudioMessagePlayer` |
| useAudioRecorderUI.ts | `useAudioRecorderUI` |
| useFileUploadLogic.ts | `useFileUploadLogic` |
| useFileUploadLogicTypes.ts | `FileMessageData`, `FilePreview`, `QueuedFile`, `categoryOrder`, `MAX_FILES` |
| useGlobalSearchData.ts | `SearchResult`, `ResultType`, `DateFilter`, `MediaTypeFilter`, `TagSuggestion`, `useGlobalSearchData` |
| useInboxKeyboardShortcuts.ts | `useInboxKeyboardShortcuts` |
| useInboxSidebarResize.ts | `useInboxSidebarResize` |
| voiceChangerParts.tsx | `VoiceChangerHeader`, `CloneWarningPanel`, `VoiceListItem`, `VoiceChangerFooter` |

---

## 5. Chama (Saída)

Dependências externas ao conjunto:

- **Hooks do inbox**: `useMessageTemplates`, `useRemindersData`, `useObjectionDetector`, `useConversationSLAData`, `useConversationMessagesData`, `useQueues`, `useStickerPicker`, `useRealtimeInbox`, `useRealtimeContacts`, `useUniversityHelp`, `useAuditLogMutation`, `useContactNotesMutations`, `useContactNotes`, `useAudioManagement`, `useEvolutionApi`, `useScanResponseHandler`, `useGlobalSearchShortcut`, `useAriaAnnouncer`, `useEvolutionAutoReconnect`, `usePullToRefresh`, `useMountedRef`, `useDensity`, `useExternalContact360Batch`, `useThemeAudit`, `useSearchHistory`
- **Feature modules**: `@/features/sla` (useSLACalculation, useApplicableSLA, formatTimeRemaining), `@/features/auth` (useAuth, useDepartmentAgents), `@/features/admin` (useAgents), `@/features/inbox` (barrel)
- **Libs**: `@/lib/logger`, `@/lib/storageSignedUrls`, `@/lib/inbox/ticketStore`, `@/lib/mediaUrl`, `@/lib/scanResponse`, `@/lib/devRealtimeLogger`, `@/lib/evolutionMessageId`, `@/lib/sanitize`, `@/lib/constants/whatsappInstances`
- **Integrations**: `@/integrations/supabase/client`, `@/integrations/supabase/safeClient`, `@/integrations/datasource/db` (dbFrom, dbRpc, dbTable), `@/integrations/datasource/rpcCatalog`
- **Utils**: `@/utils/uuid`, `@/utils/whatsappFileTypes`, `@/utils/imageCompression`
- **Services**: `@/services/api/queryKeys`
- **Tipos**: `@/types/messageStatus`, `@/types/chat`, `@/integrations/supabase/schema`
- **Externos**: `framer-motion`, `@tanstack/react-query`, `@tanstack/react-virtual`, `@elevenlabs/react`, `date-fns`, `sonner`, `lucide-react`
- **Sub-pastas internas**: `./slash-commands/slashCommandsData`, `./stickers/*`, `./ai-tools/*`, `./quick-replies/*`, `./collaboration/*`, `./conversation-list/*`, `./templates/*`

---

## 6. Chamado Por (Entrada)

| arquivo | importado por |
|---------|--------------|
| MessageStatus.tsx | `chat/ChatMessageBubble.tsx`, `chat/MessageStatusPanel.tsx`, `admin/FailedMessageTableRow.tsx`, `hooks/useChatMediaSending.ts`, `team-chat/useTeamChatPanel.ts`, +10 outros |
| MessageTemplates.tsx | `chat/InputExtraTools.tsx`, `chat/ChatInputToolbars.tsx`, `TemplatesWithVariables.tsx`, `templates/TemplateEditorDialog.tsx` |
| NewConversationModal.tsx | `RealtimeInboxView.tsx` (lazy) |
| NewMessageIndicator.tsx | `RealtimeInboxView.tsx` |
| NextBestActionEngine.tsx | `chat/ChatPanelOverlays.tsx` |
| ObjectionDetector.tsx | `chat/ChatToolPanels.tsx`, `AIToolsPopover.tsx` |
| PrivateNotes.tsx | `contact-details/ContactAccordionSections.tsx` |
| QueuePositionNotifier.tsx | apenas `index.ts` no grep estatico; tabela CONFIRMADA e vazia em runtime — ver A4 |
| QuickRepliesManager.tsx | `settings/SettingsView.tsx` |
| RealtimeCollaboration.tsx | `chat/ChatHeader.tsx` |
| RealtimeInboxView.tsx | `pages/inbox/InboxPage.tsx`, `pages/ViewRouter.tsx`, `pages/lazyViews.ts` |
| RealtimeTranscription.tsx | `chat/ChatDialogs.tsx` |
| RemindersPanel.tsx | `contact-details/ContactAccordionSections.tsx` |
| ReplyQuote (ReplyPreview) | `chat/InputPreviewBars.tsx` |
| ReplyQuote (QuotedMessage) | `VirtualMessageBubble.tsx`, `chat/ChatMessageBubble.tsx`, `chat/messageBubbleParts.tsx` |
| SLAIndicator.tsx | `SLAIndicatorForContact.tsx`, `chat/ChatHeader.tsx`, `conversation-list/ConversationItem.tsx`, `ConversationItemCompact.tsx`, testes |
| SLAIndicatorForContact.tsx | `chat/ChatPanelHeader.tsx`, `chat/ChatDialogs.tsx`, `conversation-list/ConversationItem.tsx`, testes |
| ScheduleMessageDialog.tsx | `chat/ChatDialogs.tsx` |
| SentimentIndicator.tsx | `conversation-list/ConversationItem.tsx`, `ConversationItemCompact.tsx`, `ConversationItemComfortable.tsx`, `useConversationDisplay.ts` |
| SlashCommands.tsx | `ChatPanel.tsx`, `chat/ChatInputArea.tsx`, `chat/useInputHandlers.ts` |
| SpeedSelector.tsx | `chat/ChatInputArea.tsx` |
| StickerPicker.tsx | `chat/ChatInputToolbars.tsx`, `team-chat/TeamChatInputArea.tsx` |
| SwipeableListItem.tsx | re-exportado via `index.ts` |
| TeamFiles.tsx | `ChatPanel.tsx`, `chat/ChatInputToolbars.tsx`, `chat/ChatToolPanels.tsx` |
| TemplatesWithVariables.tsx | `chat/ChatTemplatesOverlay.tsx` |
| TextToAudioButton.tsx | `chat/ChatInputToolbars.tsx`, `team-chat/TeamChatInputArea.tsx` |
| TextToSpeechButton.tsx | `chat/ChatMessageBubble.tsx`, `VirtualMessageBubble.tsx`, `chat/MessageHoverToolbar.tsx` |
| TicketHistorySheet.tsx | `ChatPanel.tsx` |
| TicketTabs.tsx | `ConversationListSidebar.tsx`, `InboxFilterPresets.tsx` |
| TicketTabsFilters.tsx | `TicketTabs.tsx` (apenas) |
| TranscriptionStatusBadge.tsx | `chat/AudioMessagePlayer.tsx` |
| TransferDialog.tsx | `chat/ChatDialogs.tsx`, `BulkActionsToolbar.tsx`, `chat/useChatPanelHandlers.ts` |
| TypingIndicator.tsx | `chat/ChatMessagesArea.tsx`, `chat/ChatPanelHeader.tsx`, `conversation-list/ConversationItem.tsx`, `ConversationItemCompact.tsx` |
| UniversityHelp.tsx | `AIToolsPopover.tsx`, `chat/ChatToolPanels.tsx` |
| VideoFullscreen.tsx | `chat/MediaPreview.tsx` |
| VirtualMessageBubble.tsx | `chat/ChatMessageBubble.tsx`, `chat/ChatMessagesArea.tsx`, `pages/admin/ZappWebbDemoPage.tsx` |
| VirtualizedRealtimeList.tsx | `ConversationListSidebar.tsx` |
| **VisualValidationChecklist.tsx** | `chat/ChatPanelOverlays.tsx` — ferramenta de dev sem feature flag |
| VoiceChanger.tsx | `chat/AudioMessagePlayer.tsx`, `chat/AudioRecorder.tsx` |
| VoiceChangerPicker.tsx | `chat/ChatInputToolbars.tsx`, `team-chat/TeamChatInputArea.tsx` |
| VoiceSelector.tsx | `VoiceChanger.tsx`, `chat/ChatHeader.tsx`, `voiceChangerParts.tsx`, `TextToAudioButton.tsx` |
| WhisperAudioPlayer.tsx | `WhisperMode.tsx` (único) |
| WhisperMode.tsx | `chat/ChatPanelOverlays.tsx` |
| audioMemeConstants.ts | `AudioMemePicker.tsx`, `AudioMemeUploadPreview.tsx`, `AudioMemeCategorySelector.tsx`, `stickers/StickerCategoryBar.tsx`, +10 outros |
| emojiConstants.ts | `CustomEmojiPicker.tsx`, testes |
| linkPreviewUtils.ts | `chat/LinkPreview.tsx`, `hooks/useChatSearch.ts`, testes |
| objectionDetectorParts.tsx | `ObjectionDetector.tsx`, `ContactsRichView.tsx`, `ContactsBulkActionBar.tsx` |
| swipeActions.ts | `SwipeableListItem.tsx` |
| template-utils.ts | `TemplatesWithVariables.tsx`, `templates/TemplateEditorDialog.tsx`, `hooks/useWhatsAppTemplates.ts` |
| useAudioMessagePlayer.ts | `chat/AudioMessagePlayer.tsx`, testes de realtime |
| useAudioRecorderUI.ts | `chat/AudioRecorder.tsx` |
| useFileUploadLogic.ts | `chat/FileUploader.tsx` |
| useFileUploadLogicTypes.ts | `useFileUploadLogic.ts`, `chat/FileUploader.tsx` |
| useGlobalSearchData.ts | `GlobalSearch.tsx`, `GlobalSearchFilters.tsx`, `GlobalSearchResults.tsx`, `chat/ChatDialogs.tsx` |
| useInboxKeyboardShortcuts.ts | `RealtimeInboxView.tsx` |
| useInboxSidebarResize.ts | `RealtimeInboxView.tsx` |
| voiceChangerParts.tsx | `VoiceChanger.tsx` |

---

## 7. Implementação por Arquivo

| arquivo | status | o que falta |
|---------|--------|-------------|
| MessageStatus.tsx | COMPLETA | — |
| MessageTemplates.tsx | COMPLETA | Categorias hardcoded sem i18n |
| NewConversationModal.tsx | COMPLETA | — |
| NewMessageIndicator.tsx | COMPLETA | Auto-dismiss corre mesmo com tab em background |
| NextBestActionEngine.tsx | PARCIAL | `action?: () => void` nunca atribuído; cards visuais sem handler real |
| ObjectionDetector.tsx | COMPLETA | — |
| PrivateNotes.tsx | COMPLETA | — |
| QueuePositionNotifier.tsx | COMPLETA (cliente) | Componente correto; falta produtor escrevendo em zapp.queue_positions (tabela vazia em runtime) — ver A4 |
| QuickRepliesManager.tsx | COMPLETA | — |
| RealtimeCollaboration.tsx | COMPLETA | — |
| RealtimeInboxView.tsx | COMPLETA | Cast duplo `as unknown as` em l.139; emoji `📡` hardcoded |
| RealtimeTranscription.tsx | COMPLETA | — |
| RemindersPanel.tsx | COMPLETA | Falha silenciosa ao criar lembrete (erro não exibido ao usuário) |
| ReplyQuote.tsx | COMPLETA | — |
| SLAIndicator.tsx | COMPLETA | — |
| SLAIndicatorForContact.tsx | COMPLETA | `lastMessage` como proxy de 1ª resposta do agente (pode ser incorreto) |
| ScheduleMessageDialog.tsx | PARCIAL | UTC midnight bug no preview (l.181); não persiste no DB diretamente |
| SentimentIndicator.tsx | COMPLETA | — |
| SlashCommands.tsx | COMPLETA | Listener `keydown` sem `capture:true` (pode colidir com atalhos globais) |
| SpeedSelector.tsx | COMPLETA | Velocidade não persiste (stateless) |
| StickerPicker.tsx | COMPLETA | — |
| SwipeableListItem.tsx | COMPLETA | `constraintsRef` declarado mas não usado em `dragConstraints` (hardcoded) |
| TeamFiles.tsx | COMPLETA | `Math.random()` no filePath (não garante unicidade) |
| TemplatesWithVariables.tsx | COMPLETA | Cast `as Template` após spread pode ocultar campos obrigatórios ausentes |
| TextToAudioButton.tsx | COMPLETA | Envia anon key como apikey em vez de session token (EF paga) |
| TextToSpeechButton.tsx | COMPLETA | — |
| TicketHistorySheet.tsx | COMPLETA | `get_team_profiles` sem fallback; erros de audit_logs engolidos silenciosamente |
| TicketTabs.tsx | COMPLETA | — |
| TicketTabsFilters.tsx | COMPLETA | Lógica `isActive` pode ativar dois botões simultaneamente |
| TranscriptionStatusBadge.tsx | COMPLETA | Race condition: badge desaparece se completed mas texto ainda vazio |
| TransferDialog.tsx | COMPLETA | Fecha imediatamente sem aguardar confirmação assíncrona de sucesso |
| TypingIndicator.tsx | COMPLETA | Variantes `bubble` e `avatar` provavelmente código morto |
| UniversityHelp.tsx | COMPLETA | — |
| VideoFullscreen.tsx | COMPLETA | — |
| VirtualMessageBubble.tsx | COMPLETA | — |
| VirtualizedRealtimeList.tsx | COMPLETA | Cast temporário `isArchived` sem tipo upstream correspondente |
| VisualValidationChecklist.tsx | PARCIAL | Item com `id: ''` quebra toggleItem; textos de dev hardcoded sem feature flag |
| VoiceChanger.tsx | COMPLETA | Usa anon key em vez de session token (inconsistente com VoiceChangerPicker) |
| VoiceChangerPicker.tsx | COMPLETA | audioRef não limpo antes de set null se estiver tocando |
| VoiceSelector.tsx | COMPLETA | — |
| WhisperAudioPlayer.tsx | COMPLETA | Sem controle JS; múltiplos players podem tocar simultaneamente |
| WhisperMode.tsx | COMPLETA | `staleTime: 30_000` — BUG-2026-08-06: dados não refrescam ao reabrir conversa |
| audioMemeConstants.ts | COMPLETA | — |
| emojiConstants.ts | COMPLETA | — |
| index.ts | COMPLETA | — |
| linkPreviewUtils.ts | COMPLETA | — |
| objectionDetectorParts.tsx | COMPLETA | — |
| swipeActions.ts | COMPLETA | `DEFAULT_LEFT_ACTION` e `DEFAULT_RIGHT_ACTION` têm `action: () => {}` vazio |
| template-utils.ts | COMPLETA | `atendente` hardcoded como `'Atendente'`; `Math.random()` para protocolo |
| useAudioMessagePlayer.ts | COMPLETA | — |
| useAudioRecorderUI.ts | COMPLETA | `_voiceChanged` nunca lido; `isLocked` sempre `false` (feature não implementada exposta) |
| useFileUploadLogic.ts | COMPLETA | — |
| useFileUploadLogicTypes.ts | COMPLETA | — |
| useGlobalSearchData.ts | COMPLETA | Cast sem validação de runtime no retorno do RPC CRM |
| useInboxKeyboardShortcuts.ts | COMPLETA | — |
| useInboxSidebarResize.ts | COMPLETA | `windowWidth` retornado mas nenhum consumidor usa |
| voiceChangerParts.tsx | COMPLETA | — |

---

## 8. Achados

### A1 — Chave anon pública enviada para Edge Function paga (TextToAudioButton)
`TextToAudioButton.tsx:76-77` — `apikey` e `Authorization` enviados com `VITE_SUPABASE_PUBLISHABLE_KEY` (anon key) ao invés do token de sessão do usuário autenticado. A EF `elevenlabs-tts` é uma chamada paga (ElevenLabs API); qualquer usuário não autenticado com acesso ao bundle pode invocar a EF sem restrição de sessão. Corrigir com `supabase.auth.getSession().access_token`.

### A2 — Inconsistência de auth header em voice-changer (VoiceChanger vs VoiceChangerPicker)
`VoiceChanger.tsx:163` — usa `VITE_SUPABASE_PUBLISHABLE_KEY` como Bearer token. `VoiceChangerPicker.tsx:150` — usa corretamente `session?.access_token`. Mesma EF `voice-changer`, comportamento de auth diferente entre os dois componentes que a chamam.

### A3 — NextBestActionEngine: sugestões visuais sem handler real (feature inoperante)
`NextBestActionEngine.tsx:28-31` — `action?: () => void` declarado no tipo `NextAction` mas nunca atribuído nas instâncias criadas; os cards de sugestão não têm `onClick`. O componente exibe ações ("Responder agora", "Follow-up", "Escalar SLA") que o usuário não pode executar. Feature visualmente presente mas funcionalmente incompleta.

### A4 — QueuePositionNotifier: feature funcional ligada a tabela vazia (VERIFICADO em runtime 2026-08-09)
`QueuePositionNotifier.tsx:43` — `return null` quando `position` é falsy. **Correcao do diagnostico estatico:** a tabela EXISTE — `public.queue_positions` e uma VIEW com `security_invoker=true` sobre `zapp.queue_positions` (tabela real, RLS ligada, policy exige `authenticated`, `anon` sem grant). A query funciona; o CLAUDE.md e que esta desatualizado. Ambas (view e base) tem **0 linhas** — a feature nunca teve dado, por isso o `return null` e o caminho permanente. Nao e codigo morto nem query quebrada: e **feature incompleta no lado servidor** — nenhum produtor escreve em `zapp.queue_positions`. UI + RLS + polling de 15s existem, falta quem alimente a fila. Registrado em #1000 (comentario) e #1001. *Runtime: VERIFICADO.*

### A5 — ScheduleMessageDialog: UTC midnight bug no preview
`ScheduleMessageDialog.tsx:181` — preview usa `new Date(date)` onde `date` é string `"yyyy-MM-dd"`, resultando em UTC midnight e exibindo data um dia errada em fusos UTC-N (ex: América/São_Paulo UTC-3). O `handleSchedule` (l.49) já faz o parse correto com `new Date(y, mo-1, d, h, m)` — inconsistência entre preview e a data que será de fato agendada.

### A6 — swipeActions: DEFAULT actions com handler completamente vazio
`swipeActions.ts:13-20` — `DEFAULT_LEFT_ACTION.action` e `DEFAULT_RIGHT_ACTION.action` são `() => {}` vazios. Qualquer consumidor que use essas constantes sem sobrescrever `action` silenciosamente não fará nada ao swipe. Não há aviso em runtime.

### A7 — useAudioRecorderUI: isLocked sempre false exposto no contrato do hook
`useAudioRecorderUI.ts:34` — `const [isLocked] = useState(false)` — setter omitido, valor fixo, feature de lock nunca implementada. O valor `isLocked` é exportado no retorno do hook, enganando consumidores que possam depender dele. `_voiceChanged` (l.33): estado existe (`setVoiceChanged` é chamado em l.247) mas o getter nunca é lido — tracking de voz alterada é inoperante.

### A8 — WhisperMode: staleTime travado (BUG-2026-08-06)
`WhisperMode.tsx:68` — `staleTime: 30_000` comentado como `BUG-2026-08-06`. Dados whisper ficam cacheados por 30s, então ao reabrir uma conversa o usuário pode ver mensagens internas desatualizadas por até 30 segundos sem feedback. Workaround (invalidação manual) ausente no código.

### A9 — RealtimeInboxView: cast duplo perigoso
`RealtimeInboxView.tsx:139` — `inbox as unknown as { useExternalDb?: boolean }` contorna completamente o sistema de tipos para acessar campo não documentado da API pública de `useRealtimeInbox`. Qualquer mudança de tipo no hook fica silenciosa.

### A10 — template-utils: atendente hardcoded sem injeção do usuário real
`template-utils.ts:47` — variável `{{atendente}}` substitui por `'Atendente'` literal. Nenhum parâmetro permite injetar o nome real do agente. Templates com `{{atendente}}` enviados ao cliente sempre mostram "Atendente" em vez do nome do operador. Também: `Math.random()` para protocolo (l.36) não garante unicidade em volume alto.

### A11 — VisualValidationChecklist: ferramenta de dev sem feature flag
`VisualValidationChecklist.tsx:19` — item com `id: ''` (string vazia) faz `toggleItem('')` bater em qualquer item sem id, podendo togglear o errado. `VisualValidationChecklist.tsx:89` — textos hardcoded "Meta: 10/10" e "Meta: Perfeição Visual e UX Consistente" visíveis em produção (consumido por `chat/ChatPanelOverlays.tsx` sem guard de feature flag ou `NODE_ENV`).

### A12 — SLAIndicatorForContact: firstResponseAt pode usar resposta errada
`SLAIndicatorForContact.tsx:176` — `firstResponseAt` resolve via `resolveMessageTimestamp(lastMessage)` verificando `message.sender === 'agent'`. A **última** mensagem do agente pode ser a segunda ou terceira resposta, não a primeira — o indicador de SLA de 1ª resposta pode subestimar violações.

### A13 — TypingIndicator: variantes bubble e avatar possivelmente código morto
`TypingIndicator.tsx` — 4 variantes visuais (default, bubble, minimal, avatar) + 2 extras (Compact, Inline). Apenas `default`, `minimal` e `TypingIndicatorInline` têm uso confirmado no repo. Variantes `bubble` e `avatar` não aparecem em grepping de consumidores — possível código morto de 80+ linhas.

### A14 — TransferDialog: fecha sem confirmar sucesso assíncrono
`TransferDialog.tsx:74-84` — `handleTransfer` chama `onTransfer` (prop) e fecha o dialog imediatamente. Se `onTransfer` falhar assincronamente, o usuário não recebe feedback de erro. O `finally` apenas zera `isTransferring` — sem toast de erro, sem reabertura do dialog.

### A15 — StickerPicker: tooltip removido sem flag explicativa
`StickerPicker.tsx:4` — comentário indica que tooltip foi removido propositalmente. Ausência de acessibilidade (aria-label) para ícones do picker não compensada por outra solução — interação potencialmente inacessível em modo teclado/leitor de tela.

*Runtime: NAO_VERIFICADO - nenhuma execução real foi realizada durante esta análise.*
