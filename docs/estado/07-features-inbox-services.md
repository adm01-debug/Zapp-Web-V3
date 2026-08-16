# Estado: `src/features/inbox/` — Sub-módulos Services, Hooks Especializados e Utils (Batch 5B)

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 54/54

---

## 1. Visão Geral do Módulo

Sub-módulos especializados do inbox: camada de data-access para mensagens e status WhatsApp, serviços de domínio (messageService, touchLastSeen, whatsappStatusService), hooks de voz/SIP/reações/team-chat, suíte de testes dos hooks raiz (19 arquivos), utilitários de identidade de contato e simulação de latência.

**Contagem:** 54 arquivos — 3 data-access, 4 services (incluindo 1 teste), 7 voice (incluindo 1 teste), 2 sip, 6 reactions, 6 team-chat, 19 hooks/__tests__, 4 utils (incluindo 2 testes), 1 tipos, 1 barrel raiz, 1 barrel services, 1 barrel voice, 1 barrel sip, 1 barrel reactions, 1 barrel team-chat.

| Categoria | Arquivo | Linhas |
|-----------|---------|--------|
| **Barrel raiz** | `index.ts` | 6 |
| **Tipo** | `types/aiChatMessage.ts` | 13 |
| **Data-access barrel** | `data-access/index.ts` | 4 |
| **Data-access** | `data-access/messageRepository.ts` | 145 |
| **Data-access** | `data-access/whatsappStatusRepository.ts` | 97 |
| **Services barrel** | `services/index.ts` | 3 |
| **Serviço** | `services/messageService.ts` | 120 |
| **Serviço** | `services/touchLastSeen.ts` | 42 |
| **Serviço** | `services/whatsappStatusService.ts` | 164 |
| **Teste** | `services/__tests__/touchLastSeen.simulacao.test.ts` | 179 |
| **Utils** | `utils/contactRef.ts` | 111 |
| **Utils** | `utils/simulateChatLatency.ts` | 48 |
| **Teste** | `utils/__tests__/contactRef.test.ts` | 303 |
| **Teste** | `utils/__tests__/simulateChatLatency.test.ts` | 175 |
| **Voice barrel** | `hooks/voice/index.ts` | 7 |
| **Voice tipos** | `hooks/voice/types.ts` | 41 |
| **Voice util** | `hooks/voice/logVoiceCommand.ts` | 58 |
| **Voice util** | `hooks/voice/playTtsAudio.ts` | 273 |
| **Voice util** | `hooks/voice/processTranscript.ts` | 44 |
| **Voice util** | `hooks/voice/retry.ts` | 58 |
| **Teste** | `hooks/voice/__tests__/retry.test.ts` | 229 |
| **SIP barrel** | `hooks/sip/index.ts` | 2 |
| **Hook SIP** | `hooks/sip/useSipConnection.ts` | 165 |
| **Reactions barrel** | `hooks/reactions/index.ts` | 5 |
| **Reactions tipos** | `hooks/reactions/types.ts` | 21 |
| **Hook reactions** | `hooks/reactions/useBatchReactions.ts` | 134 |
| **Hook reactions** | `hooks/reactions/useConversationReactionsRealtime.ts` | 73 |
| **Hook reactions** | `hooks/reactions/usePreloadConversationReactions.ts` | 104 |
| **Hook reactions** | `hooks/reactions/useReactionMutations.ts` | 226 |
| **Team-chat barrel** | `hooks/team-chat/index.ts` | 5 |
| **Team-chat tipos** | `hooks/team-chat/teamChatTypes.ts` | 55 |
| **Hook team-chat** | `hooks/team-chat/useTeamChatMutations.ts` | 373 |
| **Hook team-chat** | `hooks/team-chat/useTeamConversations.ts` | 162 |
| **Hook team-chat** | `hooks/team-chat/useTeamMessageReactions.ts` | 162 |
| **Hook team-chat** | `hooks/team-chat/useTeamMessages.ts` | 124 |
| **Teste** | `hooks/__tests__/archivedScenarios.simulacao.test.ts` | 580 |
| **Teste** | `hooks/__tests__/classifyFailure.test.ts` | 256 |
| **Teste** | `hooks/__tests__/inboxE2E.test.ts` | 231 |
| **Teste** | `hooks/__tests__/inboxFilterPipeline.test.ts` | 408 |
| **Teste** | `hooks/__tests__/inboxLogic.test.ts` | 181 |
| **Teste** | `hooks/__tests__/mediaRefreshCache.test.ts` | 113 |
| **Teste** | `hooks/__tests__/messageSendHistory.schemas.test.ts` | 125 |
| **Teste** | `hooks/__tests__/realtimeChannelLifecycle.test.ts` | 368 |
| **Teste** | `hooks/__tests__/useArchiveConversationActions.test.ts` | 145 |
| **Teste** | `hooks/__tests__/useFailureReason.test.ts` | 103 |
| **Teste** | `hooks/__tests__/useFallbackContact.test.ts` | 160 |
| **Teste** | `hooks/__tests__/useInboxBulkActions.test.ts` | 333 |
| **Teste** | `hooks/__tests__/useInboxHeartbeat.simulacao.test.ts` | 229 |
| **Teste** | `hooks/__tests__/useInboxStatusPref.test.ts` | 129 |
| **Teste** | `hooks/__tests__/useMediaUrl.test.ts` | 535 |
| **Teste** | `hooks/__tests__/useMessageQueueE2E.spec.tsx` | 121 |
| **Teste** | `hooks/__tests__/useMessageReactions.test.tsx` | 175 |
| **Teste** | `hooks/__tests__/useRetryFailedMessage.test.tsx` | 99 |
| **Teste** | `hooks/__tests__/useSendThrottle.test.ts` | 198 |

