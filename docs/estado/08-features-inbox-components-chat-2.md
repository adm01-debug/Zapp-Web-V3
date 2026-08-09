# Estado: features/inbox/components/chat — segunda metade (batch 6A2)

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 49/49

## 1. Visão Geral

Este batch cobre a segunda metade de `src/features/inbox/components/chat/`: 27 arquivos de teste (21 em `__tests__/` + 6 em `hooks/__tests__/`), 7 hooks auxiliares em `hooks/`, 11 arquivos de lógica/utilitários fonte, 1 barrel (`index.ts`) e 2 arquivos de contrato/métricas. `useChatPanelHandlers.ts` (619 lin) é o orchestrator central que compõe todos os sub-hooks. `ChatPanel.tsx` é o único importador externo real de praticamente todo este conjunto.

### Tabela de Arquivos por Categoria

| arquivo | linhas | o que faz em 1 linha |
|---------|--------|----------------------|
| `__tests__/ChatInputArea.guards.test.tsx` | 105 | Testa guards de runtime (`getQueueLength`, `normalizeAttempts`, `getLastAttemptDuration`) |
| `__tests__/ChatMessagesArea.getItemSize.test.tsx` | 167 | BUG-21: `estimateSize` do virtualizer acumula incrementos por replyTo/reactions/interactive |
| `__tests__/ChatMessagesArea.scrollToMessage.test.tsx` | 199 | BUG-17/18: `scrollToMessage` chama `virtualizer.scrollToIndex` com índice correto |
| `__tests__/ChatSearchBar.keyboard.test.tsx` | 485 | Renderização, teclado (Escape/Arrows/Enter), botão X e contador de resultados |
| `__tests__/chatInputGuards.test.ts` | 55 | Funções puras de `chatInputGuards` (undefined/null/arrays) |
| `__tests__/chatpanel.simulation.test.ts` | 520 | 17 edge cases: whisper+anexos, JID externo, product handlers, slash commands |
| `__tests__/loadOlderMetrics.test.ts` | 277 | Contadores de métricas de paginação (started/cancelled/completed/timing) |
| `__tests__/messageStatusLanguage.test.ts` | 168 | `STATUS_LABEL_UNIFIED`, `STAGE_LABEL_UNIFIED`, `describeStatus` outbound/inbound |
| `__tests__/p0-regressions.test.ts` | 569 | 7 regressões P0: `resolveContactRef` em todos os formatos de JID |
| `__tests__/scrollLoaderController.test.ts` | 247 | `createScrollLoaderController`: `triggerLoad`, throttle, isFetching, savedScrollHeight |
| `__tests__/useChatFilters.identity.test.ts` | 153 | Estabilidade referencial (useMemo) de mensagens filtradas e contagens por categoria |
| `__tests__/useChatInputLogic.memory.test.ts` | 149 | BUG-11/12: revogação de object URLs no envio e unmount |
| `__tests__/useChatPanelHandlers.burst.test.ts` | 242 | Zero queries `dbFrom` ao montar/trocar contato em rajada |
| `__tests__/useChatPanelHandlers.edit.test.ts` | 220 | Fluxo de edição: `editMessageApi` chamado antes do toast de sucesso |
| `__tests__/useChatPanelHandlers.sendContract.test.ts` | 197 | Contrato `onSendMessage(content, attachments, onProgress)` — 3 params |
| `__tests__/useChatPanelHandlers.whisper.test.ts` | 180 | BUG-01/02: sussurro com falha não contamina retry WhatsApp |
| `__tests__/useInputHandlers.slash.test.ts` | 299 | 10 slash commands chamam callbacks reais |
| `__tests__/useMessageReactionHandlers.copy.test.ts` | 92 | BUG-09: `handleCopyMessage` — toast só após resolver; toast destructive em falha |
| `__tests__/useProductHandlers.interactive.test.ts` | 203 | BUG-05/08: `handleSendInteractiveMessage` chama API; JID montado de `contactPhone` |
| `__tests__/useProductHandlers.location.test.ts` | 167 | BUG-06: `handleSendLocation` persiste em `messages` se contactId é UUID |
| `__tests__/useProductHandlers.product.test.ts` | 131 | BUG-10: `handleSendProduct` aguarda `onSendMessage` antes do toast |
| `chatInputGuards.ts` | 40 | Guards de runtime para props opcionais (queue/attempts) que montam tarde |
| `hooks/__tests__/useChatDialogs.test.ts` | 201 | Reducer de 17 dialogs: OPEN/CLOSE/TOGGLE/RESET, idempotência, estabilidade de refs |
| `hooks/__tests__/useChatDragAndDrop.test.ts` | 268 | `isDraggingOver` via contador (nested divs); delegação para `fileUploaderRef` |
| `hooks/__tests__/useChatFilters.test.ts` | 382 | Filtros via URL params com `MemoryRouter`; 3 status de falha; atualização de URL |
| `hooks/__tests__/useChatQuickReplyControl.test.ts` | 315 | Autocomplete `/`, filtro case-insensitive, navegação setas, Enter/Escape, foco pós-seleção |
| `hooks/__tests__/useChatSearchState.test.ts` | 168 | Estado local: Set de IDs destacados, `activeHighlightId`, `searchQuery`; reset atômico |
| `hooks/__tests__/useInitialHighlight.test.ts` | 356 | Deep-link "View in chat": retry 10× a 150ms; limpeza 3500ms; toast após 20 falhas |
| `hooks/useChatDialogs.ts` | 58 | Gerencia 17 dialogs via `useReducer` (OPEN/CLOSE/TOGGLE/RESET) |
| `hooks/useChatDragAndDrop.ts` | 54 | D&D de arquivos sobre o chat; delega para `FileUploaderRef` |
| `hooks/useChatFilters.ts` | 98 | Filtro de mensagens falhas via URL search params (`failuresOnly`, `failureCategory`) |
| `hooks/useChatQuickReplyControl.ts` | 109 | Autocomplete `/` para quick replies — filtra, navega com setas, seleciona com Enter |
| `hooks/useChatScheduleMessage.ts` | 68 | Upload de anexo em `whatsapp-media` + signed URL + chama `scheduleMessage()` |
| `hooks/useChatSearchState.ts` | 31 | Estado local de highlight/search (IDs destacados, query) |
| `hooks/useInitialHighlight.ts` | 104 | Deep-link scroll+highlight temporário (~3.5s), retry até 5s, toast após falhas |
| `hooks/useSLADelivery.ts` | 109 | Verifica atraso SLA de entrega a cada 60s; lê `sla_delivery_rules` via React Query |
| `index.ts` | 50 | Barrel: re-exporta ~42 componentes/hooks/utilitários do módulo chat |
| `loadOlderMetrics.ts` | 108 | Métricas in-memory de paginação; expõe em `window.__loadOlderMetrics` |
| `loadOlderTypes.ts` | 44 | Tipos/contrato para paginação "carregar mensagens antigas" |
| `messageBubbleParts.tsx` | 226 | Renderiza corpo da bolha (imagem/vídeo/áudio/doc/localização/sticker/texto) + WhisperBadge |
| `messageStatusLanguage.ts` | 74 | Enum e labels unificados de status de mensagem + `describeStatus()` |
| `messageUtils.tsx` | 82 | Formatadores de hora/data + `MessageStatusIcon` (ícones WhatsApp-style) |
| `scrollLoaderController.ts` | 118 | Controller stateful/framework-agnóstico para throttle+lock+cancel de scroll-to-top |
| `useAudioVoiceChange.ts` | 42 | Upload de blob em `audio-messages`; atualiza `media_url` em `messages` |
| `useChatInputLogic.ts` | 267 | Auto-resize, draft localStorage, anexos, paste, envio animado, limite 4096 chars |
| `useChatPanelHandlers.ts` | 619 | Orchestrator central: compõe todos sub-hooks; gerencia send/edit/retry/whisper/snooze/... |
| `useInputHandlers.ts` | 273 | Handlers de teclado, digitação e slash-commands (/resolve /snooze /tag /note...) |
| `useMessageReactionHandlers.ts` | 97 | Reply, copy-to-clipboard, forward (via `sendMessageToContact`) |
| `useProductHandlers.ts` | 167 | Envio produto, mensagem interativa (WhatsApp buttons), click botão, localização |

