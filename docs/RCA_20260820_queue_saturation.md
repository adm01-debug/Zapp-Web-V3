# RCA — Saturação de Fila (2026-08-20T22:26Z)

**Severidade:** P0 (impacto total — todas as queries do app falharam)
**Duração:** ~103 segundos (22:26:00Z – 22:27:43Z)
**Ambiente:** Produção (`zapp.atomicabr.com.br`)

---

## Resumo Executivo

O cron `rt-fanout-ttl` (pg_cron, a cada 5min) deletou ~972 linhas de
`zapp.realtime_message_fanout`. A tabela tinha `REPLICA IDENTITY FULL`,
então o WAL serializou a linha **completa** (~200 bytes) em cada DELETE.
O Supabase Realtime entregou 972 eventos DELETE para todos os subscribers
do canal Broadcast — inclusive sem listener explícito para o tipo DELETE.

`useRealtimeMessages.ts` respondia a **qualquer** payload com
`queryClient.invalidateQueries({ queryKey: ['conversation-messages'] })`
sem especificar contactId, disparando N refetches simultâneos.
`useConversationMessagesData.ts` não passava `AbortSignal` para a query,
então cada refetch abandonado continuava ocupando slot do semáforo até
timeout (15s). Com 80 refetches concorrentes, a fila atingiu o cap e
`SupabaseQueueSaturatedError` cascateou para **todas** as queries do app.

`safeClient.recordFailure()` tentava logar via `rpc_log_email_health`
pela **mesma fila saturada** (463 tentativas em 103s), amplificando o
incidente. A RPC já tinha `GRANT` apenas para `postgres/service_role` —
100% das chamadas resultariam em `permission denied` para o role
`authenticated` do browser, mesmo sem saturação.

---

## Linha do Tempo

| Hora (UTC) | Evento |
|------------|--------|
| 22:30:00Z | Cron `rt-fanout-ttl` executa: `DELETE FROM zapp.realtime_message_fanout WHERE created_at < now() - interval '10 minutes'` |
| 22:30:00Z | 972 DELETEs com `REPLICA IDENTITY FULL` → WAL serializa linha completa por delete |
| 22:30:00Z | Realtime entrega 972 eventos DELETE a todos os subscribers |
| 22:30:00Z | `useRealtimeMessages`: 972× `invalidateQueries(['conversation-messages'])` |
| 22:30:01Z | `useConversationMessagesData`: N refetches sem AbortSignal → slots não liberados |
| 22:30:03Z | Fila do semáforo atinge cap (80) |
| 22:30:03Z | `SupabaseQueueSaturatedError` em todas as queries da app |
| 22:30:03Z | `safeClient.recordFailure()` → 463 tentativas de `rpc_log_email_health` na fila saturada |
| 22:31:43Z | Slots expiram por timeout (15s) → fila drena naturalmente |
| 22:31:43Z | App volta ao normal (sem intervenção manual) |

---

## Causa Raiz (5 Whys)

1. **Por que o app ficou indisponível?**
   → Fila do semáforo saturou (cap=80), bloqueando todas as novas queries.

2. **Por que a fila saturou?**
   → N refetches simultâneos de `useConversationMessagesData` sem AbortSignal
     mantinham slots ocupados mesmo após serem "descartados" pelo TanStack.

3. **Por que tantos refetches simultâneos?**
   → 972 eventos DELETE chegaram via Realtime e cada um disparou
     `invalidateQueries(['conversation-messages'])` sem debounce.

4. **Por que 972 eventos DELETE chegaram ao Realtime?**
   → `realtime_message_fanout` tinha `REPLICA IDENTITY FULL`:
     cada DELETE gerava um evento WAL completo; Realtime os entregou a todos
     os subscribers, independentemente do tipo de evento subscrito.

5. **Por que `REPLICA IDENTITY FULL` estava ativo?**
   → Configuração original da migration `20260817110000` que criou a tabela.
     Era necessário para UPDATE/DELETE subscribers, mas a tabela só recebe
     INSERTs via trigger — nunca UPDATEs. Os DELETEs são só purga de cron
     sem valor semântico para o consumer.

---

## Fatores Agravantes