---

## 2. Fluxos Funcionais do Módulo

### 2.1 Leitura de Mensagens — Data-Access → Service

```
data-access/messageRepository.ts
  → fetchMessagesByContact(contactJid, limit, before)
       → dbFrom('evolution_messages').select(...)
       → normalizeMessage (rowNormalizers)
  → fetchWhispersByContact(contactId)
       → supabase.from('messages').select(...) [schema zapp]
  → listByContactJid(jid, limit)
       → dbFrom('evolution_messages') + filtro remoteJid
  → subscribeToMessages(jid, callback)
       → dbChannel('evolution_messages')   ← raiz particionada em evo
  → unsubscribe(channel) → dbRemoveChannel
  ↓
services/messageService.ts
  → getAllMessagesForContact(contactJid, contactId)
       → loop paginado 1000/page via fetchMessagesByContact
       → busca sussuros via fetchWhispersByContact
       → sort por created_at + dedup por id
       → mapMessage(): resolve aliases de campos (message_content vs content, etc.)
  ← Chamado por: hooks/useMessages.ts
```

### 2.2 Status WhatsApp — Data-Access → Service

```
data-access/whatsappStatusRepository.ts
  → getContact(contactId)
       → dbFrom('contacts').select(...).eq('id', contactId).single()
  → getConnectedWhatsAppConnection()
       → supabase.from('whatsapp_connections').eq('status', 'connected').limit(1)
  → getWhatsAppConnection(instanceId)
       → supabase.from('instance_registry').eq('id', instanceId)
  → findStatusMessages(instanceId, jid)
       → Edge Function 'evolution-api/find-status-messages' (fetch raw)
  → sendChatPresence(instanceId, jid, presence)
       → Edge Function 'evolution-api/send-chat-presence' (fetch raw)
  ↓
services/whatsappStatusService.ts
  → getConnectionInfo()
       → whatsappStatusRepository.getConnectedWhatsAppConnection()
  → fetchStatusData(jid, instanceId)
       → whatsappStatusRepository.findStatusMessages(...)
  → buildPhoneNeedles(phone): string[]
       → gera variantes com/sem +55, com/sem dígito 9
       → ex: '11999...' → ['5511999...', '11999...', '55119...']
  ← Chamado por: hooks/useWhatsAppStatus.ts
```

### 2.3 Presença / Last Seen — Debounce Global

```
services/touchLastSeen.ts
  → DEBOUNCE_MS = 120_000 (2 minutos)
  → estado de módulo: pendingTimer, isInflight
  → chamada: touchLastSeen(supabase, userId)
       → se timer pendente → limpa e recria (janela deslizante)
       → se inflight → ignora (sem timer extra)
       → após 120s: supabase.from('profiles')
                         .update({ last_seen: new Date().toISOString() })
                         .eq('user_id', user.id)   ← NÃO .eq('id', ...)
  ← Chamado por: hooks/useRealtimeMessages.ts, hooks/realtime/useConversationActions.ts
```

### 2.4 Identidade de Contato — ContactRef

```
utils/contactRef.ts
  ContactRef = { kind: 'uuid', uuid, raw } | { kind: 'jid', remoteJid, phone, isGroup, raw }

  resolveContactRef(input):
    1. trim + vazio → null
    2. /^[0-9a-f]{8}-...-[0-9a-f]{12}$/i → kind: 'uuid', uuid lowercase
    3. contém '@' (sufixos: s.whatsapp.net, g.us, lid, broadcast) → kind: 'jid'
       → @g.us → isGroup=true, phone=null
       → @lid, @broadcast → isGroup=false, phone=null (sem extração de telefone)
       → @s.whatsapp.net → phone = parte numérica do prefixo
    4. apenas dígitos 8-15 → kind: 'jid', remoteJid = input + '@s.whatsapp.net'
    5. fallback seguro → kind: 'jid', phone=null, isGroup=false

  isUuidRef / isJidRef → type guards
  contactRefToString(ref | null) → raw do ref ou '(null)'
```

### 2.5 Agente de Voz — TTS e Transcrição

```
hooks/voice/playTtsAudio.ts
  → TtsPlayback = { promise: Promise<void>, stop: () => void }
  → splitTextIntoTtsChunks(text): chunks ≤ TTS_CHUNK_MAX_LENGTH=220 chars
       → split por sentenças (.!?…) → por vírgulas/ponto-e-vírgula → por palavras
  → fetchChunkAudio(chunkText):
       → fetch Edge Function 'elevenlabs-tts-stream'
       → timeout: TTS_REQUEST_TIMEOUT_MS=60_000ms via AbortController
       → 401/403 → throw 'TTS_UNAUTHORIZED'
       → sucesso → createObjectURL(blob)
  → loop principal: pré-busca [i+1] enquanto toca [i]
  → erro → fallback window.speechSynthesis (lang: pt-BR)
  → NotAllowedError → onAutoplayBlocked(); NÃO usa speechSynthesis
  → stop() → AbortController.abort() + speechSynthesis.cancel() + cleanup

hooks/voice/processTranscript.ts
  → processVoiceTranscript(transcript, url, key): Promise<VoiceAgentAction>
  → POST Edge Function 'voice-agent', timeout 15s
  → resposta sem action/response → { action: 'answer', response: 'Desculpe...' }

hooks/voice/retry.ts
  → isRetryableError(err): boolean
       → case-insensitive match: network|timeout|aborted|fetch|err|500|503|429
  → withRetry(fn, maxRetries=3, baseDelay=1000)
       → delay = baseDelay * 2^attempt (exponential, sem cap)
  → friendlyErrorMessage(err): string (pt-BR)
       → microphone|permission → "Microfone..."
       → network|timeout → "Problema de rede..."
       → 429 → "Muitas requisições..."
       → 402 → "Limite de uso..."
       → 401 → "Não autorizado..."
       → fallback → "Erro ao processar..."

hooks/voice/logVoiceCommand.ts
  → fire-and-forget: fetch raw POST voice_command_logs
  → headers: Content-Type json, Content-Profile: zapp, Authorization: Bearer token
  → AbortController timeout: 15_000ms
  → erros ignorados (fire-and-forget)
```

