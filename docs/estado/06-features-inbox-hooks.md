# Estado: `src/features/inbox/hooks/` — Módulo de Hooks do Inbox

> Runtime: **NAO_VERIFICADO**
> Auditado em: 2026-08-09 | Arquivos lidos: 99/99

---

## 1. Visão Geral do Módulo

Camada de lógica de negócio do módulo Inbox do ZAPP-WEB. Concentra toda a orquestração de estado de conversas/mensagens WhatsApp, envio de mensagens, realtime (Supabase), filtros, paginação cursor-based, filas de retry, upload de mídia, presença/heartbeat, notificações e integrações externas (SIP.js, Evolution API). É a camada mais densa do projeto: 99 arquivos / 17.076 linhas.

**Contagem:** 99 arquivos — 64 na raiz de `hooks/`, 28 em `hooks/realtime/` (incluindo 7 testes unitários), 7 testes unitários de realtime.

### Tabela de Arquivos por Categoria

| Categoria | Arquivo | Linhas |
|-----------|---------|--------|
| **Barrel raiz** | `index.ts` | 42 |
| **Barrel realtime** | `realtime/index.ts` | 21 |
| **Utilitário filtro** | `inboxFilterPersistence.ts` | 182 |
| **Utilitário filtro** | `inboxFilterPipeline.ts` | 424 |
| **Utilitário filtro** | `inboxFilterPresets.ts` | 213 |
| **Utilitário filtro** | `inboxPresetsSync.ts` | 210 |
| **Utilitário cache** | `mediaRefreshCache.ts` | 85 |
| **Schema Zod** | `messageSendHistory.schemas.ts` | 213 |
| **Hook** | `useAgentPendingCounts.ts` | 43 |
| **Hook** | `useAgentRecentSends.ts` | 117 |
| **Hook** | `useArchiveConversationActions.ts` | 41 |
| **Utilitário** | `useAuditLogMutation.ts` | 28 |
| **Utilitário** | `useAuxiliaryMessageLog.ts` | 101 |
| **Hook** | `useCalls.ts` | 319 |
| **Hook** | `useChatAutoScroll.ts` | 68 |
| **Hook** | `useChatMediaSending.ts` | 405 |
| **Hook** | `useChatSearch.ts` | 263 |
| **Hook** | `useContactDetailStats.ts` | 99 |
| **Utilitário** | `useContactNotesMutations.ts` | 27 |
| **Utilitário** | `useContactPurchasesData.ts` | 22 |
| **Hook** | `useContactSummaryBatch.ts` | 97 |
| **Hook** | `useConversationEventsData.ts` | 67 |
| **Utilitário** | `useConversationMemoryData.ts` | 33 |
| **Hook** | `useConversationMessagesData.ts` | 54 |
| **Hook** | `useConversationSLAData.ts` | 71 |
| **Hook** | `useConversationTasksData.ts` | 162 |
| **Hook** | `useFailureMetricsBatch.ts` | 128 |
| **Hook** | `useFailureReason.ts` | 82 |
| **Hook** | `useFallbackContact.ts` | 167 |
| **Hook** | `useInboxBulkActions.ts` | 168 |
| **Hook** | `useInboxDataQueries.ts` | 69 |
| **Hook** | `useInboxDeepLinks.ts` | 59 |
| **Hook** | `useInboxFilters.ts` | 778 |
| **Hook** | `useInboxHeartbeat.ts` | 138 |
| **Hook** | `useInboxShortcuts.ts` | 65 |
| **Hook** | `useInboxSource.ts` | 69 |
| **Hook** | `useInboxStatusPref.ts` | 45 |
| **Hook** | `useIncomingCallBroadcast.ts` | 129 |
| **Hook** | `useMediaRefresh.ts` | 77 |
| **Hook** | `useMediaUrl.ts` | 567 |
| **Utilitário** | `useMentionableProfilesData.ts` | 10 |
| **Hook** | `useMessageDetails.ts` | 45 |
| **Hook** | `useMessageQueue.ts` | 674 |
| **Hook** | `useMessageReactions.ts` | 154 |
| **Hook** | `useMessageSendHistory.ts` | 164 |
| **Hook** | `useMessageSignature.ts` | 64 |
| **Hook** | `useMessageStatus.ts` | 215 |
| **Hook** | `useMessageTemplates.ts` | 145 |
| **Hook (legado)** | `useMessages.ts` | 163 |
| **Hook** | `useMessagesCursor.ts` | 350 |
| **Hook** | `useNewConversation.ts` | 229 |
| **Hook** | `useQuickReplies.ts` | 347 |
| **Hook orquestrador** | `useRealtimeInbox.ts` | 513 |
| **Hook orquestrador** | `useRealtimeMessages.ts` | 1019 |
| **Utilitário** | `useRemindersData.ts` | 35 |
| **Hook** | `useRetryFailedMessage.ts` | 117 |
| **Hook** | `useSafeInteractiveMessage.ts` | 111 |
| **Hook** | `useScheduledMediaUpload.ts` | 65 |
| **Hook** | `useSendThrottle.ts` | 83 |
| **Hook** | `useSipClient.ts` | 253 |
| **Utilitário** | `useStickerMutations.ts` | 28 |
| **Hook** | `useTicketStatus.ts` | 94 |
| **Hook** | `useTransferConversation.ts` | 146 |
| **Hook** | `useWhatsAppStatus.ts` | 85 |
| **Utilitário** | `useWhisperMessagesMutation.ts` | 10 |
| **Singleton bus** | `realtime/audioPlaybackBus.ts` | 78 |
| **Singleton batch** | `realtime/avatarBatchStore.ts` | 190 |
| **Sender externo** | `realtime/externalAudioSender.ts` | 183 |
| **Sender externo** | `realtime/externalMessageSender.ts` | 302 |
| **Tipos sender ext.** | `realtime/externalSenderTypes.ts` | 94 |
| **Sender legado** | `realtime/messageSender.ts` | 503 |
| **Helpers sender** | `realtime/messageSenderHelpers.ts` | 158 |
| **Utilitário** | `realtime/parseEvolutionError.ts` | 71 |
| **Singleton store** | `realtime/playerStateStore.ts` | 95 |
| **Singleton store** | `realtime/realtimeContactsStatusStore.ts` | 38 |
| **Utilitários puros** | `realtime/realtimeUtils.ts` | 123 |
| **Telemetria** | `realtime/reconciliationTelemetry.ts` | 139 |
| **Singleton bus** | `realtime/sendStatusBus.ts` | 176 |
| **Tipos** | `realtime/types.ts` | 98 |
| **Hook alerta** | `realtime/useAutomationFailureAlerts.ts` | 130 |
| **Hook** | `realtime/useContactAvatar.ts` | 67 |
| **Hook ações** | `realtime/useConversationActions.ts` | 153 |
| **Hook** | `realtime/useConversationSendState.ts` | 51 |
| **Hook filtro** | `realtime/useConversationsFilter.ts` | 73 |
| **Hook alerta** | `realtime/useFailedMessageAlerts.ts` | 108 |
| **Hook** | `realtime/useMessageSendStatus.ts` | 33 |
| **Hook** | `realtime/useMessageUpdateBatcher.ts` | 149 |
| **Hook** | `realtime/useRealtimeContacts.ts` | 304 |
| **Hook** | `realtime/useRealtimeFallbackRefetch.ts` | 135 |
| **Hook** | `realtime/useRealtimeNotifications.ts` | 84 |
| **Hook** | `realtime/useRealtimePresenceAndConnections.ts` | 142 |
| **Hook alerta** | `realtime/useRetryResolutionAlerts.ts` | 199 |
| **Teste** | `realtime/__tests__/audioPlaybackBus.test.ts` | 225 |
| **Teste** | `realtime/__tests__/parseEvolutionError.test.ts` | 280 |
| **Teste** | `realtime/__tests__/playerStateStore.test.ts` | 291 |
| **Teste** | `realtime/__tests__/realtimeUtils.dedupe.test.ts` | 92 |
| **Teste** | `realtime/__tests__/realtimeUtils.utils.test.ts` | 469 |
| **Teste** | `realtime/__tests__/reconciliationTelemetry.test.ts` | 318 |
| **Teste** | `realtime/__tests__/sendStatusBus.test.ts` | 458 |

