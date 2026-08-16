# Estado: src/adapters + src/integrations/__tests__ (batch 8H)
> Runtime: NAO_VERIFICADO | Auditado em: 2026-08-16 | Arquivos lidos: 10/10

---

> ## ⚠️ CORREÇÃO DO ORQUESTRADOR — 2026-08-16, pós-publicação
>
> **Os achados A1 e A2 abaixo estão INVERTIDOS. NÃO aplicar a correção que eles recomendam.**
>
> Este documento foi produzido sob um briefing errado meu, que afirmava que
> `evolution_messages`/`_conversations`/`_contacts` eram tabelas físicas em `zapp` e que
> `evo.evolution_*` não existia. **É o contrário.** Verificado ao vivo via `pg_class`
> nesta data:
>
> | objeto | `evo` | `zapp` |
> |---|---|---|
> | `evolution_messages` | **tabela particionada** (física) | VIEW |
> | `evolution_conversations` | **tabela particionada** (física) | VIEW |
> | `evolution_contacts` | **tabela** (física) | VIEW |
>
> Causa: a migration `20260816250003_decouple_e73_e75_i4_zero.sql` (ADR-I4, commit
> `a3c1dc952`) moveu as tabelas de volta `zapp`→`evo` às 11:50Z de 2026-08-16, cerca de
> uma hora antes desta auditoria, criando bridge views em `zapp`.
>
> **Consequência prática:** trocar `schema: 'evo'` por `schema: 'zapp'` nos hooks
> apontaria a subscription para uma **VIEW**, e view nunca emite CDC. A troca
> introduziria a quebra que o achado pretendia corrigir.
>
> **Ressalva que continua válida, por outro motivo:** `evolution_messages` e
> `evolution_conversations` **não estão na publication `supabase_realtime` em nenhum
> schema** (só `evo.evolution_contacts`, `zapp.evolution_alerts` e
> `zapp.evolution_realtime_events` estão). Logo as subscriptions de mensagens e
> conversas realmente não recebem eventos — mas a causa é ausência na publication, não
> o schema. O diagnóstico de sintoma estava certo; a causa e o fix, errados.
>
> A topologia mudou três vezes em sete dias. Revalidar `relkind` ao vivo antes de agir
> sobre qualquer afirmação de schema neste documento.

---

## 1. Visão Geral

Batch 8H cobre 1 módulo de produção (`src/adapters/evolution/messageTypes.ts`) e 9 arquivos de
teste (2 em `src/adapters`, 5 em `src/integrations/supabase/__tests__`, 2 em
`src/integrations/zappweb/hooks/__tests__`).

**Correção de caminho:** o escopo pedia `src/adapters/messageTypes.ts` e
`src/adapters/__tests__/messageTypes.test.ts`. Esses caminhos **não existem**. Os arquivos reais são
`src/adapters/evolution/messageTypes.ts` e `src/adapters/evolution/__tests__/messageTypes.test.ts`
(confirmado por `find` sobre `src/adapters`, que retorna exatamente 6 arquivos).

**SUTs — todos existem.** Nenhum teste deste batch é código morto por alvo removido:

| teste | SUT | existe? |
|---|---|---|
| `evolutionAdapter.test.ts` | `src/adapters/evolutionAdapter.ts` | SIM (199 linhas) |
| `evolution/__tests__/messageTypes.test.ts` | `src/adapters/evolution/messageTypes.ts` | SIM (72 linhas) |
| `channelErrorLogging.test.ts` | `src/integrations/supabase/channelErrorLogging.ts` | SIM |
| `columnMap.test.ts` | `columnMap.ts` + `rowNormalizers.ts` | SIM (ambos) |
| `connectivityMonitor.test.ts` | `src/integrations/supabase/connectivityMonitor.ts` | SIM |
| `connectivityMonitor.nocors.test.ts` | idem acima | SIM |
| `semaphore-priority.test.ts` | `src/integrations/supabase/client.ts` | SIM |
| `useZappConversations.test.tsx` | `../useZappConversations.ts` | SIM |
| `useZappMessages.test.tsx` | `../useZappMessages.ts` | SIM |

**Todos os 10 arquivos entram na suíte vitest.** `vitest.config.ts:20` inclui
`src/**/*.{test,spec}.{ts,tsx}`; a lista de quarentena (`vitest.config.ts:21-78`) **não** contém
nenhum destes arquivos. Isso diz que eles *são coletados* — **não** afirma que passam (toolchain
não roda neste ambiente; ver cabeçalho).