### 2.6 Conexão SIP

```
hooks/sip/useSipConnection.ts
  → SipStatus: 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting'
  → useSipConnection({ sipConfig, enabled }):
       → retorna { sipStatus, uaRef, connect, disconnect }
  → connect():
       → cria SIP.UserAgent, registra eventos: connected/disconnected/registered/unregistered
       → ua.start()
  → reconexão exponencial: delay = Math.min(1000 * 2^attempt, 30_000ms)
  → MAX_RECONNECT_ATTEMPTS = 5 → passa para 'error' permanente
  → useMountedRef guard: sem setState após unmount
  → disconnect(): ua.stop(), limpa reconnect timer
```

### 2.7 Reações — N+1 Prevention via Batch

```
hooks/reactions/useBatchReactions.ts
  → fetchReactionsBatch(messageIds):
       1. tenta rpc('rpc_get_reactions_batch', { p_message_ids: messageIds })
       2. fallback: supabase.from('message_reactions').in('message_id', ids)
          em chunks de CHUNK_SIZE=100
  → useMessagesReactions(messageIds):
       → useMemo para stable key (sort + join)
       → useQuery com staleTime/gcTime configurados

hooks/reactions/usePreloadConversationReactions.ts
  → ReactionsBatchProvider context:
       → uma única query batch para TODOS os messageIds visíveis
       → primes cache: queryClient.setQueryData por mensagem
            → guard: só aplica se dataUpdatedAt < batchStartedAt (não sobrescreve dado mais recente)
       → expõe isBatchPending para bloquear N+1 individuais durante o batch
  → sem provider → fallback para GET individual (regressão testada)

hooks/reactions/useConversationReactionsRealtime.ts
  → UM canal por conversa (topic: 'reactions-{convId}')
  → mantém visibleMessageIds em ref (não causa re-render)
  → evento CDC → invalida query do messageId afetado via queryClient.invalidateQueries
  → NÃO exportado por reactions/index.ts (intencional — uso interno)

hooks/reactions/useReactionMutations.ts
  → addMutation: upsert em message_reactions + sendReaction via Evolution API
  → removeMutation: delete de message_reactions + deleteReaction via Evolution API
  → updates otimistas com rollback em onError
  → trackReactionEvent: chama addMutation ou removeMutation conforme toggle
```

### 2.8 Team Chat

```
hooks/team-chat/useTeamConversations.ts
  → query de conversas com membros e último-mensagem
  → batch unread count: 1 query para TODAS as convs (janela 30 dias)
  → Realtime: schema='zapp', tabelas team_messages/team_conversations/team_conversation_members
  → refetchInterval: 30_000ms, staleTime: 10_000ms

hooks/team-chat/useTeamMessages.ts
  → useInfiniteQuery com cursor composto 'created_at|id'
  → fetchNextPage busca anteriores (scroll to top)
  → Realtime INSERT → setQueryData otimista na página mais recente
  → searchQuery → sanitizePostgrestFilter antes de .ilike()

hooks/team-chat/useTeamChatMutations.ts
  → 7 mutations: updateStatus, send, delete, edit, createConversation, toggleMute, transfer
  → usa AMBOS safeClient e raw supabase (misto — ver A17)
  → send: supabase.from('team_messages').insert(...)
  → delete: supabase.from('team_messages').update({ deleted_at: now })  ← soft delete
  → createConversation: safeClient + insert em team_conversations + team_conversation_members

hooks/team-chat/useTeamMessageReactions.ts
  → fetch reações por messageId via supabase.from('team_message_reactions')
  → Realtime INSERT/UPDATE/DELETE no canal da conversa
  → toggleMutation: upsert ou delete conforme reação existente
  → aggregate(messageId): retorna AggregatedReaction[] { emoji, count, reacted }
  → NÃO exportado por team-chat/index.ts (intencional)
```

---

## 3. Tabelas e RPCs

### 3.1 Tabelas via `.from()`

| Tabela | Schema | Operação | Arquivo |
|--------|--------|----------|---------|
| `evolution_messages` | `evo` (via dbFrom/dbChannel) | SELECT, Realtime | `data-access/messageRepository.ts` |
| `messages` | `zapp` | SELECT (whispers) | `data-access/messageRepository.ts` |
| `contacts` | `zapp` | SELECT | `data-access/whatsappStatusRepository.ts` |
| `whatsapp_connections` | `zapp` | SELECT | `data-access/whatsappStatusRepository.ts` |
| `instance_registry` | `zapp` | SELECT | `data-access/whatsappStatusRepository.ts` |
| `profiles` | `zapp` | UPDATE (`last_seen` via `user_id`) | `services/touchLastSeen.ts` |
| `message_reactions` | `zapp` | SELECT IN, UPSERT, DELETE | `hooks/reactions/useBatchReactions.ts`, `useReactionMutations.ts` |
| `voice_command_logs` | `zapp` | INSERT (fire-and-forget raw fetch) | `hooks/voice/logVoiceCommand.ts` |
| `team_messages` | `zapp` | SELECT infinite, INSERT, UPDATE (soft-delete), Realtime | `hooks/team-chat/useTeamMessages.ts`, `useTeamChatMutations.ts` |
| `team_conversations` | `zapp` | SELECT, INSERT, Realtime | `hooks/team-chat/useTeamConversations.ts`, `useTeamChatMutations.ts` |
| `team_conversation_members` | `zapp` | SELECT, INSERT, Realtime | `hooks/team-chat/useTeamConversations.ts`, `useTeamChatMutations.ts` |
| `team_message_reactions` | `zapp` | SELECT, UPSERT, DELETE, Realtime | `hooks/team-chat/useTeamMessageReactions.ts` |
| `evolution_contacts` | `zapp`/`evo` | SELECT (fallback em useFallbackContact) | `hooks/__tests__/useFallbackContact.test.ts` (comportamento testado) |