---

## 2. Fluxos Funcionais do Módulo

### 2.1 Carregamento e Paginação de Mensagens

```
useMessagesCursor (hook principal cursor-based — Evolution DB)
  → supabase.rpc('rpc_list_messages_lite', { p_remote_jid, p_limit, p_before_date })
  → DEFAULT_PAGE_SIZE=50; AbortController por fetch
  → loadOlder(): cursor = created_at[0] da página anterior → append prepend
  → addMessage/updateMessage/removeMessage: operações locais de state
  → dedupeAndSort(): Map por id → ASC por created_at

useMessages (legado — schema zapp.messages)
  → messageService.getMessages(contactId) → messageRepository.subscribeToMessages()
  → sem cursor, carrega tudo
  → STATUS: PARCIAL — não usa cursor, acessa tabela diferente
```

### 2.2 Envio de Mensagens

```
Caminho legado (zapp.messages):
  useRealtimeInbox/useConversationActions
    → sendMessageToContact() (realtime/messageSender.ts)
    → resolveConnection(): getWhatsappConnectionById → fallback getFirstConnectedWhatsapp
    → PROFILE_CACHE_TTL_MS=5min, CONTACT_CACHE_TTL_MS=30s
    → in-flight dedup via pendingSendsRef Map
    → emitSendStatus(id, 'sending' | 'retrying' | 'sent' | 'failed')
    → messageSender grava em zapp.messages + chama Evolution API via Edge Fn

Caminho externo (evo.evolution_messages):
  sendExternalText / sendExternalAudio (realtime/externalMessageSender.ts / externalAudioSender.ts)
    → jidToPhone(): remoteJid → phone number
    → makeOptimisticBubble(): id = 'optimistic:{ts}:{random6}'
    → logAudit: dbInsert(RPC.rpc_log_service_event)
    → Edge Function 'evolution-api' (proxy)
    → Retorno: { optimistic, externalId }

Fila de retry (useMessageQueue.ts):
  → DEFAULT_QUEUE_CONFIG: maxRetries=3, baseDelay=1000ms, maxDelay=30000ms, jitter=true
  → MAX_CONCURRENT_SENDS=5
  → exponential backoff com jitter antes de recolocar na fila

Throttle de envio (useSendThrottle.ts):
  → minIntervalMs=500ms, burstLimit=5, burstWindowMs=3000ms

Histórico de envio (useMessageSendHistory.ts):
  → Carrega evolution_retry_metrics + outbound_delivery_audit
  → Valida via FinalStatusSchema / RetryAttemptSchema (Zod)
```

### 2.3 Realtime de Mensagens

```
useMessagesCursor (canal por conversa):
  → supabase.channel('evolution_messages:{remoteJid}:{random}')
  → schema: 'evo', table: 'evolution_messages', filter: remote_jid=eq.{jid}
  → events: INSERT → addMessage; UPDATE → updateMessage; DELETE → removeMessage

useMessageStatus (canal por contactId):
  → Carga inicial: supabase.from('messages').select(*).eq('contact_id', id)
  → supabase.channel(`message_status:{contactId}`)
  → UPDATE em zapp.messages → merge com sendStatusBus (em memória)
  → sendStatusBus: pub/sub transiente; HISTORY_LIMIT_PER_MESSAGE=50, HISTORY_LIMIT_TOTAL=2000

useRealtimeMessages (orquestrador principal — legado/zapp):
  → CONTACTS_PAGE_SIZE=30, MESSAGES_PAGE_SIZE=50, CONTACT_FETCH_CHUNK_SIZE=200
  → HYDRATE_DEBOUNCE_MS=50ms (debounce de handlers realtime)
  → RECONCILED_MAX_ENTRIES=1000
  → Canal zapp.contacts INSERT/UPDATE/DELETE

useMessageUpdateBatcher:
  → Acumula UPDATE events rápidos em Map por id
  → Flush periódico para evitar renders em cascata (MessageBatcherStatus)
```

### 2.4 Realtime de Conversas

```
useRealtimeContacts (realtime/useRealtimeContacts.ts):
  → FLUSH_DELAY_MS=100ms
  → Canal evo.evolution_contacts INSERT/UPDATE/DELETE (default instance)
  → REORDER_FIELDS: lead_status, assigned_to, is_pinned, priority, last_message_at, unread_count, deleted_at, tags
  → hasReorderingChange(): detecta se mudança afeta ordenação do sidebar
  → Atualiza React Query (queryKeys) on reorder
  → Publica status em realtimeContactsStatusStore (idle|connecting|connected|disconnected|error)

useRealtimeFallbackRefetch:
  → Lê realtimeContactsStatus via useSyncExternalStore
  → Trigger 1: reconnect (non-connected → connected) → invalida caches imediatamente
  → Trigger 2: periódico — DEFAULT_INTERVAL_MS=5min (VITE_REALTIME_FALLBACK_REFETCH_MS)
  → Pausa quando document hidden; retoma sem disparo imediato
  → 5s throttle entre invalidações

useConversationsFilter (realtime/useConversationsFilter.ts):
  → Filtro client-side via useMemo: busca textual + status + sort
  → Sem canal realtime próprio — deriva do estado já hidratado
```

### 2.5 Presença e Typing

```
useRealtimePresenceAndConnections:
  → FALLBACK_POLL_MS=120s, PRESENCE_INVALIDATE_THROTTLE_MS=60s, CONNECTIONS_INVALIDATE_THROTTLE_MS=3s
  → Canal 1: zapp.agent_presence (UPDATE)
  → Canal 2: zapp.whatsapp_connections (INSERT/UPDATE/DELETE)
  → Fallback poll: revalida caches de presença a cada 120s mesmo sem evento

useInboxHeartbeat:
  → THROTTLE_MS=240s (4min), HEARTBEAT_MS=180s (3min), OFFLINE_DEBOUNCE_MS=30s
  → Atualiza profiles.online_status e profiles.last_seen
  → Monitora visibilitychange + beforeunload para marca online/offline
```

### 2.6 Upload de Mídia