---

## 2. Fluxos Funcionais de UI

### Envio de mensagem simples
`useChatInputLogic` (draft + anexos) → `useInputHandlers` (teclado Enter) → `useChatPanelHandlers.onSendMessage` → `messageSender.sendMessage` (hook realtime) → Evolution API

### Envio de mensagem agendada
`useChatPanelHandlers` → `useChatScheduleMessage.scheduleMediaMessage` → Storage `whatsapp-media` (upload) → `storageSignedUrls.getSignedMediaUrl` (signed URL 7d) → `scheduleMessage()` (hook/RPC)

### Whisper (nota interna)
`useInputHandlers` detecta modo whisper → `useChatPanelHandlers.handleWhisperSend` → `insertWhisperMessage` (mutation) → tabela `whisper_messages`

### Busca no chat
`ChatSearchBar` → `useChatSearchState` (query + IDs destacados) → `ChatMessagesArea.scrollToMessage` (imperativo via `useImperativeHandle`)

### Filtro de falhas
`FailureFilterBar` → URL params `?failuresOnly=1&failureCategory=X` → `useChatFilters` (useMemo sobre `messages`) → `visibleMessages` filtrado

### Quick Reply
`useInputHandlers` detecta `/` → `useChatQuickReplyControl` (filtra `quick_replies`, navega setas, seleciona Enter) → `onSendMessage`

