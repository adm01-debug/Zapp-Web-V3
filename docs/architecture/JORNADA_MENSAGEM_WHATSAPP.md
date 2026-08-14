> ⚠️ **ATENÇÃO — Documento pré-desacoplamento (referência histórica, 2026-05-05)**
> Infra Evolution está agora em [adm01-debug/evolution-stack](https://github.com/adm01-debug/evolution-stack).
> O "PG14 nativo" (Destino 1, stack 20) foi **descomissionado** — gravação vai para Supabase self-hosted (schema `evo`, stack 35) via consumer (stack 113).
> A jornada de dados é equivalente; referências de container/stack ID estão desatualizadas.

# 📨 JORNADA COMPLETA DE UMA MENSAGEM — WhatsApp → Frontend Zap Webb
## Documentação técnica | 05/05/2026

---

## VISÃO GERAL

Uma mensagem enviada por um cliente no WhatsApp percorre **5 estágios** e **8 serviços** antes de aparecer na tela do atendente no Zap Webb. O tempo total é de aproximadamente **260ms** (250ms na rede + ~10ms no banco).

```
WhatsApp → Evolution API → RabbitMQ → Consumer → Supabase DB → Realtime → Frontend
              ↓                                      ↓
           PG14 nativo                         3 tabelas tocadas
           Redis (sessão)                      até 9 triggers
           R2 (mídia)                          3 eventos WebSocket
```

---

## ESTÁGIO 1 — WHATSAPP → EVOLUTION API

**Serviço:** `evolution_evolution` (Node.js, evoapicloud/evolution-api)
**Protocolo:** WebSocket via Baileys (lib não-oficial do WhatsApp Web)
**Tempo estimado:** ~100ms

### O que acontece

O WhatsApp envia a mensagem via WebSocket para o servidor Baileys rodando dentro da Evolution API. A API processa o evento e distribui para 4 destinos simultaneamente:

### Destino 1 — PostgreSQL 14 (banco nativo)

- **Container:** `postgres_postgres` (postgres:14)
- **Secret:** `evolution_db_uri_v1`
- **ORM:** Prisma
- **O que grava:** A Evolution API grava a mensagem bruta no banco PG14 nativo, que é o banco "canônico" dela. Tabelas: Message, Contact, Chat, MessageUpdate.
- **Por que existe:** É o banco padrão da Evolution API. Mantido para compatibilidade e como source of truth do dado bruto.

### Destino 2 — RabbitMQ

- **Container:** `rabbitmq_rabbitmq` (rabbitmq:3.13-management)
- **Secret:** `rabbitmq_url_evolution_v1`
- **Exchange:** `evolution`
- **Routing key:** baseado no tipo de evento
- **16 tipos de eventos publicados:**
  - `messages.upsert` (mensagens recebidas/enviadas)
  - `messages.update` (status: enviado, entregue, lido)
  - `contacts.upsert` (novos contatos)
  - `contacts.update` (alterações em contatos)
  - `groups.upsert` / `groups.update`
  - `chats.upsert` / `chats.update` / `chats.delete`
  - `connection.update` (conectado/desconectado)
  - `qrcode.updated`
  - `presence.update`
  - `labels.edit` / `labels.association`
  - `call` (chamadas)
  - `typebot` (integração)

### Destino 3 — Redis

- **Container:** `redis_redis` (redis:latest)
- **DB:** 8
- **O que grava:** Estado da sessão Baileys, cache de instâncias, filas temporárias.

### Destino 4 — Cloudflare R2 (apenas para mídia)

- **Bucket:** `zapp-whatsapp-media`
- **Secrets:** `r2_s3_access_key_v1`, `r2_s3_secret_key_v1`
- **O que grava:** Arquivos de mídia (imagens, áudios, vídeos, documentos) quando a Evolution API consegue baixar do WhatsApp diretamente.
- **Path:** `evolution-api/{instance_id}/{message_id}.{ext}`

---

## ESTÁGIO 2 — RABBITMQ → RABBIT CONSUMER

**Serviço:** `evolution-rabbit-consumer_consumer` (Python 3.12-alpine)
**Tempo estimado:** ~50ms

### O que acontece

O Consumer Python está inscrito na queue do RabbitMQ e recebe o evento `messages.upsert`. Ele faz duas coisas com cada evento:

### Caminho A — SQL direto para Supabase DB

- **Secret:** `pg_evolution_url_n8n_app_v1`
- **Lib:** psycopg2
- **O que faz:** Insere o evento na tabela `evolution_webhook_events` no Supabase DB como registro de auditoria.
- **Tabela destino:** `evolution_webhook_events_wpp_pink_test` (ou `_wpp2`, conforme a instância)

### Caminho B — HTTP POST para Edge Function

- **Endpoint:** Edge Function `evolution-webhook`
- **Secret:** `supabase_webhook_secret_v1` (para HMAC SHA256)
- **O que faz:** 
  1. Serializa o payload do evento como JSON
  2. Calcula o HMAC SHA256 do body usando o secret compartilhado
  3. Envia HTTP POST com header `X-Webhook-Signature`
  4. A Edge Function valida a assinatura antes de processar

### Multi-instância

O Consumer identifica a instância pelo prefixo da queue. Instâncias configuradas:
- `wpp2` — Produção principal
- `wpp_pink_test` — Instância de testes
- `compras`, `diretoria`, `financeiro`, `logistica`, `marketing`, `sac` — Setores
- `vendedor_01` a `vendedor_07` — Vendedores individuais

---

## ESTÁGIO 3 — EDGE FUNCTION → fn_process_whatsapp_message

**Serviço:** `supabase_functions` (supabase/edge-runtime:v1.70.3)
**Banco:** `supabase_db` (PostgreSQL 15.8, 1 GB shared_buffers)
**Tempo medido:** ~7ms para texto, ~10ms para mídia

### O que a Edge Function faz

1. Recebe o HTTP POST do Consumer
2. Valida a assinatura HMAC SHA256
3. Extrai o payload JSON
4. Chama a RPC `fn_process_whatsapp_message(p_payload, p_instance)`

### Assinatura da RPC

```sql
fn_process_whatsapp_message(
    p_payload  jsonb,                    -- JSON completo do evento WhatsApp
    p_instance text DEFAULT 'wpp2'       -- Nome da instância
) RETURNS jsonb
```

### O que a RPC faz (em ordem)

A função executa tudo em uma única transação. São 4 operações dentro dela:

---

### ESTÁGIO 3A — UPSERT Contact

```
Tabela: evolution_contacts (não particionada)
Constraint: UNIQUE(remote_jid)
```

**O que extrai do payload:**
- `remote_jid` ← `p_payload->'key'->>'remoteJid'`
- `push_name` ← `p_payload->>'pushName'`
- `instance_name` ← `p_instance`

**Lógica:**
- Se o contact não existe → INSERT (cria novo)
- Se já existe → UPDATE push_name (atualiza o nome se mudou)
- Retorna o `contact_id` (UUID) para vincular à mensagem

**Triggers disparados no contact:**

| Trigger | Tipo | O que faz |
|---------|------|-----------|
| `trg_extract_phone` | BEFORE INSERT/UPDATE | Extrai o número do telefone do JID. Ex: `5511944449999@s.whatsapp.net` → `5511944449999`. Grava em `phone_number`. |
| `trg_notify_new_lead` | AFTER INSERT | Notifica o sistema (via pg_notify) que um novo lead chegou. Usado para alertas e automações. |
| `trg_auto_lead_score` | AFTER UPDATE | Recalcula o lead score do contato quando algum campo é atualizado. |
| `trg_contact_bitrix_sync` | AFTER INSERT/UPDATE | Sincroniza o contato com o CRM Bitrix24 (se configurado). |
| `trg_evolution_contacts_updated_at` | BEFORE UPDATE | Atualiza o campo `updated_at` automaticamente. |

**Resultado:** Contact ID disponível para vincular à conversation e à message.

---

### ESTÁGIO 3B — UPSERT Conversation

```
Tabela: evolution_conversations (particionada por instance_name)
Partição destino: evolution_conversations_wpp_pink_test
Constraint: UNIQUE(remote_jid, instance_name)
```

**O que grava/atualiza:**
- `remote_jid` ← do payload
- `contact_id` ← do UPSERT anterior
- `instance_name` ← `p_instance`
- `last_message_content` ← texto da mensagem (truncado)
- `last_message_type` ← `conversation`, `imageMessage`, etc.
- `last_message_at` ← NOW()
- `status` ← `'aberta'` (se nova)
- `unread_count` ← incrementa +1 se `from_me = false`

**Lógica:**
- Se a conversation não existe → INSERT (nova conversa)
- Se já existe → UPDATE (atualiza last_message, incrementa unread)

**Triggers disparados na conversation:**

| Trigger | Tipo | O que faz |
|---------|------|-----------|
| `set_updated_at` | BEFORE UPDATE | Atualiza `updated_at` automaticamente. |

**Particionamento:** O PostgreSQL roteia automaticamente para a partição correta baseado no valor de `instance_name`. Se `p_instance = 'wpp_pink_test'`, o INSERT vai para `evolution_conversations_wpp_pink_test`.

---

### ESTÁGIO 3C — INSERT Message

```
Tabela: evolution_messages (particionada por instance_name)
Partição destino: evolution_messages_wpp_pink_test
Constraint: UNIQUE(message_id, instance_name)
```

**O que grava:**
- `message_id` ← `p_payload->'key'->>'id'` (ID do WhatsApp)
- `remote_jid` ← do payload
- `contact_id` ← do UPSERT de contact
- `instance_name` ← `p_instance`
- `message_type` ← `conversation`, `imageMessage`, `audioMessage`, etc.
- `content` ← texto da mensagem
- `from_me` ← true/false
- `raw_data` ← **NULL** (archivado, não grava mais)
- `media_url` ← URL da mídia (se disponível no payload)
- `media_mimetype` ← `image/jpeg`, `audio/ogg`, etc.
- `media_meta` ← JSON slim com mediaKey, directPath, mimetype (apenas para mídia)

**Lógica de dedup:**
- `ON CONFLICT (message_id, instance_name)` → UPDATE content (mantém o PK, atualiza o texto)
- Isso garante idempotência: se o Consumer enviar a mesma mensagem 2x, não cria duplicata

**Extração de media_meta (apenas para mídias):**
A RPC detecta se o `messageType` é mídia e extrai os 3 campos essenciais para download futuro:

```sql
media_meta = jsonb_build_object(
    'mediaKey',   COALESCE(
        msg->'imageMessage'->>'mediaKey',
        msg->'audioMessage'->>'mediaKey',
        msg->'videoMessage'->>'mediaKey',
        msg->'documentMessage'->>'mediaKey',
        msg->'stickerMessage'->>'mediaKey'
    ),
    'directPath', COALESCE(msg->'imageMessage'->>'directPath', ...),
    'mimetype',   COALESCE(msg->'imageMessage'->>'mimetype', ...)
)
```

**Partições disponíveis (16):**

| Partição | Instância |
|----------|-----------|
| evolution_messages_wpp2 | wpp2 (produção principal, 1.8M msgs) |
| evolution_messages_wpp_pink_test | wpp_pink_test (testes) |
| evolution_messages_compras | compras |
| evolution_messages_diretoria | diretoria |
| evolution_messages_financeiro | financeiro |
| evolution_messages_logistica | logistica |
| evolution_messages_marketing | marketing |
| evolution_messages_sac | sac |
| evolution_messages_vendedor_01..07 | vendedor_01 a vendedor_07 |
| evolution_messages_default | fallback para instâncias não mapeadas |

**Triggers disparados na message:**

| Trigger | Tipo | Quando dispara | O que faz |
|---------|------|----------------|-----------|
| `trg_enqueue_media_pink` | AFTER INSERT | message_type é mídia E media_url é NULL | Cria entrada na `media_download_queue` com mediaKey, directPath e mimetype extraídos do `media_meta`. Isso enfileira o download do arquivo original do WhatsApp. |
| `trg_auto_media_pink` | AFTER INSERT/UPDATE | media_url NÃO é NULL | Popula campos auxiliares de mídia (dimensões, duração, etc.) a partir da URL. |
| `trg_rewrite_media_url_pink` | BEFORE INSERT/UPDATE | media_url contém `minio` ou `r2.cloudflarestorage.com` | Reescreve URLs internas para URLs públicas acessíveis. |

**Tipos de mídia aceitos pelo trigger de download (12 tipos):**

```
image, video, audio, ptt, document, sticker,
imageMessage, videoMessage, audioMessage, documentMessage, stickerMessage, ptvMessage
```

---

### ESTÁGIO 3D — Retorno da RPC

A função retorna um JSON com o resultado completo:

```json
{
    "ok": true,
    "from_me": false,
    "contact_id": "570cfbd6-a1b0-4d18-b4b3-4ca235aec922",
    "conversation_id": "37852f93-4f4a-4629-a7ad-a2fd5b7b2587",
    "message_pk": "b8dbdede-4022-4f95-9fc8-d6b5faa22657",
    "message_external_id": "TIMELINE_TXT_001",
    "remote_jid": "5511944449999@s.whatsapp.net",
    "message_type": "conversation",
    "is_new_message": true,
    "media_url_extracted": false,
    "media_meta_populated": false
}
```

| Campo | Significado |
|-------|------------|
| `ok` | true se processou sem erro |
| `from_me` | true se a mensagem foi enviada pela empresa |
| `contact_id` | UUID do contato (criado ou existente) |
| `conversation_id` | UUID da conversa (criada ou existente) |
| `message_pk` | UUID interno da mensagem no Supabase |
| `message_external_id` | ID original do WhatsApp |
| `is_new_message` | true se é mensagem nova (false se dedup) |
| `media_url_extracted` | true se conseguiu extrair URL de mídia |
| `media_meta_populated` | true se gravou media_meta (mediaKey, directPath, mimetype) |

Em caso de erro:

```json
{
    "ok": false,
    "error": "null value in column \"remote_jid\" violates not-null constraint",
    "error_detail": "23502",
    "remote_jid": null,
    "message_external_id": null
}
```

---

## ESTÁGIO 4 — SUPABASE REALTIME → FRONTEND

**Serviço:** `supabase_realtime` (supabase/realtime:v2.76.5, Elixir/Phoenix)
**Protocolo:** WebSocket
**Tempo estimado:** ~5ms

### Como funciona

O Supabase Realtime usa o mecanismo de **replicação lógica** do PostgreSQL para capturar mudanças em tempo real.

### Passo 1 — WAL (Write-Ahead Log)

Quando a RPC grava nas tabelas, o PostgreSQL registra cada operação no WAL com `wal_level = logical`. Isso inclui a estrutura lógica da operação (tabela, colunas, valores novos e antigos), não apenas os bytes alterados.

### Passo 2 — Publication `supabase_realtime`

A publication define quais tabelas emitem eventos. Configuração atual:

```
Nome:         supabase_realtime
Tabelas:      35 (seletivas, não todas)
pubinsert:    true
pubupdate:    true
pubdelete:    true
pubtruncate:  true
pubviaroot:   true  ← CRUCIAL para partições
```

**`pubviaroot = true`** é a configuração que faz o particionamento funcionar com Realtime. Quando um INSERT vai para a partição `evolution_messages_wpp_pink_test`, o evento é publicado como se viesse da tabela-pai `evolution_messages`. Sem isso, o frontend teria que se inscrever em cada uma das 16 partições individualmente.

**Tabelas evolution na publication (13):**

| Tabela | Eventos que o frontend usa |
|--------|---------------------------|
| `evolution_messages` | Nova mensagem no chat |
| `evolution_conversations` | Conversa nova / atualização de unread |
| `evolution_contacts` | Novo contato / push_name atualizado |
| `evolution_alerts` | Alertas de conexão |
| `evolution_calls` | Chamadas recebidas |
| `evolution_connection_history` | Histórico de conexão |
| `evolution_deals` | Pipeline comercial |
| `evolution_labels` | Etiquetas |
| `evolution_label_associations` | Vínculo etiqueta ↔ conversa |
| `evolution_realtime_events` | Eventos de presença |
| `evolution_settings` | Configurações |
| `evolution_tasks` | Tarefas |
| `evolution_webhook_events_wpp2` | Auditoria de webhooks |

### Passo 3 — Realtime Server lê o WAL

O container Realtime mantém um **replication slot** no PostgreSQL. Ele lê continuamente as mudanças do WAL em tempo real e converte cada operação em um evento WebSocket.

### Passo 4 — Broadcast via WebSocket

Para uma única mensagem de texto, o Realtime emite **3 eventos** (porque a RPC toca 3 tabelas):

| Evento | Tabela | Tipo | Conteúdo |
|--------|--------|------|----------|
| 1 | `evolution_contacts` | INSERT | Novo contato com push_name, phone_number |
| 2 | `evolution_conversations` | INSERT | Nova conversa com status=aberta, unread=1 |
| 3 | `evolution_messages` | INSERT | Mensagem com content, message_type, contact_id |

Para a **segunda mensagem do mesmo contato**, seriam apenas:

| Evento | Tabela | Tipo | Conteúdo |
|--------|--------|------|----------|
| 1 | `evolution_conversations` | UPDATE | unread_count++, last_message atualizado |
| 2 | `evolution_messages` | INSERT | Nova mensagem |

(Sem INSERT em contacts porque já existe.)

### Passo 5 — Frontend Zap Webb recebe

O frontend usa o Supabase JS Client para se inscrever nos canais:

```javascript
supabase
  .channel('messages')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'evolution_messages',
    filter: 'instance_name=eq.wpp_pink_test'
  }, (payload) => {
    // Nova mensagem chegou → renderizar no chat
    addMessageToChat(payload.new);
  })
  .subscribe();
```

**O que o frontend faz com cada evento:**

| Evento recebido | Ação no frontend |
|-----------------|------------------|
| INSERT evolution_contacts | Adiciona contato à lista / atualiza push_name |
| INSERT evolution_conversations | Nova conversa aparece na sidebar com badge |
| UPDATE evolution_conversations | Atualiza unread badge e preview da última msg |
| INSERT evolution_messages | Renderiza a mensagem no chat em tempo real |
| INSERT media_download_queue | (interno) Atualiza status de mídia pendente |

---

## FLUXO COMPARATIVO: TEXTO vs MÍDIA

### Mensagem de TEXTO

```
Estágio 3A: UPSERT contact          → 5 triggers (phone, lead, bitrix, notify, updated_at)
Estágio 3B: UPSERT conversation     → 1 trigger (updated_at)
Estágio 3C: INSERT message           → 0 triggers de mídia (message_type = conversation)
                                       media_meta = NULL
                                       media_url = NULL
Estágio 4:  3 eventos WebSocket      → contacts INSERT + conversations INSERT + messages INSERT
```

### Mensagem de IMAGEM (sem URL pré-existente)

```
Estágio 3A: UPSERT contact          → 5 triggers
Estágio 3B: UPSERT conversation     → 1 trigger
Estágio 3C: INSERT message           → media_meta = {mediaKey, directPath, mimetype}
                                       media_url = NULL
            trg_enqueue_media_pink   → DISPARA: cria entrada na media_download_queue
                                       com media_key, direct_path, mimetype
Estágio 4:  4 eventos WebSocket      → contacts + conversations + messages + media_download_queue
```

### Mensagem de IMAGEM (com URL pré-existente)

```
Estágio 3A: UPSERT contact          → 5 triggers
Estágio 3B: UPSERT conversation     → 1 trigger
Estágio 3C: INSERT message           → media_meta = {mediaKey, directPath, mimetype}
                                       media_url = https://mmg.whatsapp.net/...
            trg_enqueue_media_pink   → NÃO DISPARA (media_url já existe)
            trg_auto_media_pink      → DISPARA: popula campos auxiliares
            trg_rewrite_media_url    → DISPARA: reescreve URL interna → pública
Estágio 4:  3 eventos WebSocket      → contacts + conversations + messages
```

---

## RESUMO DE TEMPOS

| Estágio | Tempo | Onde |
|---------|-------|------|
| WhatsApp → Baileys (WebSocket) | ~100ms | Rede WA |
| Evolution API processamento | ~50ms | Node.js |
| Gravação PG14 + Redis + R2 | ~30ms | Containers locais |
| RabbitMQ publish | ~5ms | Memória |
| Consumer consome + HMAC | ~50ms | Python |
| Edge Function valida + chama RPC | ~5ms | Deno runtime |
| **fn_process_whatsapp_message** | **~7ms** | **PostgreSQL 15.8** |
| WAL → Realtime → WebSocket | ~5ms | Elixir/Phoenix |
| Frontend renderiza | ~10ms | Browser |
| **TOTAL** | **~260ms** | **Ponta a ponta** |

---

## DIAGRAMA DE DADOS

```
                    ┌─────────────┐
                    │   Contact   │
                    │ (1 por JID) │
                    └──────┬──────┘
                           │ contact_id
              ┌────────────┼────────────┐
              │            │            │
     ┌────────▼──────┐  ┌─▼──────────┐ │
     │ Conversation  │  │  Message    │ │
     │ (1 por JID    │  │ (N por JID  │ │
     │  × instância) │  │  × inst.)   │ │
     └───────────────┘  └──────┬──────┘ │
                               │        │
                    ┌──────────▼──────┐  │
                    │ media_download  │  │
                    │ _queue          │  │
                    │ (se mídia sem   │  │
                    │  URL)           │  │
                    └─────────────────┘  │
                                        │
                           ┌────────────▼─┐
                           │ webhook_     │
                           │ events       │
                           │ (auditoria)  │
                           └──────────────┘
```

---

*Documentação gerada em 05/05/2026. Baseada em simulação real contra o ambiente de produção.*