### 3.2 RPCs via `.rpc()`

| RPC | Via | Chamador |
|-----|-----|---------|
| `rpc_get_reactions_batch` | `supabase.rpc` | `hooks/reactions/useBatchReactions.ts` |
| `rpc_dlq_retry_now` | `supabase.rpc` | `hooks/useRetryFailedMessage` (testado em useRetryFailedMessage.test.tsx) |
| `rpc_get_contact` | `supabase.rpc` | `hooks/useFallbackContact` (testado em useFallbackContact.test.tsx) |

### 3.3 Outras APIs

| API Externa | Chamador | Método |
|-------------|----------|--------|
| Edge Function `elevenlabs-tts-stream` | `hooks/voice/playTtsAudio.ts` | POST, chunks ≤220 chars, timeout 60s |
| Edge Function `voice-agent` | `hooks/voice/processTranscript.ts` | POST, timeout 15s |
| Edge Function `evolution-api/find-status-messages` | `data-access/whatsappStatusRepository.ts` | fetch raw |
| Edge Function `evolution-api/send-chat-presence` | `data-access/whatsappStatusRepository.ts` | fetch raw |
| Edge Function `evolution-api/get-media-base64` | `hooks/useMediaUrl` (testado em useMediaUrl.test.ts) | supabase.functions.invoke (SEM AbortSignal) |
| Evolution API (reactions mirror) | `hooks/reactions/useReactionMutations.ts` | sendReaction / deleteReaction via Evolution API |
| SIP.js UserAgent | `hooks/sip/useSipConnection.ts` | WebRTC/SIP stack |
| `window.speechSynthesis` | `hooks/voice/playTtsAudio.ts` | Browser Web Speech API (fallback TTS) |

---

## 4. Exports Públicos

### 4.1 Barrel Raiz (`index.ts`)

Re-exporta:
- `components` (sub-barrel)
- `hooks` (sub-barrel)
- `services` (sub-barrel)
- `data-access` (sub-barrel)
- `Template` type

### 4.2 Data-Access (`data-access/index.ts`)

- `messageRepository` — `fetchMessagesByContact`, `fetchWhispersByContact`, `listByContactJid`, `subscribeToMessages`, `unsubscribe`
- `whatsappStatusRepository` — `getContact`, `getConnectedWhatsAppConnection`, `getWhatsAppConnection`, `findStatusMessages`, `sendChatPresence`

### 4.3 Services (`services/index.ts`)

- `messageService` — `getAllMessagesForContact`, `mapMessage`
- `touchLastSeen` — `touchLastSeen(supabase, userId)`
- `whatsappStatusService` — `getConnectionInfo`, `fetchStatusData`, `buildPhoneNeedles`

### 4.4 Voice (`hooks/voice/index.ts`)

- `logVoiceCommand`
- `playTtsAudio`
- `processVoiceTranscript`
- retry utilities: `isRetryableError`, `withRetry`, `friendlyErrorMessage`
- tipos: `VoiceAgentAction`, `VoiceAgentPhase`, `UseVoiceAgentOptions`, `UseVoiceAgentReturn`, `TtsPlayback`, `PlayTtsOptions`

> **Nota:** `useConversationReactionsRealtime` NÃO está exportado de `reactions/index.ts` — intencional (uso interno da feature).
> **Nota:** `useTeamMessageReactions` NÃO está exportado de `team-chat/index.ts` — intencional.

### 4.5 Tipos Relevantes

| Tipo | Origem |
|------|--------|
| `ChatMessage` | `types/aiChatMessage.ts` |
| `ContactRef` | `utils/contactRef.ts` |
| `VoiceAgentAction` | `hooks/voice/types.ts` |
| `VoiceAgentPhase` | `hooks/voice/types.ts` |
| `UseVoiceAgentOptions`, `UseVoiceAgentReturn` | `hooks/voice/types.ts` |
| `TtsPlayback`, `PlayTtsOptions` | `hooks/voice/playTtsAudio.ts` |
| `SipStatus` | `hooks/sip/useSipConnection.ts` |
| `MessageReaction` | `hooks/reactions/types.ts` |
| `UseMessageReactionsOptions` | `hooks/reactions/types.ts` |
| `TeamConversation`, `TeamMember`, `TeamMessage` | `hooks/team-chat/teamChatTypes.ts` |
| `AggregatedReaction` | `hooks/team-chat/useTeamMessageReactions.ts` |

### 4.6 Funções Utilitárias