| Fator | Impacto |
|-------|---------|
| `boundedFetch` cap (6) ≠ semáforo `retryFetch` (8) | 2 slots sempre desperdiçados |
| `recordFailure` usava a fila saturada para logar falhas | Amplificação 463× |
| `rpc_log_email_health` sem GRANT para `authenticated` | 100% das chamadas falhavam mesmo sem saturação |
| `AuthProvider.tsx` testava apenas `error.name === 'AbortError'` | postgrest-js wraps AbortError no `message`, não no `name` → falsos ERRORs |

---

## Correções Aplicadas

### 1. DB — `REPLICA IDENTITY DEFAULT` + `mirrored_at` (migration `20260820230000`)

```sql
-- WAL só carrega PK (uuid, 16 bytes) nos DELETEs — zero impacto em INSERT/UPDATE
ALTER TABLE zapp.realtime_message_fanout REPLICA IDENTITY DEFAULT;

-- Coluna semântica de "quando foi espelhado" (vs. when a msg original foi criada)
ALTER TABLE zapp.realtime_message_fanout
  ADD COLUMN IF NOT EXISTS mirrored_at timestamptz NOT NULL DEFAULT now();

-- Índice para purga O(log n) em vez de seq scan
CREATE INDEX IF NOT EXISTS idx_rt_fanout_mirrored ON zapp.realtime_message_fanout (mirrored_at);

-- fn_rt_fanout_insert atualizada para popular mirrored_at
-- cron rt-fanout-ttl atualizado para usar mirrored_at (semântica correta)
```

### 2. Frontend — `useRealtimeMessages.ts`

- **Removido:** handler de DELETE (cron purge não é deleção de mensagem real)
- **Adicionado:** `scheduleConversationCacheInvalidation(contactId)` — debounce de 2s
  por contactId (antes: invalidação global imediata a cada evento)

### 3. Frontend — `useConversationMessagesData.ts`

- **Adicionado:** `.abortSignal(signal)` na chain PostgREST — TanStack cancela
  o fetch ao mudar de contato ou ao `cancelRefetch`, liberando o slot do semáforo.

### 4. `safeClient.ts`

- **Removido:** `syncHealthState()` (dead code — sem callers; `authenticated` não tem GRANT)
- **Convertido:** `recordFailure()` de async+RPC para síncrono in-memory
- **Adicionado:** `isClientSideTransientError()` — rebaixa erros de abort/fila para
  WARN, evitando flood de ERROR no console e no Sentry durante incidente

### 5. `client.ts`

- **Corrigido:** `MAX_CONCURRENT = 6 → 8` — alinhado com `SUPABASE_MAX_CONCURRENT = 8`

### 6. `AuthProvider.tsx`

- **Adicionado:** `isAbortLikeError()` — detecta AbortError em todas as formas
  (DOMException `name`, postgrest-js `message`, string)

---

## Impacto Pós-Correção Esperado

| Métrica | Antes | Depois |
|---------|-------|--------|
| Eventos Realtime por ciclo de cron | 972 DELETE (linha completa) | 1 DELETE (só PK, 16 bytes) — mas irrelevante: sem listener |
| Invalidações de cache por ciclo | 972 (uma por evento) | 0 (listener DELETE removido) |
| Slots liberados ao cancelar refetch | 0 (sem AbortSignal) | Imediato (AbortSignal propagado) |
| Tentativas de health log por falha | 1 RPC (fila saturada, permission denied) | 0 (in-memory only) |
| ERRORs falsos de auth no boot | N (por variante de AbortError não detectada) | 0 |

---

## Ações Preventivas

| Ação | Status |
|------|--------|
| Alertar se `queue_depth > 60` por mais de 5s | Pendente (monitoramento) |
| Validar `REPLICA IDENTITY` em tabelas com purge via cron | ✅ Corrigido neste RCA |
| Nunca usar a fila do browser para health logging | ✅ Removido |
| CI guard: `.abortSignal(signal)` obrigatório em `queryFn` com `signal` | Pendente (lint rule) |

---

## Arquivos Modificados

```
src/features/auth/components/AuthProvider.tsx
src/features/inbox/hooks/useConversationMessagesData.ts
src/features/inbox/hooks/useRealtimeMessages.ts
src/integrations/supabase/client.ts
src/integrations/supabase/safeClient.ts
supabase/migrations/20260820230000_fix_fanout_replica_identity_and_ttl.sql
```

---

*RCA produzido em 2026-08-20. Referência de incidente: log `c526e2c9-zapp.atomicabr.com.br1787265020243.log`.*