### Deep-link "View in chat"
`useInitialHighlight` (monta com `targetMessageId`) → retry `scrollToMessage` 10× a 150ms → toast destrutivo após 20 tentativas × 250ms

### Carregar mensagens antigas (paginação)
`scrollLoaderController` (throttle+lock, detecta scroll top) → `LoadOlderCallback` (`loadOlderTypes`) → `useInboxSource.loadOlderMessages` → Supabase

### Reação / Cópia / Forward
`useMessageReactionHandlers`: `handleReplyToMessage`, `handleCopyMessage` (clipboard), `handleForwardMessage` / `handleForwardToTargets` → `sendMessageToContact`

### Produto / Interativo / Localização
`useProductHandlers`: `handleSendProduct` (texto formatado), `handleSendInteractiveMessage` (WhatsApp buttons), `handleInteractiveButtonClick`, `handleSendLocation` → Evolution API / INSERT `messages`

### Mudança de velocidade de áudio
`useAudioVoiceChange` → novo blob de áudio → Storage `audio-messages` (upload) → UPDATE `messages.media_url`

### Monitoramento de SLA
`useSLADelivery` — intervalo 60s → SELECT `sla_delivery_rules` (via React Query `safeClient`) → compara `messages` recebidas → alerta

---

## 3. Tabelas, RPCs, Canais Realtime e Edge Functions

### 3.1 Tabelas via `.from()`

| tabela | schema | operação | arquivo |
|--------|--------|----------|---------|
| `evolution_messages` | `evo` / zapp view | UPDATE content (edit) | `useChatPanelHandlers.ts` |
| `messages` | `zapp` | UPDATE media_url; INSERT location | `useAudioVoiceChange.ts`, `useProductHandlers.ts` |
| `conversation_snoozes` | `zapp` | INSERT | `useChatPanelHandlers.ts` |
| `pinned_conversations` | `zapp` | SELECT / INSERT / DELETE | `useChatPanelHandlers.ts` |
| `reminders` | `zapp` | INSERT | `useChatPanelHandlers.ts` |
| `contact_notes` | `zapp` | INSERT | `useChatPanelHandlers.ts` |
| `contact_tags` | `zapp` | INSERT | `useChatPanelHandlers.ts` |
| `tags` | `zapp` | SELECT ILIKE | `useChatPanelHandlers.ts` |
| `sla_delivery_rules` | `zapp` | SELECT (React Query) | `hooks/useSLADelivery.ts` |

