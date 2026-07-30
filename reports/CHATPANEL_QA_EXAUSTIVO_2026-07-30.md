# 🔬 ChatPanel — QA Exaustivo (PhD-Level)

> **Data:** 2026-07-30 | **Agentes:** 44 paralelos | **Arquivos analisados:** ~250+
> **Módulo:** `src/features/inbox/` + `src/components/team-chat/` + Edge Functions
> **Banco:** Supabase Self-Hosted (PG 15.8) — schemas zapp, evo, public

---

## 📊 Resumo Executivo

| Severidade | Quantidade | Exemplos |
|---|---|---|
| 🔴 CRÍTICO | 12 | Realtime sem filtro, mensagens nunca enviadas, schedule off-by-one-day |
| 🟠 ALTO | 22 | isEdited invertido, stickers 403, forward é no-op, typing stuck |
| 🟡 MÉDIO | 18 | Timer leaks, mentions não resolvem, TTS não limpa ao trocar conversa |
| 🟢 BAIXO | 12 | Código morto, inconsistências cosméticas, sort não persistido |
| **TOTAL** | **64** | |

---

## 🔴 BUGS CRÍTICOS (12)

### C1. Missing `instance_name` filter no Realtime de mensagens
- **Arquivo:** `useRealtimeMessages.ts:448-486`
- **Impacto:** Recebe mensagens de TODAS as instâncias WhatsApp (wpp2, artes, comercial_01-15...). Performance degradada + dados cruzados.
- **Fix:** Adicionar `filter: 'instance_name=eq.${instance}'` nos 3 handlers (INSERT/UPDATE/DELETE)

### C2. `onMarkAsRead` nunca chamado no VirtualizedRealtimeList
- **Arquivo:** `VirtualizedRealtimeList.tsx:122`
- **Impacto:** Badge de não-lida NUNCA decrementa ao clicar na conversa.
- **Fix:** Chamar `onMarkAsRead(contactId)` no handler de seleção

### C3. Sort override — VirtualizedRealtimeList ignora pipeline
- **Arquivo:** `VirtualizedRealtimeList.tsx:149-157`
- **Impacto:** Ordenar por "Não lidas" ou "Nome (A-Z)" não funciona — lista sempre ordena por mais recente.
- **Fix:** Remover o sort duplicado do VirtualizedRealtimeList

### C4. Ticket status é LOCAL-ONLY — nunca persiste no banco
- **Arquivo:** `useTicketStatus.ts` + `ticketStore.ts`
- **Impacto:** Status de ticket invisível para outros agentes. Refresh perde tudo.
- **Fix:** Integrar com RPC/tabela de tickets no Supabase

### C5. Failed messages NUNCA escritas em `zapp.failed_messages` pelo client queue
- **Arquivo:** `useMessageQueue.ts:260-325`
- **Impacto:** `useFailedMessageAlerts` é dead code. DLQ retry não funciona para falhas client-side.
- **Fix:** Após esgotar retries locais, inserir em `zapp.failed_messages` via RPC

### C6. Scheduled messages off-by-one-day para UTC negativo (Brasil)
- **Arquivo:** `ScheduleMessageDialog.tsx:44`
- **Impacto:** `new Date('2026-08-01')` = UTC midnight → setHours local = dia anterior em UTC-3.
- **Fix:** Parsear data como local: `new Date(y, m-1, d, hours, minutes)`

### C7. Business hours sem feriados
- **Arquivo:** `BusinessHoursBadge.tsx` + `is_within_business_hours` RPC
- **Impacto:** Mostra "Aberto" em feriados nacionais. SLA calculado errado.
- **Fix:** Criar tabela `business_hours_exceptions` + atualizar RPC

### C8. Forward message é um NO-OP — nunca envia ao WhatsApp
- **Arquivo:** `useMessageReactionHandlers.ts:44-49`
- **Impacto:** Usuário vê toast "Mensagem encaminhada!" mas nada acontece.
- **Fix:** Implementar chamada à Evolution API no handler

### C9. Mensagens interativas NUNCA enviadas — fachada de UI
- **Arquivo:** `useProductHandlers.ts:42-47`
- **Impacto:** Builder de botões/listas funciona visualmente, mas `handleSendInteractiveMessage` só exibe toast.
- **Fix:** Chamar `evo_send_buttons`/`evo_send_list` da Evolution API

### C10. Location share NUNCA enviada ao WhatsApp — fachada de UI
- **Arquivo:** `useProductHandlers.ts:53-60`
- **Impacto:** LocationPicker completo mas `handleSendLocation` só exibe toast.
- **Fix:** Chamar `evo_send_location` da Evolution API

### C11. Audio NÃO enviado como base64 — formato incorreto para Evolution API
- **Arquivo:** `externalAudioSender.ts:72-88`
- **Impacto:** Áudio chega corrompido ou falha silenciosamente no destinatário.
- **Fix:** Converter blob para base64 antes de enviar ao endpoint, ou usar upload + URL

