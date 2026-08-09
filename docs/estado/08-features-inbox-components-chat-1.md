# Estado: src/features/inbox/components/chat — Parte 1 (UI de Conversa)

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 50/50

## 1. Visao Geral

Este conjunto cobre a camada de UI da conversa no inbox: compositor de mensagens, área de mensagens com scroll virtual, bolhas, indicadores de status de entrega, ferramentas de IA, busca, templates, overlays e controles de ticket. É o núcleo visual mais denso do produto — 50 arquivos, ~9.800 linhas, sem nenhuma chamada direta a banco além de `profiles` (MentionAutocomplete) e `messages` (via hooks). A grande maioria dos dados chega por props, hooks ou hooks de realtime.

### Tabela de Arquivos por Categoria

#### Compositor de Mensagens
| arquivo | linhas | o que faz em 1 linha |
|---------|--------|----------------------|
| ChatInputArea.tsx | 860 | Campo de entrada principal: áudio, emoji, rich text, IA, drag-drop, fila de envio |
| ChatInputToolbars.tsx | 391 | Barras de ferramentas secundária (emoji, sticker) e terciária (menu de extras) |
| InputExtraTools.tsx | 177 | Toolbar extra: mensagem interativa, respostas rápidas, áudio, localização, produto, agenda |
| InputPreviewBars.tsx | 66 | Barras animadas de preview para edição e reply |
| RichTextToolbar.tsx | 157 | Barra flutuante de formatação WhatsApp (*negrito*, _itálico_, etc.) |
| MentionAutocomplete.tsx | 223 | Autocomplete @mention com cache de agentes (TTL 5 min), fetch dedupado de `profiles` |
| AIEnhanceButton.tsx | 171 | Botão Popover para aprimorar mensagens via edge function com seleção de tom |
| AIRewriteButton.tsx | 133 | Botão para reescrever mensagens com IA, escolha de tons com loading por tone |
| MarkdownPreview.tsx | 54 | Renderiza markdown WhatsApp com sanitização DOMPurify |
| ChatSendProgress.tsx | 43 | Barra de progresso animada de envio |
| ChatQuickRepliesPopover.tsx | 125 | Popover de respostas rápidas com navegação por setas/Enter |
| ChatTemplatesOverlay.tsx | 42 | Modal overlay para seleção de templates de mensagem |
| AutomationSuggestionsBar.tsx | 126 | Exibe sugestões de automação com ações usar/enviar/descartar |

#### Área de Mensagens e Bolhas
| arquivo | linhas | o que faz em 1 linha |
|---------|--------|----------------------|
| ChatMessagesArea.tsx | 491 | Área scroll virtualizado com realtime, lazy-load de localização e infinite-scroll |
| ChatMessageBubble.tsx | 362 | Bolha de mensagem com reações, media preview, status de entrega e ações |
| MessageBubble.tsx | 289 | Bolha principal: render, atalhos de teclado (R/F/C), media refresh, reações |
| MessageBubbleUnsupported.tsx | 91 | Fallback diagnóstico para tipos não suportados (poll, reaction, contact, viewOnce) |
| MessageHoverToolbar.tsx | 273 | Toolbar flutuante hover: reply/forward/copy/speak + menu (pin, star, deletar) |
| MessageReadStatus.tsx | 77 | Indicador ✓/✓✓ clicável abre painel de timeline de leitura |
| ChatWatermark.tsx | 142 | Padrão SVG decorativo (foguete, planeta, satélite) com opacidade 0.04 |
| HighlightedText.tsx | 115 | Texto com highlights insensíveis a acentos/case usando normalização NFD |

#### Status e Histórico de Mensagens
| arquivo | linhas | o que faz em 1 linha |
|---------|--------|----------------------|
| MessageStatusInline.tsx | 182 | Indicador de status inline com reconciliação bus/DB e badge de tentativas |
| MessageStatusPanel.tsx | 349 | Popover com timeline completa, stats por participante e gráfico de evolução |
| MessageStatusTimeline.tsx | 236 | Linha do tempo vertical (queued→sent→delivered→read) com ícones e estados |
| MessageStatusTimestamps.tsx | 122 | Chips HH:mm (S/E/L) ao lado do ícone; resolveStages para outbound/inbound |
| MessageStatusFilterBar.tsx | 134 | Chips de filtro multi-seleção com hierarquia inclusiva e contador |
| ConversationDeliverySummary.tsx | 173 | Agregador de status (enviadas/entregues/lidas/falhadas) por direção |
| MessageSendHistorySheet.tsx | 473 | Side sheet com histórico completo: métricas retry, audit log, payload bruto |
| MessageAttemptsTimeline.tsx | 161 | Timeline visual da pipeline de retry (tentativa/total, timestamps, erro) |
| MessageDetailsDialog.tsx | 151 | Dialog com metadados completos (payload, raw_data) — admin/supervisor only |
| FailureFilterBar.tsx | 81 | Barra de filtro de falhas por categoria com tabs |
| SendErrorBanner.tsx | 102 | Banner de falha vermelho com Reenviar/Copiar Detalhes/dismiss expandível |