```
useScheduledMediaUpload:
  → Upload via supabase.storage (bucket: whatsapp-media)
  → createSignedUploadUrl → upload blob
  → Signed URL TTL = 604800s (7 dias)
  → onProgress callback para barra de progresso

useChatMediaSending:
  → Stickers, custom emojis, audio memes via Evolution API
  → insertAuxMessage() para registrar na timeline do chat
  → Suporta: sticker, customEmoji, audioMeme

useMediaUrl:
  → Auto-refresh de URLs WhatsApp expiradas (~24h de validade)
  → Max 2 tentativas de refresh
  → Toast anti-flood: evita repetir toast para o mesmo URL

mediaRefreshCache (utilitário):
  → LRU cache in-memory
  → DEFAULT_MAX_CACHE_BYTES=50MB, DEFAULT_MAX_CACHE_ENTRIES=200
```

### 2.7 Reações a Mensagens

```
useMessageReactions:
  → Lê do contexto ReactionsBatchProvider (batch de reações)
  → Canal realtime opcional por mensagem individual
  → Merge de reações locais + banco

avatarBatchStore:
  → BATCH_WINDOW_MS=100ms (coalescing window)
  → CACHE_TTL_MS=30min, NEGATIVE_TTL_MS=5min
  → RPC: get_avatars_by_jids_batch
  → BroadcastChannel 'avatar-updates' para sincronizar abas

useContactAvatar:
  → Usa avatarBatchStore; prioriza initialUrl → semeia cache
```

### 2.8 Ciclo de Vida de Subscriptions

```
Padrão geral de canal realtime:
  useEffect(() => {
    const channel = supabase.channel(topic)
      .on('postgres_changes', {...}, handler)
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') logChannelError(...)
      });
    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    }
  }, [deps]);

Sufixo random em topic (ex: 'evolution_messages:{jid}:{random8}'):
  → Evita reutilizar instância de canal cujo teardown async ainda não terminou

Mount guards (isMountedRef / useMountedRef):
  → Previnem setState após unmount em todos os hooks assíncronos

playerStateStore:
  → Sobrevive a remontagens de bolhas; migrate(optimisticId, canonicalId) atômico
  → TTL_MS=30min; GC automático ao ultrapassar 200 entradas

reconciliationTelemetry:
  → Counters por estratégia (external_id | text_fallback | media_fallback)
  → Ring buffer MAX_RECENT=100 eventos; subscribers notificados
  → Logs DEBUG em DEV ou localStorage.debug_reconcile='1'
```

---

## 3. Tabelas, RPCs e Canais Realtime

### 3.1 Tabelas `.from()` — Schema `zapp` (via cliente padrão)

| Tabela | Operações | Arquivo(s) |
|--------|-----------|------------|
| `contacts` | SELECT, UPDATE | `useTransferConversation.ts`, `useFallbackContact.ts`, `useRealtimeMessages.ts` |
| `messages` | SELECT, INSERT, UPDATE | `useMessages.ts`, `useConversationActions.ts`, `useMessageStatus.ts`, `useAuxiliaryMessageLog.ts`, `useSafeInteractiveMessage.ts`, `useAgentPendingCounts.ts` |
| `profiles` | SELECT | `useMessageSignature.ts`, `useMentionableProfilesData.ts`, `messageSender.ts` |
| `audit_logs` | INSERT | `useAuditLogMutation.ts` |
| `conversation_transfers` | INSERT | `useTransferConversation.ts` |
| `transfer_comments` | INSERT | `useTransferConversation.ts` |
| `contact_purchases` | SELECT, INSERT | `useContactPurchasesData.ts` |
| `conversation_memory` | SELECT, INSERT/UPSERT | `useConversationMemoryData.ts` |
| `conversation_tasks` | SELECT, INSERT, UPDATE, DELETE | `useConversationTasksData.ts` |
| `calls` | SELECT, INSERT, UPDATE | `useCalls.ts`, `useSipClient.ts` |
| `saved_filters` | SELECT, INSERT, UPDATE, DELETE | `inboxPresetsSync.ts` |
| `inbox_custom_scopes` | SELECT | `useInboxDataQueries.ts` |
| `contact_tags` | SELECT | `useInboxDataQueries.ts` |
| `whisper_messages` | INSERT | `useWhisperMessagesMutation.ts` |
| `reminders` | SELECT, INSERT, UPDATE, DELETE | `useRemindersData.ts` |
| `stickers` | SELECT, INSERT, UPDATE, DELETE | `useStickerMutations.ts` |
| `quick_replies` | SELECT (view), INSERT, UPDATE, DELETE | `useQuickReplies.ts`, `useMessageTemplates.ts` |
| `automation_executions` | SELECT (realtime UPDATE) | `useAutomationFailureAlerts.ts` |
| `failed_messages` | SELECT (realtime UPDATE) | `useFailedMessageAlerts.ts` |

### 3.2 Tabelas `.from()` — Schema `evo` / Evolution (via views zapp ou `.schema('evo')`)

| Tabela | Via | Operações | Arquivo(s) |
|--------|-----|-----------|------------|
| `evolution_messages` | view zapp / schema evo (realtime) | SELECT (RPC), realtime sub | `useMessagesCursor.ts`, `useRealtimeMessages.ts` |
| `evolution_contacts` | view zapp / schema evo | SELECT | `useFallbackContact.ts`, `useRealtimeContacts.ts` |
| `evolution_retry_metrics` | view zapp | SELECT | `useFailureMetricsBatch.ts`, `useFailureReason.ts`, `useMessageSendHistory.ts` |
| `evolution_send_idempotency` | view zapp | SELECT | `useAgentRecentSends.ts` |
| `outbound_delivery_audit` | view zapp | SELECT | `useMessageSendHistory.ts` |
| `agent_presence` | view zapp | realtime UPDATE | `useRealtimePresenceAndConnections.ts` |
| `whatsapp_connections` | view zapp | realtime INSERT/UPDATE/DELETE | `useRealtimePresenceAndConnections.ts` |

### 3.3 RPCs `.rpc()` Utilizadas

| RPC | Parâmetros Chave | Arquivo |
|-----|-----------------|---------|
| `rpc_list_messages_lite` | `p_remote_jid, p_instance, p_limit, p_before_date` | `useMessagesCursor.ts` |
| `rpc_get_contact_summary_batch` | `p_contact_ids[]` | `useContactSummaryBatch.ts` |
| `rpc_get_message_details` | `p_message_id` | `useMessageDetails.ts` |
| `get_avatars_by_jids_batch` | `p_jids[]` | `realtime/avatarBatchStore.ts` |
| `rpc_get_contact` | `p_remote_jid, p_instance` | `useIncomingCallBroadcast.ts` |
| `rpc_dlq_retry_now` | `p_message_id` | `useRetryFailedMessage.ts` |
| `add_contact_note` | `contact_id, content` | `useContactNotesMutations.ts` |
| `rpc_log_service_event` | `p_instance, p_event_type, ...` | `realtime/externalMessageSender.ts`, `realtime/externalAudioSender.ts` |

### 3.4 Canais Realtime `supabase.channel()`

