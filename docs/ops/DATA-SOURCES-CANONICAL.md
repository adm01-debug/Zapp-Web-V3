# Arquitetura de Dados — Zapp Webb (wpp2)

## Fluxo de mensagens: dois sistemas paralelos

### Sistema 1 — Pipeline de analytics (`evo` schema)
**Fonte:** WhatsApp → Baileys → Evolution API → RabbitMQ → consumer Python → Edge Functions (Deno)
**Tabela:** `evo.evolution_messages_wpp2` (partição de `evo.evolution_messages`)
**Insert via:** `zapp.rpc_insert_message(22 params)` chamado em `ingest-port.ts`
**Status:** Setado no momento do INSERT, **nunca atualizado** por ACKs
**Caractere:** INSERT-only, imutável após insert; status fica em `sent`/`received`

### Sistema 2 — Frontend operacional (`zapp` schema)
**Fonte:** Mesmo pipeline → `handleIncomingMessage` / `handleOutgoingWhatsAppMessage`
**Tabela:** `zapp.messages` (acessível como `public.messages` = VIEW)
**Insert via:** `supabase.from('messages').insert()` na edge
**ACKs via:** `handleMessagesUpdate` → `supabase.from('messages').update(status, status_updated_at)`
**Caractere:** Mutável; reflete estado real atual da mensagem (sent→delivered→read)

### Implicação para métricas
Para contar ACKs reais use `zapp.messages`, NÃO `evo.evolution_messages_wpp2`:
```sql
-- CORRETO
SELECT count(*) FROM zapp.messages
WHERE status IN ('delivered','read','played') AND updated_at > now()-interval '7d';
-- 7d: ~168k

-- ERRADO (analytics table, sem ACKs)
SELECT count(*) FROM evo.evolution_messages_wpp2
WHERE status IN ('delivered','read') AND created_at > now()-interval '7d';
-- 7d: 3 (apenas mensagens sintéticas de teste)
```

---

## Fluxo de chamadas: dois sistemas paralelos

### Sistema 1 — Chamadas via edge (`zapp` schema)
**Fonte:** WhatsApp `call` event → `handleCallEvent` em `evolution-webhook-handlers.ts`
**Tabela:** `zapp.calls` (acessível como `public.calls` = VIEW, 13 cols)
**Insert via:** `supabase.from('calls').insert()` na edge
**Dados:** 98 rows; última: 2026-08-11

### Sistema 2 — Chamadas perdidas via DB function
**Fonte:** RPC direto ou trigger
**Tabela:** `zapp.evolution_calls` (14 cols, inclui `call_id`, `duration_seconds`)
**Insert via:** `fn_process_missed_call(remote_jid, instance)` — subconjunto, só missed
**Dados:** 70 rows; última: 2026-08-10

### Implicação para métricas
Para contar chamadas reais use `zapp.calls`, NÃO `zapp.evolution_calls`:
```sql
-- CORRETO
SELECT count(*) FROM zapp.calls WHERE created_at > now()-interval '7d';

-- INCOMPLETO (só missed calls via fn_process_missed_call)
SELECT count(*) FROM zapp.evolution_calls WHERE created_at > now()-interval '7d';
```

---

## Status de WhatsApp Stories (status@broadcast)

**Tabela:** `zapp.evolution_whatsapp_status`
**Estado:** SEMPRE VAZIA
**Motivo:** Edge filtra `status@broadcast` via `normalizePhone()` → retorna `null` → skip.
A tabela tem `fn_handle_whatsapp_status` e `fn_sync_status_from_messages` mas
nenhum deles é chamado porque o evento nunca chega pelo pipeline normal.
**Critério de scorecard:** Nunca usar `zapp.evolution_whatsapp_status` como indicador de saúde.

---

## Mapa de fontes canônicas (scorecard v_production_scorecard)

| Critério | Tabela CORRETA | Tabela INCORRETA | Motivo |
|---|---|---|---|
| ACKs delivered/read | `zapp.messages` | `evo.evolution_messages_wpp2` | evo = insert-only |
| Chamadas | `zapp.calls` | `zapp.evolution_calls` | evolution_calls = subset |
| Stories | N/A | `zapp.evolution_whatsapp_status` | sempre vazia |
| Mensagens recentes | `evo.evolution_messages_wpp2` | `zapp.messages` | evo tem wa_timestamp real |
| Contatos fresh | `evo.evolution_contacts` | — | única fonte |
| Mídia ready | `zapp.evolution_media` | — | única fonte |

---

## Atualizado em 2026-08-20 (sessão claude-s18-evo-100steps)
