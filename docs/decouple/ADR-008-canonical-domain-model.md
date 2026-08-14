# ADR-008 — Modelo Canônico de Domínio

**Data:** 2026-08-14 · **Status:** Aceito (Accepted) · **Etapas:** E23-E30 do Plano 100 (V2: E45-E48)

## Contexto

O modelo canônico atual do sistema **É** o modelo da Evolution API (Baileys):
`remote_jid`, `instance_name`, `from_me`, `push_name`, `message_type` Baileys
são o vocabulário do domínio. Trocar de provider significa reescrever o domínio.
O `whatsapp-cloud-normalizer.ts` normalizava Meta → Evolution, em vez de ambos
normalizarem para um modelo neutro.

## Decisão

Criar tipos canônicos de mensageria em `src/domain/messaging/types.ts`
(re-exportados por `src/domain/messaging/index.ts`), neutros de provider:
**sem** `remote_jid`, `instance_name`, `from_me`, `wamid` ou `wa_id` na superfície
do domínio. Adapters e normalizers (Evolution, Cloud) traduzem de/para o canônico.

**NÃO renomear** tabelas `evolution_*` nem o schema `evo` — custo/risco
desproporcional (193 tabelas evo, 23+ partições, 900 migrations). A neutralidade
vive no modelo de domínio e na fronteira de adapters, não no banco físico.

## Modelo canônico (código real — `src/domain/messaging/types.ts`)

| Tipo | Forma | Papel |
|---|---|---|
| `ChannelAddress` | `{ channel: 'whatsapp'\|'instagram'\|'telegram'\|string; address: string }` | Substitui `remote_jid` no domínio (E24) |
| `ChannelAccount` | `{ id: string; provider: 'evolution'\|'cloud'\|string; externalRef: string }` | Substitui `instance_name` no domínio (E25) |
| `CanonicalMessageType` | `'text'\|'image'\|'video'\|'audio'\|'document'\|'sticker'\|'location'\|'contact'\|'reaction'\|'interactive'\|'template'\|'unknown'` | Tipo de mensagem canônico (E26) |
| `DeliveryStatus` | `'pending'\|'sent'\|'delivered'\|'read'\|'failed'\|'unknown'` | Status de entrega canônico (E27) |
| `ChannelMessage` | `{ id; externalId?; from: ChannelAddress; to: ChannelAddress; account: ChannelAccount; type; content; mediaUrl?; mediaMimetype?; status; fromMe: boolean; timestamp: Date; metadata? }` | Mensagem canônica (E23) |
| `ChannelContact` | `{ id?; address: ChannelAddress; displayName?; avatarUrl?; provider: string; externalRef: string }` | Contato canônico (E23) |
| `ChannelConversation` | `{ id?; contact: ChannelContact; account: ChannelAccount; lastMessageAt?; unreadCount?; metadata? }` | Conversa canônica (E23) |
| `ProviderCapabilities` | `{ sticker; reaction; presence; template; interactive; voiceCall: boolean }` | Declara suporte do provider (E29) |

Constantes de mapeamento no mesmo arquivo: `BAILEYS_TO_CANONICAL`,
`META_TO_CANONICAL`, `EVOLUTION_ACK_TO_STATUS` (ACK `-1→failed`, `0→pending`,
`1→sent`, `2→delivered`, `3/4→read`) e `EVOLUTION_CAPABILITIES` /
`CLOUD_CAPABILITIES`.

## Mapeamento de MessageType canônico ↔ providers

| Canônico | Baileys (Evolution) | Meta (WhatsApp Cloud) |
|---|---|---|
| `text` | `conversation`, `extendedTextMessage` | `text` |
| `image` | `imageMessage` | `image` |
| `video` | `videoMessage` | `video` |
| `audio` | `audioMessage` | `audio` |
| `document` | `documentMessage` | `document` |
| `sticker` | `stickerMessage` | `sticker` |
| `location` | `locationMessage` | `location` |
| `contact` | `contactMessage` | `contacts` |
| `reaction` | `reactionMessage` | `reaction` |
| `interactive` | `buttonsMessage`, `listMessage` | `interactive` |
| `template` | `templateMessage` | `template` |
| `unknown` | demais/ausentes | demais/ausentes |