| Topic (padrão) | Schema | Tabela | Evento(s) | Arquivo |
|----------------|--------|--------|-----------|---------|
| `evolution_messages:{jid}:{random8}` | `evo` | `evolution_messages` | INSERT, UPDATE, DELETE | `useMessagesCursor.ts` |
| `message_status:{contactId}` | `zapp` | `messages` | UPDATE | `useMessageStatus.ts` |
| `incoming-calls:{instance}` | — | — | broadcast `call_received` | `useIncomingCallBroadcast.ts` |
| `failed_messages_alerts:{random8}` | `zapp` | `failed_messages` | UPDATE | `useFailedMessageAlerts.ts` |
| `automation_failure_alerts:{random8}` | `zapp` | `automation_executions` | UPDATE | `useAutomationFailureAlerts.ts` |
| `retry_resolution_alerts:{random8}` | `zapp` | `messages` | UPDATE | `useRetryResolutionAlerts.ts` |
| Canal evolution_contacts (instance) | `evo` | `evolution_contacts` | INSERT, UPDATE, DELETE | `useRealtimeContacts.ts` |
| Canal agent_presence | `zapp` | `agent_presence` | UPDATE | `useRealtimePresenceAndConnections.ts` |
| Canal whatsapp_connections | `zapp` | `whatsapp_connections` | INSERT, UPDATE, DELETE | `useRealtimePresenceAndConnections.ts` |
| Canal opcional por messageId | `zapp` | (reactions) | UPDATE | `useMessageReactions.ts` |

> **Nota:** `useRealtimeMessages.ts` e `useRealtimeInbox.ts` gerenciam canais internamente (código não lido por completo — mais de 1500 linhas combinadas); detalhes NAO_VERIFICADOS além dos primeiros 80 linhas de cada.

### 3.5 Outras APIs / Edge Functions

| Endpoint / Serviço | Ação | Arquivo |
|-------------------|------|---------|
| Edge Function `evolution-api` | Envio de mensagem texto/áudio via proxy | `realtime/messageSender.ts`, `realtime/externalMessageSender.ts`, `realtime/externalAudioSender.ts` |
| Edge Function `ticket-router` | Consulta status de ticket | `useTicketStatus.ts` |
| `whatsappStatusService` | Busca status stories + presence WhatsApp | `useWhatsAppStatus.ts` |
| `supabase.storage` (`whatsapp-media`) | Upload de mídia agendada | `useScheduledMediaUpload.ts` |
| SIP.js UserAgent | Chamadas WebRTC via protocolo SIP | `useSipClient.ts` |
| `react-hotkeys-hook` | Atalhos de teclado | `useInboxShortcuts.ts` |

---

## 4. Exportações Públicas por Categoria

### 4.1 Hooks de Dados (React Query)

| Exportação | Arquivo |
|------------|---------|
| `useAgentPendingCounts` | `useAgentPendingCounts.ts` |
| `useAgentRecentSends` | `useAgentRecentSends.ts` |
| `useContactDetailStats` | `useContactDetailStats.ts` |
| `useContactSummaryBatch` | `useContactSummaryBatch.ts` |
| `useConversationEventsData`, `conversationEventsQueryOptions` | `useConversationEventsData.ts` |
| `useConversationMessagesData` | `useConversationMessagesData.ts` |
| `useConversationSLA` | `useConversationSLAData.ts` |
| `useConversationTasksData`, `useConversationTasksMutations` | `useConversationTasksData.ts` |
| `useFailureMetricsBatch`, `classifyFailure`, `FailureCategory` | `useFailureMetricsBatch.ts` |
| `useFailureReason` | `useFailureReason.ts` |
| `useFallbackContact`, `resolveContactRef` | `useFallbackContact.ts` |
| `useMessageDetails` | `useMessageDetails.ts` |
| `useMessageReactions`, `useMessagesReactions` | `useMessageReactions.ts` |
| `useMessageSendHistory` | `useMessageSendHistory.ts` |
| `useMessageStatus` | `useMessageStatus.ts` |
| `useMessageTemplates` | `useMessageTemplates.ts` |
| `useMessages` | `useMessages.ts` |
| `useMessagesCursor` | `useMessagesCursor.ts` |
| `useQuickReplies` | `useQuickReplies.ts` |

### 4.2 Hooks de Estado/Ação

| Exportação | Arquivo |
|------------|---------|
| `useArchiveConversationActions` | `useArchiveConversationActions.ts` |
| `useCalls`, `Call`, `StartCallParams` | `useCalls.ts` |
| `useChatAutoScroll` | `useChatAutoScroll.ts` |
| `useChatMediaSending` | `useChatMediaSending.ts` |
| `useChatSearch`, `DatePreset` | `useChatSearch.ts` |
| `useInboxBulkActions` | `useInboxBulkActions.ts` |
| `useInboxDataQueries` | `useInboxDataQueries.ts` |
| `useInboxDeepLinks` | `useInboxDeepLinks.ts` |
| `useInboxFilters` | `useInboxFilters.ts` |
| `useInboxHeartbeat` | `useInboxHeartbeat.ts` |
| `useInboxShortcuts` | `useInboxShortcuts.ts` |
| `useInboxSource` | `useInboxSource.ts` |
| `useInboxStatusPref` | `useInboxStatusPref.ts` |
| `useIncomingCallBroadcast` | `useIncomingCallBroadcast.ts` |
| `useMediaRefresh` | `useMediaRefresh.ts` |
| `useMediaUrl` | `useMediaUrl.ts` |
| `useMessageQueue` | `useMessageQueue.ts` |
| `useMessageSignature` | `useMessageSignature.ts` |
| `useNewConversation` | `useNewConversation.ts` |
| `useRealtimeInbox` | `useRealtimeInbox.ts` |
| `useRealtimeMessages` | `useRealtimeMessages.ts` |
| `useRetryFailedMessage` | `useRetryFailedMessage.ts` |
| `useSafeInteractiveMessage` | `useSafeInteractiveMessage.ts` |
| `useScheduledMediaUpload` | `useScheduledMediaUpload.ts` |
| `useSendThrottle` | `useSendThrottle.ts` |
| `useSipClient` | `useSipClient.ts` |
| `useTicketStatus` | `useTicketStatus.ts` |
| `useTransferConversation` | `useTransferConversation.ts` |
| `useWhatsAppStatus`, `WhatsAppStatusData` | `useWhatsAppStatus.ts` |

### 4.3 Utilitários (Funções Assíncronas — NÃO são hooks React)

| Exportação | Arquivo | Nota |
|------------|---------|------|
| `logAuditEvent` | `useAuditLogMutation.ts` | Fire-and-forget; nome misleading (não é hook) |
| `insertAuxMessage` | `useAuxiliaryMessageLog.ts` | UUID guard; never throws |
| `fetchContactPurchases`, `createContactPurchase` | `useContactPurchasesData.ts` | Funções async, não hook |
| `fetchConversationMemory`, `saveConversationMemory` | `useConversationMemoryData.ts` | Funções async, não hook |
| `fetchMentionableProfiles` | `useMentionableProfilesData.ts` | Função async, não hook |
| `fetchReminders`, `createReminder`, `dismissReminder`, `deleteReminder` | `useRemindersData.ts` | Funções async, não hook |
| `fetchStickers`, `toggleStickerFavorite`, `deleteSticker`, `fetchStickerCategories`, `incrementStickerUseCount` | `useStickerMutations.ts` | Funções async, não hook |
| `insertWhisperMessage` | `useWhisperMessagesMutation.ts` | Função async, não hook |
| `insertContactNote` | `useContactNotesMutations.ts` | Wrapper de RPC |

### 4.4 Singletons e Utilitários Realtime

