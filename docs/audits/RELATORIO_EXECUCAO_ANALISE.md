# RELATÓRIO DE EXECUÇÃO DA ANÁLISE — `zapp-web-v3`

> Documento vivo. Atualizado bloco a bloco conforme o `PLANO_QA_ANALISE_100.md` é executado.
> Cada etapa fechada gera 0..N achados; achados vão para `PLANO_IMPLEMENTACAO_100.md`.

---

## Estado geral

| Bloco | Descrição | Status | Achados |
|---|---|---|---|
| 1 | Inventário estrutural e mapeamento (1-10) | ✅ Concluído | 14 (F1-01 a F1-14) |
| 2 | Auditoria do banco (11-20) | ✅ Concluído | 13 (F2-01 a F2-13) |
| 3 | Autenticação e sessão (21-30) | ✅ Concluído | 12 (F3-01 a F3-12) |
| 4 | Inbox e mensageria (31-45) | ✅ Concluído | 24 (F4-01 a F4-24) |
| 5 | Contatos e CRM (46-55) | ⏸ Pendente | — |
| 6 | Conexões WhatsApp (56-65) | ⏸ Pendente | — |
| 7 | Admin e monitoramento (66-75) | ⏸ Pendente | — |
| 8 | SLA/BPM (76-80) | ⏸ Pendente | — |
| 9 | Resiliência e edge cases (81-90) | ⏸ Pendente | — |
| 10 | Cross-browser / a11y / perf (91-100) | ⏸ Pendente | — |

**Achados até aqui: 63 (14 Bloco 1 + 13 Bloco 2 + 12 Bloco 3 + 24 Bloco 4).**

---

## Bloco 1 — Inventário estrutural (etapas 1-10)

_(Detalhes registrados anteriormente.)_

## Bloco 2 — Auditoria do banco (etapas 11-20)

_(Detalhes registrados anteriormente.)_

## Bloco 3 — Autenticação e sessão (etapas 21-30)

_(Detalhes registrados anteriormente.)_

---

## Bloco 4 — Inbox e mensageria (etapas 31-45)

Arquivos auditados linha a linha:
- `src/features/inbox/hooks/useRealtimeMessages.ts` (25 875 B).
- `src/features/inbox/hooks/useRealtimeInbox.ts` (18 663 B).
- `src/features/inbox/hooks/useMessageQueue.ts` (19 366 B).
- `src/features/inbox/hooks/useMessagesCursor.ts` (12 903 B).
- `src/features/inbox/hooks/useMessageStatus.ts` (7 513 B).
- `src/features/inbox/hooks/useRetryFailedMessage.ts` (4 547 B).
- `src/features/inbox/hooks/useChatMediaSending.ts` (13 803 B).
- `src/features/inbox/hooks/useMediaUrl.ts` (9 657 B).
- `src/features/inbox/hooks/realtime/messageSender.ts` (12 486 B).
- `src/features/inbox/hooks/realtime/messageSenderHelpers.ts` (4 717 B).
- `src/features/inbox/hooks/realtime/realtimeUtils.ts` (4 904 B).
- `src/features/inbox/hooks/realtime/useMessageUpdateBatcher.ts` (5 684 B).
- `src/features/inbox/services/messageService.ts` (4 331 B).
- `src/features/inbox/data-access/messageRepository.ts` (5 069 B).

### Base factual do banco (medida em 01/08/2026 22:45 UTC)

| Métrica | Valor |
|---|---|
| `zapp.messages` total | 62 447 |
| Sem `external_id` | 42 (0,07%) |
| `status = 'pending'` | 23 (todas de 26/07 sem `external_id`, `retry_attempt`, `error_reason`) |
| `status = 'failed'` | 8 (todas sem `error_code`, `error_reason`, `retry_attempt`) |
| `soft_deleted` | 0 |
| `retry_attempt IS NOT NULL` | **0** (esperado: >0 em produção normal) |
| `zapp.failed_messages` | **0 linhas** (esperado: >0 pelo path do useMessageQueue) |
| `zapp.media_cache` | **0 linhas** (esperado: >0 pelo useMediaUrl) |
| `zapp.outbound_message_queue` | **0 linhas** (mas cron `retry-stuck-messages` opera nela!) |
| `evo.evolution_webhook_events_v2` receb. 7d | 21 039 (`messages.upsert`) |
| `send.message` 7d | 256 |
| Reactions | 424 (170 contatos únicos) |

### Etapas 31-36 — Fluxo de envio

**Etapa 31 (abrir conversa):** `handleSelectConversation` chama `supabase.functions.invoke('evolution-api', { action: 'read-messages' })` em fire-and-forget sem tratamento de erro (F4-06). Se edge function falhar (401/429/500), leitura no WhatsApp não sincroniza mas UI segue.

