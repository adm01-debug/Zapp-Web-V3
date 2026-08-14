# Mapa de Colunas Canônicas — zapp.evolution_* ↔ Domínio Canônico de Messaging

> **Alvo no repo:** `docs/decouple/CANONICAL_COLUMN_MAP.md` (zapp-web-v3, adm01-debug)
> **Estado:** pós-desacoplamento (2026-08-13) — 74 tabelas em `zapp.evolution_*`; domínio canônico em `src/domain/messaging/`.
> **Colunas verificadas ao vivo** via `information_schema.columns` (schema `zapp`, 2026-08-14). ⚠️ = campo SEM correspondente canônico ainda (dívida).

## Fontes do contrato canônico
| Fonte | Papel |
|---|---|
| `src/domain/messaging/types.ts` (E23–E29) | Contrato canônico TS do app: `ChannelMessage`, `ChannelContact`, `ChannelConversation`, `ChannelAddress`, `ChannelAccount`, `CanonicalMessageType`, `DeliveryStatus`, `BAILEYS_TO_CANONICAL`, `META_TO_CANONICAL`, `EVOLUTION_ACK_TO_STATUS` |
| `supabase/functions/_shared/domain/messaging.ts` (E45) | Espelho Deno (sync manual): `CanonicalMessage`, `CanonicalContact`, `CanonicalDeliveryStatus` |
| `supabase/functions/_shared/evolution-normalizer.ts` (E47) | Baileys/Evolution → canônico (`normalizeBaileysMessage/Contact`) |
| `supabase/functions/_shared/whatsapp-cloud-normalizer.ts` (E48) | Meta Cloud → `NormalizedIncoming`/`NormalizedStatus` (pré-canônico) |

## 1. `zapp.evolution_messages` (particionada por instância; partição ativa `evolution_messages_wpp2`)

| Coluna (tipo real) | Campo canônico | Tipo canônico | Observação |
|---|---|---|---|
| `id` (uuid) | `id` | string | PK interna. ⚠️ id de domínio real é `externalId` (`message_id`) |
| `message_id` (text) | `externalId` | string | wamid (Meta) / Baileys `key.id` (Evolution) |
| `remote_jid` (text) | `from.address` (inbound) / `to.address` (outbound) | `ChannelAddress{channel:'whatsapp', address}` | JID completo (`…@s.whatsapp.net`, `@g.us`, `@lid`); phone via `normalizeJid` |
| `from_me` (bool) | `direction` / `fromMe` | `'inbound'\|'outbound'` (Deno) / bool (TS) | `from_me=true` ⇒ outbound |
| `direction` (varchar) | `direction` | `'inbound'\|'outbound'` | redundante com `from_me` (dupla fonte de verdade) |
| `message_type` (varchar) | `type` | `CanonicalMessageType` | via `BAILEYS_TO_CANONICAL` / `META_TO_CANONICAL` |
| `content` (text) | `content` | string | normalizers fundem `caption` em `content` |
| `caption` (text) | `content` (parcial) | string | ⚠️ sem campo dedicado (perde distinção texto×legenda) |
| `media_url` (text) | `mediaUrl` | string | URL assinada / storage |
| `media_mimetype` (text) | `mediaMimetype` | string | |
| `media_type` (text) | `type` (parcial) | `CanonicalMessageType` | ⚠️ redundante com `message_type` |
| `media_path` (text) | — | — | ⚠️ dívida: path S3/R2 interno, sem equivalente canônico |
| `media_status` (text) | — | — | ⚠️ dívida: estado download/fetch da mídia |
| `media_bucket`, `media_sha256`, `media_size`, `media_filename`, `media_meta` | — | — | ⚠️ dívida (grupo `metadata.media*`) |
| `status` (varchar) | `status` | `DeliveryStatus` | `EVOLUTION_ACK_TO_STATUS` / `baileysStatus`; ⚠️ valores legados não-enum no banco |
| `status_at` (timestamptz) | — | — | ⚠️ dívida |
| `created_at` (timestamptz) | `timestamp` | `Date` (TS) / unix `number` (Deno) | "timestamp/created_at" do brief = `created_at` |
| `instance_name` (varchar) | `account` | `ChannelAccount{id, provider, externalRef}` | "instance" do brief; `provider` (do brief) = `account.provider` derivado da instância |
| `push_name` (text) | `pushName` | string | só no espelho Deno |
| `contact_id` (uuid) | — | — | ⚠️ dívida: canônico resolve contato via `from.address`, sem FK |
| `conversation_id` (uuid) | — | — | ⚠️ dívida |
| `quoted_message_id` (text) | `quotedId` | string | ⚠️ só no espelho Deno |
| `payload` / `raw_data` (jsonb) | `raw` | unknown | payload bruto do provider |
| `tags`, `notes`, `category`, `sentiment`, `is_starred`, `is_important`, `follow_up_at`, `follow_up_done` | `metadata` (candidato) | `Record<string, unknown>` | ⚠️ dívida |
| `sent_by_bot`, `template_name`, `link_preview`, `is_read`, `reply_to_id`, `audio_meme_id`, `sticker_id` | `metadata` (candidato) | `Record<string, unknown>` | ⚠️ dívida |
| `transcription_status`, `transcription` | `metadata` (candidato) | `Record<string, unknown>` | ⚠️ dívida |
| `error_code`, `error_reason`, `retry_attempt`, `retry_total` | `metadata` (candidato) | `Record<string, unknown>` | ⚠️ dívida (entrega) |
| `deleted_at`, `edited_at`, `updated_at`, `ingest_meta`, `remote_jid_original` | — | — | ⚠️ dívida (auditoria/ingestão) |
| `contact_name` (do brief) | `pushName` / `displayName` | string | ⚠️ não existe como coluna física — derivado (join `contacts.full_name` ou webhook) |