O achado mais grave do batch não está no adapter: é a **defasagem de topologia** nos hooks zappweb,
onde o teste `useZappConversations.test.tsx` **congela por asserção** uma subscription Realtime em
`schema: 'evo'` — schema onde as relações físicas já não existem (A1/A2 abaixo).

## 2. Tabela de Arquivos

| arquivo | linhas | o que faz | status | impl | o que falta |
|---|---|---|---|---|---|
| `src/adapters/evolution/messageTypes.ts` | 72 | Blueprint de 19 tipos de mensagem WhatsApp → `{internalType, category, supported, label}`; 9 aliases curtos; fallback `unsupported/unknown` | EM_USO | COMPLETA | nada crítico; ver A5 (aliases parciais) |
| `src/adapters/__tests__/evolutionAdapter.test.ts` | 579 | 61 casos sobre `jidToPhone`, `evolutionToRealtimeMessage`, `deriveContactsFromMessages`, `derivedToConversationContact`, `buildExternalConversations` | EM_USO | COMPLETA | não cobre `isArchived` (A4) nem alias curto `'audio'` no ramo PTT |
| `src/adapters/evolution/__tests__/messageTypes.test.ts` | 188 | 33 casos: nulos/vazios, 19 chaves canônicas, 9 aliases, desconhecido, trim | EM_USO | COMPLETA | nenhum tipo do blueprint sem cobertura relevante |
| `src/integrations/supabase/__tests__/channelErrorLogging.test.ts` | 147 | Classificação de CHANNEL_ERROR (warn/info/debug) + garantia de que logger que lança não rejeita | EM_USO | COMPLETA | não cobre o `catch` do import dinâmico do monitor (`channelErrorLogging.ts:49-51`) |
| `src/integrations/supabase/__tests__/columnMap.test.ts` | 85 | `select()`/`only`/`include`, `resolvePhysicalColumn`, `normalizeConnection`, `normalizeContact`, `evolutionInstanceName` | EM_USO | PARCIAL | cobre 2 dos 6 mapas (`whatsapp_connections`, `contacts` parcial); `messagesMap` só no embed; `failedMessagesMap`, `queueMembersMap`, `profilesMap` e `normalizeMessage` sem cobertura (A6) |
| `src/integrations/supabase/__tests__/connectivityMonitor.nocors.test.ts` | 81 | Probe `mode:'no-cors'`: resposta opaca → online; TypeError → backend-down; ausência de header custom/apikey | EM_USO | COMPLETA | — |
| `src/integrations/supabase/__tests__/connectivityMonitor.test.ts` | 177 | Ping, debounce, `reportSupabaseRequestFailure`, eventos online/offline, ciclo do heartbeat, pausa por aba oculta | EM_USO | COMPLETA | — |
| `src/integrations/supabase/__tests__/semaphore-priority.test.ts` | 237 | Semáforo de 8 slots: prioridade `high` fura FIFO, FIFO normal, `withSupabaseHighPriority` + `retryFetch`, release idempotente, depth counter em highs concorrentes | EM_USO | COMPLETA | teste 2 tem asserção sem valor (A7) |
| `src/integrations/zappweb/hooks/__tests__/useZappConversations.test.tsx` | 127 | Fetch sem `.schema()`, config do channel Realtime, `markAsRead` via RPC, `refetch` | EM_USO | COMPLETA | **asserção congela topologia obsoleta** (A1) |
| `src/integrations/zappweb/hooks/__tests__/useZappMessages.test.tsx` | 97 | 3 casos de tratamento de erro no fetch: envelope 422 de contrato, `Error` genérico, envelope de domínio | EM_USO | PARCIAL | não cobre o Realtime (INSERT/UPDATE) nem o `safeParseEvent` do hook — justamente onde vive A2 |

Legenda de status: EM_USO = arquivo é coletado pela suíte (testes) ou importado por código de
produção (módulo). Nenhum ORFAO neste batch.

## 3. Chamado Por

**`src/adapters/evolution/messageTypes.ts`** — `rg -l "extractMessageType|evolution/messageTypes" src/ supabase/ scripts/`:
- `src/adapters/evolutionAdapter.ts:10` (import) e `:12` (`export * from './evolution/messageTypes'` — re-export do barrel)
- `src/features/inbox/components/chat/MessageBubble.tsx`
- `src/features/inbox/components/chat/messageBubbleParts.tsx`
- `src/features/inbox/components/chat/MessageBubbleUnsupported.tsx`
- (+ o próprio teste)