### 3.2 RPCs via `.rpc()`

Nenhuma RPC identificada neste conjunto de arquivos.

### 3.3 Canais Realtime

Nenhum canal Realtime declarado neste conjunto (canais de mensagens ficam em hooks de nível superior fora deste batch).

### 3.4 Edge Functions e APIs Externas

| recurso | tipo | arquivo |
|---------|------|---------|
| `whatsapp.sendInteractive` | Evolution API (via adaptador) | `useProductHandlers.ts` |
| `whatsapp.sendLocation` | Evolution API (via adaptador) | `useProductHandlers.ts` |
| `messageSender.sendMessage` | Hook realtime (batch 6A1) | `useChatPanelHandlers.ts` |
| `insertWhisperMessage` | Mutation hook | `useChatPanelHandlers.ts` |
| `scheduleMessage` | Hook/RPC (batch anterior) | `hooks/useChatScheduleMessage.ts` |
| Storage `whatsapp-media` | Supabase Storage | `hooks/useChatScheduleMessage.ts` |
| Storage `audio-messages` | Supabase Storage | `useAudioVoiceChange.ts` |

---

## 4. Exports Públicos

| arquivo | exports |
|---------|---------|
| `chatInputGuards.ts` | `QueueAttempt`, `QueueItemLike`, `getQueueLength`, `normalizeAttempts`, `getLastAttemptDuration` |
| `hooks/useChatDialogs.ts` | `DialogKey`, `DialogState`, `useChatDialogs` |
| `hooks/useChatDragAndDrop.ts` | `useChatDragAndDrop` |
| `hooks/useChatFilters.ts` | `FAILURE_CATEGORIES`, `FailureCategory`, `useChatFilters` |
| `hooks/useChatQuickReplyControl.ts` | `useChatQuickReplyControl` |
| `hooks/useChatScheduleMessage.ts` | `useChatScheduleMessage` |
| `hooks/useChatSearchState.ts` | `useChatSearchState` |
| `hooks/useInitialHighlight.ts` | `useInitialHighlight` |
| `hooks/useSLADelivery.ts` | `useSLADelivery` |
| `index.ts` | ~42 re-exports do módulo chat (ver barrel) |
| `loadOlderMetrics.ts` | `LoadOlderSnapshot`, `recordLoadOlderStarted`, `recordLoadOlderCancelled`, `recordLoadOlderCompleted`, `getLoadOlderMetrics`, `resetLoadOlderMetrics` |
| `loadOlderTypes.ts` | `LoadOlderCallback`, `CancelLoadOlderCallback`, `LoadOlderProps` |
| `messageBubbleParts.tsx` | `MediaRefreshKey`, `MessageBubbleBody`, `WhisperBadge` |
| `messageStatusLanguage.ts` | `StatusLevel`, `STATUS_LABEL_UNIFIED`, `STAGE_LABEL_UNIFIED`, `STAGE_INITIAL_UNIFIED`, `describeStatus` |
| `messageUtils.tsx` | `formatMessageTime`, `formatDateSeparator`, `MessageStatusIcon` |
| `scrollLoaderController.ts` | `ScrollLoaderOptions`, `ScrollLoaderController`, `createScrollLoaderController` |
| `useAudioVoiceChange.ts` | `useAudioVoiceChange` |
| `useChatInputLogic.ts` | `ChatInputAttachment`, `useChatInputLogic`, `setNativeValue` |
| `useChatPanelHandlers.ts` | `useChatPanelHandlers` |
| `useInputHandlers.ts` | `slashSnoozeToIso`, `useInputHandlers` |
| `useMessageReactionHandlers.ts` | `useMessageReactionHandlers` |
| `useProductHandlers.ts` | `useProductHandlers` |
| `__tests__/*`, `hooks/__tests__/*` | nenhum export (arquivos de teste) |

