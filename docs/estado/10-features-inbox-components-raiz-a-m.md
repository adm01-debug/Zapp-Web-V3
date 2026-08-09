# Estado: Inbox — Componentes da Raiz (A–M)

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 58/58

---

## 1. Visão Geral

58 componentes soltos na raiz de `src/features/inbox/components/`, cobrindo IA conversacional, áudio, chat principal, gerenciamento de contatos/conversas, filtros e mídias. Dois agentes (grupos 2 e 5) realizaram análise com 1 tool use cada; achados com linha específica foram confirmados pelos demais grupos.

### Tabela de Arquivos por Categoria

**IA / Análise**

| arquivo | linhas | o que faz em 1 linha |
|---------|--------|----------------------|
| AIConversationAssistant.tsx | 470 | Painel de análise IA (sentimento, resumo, histórico, TTS) |
| AISuggestions.tsx | 202 | Popover com sugestões de resposta geradas por Edge Function |
| AIToolsPopover.tsx | 83 | Container lazy com tabs para ObjectionDetector e UniversityHelp |
| AnalysisBadges.tsx | 84 | Badges inline de sentimento/urgência da última análise |

**Áudio**

| arquivo | linhas | o que faz em 1 linha |
|---------|--------|----------------------|
| AudioMemeCategorySelector.tsx | 75 | Dropdown de seleção de categoria de áudio meme |
| AudioMemePicker.tsx | 345 | Picker completo de áudio memes (busca, favoritos, preview, upload, delete) |
| AudioMemeUploadPreview.tsx | 69 | Preview inline para confirmar nome/categoria antes do upload |
| AudioMessagePlayer.tsx | 340 | Player com waveform, velocidade, transcrição e voice changer |
| AudioRecorder.tsx | 373 | Gravador com pause/resume, waveform ao vivo, transcrição e voice changer |
| AudioTranscriptionPanel.tsx | 80 | Painel de exibição e estados de transcrição de áudio |
| AudioVolumeControl.tsx | 116 | Slider de volume animado em bolhas de mensagem |

**Chat / Conversa**

| arquivo | linhas | o que faz em 1 linha |
|---------|--------|----------------------|
| ChatPanel.tsx | 629 | Orquestrador principal do painel de chat (atalhos, painéis, mensagens) |
| CloseConversationDialog.tsx | 242 | Dialog de encerramento com motivo, resultado e disparo de CSAT |
| ConversationContextMenu.tsx | 285 | Menu de contexto (15+ ações: pin/star/mute/delete) |
| ConversationHistory.tsx | 256 | Histórico de conversas agrupado por dia (cache compartilhado) |
| ConversationList.tsx | 279 | Lista virtualizada de conversas com abas, busca e skeleton |
| ConversationListSidebar.tsx | 583 | Sidebar principal do inbox com filtros, tabs, bulk e shortcuts |
| ConversationMemoryPanel.tsx | 236 | CRUD de memória da conversa (fatos, objeções, promessas, pendências) |
| ConversationSummary.tsx | 279 | Gerador de resumo IA com TTS e filtro de período |
| ConversationTasksPanel.tsx | 218 | CRUD de tarefas por contato com prioridade e checkbox |
| ConversationTimeline.tsx | 141 | Timeline de eventos de conversa (assign/transfer/close/reopen) |

**Contato / CRM**

| arquivo | linhas | o que faz em 1 linha |
|---------|--------|----------------------|
| ContactDetails.tsx | 257 | Painel lateral de detalhes do contato com accordion de seções |
| ContactDetailsResponsive.tsx | 34 | Wrapper desktop/mobile para ContactDetails |
| ContactPurchasesPanel.tsx | 206 | Lista e criação de compras/propostas do contato |
| ContactTypeFilter.tsx | 212 | Dropdown de filtro por tipo de contato com contagens |
| CRMAutoSync.tsx | 281 | Sync automática de conversas resolvidas com CRM (componente invisível) |

**Ações em Massa / Menus de Mensagem**

| arquivo | linhas | o que faz em 1 linha |
|---------|--------|----------------------|
| AdvancedMessageMenu.tsx | 347 | Menu com figurinha, enquete, cartão de contato e status via Evolution API |
| AgentReassignmentPanel.tsx | 64 | Botões de reatribuição de ausentes e balanceamento de carga |
| BulkActionsToolbar.tsx | 143 | Barra flutuante de ações em massa (marcar/transferir/arquivar) |
| MessageContextActions.tsx | 140 | Dropdown de ações na mensagem (editar/deletar/marcar lida) |
| MessageContextMenu.tsx | 226 | Menu de contexto (clique-direito) com ações e reações rápidas |
| MessageReactions.tsx | 371 | Exibe e gerencia reações com picker de emoji; exporta QuickReactionBar |