| Função | Origem | Testada |
|--------|--------|---------|
| `resolveContactRef(input)` | `utils/contactRef.ts` | Sim |
| `isUuidRef(ref)` | `utils/contactRef.ts` | Sim |
| `isJidRef(ref)` | `utils/contactRef.ts` | Sim |
| `contactRefToString(ref)` | `utils/contactRef.ts` | Sim |
| `simulateLatency()` | `utils/simulateChatLatency.ts` | Sim |
| `shouldSimulateFailure()` | `utils/simulateChatLatency.ts` | Sim |
| `getSimulationConfig()` | `utils/simulateChatLatency.ts` | Sim |
| `setSimulationConfig(latency, rate)` | `utils/simulateChatLatency.ts` | Sim |
| `clearSimulationConfig()` | `utils/simulateChatLatency.ts` | Sim |
| `isRetryableError(err)` | `hooks/voice/retry.ts` | Sim |
| `withRetry(fn, maxRetries, baseDelay)` | `hooks/voice/retry.ts` | Sim |
| `friendlyErrorMessage(err)` | `hooks/voice/retry.ts` | Sim |
| `mapMessage(raw)` | `services/messageService.ts` | Não (integrado em getAllMessagesForContact) |
| `buildPhoneNeedles(phone)` | `services/whatsappStatusService.ts` | Não |
| `splitTextIntoTtsChunks(text)` | `hooks/voice/playTtsAudio.ts` | Não (função interna) |

---

## 5. Chama (Saída) — Dependências Externas

| Recurso | Origem |
|---------|--------|
| `@/integrations/supabase/client` (`supabase`) | `data-access/whatsappStatusRepository.ts`, `services/touchLastSeen.ts`, `hooks/reactions/`, `hooks/team-chat/` |
| `@/integrations/datasource/db` (`dbFrom`, `dbChannel`, `dbList`, `dbRemoveChannel`) | `data-access/messageRepository.ts`, `data-access/whatsappStatusRepository.ts` |
| `@/integrations/supabase/rowNormalizers` (`normalizeMessage`) | `data-access/messageRepository.ts` |
| `@/services/api/queryKeys` (`queryKeys`) | `hooks/reactions/useBatchReactions.ts`, `hooks/reactions/usePreloadConversationReactions.ts`, `hooks/team-chat/useTeamMessages.ts` |
| `@/lib/sanitize` (`sanitizePostgrestFilter`) | `hooks/team-chat/useTeamMessages.ts` |
| `@/lib/logger` (`getLogger`) | `hooks/voice/logVoiceCommand.ts`, `hooks/voice/playTtsAudio.ts` |
| `@/integrations/supabase/schema` | tipos canônicos (importação de tipos) |
| `sip.js` (UserAgent) | `hooks/sip/useSipConnection.ts` |
| `@tanstack/react-query` (`useQuery`, `useInfiniteQuery`, `useMutation`, `useQueryClient`) | `hooks/reactions/`, `hooks/team-chat/` |
| `sonner` (`toast`) | `hooks/__tests__/useRetryFailedMessage.test.tsx` (comportamento testado) |
| Browser: `window.speechSynthesis`, `Audio`, `URL.createObjectURL` | `hooks/voice/playTtsAudio.ts` |

---

## 6. Chamado Por (Entrada) — Quem Importa Deste Módulo

Resultado do grep `from.*features/inbox/(services|data-access|hooks/voice|hooks/sip|hooks/reactions|hooks/team-chat|utils/contactRef)` e análise de importações:

| Arquivo importador | O que importa |
|--------------------|---------------|
| `src/features/inbox/hooks/useMessages.ts` | `messageService` (getAllMessagesForContact) |
| `src/features/inbox/hooks/useWhatsAppStatus.ts` | `whatsappStatusService` |
| `src/features/inbox/hooks/useRealtimeMessages.ts` | `touchLastSeen` |
| `src/features/inbox/hooks/realtime/useConversationActions.ts` | `touchLastSeen` |
| `src/features/inbox/services/messageService.ts` | `messageRepository` (data-access) |
| `src/features/inbox/services/whatsappStatusService.ts` | `whatsappStatusRepository` (data-access) |
| `src/features/inbox/hooks/useSipClient.ts` | `useSipConnection` |
| `src/features/inbox/components/summary/useSummaryTts.ts` | `playTtsAudio` |
| `src/features/inbox/hooks/useVoiceActionHandler.ts` | `processVoiceTranscript`, `VoiceAgentAction` |
| `src/features/inbox/hooks/useVoiceAgent.ts` | voice hooks (barrel) |
| `src/features/inbox/components/voice/VoiceSearchOverlayConnected.tsx` | voice hooks |
| `src/features/inbox/components/ai-tools/useAnalysisTts.ts` | `playTtsAudio` |
| `src/features/inbox/hooks/useMessageReactions.ts` | `hooks/reactions/` |
| `src/features/inbox/components/MessageReactions.tsx` | `hooks/reactions/`, `hooks/team-chat/useTeamMessageReactions` |
| `src/features/inbox/components/chat/ChatMessagesArea.tsx` | `hooks/reactions/` |
| `src/hooks/useMessageReactions.ts` | `hooks/reactions/` (re-exportação) |
| `src/features/inbox/hooks/useTeamChat.ts` | `hooks/team-chat/` |
| `src/features/inbox/components/team-chat/TeamChatPanel.tsx` | `hooks/team-chat/` |
| `src/features/inbox/components/team-chat/TeamChatView.tsx` | `hooks/team-chat/` |
| `src/features/inbox/components/team-chat/TeamChatMessageRow.tsx` | `hooks/team-chat/useTeamMessageReactions` |
| `src/features/inbox/components/team-chat/TeamPerformancePanel.tsx` | `hooks/team-chat/` |
| `src/features/inbox/components/team-chat/useTeamChatPanel.ts` | `hooks/team-chat/` |
| `src/features/inbox/hooks/useEmailSearch.ts` | `hooks/team-chat/useTeamConversations` |
| `src/features/inbox/components/admin/DepartmentManagementDialog.tsx` | `hooks/team-chat/` |
| `src/features/inbox/components/ChatPanel.tsx` | `utils/contactRef` |
| `src/features/inbox/components/chat/useChatPanelHandlers.ts` | `utils/contactRef` |
| `src/features/inbox/components/useGlobalSearchData.ts` | `utils/contactRef` |
| `src/features/inbox/hooks/useChatMediaSending.ts` | `utils/contactRef` |
| `src/features/inbox/hooks/useAuxiliaryMessageLog.ts` | `utils/contactRef` |
| `src/features/inbox/hooks/useRealtimeInbox.ts` | `utils/contactRef` |
| `src/features/inbox/hooks/useFallbackContact.ts` | `utils/contactRef` |