### C12. Realtime de reações no schema ERRADO (`zapp` vs `public`)
- **Arquivo:** `useConversationReactionsRealtime.ts:35` + `useMessageReactions.ts:32`
- **Impacto:** Reações de outros usuários NUNCA atualizam em tempo real — no-op silencioso.
- **Fix:** Mudar `schema: 'zapp'` → `schema: 'public'` (onde a tabela física está)

---

## 🟠 BUGS ALTOS (22)

| # | Bug | Arquivo | Impacto |
|---|---|---|---|
| H1 | `isEdited` lógica invertida — toda msg aparece como editada | `messageService.ts:28` | UI enganosa |
| H2 | Hardcoded `instanceName: 'wpp2'` em read-messages | `useRealtimeInbox.ts:393` | read-messages vai pra instância errada |
| H3 | Stickers sem refresh CDN (403 após expirar) | `MessageBubbleBody.tsx:157-166` | Stickers quebram |
| H4 | Botão fullscreen vídeo invisível (group-hover sem group) | `MediaPreview.tsx:251-258` | UX quebrado |
| H5 | EmojiPicker não fecha após selecionar | `EmojiPicker.tsx:41-43` | UX irritante |
| H6 | MessageTemplates passa `{{variável}}` sem substituir | `MessageTemplates.tsx:46` | Variáveis raw no input |
| H7 | Transfer dialog fecha antes de await — falso sucesso | `TransferDialog.tsx:59-70` | Erro silencioso |
| H8 | Connection transfer type descartado silenciosamente | `TransferDialog.tsx` + `ChatDialogs.tsx` | Transfer por conexão quebrado |
| H9 | CRM auto-sync dispara a cada render (deps instáveis) | `CRMAutoSync.tsx:158` | Spam de API calls |
| H10 | Typing indicator fica ON após enviar | `ChatInputArea.tsx` + `useChatInputLogic.ts` | UX confuso |
| H11 | AI suggestions não limpam ao trocar conversa | `AISuggestions.tsx` | Dados stale |
| H12 | Sentiment alerts nunca disparam (analysisId=undefined) | `AIConversationAssistant.tsx:145` | Feature morta |
| H13 | Handoff não transfere memória/tasks da conversa | `RealtimeCollaboration.tsx` | Contexto perdido |
| H14 | Notes salvam em `public.contact_notes` (schema errado) | `InternalNotesPanel.tsx` | Viola arquitetura |
| H15 | SLA usa `updated_at` em vez de `created_at` | `useSLADelivery.ts:51` | SLA impreciso |
| H16 | Object URLs nunca revocados no sucesso de áudio | `externalAudioSender.ts:49` | Memory leak |
| H17 | Upload progress stuck at 0% (interval never updated) | `useFileUploadLogic.ts:62-63` | UX quebrado |
| H18 | `classifyError` ignora HTTP 403 — media não recarrega | `useMediaUrl.ts:86` | Mídia expirada permanece quebrada |
| H19 | ChatPopup perde mensagens com USE_EXTERNAL_DB=true | `ChatPopup.tsx:70-81` | Mensagem nunca chega ao WhatsApp |
| H20 | WhatsApp Presence sempre "Offline" (resultado descartado) | `whatsappStatusRepository.ts` | Presença não funciona |
| H21 | StoryViewer hardcoda `'wpp2'` para carregar mídia | `StoryViewer.tsx` | Stories de outra instância quebram |
| H22 | WebRTC MediaStream leak — tracks nunca parados no hangup | `useSipConnection.ts` | Mic fica aberto |

---

## 🟡 BUGS MÉDIOS (18)

| # | Bug | Arquivo |
|---|---|---|
| M1 | Progress interval leak em retry de áudio | `useAudioRecorderUI.ts:187-242` |
| M2 | TTS continua tocando ao trocar conversa | `useChatPanel.ts:229-233` |
| M3 | Blob URL leak na mídia após send com sucesso | `externalAudioSender.ts:49` |
| M4 | handleKeyDown recebe `slashCommandsOpen=undefined` (dead code) | `useInputHandlers.ts:45-68` |
| M5 | Ctrl+K e Ctrl+F disparam dois handlers | `useInputHandlers.ts` + `useInboxShortcuts.ts` |
| M6 | Dialog state não reseta ao trocar conversa | `useChatDialogs.ts` + `ChatPanel.tsx` |
| M7 | MentionAutocomplete mostra perfis inativos | `MentionAutocomplete.tsx` |
| M8 | Notes sem sync realtime | `InternalNotesPanel.tsx` |
| M9 | Typing indicator nos viewers sempre false | `ViewersIndicator.tsx` |
| M10 | Debounce timer não limpo no unmount (batcher) | `useMessageUpdateBatcher.ts:142` |
| M11 | Gallery MediaCard sem refresh de mídia expirada | `MediaCard.tsx:58` |
| M12 | File input ignora todos exceto 1º arquivo | `useFileUploadLogic.ts:366` |
| M13 | `resetInboxFilters` não reseta scope/showAll | `useInboxFilters.ts:515-549` |
| M14 | Status filter lógica conflita com labels | `inboxFilterPipeline.ts:226-236` |
| M15 | Cursor pagination perde msgs com mesmo timestamp | `useExternalMessages (evolutionFetchers.ts:136)` |
| M16 | scrollToMessage via reply quote completamente broken | `ChatMessagesArea.tsx:112-115` |
| M17 | `played` → `read` mapping perde distinção "Reproduzida" | `evolutionAdapter.ts:77` |
| M18 | Whispers visíveis para todos agentes (sem filtro target) | `WhisperMode.tsx` |

