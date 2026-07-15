# Evolution API ↔ ZAPP Web — Mapeamento Completo

> **Arquitetura atual**: Supabase Self-Hosted (`supabase.atomicabr.com.br`), schema `zapp`. Veja [../SCHEMA_REFERENCE.md](SCHEMA_REFERENCE.md).


> **Versão alvo da Evolution:** v2.x (com fallbacks específicos para v2.3.7).
> **Atualizado em:** 2026-04-25.
> **Escopo:** mapeamento bidirecional entre **(a)** os 27 eventos do webhook
> registrados na instância e **(b)** os ~111 endpoints REST proxy-ados pela
> edge `evolution-api`, indicando os hooks/handlers do front-end e do backend
> que consomem cada um.

Esta documentação é a **fonte única de verdade operacional** para responder
três perguntas:

1. *"Quando a Evolution dispara o evento X, o que acontece no ZAPP?"*
2. *"Quando o usuário clica no botão Y, qual rota da Evolution é chamada?"*
3. *"Onde mexer se o evento/endpoint Z mudar de schema na Evolution?"*

---

## 1. Arquitetura de alto nível

```
┌─────────────────────┐                ┌────────────────────┐
│  Front-end (React)  │  hook callApi  │  edge evolution-api │
│  src/hooks/evolution│ ─────────────▶ │  (proxy + auth)     │
└─────────────────────┘                └─────────┬──────────┘
                                                 │ REST
                                                 ▼
┌─────────────────────┐    HTTP webhook  ┌──────────────────┐
│ edge evolution-     │ ◀───────────────│  Evolution API   │
│ webhook (HMAC)      │   27 eventos     │  v2.x            │
└─────────┬───────────┘                  └──────────────────┘
          │ INSERT/UPDATE
          ▼
┌─────────────────────┐                ┌────────────────────┐
│ FATOR X (externo)   │  realtime      │  Front-end inbox   │
│ evolution_*         │ ─────────────▶ │  (subscribe)       │
└─────────────────────┘                └────────────────────┘
```

- **Saída (front → Evolution):** `useEvolutionApi*` → `callApi(action, body)`
  → edge `evolution-api/index.ts` → REST `/message/*`, `/chat/*`,
  `/instance/*`, `/group/*`.
- **Entrada (Evolution → front):** Evolution → POST `/evolution-webhook`
  (HMAC) → roteador `evolution-webhook/index.ts` → handlers em
  `_shared/evolution-webhook-*.ts` → tabelas `evolution_*` (via FATOR X)
  → realtime → React Query/Zustand → UI.

---

## 2. Eventos do Webhook (entrada)

Lista canônica registrada em `WEBHOOK_EVENTS` (`supabase/functions/_shared/evolution-sync-actions.ts`).
Todos os 27 são roteados em `supabase/functions/evolution-webhook/index.ts`.