---

## 7. Implementação por Arquivo

| Arquivo | Status | O que falta / Nota |
|---------|--------|--------------------|
| `index.ts` | COMPLETA | — |
| `types/aiChatMessage.ts` | COMPLETA | — |
| `data-access/index.ts` | COMPLETA | — |
| `data-access/messageRepository.ts` | COMPLETA | — |
| `data-access/whatsappStatusRepository.ts` | COMPLETA | mix de dbFrom e supabase direto (A18) |
| `services/index.ts` | COMPLETA | — |
| `services/messageService.ts` | COMPLETA | — |
| `services/touchLastSeen.ts` | COMPLETA | módulo com estado global (pendingTimer, isInflight) |
| `services/whatsappStatusService.ts` | COMPLETA | — |
| `services/__tests__/touchLastSeen.simulacao.test.ts` | COMPLETA | usa vi.resetModules() + dynamic import para resetar estado global |
| `utils/contactRef.ts` | COMPLETA | — |
| `utils/simulateChatLatency.ts` | COMPLETA | DEBUG-ONLY (localStorage keys debug_chat_latency, debug_chat_failure_rate) |
| `utils/__tests__/contactRef.test.ts` | COMPLETA | — |
| `utils/__tests__/simulateChatLatency.test.ts` | COMPLETA | — |
| `hooks/voice/index.ts` | COMPLETA | — |
| `hooks/voice/types.ts` | COMPLETA | — |
| `hooks/voice/logVoiceCommand.ts` | COMPLETA | fire-and-forget; Content-Profile: zapp (A14) |
| `hooks/voice/playTtsAudio.ts` | COMPLETA | pré-fetch chunk N+1; fallback speechSynthesis (A8) |
| `hooks/voice/processTranscript.ts` | COMPLETA | — |
| `hooks/voice/retry.ts` | COMPLETA | — |
| `hooks/voice/__tests__/retry.test.ts` | COMPLETA | — |
| `hooks/sip/index.ts` | COMPLETA | — |
| `hooks/sip/useSipConnection.ts` | COMPLETA | exponential backoff MAX_RECONNECT_ATTEMPTS=5 (A7) |
| `hooks/reactions/index.ts` | COMPLETA | useConversationReactionsRealtime não exportado (A2) |
| `hooks/reactions/types.ts` | COMPLETA | — |
| `hooks/reactions/useBatchReactions.ts` | COMPLETA | fallback .in() em chunks CHUNK_SIZE=100 |
| `hooks/reactions/useConversationReactionsRealtime.ts` | COMPLETA | — |
| `hooks/reactions/usePreloadConversationReactions.ts` | COMPLETA | guard dataUpdatedAt < batchStartedAt (A6) |
| `hooks/reactions/useReactionMutations.ts` | COMPLETA | updates otimistas + rollback |
| `hooks/team-chat/index.ts` | COMPLETA | useTeamMessageReactions não exportado (A3) |
| `hooks/team-chat/teamChatTypes.ts` | COMPLETA | — |
| `hooks/team-chat/useTeamChatMutations.ts` | COMPLETA | mix safeClient + raw supabase (A17) |
| `hooks/team-chat/useTeamConversations.ts` | COMPLETA | — |
| `hooks/team-chat/useTeamMessageReactions.ts` | COMPLETA | — |
| `hooks/team-chat/useTeamMessages.ts` | COMPLETA | cursor composto created_at\|id (A19) |
| `hooks/__tests__/archivedScenarios.simulacao.test.ts` | COMPLETA | cobre 8 cenários A–H; soft-delete via deleted_at |
| `hooks/__tests__/classifyFailure.test.ts` | COMPLETA | 6 prioridades; FAILURE_CATEGORY_LABEL exatamente 5 entradas |
| `hooks/__tests__/inboxE2E.test.ts` | COMPLETA | stress 500 conversações |
| `hooks/__tests__/inboxFilterPipeline.test.ts` | COMPLETA | archivedTab bypasses ALL filters (A10) |
| `hooks/__tests__/inboxLogic.test.ts` | COMPLETA | — |
| `hooks/__tests__/mediaRefreshCache.test.ts` | COMPLETA | LRU + byte budget; default 200 entries (A15) |
| `hooks/__tests__/messageSendHistory.schemas.test.ts` | COMPLETA | deriveFinalStatus: 5 regras de prioridade (A16) |
| `hooks/__tests__/realtimeChannelLifecycle.test.ts` | COMPLETA | bug mesmo topic = mesma instância Realtime (A4) |
| `hooks/__tests__/useArchiveConversationActions.test.ts` | COMPLETA | isValidUUID guard |
| `hooks/__tests__/useFailureReason.test.ts` | COMPLETA | formatFailureReason case-sensitive |
| `hooks/__tests__/useFallbackContact.test.ts` | COMPLETA | cadeia UUID→JID→evolution_contacts→rpc→synthetic (A13) |
| `hooks/__tests__/useInboxBulkActions.test.ts` | COMPLETA | bulkArchive DEVE usar soft-delete (A5) |
| `hooks/__tests__/useInboxHeartbeat.simulacao.test.ts` | COMPLETA | THROTTLE_MS=240s > HEARTBEAT_MS=180s (A11) |
| `hooks/__tests__/useInboxStatusPref.test.ts` | COMPLETA | localStorage inbox-status-label-visible; evento cross-component |
| `hooks/__tests__/useMediaUrl.test.ts` | COMPLETA | mountedRef guard; irrecoverable fail-fast; session cap 40 (A12) |
| `hooks/__tests__/useMessageQueueE2E.spec.tsx` | COMPLETA | localStorage chat_message_queue; processamento independente por conversa |
| `hooks/__tests__/useMessageReactions.test.tsx` | COMPLETA | N+1 prevention; batch vs individual (A6) |
| `hooks/__tests__/useRetryFailedMessage.test.tsx` | COMPLETA | rpc_dlq_retry_now; 30s rate-limit; invalidate sendHistory |
| `hooks/__tests__/useSendThrottle.test.ts` | COMPLETA | minInterval + burst limit; refs-based (sem re-render) |