#### Cabeçalho e Painel
| arquivo | linhas | o que faz em 1 linha |
|---------|--------|----------------------|
| ChatHeader.tsx | 356 | Cabeçalho da conversa: avatar, status, botões, menu de ações |
| ChatHeaderMenu.tsx | 105 | DropdownMenu: transfer, schedule, summary, falhas, close |
| ChatHeaderToolbar.tsx | 199 | Toolbar com 8 botões: search, failures, objections, templates, summary, details |
| ChatPanelHeader.tsx | 290 | Header completo: avatar, digitando, sentimento, badges SLA, menu |
| ChatPanelOverlays.tsx | 79 | Consolida 3 overlays lazy com SectionErrorBoundary |
| ChatToolPanels.tsx | 132 | Painéis lazy-loaded para IA, Objeções, Ajuda, Arquivos |
| ChatSearchBar.tsx | 105 | Barra de busca com filtros, navegação e live results preview |
| ChatSearchFilters.tsx | 145 | Filtros por tipo e seletor de datas com presets e custom range |
| ChatSearchResultsList.tsx | 67 | Preview dos 5 primeiros resultados com snippet e highlighting |
| ChatAssignedBar.tsx | 50 | Barra que exibe contato atribuído + botão transferir com animações |
| ChatMonitoringDialog.tsx | 33 | Dialog de métricas de fila e performance de envio |
| CrmBadges.tsx | 83 | Badges com informações CRM (empresa, vendedor, RFM, status ativo) |
| TicketActionsBar.tsx | 242 | Barra de status/atribuição/roteamento com dropdown e RPC |

#### Overlays e Auxiliares
| arquivo | linhas | o que faz em 1 linha |
|---------|--------|----------------------|
| ChatDialogs.tsx | 194 | Orquestrador lazy de 9 diálogos (transfer, schedule, call, search...) + Suspense |
| ChatDragOverlay.tsx | 39 | Overlay animado de drag-and-drop com ícone paperclip |

#### Testes
| arquivo | linhas | o que faz em 1 linha |
|---------|--------|----------------------|
| __tests__/ChatHeader.onGenerateSummary.test.tsx | 58 | Testa fix TS2322: arrow-wrap em onGenerateSummary evita vazamento de MouseEvent |
| __tests__/ChatHeaderMenu.callbacks.test.tsx | 354 | Testa 6 callbacks, label condicional "Ver Falhas", estados disabled |
| __tests__/ChatInputArea.arrowUp.test.tsx | 263 | Testa BUG-16 (ArrowUp edita última msg) e BUG-13 (ChatSendProgress não duplica) |

---

## 2. Fluxos funcionais de UI

### Composição e envio de mensagem
`ChatInputArea` → `useChatInputLogic` + `useMentions` → `SecondaryToolbar` / `TertiaryToolsMenu` / `InputExtraTools` → `ChatSendProgress` (progresso) → edge function `ai-enhance-message` (via AIEnhanceButton/AIRewriteButton)

### Exibição de mensagens com realtime
`ChatMessagesArea` (scroll virtual + canal realtime `chat-updates:{contactJid}`) → `ChatMessageBubble` → `MessageBubble` → `MessageHoverToolbar` / `MessageReadStatus` / `MessageStatusInline`

### Pipeline de status de entrega
`MessageStatusInline` → `MessageStatusPanel` (popover) → `MessageStatusTimeline` + `MessageStatusTimestamps` → `useDeliveryStats` → `evolution_retry_metrics`

### Busca na conversa
`ChatHeaderToolbar` (botão search) → `ChatSearchBar` → `ChatSearchFilters` + `ChatSearchResultsList` → `useChatSearch`

### Histórico de falhas e reenvio
`TicketActionsBar` / `ChatHeader` → `ChatHeaderMenu` → `FailureFilterBar` + `MessageStatusFilterBar` → `ConversationDeliverySummary` / `MessageSendHistorySheet`