**Etapa 32 (envio de texto):** `sendMessageToContact` (`messageSender.ts`) executa **8 round-trips ao DB** no happy path: `auth.getUser` → `profiles.select` → `messages.insert` → `audit_logs.insert('starting')` → `contacts.select` → `whatsapp_connections.select` (2×, dentro de `resolveConnection`) → `messages.update('sent')` → `audit_logs.insert('delivered')`. Envio de 50 mensagens rápidas = 400 queries (F4-16).

**Etapa 33 (envio de mídia):** `useChatMediaSending.resolveInstance` fallback (`.eq('status', 'connected').limit(1).maybeSingle()`) escolhe **instância aleatória** entre múltiplas ativas — o cliente pode enviar via instância diferente da conversação (F4-25). `updateMessageStatus` retry naïve sem backoff (F4-26).

**Etapa 34 (recepção via webhook):** Cron `link-orphan-messages` (jobid 76, a cada 5min) executa `evo.fn_link_orphan_messages(5000)`. Auditoria da função revela: só linka `conversation_id`, **NÃO recupera `external_id` das 42 mensagens sem ID**. Nome enganoso (F4-30).

**Etapa 35 (reactions realtime):** `zapp.message_reactions` funcional (424 rows). Não auditadas neste bloco.

**Etapa 36 (edit mensagem):** não coberto neste bloco (baixa prioridade).

### Etapas 37-40 — Delete, quote, forward, stickers

**Etapa 37 (delete):** `useRealtimeMessages.handleMessageDelete` funciona ok (`buildConversation` recomputa `unreadCount` e `lastMessage`).

**Etapa 38 (reply/quote):** não coberto (baixa prioridade).

**Etapa 39 (forward):** race de encaminhamento a 50+ destinatários não testada — depende de `useMessageQueue.MAX_CONCURRENT_SENDS=5`.

**Etapa 40 (stickers):** `useChatMediaSending.handleSendSticker` faz auto-save do sticker (SELECT + INSERT) sem `.upsert(on_conflict: 'image_url')` — race de dupla-inserção teoricamente possível.

### Etapas 41-43 — Typing, read receipts, notifications in-app

Não cobertos com profundidade neste bloco. Nota: `useRealtimeMessages.markAsRead` faz optimistic update do state sem toast em caso de erro do DB (silent failure).

### Etapas 44-45 — Search em conversas, filtros de inbox

**Etapa 44 (search):** `filteredConversations` do `useRealtimeMessages` filtra em memória via `search.toLowerCase()` — não usa `pg_trgm`. Para tenants com 500+ contatos, aceitável; para 5000+ contatos, gap.

**Etapa 45 (filtros unread/starred/tagged):** `useInboxFilters.ts` (21 kB) contém `inboxFilterPipeline.ts` (14 kB) — auditoria de pipeline pendente. Anotado como TODO.

### Etapa 33.5 — Auditoria do pipeline de status/reconciliation (fora do escopo original, mas evidência forte)

Queries de amostragem revelaram **falhas sistêmicas na persistência de metadados de erro**:

1. **Todas as 8 mensagens `failed`** têm `error_code = NULL`, `error_reason = NULL`, `retry_attempt = NULL` — apesar do código de `messageSender.ts` explicitamente escrever esses campos em cada branch de falha (`failed_auth`, `failed_retries`, catch geral).
2. **Todas as 23 mensagens `pending`** também têm `retry_attempt = NULL` e `error_reason = NULL`. Presas desde 26/07 (5 dias).
3. Cron `retry-stuck-messages` (jobid 5, `SELECT zapp.fn_retry_stuck_messages()`) opera em `zapp.outbound_message_queue` que está **vazia** — as 23 mensagens presas nunca são varridas.
4. Cron `media_pipeline_health_check` (jobid 213) falhou 2× em 30/07 com constraint violation em `warroom_alerts` (`chk_warroom_alert_type` + coluna `severity` ausente). Alertava **4557 mensagens com "media_unknown_status"** — nenhuma delas foi notificada.
5. `zapp.failed_messages` está **vazia** apesar do `useMessageQueue.processMessage` catch inserir. Ou (a) o path nunca é acionado ou (b) INSERT falha silenciosamente (RLS ou schema mismatch).

Esses achados apontam para **triggers sobrescrevendo campos** ou **camada de acesso descartando updates**. Investigação obrigatória.

---

## Achados do Bloco 4 (24 itens registrados em `PLANO_IMPLEMENTACAO_100.md`)

### Camada de estado do frontend (React)