---

## 8. Achados

### A1 — `touchLastSeen` usa `.eq('user_id', ...)` e NÃO `.eq('id', ...)`
**Arquivo:** `services/touchLastSeen.ts`

A atualização de `profiles.last_seen` filtra pela coluna `user_id` (chave estrangeira para `auth.users`), não pela coluna `id` (PK da tabela profiles). Teste `touchLastSeen.simulacao.test.ts` verifica esse contrato explicitamente. Qualquer refactor que troque `user_id` por `id` quebra o update silenciosamente.

### A2 — `useConversationReactionsRealtime` intencionalmente não exportado
**Arquivo:** `hooks/reactions/index.ts`

O barrel de reactions exporta `useBatchReactions`, `usePreloadConversationReactions` e `useReactionMutations`, mas omite `useConversationReactionsRealtime`. É uso interno da feature inbox — consumo externo deve passar pelo provider de batch, não subscrever Realtime individualmente.

### A3 — `useTeamMessageReactions` intencionalmente não exportado
**Arquivo:** `hooks/team-chat/index.ts`

Mesma decisão de design que A2: `useTeamMessageReactions` não é exportado do barrel — destinado ao uso interno por `TeamChatMessageRow` e `MessageReactions`.

### A4 — Realtime Bug: mesmo topic = mesma instância; `.on()` após `.subscribe()` lança exceção
**Arquivo:** `hooks/__tests__/realtimeChannelLifecycle.test.ts`

Teste de regressão Bug #1: ao criar dois canais com o mesmo `topic`, o Supabase Realtime retorna a mesma instância. Chamar `.on()` nessa instância depois de `.subscribe()` lança erro silencioso ou exception. Correção verificada: `useAgents` usa sufixo aleatório por mount (`Math.random().toString(36).slice(2,10)`). Teste R4 verifica que unmount chama `unsubscribe + removeChannel`.

### A5 — `bulkArchive` DEVE usar soft-delete via `updateStatusBulk(ids, 'archived')`
**Arquivo:** `hooks/__tests__/useInboxBulkActions.test.ts`

Teste de regressão de bug: `bulkArchive` não deve setar `assigned_to: null` nos contatos, deve chamar `contactsRepository.updateStatusBulk(ids, 'archived')`. Undo chama `updateStatusBulk(ids, 'active')`. No-op em seleção vazia ou IDs não-UUID. O teste especifica o contrato da API do repositório.

### A6 — `ReactionsBatchProvider` guard `dataUpdatedAt < batchStartedAt`
**Arquivo:** `hooks/reactions/usePreloadConversationReactions.ts`

Ao primear o cache via `queryClient.setQueryData`, o provider verifica se os dados existentes são mais recentes que o momento em que o batch começou (`dataUpdatedAt < batchStartedAt`). Sem esse guard, o batch sobrescreveria um resultado mais recente já cacheado por query individual (race condition).

### A7 — SIP: backoff exponencial com cap 30s; MAX_RECONNECT_ATTEMPTS=5
**Arquivo:** `hooks/sip/useSipConnection.ts`

Reconexão SIP usa `Math.min(1000 * 2^attempt, 30_000)` — diferente de `hooks/voice/retry.ts` que usa `baseDelay * 2^attempt` sem cap. Após 5 tentativas falhas, o status permanece em `'error'` sem novas tentativas automáticas (usuário deve chamar `connect()` manualmente).

### A8 — TTS: pré-busca chunk N+1 durante reprodução; fallback `speechSynthesis`
**Arquivo:** `hooks/voice/playTtsAudio.ts`

`playTtsAudio` inicializa `fetchChunkAudio(0)` e `fetchChunkAudio(1)` antes de começar a tocar, depois dentro do loop pré-busca `i+1` enquanto `i` está em reprodução. Erro de rede durante fetch → fallback `window.speechSynthesis` (pt-BR). `NotAllowedError` (autoplay bloqueado) → `onAutoplayBlocked()` sem fallback síntese.

### A9 — `touchLastSeen` tem estado global de módulo; reset via `vi.resetModules()`
**Arquivo:** `services/touchLastSeen.ts`, `services/__tests__/touchLastSeen.simulacao.test.ts`