## 2. `zapp.evolution_contacts`

| Coluna (tipo real) | Campo canônico | Tipo canônico | Observação |
|---|---|---|---|
| `id` (uuid) | `ChannelContact.id` | string | ⚠️ espelho Deno `CanonicalContact` não tem `id` |
| `remote_jid` (varchar) | `address` | `ChannelAddress{channel:'whatsapp', address: remote_jid}` | caso-exemplo do brief |
| `phone_number` (text) | ⚠️ `phone` — campo NÃO existe no contrato TS E23 (`ChannelContact` atual não tem `phone`) | string (E.164 sem `+`) | derivável de `address.address` (dígitos de `normalizeJid`); corrigir doc OU adicionar `phone` ao TS |
| `instance_name` (varchar) | `account` | `ChannelAccount{id, provider:'evolution', externalRef}` | |
| `push_name` (varchar) | `pushName` | string | |
| `full_name` (varchar) | `displayName` | string | ⚠️ `ChannelContact.displayName` existe no TS, mas normalizer não preenche (usa `pushName`) |
| `profile_picture_url` (text) | `profilePicUrl` / `avatarUrl` | string | ⚠️ nomes divergem entre espelhos (Deno × TS) |
| `first_name`, `last_name`, `nickname` | — | — | ⚠️ dívida |
| `email`, `company`, `role_title`, `lead_status`, `lead_source`, `lead_score` | — | — | ⚠️ dívida (CRM/enriquecimento) |
| `whatsapp_labels`, `tags` | — | — | ⚠️ dívida |
| `assigned_to` (varchar) | — | — | ⚠️ dívida (agente; RLS depende) |
| `first_contact_at`, `last_message_at`, `total_messages`, `total_purchases`, `message_count` | — | — | ⚠️ dívida (métricas desnormalizadas) |
| `notes` | — | — | ⚠️ dívida |
| `presence_status`, `last_seen_at`, `last_presence_at`, `is_on_whatsapp`, `whatsapp_checked_at` | — | — | ⚠️ dívida |
| `raw_data` (jsonb) | — | — | ⚠️ dívida: `CanonicalContact` não tem `raw` |
| `lgpd_*` (11 colunas), `pii_masked_at`, `deleted_reason`, `deleted_at`, `merge_source_id`, `dedup_hash`, `queue_id`, `version`, `created_at`, `updated_at`, `search_vector` | — | — | ⚠️ dívida (LGPD/auditoria — fora do contrato de messaging) |