| # | Evento Evolution            | Normalizado     | Handler / Local                                                                  | Tabela impactada                       | UI / Hook reativo                                |
|---|-----------------------------|-----------------|----------------------------------------------------------------------------------|----------------------------------------|--------------------------------------------------|
| 1 | `APPLICATION_STARTUP`       | `application.startup` | `handleApplicationStartup` (`evolution-webhook-handlers.ts`)               | `whatsapp_connections.status`          | `useEvolutionInstance`                          |
| 2 | `QRCODE_UPDATED`            | `qrcode.updated`      | inline (router)                                                            | `whatsapp_connections.qr_code`         | `QRCodeDisplay`                                  |
| 3 | `CONNECTION_UPDATE`         | `connection.update`   | `handleConnectionUpdate`                                                   | `whatsapp_connections.status`          | `useChannelHealth`, banner do header             |
| 4 | `LOGOUT_INSTANCE`           | `logout.instance`     | `handleLogoutInstance`                                                     | `whatsapp_connections.status='logged_out'` | `useChannelHealth`                            |
| 5 | `MESSAGES_SET`              | `messages.set`        | `handleMessagesSet` (`evolution-webhook-msg-handlers.ts`)                  | `evolution_messages` (bulk insert)     | inbox initial sync                               |
| 6 | `MESSAGES_UPSERT`           | `messages.upsert`     | inline + `handleIncomingMessage` / `handleOutgoingWhatsAppMessage`         | `evolution_messages`, `evolution_contacts` | `useMessages`, `useConversations`            |
| 7 | `MESSAGES_UPDATE`           | `messages.update`     | `handleMessagesUpdate`                                                     | `evolution_messages.status` (ACK)      | `MessageStatusIcon` em `MessageBubble`           |
| 8 | `MESSAGES_DELETE`           | `messages.delete`     | `handleMessagesDelete`                                                     | `evolution_messages.is_deleted=true`   | bolha "Mensagem apagada"                         |
| 9 | `MESSAGES_EDITED`           | `messages.edited`     | `handleMessagesEdited`                                                     | `evolution_messages.content`+`is_edited`| `MessageBubble` (badge "editada")               |
| 10 | `SEND_MESSAGE`             | `send.message`        | `handleSendMessage`                                                        | confirma `external_id` da pendente     | remove "enviando" do `MessageStatusInline`       |
| 11 | `CONTACTS_SET`             | `contacts.set`        | `handleContactsSet`                                                        | `evolution_contacts` (bulk)            | `useContacts`                                    |
| 12 | `CONTACTS_UPSERT`          | `contacts.upsert`     | `handleContactsUpsert`                                                     | `evolution_contacts` (push name, foto) | `ContactCard`, `ChatHeader`                      |
| 13 | `CONTACTS_UPDATE`          | `contacts.upsert`*    | reusa `handleContactsUpsert`                                               | idem                                   | idem                                              |
| 14 | `PRESENCE_UPDATE`          | `presence.update`     | `handlePresenceUpdate`                                                     | `evolution_contacts.is_typing` / online| `TypingIndicator`, presence dot                  |
| 15 | `CHATS_SET`                | `chats.set`           | `handleChatsSet`                                                           | `evolution_conversations`              | inbox first paint                                |
| 16 | `CHATS_UPSERT`             | `chats.upsert`        | `handleChatsUpdate` (compartilhado)                                        | `evolution_conversations`, unread      | `ConversationListItem` badge                     |
| 17 | `CHATS_UPDATE`             | `chats.update`        | `handleChatsUpdate`                                                        | `unreadCount=0` → marca lidas          | zera badge no `ConversationListItem`             |
| 18 | `CHATS_DELETE`             | `chats.delete`        | `handleChatsDelete`                                                        | `evolution_conversations` (soft)       | esconde da lista                                  |
| 19 | `GROUPS_UPSERT`            | `groups.upsert`       | `handleGroupsUpsert`                                                       | `evolution_contacts` (group)           | `GroupChatTab`                                    |
| 20 | `GROUP_UPDATE`             | `group.update`        | `handleGroupsUpsert`                                                       | metadados de grupo                     | `GroupHeader`                                     |
| 21 | `GROUP_PARTICIPANTS_UPDATE`| `group.participants.update` | `handleGroupParticipantsUpdate`                                      | participantes / cargos                 | `GroupMembersDialog`                              |
| 22 | `LABELS_EDIT`              | `labels.edit`         | `handleLabelsEdit`                                                         | `evolution_tags`                       | `TagManager`                                      |
| 23 | `LABELS_ASSOCIATION`       | `labels.association`  | `handleLabelsAssociation`                                                  | tag ↔ contato                          | chips no `ContactCard`                            |
| 24 | `CALL`                     | `call`                | `handleCallEvent`                                                          | `evolution_calls`                      | `IncomingCallToast`, `useCallHistory`             |
| 25 | `NEW_JWT_TOKEN`            | `new.jwt.token`       | (no-op, registrado para futuro)                                            | —                                      | —                                                 |
| 26 | `TYPEBOT_START`            | `typebot.start`       | (no-op + audit)                                                            | —                                      | `TypebotPanel`                                    |
| 27 | `TYPEBOT_CHANGE_STATUS`    | `typebot.change.status` | (no-op + audit)                                                          | —                                      | `TypebotPanel`                                    |

\* `contacts.update` é normalizado em `contacts.upsert` pelo router.

### Mapeamento ACK (`MESSAGES_UPDATE`)

`handleMessagesUpdate` (`_shared/evolution-webhook-msg-handlers.ts`) usa o mapa:

| Evolution / Baileys | ZAPP `messages.status` | UI                                  |
|---------------------|------------------------|-------------------------------------|
| `PENDING` (0)       | `sending`              | `Clock` cinza pulsante              |
| `SERVER_ACK` (1)    | `sent`                 | `Check`                             |
| `DELIVERY_ACK` (2)  | `delivered`            | `CheckCheck` cinza                  |
| `READ` / `READ_ACK` (3) | `read`             | `CheckCheck` azul (`text-info`)     |
| `PLAYED` / `PLAYED_ACK` (4) | `played`       | `Headphones` azul (áudio ouvido)    |
| `ERROR`             | `failed`               | `AlertCircle` vermelho              |

A precedência é controlada por `STATUS_PRIORITY` em
`_shared/evolution-helpers.ts` (`sending<sent<delivered<read=played<failed`),
impedindo downgrades acidentais.

### Defesas e resiliência do webhook

- **HMAC** (`hmac-validation.ts`) com `EVOLUTION_WEBHOOK_SECRET`.
- **Idempotência** via hash `sha256(instance|event|body)` em `webhook_events_processed`.
- **Pause guard** (`isInstancePaused`) descarta eventos com 503 quando a
  instância foi pausada manualmente ou por auth-fail.
- **Auditoria** (`auditWebhookEvent`) grava `processed | duplicate | rejected | error`.
- **Broadcast defense** (`status@broadcast`, `*@broadcast`) bloqueada em
  3 camadas (adapter, hook, realtime). Ver `mem://features/inbox/broadcast-defense`.

---

## 3. Endpoints REST (saída)

A edge `supabase/functions/evolution-api/index.ts` expõe um único POST com
`{ action, ...body }` e roteia para a Evolution. Total: **111 actions**.

### 3.1 Instância

| Action               | Método | Endpoint Evolution                        | Hook front                             |
|----------------------|--------|-------------------------------------------|----------------------------------------|
| `create-instance`    | POST   | `/instance/create`                        | `useEvolutionInstance.createInstance` |
| `list-instances`     | GET    | `/instance/fetchInstances`                | `useEvolutionInstance.listInstances`  |
| `connect-instance`   | GET    | `/instance/connect/{instance}`            | `useEvolutionInstance.connect` (com auto-create) |
| `connection-state`   | GET    | `/instance/connectionState/{instance}`    | `useChannelHealth`                     |
| `instance-info`      | GET    | `/instance/info/{instance}`               | `InstanceSettingsPanel`                |
| `restart-instance`   | PUT    | `/instance/restart/{instance}`            | `useEvolutionInstance.restart`         |
| `logout-instance`    | DELETE | `/instance/logout/{instance}`             | `useEvolutionInstance.logout`          |
| `delete-instance`    | DELETE | `/instance/delete/{instance}`             | `useEvolutionInstance.delete`          |
| `set-presence`       | POST   | `/instance/setPresence/{instance}`        | `usePresence.setGlobalPresence`        |

### 3.2 Mensageria

| Action               | Método | Endpoint Evolution                              | Hook front                                |
|----------------------|--------|-------------------------------------------------|-------------------------------------------|
| `send-text`          | POST   | `/message/sendText/{instance}`                  | `useEvolutionMessaging.sendTextMessage` (suporta `linkPreview`, `mentioned`, `mentionsEveryOne`, `quoted`, `delay`) |
| `send-media`         | POST   | `/message/sendMedia/{instance}`                 | `sendMediaMessage` (image/video/document) |
| `send-audio`         | POST   | `/message/sendWhatsAppAudio/{instance}`         | `sendAudioMessage` (PTT)                  |
| `send-sticker`       | POST   | `/message/sendSticker/{instance}`               | `sendStickerMessage`                      |
| `send-location`      | POST   | `/message/sendLocation/{instance}`              | `sendLocationMessage` (`LocationPicker`)  |
| `send-contact`       | POST   | `/message/sendContact/{instance}`               | `sendContactMessage`                      |
| `send-reaction`      | POST   | `/message/sendReaction/{instance}`              | `sendReaction` (emoji bar do bubble)      |
| `send-poll`          | POST   | `/message/sendPoll/{instance}`                  | `sendPoll`                                |
| `send-list`          | POST   | `/message/sendList/{instance}`                  | `sendListMessage`                         |
| `send-buttons`       | POST   | `/message/sendButtons/{instance}`               | `sendButtonsMessage`                      |
| `send-status`        | POST   | `/message/sendStatus/{instance}`                | `sendStatus` (Stories)                    |
| `send-template`      | POST   | `/message/sendTemplate/{instance}`              | `sendTemplate` (WABA)                     |
| `send-ptv`           | POST   | `/message/sendPtv/{instance}`                   | `sendPtv` (vídeo redondo)                 |
| `send-chat-presence` | POST   | `/chat/sendPresence/{instance}`                 | `useTypingIndicator`                      |
| `mark-read`          | POST   | `/chat/markMessageAsRead/{instance}`            | `useReadReceipts`                         |
| `mark-unread`        | POST   | `/chat/markMessageAsUnread/{instance}`          | `useReadReceipts`                         |
| `archive-chat`       | POST   | `/message/archiveChat/{instance}`               | `useConversationActions.archive`          |
| `delete-message`     | DELETE | `/message/delete/{instance}`                    | `MessageContextActions` ("Apagar para mim") |
| `delete-for-everyone`| DELETE | `/chat/deleteMessageForEveryone/{instance}`     | `MessageContextActions` ("Apagar para todos") |
| `update-message`     | PUT    | `/message/update/{instance}`                    | `editMessage`                             |
| `edit-message`       | PUT    | `/chat/updateMessage/{instance}`                | alias mais novo (v2.3+)                   |