As variáveis `pendingTimer` e `isInflight` são de nível de módulo (não instância). Testes usam `vi.resetModules()` + `import()` dinâmico para resetar entre casos. Em produção, importar o módulo em diferentes partes da app compartilha o mesmo timer — correto pois há exatamente um usuário logado por tab.

### A10 — `archivedTab` bypassa TODOS os outros filtros em `applyInboxFilters`
**Arquivo:** `hooks/__tests__/inboxFilterPipeline.test.ts`

Quando o filtro `archivedTab: true` está ativo, `applyInboxFilters` retorna apenas conversas arquivadas independentemente dos demais filtros (busca, agente, fila, status). `computeInboxTabCounts` SEMPRE conta conversas não-arquivadas, mesmo com `archivedTab: true`.

### A11 — Heartbeat: THROTTLE_MS=240s > HEARTBEAT_MS=180s; `pagehide` → write imediato
**Arquivo:** `hooks/__tests__/useInboxHeartbeat.simulacao.test.ts`

`THROTTLE_MS` (240s) é deliberadamente maior que `HEARTBEAT_MS` (180s): o intervalo periódico nunca dispara o throttle sozinho, protegendo contra writes frequentes. `pagehide` e `handleOffline` acionam `forceWrite` imediato sem esperar throttle. Cleanup só escreve `'offline'` se `lastWrittenStatus === 'online'` E o throttle expirou.

### A12 — `useMediaUrl`: mountedRef guard; `supabase.functions.invoke` sem AbortSignal; fail-fast em erros irrecuperáveis
**Arquivo:** `hooks/__tests__/useMediaUrl.test.ts`

Anti-storm hardening (2026-08-06): `supabase.functions.invoke` não aceita `AbortSignal` — `mountedRef` evita setState/log/toast pós-unmount. Erros irrecuperáveis (`MEDIA_EXPIRED`, `expired`, `not_found`, 404, 410, `400+"Failed to fetch stream"`) falham imediatamente sem segunda tentativa. `MAX_SESSION_REFRESH_ATTEMPTS=40`. `classifyError` lê `context.data` (parsed) ou `context.json()` (raw Response) para classificar por código de envelope, status HTTP ou texto.

### A13 — `useFallbackContact`: cadeia UUID→JID→`evolution_contacts`→`rpc_get_contact`→synthetic
**Arquivo:** `hooks/__tests__/useFallbackContact.test.ts`

UUID → `contacts.eq('id', uuid)`. JID → extrai phone (strip do sufixo @s.whatsapp.net) → `contacts.eq('phone', phone)`. Se ambos null → `evolution_contacts.eq('remote_jid', jid)` (+ `updated_at`, `limit 1`). Se falha → `rpc_get_contact`. Se RPC falha → synthetic `{ id: jid, remote_jid: jid }`. Skip quando `selectedConversation` já fornecido ou `contactId` null.

### A14 — `logVoiceCommand`: fire-and-forget com `Content-Profile: zapp`
**Arquivo:** `hooks/voice/logVoiceCommand.ts`

Usa `fetch` raw (não `supabase.functions.invoke`) para gravar em `voice_command_logs`. Inclui header `Content-Profile: zapp` para garantir que o PostgREST direcione para o schema correto. Timeout de 15s via AbortController. Erros não são propagados — intencionalmente fire-and-forget para não bloquear o fluxo de voz.

### A15 — `mediaRefreshCache`: LRU com entry cap + byte budget eviction
**Arquivo:** `hooks/__tests__/mediaRefreshCache.test.ts`

Cache LRU com dois limites: máximo de entradas (`maxEntries`, default 200) e orçamento de bytes (`maxBytes`). Eviction por LRU quando qualquer limite é excedido. Overwrite de chave existente promove para MRU. `mediaCacheClear()` reseta para defaults (200 entradas). Configurável via `mediaCacheConfigure`.

### A16 — `deriveFinalStatus`: 5 regras de prioridade para métricas de retry
**Arquivo:** `hooks/__tests__/messageSendHistory.schemas.test.ts`

Ordem de prioridade: (1) `external_message_id` existe → `'success'`; (2) `retryCount >= maxRetries` → `'exhausted'`; (3) `nextRetryAt` no futuro → `'retrying'`; (4) `retryCount > 0` → `'failed'`; (5) else → `'unknown'`.

### A17 — `useTeamChatMutations` usa `safeClient` E `supabase` raw (misto)
**Arquivo:** `hooks/team-chat/useTeamChatMutations.ts`

Das 7 mutations, algumas usam `safeClient.from(...)` e outras usam `supabase.from(...)` diretamente. Não há documentação de critério para a escolha. Inconsistência pode causar comportamentos diferentes em edge cases de auth/RLS.

### A18 — `whatsappStatusRepository` mistura `dbFrom` e `supabase` direto
**Arquivo:** `data-access/whatsappStatusRepository.ts`

`getContact` usa `dbFrom('contacts')` (abstração datasource), mas `getConnectedWhatsAppConnection` usa `supabase.from('whatsapp_connections')` diretamente. Inconsistência de padrão — sem impacto funcional imediato, mas dificulta testes e mock.

### A19 — Team messages cursor composto `created_at|id` (pagination segura)
**Arquivo:** `hooks/team-chat/useTeamMessages.ts`

Pagination via cursor composto `created_at|id` (não offset). Garante ordenação estável mesmo com timestamps idênticos. `sanitizePostgrestFilter` aplicado em `searchQuery` antes de `.ilike()` — proteção anti-injeção PostgREST.

---

*Runtime: NAO_VERIFICADO — nenhuma execução real foi realizada durante esta análise.*

SERVICES_B_CONCLUIDO arquivos_lidos:54