**Filtros / Busca / KPIs**

| arquivo | linhas | o que faz em 1 linha |
|---------|--------|----------------------|
| FailureCategoryFilter.tsx | 123 | Dropdown de categorias de falha (auth/4xx/5xx/network) |
| GlobalSearch.tsx | 387 | Modal de busca global (Ctrl+K) com filtros, histórico e ações rápidas |
| InboxFilterPresets.tsx | 384 | CRUD de presets de filtros do inbox |
| InboxFilters.tsx | 355 | Popover de filtros (status/tags/agente/período) com chips removíveis |
| InboxKpiBar.tsx | 110 | Barra de 5 KPIs calculados localmente (sem queries extras) |

**Mensagens e Formulários**

| arquivo | linhas | o que faz em 1 linha |
|---------|--------|----------------------|
| DeletedMessagePlaceholder.tsx | 105 | Placeholder visual para mensagem apagada (soft-delete) |
| FileUploader.tsx | 241 | Upload de arquivos com fila multi-arquivo, preview e progresso |
| ForwardMessageDialog.tsx | 267 | Dialog de encaminhamento de mensagem para contatos/grupos |
| InteractiveMessage.tsx | 271 | Renderiza mensagens interativas WA (botões/lista); exporta badges de resposta |
| InteractiveMessageBuilder.tsx | 249 | Builder de mensagens interativas WA com preview ao vivo |
| MessageBatcherIndicator.tsx | 92 | Chip flutuante de status do batcher de atualizações realtime |
| MessagePreview.tsx | 207 | Preview formatado de markdown/emojis na área de composição |

**Mídia / Localização**

| arquivo | linhas | o que faz em 1 linha |
|---------|--------|----------------------|
| ImagePreview.tsx | 200 | Lightbox de imagem com zoom, download e auto-refresh de URL expirada |
| LinkPreview.tsx | 138 | Preview de links com suporte a YouTube/imagem (sem fetch real de OG tags) |
| LocationMessage.tsx | 201 | Mapa Mapbox com marcador para mensagem de localização |
| LocationPicker.tsx | 143 | Dialog de seleção/envio de localização (GPS ou mapa) |
| MediaGallery.tsx | 395 | Galeria de mídia com grid/lista, filtros por tipo e seleção múltipla |
| MediaPreview.tsx | 350 | Preview de vídeo/documento/sticker com refresh automático em erro 403/410 |

**UI Auxiliar / Painéis de Análise**

| arquivo | linhas | o que faz em 1 linha |
|---------|--------|----------------------|
| BusinessHoursBadge.tsx | 40 | Badge "Aberto/Fechado" baseado em horário comercial |
| CustomEmojiPicker.tsx | 249 | Picker com emojis nativos + upload/gestão de emojis customizados |
| DeliveryStatsPanel.tsx | 121 | KPIs de entrega (enviadas/entregues/lidas) com breakout por participante |
| EmojiPicker.tsx | 240 | Picker simples com 197 emojis hardcoded (sem busca, sem categorias) |
| InboxEmptyChat.tsx | 57 | Tela vazia com animações e dicas de atalhos de teclado |
| KeyboardShortcutsHelp.tsx | 79 | Popover com lista de atalhos filtrados por categoria |
| KnowledgeBaseSearchPanel.tsx | 128 | Painel de busca em base de conhecimento com expansão de artigos |
| LeadRiskScorePanel.tsx | 174 | Edita lead_score, risk_score, lead_origin e consent_status do contato |

---

## 2. Fluxos Funcionais de UI

### 2.1 Análise IA de Conversa
`AIConversationAssistant` → hooks `useConversationAnalyses` / `useLatestAnalysis` → Edge Function `ai-conversation-analysis` → tabela `zapp.conversation_analyses`; cache em `zapp.conversation_summaries` (RLS bloqueia persistência — silencioso). `AnalysisBadges` lê do mesmo hook e renderiza inline na lista/painel.

### 2.2 Sugestões de Resposta IA
`AISuggestions` → `supabase.functions.invoke('ai-suggest-reply')` → popover com texto; sem debounce; duplo-clique dispara 2 chamadas paralelas.

### 2.3 Gravação e Reprodução de Áudio
`AudioRecorder` + `AudioVolumeControl` + VoiceChanger → `useAudioRecorderUI` → upload bucket `audio-messages` → `AudioMessagePlayer` + `AudioTranscriptionPanel` para reprodução. `AudioMemePicker` + `AudioMemeCategorySelector` gerenciam bucket `audio-memes`.

