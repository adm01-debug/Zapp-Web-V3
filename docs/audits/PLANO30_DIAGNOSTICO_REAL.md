# Diagnóstico Real — Plano de 30 Etapas

> Verificação de cada item do plano de 30 etapas (`.hermes-plano30.md`) contra a realidade do código/worktree.
> Data: **2026-08-05**. Método: leitura direta dos arquivos com âncoras linha:coluna. Nenhum `.ts`/`.tsx` foi alterado.

## REFUTADOS (4)

### #3 — Roteamento `get_companies_by_phones_batch` para "lovableCloud" → REFUTADO

**Não existe 2º client.** A hipótese do plano (Etapas 16–18: telemetria `source: 'lovableCloud'` ⇒ query iria para o cloud) é falsa:

- `externalClient.ts:28-30`: `externalSupabase = supabase` — shim desde a consolidação de 2026-07-15 (comentário linhas 5–11).
- `db.ts:48-57` (`dbClient`) e `db.ts:100-106` (`rpcClient`): o rótulo `'external'` resolve para o shim, que é o próprio client principal.
- `rpcCatalog.ts:500-503`: `getCompaniesByPhonesBatch` tem `client: 'lovable'` → resolve para `supabase` (self-hosted, schema `zapp`).
- **`get_companies_by_phones_batch` sempre roteou para o self-hosted** — a string `'lovableCloud'` da telemetria é cosmética (`db.ts:121-124`; ver `docs/SUPABASE_CLIENTS.md` §c).

### #4 — Mark-as-read N+1 (PATCH individual por contato) → REFUTADO

Já estava batched desde **2026-08-03** — `src/features/inbox/hooks/realtime/useConversationActions.ts:22-113`:

- Coalescing de 250ms (`MARK_READ_FLUSH_MS`, linha 26): chamadas individuais acumulam `contact_id` num `Set` e são descarregadas em **UM PATCH** `.update({ is_read: true }).in('contact_id', ids).eq('sender', 'contact').eq('is_read', false)` (linhas 39–43).
- Update otimista imediato por chamada (`applyOptimisticRead`, linhas 58–70) + `markManyAsRead` (linhas 92–101) + flush no unmount (linhas 105–113).
- Não há N PATCHes; o plano (Etapas 13–15, criar RPC `batch_mark_messages_read`) é desnecessário.

### #5 — RetryUtil retentando AbortError → REFUTADO

- `src/lib/retry.ts:36`: default `shouldRetry = () => false` — SAFE DEFAULT com comentário explícito (linhas 31–35): *"do NOT retry without an explicit policy... Callers MUST pass an explicit `shouldRetry` that excludes AbortError"*.
- `src/integrations/supabase/client.ts:361-367` (`shouldRetryFetchError`): `if (isAbortError(err)) return false; // abort do caller nunca é retentado` (linha 362).
- AbortError (unload/navegação) **nunca** é retentado — o padrão de cascata de AbortErrors que o plano (Etapas 7–9) temia não ocorre por default.

### #7 (parte build) — `version.json` inexistente → REFUTADO

`version.json` **já é emitido** pelo `emitVersionJsonPlugin` em `vite.config.ts:35-47` (plugin na 35–47; `BUILD_ID` na linha 33; `generateBundle` → `emitFile` asset `version.json` com `{ buildId, builtAt }`). Não há pendência de build para o item #7 — **a parte UX do mesmo item permanece CONFIRMADA** (abaixo).

## CONFIRMADOS (4) + BUG #9 (novo)

### #1 — Realtime com topic estático (8 consumidores; crash no 2º mount) → CONFIRMADO