## Normalizers (fronteira de provider)

- `supabase/functions/_shared/evolution-normalizer.ts` (E47) — converte payloads
  Baileys/Evolution (`BaileysMessage` com `key.remoteJid`, `pushName`,
  `messageType`) para o canônico via `baileysMsgType()` / `BAILEYS_TO_CANONICAL`.
  Fora deste arquivo, nomes Baileys não vazam.
- `supabase/functions/_shared/whatsapp-cloud-normalizer.ts` (E48/R1) — converte
  webhooks Meta (`NormalizedIncoming`/`NormalizedStatus`) para o modelo canônico.
- `supabase/functions/_shared/domain/messaging.ts` (E45) — espelho Deno do
  `types.ts`, mantido em sync manual ("se alterar um, altere o outro").

## Mapa resumido: coluna Postgres ↔ campo canônico

| Tabela (`evo.*` / view `zapp.*`) | Coluna | Campo canônico |
|---|---|---|
| `evolution_messages` | `message_id` (ou `whatsapp_message_id`/`external_id`) | `ChannelMessage.externalId` |
| `evolution_messages` | `remote_jid` | `from`/`to` → `ChannelAddress.address` |
| `evolution_messages` | `instance_name` | `account` → `ChannelAccount.externalRef` |
| `evolution_messages` | `from_me` | `ChannelMessage.fromMe` |
| `evolution_messages` | `message_type` | `ChannelMessage.type` |
| `evolution_messages` | `content` / `caption` | `ChannelMessage.content` |
| `evolution_messages` | `media_url`, `media_mimetype` | `mediaUrl`, `mediaMimetype` |
| `evolution_messages` | `status`, `status_at` | `DeliveryStatus` + timestamp |
| `evolution_contacts` | `remote_jid` | `ChannelContact.address.address` |
| `evolution_contacts` | `phone_number` | `ChannelContact.address.address` (E.164) |
| `evolution_contacts` | `pushname` | `ChannelContact.displayName` |
| `evolution_conversations` | `remote_jid`, `contact_id`, `status`, `assigned` | `ChannelConversation.contact`/metadata |

## Consequências

- Novos features usam `ChannelMessage`, `ChannelContact`, `ChannelConversation`;
  código legado (`evolutionAdapter.ts`, E37 — 96 dependências) coexiste até migrar.
- Gate CI futuramente proíbe imports de `@/types/evolutionExternal` fora de
  adapters (E38); guardrails ESLint já proíbem `.schema('evo')` em leituras
  PostgREST (Invariante 1).
- **Fronteira lógica (métrica 4 do plano V3)** — o desacoplamento é garantido por
  4 portas, não por renomeação física: (1) **front adapter**
  (`src/integrations/supabase/rowNormalizers.ts` + adapters no front);
  (2) **edge client** (`supabase/functions/_shared/` normalizers + domínio Deno);
  (3) **ingest-port** (edge functions de ingestão de webhook Evolution/Cloud);
  (4) **resolvers SQL** `ops.fn_evo_url` / `ops.fn_evo_key` (única camada que
  conhece a topologia física do provider).
- Migração é incremental; tabelas `evolution_*` permanecem como armazenamento
  físico sob as views `zapp.*`.

## Divergências registradas (código × ADR)

- O tipo de mensagem canônico chama-se **`CanonicalMessageType`** no código
  (não `MessageType`); `DeliveryStatus` existe só no `types.ts` do src.
- O espelho Deno (`_shared/domain/messaging.ts`) diverge do src: usa
  `CanonicalMessage`/`CanonicalContact`/`CanonicalDeliveryStatus` com
  `'queued'` (src: `'pending'`/`'unknown'`), não tem `ChannelConversation` e tem
  `ProviderCapabilities` com outra forma (`sendText`, `sendMedia`, `qrCode`...).
  Sync manual E45 — revisar na próxima onda.