## 3. `zapp.evolution_conversations_wpp2` (partição de `evolution_conversations`; mesmas 34 colunas)

| Coluna (tipo real) | Campo canônico | Tipo canônico | Observação |
|---|---|---|---|
| `id` (uuid) | `ChannelConversation.id` | string | ⚠️ espelho Deno NÃO define tipo conversa (dívida de contrato) |
| `contact_id` (uuid) | `contact.id` | string | ⚠️ parcial: `contact` é `ChannelContact` |
| `remote_jid` (varchar) | `contact.address` | `ChannelAddress{channel:'whatsapp', address}` | |
| `instance_name` (varchar) | `account` | `ChannelAccount` | |
| `status` (varchar: aberta\|arquivada) | — | — | ⚠️ não confundir com `DeliveryStatus` (semântica de atendimento) |
| `assigned_to`, `department`, `subject`, `priority`, `labels` | — | — | ⚠️ dívida (roteamento/atendimento) |
| `message_count` | — | — | ⚠️ dívida |
| `last_message_at` | `lastMessageAt` | Date | parcial — demais timestamps ⚠️ |
| `first_message_at`, `last_inbound_at`, `last_outbound_at`, `first_response_at`, `first_response_seconds`, `resolution_at`, `resolution_seconds` | — | — | ⚠️ dívida (SLA) |
| `is_bot_active`, `bot_session_id` | — | — | ⚠️ dívida |
| `satisfaction_score`, `satisfaction_comment` | — | — | ⚠️ dívida |
| `metadata` (jsonb) | `metadata` | `Record<string, unknown>` | ✅ único mapeamento direto da tabela |
| `unread_count` | `unreadCount` | number | ✅ `ChannelConversation.unreadCount` (TS) |
| `last_message_content`, `last_message_type` | — | — | ⚠️ dívida (desnormalização de exibição) |
| `created_at`, `updated_at` | — | — | ⚠️ dívida |

## 4. Validação de cobertura por campo canônico (V4-FINAL #82, 2026-08-14)

> Contrato de referência: `src/domain/messaging/types.ts` (E23–E29). Cada campo das 3 interfaces canônicas foi confrontado com as seções 1–3. **17/25 campos têm mapeamento direto; 7 são parciais (⚠️); 1 não tem coluna (❌ — derivado).** Campos sem mapeamento explícito estão consolidados em 4.4.

### 4.1 `ChannelMessage` (13 campos)

| Campo canônico | Tipo | Coluna `zapp.evolution_messages` | Status |
|---|---|---|---|
| `id` | string | `id` (uuid) | ⚠️ parcial — PK interna; id de domínio real é `externalId` (`message_id`) |
| `externalId?` | string | `message_id` | ✅ |
| `from` | ChannelAddress | `remote_jid` (inbound) | ✅ — `address` direto; `channel` derivado constante `'whatsapp'` (4.4) |
| `to` | ChannelAddress | `remote_jid` (outbound) | ✅ — idem |
| `account` | ChannelAccount | `instance_name` | ✅ — `id`/`externalRef` = instance_name; `provider` derivado (4.4) |
| `type` | CanonicalMessageType | `message_type` | ✅ — via `BAILEYS_TO_CANONICAL` / `META_TO_CANONICAL` |
| `content` | string | `content` (+ `caption` parcial) | ✅ |
| `mediaUrl?` | string | `media_url` | ✅ |
| `mediaMimetype?` | string | `media_mimetype` | ✅ |
| `status` | DeliveryStatus | `status` | ✅ — via `EVOLUTION_ACK_TO_STATUS`; ⚠️ valores legados não-enum |
| `fromMe` | boolean | `from_me` | ✅ — redundante com `direction` |
| `timestamp` | Date | `created_at` | ✅ |
| `metadata?` | Record<string, unknown> | — (agregador) | ⚠️ sem coluna única — alvo das colunas-dívida (tags, notes, category, sentiment, is_starred, is_important, follow_up_*, sent_by_bot, template_name, link_preview, is_read, reply_to_id, audio_meme_id, sticker_id, transcription_*, error_*, retry_*) |

### 4.2 `ChannelContact` (6 campos)