---

## 5. Chama (Saída)

Dependências externas a este conjunto que os arquivos fonte importam:

| dependência | de | consumidor neste batch |
|-------------|-----|------------------------|
| `@/integrations/datasource/db` (`dbFrom`) | shared | `useChatPanelHandlers.ts`, `useAudioVoiceChange.ts`, `useProductHandlers.ts` |
| `@/lib/whatsappAdapter` | lib | `useProductHandlers.ts`, `useChatPanelHandlers.ts` |
| `@/hooks/use-toast` | hooks | `useChatPanelHandlers.ts`, `useInputHandlers.ts`, `useProductHandlers.ts`, `useMessageReactionHandlers.ts` |
| `@/features/inbox/hooks/realtime/messageSender` | batch 6A1 | `useChatPanelHandlers.ts` |
| `@/hooks/useWhisperMessagesMutation` | hooks | `useChatPanelHandlers.ts` |
| `@/lib/storageSignedUrls` | lib | `hooks/useChatScheduleMessage.ts`, `useAudioVoiceChange.ts` |
| `@/lib/undoToast` | lib | `useChatPanelHandlers.ts` |
| `@/hooks/useExternalApiManagement` | hooks | `useChatPanelHandlers.ts` |
| `@/features/auth` | auth | mocks nos testes; `useChatPanelHandlers.ts` |
| `@/lib/logger` | lib | múltiplos hooks |
| `@/lib/clientTelemetry` | lib | `loadOlderMetrics.ts` (window.__loadOlderMetrics exposto para) |
| `react-router-dom` | deps | `hooks/useChatFilters.ts` (useSearchParams) |
| `@tanstack/react-query` | deps | `hooks/useSLADelivery.ts` |

---

## 6. Chamado Por (Entrada)

| arquivo | chamado por |
|---------|-------------|
| `chatInputGuards.ts` | `ChatInputArea.tsx` (único consumidor em produção) |
| `hooks/useChatDialogs.ts` | `ChatPanel.tsx`, `useChatPanelHandlers.ts` |
| `hooks/useChatDragAndDrop.ts` | `ChatPanel.tsx` |
| `hooks/useChatFilters.ts` | `FailureFilterBar.tsx`, `useChatPanelHandlers.ts` |
| `hooks/useChatQuickReplyControl.ts` | `ChatPanel.tsx` |
| `hooks/useChatScheduleMessage.ts` | `useChatPanelHandlers.ts`, `src/lib/storageSignedUrls.ts` |
| `hooks/useChatSearchState.ts` | `ChatPanel.tsx`, `useChatPanelHandlers.ts` |
| `hooks/useInitialHighlight.ts` | `ChatPanel.tsx` |
| `hooks/useSLADelivery.ts` | `ChatPanel.tsx` |
| `index.ts` (barrel) | `ChatPanel.tsx`, `CRMAutoSync.tsx`, `ReplyQuote.tsx`, `SLAIndicatorForContact.tsx`, `LocationMessage.tsx`, `ContactActionButtons.tsx`, `RetryFailureBadge.tsx`, `ChatSearchBar.tsx` |
| `loadOlderMetrics.ts` | `ChatPanel.tsx`, `clientTelemetry.ts` |
| `loadOlderTypes.ts` | `ChatPanel.tsx`, `useInboxSource.ts` |
| `messageBubbleParts.tsx` | `ChatPanel.tsx` (e componentes de bolha no mesmo módulo) |
| `messageStatusLanguage.ts` | `MessageStatusTimestamps.tsx`, `MessageStatusFilterBar.tsx`, `MessageStatusInline.tsx`, `MessageReadStatus.tsx` (todos no módulo chat) |
| `messageUtils.tsx` | `MessageBubble.tsx`, `ChatMessageBubble.tsx`, `MessageStatusInline.tsx`, `MessageReadStatus.tsx` (todos no módulo chat) |
| `scrollLoaderController.ts` | re-exportado via `index.ts`; consumidor direto provável: `ChatMessagesArea.tsx` — **nenhum importador externo identificado** |
| `useAudioVoiceChange.ts` | `ChatPanel.tsx` |
| `useChatInputLogic.ts` | `ChatPanel.tsx` |
| `useChatPanelHandlers.ts` | `ChatPanel.tsx` |
| `useInputHandlers.ts` | `ChatPanel.tsx` (via composição em `useChatPanelHandlers.ts`) |
| `useMessageReactionHandlers.ts` | `useChatPanelHandlers.ts`, `ChatPanel.tsx` |
| `useProductHandlers.ts` | `useChatPanelHandlers.ts`, `ChatPanel.tsx` |
| `__tests__/*`, `hooks/__tests__/*` | vitest (test runner) |