- Diversos hooks assinam canais com **nome estático** (sem sufixo por instância): `'sla-breaches'`, `'incoming-calls'`, `'team-chat-updates'`, `'notifications:team-chat'`, `'notifications:security'`, `'notifications:goals'`, `'notifications:transcription'`, `'health-updates'`, `'failed_messages_alerts'`, entre outros.
- Evidência de produção (2026-08-05): **8 consumidores** no mesmo tópico; no **2º mount** do consumidor o teardown assíncrono (`removeChannel`) da 1ª inscrição ainda não terminou ⇒ colisão de instância de canal ⇒ erro `postgres_changes callbacks` que derruba o ErrorBoundary (BUG #1 do plano).
- O próprio código reconhece o hazard: `useAgents.ts:70-72` randomiza o topic — *"Topic único por mount — evita reutilizar instância de canal já inscrita cujo teardown (removeChannel assíncrono) ainda não terminou"* — e o plano (Etapas 4–6, auditoria de canais) segue válido.

### #6 — `useMediaUrl` sem mounted guard → CONFIRMADO (baseline)

- O bug era real no baseline do plano: o hook chamava a Edge Function `evolution-api/get-media-base64` mesmo com o componente desmontado, gerando `[WARN] media refresh failed` / toast pós-navegação (BUG #6 do plano).
- Fix já presente no worktree (2026-08-03): `src/features/inbox/hooks/useMediaUrl.ts:171-182` (`mountedRef`) + verificações antes de `setState`/log/toast (linhas 275–315) + teste dedicado (`src/features/inbox/hooks/__tests__/useMediaUrl.test.ts` — "Bug #6: guard de mounted"). Nota no código (linhas 171–175): supabase-js v2 `functions.invoke` não aceita AbortSignal, então o padrão correto é mountedRef.

### #7 (parte UX) — Reload silencioso na 1ª detecção de build novo → CONFIRMADO

- `src/lib/buildVersion.ts:238-262` (`forceBundleRefresh`): purge de caches + SW e `window.location.replace(...)` **sem prompt/toast** — o usuário é recarregado no meio de uma operação.
- O plano (Etapa 19) pedia toast + decisão do usuário (TTM 3.7× pior com reload silencioso).
- Atenuantes existem (cotas anti-loop: `MAX_RELOADS_PER_TARGET=2`/10min, linhas 32–37; cota global, linhas 39–44; evento `zapp-update-required` no estouro de cota, linhas 200–214) — mas a **1ª detecção é silenciosa**.

### #8 — Hook `useContactSummaryBatch` dead code (agora ligado) → CONFIRMADO

- O hook `src/features/inbox/hooks/useContactSummaryBatch.ts` (RPC `zapp.rpc_get_contact_summary_batch`, substituindo os N+1 HEADs de `whisper_messages`/`conversation_tasks`) existia **sem consumidor** — dead code.
- **Agora está ligado**: `src/features/inbox/hooks/useRealtimeInbox.ts:235` (`useContactSummaryBatch(batchContactIds)`) com `whisperCount` derivado do batch (linhas 239–244) e invalidação via canal realtime (linhas 252–296, `whisper-count-<id>` → `invalidateQueries(contactSummaryBatch.batch)`).
- Comentário BUG-2026-08-04 nas linhas 216–221 confirma a substituição do N+1 de HEAD count.

### BUG #9 (NOVO) — `Object.entries` sobre array → CONFIRMADO

- `src/hooks/useExternalApiManagement.ts:117-142`: o consumo de `get_companies_by_phones_batch` assumia resposta como objeto; mas a RPC de produção retorna **ARRAY** de rows (`{phone, company, full_name, lead_status}`). `Object.entries(array)` chaveia por `'0','1',...` ⇒ `lookup(phone)` **nunca acertava**.
- Fix defensivo já no worktree (comentário BUG #9 nas linhas 118–123): (a) array → indexa por `row.phone ?? row.phone_number ?? row.telefone`; (b) objeto → `Object.entries` legado; (c) outro → mapa vazio + warn (linhas 124–142).

## Dívida técnica registrada

| Dívida | Detalhe | Status |
|---|---|---|
| `rpc_get_contact_summary_batch` sem migration versionada | Função aplicada **direto em produção**, fora do versionamento (aparece em `types.ts:75865` e é chamada pelo frontend). | **Capturada** em `supabase/migrations/20260806090000_capture_rpc_get_contact_summary_batch.sql` (CAPTURE — registra a definição viva via `pg_get_functiondef`, 2026-08-05; não é alteração). |
| `rpc_get_reactions_batch` também sem migration versionada | Só existe em produção/`types.ts:75869` + consumer `usePreloadConversationReactions.ts:37`; nenhum arquivo em `supabase/migrations/` a define. | Aberta (mesmo tratamento de captura pendente). |

## Tabela-resumo

| Item do plano | Veredito | Evidência |
|---|---|---|
| #1 Realtime topic estático / crash 2º mount | ✅ CONFIRMADO | canais estáticos; `useAgents.ts:70-72`; produção 8 consumidores |
| #3 Roteamento lovableCloud | ❌ REFUTADO | `externalClient.ts:28-30`; `db.ts:48-57,100-106`; `rpcCatalog.ts:500-503` |
| #4 Mark-as-read N+1 | ❌ REFUTADO | `useConversationActions.ts:22-113` (batch 2026-08-03) |
| #5 Retries AbortError | ❌ REFUTADO | `retry.ts:36`; `client.ts:361-367` |
| #6 useMediaUrl sem mounted guard | ✅ CONFIRMADO (fix 2026-08-03 no worktree) | `useMediaUrl.ts:171-182,275-315` |
| #7 version.json (build) | ❌ REFUTADO | `vite.config.ts:35-47` |
| #7 reload silencioso (UX) | ✅ CONFIRMADO | `buildVersion.ts:238-262` |
| #8 useContactSummaryBatch dead code | ✅ CONFIRMADO (agora ligado) | `useRealtimeInbox.ts:235,239-244,252-296` |
| BUG #9 Object.entries(array) | ✅ CONFIRMADO (novo) | `useExternalApiManagement.ts:117-142` |
| Dívida: RPC batch sem migration | Registrada | captura `20260806090000` |

---

*Documentação de realidade — nenhum arquivo `.ts`/`.tsx` foi modificado para produzir este doc.*