| Exportação | Arquivo |
|------------|---------|
| `audioPlaybackBus`, `ActivePlayerHandle` | `realtime/audioPlaybackBus.ts` |
| `getContactAvatar`, `seedAvatarCache` | `realtime/avatarBatchStore.ts` |
| `sendExternalText`, `sendExternalAudio` (re-export), `SendError`, `SendExternalOptions` | `realtime/externalMessageSender.ts` |
| `sendExternalAudio` | `realtime/externalAudioSender.ts` |
| `DEFAULT_INSTANCE`, `SendError`, `OptimisticMessage`, `SendExternalResult`, `makeOptimisticBubble` | `realtime/externalSenderTypes.ts` |
| `sendMessageToContact` | `realtime/messageSender.ts` |
| `classifyAuthError`, `resolveConnection`, `SendMessageResult` | `realtime/messageSenderHelpers.ts` |
| `parseEvolutionError`, `EvolutionErrorInfo` | `realtime/parseEvolutionError.ts` |
| `playerStateStore`, `PlayerState` | `realtime/playerStateStore.ts` |
| `setRealtimeContactsStatus`, `useRealtimeContactsStatus`, `RealtimeContactsStatus` | `realtime/realtimeContactsStatusStore.ts` |
| `normalizeMessage`, `sortMessagesByCreatedAt`, `dedupeMessages`, `dedupeContacts`, `buildConversation`, `buildConversations`, `chunkArray`, `getUniqueMessageContactIds` | `realtime/realtimeUtils.ts` |
| `recordMatch`, `getReconciliationStats`, `getRecentMatches`, `subscribeReconciliation`, `resetReconciliationStats`, `MatchStrategy`, `MatchEvent` | `realtime/reconciliationTelemetry.ts` |
| `emitSendStatus`, `getSendStatus`, `subscribeSendStatus`, `subscribeAllSendStatus`, `clearSendStatus`, `SendStatusDetail`, `SendUIStatus` | `realtime/sendStatusBus.ts` |
| `NewMessageNotification`, `RealtimeMessage`, `MessageReaction`, `ConversationContact`, `ConversationWithMessages` | `realtime/types.ts` |
| `useAutomationFailureAlerts` | `realtime/useAutomationFailureAlerts.ts` |
| `useContactAvatar` | `realtime/useContactAvatar.ts` |
| `useConversationActions` | `realtime/useConversationActions.ts` |
| `useConversationSendState`, `ConversationSendState` | `realtime/useConversationSendState.ts` |
| `useConversationsFilter` | `realtime/useConversationsFilter.ts` |
| `useFailedMessageAlerts` | `realtime/useFailedMessageAlerts.ts` |
| `useMessageSendStatus` | `realtime/useMessageSendStatus.ts` |
| `useMessageUpdateBatcher`, `MessageBatcherStatus` | `realtime/useMessageUpdateBatcher.ts` |
| `useRealtimeContacts`, `getRealtimeDiscardedCount` (deprecated) | `realtime/useRealtimeContacts.ts` |
| `useRealtimeFallbackRefetch`, `REALTIME_FALLBACK_REFETCH_MS` | `realtime/useRealtimeFallbackRefetch.ts` |
| `useRealtimeNotifications` | `realtime/useRealtimeNotifications.ts` |
| `useRealtimePresenceAndConnections` | `realtime/useRealtimePresenceAndConnections.ts` |
| `useRetryResolutionAlerts` | `realtime/useRetryResolutionAlerts.ts` |

### 4.5 Utilitários de Filtro (sem canal realtime)

| Exportação | Arquivo |
|------------|---------|
| `STORAGE_KEY`, `MAIN_TABS`, `SUB_TABS`, `INBOX_SCOPES`, `MAX_SEARCH_LENGTH` | `inboxFilterPersistence.ts` |
| `filterConversations`, `sortConversations`, `CHANNEL_PERMISSION_KEYS` | `inboxFilterPipeline.ts` |
| `PRESETS_KEY`, `MAX_INBOX_PRESETS`, `PRESET_NAME_MAX_LENGTH`, preset helpers | `inboxFilterPresets.ts` |
| `syncPresetsToServer`, `loadPresetsFromServer` | `inboxPresetsSync.ts` |
| `MediaRefreshCache` (class), `createMediaRefreshCache` | `mediaRefreshCache.ts` |
| `FinalStatusSchema`, `RetryAttemptSchema`, `MessageHistoryEntrySchema` | `messageSendHistory.schemas.ts` |

---

## 5. Saída: Dependências Externas aos Hooks

| Dependência (importada de) | Usada em | Papel |
|---------------------------|----------|-------|
| `@/integrations/supabase/client` | quase todos | cliente Supabase (schema zapp) |
| `@/integrations/datasource/db` (`dbFrom`, `dbInsert`, `dbTable`, `dbChannel`) | `useTransferConversation`, `useConversationActions`, `externalMessageSender`, etc. | abstração sobre Supabase client |
| `@/integrations/datasource/rpcCatalog` (`RPC`) | `externalMessageSender`, `externalAudioSender` | catálogo de RPCs tipado |
| `@/integrations/supabase/safeClient` | `externalAudioSender` | wrapper tipado seguro |
| `@/integrations/supabase/channelErrorLogging` | múltiplos hooks realtime | classificação de erros de canal |
| `@/hooks/use-toast` | `useTransferConversation`, `useRetryFailedMessage` | toasts de UI (shadcn) |
| `@/hooks/useMountedRef` | múltiplos | mount guard |
| `@tanstack/react-query` (`useQuery`, `useMutation`, `useQueryClient`, `queryOptions`) | quase todos os hooks de dados | cache/fetching |
| `@/services/api/queryKeys` | `useConversationEventsData`, `useRealtimeContacts`, `useRealtimeFallbackRefetch` | chaves de cache canônicas |
| `@/adapters/evolutionAdapter` (`jidToPhone`) | `externalMessageSender`, `externalAudioSender`, `useIncomingCallBroadcast` | parsing de JID WhatsApp |
| `@/features/auth` (`useAuth`) | `useIncomingCallBroadcast`, outros | contexto de autenticação |
| `@/utils/uuid` (`isValidUUID`) | `useTransferConversation`, `useArchiveConversationActions`, `useConversationActions` | guard de UUID |
| `@/lib/logger` (`getLogger`) | quase todos | logging estruturado |
| `@/lib/constants/whatsappInstances` | `useIncomingCallBroadcast`, `useMessagesCursor`, `externalSenderTypes` | instância WA padrão |
| `@/lib/whatsappConnectionsCache` | `messageSenderHelpers` | cache de conexões WA |
| `@/lib/crypto` (`buildFileHash`) | `externalMessageSender`, `externalAudioSender` | hash de arquivo para dedup |
| `@/lib/mediaUrl` (`sanitizeMediaUrl`) | `useRealtimeContacts` | sanitização de URL de mídia |
| `@/types/evolutionExternal` | `useMessagesCursor`, `useRealtimeContacts`, `avatarBatchStore` | tipos da Evolution API |
| `@/hooks/useNotificationSettings` | `useRealtimeNotifications` | configuração de notificações |
| `@/utils/notificationSounds` | `useRealtimeNotifications` | sons e permissões browser |
| `react-hotkeys-hook` | `useInboxShortcuts` | atalhos de teclado |
| `sonner` (toast) | `useFailedMessageAlerts`, `useAutomationFailureAlerts`, `useRetryResolutionAlerts` | toasts não-shadcn |
| `react-router-dom` (`useNavigate`) | `useRetryResolutionAlerts` | navegação para conversa |
| `zod` | `inboxFilterPresets`, `messageSendHistory.schemas` | validação de schema |
| SIP.js (`sip.js`) | `useSipClient` | WebRTC / chamadas de voz |
| `@/features/inbox` (barrel) | `externalMessageSender`, `externalAudioSender` | re-export de `parseEvolutionError` |