### 2.4 Painel de Chat Principal
`ChatPanel` (629 linhas) → orquestra `CloseConversationDialog`, `BusinessHoursBadge`, `DeletedMessagePlaceholder`, `BulkActionsToolbar`, `CRMAutoSync`, `InteractiveMessage`; insere mensagens diretamente via `dbFrom('messages')`. Quatro handlers de atalho de teclado estão vazios.

### 2.5 Lista / Sidebar de Conversas
`ConversationListSidebar` (583 linhas) → `ConversationList` + `InboxFilters` + `ContactTypeFilter` + `InboxFilterPresets` + `ConversationContextMenu`. Sidebar recebe prop `_width` mas a ignora completamente.

### 2.6 Encerramento de Conversa
`CloseConversationDialog` → INSERT em `conversation_closures` + UPDATE em `conversations` + INSERT em `conversation_events` via `Promise.all`; sem rollback em falha parcial. Dispara Edge Function `csat-auto-send`.

### 2.7 Detalhes de Contato
`ContactDetails` → accordion de seções: `AgentReassignmentPanel`, `AnalysisBadges`, `DeliveryStatsPanel`, `KnowledgeBaseSearchPanel`, `LeadRiskScorePanel`, `ContactPurchasesPanel`. Ação VIP usa `undoToast` sem persistência no banco.

### 2.8 Busca Global
`GlobalSearch` → `useGlobalSearchData` + `safeClient.rpc('rpc_record_search_click')`; quick actions "nova conversa" e "respostas rápidas" são no-ops (apenas fecham o modal). Navegação via `window.location.hash` em SPA React Router.

---

## 3. Tabelas, RPCs, Canais Realtime e Edge Functions

### 3.1 Tabelas via `.from()`

| tabela | schema | operações | arquivos |
|--------|--------|-----------|---------|
| `conversation_closures` | zapp | INSERT | CloseConversationDialog |
| `conversations` | zapp | UPDATE | CloseConversationDialog |
| `conversation_events` | zapp | INSERT | CloseConversationDialog |
| `conversation_analyses` | zapp | SELECT | useConversationAnalyses (via AIConversationAssistant) |
| `conversation_summaries` | zapp | INSERT/SELECT | AIConversationAssistant (RLS bloqueia insert) |
| `conversation_memories` | zapp | SELECT/INSERT | ConversationMemoryPanel via hooks |
| `conversation_tasks` | zapp | CRUD | ConversationTasksPanel via hooks |
| `contacts` | zapp | SELECT / UPDATE | LeadRiskScorePanel (datasources diferentes — ver A15) |
| `contact_purchases` | zapp | SELECT/INSERT | ContactPurchasesPanel via hook |
| `messages` | evo/zapp | INSERT direto | ChatPanel L547–569 |
| `messages` | evo/zapp | SELECT / UPDATE | MediaGallery, MessageContextActions |

### 3.2 RPCs via `.rpc()`

| rpc | arquivo | status |
|-----|---------|--------|
| `sync_to_crm` | CRMAutoSync via `useSyncToCRM` | **STUB** — RAISE P0001 |
| `rpc_record_search_click` | GlobalSearch via `safeClient` | fire-and-forget |
| `get_latest_analysis` | AnalysisBadges via `useLatestAnalysis` | possivelmente stub (ver RPC_STUBS_STATUS.md) |
| `get_companies_by_phones_batch` | ConversationListSidebar via `useExternalContact360Batch` | ativa |
| `is_within_business_hours` | BusinessHoursBadge via hook | NAO_VERIFICADO |

### 3.3 Canais Realtime

Nenhum canal `.on('channel')` detectado diretamente nestes 58 arquivos. Realtime é consumido via hooks externos (`useRealtimeInbox`, `useConversationActions`).

### 3.4 Edge Functions e APIs Externas

| recurso | arquivos |
|---------|---------|
| Edge Function `ai-conversation-analysis` | AIConversationAssistant |
| Edge Function `ai-conversation-summary` | AIConversationAssistant |
| Edge Function `ai-suggest-reply` | AISuggestions |
| Edge Function `csat-auto-send` | CloseConversationDialog |
| Edge Function `get-mapbox-token` | LocationMessage |
| Mapbox GL JS (lazy) | LocationMessage, LocationPicker |
| Evolution API (`sendSticker/Poll/Contact/Status/deleteMessage/markRead`) | AdvancedMessageMenu, MessageContextActions |

---

## 4. Exports Públicos