### 3.3 Chats / Contatos / Mídia

| Action                  | Método | Endpoint                                          | Hook front                                |
|-------------------------|--------|---------------------------------------------------|-------------------------------------------|
| `find-chats`            | POST   | `/chat/findChats/{instance}`                      | `useEvolutionIntegrations.findChats` (fallback v2.3.7 → `rpc_list_conversations`) |
| `find-messages`         | POST   | `/chat/findMessages/{instance}`                   | `findMessages`                            |
| `find-status-messages`  | POST   | `/chat/findMessages/{instance}` (filtro status@broadcast) | `findStatusMessages`             |
| `find-contacts`         | POST   | `/chat/findContacts/{instance}`                   | `findContacts` (fallback → `rpc_list_contacts`) |
| `fetch-profile`         | GET    | `/chat/fetchProfile/{instance}`                   | `fetchProfile` (fallback → `rpc_get_contact`) |
| `fetch-profile-picture` | GET    | `/chat/fetchProfilePictureUrl/{instance}`         | `fetchProfilePicture`                     |
| `fetch-business-profile`| POST   | `/chat/fetchBusinessProfile/{instance}`           | `fetchBusinessProfile`                    |
| `check-numbers`         | POST   | `/chat/whatsappNumbers/{instance}`                | `checkWhatsAppNumbers`                    |
| `get-media-base64`      | POST   | `/chat/getBase64FromMediaMessage/{instance}`      | `getMediaBase64` (usado por `useMediaRefresh` para auto-refresh de 410/403) |
| `update-block-status`   | POST   | `/chat/updateBlockStatus/{instance}`              | `BlockContactDialog`                      |

### 3.4 Labels / Tags

| Action          | Método | Endpoint                                  | Hook                                  |
|-----------------|--------|-------------------------------------------|---------------------------------------|
| `find-labels`   | GET    | `/label/findLabels/{instance}`            | `findLabels` → `TagManager`           |
| `handle-label`  | POST   | `/label/handleLabel/{instance}`           | `handleLabel` (add/remove)            |

### 3.5 Grupos

| Action                       | Método | Endpoint                                              | Hook                                       |
|------------------------------|--------|-------------------------------------------------------|--------------------------------------------|
| `list-groups`                | GET    | `/group/fetchAllGroups/{instance}`                    | `useEvolutionGroups.listGroups`            |
| `group-info`                 | GET    | `/group/findGroupInfos/{instance}`                    | `getGroupInfo`                             |
| `group-participants`         | GET    | `/group/participants/{instance}`                      | `getGroupParticipants`                     |
| `update-group-participants`  | POST   | `/group/updateParticipant/{instance}`                 | `updateGroupParticipants`                  |
| `update-group-setting`       | POST   | `/group/updateSetting/{instance}`                     | `updateGroupSetting` (announcement, locked)|
| `group-invite-code`          | GET    | `/group/inviteCode/{instance}`                        | `getGroupInviteCode`                       |
| `revoke-invite-code`         | POST   | `/group/revokeInviteCode/{instance}`                  | `revokeInviteCode`                         |
| `invite-info`                | GET    | `/group/inviteInfo/{instance}`                        | `getInviteInfo`                            |
| `accept-invite-code`         | GET    | `/group/acceptInviteCode/{instance}`                  | `acceptInvite`                             |
| `leave-group`                | DELETE | `/group/leaveGroup/{instance}`                        | `leaveGroup`                               |
| `toggle-ephemeral`           | POST   | `/group/toggleEphemeral/{instance}`                   | `toggleEphemeral`                          |