---

## 🟢 BUGS BAIXOS (12)

| # | Bug | Arquivo |
|---|---|---|
| L1 | ChatMessageBubble.tsx = código morto (353 linhas) | `ChatMessageBubble.tsx` |
| L2 | VirtualizedMessageList/VirtualMessageBubble/VirtualizedConversationList unused | `virtualized/` |
| L3 | useMessagesCursor = hook morto (331 linhas) | `useMessagesCursor.ts` |
| L4 | loadOlderMetrics exported mas nunca chamado | `loadOlderMetrics.ts` |
| L5 | Sort preference não persistido | `ConversationListSidebar.tsx:165-172` |
| L6 | AnalysisBadges = dead code (RPC nunca deployada) | `AnalysisBadges.tsx` |
| L7 | `{{atendente}}` hardcoded como "Atendente" | `template-utils.ts:46` |
| L8 | TeamPerformancePanel 100% dados mockados | `TeamPerformancePanel.tsx` |
| L9 | GlobalSearch quick actions usam hash (BrowserRouter) | `GlobalSearch.tsx:88-114` |
| L10 | ConversationContextMenu bg-foreground = menu invisível | `ConversationContextMenu.tsx:92` |
| L11 | Schedule reply items todos idênticos | `MessageContextMenu.tsx:154-177` |
| L12 | ArrowUp com input vazio faz preventDefault sem ação | `ChatInputArea.tsx:579-592` |

---

## ✅ Validações Positivas (DB)

| Check | Resultado |
|---|---|
| 50 tabelas zapp na publication `supabase_realtime` | ✅ |
| `evo.evolution_messages` (partitioned root, pubviaroot=true) | ✅ |
| Todas as 13 RPCs no schema `zapp` | ✅ |
| `check_download_permission` ausente (fail-open stub intencional) | ✅ |
| Nenhuma view na publication | ✅ |
| Audio bucket `audio-messages` público + MIME validado | ✅ |
| Stickers/custom-emojis/audio-memes buckets corretos | ✅ |
| XSS mitigado (DOMPurify + escapeHtml + React children) | ✅ |
| Slash commands todos mapeados corretamente | ✅ |
| Quick replies usando tabela correta | ✅ |

---

## 📋 Priorização de Correções

### IMEDIATO (Hoje) — P1
1. C1 — Filtro instance_name no Realtime (~5 min)
2. C2 — Chamar onMarkAsRead (~2 min)
3. C3 — Remover sort duplicado (~2 min)
4. H1 — Fix isEdited lógica (~2 min)
5. H5 — EmojiPicker fechar após select (~1 min)
6. H10 — Typing stop após send (~5 min)
7. C6 — Fix timezone do schedule (~5 min)
8. C12 — Fix schema das reações para 'public' (~2 min)
9. H4 — Adicionar class `group` no pai do vídeo (~1 min)
10. H6 — MessageTemplates substituir variáveis (~10 min)

### CURTO PRAZO (Esta semana) — P2
11. C5 — Integrar client queue com zapp.failed_messages
12. C8 — Implementar forward real via Evolution API
13. C11 — Fix base64 encoding no audio sender
14. H2 — Derivar instanceName dinamicamente
15. H3 — Sticker refresh via useMediaRefresh
16. H9 — Estabilizar deps do CRM auto-sync
17. H17 — Fix upload progress interval
18. H18 — classifyError reconhecer 403
19. M16 — Wire registerRef para scrollToMessage
20. M15 — Cursor pagination com tie-breaker

### MÉDIO PRAZO (Sprint) — P3
21. C4 — Migrar ticketStore para Supabase
22. C7 — Criar business_hours_exceptions
23. C9/C10 — Implementar interactive + location send real
24. H13 — Handoff transferir memória/tasks
25. H14 — Migrar notes para zapp schema
26. H22 — WebRTC cleanup no hangup
27. M18 — Filtrar whispers por target_agent_id

### BACKLOG — P4
28-64. Bugs de severidade Baixa + código morto cleanup

---

## 🔍 Cobertura de Testes

- **35 arquivos de teste existentes** — qualidade 91% excelente
- **0 testes quebrados**
- **GAP CRÍTICO:** `messageSender.ts` (351 linhas), `externalMessageSender.ts` (302 linhas), `useChatPanelHandlers.ts` (414 linhas) = **1,067 linhas do código mais crítico SEM NENHUM TESTE**
- **Top 3 cenários não testados:** (1) Send pipeline completo, (2) Reconciliação optimistic→canonical, (3) FATOR X external DB send

---

*Relatório gerado por 44 agentes especializados em paralelo.*
*Tempo total de investigação: ~7 minutos (equivalente a ~5h de trabalho serial).*