> **Nota:** `scrollLoaderController.ts` não tem importador externo identificado via grep além do barrel `index.ts`. O consumidor direto deve ser `ChatMessagesArea.tsx` (no mesmo módulo), que não foi coberto neste batch.

---

## 7. Implementação por Arquivo

| arquivo | status | o que falta |
|---------|--------|-------------|
| `chatInputGuards.ts` | COMPLETA | — |
| `hooks/useChatDialogs.ts` | COMPLETA | — |
| `hooks/useChatDragAndDrop.ts` | COMPLETA | — |
| `hooks/useChatFilters.ts` | COMPLETA | Exporta `FAILURE_CATEGORIES` (não `FAILURE` como documentado no índice) |
| `hooks/useChatQuickReplyControl.ts` | COMPLETA | — |
| `hooks/useChatScheduleMessage.ts` | PARCIAL | Signed URL expira em 7d; mensagens agendadas > 7d enviarão URL inválida |
| `hooks/useChatSearchState.ts` | COMPLETA | — |
| `hooks/useInitialHighlight.ts` | COMPLETA | `eslint-disable` nas deps (intencional, documentado) |
| `hooks/useSLADelivery.ts` | COMPLETA | Dep redundante `messages.length` no useEffect |
| `index.ts` | COMPLETA | Não re-exporta hooks de `hooks/` (inconsistência do barrel) |
| `loadOlderMetrics.ts` | COMPLETA | Expõe `window.__loadOlderMetrics` sem flag de build (debug em produção) |
| `loadOlderTypes.ts` | COMPLETA | — |
| `messageBubbleParts.tsx` | COMPLETA | — |
| `messageStatusLanguage.ts` | COMPLETA | — |
| `messageUtils.tsx` | COMPLETA | — |
| `scrollLoaderController.ts` | COMPLETA | — |
| `useAudioVoiceChange.ts` | COMPLETA | Nome de arquivo usa `Date.now()` sem UUID (colisão improvável mas possível) |
| `useChatInputLogic.ts` | COMPLETA | ID de anexo gerado com `Math.random()` em vez de `crypto.randomUUID()` |
| `useChatPanelHandlers.ts` | PARCIAL | `onArchive?.()` sem feedback quando prop ausente; cast de erro repetido 3× |
| `useInputHandlers.ts` | PARCIAL | `/priority` é stub; `/summary` redireciona para `'aiAssistant'` (bug documentado) |
| `useMessageReactionHandlers.ts` | COMPLETA | — |
| `useProductHandlers.ts` | PARCIAL | `handleInteractiveButtonClick` sem try-catch |
| `__tests__/ChatInputArea.guards.test.tsx` | COMPLETA | — |
| `__tests__/ChatMessagesArea.getItemSize.test.tsx` | COMPLETA | — |
| `__tests__/ChatMessagesArea.scrollToMessage.test.tsx` | COMPLETA | — |
| `__tests__/ChatSearchBar.keyboard.test.tsx` | COMPLETA | — |
| `__tests__/chatInputGuards.test.ts` | COMPLETA | — |
| `__tests__/chatpanel.simulation.test.ts` | COMPLETA | Assert ausente: insert NÃO chamado em whisper com JID externo |
| `__tests__/loadOlderMetrics.test.ts` | COMPLETA | — |
| `__tests__/messageStatusLanguage.test.ts` | COMPLETA | — |
| `__tests__/p0-regressions.test.ts` | PARCIAL | Re-implementa funções localmente — não importa do source real (falsa cobertura) |
| `__tests__/scrollLoaderController.test.ts` | COMPLETA | — |
| `__tests__/useChatFilters.identity.test.ts` | PARCIAL | `act(() => { messages = [...] })` atualiza closure local, não state do hook — possível falso positivo |
| `__tests__/useChatInputLogic.memory.test.ts` | COMPLETA | — |
| `__tests__/useChatPanelHandlers.burst.test.ts` | COMPLETA | — |
| `__tests__/useChatPanelHandlers.edit.test.ts` | PARCIAL | Mock de `useMessageReactionHandlers` incompleto (só `handleReaction`) |
| `__tests__/useChatPanelHandlers.sendContract.test.ts` | COMPLETA | — |
| `__tests__/useChatPanelHandlers.whisper.test.ts` | COMPLETA | — |
| `__tests__/useInputHandlers.slash.test.ts` | COMPLETA | — |
| `__tests__/useMessageReactionHandlers.copy.test.ts` | COMPLETA | — |
| `__tests__/useProductHandlers.interactive.test.ts` | PARCIAL | `mockInsert` nunca assertado em `handleInteractiveButtonClick` — INSERT pós-envio não coberto |
| `__tests__/useProductHandlers.location.test.ts` | COMPLETA | — |
| `__tests__/useProductHandlers.product.test.ts` | COMPLETA | — |
| `hooks/__tests__/useChatDialogs.test.ts` | COMPLETA | — |
| `hooks/__tests__/useChatDragAndDrop.test.ts` | COMPLETA | — |
| `hooks/__tests__/useChatFilters.test.ts` | COMPLETA | — |
| `hooks/__tests__/useChatQuickReplyControl.test.ts` | COMPLETA | — |
| `hooks/__tests__/useChatSearchState.test.ts` | COMPLETA | — |
| `hooks/__tests__/useInitialHighlight.test.ts` | COMPLETA | — |