| arquivo | exports nomeados |
|---------|------------------|
| AIConversationAssistant | `AIConversationAssistant` |
| AISuggestions | `AISuggestions` |
| AIToolsPopover | `AIToolsPopover` |
| AdvancedMessageMenu | `AdvancedMessageMenu` |
| AgentReassignmentPanel | `AgentReassignmentPanel` |
| AnalysisBadges | `AnalysisBadges` |
| AudioMemeCategorySelector | `AudioMemeCategorySelector` |
| AudioMemePicker | `AudioMemePicker` |
| AudioMemeUploadPreview | `AudioMemeUploadPreview` |
| AudioMessagePlayer | `AudioMessagePlayer` |
| AudioRecorder | `AudioRecorder` |
| AudioTranscriptionPanel | `AudioTranscriptionPanel` |
| AudioVolumeControl | `AudioVolumeControl` |
| BulkActionsToolbar | `BulkActionsToolbar` |
| BusinessHoursBadge | `BusinessHoursBadge` |
| CRMAutoSync | `CRMAutoSync`, `CRMSyncButton` |
| ChatPanel | `ChatPanel` |
| CloseConversationDialog | `CloseConversationDialog` |
| ContactDetails | `ContactDetails` |
| ContactDetailsResponsive | `ContactDetailsResponsive` |
| ContactPurchasesPanel | `ContactPurchasesPanel` |
| ContactTypeFilter | `FilterOption`, `FILTER`, `ContactTypeFilter`, `filterByContactType` |
| ConversationContextMenu | `ConversationContextMenu` |
| ConversationHistory | `ConversationHistory` |
| ConversationList | `ConversationList` |
| ConversationListSidebar | `ConversationListSidebar` |
| ConversationMemoryPanel | `ConversationMemoryPanel` |
| ConversationSummary | `ConversationSummary` |
| ConversationTasksPanel | `ConversationTasksPanel` |
| ConversationTimeline | `ConversationTimeline` |
| CustomEmojiPicker | `CustomEmojiPicker` |
| DeletedMessagePlaceholder | `DeletedMessagePlaceholder` |
| DeliveryStatsPanel | `DeliveryStatsPanel` |
| EmojiPicker | `EmojiPicker` |
| FailureCategoryFilter | `FailureCategoryFilter` |
| FileUploader | `FileUploaderRef`, `FileUploader` |
| ForwardMessageDialog | `ForwardMessageDialog` |
| GlobalSearch | `GlobalSearch` |
| ImagePreview | `ImagePreview`, `MessageImage` |
| InboxEmptyChat | `InboxEmptyChat` |
| InboxFilterPresets | `InboxFilterPresets` |
| InboxFilters | `InboxFiltersState`, `InboxFilters` |
| InboxKpiBar | `InboxKpiBar` |
| InteractiveMessage | `InteractiveMessageDisplay`, `ListResponseBadge`, `ButtonResponseBadge` |
| InteractiveMessageBuilder | `InteractiveMessageBuilder` |
| KeyboardShortcutsHelp | `KeyboardShortcutsHelp` |
| KnowledgeBaseSearchPanel | `KnowledgeBaseSearchPanel` |
| LeadRiskScorePanel | `LeadRiskScorePanel` |
| LinkPreview | `LinkPreview`, `TextWithLinks` |
| LocationMessage | `LocationMessageDisplay` |
| LocationPicker | `LocationPicker` |
| MediaGallery | `MediaGallery` |
| MediaPreview | `DocumentPreview`, `VideoPreview`, `StickerPreview`, `MediaMessage` |
| MessageBatcherIndicator | `MessageBatcherIndicator` |
| MessageContextActions | `MessageContextActions` |
| MessageContextMenu | `MessageContextMenu` |
| MessagePreview | `MessagePreview`, `useHasFormattableContent` |
| MessageReactions | `MessageReactions`, `QuickReactionBar` |

---

## 5. Chama (Saída)

**Hooks do próprio feature inbox:**
`useConversationAnalyses`, `useLatestAnalysis`, `useSentimentAlerts`, `useAnalysisTts`, `useAudioMemes`, `useAudioPlayer`, `useAudioMessagePlayer`, `useAudioRecorderUI`, `useConversationActions`, `useConversationEventsData`, `useConversationMemoryData`, `useConversationTasksData`, `useConversationMessagesData`, `useInboxFilters`, `useAllTicketStates`, `useRealtimeInbox`, `useInboxBulkActions`, `useArchiveConversationActions`, `useDeliveryStats`, `useForwardMessage`, `useFileUploadLogic`, `useGlobalSearchData`, `useInteractiveMessage`, `useLocationPicker`, `useKnowledgeBaseSearch`, `useMessageReactions`, `useReactionMutations`, `useContactPurchasesData`, `inboxFilterPresets`, `useExternalContact360Batch`

**Hooks globais:**
`useAuth`, `usePermissions` (`@/features/auth`); `useAgentReassignment`, `useAgents` (`@/features/admin`); `useTags`, `useDensity`, `useDebouncedValue`, `useCustomShortcuts`, `useDownloadPermission`, `useMediaRefresh`, `useSyncToCRM`, `useCustomEmojis`