### Atribuição e ticket
`TicketActionsBar` → `supabase.rpc('get_team_profiles')` → ChatHeader (exibe status atribuído)

---

## 3. Tabelas, RPCs, canais realtime e edge functions

### 3.1 Tabelas via .from()
| tabela | schema | operação | arquivo |
|--------|--------|----------|---------|
| `profiles` | `zapp` | SELECT (id, name, email, avatar_url) | MentionAutocomplete.tsx |
| `messages` | via hooks | UPDATE (is_deleted, content) via Evolution | MessageHoverToolbar.tsx (indiretamente) |

### 3.2 RPCs via .rpc()
| rpc | arquivo | parâmetros | uso |
|-----|---------|------------|-----|
| `get_team_profiles` | TicketActionsBar.tsx:74 | — | Carrega atendentes ativos; staleTime 60s |

### 3.3 Canais realtime
| canal | schema | tabela | evento | arquivo |
|-------|--------|--------|--------|---------|
| `chat-updates:{contactJid}` | `evo` | `evolution_messages` | UPDATE, DELETE | ChatMessagesArea.tsx |
| via `useConversationReactionsRealtime` | `evo` | reações (batch RPC ou `.in()` chunkado) | INSERT/UPDATE | ChatMessagesArea.tsx |

### 3.4 Edge functions e APIs externas
| endpoint | chamado por | payload |
|----------|-------------|---------|
| `ai-enhance-message` (Edge Function) | AIEnhanceButton.tsx, AIRewriteButton.tsx | `{message, tone, contactName}` → `{enhanced}` |
| Evolution API: `deleteMessage` | MessageHoverToolbar.tsx (via useEvolutionApi) | messageId |
| Evolution API: `markMessageAsRead/Unread` | MessageHoverToolbar.tsx (via useEvolutionApi) | messageId |

---

## 4. Exports Públicos

```
AIEnhanceButton, AIRewriteButton, AutomationSuggestionsBar,
ChatAssignedBar, ChatDialogs, ChatDragOverlay,
ChatHeader, ChatHeaderMenu, ActiveTool, ChatHeaderToolbar,
ChatInputArea, SecondaryToolbar, TertiaryToolsMenu,
ChatMessageBubble, ChatMessagesAreaRef, ChatMessagesArea,
ChatMonitoringDialog, ChatPanelHeader, ChatPanelOverlays,
ChatQuickRepliesPopover, ChatSearchBar, ChatSearchFilters, ChatSearchResultsList,
ChatSendProgress, ChatTemplatesOverlay, ChatToolPanels, ChatWatermark,
ConversationDeliverySummary, CrmBadges, FailureFilterBar,
HighlightedText, InputExtraTools, InputPreviewBars,
formatWhatsAppText, MarkdownPreview,
MentionAutocomplete, useMentions,
MessageAttemptsTimeline, MessageBubble, MessageBubbleUnsupported,
MessageDetailsDialog, MessageHoverToolbar, MessageReadStatus,
MessageSendHistorySheet,
MessageStatusFilter, matchesStatusFilter, filterMessagesByStatus, MessageStatusFilterBar,
MessageStatusInline, MessageStatusPanel, MessageStatusTimeline, MessageStatusTimestamps,
RichTextToolbar, RichTextToggle, SendErrorBanner, TicketActionsBar
```

---

## 5. Chama (Saida)

**Hooks externos:**
- `useChatInputLogic`, `useMentions`, `useChatPanelHandlers` (pasta `chat/hooks/`)
- `useAutomationSuggestions`, `useContactIntelligence`, `useContactAvatar`, `useDensity` (inbox/hooks)
- `useVirtualizer` (tanstack/react-virtual)
- `useDeliveryStats`, `useMessageAttempts`, `useMessageSendHistory`, `useFailureReason` (inbox/hooks)
- `useTicketStatus`, `useInboxStatusPref`, `useAuth`, `useUserRole` (app/hooks)
- `useChatSearch`, `useConversationReactionsRealtime` (inbox/hooks)

**Services/utils:**
- `supabase.functions.invoke('ai-enhance-message')`
- `supabase.from('profiles')`, `supabase.rpc('get_team_profiles')`
- `supabase.channel(...)` para realtime
- Evolution API via `useEvolutionApi`
- `featureFlags.isFeatureEnabled('v2_audio_recorder', 'message_queue_retry')`
- `getLogger`, `DOMPurify`, `format` (date-fns), `queryKeys`