---

## 8. Achados

### A1 — `p0-regressions.test.ts`: funções de produção re-implementadas localmente

`src/features/inbox/components/chat/__tests__/p0-regressions.test.ts:16–48` — `resolveContactRef`, `isValidUUID` e `fakeUuid` são **reimplementadas no corpo do teste** em vez de importadas do source real. Uma mudança no código de produção não quebraria estes testes. Falsa cobertura latente.

### A2 — `useInputHandlers.ts:236–239`: `/summary` mapeia para `'aiAssistant'` (BUG documentado inline)

`src/features/inbox/components/chat/useInputHandlers.ts:236` — `case 'summary'` define `activeTool = 'aiAssistant'`. Se `ChatToolPanels` não trata `'summary'` como alias, o painel nunca abre. Bug documentado como BUG-04 no teste correspondente, mas ainda presente no source.

### A3 — `useInputHandlers.ts:174`: `/priority` é stub permanente

`src/features/inbox/components/chat/useInputHandlers.ts:174` — `case 'priority'` apenas exibe toast "não disponível nesta versão" sem nenhuma ação. Funcionalidade prometida mas não implementada.

### A4 — `useChatPanelHandlers.ts:548–553`: `/archive` sem feedback quando `onArchive` ausente

`src/features/inbox/components/chat/useChatPanelHandlers.ts:548` — `await opts.onArchive?.()` resolve silenciosamente se a prop não for passada. Usuário dispara `/archive`, não ocorre erro, não ocorre arquivamento — experiência silent-fail.