### 3.6 Integrações (chatbots, filas, observabilidade)

| Categoria       | Ações `set-*` / `get-*` / `start-*`                                                | Hook em `useEvolutionIntegrations` |
|-----------------|-------------------------------------------------------------------------------------|-------------------------------------|
| Chatwoot        | `set-chatwoot`, `get-chatwoot`                                                      | `setChatwoot`, `getChatwoot`        |
| Typebot         | `set-typebot`, `get-typebot`, `start-typebot`, `typebot-sessions`, `typebot-change-status` | `setTypebot`, `startTypebot`, …  |
| OpenAI          | `set-openai`, `get-openai`, `set-openai-default`, `openai-sessions`                 | `setOpenAI`, …                      |
| Dify            | `set-dify`, `get-dify`, `set-dify-default`, `dify-sessions`, `dify-change-status`   | `setDify`, …                        |
| Flowise         | `set-flowise`, `get-flowise`, `flowise-sessions`, `flowise-change-status`           | `setFlowise`, …                     |
| Evolution Bot   | `set-evolution-bot`, `get-evolution-bot`, `evolution-bot-sessions`                  | `setEvolutionBot`, …                |
| Evo AI          | `set-evoai`, `get-evoai`, `evoai-sessions`, `evoai-change-status`                   | `setEvoAI`, …                       |
| n8n             | `set-n8n`, `get-n8n`, `n8n-sessions`, `n8n-change-status`                           | `setN8N`, …                         |
| RabbitMQ        | `set-rabbitmq`, `get-rabbitmq`                                                      | `setRabbitMQ`, `getRabbitMQ`        |
| SQS             | `set-sqs`, `get-sqs`                                                                | `setSQS`, `getSQS`                  |
| Kafka           | `set-kafka`, `get-kafka`                                                            | `setKafka`, `getKafka`              |
| NATS            | `set-nats`, `get-nats`                                                              | `setNats`, `getNats`                |
| Pusher          | `set-pusher`, `get-pusher`                                                          | `setPusher`, `getPusher`            |
| Webhook (instância) | `set-webhook`, `get-webhook`                                                    | `setWebhook` (interno)              |
| Templates (WABA)| `find-templates`, `create-template`                                                 | `findTemplates`, `createTemplate`   |
| Catálogo / Coleções | `get-catalog`, `get-collections`                                                | `getCatalog`, `getCollections`      |
| Proxy           | `set-proxy`, `get-proxy`                                                            | `setProxy`, `getProxy`              |
| Settings        | `set-settings`, `get-settings`                                                      | `setSettings`, `getSettings`        |
| Calls           | `offer-call`                                                                        | `offerCall`                         |

> A lista completa de actions está em
> `supabase/functions/evolution-api/index.ts` (~111 entradas).
> Sempre que for adicionar uma nova: **(1)** adicionar a action no roteador,
> **(2)** expor via hook em `src/hooks/evolution/*`, **(3)** atualizar este
> documento.

---

## 4. Pipeline de envio (deep dive)

```
ChatInputArea ──▶ useEvolutionMessaging.sendTextMessage
                ├─ optimistic insert (status='sending')
                ├─ callApi('send-text', { ...SendTextOptions })
                │     └─▶ edge `/message/sendText/{instance}`
                │           └─▶ Evolution → device → WhatsApp
                ├─ resposta { key.id } → UPDATE local set external_id
                └─ webhook `SEND_MESSAGE` chega depois → confirma 'sent'
                   webhook `MESSAGES_UPDATE` → ACK real (delivered/read/played)
```

Detalhes complementares estão em:

- `mem://architecture/messaging/delivery-and-fallback-system.md`
- `mem://performance/inbox/chat-input-optimization`
- `mem://architecture/messaging/whatsapp-media-decryption`

### Auto-refresh de mídia (410/403)