---

## 6. Entrada: Quem Importa os Hooks (`Called By`)

Arquivos externos a `src/features/inbox/hooks/` que importam diretamente:

| Importador | O que importa |
|------------|---------------|
| `src/features/inbox/components/ConversationHistory.tsx` | hooks deste módulo (NAO_VERIFICADO detalhes) |
| `src/features/inbox/components/ConversationTimeline.tsx` | hooks deste módulo |
| `src/features/inbox/components/NextBestActionEngine.tsx` | hooks deste módulo |
| `src/components/team-chat/TeamChatMessageRow.tsx` | hooks deste módulo |
| `src/components/team-chat/TeamChatPanel.tsx` | hooks deste módulo |
| `src/components/team-chat/MessageReactions.tsx` | `useMessageReactions` / `useMessagesReactions` |
| `src/components/layout/IndexContentConnected.tsx` | hooks deste módulo |
| `src/components/keyboard/GlobalKeyboardProvider.tsx` | `audioPlaybackBus` |
| `src/components/voice/VoiceSearchOverlayConnected.tsx` | hooks deste módulo |
| `src/hooks/useChatSearch.ts` | `useChatSearch` (re-export) |
| `src/hooks/useVoiceActionHandler.ts` | hooks deste módulo |
| `src/hooks/evolutionReconcile.ts` | `recordMatch` (reconciliationTelemetry) |
| `src/hooks/useVoiceAgent.ts` | hooks deste módulo |
| `src/hooks/useMessageReactions.ts` | `useMessageReactions`, `useMessagesReactions` |
| `src/hooks/useTeamChat.ts` | hooks deste módulo |
| `src/hooks/useAudioManagement.ts` | `audioPlaybackBus` |
| `src/adapters/inboxLegacyMapper.ts` | tipos `ConversationWithMessages`, `RealtimeMessage`, `ConversationContact` |
| `src/adapters/evolutionAdapter.ts` | hooks deste módulo |
| `src/__tests__/inbox-crud.test.tsx` | `useMessages` |
| `src/hooks/__tests__/useVoiceActionHandler.test.ts` | hooks deste módulo |
| `src/adapters/__tests__/inboxLegacyMapper.test.ts` | tipos de realtime/types.ts |

> Importadores dentro de `src/features/inbox/` (components, services, etc.) não listados acima — são parte do mesmo módulo feature. A lista acima cobre apenas consumidores **externos**.

---

## 7. Implementação por Arquivo