### A5 — `hooks/useChatScheduleMessage.ts:43`: signed URL expira em 7 dias

`src/features/inbox/components/chat/hooks/useChatScheduleMessage.ts:43` — `createSignedUrl(..., 604800)` (7 dias). Mensagens agendadas para mais de 7 dias à frente terão URL de mídia expirada no momento do envio. Sem validação de prazo máximo de agendamento.

### A6 — `loadOlderMetrics.ts:61`: debug em `window.__loadOlderMetrics` em produção

`src/features/inbox/components/chat/loadOlderMetrics.ts:61` — escreve em `window.__loadOlderMetrics` sem guard de `import.meta.env.DEV`. Propriedade de debug exposta em produção.

### A7 — `useProductHandlers.ts:98`: `handleInteractiveButtonClick` sem try-catch

`src/features/inbox/components/chat/useProductHandlers.ts:98` — `onSendMessage(button.title ?? button.id)` chamado de forma síncrona sem `await`/`try-catch`. Falhas de envio são silenciosas; nenhum toast de erro é exibido.

### A8 — `useChatInputLogic.ts:126`: ID de anexo gerado com `Math.random()`

`src/features/inbox/components/chat/useChatInputLogic.ts:126` — `id: Math.random().toString(36).slice(2,11)`. Não usa `crypto.randomUUID()`; colisão de IDs possível em listas grandes, mas risco baixo na prática.

### A9 — `useAudioVoiceChange.ts:13`: nome de arquivo usa `Date.now()` sem UUID

`src/features/inbox/components/chat/useAudioVoiceChange.ts:13` — `filePath` inclui `Date.now()` como diferenciador. Uploads simultâneos (raro) podem sobrescrever arquivo no bucket `audio-messages`.

### A10 — `useSLADelivery.ts:107`: dep `messages.length` redundante no `useEffect`

`src/features/inbox/components/chat/hooks/useSLADelivery.ts:107` — array de deps inclui tanto `messages` quanto `messages.length`. `messages.length` é subconjunto de `messages`; a dep extra causa re-subscrição desnecessária do intervalo.

### A11 — `useChatPanelHandlers.ts`: type cast de erro repetido 3×

`src/features/inbox/components/chat/useChatPanelHandlers.ts:~285, ~341, ~367` — `(err as { detail?: string }).detail` duplicado 3 vezes sem helper. Padrão copy-paste frágil: mudança no shape do erro requer atualização em 3 locais.

### A12 — `hooks/__tests__/useChatDragAndDrop.test.ts:212–215`: contador de drag pode ir negativo

`src/features/inbox/components/chat/hooks/__tests__/useChatDragAndDrop.test.ts:212` — teste documenta que dragLeave após drop "não causa crash" mesmo se o contador ficar negativo. A implementação deve usar `Math.max(0, counter - 1)` — risco de regressão se a proteção for removida.

### A13 — `__tests__/useChatPanelHandlers.edit.test.ts:36`: inconsistência de path no mock

`src/features/inbox/components/chat/__tests__/useChatPanelHandlers.edit.test.ts:36` — path do mock `../../hooks/useWhisperMessagesMutation` diverge de `useChatPanelHandlers.burst.test.ts:73` que usa `@/features/inbox/hooks/...`. Dependendo da resolução do módulo, pode estar mockando módulos diferentes.

### A14 — `index.ts`: hooks de `hooks/` não re-exportados pelo barrel

`src/features/inbox/components/chat/index.ts` — os 7 hooks em `hooks/` não aparecem no barrel. Consumidores importam esses hooks diretamente pelo caminho completo, quebrando a consistência do ponto único de entrada do módulo.

---

*Runtime: NAO_VERIFICADO - nenhuma execução real foi realizada durante esta análise.*