**`src/adapters/evolutionAdapter.ts`** (SUT do teste) — `rg -l "evolutionAdapter|buildExternalConversations|deriveContactsFromMessages|evolutionToRealtimeMessage|derivedToConversationContact|jidToPhone" src/ supabase/ scripts/`:
- `src/domain/messaging/types.ts`, `src/lib/openContactInChat.ts`
- `src/features/inbox/hooks/realtime/externalAudioSender.ts`, `externalMessageSender.ts`
- `src/hooks/useExternalApiManagement.ts`, `src/hooks/useExternalEvolution.ts`
- `src/features/contacts/hooks/useContactEnrichedData.ts`
- `src/features/inbox/components/chat/MessageBubble.tsx`, `messageBubbleParts.tsx`, `MessageBubbleUnsupported.tsx`
- testes: `src/lib/__tests__/openContactInChat.test.ts`, `src/hooks/__tests__/useExternalEvolution.reconcile.test.ts`

**`useZappConversations` / `useZappMessages`** — `rg -l` sobre `src/`:
- `src/pages/admin/ZappWebbDemoPage.tsx` (único consumidor de produção de ambos)
- `src/integrations/zappweb/index.ts` (barrel, linhas de re-export)
- `src/__tests__/conversation-transfers-events.integration.test.ts` (menciona `useZappMessages`)

A `ZappWebbDemoPage` está **roteada**: `src/components/routing/AdminRoutes.tsx:22` (lazy import) e
`:193-199` — rota `/admin/zappweb-demo` sob `ProtectedRoute requiredRoles={['admin','dev','manager']}`.
Se essa rota recebe tráfego real em produção é NAO_VERIFICADO (nome e path sugerem demo).

**Arquivos de teste (os 9):** não são importados por nenhum módulo — são coletados diretamente pelo
runner via `vitest.config.ts:20`. "Chamado por" = vitest.

## 4. Órfãos

Nenhum órfão. Todos os 9 testes têm SUT presente e todos os 10 arquivos estão dentro do padrão de
coleta do vitest sem quarentena.

| arquivo | veredito | justificativa |
|---|---|---|
| todos os 10 do batch | **NAO_REMOVER** | SUT presente em 9/9; o único módulo de produção tem 5 importadores fora de teste |

Ressalva sobre `useZappConversations.test.tsx`: **NAO_REMOVER, mas CORRIGIR**. Ele não é código
morto — é pior: é um teste verde que trava uma topologia obsoleta (A1). Removê-lo perderia a
cobertura do "sem `.schema()`", que continua válida.

## 5. Achados

### A1 — Teste congela subscription Realtime em `schema: 'evo'` (obsoleta) — 🔴 CRÍTICO
`src/integrations/zappweb/hooks/__tests__/useZappConversations.test.tsx:79-95` **exige por asserção**
que o channel seja registrado com `schema: 'evo', table: 'evolution_conversations'`:
```
expect(channel.on).toHaveBeenCalledWith('postgres_changes',
  expect.objectContaining({ schema: 'evo', table: 'evolution_conversations', ... }), ...)
```
O título do teste chega a chamar isso de "obrigatório p/ partição root".
Pela topologia medida ao vivo em 2026-08-16, `evo.evolution_conversations` **não existe** — a raiz
particionada física está em `zapp`. Subscription em `schema:'evo'` recebe **zero eventos**.
Efeito duplo: (a) documenta o errado; (b) qualquer correção do hook para `schema:'zapp'`
**quebra este teste**, criando pressão para reverter o fix.

### A2 — Hooks zappweb assinam Realtime em schema inexistente — 🔴 CRÍTICO
Origem do problema que A1 protege:
- `src/integrations/zappweb/hooks/useZappConversations.ts:61-65` — `schema: 'evo'`, `table: 'evolution_conversations'`
- `src/integrations/zappweb/hooks/useZappMessages.ts:74-78` (INSERT) e `:94-98` (UPDATE) — `schema: 'evo'`, `table: 'evolution_messages'`