`useMediaRefresh` chama `getMediaBase64` quando o `<audio>`/`<img>`/`<video>`
sinaliza expiração da URL assinada do WhatsApp e re-hidrata o player sem
reload (`mem://architecture/storage-buckets`).

---

## 5. Fallbacks v2.3.7

`src/hooks/evolution/v237Fallbacks.ts` envolve `findChats`, `findContacts` e
`fetchProfile` com `withV237Fallback`. Quando a Evolution v2.3.7 retorna
`404 / 405 / 501` ou `{ error: 'not_found' }`, o hook redireciona para RPCs
do FATOR X:

| Endpoint Evolution            | RPC FATOR X de fallback        |
|-------------------------------|--------------------------------|
| `/chat/findChats/{instance}`  | `rpc_list_conversations`       |
| `/chat/findContacts/{instance}` | `rpc_list_contacts`         |
| `/chat/fetchProfile/{instance}` | `rpc_get_contact`           |

Comportamento testado em `src/hooks/evolution/__tests__/v237Fallbacks.test.ts`
(32 cenários).

---

## 6. Como adicionar um novo evento ou endpoint

1. **Endpoint (saída):** adicionar `if (action === '…')` em
   `evolution-api/index.ts`, expor via hook em `src/hooks/evolution/*` e
   tipar parâmetros em `evolutionApi.types.ts`.
2. **Evento (entrada):**
   - Adicionar no `WEBHOOK_EVENTS` (`evolution-sync-actions.ts`) em UPPER_SNAKE.
   - Rotear em `evolution-webhook/index.ts` (forma normalizada `lower.dot`).
   - Implementar handler em `_shared/evolution-webhook-*.ts` usando
     `getConnectionByInstance`, `resolveEventJid`, `normalizePhone`,
     `shouldUpdateStatus`.
   - Cobrir com teste Deno em `_shared/__tests__/`.
   - Atualizar `evolution-webhook/__tests__/contract.test.ts` (lista de
     eventos críticos).
3. **Documentação:** atualizar este arquivo + a memória correspondente
   (`mem://integrations/evolution-api`).

---

## 7. Arquivos de referência

| Camada        | Arquivos                                                                 |
|---------------|--------------------------------------------------------------------------|
| Edge proxy    | `supabase/functions/evolution-api/index.ts`                              |
| Edge webhook  | `supabase/functions/evolution-webhook/index.ts`                          |
| Handlers      | `supabase/functions/_shared/evolution-webhook-handlers.ts`               |
|               | `supabase/functions/_shared/evolution-webhook-msg-handlers.ts`           |
|               | `supabase/functions/_shared/evolution-webhook-messages.ts`               |
| Helpers       | `supabase/functions/_shared/evolution-helpers.ts`                        |
|               | `supabase/functions/_shared/evolution-media.ts`                          |
| Sync / setup  | `supabase/functions/_shared/evolution-sync-actions.ts` (`WEBHOOK_EVENTS`)|
| Hooks         | `src/hooks/evolution/useEvolutionMessaging.ts`                           |
|               | `src/hooks/evolution/useEvolutionInstance.ts`                            |
|               | `src/hooks/evolution/useEvolutionIntegrations.ts`                        |
|               | `src/hooks/evolution/useEvolutionGroups.ts`                              |
|               | `src/hooks/evolution/v237Fallbacks.ts`                                   |
| Adapter       | `src/adapters/evolutionAdapter.ts` (extractor universal de 18 messageTypes) |
| UI status     | `src/components/inbox/MessageStatus.tsx`                                 |
|               | `src/components/inbox/chat/messageUtils.tsx`                             |
|               | `src/components/inbox/chat/MessageBubbleUnsupported.tsx`                 |
| Auto-refresh  | `src/hooks/useMediaRefresh.ts`                                           |
| JID helpers   | `src/lib/jid.ts`                                                         |

---

## 8. Healthchecks operacionais

- `rpc_dashboard_home('wpp2', null)` — KPIs em tempo real.
- `fn_zapp_web_smoke_test_v2()` — 20 checagens de integridade.
- `v_webhook_health` — SLA de processamento por janela.
- `evolution_audit_log` — últimas ações por entidade.
- Webhook live: `https://tdprnylgyrogbbhgdoik.supabase.co/functions/v1/evolution-webhook`
  (instância `wpp2`, latência média 0.35s, 0 erros em 132k+ eventos).