**Integrações:**
`supabase` client (`@/integrations/supabase/client`), `dbFrom` (`@/integrations/datasource/db`), `safeClient` (`@/integrations/supabase/safeClient`), `supabase.functions.invoke`, `useEvolutionApi`

**UI externa:**
`framer-motion`, `@tanstack/react-virtual`, `@tanstack/react-query`, `@radix-ui/*`, `lucide-react`, `sonner`, `date-fns/ptBR`, `mapbox-gl` (lazy)

---

## 6. Chamado Por (Entrada)

| componente | importado em |
|-----------|--------------|
| AIConversationAssistant | `chat/ChatToolPanels.tsx` |
| AISuggestions | `chat/ChatInputToolbars.tsx`, `chat/InputExtraTools.tsx` |
| AIToolsPopover | `chat/InputExtraTools.tsx` |
| AdvancedMessageMenu | `chat/InputExtraTools.tsx` |
| AgentReassignmentPanel | `ContactDetails.tsx` |
| AnalysisBadges | `ContactDetails.tsx` |
| AudioMemeCategorySelector | `AudioMemePicker.tsx` |
| AudioMemePicker | `chat/InputExtraTools.tsx` |
| AudioMemeUploadPreview | `AudioMemePicker.tsx` |
| AudioMessagePlayer | `chat/VirtualMessageBubble.tsx`, `WhisperMode.tsx` |
| AudioRecorder | `chat/ChatInputToolbars.tsx` |
| AudioTranscriptionPanel | `AudioMessagePlayer.tsx` |
| AudioVolumeControl | `AudioMessagePlayer.tsx`, `AudioRecorder.tsx` |
| BulkActionsToolbar | `ConversationListSidebar.tsx`, `VirtualizedRealtimeList.tsx` |
| BusinessHoursBadge | `ChatPanel.tsx` |
| CRMAutoSync | `ChatPanel.tsx` |
| CRMSyncButton | `contact-details/ContactActionButtons.tsx`, `hooks/useSyncToCRM.ts` |
| ChatPanel | `RealtimeInboxView.tsx`, `chat/ChatPanelHeader.tsx` |
| CloseConversationDialog | `ChatPanel.tsx` |
| ContactDetails | `RealtimeInboxView.tsx`, `ContactDetailsResponsive.tsx` |
| ContactDetailsResponsive | `RealtimeInboxView.tsx` |
| ContactPurchasesPanel | `ContactDetails.tsx` (via `contact-details/contactDetailSections.ts`) |
| ContactTypeFilter | `ConversationListSidebar.tsx` |
| ConversationContextMenu | `ConversationList.tsx`, `VirtualizedRealtimeList.tsx` |
| ConversationHistory | `chat/ChatToolPanels.tsx` |
| ConversationList | `ConversationListSidebar.tsx` |
| ConversationListSidebar | `RealtimeInboxView.tsx` |
| ConversationMemoryPanel | `chat/ChatToolPanels.tsx` |
| ConversationSummary | `chat/ChatToolPanels.tsx` |
| ConversationTasksPanel | `chat/ChatToolPanels.tsx` |
| ConversationTimeline | `chat/ChatToolPanels.tsx` |
| CustomEmojiPicker | `chat/` (via `index.ts`) |
| DeletedMessagePlaceholder | `ChatPanel.tsx`, `chat/VirtualMessageBubble.tsx` |
| DeliveryStatsPanel | `ContactDetails.tsx` |
| EmojiPicker | `chat/` (via `index.ts`, teste) — **sem importador direto confirmado fora de index** |
| FailureCategoryFilter | `RealtimeInboxView.tsx` |
| FileUploader | `chat/ChatInputToolbars.tsx` |
| ForwardMessageDialog | `chat/InputExtraTools.tsx` |
| GlobalSearch | `RealtimeInboxView.tsx`, `chat/ChatDialogs.tsx` |
| ImagePreview | `chat/VirtualMessageBubble.tsx`, `contact-details/ContactAccordionSections.tsx` |
| InboxEmptyChat | `RealtimeInboxView.tsx` |
| InboxFilterPresets | `ConversationListSidebar.tsx` |
| InboxFilters | `RealtimeInboxView.tsx`, `ConversationListSidebar.tsx` |
| InboxKpiBar | **sem importador direto confirmado além de `index.ts`** — candidato a verificar |
| InteractiveMessage | `chat/VirtualMessageBubble.tsx` |
| InteractiveMessageBuilder | `chat/InputExtraTools.tsx` |
| KeyboardShortcutsHelp | `ConversationListSidebar.tsx` |
| KnowledgeBaseSearchPanel | `ContactDetails.tsx` |
| LeadRiskScorePanel | `ContactDetails.tsx` |
| LinkPreview | `chat/ChatDialogs.tsx` |
| LocationMessage | `chat/VirtualMessageBubble.tsx` |
| LocationPicker | `chat/InputExtraTools.tsx`, `LocationMessage.tsx` |
| MediaGallery | `chat/VirtualMessageBubble.tsx`, `contact-details/ContactAccordionSections.tsx` |
| MediaPreview | `chat/VirtualMessageBubble.tsx` |
| MessageBatcherIndicator | `RealtimeInboxView.tsx`, `chat/ChatDialogs.tsx` |
| MessageContextActions | `chat/ChatDialogs.tsx` |
| MessageContextMenu | `chat/ChatDialogs.tsx` |
| MessagePreview | `interactive-builder/index.ts` |
| MessageReactions | `MessageContextMenu.tsx` |