| Campo canônico | Tipo | Coluna `zapp.evolution_contacts` | Status |
|---|---|---|---|
| `id?` | string | `id` (uuid) | ⚠️ parcial — espelho Deno `CanonicalContact` não tem `id` |
| `address` | ChannelAddress | `remote_jid` | ✅ — `channel` derivado constante |
| `displayName?` | string | `full_name` | ✅ — ⚠️ normalizer usa `pushName` em vez de preencher |
| `avatarUrl?` | string | `profile_picture_url` | ⚠️ — nomes divergem entre espelhos (`avatarUrl` TS × `profilePicUrl` Deno) |
| `provider` | string | — | ❌ sem coluna — derivado da instância (`account.provider`), nunca persistido |
| `externalRef` | string | `instance_name` | ⚠️ sem coluna dedicada — reusa `instance_name` (compartilhado com `account`) |

### 4.3 `ChannelConversation` (6 campos)

| Campo canônico | Tipo | Coluna `zapp.evolution_conversations_wpp2` | Status |
|---|---|---|---|
| `id?` | string | `id` (uuid) | ⚠️ parcial — espelho Deno não define tipo conversa |
| `contact` | ChannelContact | `contact_id` + `remote_jid` | ⚠️ parcial — `contact_id` sem FK canônica; `contact.address` ← `remote_jid` |
| `account` | ChannelAccount | `instance_name` | ✅ |
| `lastMessageAt?` | Date | `last_message_at` | ✅ |
| `unreadCount?` | number | `unread_count` | ✅ |
| `metadata?` | Record<string, unknown> | `metadata` (jsonb) | ✅ — único mapeamento direto da tabela |

### 4.4 Tipos de suporte e campos SEM mapeamento explícito

| Campo/Entidade | Situação |
|---|---|
| `ChannelAddress.channel` | sem coluna — derivado constante `'whatsapp'` (toda linha de `evolution_*` é WhatsApp) |
| `ChannelAccount.provider` | sem coluna — derivado da instância |
| `ChannelContact.provider` | ❌ sem coluna — derivado (4.2) |
| `ChannelContact.externalRef` | ⚠️ sem coluna dedicada — reusa `instance_name` (4.2) |
| `ChannelContact.phone` (citado na seção 2) | ❌ campo NÃO existe no contrato TS E23 — derivável de `address.address` (dígitos de `normalizeJid`) |
| `ChannelMessage.metadata` | ⚠️ agregador — sem coluna única (4.1) |
| `ChannelMessage.id` / `ChannelConversation.id` / `ChannelContact.id` | ⚠️ PK interna ≠ id de domínio (`externalId`) |
| `ProviderCapabilities` (E29) + `EVOLUTION_CAPABILITIES` / `CLOUD_CAPABILITIES` | fora do escopo do mapa — declaração de capacidade por provider, não persistida em `zapp.evolution_*` |
| `BAILEYS_TO_CANONICAL` / `META_TO_CANONICAL` / `EVOLUTION_ACK_TO_STATUS` | tabelas de tradução (código), não colunas — aplicadas sobre `message_type` / `status` |

## Notas finais
- **Cobertura do contrato TS validada (2026-08-14, V4-FINAL #82):** 17/25 campos das interfaces E23 com mapeamento direto; 7 parciais (⚠️); 1 sem coluna (`ChannelContact.provider` — derivado). Detalhe campo a campo na seção 4.
- **Dívida dominante:** ~55 colunas nas 3 tabelas sem correspondente canônico — candidatas a `metadata: Record<string, unknown>` (grupos CRM, LGPD, SLA, mídia, entrega).
- **Drift entre espelhos canônicos:** `DeliveryStatus` usa `'pending'` no TS (E27) vs `'queued'` no Deno (E45) — corrigir antes de usar o mapa como contrato único.
- **Normalizers assimétricos:** E47 (Evolution) produz `CanonicalMessage` direto; E48 (Meta) produz `NormalizedIncoming` pré-canônico (sem `account`/`direction`) — a conversão final falta no lado Cloud.
- **Colunas do brief sem existência física:** `contact_name` e `provider` são derivados (pushName/full_name e `account.provider`); `instance`/`timestamp` = `instance_name`/`created_at`.