**Componentes externos a este conjunto:**
- `AudioRecorder`, `StickerPicker`, `CustomEmojiPicker`, `FileUploader`, `EmojiPicker`
- `TemplatesWithVariables`, `MessageTemplates`, `AISuggestions`
- `TransferDialog`, `ScheduleMessageDialog`, `CallDialog`, `GlobalSearch`, `InteractiveMessageBuilder` (lazy)
- `NextBestAction`, `VisualValidation`, `WhisperMode` (lazy, via ChatPanelOverlays)
- `AIConversationAssistant`, `ObjectionDetector`, `UniversityHelp`, `TeamFiles` (lazy, via ChatToolPanels)
- `SLAIndicatorForContact`, `TypingIndicator`, `MessageReactions`, `LocationMessage`
- `recharts` (LineChart em MessageStatusPanel)

---

## 6. Chamado Por (Entrada)

| componente | quem renderiza |
|------------|----------------|
| ChatHeader | `ChatPanelHeader.tsx` (local), `ChatPanel.tsx` |
| ChatInputArea | `ChatPanel.tsx`, `TeamChatPanel.tsx` (team-chat) |
| ChatMessagesArea | `ChatPanel.tsx` |
| ChatDialogs | `ChatPanel.tsx` |
| ChatPanelHeader | `ChatPanel.tsx` |
| ChatPanelOverlays | `ChatPanel.tsx` |
| TicketActionsBar | `ChatPanel.tsx` |
| SendErrorBanner | `ChatPanel.tsx` |
| ChatDragOverlay | `ChatPanel.tsx` |
| ConversationDeliverySummary | `ChatPanel.tsx` |
| FailureFilterBar | `ChatPanel.tsx` |
| ChatAssignedBar | `ChatPanelHeader.tsx` |
| ChatHeaderMenu | `ChatHeader.tsx`, `ChatPanelHeader.tsx` |
| ChatHeaderToolbar | `ChatHeader.tsx`, `ChatPanelHeader.tsx` |
| CrmBadges | `ChatPanelHeader.tsx` |
| ChatMonitoringDialog | `ChatDialogs.tsx` |
| AIEnhanceButton, AIRewriteButton | `ChatInputArea.tsx` |
| SecondaryToolbar, TertiaryToolsMenu | `ChatInputArea.tsx` |
| InputExtraTools, InputPreviewBars | `ChatInputArea.tsx` |
| ChatSendProgress | `ChatInputArea.tsx` |
| MentionAutocomplete | `ChatInputArea.tsx`, `TeamChatInputArea.tsx` |
| RichTextToolbar | `ChatInputArea.tsx`, `TeamChatInputArea.tsx` |
| AutomationSuggestionsBar | `ChatInputArea.tsx` |
| ChatQuickRepliesPopover | `InputExtraTools.tsx` |
| ChatTemplatesOverlay | `ChatInputArea.tsx` (overlay) |
| MarkdownPreview | `ChatInputArea.tsx`, `ChatMessageBubble.tsx` |
| MessageBubble | `ChatMessageBubble.tsx`, `VirtualMessageBubble.tsx`, `ZappWebbDemoPage.tsx` |
| MessageBubbleUnsupported | `MessageBubble.tsx` |
| MessageHoverToolbar | `MessageBubble.tsx` |
| MessageReadStatus | `MessageBubble.tsx`, `ChatMessageBubble.tsx` |
| MessageStatusInline | `MessageBubble.tsx`, `ChatMessageBubble.tsx` |
| MessageStatusPanel | `MessageStatusInline.tsx` |
| MessageStatusTimeline | `MessageStatusPanel.tsx`, `MessageAttemptsTimeline.tsx` |
| MessageStatusTimestamps | `MessageStatusPanel.tsx` |
| MessageStatusFilterBar | `ChatMessagesArea.tsx` |
| MessageSendHistorySheet | `MessageHoverToolbar.tsx` (menu) |
| MessageAttemptsTimeline | `MessageHoverToolbar.tsx` (menu), `MessageDetailsDialog.tsx` |
| MessageDetailsDialog | `MessageHoverToolbar.tsx` (menu) |
| HighlightedText | `ChatSearchResultsList.tsx` |
| ChatSearchResultsList | `ChatSearchBar.tsx` |
| ChatSearchBar, ChatSearchFilters | `ChatToolPanels.tsx` ou via `ChatHeaderToolbar` |
| ChatToolPanels | `ChatInputArea.tsx`, `ChatPanelOverlays.tsx` |
| ChatWatermark | `ChatMessagesArea.tsx` |