> **⚠️ Candidato a código morto:** `EmojiPicker` e `InboxKpiBar` não têm importador direto confirmado via grep além de `index.ts`. Verificar se são re-exportados e consumidos em runtime.

---

## 7. Implementação por Arquivo

| arquivo | status | o que falta |
|---------|--------|-------------|
| AIConversationAssistant.tsx | COMPLETA | `onClose` prop declarada mas nunca invocada; cache de resumos bloqueado por RLS |
| AISuggestions.tsx | COMPLETA | sem debounce/lock em `fetchSuggestions`; `key` pode colidir por texto idêntico |
| AIToolsPopover.tsx | COMPLETA | `activeTab` não controlável externamente (sem deep-link para aba de universidade) |
| AdvancedMessageMenu.tsx | COMPLETA | status WA suporta só `type: 'text'`; catch blocks sem log |
| AgentReassignmentPanel.tsx | COMPLETA | timeout de 30 min hardcoded sem UI |
| AnalysisBadges.tsx | COMPLETA | `return null` silencioso quando sem análise (layout pula) |
| AudioMemeCategorySelector.tsx | COMPLETA | trigger sem `aria-label`/`aria-expanded` |
| AudioMemePicker.tsx | COMPLETA | botão X sem `aria-label`; duplo-clique pode acionar envio inesperado |
| AudioMemeUploadPreview.tsx | COMPLETA | — |
| AudioMessagePlayer.tsx | COMPLETA | chave por índice em waveform animado; slider de velocidade sem `aria-label` |
| AudioRecorder.tsx | COMPLETA | `Math.random()` em loop de animação causa jitter contínuo |
| AudioTranscriptionPanel.tsx | COMPLETA | — |
| AudioVolumeControl.tsx | COMPLETA | Escape não fecha painel; texto do `title` descreve comportamento errado |
| BulkActionsToolbar.tsx | PARCIAL | `return null` antes do `AnimatePresence` — exit animation nunca dispara; tipo `"connection"` não coberto |
| BusinessHoursBadge.tsx | PARCIAL | `isError` retorna `null` silencioso; agente não sabe se fora do horário |
| CRMAutoSync.tsx | STUB | RPC `sync_to_crm` é stub (RAISE P0001); deps array inclui objeto inteiro; `sentiment` hardcoded |
| ChatPanel.tsx | PARCIAL | 4 handlers de atalho completamente vazios; magic numbers em `setTimeout`; casts de tipo |
| CloseConversationDialog.tsx | COMPLETA | `Promise.all` sem rollback em falha parcial; `console.warn` em vez de logger |
| ContactDetails.tsx | PARCIAL | ação VIP sem persistência; EditContactDialog abre com dados hardcoded perdendo dados reais; listener `keydown` global |
| ContactDetailsResponsive.tsx | COMPLETA | `SheetTitle` ausente (Radix a11y warning) |
| ContactPurchasesPanel.tsx | PARCIAL | `createContactPurchase` falha silenciosamente; `new Date('')` causa crash em `format()` |
| ContactTypeFilter.tsx | PARCIAL | `prestador_servico` aparece em "Outros" e na categoria correta (duplicado) |
| ConversationContextMenu.tsx | PARCIAL | `bg-foreground` torna texto invisível; atalhos decorativos; delete sem confirmação |
| ConversationHistory.tsx | COMPLETA | `onSelectConversation` passa `dayKey` (data string) em vez de UUID real de conversa |
| ConversationList.tsx | COMPLETA | botão Filter sem `onClick` (morto); cast `isArchived` type-unsafe |
| ConversationListSidebar.tsx | COMPLETA | prop `_width` recebida e ignorada completamente |
| ConversationMemoryPanel.tsx | COMPLETA | `loadMemory()` sem `await` após save — race condition |
| ConversationSummary.tsx | COMPLETA | double cast `as unknown as SummaryData`; `onClose` prop fantasma |
| ConversationTasksPanel.tsx | COMPLETA | `profileId as string` sem guard (null → FK "null"); toggleTask/deleteTask sem tratamento de erro |
| ConversationTimeline.tsx | COMPLETA | eventos `close`/`reopen` sem texto descritivo (bloco `<p>` vazio) |
| CustomEmojiPicker.tsx | COMPLETA | callback inconsistente: nativo retorna unicode, customizado retorna URL |
| DeletedMessagePlaceholder.tsx | COMPLETA | — |
| DeliveryStatsPanel.tsx | COMPLETA | — |
| EmojiPicker.tsx | PARCIAL | 197 emojis hardcoded sem busca; duplica nativos do CustomEmojiPicker |
| FailureCategoryFilter.tsx | COMPLETA | — |
| FileUploader.tsx | COMPLETA | lógica real em `useFileUploadLogic` (não auditado aqui) |
| ForwardMessageDialog.tsx | COMPLETA | `contact.id ?? ''` pode criar seleção fantasma para IDs nulos |
| GlobalSearch.tsx | COMPLETA | quick actions são no-ops; navegação via `window.location.hash` |
| ImagePreview.tsx | COMPLETA | toast com emoji hardcoded; sem swipe/touch |
| InboxEmptyChat.tsx | COMPLETA | atalho exibido como `⌘K` sem variante Windows/Linux |
| InboxFilterPresets.tsx | COMPLETA | — |
| InboxFilters.tsx | PARCIAL | filtro de agente por departamento é fallback admitido como incompleto |
| InboxKpiBar.tsx | COMPLETA | ícone `Clock` duplicado; valores sem `aria-label` |
| InteractiveMessage.tsx | COMPLETA | `key={sectionIndex}` por índice numérico; `window.open('tel:...')` usa `_self` |
| InteractiveMessageBuilder.tsx | COMPLETA | `GripVertical` decorativo sem DnD implementado |
| KeyboardShortcutsHelp.tsx | COMPLETA | sem estado vazio quando `inboxShortcuts` retorna `[]` |
| KnowledgeBaseSearchPanel.tsx | COMPLETA | `useKnowledgeBaseSearch` pode ser stub |
| LeadRiskScorePanel.tsx | COMPLETA | datasource inconsistente: SELECT com `supabase`, UPDATE com `dbFrom` |
| LinkPreview.tsx | PARCIAL | sem fetch real de OG tags; título/descrição sempre ausentes para URLs genéricas |
| LocationMessage.tsx | COMPLETA | falha silenciosa se `get-mapbox-token` errar (sem estado de erro exibido) |
| LocationPicker.tsx | COMPLETA | input de busca sem `aria-label`; timezone não tratada em `liveUntil` |
| MediaGallery.tsx | PARCIAL | `isDownloading` sempre `false` — spinner de download nunca aparece |
| MediaPreview.tsx | COMPLETA | `_url` ignorado em `DocumentPreview` — visualização de documentos morta; `_setIsMuted` sem UI |
| MessageBatcherIndicator.tsx | COMPLETA | — |
| MessageContextActions.tsx | COMPLETA | deletar mensagem sem confirmação (ação irreversível via Evolution API) |
| MessageContextMenu.tsx | PARCIAL | 3 opções "Responder depois" passam `message` sem duração (equivalentes ao caller); `_onDownload` ignorado |
| MessagePreview.tsx | COMPLETA | regex de formatação com risco de matches sobrepostos em bold/italic misturado |
| MessageReactions.tsx | COMPLETA | `QuickReactionBar` não exibe reações existentes, apenas botões de adicionar |