| Arquivo | Status | O que falta / observação |
|---------|--------|--------------------------|
| `index.ts` | COMPLETA | Barrel de exports |
| `realtime/index.ts` | COMPLETA | Barrel de exports realtime |
| `inboxFilterPersistence.ts` | COMPLETA | localStorage; MAIN_TABS, SUB_TABS, INBOX_SCOPES |
| `inboxFilterPipeline.ts` | COMPLETA | Filtro client-side puro; gate de aba archived |
| `inboxFilterPresets.ts` | COMPLETA | Zod; MAX_INBOX_PRESETS=20; localStorage |
| `inboxPresetsSync.ts` | COMPLETA | Sync com `saved_filters`; entity_type='inbox_filters'; cache 2min |
| `mediaRefreshCache.ts` | COMPLETA | LRU cache; 50MB / 200 entradas max |
| `messageSendHistory.schemas.ts` | COMPLETA | Schemas Zod para histórico de envio |
| `useAgentPendingCounts.ts` | COMPLETA | Poll `messages`; staleTime=15s, refetchInterval=30s |
| `useAgentRecentSends.ts` | PARCIAL | Lido parcialmente; SENDS_LIMIT=200, PER_AGENT_LIMIT=5; join `evolution_send_idempotency` + `messages.agent_id` |
| `useArchiveConversationActions.ts` | COMPLETA | UUID guard; wraps useArchiveContact/useRestoreContact |
| `useAuditLogMutation.ts` | COMPLETA | `logAuditEvent()` — NÃO é hook React; fire-and-forget |
| `useAuxiliaryMessageLog.ts` | PARCIAL | `insertAuxMessage()`; UUID → insert zapp.messages; JID → skip |
| `useCalls.ts` | PARCIAL | CRUD em `calls`; AbortController; Call/StartCallParams |
| `useChatAutoScroll.ts` | PARCIAL | threshold=150px; scroll only quando user near bottom |
| `useChatMediaSending.ts` | PARCIAL | Stickers/emojis/audio memes via Evolution API; usa insertAuxMessage |
| `useChatSearch.ts` | PARCIAL | Full-text + accent normalization; DatePreset enum; URL_REGEX |
| `useContactDetailStats.ts` | PARCIAL | Derivado de caches compartilhados; CSAT com query própria; BUG-2026-08-06 N+1 fix |
| `useContactNotesMutations.ts` | PARCIAL | `insertContactNote` via RPC `add_contact_note` |
| `useContactPurchasesData.ts` | COMPLETA | `fetchContactPurchases`, `createContactPurchase` — NÃO hooks |
| `useContactSummaryBatch.ts` | PARCIAL | RPC `rpc_get_contact_summary_batch`; stableIds via useMemo (BUG-2026-08-04) |
| `useConversationEventsData.ts` | PARCIAL | `conversationEventsQueryOptions`; staleTime=30s; joins profiles/queues |
| `useConversationMemoryData.ts` | COMPLETA | `fetchConversationMemory`, `saveConversationMemory` — NÃO hooks |
| `useConversationMessagesData.ts` | PARCIAL | MESSAGES_CAP=1000; DESC; staleTime=30s |
| `useConversationSLAData.ts` | PARCIAL | `useConversationSLA`; staleTime=30s |
| `useConversationTasksData.ts` | PARCIAL | CRUD `conversation_tasks`; BATCH_POLL_INTERVAL_MS=2000 |
| `useFailureMetricsBatch.ts` | PARCIAL | Batch `evolution_retry_metrics`; TERMINAL set; classifyFailure |
| `useFailureReason.ts` | PARCIAL | Lazy query; idempotency_key format `msg:<id>`; staleTime=60s |
| `useFallbackContact.ts` | PARCIAL | UUID→contacts.id ou JID→contacts.phone→evolution_contacts |
| `useInboxBulkActions.ts` | PARCIAL | Selection state + bulk ops; useUndoableAction |
| `useInboxDataQueries.ts` | PARCIAL | `inbox_custom_scopes` + `contact_tags`; CHUNK_SIZE=500 |
| `useInboxDeepLinks.ts` | PARCIAL | URL params `?contact=`/`?message=`; `window.__pendingOpenContactId` |
| `useInboxFilters.ts` | PARCIAL | Pipeline de filtros; STORAGE_KEY='inbox_filters_v1'; preset sync |
| `useInboxHeartbeat.ts` | PARCIAL | THROTTLE_MS=240s; profiles.online_status + last_seen |
| `useInboxShortcuts.ts` | PARCIAL | react-hotkeys-hook; atalhos de teclado |
| `useInboxSource.ts` | COMPLETA | Dual-path zapp×evo por configuração (VITE_INBOX_SOURCE_MODE: evo/zapp/auto+fallback telemetrado) — ADR `docs/adr/dual-path-inbox.md`; testado em `__tests__/useInboxSource.test.tsx` (E36) |
| `useInboxStatusPref.ts` | COMPLETA | localStorage; STORAGE_KEY='inbox-status-label-visible'; custom DOM event |
| `useIncomingCallBroadcast.ts` | COMPLETA | Canal broadcast `incoming-calls:{instance}`; guard @broadcast |
| `useMediaRefresh.ts` | PARCIAL | No-op wrapper sobre useMediaUrl; propagates messageType |
| `useMediaUrl.ts` | PARCIAL | Auto-refresh URLs expiradas; max 2 tentativas; toast anti-flood |
| `useMentionableProfilesData.ts` | COMPLETA | `fetchMentionableProfiles` — NÃO hook |
| `useMessageDetails.ts` | COMPLETA | `rpc_get_message_details`; staleTime=5min, gcTime=10min |
| `useMessageQueue.ts` | PARCIAL | Queue + retry; maxRetries=3; baseDelay=1s; maxDelay=30s; MAX_CONCURRENT=5 |
| `useMessageReactions.ts` | PARCIAL | ReactionsBatchProvider context; canal realtime opcional |
| `useMessageSendHistory.ts` | PARCIAL | `evolution_retry_metrics` + `outbound_delivery_audit`; Zod |
| `useMessageSignature.ts` | PARCIAL | profiles.name+job_title; SIGNATURE_ENABLED_KEY localStorage |
| `useMessageStatus.ts` | PARCIAL | Carga inicial `messages`; realtime; merge sendStatusBus |
| `useMessageTemplates.ts` | PARCIAL | CRUD `quick_replies`; by use_count; mountedRef guard |
| `useMessages.ts` | PARCIAL | Legado; messageService/messageRepository; sem cursor |
| `useMessagesCursor.ts` | COMPLETA | Cursor-based; rpc_list_messages_lite; DEFAULT_PAGE_SIZE=50 |
| `useNewConversation.ts` | PARCIAL | Dialog; contact search; Evolution API; criticalPayloadSchemas |
| `useQuickReplies.ts` | PARCIAL | CRUD + fuzzy + favorites localStorage + use-count |
| `useRealtimeInbox.ts` | PARCIAL | Orquestrador primário; AVATAR_SEED_TTL_MS=30min, RECONCILED_MAX=1000 |
| `useRealtimeMessages.ts` | PARCIAL | Orquestrador maior; 1019 linhas; HYDRATE_DEBOUNCE_MS=50ms |
| `useRemindersData.ts` | COMPLETA | CRUD `reminders` — NÃO hooks |
| `useRetryFailedMessage.ts` | PARCIAL | `rpc_dlq_retry_now`; RATE_LIMIT_MS=30s; optimistic cache update |
| `useSafeInteractiveMessage.ts` | PARCIAL | Poll/contact-card inserts; fix 'sent'→'sending' |
| `useScheduledMediaUpload.ts` | PARCIAL | Upload `whatsapp-media`; signed URL TTL=604800s |
| `useSendThrottle.ts` | PARCIAL | minIntervalMs=500; burstLimit=5; burstWindowMs=3000ms |
| `useSipClient.ts` | PARCIAL | SIP.js; UA connect; place/answer/hold/mute; persist `calls` |
| `useStickerMutations.ts` | COMPLETA | CRUD `stickers` — NÃO hooks |
| `useTicketStatus.ts` | PARCIAL | `useSyncExternalStore` ticketStore; Edge Fn `ticket-router` |
| `useTransferConversation.ts` | COMPLETA | UPDATE contacts; INSERT messages + conversation_transfers + transfer_comments |
| `useWhatsAppStatus.ts` | COMPLETA | stories + presence; AbortController; whatsappStatusService |
| `useWhisperMessagesMutation.ts` | COMPLETA | INSERT `whisper_messages` — NÃO hook |
| `realtime/audioPlaybackBus.ts` | COMPLETA | Singleton pub/sub para player ativo; toggleMuteActive |
| `realtime/avatarBatchStore.ts` | PARCIAL | BATCH_WINDOW_MS=100ms; CACHE_TTL=30min; BroadcastChannel |
| `realtime/externalAudioSender.ts` | PARCIAL | PTT/voice; blobToBase64; makeOptimisticBubble |
| `realtime/externalMessageSender.ts` | PARCIAL | sendExternalText; re-export externalAudioSender |
| `realtime/externalSenderTypes.ts` | COMPLETA | DEFAULT_INSTANCE, SendError, OptimisticMessage, makeOptimisticBubble |
| `realtime/messageSender.ts` | PARCIAL | 503 linhas; PROFILE_CACHE_TTL=5min; in-flight dedup |
| `realtime/messageSenderHelpers.ts` | COMPLETA | classifyAuthError; resolveConnection |
| `realtime/parseEvolutionError.ts` | COMPLETA | 9 padrões humanizados; extrai nested de response.message |
| `realtime/playerStateStore.ts` | PARCIAL | TTL_MS=30min; migrate(from,to); GC >200 entries |
| `realtime/realtimeContactsStatusStore.ts` | COMPLETA | useSyncExternalStore; idle→error states |
| `realtime/realtimeUtils.ts` | PARCIAL | normalizeMessage, dedupeMessages, sortMessages, buildConversation, chunkArray |
| `realtime/reconciliationTelemetry.ts` | PARCIAL | counters; MAX_RECENT=100; subscribeReconciliation |
| `realtime/sendStatusBus.ts` | PARCIAL | pub/sub transiente; HISTORY_LIMIT_PER_MSG=50; HISTORY_LIMIT_TOTAL=2000 |
| `realtime/types.ts` | PARCIAL | NewMessageNotification, RealtimeMessage, MessageReaction, ConversationContact (80+ linhas) |
| `realtime/useAutomationFailureAlerts.ts` | PARCIAL | Canal `automation_executions`; toast sonner |
| `realtime/useContactAvatar.ts` | PARCIAL | Delegates avatarBatchStore; seedAvatarCache se initialUrl |
| `realtime/useConversationActions.ts` | PARCIAL | MARK_READ_FLUSH_MS=250ms; batch markAsRead; sendMessageToContact |
| `realtime/useConversationSendState.ts` | COMPLETA | useSyncExternalStore → sendStatusBus; idle/retrying/failed |
| `realtime/useConversationsFilter.ts` | COMPLETA | useMemo client-side; search + status + sort |
| `realtime/useFailedMessageAlerts.ts` | PARCIAL | Canal `failed_messages`; status='abandoned'; toast sonner |
| `realtime/useMessageSendStatus.ts` | COMPLETA | Per-message sub; sendStatusBus; sem DB |
| `realtime/useMessageUpdateBatcher.ts` | PARCIAL | Batch UPDATE events; MessageBatcherStatus |
| `realtime/useRealtimeContacts.ts` | PARCIAL | FLUSH_DELAY_MS=100ms; REORDER_FIELDS; setRealtimeContactsStatus |
| `realtime/useRealtimeFallbackRefetch.ts` | PARCIAL | DEFAULT_INTERVAL_MS=5min; pausa em hidden; 5s throttle |
| `realtime/useRealtimeNotifications.ts` | PARCIAL | playNotificationSound; showBrowserNotification; quiet hours |
| `realtime/useRealtimePresenceAndConnections.ts` | PARCIAL | FALLBACK_POLL=120s; agent_presence + whatsapp_connections |
| `realtime/useRetryResolutionAlerts.ts` | PARCIAL | SOFT_CAP=500; bus + realtime; toast sucesso/falha terminal |
| `realtime/__tests__/audioPlaybackBus.test.ts` | COMPLETA | 225 linhas; Vitest; testa setActive/clearActive/toggleMuteActive |
| `realtime/__tests__/parseEvolutionError.test.ts` | COMPLETA | 280 linhas; Vitest; testa null/envelope/humanização |
| `realtime/__tests__/playerStateStore.test.ts` | COMPLETA | 291 linhas; Vitest; testa get/set/migrate/_clear |
| `realtime/__tests__/realtimeUtils.dedupe.test.ts` | COMPLETA | 92 linhas; Vitest; dedupeMessages, sortMessages, buildConversation |
| `realtime/__tests__/realtimeUtils.utils.test.ts` | COMPLETA | 469 linhas; Vitest; normalizeMessage, dedupeContacts, chunkArray, buildConversations |
| `realtime/__tests__/reconciliationTelemetry.test.ts` | COMPLETA | 318 linhas; Vitest; recordMatch, counters, subscribeReconciliation |
| `realtime/__tests__/sendStatusBus.test.ts` | COMPLETA | 458 linhas; Vitest; emitSendStatus, getSendStatus, subscrições, history |