> **Sem importadores identificados fora deste repositório:** todos os componentes têm pelo menos 1 importador dentro de `src/`.

---

## 7. Implementacao por Arquivo

| arquivo | status | o que falta |
|---------|--------|-------------|
| AIEnhanceButton.tsx | COMPLETA | — |
| AIRewriteButton.tsx | COMPLETA | — |
| AutomationSuggestionsBar.tsx | COMPLETA | — |
| ChatAssignedBar.tsx | COMPLETA | — |
| ChatDialogs.tsx | COMPLETA | — |
| ChatDragOverlay.tsx | COMPLETA | — |
| ChatHeader.tsx | PARCIAL | Videochamada hardcoded `undefined` (sempre desabilitada) |
| ChatHeaderMenu.tsx | PARCIAL | "Adicionar tag" e "Marcar como resolvido" `disabled` sem handler (stubs visíveis) |
| ChatHeaderToolbar.tsx | COMPLETA | — |
| ChatInputArea.tsx | PARCIAL | `_onRetry` e `_onRemoveFromQueue` prefixadas underscore mas referenciadas nas linhas 377/384 |
| ChatInputToolbars.tsx | COMPLETA | — |
| ChatMessageBubble.tsx | COMPLETA | — |
| ChatMessagesArea.tsx | PARCIAL | BUG-21: estimativa de altura não recalcula com replies/reactions dinâmicas |
| ChatMonitoringDialog.tsx | COMPLETA | — |
| ChatPanelHeader.tsx | COMPLETA | — |
| ChatPanelOverlays.tsx | COMPLETA | — |
| ChatQuickRepliesPopover.tsx | COMPLETA | — |
| ChatSearchBar.tsx | COMPLETA | — |
| ChatSearchFilters.tsx | COMPLETA | — |
| ChatSearchResultsList.tsx | PARCIAL | Limit hardcoded a 5; `return null` sem mensagem de "nenhum resultado" |
| ChatSendProgress.tsx | COMPLETA | — |
| ChatTemplatesOverlay.tsx | COMPLETA | — |
| ChatToolPanels.tsx | COMPLETA | — |
| ChatWatermark.tsx | COMPLETA | — |
| ConversationDeliverySummary.tsx | COMPLETA | — |
| CrmBadges.tsx | COMPLETA | — |
| FailureFilterBar.tsx | COMPLETA | — |
| HighlightedText.tsx | COMPLETA | — |
| InputExtraTools.tsx | COMPLETA | — |
| InputPreviewBars.tsx | COMPLETA | — |
| MarkdownPreview.tsx | COMPLETA | — |
| MentionAutocomplete.tsx | COMPLETA | — |
| MessageAttemptsTimeline.tsx | COMPLETA | — |
| MessageBubble.tsx | COMPLETA | — |
| MessageBubbleUnsupported.tsx | COMPLETA | — |
| MessageDetailsDialog.tsx | COMPLETA | — |
| MessageHoverToolbar.tsx | PARCIAL | Favoritar, Fixar, Responder depois: stubs desabilitados; Reportar sem handler |
| MessageReadStatus.tsx | COMPLETA | — |
| MessageSendHistorySheet.tsx | COMPLETA | — |
| MessageStatusFilterBar.tsx | COMPLETA | — |
| MessageStatusInline.tsx | COMPLETA | — |
| MessageStatusPanel.tsx | COMPLETA | — |
| MessageStatusTimeline.tsx | COMPLETA | — |
| MessageStatusTimestamps.tsx | PARCIAL | `return null` sem fallback visual quando entries.length === 0 (l.97) |
| RichTextToolbar.tsx | COMPLETA | — |
| SendErrorBanner.tsx | COMPLETA | — |
| TicketActionsBar.tsx | COMPLETA | — |
| __tests__/ChatHeader.onGenerateSummary.test.tsx | COMPLETA | Superficial: cobre apenas 1 cenário de tipo |
| __tests__/ChatHeaderMenu.callbacks.test.tsx | COMPLETA | — |
| __tests__/ChatInputArea.arrowUp.test.tsx | COMPLETA | Type cast frágil em makeQueueItem (l.249) |

---

## 8. Achados