---

## 8. Achados

### A1 — ConversationContextMenu: texto invisível por `bg-foreground`
**ConversationContextMenu.tsx:93,183,214** — `bg-foreground` como cor de fundo do menu coloca texto sobre fundo da mesma cor (texto invisível). Bug visual crítico; menu está presente mas ilegível.

### A2 — CRMAutoSync: feature morta sem indicação ao usuário
**CRMAutoSync.tsx:165–227** — RPC `sync_to_crm` é stub declarado (RAISE P0001). Componente silencia o erro (`catch {}`), deps array inclui objetos inteiros causando re-triggers, e `sentiment` hardcoded como `'neutral'`. Feature completamente inoperante sem aviso.

### A3 — CloseConversationDialog: Promise.all sem rollback
**CloseConversationDialog.tsx:113–145** — Se `conversations.update` falhar após `conversation_closures` ter sido inserida, a conversa fica em estado inconsistente (registro de fechamento sem conversa fechada). Sem transação ou rollback.

### A4 — ConversationHistory: passa data em vez de UUID
**ConversationHistory.tsx:199** — `onSelectConversation?.(conv.id)` passa `dayKey` (string de data, ex: `"2026-08-01"`) onde o consumidor espera UUID de conversa. Navegação por histórico silenciosamente quebrada.