---

## 8. Achados (Findings)

### A1 — Falso nome de "hook" em utilitários (misleading naming)
**Arquivo:** `useAuditLogMutation.ts:3`, `useContactPurchasesData.ts:1`, `useConversationMemoryData.ts:1`, `useMentionableProfilesData.ts:1`, `useRemindersData.ts:1`, `useStickerMutations.ts:1`, `useWhisperMessagesMutation.ts:1`
**O que é:** Módulos com prefixo `use` que exportam funções assíncronas simples (não são React hooks — sem `useState`/`useEffect`/`useQuery`).
**Por que importa:** Consumidores que chamam essas "funções" dentro de componentes React esperando semântica de hook podem violar as regras de hooks do React. O linter de hooks (`eslint-plugin-react-hooks`) pode emitir falsos negativos por assumir que qualquer `use*` é um hook.

### A2 — Dual-path de mensagens: schema `zapp.messages` vs `evo.evolution_messages`
**Arquivo:** `useMessages.ts:1`, `useMessagesCursor.ts:1`, `useInboxSource.ts:1`
**O que é:** O hook `useMessages` (legado) lê de `zapp.messages` via `messageService/messageRepository`, enquanto `useMessagesCursor` lê de `evo.evolution_messages` via `rpc_list_messages_lite`. `useInboxSource` unifica as duas fontes.
**DECISÃO (E36, 2026-08-18):** dual-path resolvido — seleção por configuração `VITE_INBOX_SOURCE_MODE` (`evo` | `zapp` | `auto`), default `auto` com fallback automático telemetrado (`source_fallback`/`source_switch` em `reconciliationTelemetry`). Ver `docs/adr/dual-path-inbox.md` e `__tests__/useInboxSource.test.tsx` (verde). Sem migração de dados nesta fase.

### A3 — Orquestradores de alta complexidade sem cobertura de testes
**Arquivo:** `useRealtimeMessages.ts` (1019 linhas), `useRealtimeInbox.ts` (513 linhas)
**O que é:** Os dois maiores arquivos do módulo, sem qualquer teste unitário no escopo deste batch (apenas testes de utilitários isolados em `realtime/__tests__/`).
**Por que importa:** São o núcleo do inbox em tempo real. Bugs neles afetam diretamente a experiência do usuário (mensagens perdidas, estado stale, renders desnecessários).

### A4 — `getRealtimeDiscardedCount()` deprecated sem remoção
**Arquivo:** `realtime/useRealtimeContacts.ts:22`
**O que é:** Função exportada com `@deprecated` que sempre retorna 0. O comentário indica que a razão foi HMR leak + múltiplas instâncias montadas simultaneamente.
**Por que importa:** Dead code público que pode confundir consumidores externos sobre como monitorar eventos descartados. A função nova `getDiscardedCount()` retornada pelo hook não foi documentada claramente.

### A5 — `playerStateStore._clear()` exposto publicamente apenas para testes
**Arquivo:** `realtime/playerStateStore.ts:70`
**O que é:** Método `_clear()` referenciado nos testes (`playerStateStore.test.ts:4`) mas não documentado na interface pública do store.
**Por que importa:** Padrão inconsistente — outros singletons (`audioPlaybackBus._reset()`, `sendStatusBus.__resetSendStatusForTest()`) usam convenção similar. Indica que esses métodos são "test-only" mas vazam para produção por ausência de mecanismo de tree-shaking condicional.

### A6 — Ausência de tipo seguro em `rpc()` de `useMessagesCursor`
**Arquivo:** `useMessagesCursor.ts:106-126`
**O que é:** Cast `supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => ...` para acessar `.abortSignal()`. Comentário documenta que é um workaround necessário para o AbortController por limitação de tipagem do SDK.
**Por que importa:** Qualquer atualização do SDK Supabase pode quebrar silenciosamente o AbortController sem erro de tipagem. Necessita revisão periódica.

### A7 — `useSipClient` persiste em `calls` sem validação de estado
**Arquivo:** `useSipClient.ts:50` (lido parcialmente)
**O que é:** Hook integra SIP.js para chamadas de voz e persiste dados em `calls`. Arquivos de teste para este hook não estão no escopo deste batch.
**Por que importa:** Integração de terceiro (SIP.js) sem testes visíveis. Falhas silenciosas na negociação WebRTC podem resultar em registros orphaned em `calls`.

### A8 — Soft cap de 500 em `useRetryResolutionAlerts` pode perder alertas
**Arquivo:** `realtime/useRetryResolutionAlerts.ts:48-57`
**O que é:** `pruneIfNeeded()` descarta os 20% mais antigos do Set quando ultrapassa 500 entradas. Em sessões longas com alto volume de retries, a deduplicação falha.
**Por que importa:** Um agente com muitas mensagens em retry poderia receber toast duplicado para o mesmo messageId após a poda do Set.

### A9 — `MARK_READ_FLUSH_MS=250` em `useConversationActions` pode deixar mensagens visualmente sem leitura
**Arquivo:** `realtime/useConversationActions.ts:26`
**O que é:** Batch de `markAsRead` tem 250ms de debounce. Se o componente desmontar antes do flush, o update não ocorre (a limpeza do useEffect cancela o timer).
**Por que importa:** Mensagens abertas brevemente podem ficar permanentemente como "não lidas" em `messages.is_read = false`.

### A10 — `inboxPresetsSync.ts` acessa `saved_filters` sem paginação
**Arquivo:** `inboxPresetsSync.ts` (lido parcialmente)
**O que é:** Sincronização de presets carrega todos os registros de `saved_filters` com `entity_type='inbox_filters'` sem limit/offset.
**Por que importa:** Se um usuário acumular muitos presets (ou se a constraint `MAX_INBOX_PRESETS=20` não for aplicada no servidor), a query pode ser cara e lenta.

---

*Runtime: NAO_VERIFICADO — nenhuma execução real foi realizada durante esta análise.*

HOOKS_A_CONCLUIDO arquivos_lidos:99