### A1 — Stubs UI visíveis em ChatHeaderMenu (actions desabilitadas)
`ChatHeaderMenu.tsx:58,85` — "Adicionar tag" e "Marcar como resolvido" renderizados como `disabled` sem handler e sem data prevista. Usuário vê itens de menu que nunca ativam, sugerindo feature incompleta.

### A2 — Stubs em MessageHoverToolbar: Favoritar, Fixar, Reportar
`MessageHoverToolbar.tsx:188-233` — Três itens do menu de hover (Favoritar ★, Fixar 📌, Responder depois) são `disabled` sem handler. O botão "Reportar" está presente para mensagens inbound mas sem onClick funcional. Quatro ações prometidas sem implementação.

### A3 — BUG-21: estimativa de altura incorreta em virtualização
`ChatMessagesArea.tsx:255-266` — O virtualizador usa altura estimada que não recalcula corretamente quando replies aninhados ou reações são adicionadas dinamicamente. Causa desalinhamento de scroll em conversas com alto engajamento.

### A4 — Destructure sem nullcheck em TicketActionsBar
`TicketActionsBar.tsx:97` — `const {status, assignedTo, setStatus, assumir, transferir, devolverFila, atribuirAuto} = useTicketStatus(...)` sem guard. Se o hook retornar `undefined` (ex.: erro de contexto), o componente explode em runtime com "Cannot destructure property 'status' of undefined".

### A5 — Props `_onRetry` e `_onRemoveFromQueue` com underscore mas referenciadas
`ChatInputArea.tsx:159-161` — Props declaradas com prefixo `_` (convenção de "não usar") mas utilizadas nas linhas 377 e 384. Indica refatoração incompleta: ou as props devem ser removidas, ou o prefixo deve ser retirado.

### A6 — `.map()` sem `key` explícita em MessageSendHistorySheet
`MessageSendHistorySheet.tsx:289` — Lista de tentativas de retry renderizada com `.map()` usando índice implícito. Se a ordem mudar por reordenação do servidor, React vai reutilizar DOM incorretamente.

### A7 — useEffect de tracking pode disparar múltiplas vezes em StrictMode
`MessageReadStatus.tsx:40-46` — side-effect de "marcar como lido" dentro de `useEffect` com `useRef` de controle. Em StrictMode (dev), o efeito roda 2× na montagem, podendo marcar como lido prematuramente ou duplicar chamadas à Evolution API.

### A8 — Videochamada hardcoded como `undefined`
`ChatHeader.tsx:246` — Prop/variável de chamada de vídeo atribuída como `undefined` diretamente, fazendo com que o botão correspondente nunca ative. Sem feature flag ou comentário explicativo.

### A9 — ChatSearchResultsList: retorno silencioso e limite fixo
`ChatSearchResultsList.tsx:26` — `return null` silencioso quando não há resultados (sem mensagem "Nenhum resultado encontrado"). `ChatSearchResultsList.tsx:30` — `slice(0, 5)` hardcoded sem configuração; linha 58 exibe "+N mais" mas não há paginação nem link para ver todos.

### A10 — Emojis de sentimento hardcoded em ChatPanelHeader sem fallback acessível
`ChatPanelHeader.tsx:155-162` — Emojis 🔥 😡 🌟 para representar sentimento (alto, negativo, neutro) sem `aria-label` ou alternativa textual. Leitores de tela anunciam caracteres unicode brutos.

### A11 — MessageStatusTimestamps: return null sem fallback visual
`MessageStatusTimestamps.tsx:97` — Retorna `null` quando `entries.length === 0`. Pode criar espaço vazio inesperado no layout ao lado do ícone de status, pois o container pai já reservou espaço.

### A12 — Texto "Criptografia de Ponta a Ponta" hardcoded em ChatMessagesArea
`ChatMessagesArea.tsx:373-384` — Mensagem decorativa sempre renderizada quando há mensagens, com texto fixo em pt-BR hardcoded. Não configurable, sem i18n, e aparece em todos os workspaces inclusive internacionais.

### A13 — Comentário FIX 2026-08-03 e GAP-01 indicam débitos técnicos ativos
`ChatMessagesArea.tsx:103-107` — FIX sobre `messageType` para evitar 23+ tentativas em stickers/ephemeral. `MessageBubble.tsx:112-117` — skip-list de tipos para media refresh. Ambos são workarounds documentados, não soluções definitivas.

*Runtime: NAO_VERIFICADO - nenhuma execucao real foi realizada durante esta analise.*