- **F4-01** — `useRealtimeMessages.fetchConversations` limita hardcoded a 500 contatos + 1000 mensagens sem cursor.
- **F4-02** — `fetchConversations` sem `AbortController`/`active` check dentro do await — setState possível após unmount.
- **F4-03** — Channel name aleatório com `Math.random()` — StrictMode dev cria 2 channels simultâneos temporários.
- **F4-04** — `conversationSendState` computed fora de `useMemo` — O(n·m) por render sobre todas as conversations.
- **F4-05** — `USE_EXTERNAL_DB = true` hardcoded em `useRealtimeInbox.ts` — deveria ser env-driven.
- **F4-06** — `handleSelectConversation` chama `evolution-api/read-messages` em fire-and-forget sem `.catch`.
- **F4-07** — `useRealtimeInbox` reconcilia apenas `.slice(-10)` das mensagens — burst >10 messages perde reconciliation.
- **F4-08** — `seededAvatarsRef` (Set) nunca limpo — memory leak em sessão longa.
- **F4-09** — `convProbeRef` (log de debug) sempre ativo em produção.

### Fila de mensagens e retry

- **F4-10** — `useMessageQueue.processedDeliveriesRef` (Set) cresce sem cap.
- **F4-11** — `useMessageQueue.localStorage.setItem` sem try/catch — QuotaExceededError trava persistência.
- **F4-12** — `useMessageQueue` sem `beforeunload` handler — reload cascade de sends.
- **F4-13** — Classificação de erro sem diferenciar retryable (429/5xx) vs permanent (400/403) — retries desnecessários.
- **F4-14** — `dbFrom('failed_messages').insert` chega ao branch mas a tabela está vazia em produção — falha silenciosa (RLS ou schema).

### Message sender e status

- **F4-15** — `sendMessageToContact` faz 8 round-trips por mensagem — deveria ser 1 RPC atômica.
- **F4-16** — `buildSendIdempotencyKeyFromFingerprint` 5min bucket colide retry de conteúdo diferente na mesma janela.
- **F4-17** — `messageSender.audit_logs` fire-and-forget sem retry — perda de audit em erros transientes.
- **F4-18** — `messageSender` persiste `retry_attempt`/`error_reason` mas dados mostram **100% NULL** em `failed` e `pending` (evidência: 8 failed + 23 pending sem esses campos). Path do update falha silenciosa OU trigger `fn_messages_instead_of_update` apaga.
- **F4-19** — `extractEvolutionMessageId` pode retornar null; status `sent`/`delivered` sem `external_id` bloqueia reconciliation (evidência: 42 msgs sem external_id).

### Mídia

- **F4-20** — `useMediaUrl.refreshCache` (Map global) sem cap; data URLs em base64 podem chegar a centenas de MB.
- **F4-21** — `buildFileHash(originalUrl) != buildFileHash(dataUrl)` — cache DB **nunca hit** (evidência: `media_cache` vazia).
- **F4-22** — `useMediaUrl` grava base64 no DB via `media_cache.storage_path` — anti-pattern; deveria ser R2/CDN URL.

### Backend / cron

- **F4-23** — `fn_retry_stuck_messages()` opera em `outbound_message_queue` que está **vazia** — as 23 mensagens presas em `messages` nunca são retryadas. Cron fantasma.
- **F4-24** — Cron `media_pipeline_health_check` (jobid 213) com constraint violation em `warroom_alerts` — 4557 alertas de mídia perdidos silenciosamente.

---

## Retomada — próximo chat

Onde parar de Bloco 4 e o que executar em seguida:

1. **Bloco 5 — Contatos e CRM (etapas 46-55):**
   - `src/features/contacts/*` — CRUD, merge, bulk actions.
   - `zapp.contacts` (51k+ linhas), `zapp.contact_intelligence` (20k+).
   - RPCs: `bulk_auto_merge_duplicates`, `bulk_soft_delete_contacts`, `bulk_add_tag`, `add_contact_note`, `rpc_get_contact` (já visto no Bloco 2).
   - Validar CPF/CNPJ, normalização de número WhatsApp.
   - `pg_trgm` fuzzy search em nomes.
   - LGPD: soft-delete com undo 30d, merge preservando consentimento.

2. **Bloco 6-10:** roteiro completo em `PLANO_QA_ANALISE_100.md`.

**Documentos ao final desta sessão (4 blocos concluídos):**
- `docs/audits/PLANO_QA_ANALISE_100.md` — roteiro (não alterado).
- `docs/audits/PLANO_IMPLEMENTACAO_100.md` — 63 achados nos Temas 1-8.
- `docs/audits/RELATORIO_EXECUCAO_ANALISE.md` — este documento.