### A5 — MediaPreview: DocumentPreview não renderiza documento
**MediaPreview.tsx:46** — Parâmetro `_url` ignorado em `DocumentPreview`; `handleOpen` bloqueia qualquer arquivo com toast. Feature de visualização de documentos está morta sem indicação visual.

### A6 — ContactDetails: EditContactDialog perde dados reais
**ContactDetails.tsx:235–236** — Abre `EditContactDialog` com `version: 0`, `phone_numbers: []`, `notes: null` hardcoded. Dados reais do contato são descartados antes do dialog abrir.

### A7 — ContactPurchasesPanel: crash em data inválida
**ContactPurchasesPanel.tsx:151** — `format(new Date(''), ...)` lança exceção quando compra não tem data. `setLoading(false)` fora do `try/catch` causa spinner infinito em exceção.

### A8 — ConversationTasksPanel: profileId nulo vira string "null"
**ConversationTasksPanel.tsx:87** — `profileId as string` sem guard; se `profileId` for `null`, a FK `created_by` recebe a string `"null"` em vez de falhar explicitamente.

### A9 — GlobalSearch: quick actions são no-ops silenciosos
**GlobalSearch.tsx:89–114** — Ações "Nova conversa" e "Respostas rápidas" chamam apenas `onOpenChange(false)`. Navegação via `window.location.hash` não aciona React Router.

### A10 — ChatPanel: 4 handlers de atalho completamente vazios
**ChatPanel.tsx:278–283** — `onNextConversation`, `onPrevConversation`, `onArchive`, `onRefresh` são todos `() => {}`. Atalhos de teclado são registrados mas sem efeito.

### A11 — AudioRecorder: Math.random() em loop de animação
**AudioRecorder.tsx:120–128** — `Math.random()` dentro do `animate` do Framer Motion gera novo valor a cada frame, causando jitter visual contínuo na waveform ao vivo. Deveria usar `audioLevel` pré-calculado.

### A12 — ConversationMemoryPanel: race condition após save
**ConversationMemoryPanel.tsx:106–131** — `loadMemory()` chamado sem `await` dentro de `saveMemory`. Estado exibe dado antigo após salvar com sucesso.

### A13 — ContactTypeFilter: prestador_servico em categoria duplicada
**ContactTypeFilter.tsx:59** — `prestador_servico` não é excluído da lista de "Outros", aparecendo em duas categorias simultaneamente.

### A14 — BulkActionsToolbar: animação de saída nunca dispara
**BulkActionsToolbar.tsx:33,42** — `return null` antes do `AnimatePresence` impede que a animação `exit` seja executada. Toolbar desaparece abruptamente.

### A15 — LeadRiskScorePanel: datasource inconsistente SELECT vs UPDATE
**LeadRiskScorePanel.tsx:47** — `supabase.from('contacts')` no SELECT mas `dbFrom('contacts')` no UPDATE. Contextos de auth diferentes na mesma tela; possível inconsistência de RLS.

### A16 — InteractiveMessageBuilder: drag handle decorativo
**InteractiveMessageBuilder.tsx:121** — `GripVertical` renderizado visualmente mas sem handlers de DnD. Cria expectativa de reordenação que não existe.

### A17 — AISuggestions: dupla invocação em duplo-clique
**AISuggestions.tsx:40–82** — `fetchSuggestions` sem debounce nem lock. Duplo-clique dispara duas chamadas simultâneas à Edge Function `ai-suggest-reply`.

### A18 — MediaGallery: spinner de download nunca aparece
**MediaGallery.tsx:78** — `_setIsDownloading` nunca chamado; `isDownloading` sempre `false`. Botão de download mostra loading que jamais é ativado.

### A19 — EmojiPicker: lista hardcoded, candidato à remoção
**EmojiPicker.tsx** — 197 emojis hardcoded sem busca nem categorias. Duplica os emojis nativos já presentes no `CustomEmojiPicker`. Candidato a unificação ou remoção.

### A20 — AudioMemeCategorySelector / AudioMemePicker: acessibilidade
**AudioMemeCategorySelector.tsx:24–32** — Trigger sem `aria-label` e sem `aria-expanded`.
**AudioMemePicker.tsx:158** — Botão X de limpar busca sem `aria-label`.
**AudioMessagePlayer.tsx:227** — Slider de velocidade sem `aria-label`.
**ContactDetailsResponsive.tsx:20** — `SheetContent` sem `SheetTitle` (Radix a11y warning no console).
**InboxKpiBar.tsx:94–107** — Valores numéricos dos KPIs sem `aria-label` descritivo.

---

*Runtime: NAO_VERIFICADO — nenhuma execução real foi realizada durante esta análise.*