Os comentários no código raciocinam corretamente sobre `publish_via_partition_root=true` (usar a
raiz, não a partição) mas erram o schema. Consequência prática: a `ZappWebbDemoPage` nunca recebe
INSERT/UPDATE em tempo real; a lista só atualiza via `refetch` manual. Os `from()` de leitura
(`useZappConversations.ts:30`, `useZappMessages.ts:32`) estão corretos — usam o client default
(schema `zapp`) sobre as partições `evolution_conversations_wpp2` / `evolution_messages_wpp2`.
Correção mínima: trocar `schema: 'evo'` por `schema: 'zapp'` nos 3 pontos **e** relaxar a asserção
de A1 no mesmo commit.

### A3 — Cobertura de Realtime ausente exatamente onde o bug vive — 🟠 ALTO
`useZappMessages.test.tsx:62-97` cobre apenas os 3 caminhos de erro do `fetchAll`. Os dois handlers
`postgres_changes` do hook (`useZappMessages.ts:70-110`), incluindo o `safeParseEvent` que descarta
payload inválido (`:81-84`, `:101-105`), não têm nenhum teste. Por isso A2 passou despercebido em
`useZappMessages` — não há teste que sequer inspecione a config do channel ali, ao contrário do
irmão `useZappConversations`.

### A4 — `isArchived` sempre `false` (ramo morto) — 🟡 MÉDIO
`src/adapters/evolutionAdapter.ts:196` calcula `isArchived: Boolean(contact.deleted_at)`, mas
`derivedToConversationContact` (`:145-168`) **nunca** atribui `deleted_at` — e `DerivedContact`
(`src/types/evolutionExternal.ts:187-201`) não tem esse campo. `deleted_at` é opcional em
`ConversationContact` (`src/features/inbox/hooks/realtime/types.ts:77`), então não há erro de tipo:
a expressão é silenciosamente sempre `false`. Nenhum dos 61 casos de
`evolutionAdapter.test.ts` toca `isArchived`, o que explica a passagem despercebida.

### A5 — Ramo PTT usa comparação literal em vez de `extractMessageType` — 🟡 MÉDIO
`src/adapters/evolutionAdapter.ts:33-39` condiciona a cópia de `ptt` a
`evo.message_type === 'audioMessage' || evo.message_type === 'audio'` — string literal, enquanto o
resto da função já normalizou via `msgType` (`:21`). Funciona hoje porque `SHORT_ALIASES`
(`messageTypes.ts:44-54`) mapeia só esses dois para áudio, mas é acoplamento duplicado: qualquer
alias novo de áudio no blueprint passa a ser ignorado pelo ramo PTT sem quebrar teste algum
(`evolutionAdapter.test.ts:274-302` só exercita `'audioMessage'`). Sugestão: usar
`msgType.internalType === 'audio'`.

### A6 — `columnMap.test.ts` cobre 2 de 6 mapas — 🟡 MÉDIO
`src/integrations/supabase/__tests__/columnMap.test.ts` (85 linhas) exercita
`whatsappConnectionsMap` a fundo e `contactsMap` por um caso (`:60-65`). `messagesMap` aparece só
no teste de embed (`:18-21`). Sem nenhum teste: `profilesMap` (`columnMap.ts:159`),
`failedMessagesMap` (`:266`), `queueMembersMap` (`:296`) e `normalizeMessage`
(`rowNormalizers.ts:104`). Como o valor destes mapas é justamente blindar alias legado ↔ canônico,
a lacuna é material.

### A7 — Asserção sem valor em `semaphore-priority.test.ts` — 🟢 BAIXO
`src/integrations/supabase/__tests__/semaphore-priority.test.ts:113`:
`expect(second).not.toBe('second')` — `second` é uma `Promise`, jamais igual à string `'second'`.
A asserção é vacuamente verdadeira e nunca falharia. A intenção provável era verificar que a
segunda aquisição **ainda não resolveu** (padrão usado corretamente em `:79-84` com a flag
`anyNormalResolved`). Não invalida o resto do arquivo, que é sólido.

### A8 — Caminho de import divergente do escopo declarado — 🟢 BAIXO
Não existem `src/adapters/messageTypes.ts` nem `src/adapters/__tests__/messageTypes.test.ts`. Os
arquivos vivem sob `src/adapters/evolution/`. O que provavelmente gerou a confusão é
`src/adapters/evolutionAdapter.ts:12` (`export * from './evolution/messageTypes'`), que faz
`extractMessageType` parecer morar no nível raiz de `adapters`. Registrado para não gerar caça a
"arquivo faltando" em auditorias futuras.
