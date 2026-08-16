# Estado: src/lib (subdirs) + src/utils + src/types — bloco 1E-c

> Runtime: NAO_VERIFICADO | Auditado em: 2026-08-16 | Arquivos lidos: 47/47
> Branch: `claude/validar-levantamento-sistema-uxonxc` @ `43cec38bf`
> Escopo: subdirs de `src/lib/` (exceto `__tests__`), `src/utils/`, `src/types/`.
> NÃO inclui a raiz de `src/lib` (E3) nem `src/lib/__tests__` (E5).

**Profundidade de leitura (honestidade metodológica):**

| Conjunto | Arquivos | Linhas | Profundidade |
|---|---|---|---|
| `src/lib/*/` (não-teste) | 27 | 3.327 | integral |
| `src/utils/` não-teste | 11 | 1.043 | integral |
| `src/utils/**/__tests__` + `*.test.ts` | 9 | 1.013 | inventário (nome/linhas), não lidos |
| `src/types/` | 9 | 1.493 | 3 integrais + 6 por superfície de exports (`rg "^export"`) |

> ⚠️ **Divergência vs. o briefing.** O briefing estimava ~121 arquivos / ~11.400 linhas
> (realtime 2.486, evoApiHealth 1.512, inbox 985 …). A medição real do repo é
> **~6.900 linhas não-teste**. A diferença é que os números do briefing incluíam
> os `__tests__` aninhados de cada subdir (23.131 linhas de teste em `src/lib`,
> das quais 2.375 estão dentro dos subdirs do meu escopo). Números reais medidos
> via `find … | xargs wc -l`.
>
> ⚠️ **Método:** o briefing exigia delegação via ferramenta `Task` em sublotes.
> A ferramenta `Task` **não está disponível** nesta sessão (não consta no tool list
> nem no índice de ferramentas deferidas — `ToolSearch "select:Task"` retorna vazio).
> Como o escopo real é ~40% da estimativa, a leitura foi feita diretamente em
> lotes paralelos de `Read`. Nenhuma afirmação abaixo depende de sumarização
> de terceiros.

---

## 1. Visão Geral

Três conjuntos com maturidades bem diferentes:

- **`src/lib/*/`** — bolsões pequenos e coesos, mas com **alta taxa de código morto**:
  10 dos 27 arquivos (37%) não têm nenhum consumidor de produção. O subdiretório
  `realtime/` concentra o pior caso: um refactor abandonado pela metade
  (4 arquivos, 297 linhas) convivendo com o monólito que ele deveria ter substituído.
- **`src/utils/`** — saudável. Todos os 11 módulos não-teste têm consumidor real;
  `uuid.ts` é infraestrutura crítica (69 importadores). Cobertura de teste boa
  (9 arquivos de teste para 11 de código).
- **`src/types/`** — 100% em uso. `chat.ts` (63 importadores) e
  `evolutionExternal.ts` (13) são contratos centrais. Zero órfãos.

**Nota de nomenclatura importante:** `src/lib/realtime/` **não é Supabase Realtime**.
É (a) deduplicação de fetch entre abas via BroadcastChannel/localStorage e
(b) um parser de rótulos Mermaid para testes. Nenhum arquivo do meu escopo abre
canal Realtime. Ver seção 4.

---

## 2. Tabela de Arquivos (agrupada por subdiretório)

Legenda de status: **EM_USO** = tem importador em código de produção ·
**ORFAO** = zero importadores de produção (teste-only ou nenhum).

### `src/lib/realtime/` — 7 arquivos, 1.511 linhas

| arquivo | linhas | o que faz | status | impl | o que falta |
|---|---|---|---|---|---|
| `crossTabDedupe.ts` | 953 | Dedup de fetch cross-tab: lock CAS em localStorage, BroadcastChannel + fallback storage-event, cache memória/localStorage/IndexedDB, hash SHA-256, ring de dedup, métricas | EM_USO (2: `useExternalEvolution.ts:23`, `useExternalApiManagement.ts:374`) | PARCIAL | compensação de clock skew é no-op (A9); monólito auto-contido de 953 linhas |
| `crossTabDedupeTypes.ts` | 62 | Constantes + interfaces do refactor modular | **ORFAO** | MORTA | importado só pelos 3 órfãos abaixo |
| `crossTabDedupeCache.ts` | 85 | `readPersistedResult`/`writePersistedResult`/`gcLocalStorageKeys` | **ORFAO** | MORTA | nunca ligado ao monólito |
| `crossTabDedupeLock.ts` | 49 | `readLock`/`writeLock`/`releaseLock` (versão síncrona) | **ORFAO** | MORTA | idem |
| `crossTabDedupeTransport.ts` | 101 | `ensureTransport`/`broadcast` com handler injetado | **ORFAO** | MORTA | idem |
| `dedupeTelemetry.ts` | 235 | Contadores hit/miss por reason/keyKind/namespace; snapshot em `window.__dedupeTelemetry` | EM_USO (`crossTabDedupe.ts:32`) | COMPLETA | — |
| `edgeEvents.ts` | 26 | `parseEdgeEvents(label)` — extrai INSERT/UPDATE/DELETE de rótulo Mermaid | ORFAO (teste-only, **por design**) | COMPLETA | — (o cabeçalho declara explicitamente o propósito de teste) |

### `src/lib/evoApiHealth/` — 4 arquivos, 528 linhas

| arquivo | linhas | o que faz | status | impl | o que falta |
|---|---|---|---|---|---|
| `proxy.ts` | 250 | `ExternalDbProxyClient` (singleton `evoApi`): dispatch dinâmico select/update/rpc sobre o cliente Supabase `zapp`, com allowlist de 18 operadores e retry backoff em PGRST106/PGRST002 | EM_USO (via `hooks.ts:3`) | COMPLETA | — |
| `hooks.ts` | 129 | 9 hooks TanStack Query: dashboard, alertas ativos, ack, histórico, canais, DR runbook, test suite | EM_USO (10) | COMPLETA | — |
| `types.ts` | 105 | Contratos das RPCs de health (`DashboardResponse`, `ActiveAlert`, `PipelineReadiness` …) | EM_USO | COMPLETA | — |
| `useEvoApiAlertsBadge.ts` | 44 | Agrega alertas ativos em contagem por severidade para badge da sidebar | EM_USO (2) | COMPLETA | docstring desatualizada (A7) |

### `src/lib/inbox/` — 2 arquivos, 273 linhas

| arquivo | linhas | o que faz | status | impl | o que falta |
|---|---|---|---|---|---|
| `ticketStore.ts` | 249 | Overlay de ticket (status/assign/histórico) em localStorage, com cache p/ `useSyncExternalStore` e sync cross-tab | EM_USO (5 prod) | **STUB (declarado)** | o cabeçalho declara: aguarda `rpc_update_conversation_status` e `rpc_assign_conversation` |
| `chatOptimizations.ts` | 24 | `BATCH_SIZE`, `isNearTop`, `isAtBottom`, `deduplicateMessages` | **ORFAO** (só o próprio teste) | COMPLETA | edge case em `deduplicateMessages` (A11) |

### `src/lib/mcp/` — 4 arquivos, 157 linhas

| arquivo | linhas | o que faz | status | impl | o que falta |
|---|---|---|---|---|---|
| `index.ts` | 24 | `defineMcp` do servidor `zapp-web-mcp`, auth OAuth via issuer Supabase | EM_USO | COMPLETA | fonte de env divergente das tools (A6) |
| `tools/whoami.ts` | 25 | Retorna user_id/email/client_id do chamador | EM_USO | COMPLETA | — |
| `tools/list-connections.ts` | 52 | Lista `whatsapp_connections` (schema `zapp`), respeita RLS | EM_USO | COMPLETA | `supabaseForUser` duplicado (A6) |
| `tools/list-contacts.ts` | 56 | Busca `contacts` por nome/telefone; sanitiza metacaracteres de `.or()` do PostgREST | EM_USO | COMPLETA | `supabaseForUser` duplicado (A6) |

> Verificado: `schema: 'zapp'` correto em ambas as tools (`list-connections.ts:12`,
> `list-contacts.ts:12`) e a tabela `contacts` existe nos tipos gerados.

### Demais subdirs de `src/lib/` — 10 arquivos, 858 linhas

| arquivo | linhas | o que faz | status | impl | o que falta |
|---|---|---|---|---|---|
| `audio/pttLimits.ts` | 123 | Limites PTT (16min/16MB/0.5s) + `probeAudioDuration` + `validatePttBlob` | EM_USO (3) | COMPLETA | — |
| `audio/useAudioPlayer.ts` | 182 | Hook de player com mapeamento de `MediaError.code` e cache negativo | **ORFAO** | MORTA | duplicata do `useAudioPlayer` vivo em `hooks/useAudioManagement.ts:467` (A5) |
| `auth/roleMapping.ts` | 51 | `ROLE_RANK`, `ADMIN_RESOURCES`, `canAccessAdminResource`, `highestRole` | **ORFAO** (só teste) | COMPLETA | nunca ligado à UI de Admin que o cabeçalho descreve |
| `constants/whatsappInstances.ts` | 71 | Registro das instâncias Evolution + coerção/validação | EM_USO (**25**) | COMPLETA | documentação autocontraditória (A2, A3) |
| `errors/queryErrors.ts` | 69 | `isPermanentQueryError` + `tanstackRetry` (401/403/PGRST301/42501/42P01/42883) | EM_USO (5) | COMPLETA | — |
| `errors/rlsError.ts` | 38 | `isRlsDeniedError`, `rlsDeniedMessage`, `formatAdminError` | EM_USO (2) | COMPLETA | — |
| `onboarding/checklistSteps.ts` | 132 | 6 passos de onboarding, cada um com `checkCondition` que consulta o Supabase | EM_USO (1) | COMPLETA | 6 round-trips sequenciais ao DB por avaliação |
| `schemas/supabase.ts` | 54 | `safeParse`/`safeParseList` + schemas Zod de contact/message/conversation | **ORFAO** (0 prod, 0 teste) | MORTA | nunca adotado |
| `types/branded.ts` | 101 | Aliases `Jid`/`Uuid`/`MessageId`, parsers e `TEST_FIXTURES` | **ORFAO** | **PARCIAL (Fase 1 declarada)** | Fase 2 (brand real) nunca feita; duplica `isValidUUID` (A4) |
| `__mocks__/logger.ts` | 37 | Mock manual do logger para Vitest | EM_USO (auto-mock) | COMPLETA | — |

### `src/utils/` — 11 não-teste (1.043 linhas) + 9 de teste (1.013 linhas)

| arquivo | linhas | o que faz | status | impl | o que falta |
|---|---|---|---|---|---|
| `uuid.ts` | 29 | `isValidUUID` — barreira contra JID em coluna uuid (erro 22P02/400) | EM_USO (**69**) | COMPLETA | — |
| `whatsappFileTypes.ts` | 211 | Catálogo de tipos de arquivo WA, validação, `formatFileSize`, `CONTACT_TYPES` | EM_USO (6) | COMPLETA | — |
| `imageCompression.ts` | 185 | Compressão client-side via `createImageBitmap` → webp, alvo 0.8 MB | EM_USO (1) | COMPLETA | — |
| `emailMappers.ts` | 161 | Mapeia linhas cruas do Supabase/RPC para os tipos de `@/types/gmail` | EM_USO (3) | COMPLETA | — |
| `validationLogger.ts` | 151 | Singleton que intercepta console.*/fetch e persiste eventos em localStorage | EM_USO (2) | COMPLETA | efeito colateral no import (A8) |
| `notificationSounds.ts` | 115 | `playNotificationSound` (WebAudio), `requestNotificationPermission`, `showBrowserNotification` | EM_USO (8) | COMPLETA | — |
| `soundConfigs.ts` | 71 | Matriz 5 timbres × 8 tipos de notificação | EM_USO (1) | COMPLETA | — |
| `exportReport.ts` | 37 | `exportToPDF/Excel/CSV` — **todas lançam exceção** (bloqueio LGPD) | EM_USO (3) | **STUB intencional** | A10 |
| `normalizeMediaUrl.ts` | 22 | Corrige artefatos de aspas escapadas em URLs de mídia | EM_USO (1) | COMPLETA | — |
| `notificationSound.ts` | 2 | Barrel de retrocompatibilidade → `notificationSounds` | EM_USO (2) | COMPLETA | — |
| `date/normalize.ts` | 10 | `toValidDate` com fallback | EM_USO (2) | COMPLETA | — |
| *(testes)* `__tests__/*` ×7, `date/__tests__/normalize.test.ts`, `emailMappers.test.ts` | 1.013 | — | — | — | inventariados, não lidos |

### `src/types/` — 9 arquivos, 1.493 linhas — **zero órfãos**

| arquivo | linhas | o que faz | status | impl | o que falta |
|---|---|---|---|---|---|
| `externalDB.ts` | 546 | 24 interfaces `Ext*` (CRM/vendas/logística) + `ExternalTableName` e labels | EM_USO (5) | COMPLETA | — |
| `chat.ts` | 234 | `Message`, `Conversation`, `Contact`, `Agent`, `Queue`, mensagens interativas | EM_USO (**63**) | COMPLETA | — |
| `evolutionExternal.ts` | 201 | `EvolutionMessage`/`Lite`, `EvolutionContact/Conversation`, `toEvolutionMessageLite` | EM_USO (13) | COMPLETA | — |
| `contact360.ts` | 180 | 12 interfaces do agregado Contact360 (RFM, stakeholders, behavior) | EM_USO (2) | COMPLETA | — |
| `gmail.ts` | 161 | Contratos de conta/thread/draft/SLA de e-mail | EM_USO (7) | COMPLETA | — |
| `messageStatus.ts` | 76 | `MessageUIStatus`, `MessageStatusDbRow`, `MessageStatusDetail` | EM_USO (2) | COMPLETA | — |
| `speech-recognition.d.ts` | 61 | Declarações ambiente da Web Speech API | EM_USO (ambient; 5 consumidores de `SpeechRecognition`) | COMPLETA | — |
| `mediaRefresh.ts` | 19 | `MediaRefreshKey` para re-hidratação de mídia expirada | EM_USO (2) | COMPLETA | — |
| `incomingCall.ts` | 15 | `IncomingCall` compartilhado entre listener e broadcast | EM_USO (2) | COMPLETA | — |

---

## 3. Chamado Por

Consumidores de produção fora do meu escopo (amostra com evidência):

| módulo | chamado por |
|---|---|
| `lib/realtime/crossTabDedupe` | `src/hooks/useExternalEvolution.ts:23`, `src/hooks/useExternalApiManagement.ts:374` |
| `lib/constants/whatsappInstances` | 25 arquivos (hooks de inbox, features/admin, services) |
| `lib/inbox/ticketStore` | `features/inbox/hooks/useTicketStatus.ts:5`, `components/CloseConversationDialog.tsx:3`, `chat/useChatPanelHandlers.ts:18`, `components/TicketHistorySheet.tsx:32`, `chat/TicketActionsBar.tsx:36` |
| `lib/errors/rlsError` | `features/admin/hooks/monitoring/useTransfersPaginated.ts:11`, `…/useFailedMessages.ts:9` |
| `lib/onboarding/checklistSteps` | `components/onboarding/OnboardingChecklist.tsx:13-14` |
| `lib/evoApiHealth/hooks` | 10 arquivos (AdminEvoApiHealthPage e sidebar) |
| `utils/uuid` | 69 arquivos — guarda anti-22P02 espalhada por hooks e services |
| `utils/validationLogger` | `components/providers/ValidationProvider.tsx`, `components/debug/BuildValidationOverlay.tsx` |
| `types/chat` | 63 arquivos |

---

## 4. Conformidade do subsistema realtime (partition root)

**Veredito: CONFORME — nenhuma violação da regra de partition root no escopo 1E-c.**

Varredura executada sobre os 47 arquivos do escopo com o padrão
`schema:\s*['"]|postgres_changes|\.channel\(|evolution_messages|evolution_conversations|evolution_contacts|_wpp2|publish_via|\.schema\(`:

| Verificação | Resultado |
|---|---|
| `.channel(...)` / subscription Realtime | **0 ocorrências** — nenhum arquivo do escopo abre canal |
| `.schema('evo')` ou `schema: 'evo'` | **0 ocorrências** |
| Referência a partição (`*_wpp2`) como alvo de subscription | **0 ocorrências** |
| Subscription sobre view | **0 ocorrências** |
| Declarações de schema encontradas | 2, ambas **corretas**: `schema: 'zapp'` em `src/lib/mcp/tools/list-connections.ts:12` e `list-contacts.ts:12` |

Menções a `evolution_messages`/`_contacts`/`_conversations` no escopo são
**apenas comentários e nomes de interface TypeScript** (`src/types/evolutionExternal.ts:5,53,154,171,185`;
`src/types/chat.ts:154`) — nenhuma delas emite query ou subscription, portanto
não podem violar a topologia.

**Ressalva de nomenclatura (não é violação, mas induz erro):**
`src/lib/realtime/` **não contém nada de Supabase Realtime**. Contém dedup de
fetch entre abas (BroadcastChannel/localStorage) e um parser de rótulo Mermaid.
Um agente futuro buscando "onde ficam os listeners realtime" cairá aqui primeiro
e não encontrará o que procura — os listeners reais estão em `src/hooks/`
(fora deste bloco). Registrado como A12.

`src/types/incomingCall.ts:3` documenta que `useIncomingCallListener` usa
`postgres_changes` "legacy" e `useIncomingCallBroadcast` usa broadcast — a
conformidade **desses hooks** está fora do escopo 1E-c e fica **NAO_VERIFICADO**
aqui; recomendo que o agente dono de `src/hooks/` confirme.

---

## 5. Órfãos (veredito SEGURO / VERIFICAR / NAO_REMOVER)

10 arquivos (≈740 linhas) sem consumidor de produção.

| arquivo | linhas | evidência | veredito |
|---|---|---|---|
| `lib/realtime/crossTabDedupeCache.ts` | 85 | 0 importadores (`rg "crossTabDedupeCache"` → só a própria definição) | **SEGURO** |
| `lib/realtime/crossTabDedupeLock.ts` | 49 | 0 importadores | **SEGURO** |
| `lib/realtime/crossTabDedupeTransport.ts` | 101 | 0 importadores | **SEGURO** |
| `lib/realtime/crossTabDedupeTypes.ts` | 62 | importado só pelos 3 acima (`crossTabDedupeLock.ts:1`, `Cache.ts:7`, `Transport.ts:9`) | **SEGURO** (remover como bloco único com os 3) |
| `lib/schemas/supabase.ts` | 54 | `rg "from '@/lib/schemas/supabase'"` → 0 resultados, inclusive em testes | **SEGURO** |
| `lib/audio/useAudioPlayer.ts` | 182 | 0 importadores; implementação viva e usada é `hooks/useAudioManagement.ts:467`, consumida em `features/inbox/components/AudioMessagePlayer.tsx:7` | **VERIFICAR** — confirmar que nenhuma feature planejada depende do cache negativo via `markMediaUrlFailed` daqui antes de apagar |
| `lib/types/branded.ts` | 101 | 0 importadores; o próprio arquivo declara-se "FASE 1" de uma migração | **VERIFICAR** — decisão de produto: concluir a Fase 2 ou abandonar. Remover fecha a porta a uma intenção documentada |
| `lib/auth/roleMapping.ts` | 51 | só `src/__tests__/dlq-transfers-rls.test.ts:12` | **VERIFICAR** — o cabeçalho afirma alinhar-se a `rpc_list_failed_messages`/`rpc_dlq_list_audit`/`rpc_list_transfers_paginated`; se a UI de Admin faz esse gate por outro caminho, há **duas fontes de verdade de autorização** |
| `lib/inbox/chatOptimizations.ts` | 24 | só `lib/inbox/__tests__/chatOptimizations.test.ts:7` | **VERIFICAR** — 216 linhas de teste para 24 de código sem consumidor |
| `lib/realtime/edgeEvents.ts` | 26 | só testes (`src/test/realtimeFanoutEvents.test.ts:4`, `lib/realtime/__tests__/edgeEvents.test.ts:2`) | **NAO_REMOVER** — teste-only **por design**, declarado no cabeçalho (`edgeEvents.ts:1-7`) |

---

## 6. Achados

| ID | caminho:linha | severidade | achado |
|---|---|---|---|
| **A1** | `src/lib/realtime/crossTabDedupe{Types,Cache,Lock,Transport}.ts` | **ALTA** | **Refactor abandonado convivendo com o monólito.** `crossTabDedupe.ts` (953 linhas) **redeclara localmente** todas as constantes e funções (`LS_LOCK_PREFIX:36`, `readLock:448`, `writeLock:467`, `ensureTransport:341`, `broadcast:645`, `readPersistedResult:507`) em vez de importar dos 4 módulos que existem exatamente para isso. Os 4 nunca foram ligados. Pior: **a semântica divergiu** — o `BroadcastMessage` do monólito (`:74-85`) tem `version`, `sequence` e o tipo `'clock-tick'`; o de `crossTabDedupeTypes.ts:37-46` não tem nenhum dos três. `LockPayload` idem (`:60-65` vs `Types:30-34`). Risco concreto: um agente que edite o arquivo modular acreditará ter corrigido o comportamento de produção e não terá mudado nada. |
| **A2** | `src/lib/constants/whatsappInstances.ts:10-15` vs `:24-31` | **ALTA** | **Documentação autocontraditória num arquivo com 25 importadores.** O cabeçalho (`:10-15`) afirma: `wpp2` = PRODUTIVA (12.527 conversas), `wpp_pink_test` = TESTE (`is_active=false`, `status='archived'`, 0 mensagens) — e alerta que apontar para `wpp_pink_test` "zerava a sidebar". Mas os comentários inline dizem o **oposto**: `:25-26` marca `wpp2` como "Instância legada — dados históricos até Maio 2026" e `:27-28` marca `wpp_pink_test` como "Instância ATIVA atual". As constantes (`ACTIVE_WHATSAPP_INSTANCE = 'wpp2'`, `:47`) concordam com o cabeçalho, logo **os comentários inline estão errados** — e são exatamente a armadilha que o cabeçalho documenta como já tendo causado incidente. |
| **A3** | `src/lib/constants/whatsappInstances.ts:56-58` | **MÉDIA** | `SELECTABLE_WHATSAPP_INSTANCES` filtra apenas `'default'`, portanto **expõe `wpp_pink_test` na UI** — uma instância que o próprio cabeçalho descreve como arquivada, `is_active=false` e sem tráfego. Selecionar essa opção reproduz o incidente de sidebar zerada descrito em `:13-15`. |
| **A4** | `src/utils/uuid.ts:26` vs `src/lib/types/branded.ts:85` | **MÉDIA** | **Validação de UUID duplicada com adoção assimétrica.** `isValidUUID` (utils, 69 importadores) e `isValidUuid` (branded, 0 importadores) usam regex idêntica mas assinaturas diferentes (`string\|null\|undefined` vs `unknown`) e `branded` faz `.trim()` antes de testar — logo `" <uuid> "` é aceito por um e rejeitado pelo outro. Só a versão sem `trim()` está em produção. |
| **A5** | `src/lib/audio/useAudioPlayer.ts` vs `src/hooks/useAudioManagement.ts:467` | **MÉDIA** | **Dois hooks `useAudioPlayer` com o mesmo nome**; o de `src/lib/audio/` (182 linhas, com mapeamento de `MediaError.code` e cache negativo via `markMediaUrlFailed`) tem 0 importadores, enquanto o de `hooks/useAudioManagement.ts` é o consumido por `AudioMessagePlayer.tsx:7`. Import por autocomplete escolhe o errado com facilidade. |
| **A6** | `src/lib/mcp/index.ts:7` vs `tools/list-connections.ts:6-7` e `tools/list-contacts.ts:6-7` | **MÉDIA-BAIXA** | **Fontes de env divergentes no mesmo módulo.** `index.ts` lê `import.meta.env.VITE_SUPABASE_URL` (build Vite, com throw se ausente); as tools leem `process.env.SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY ?? SUPABASE_ANON_KEY` (runtime Node, **sem validação** — um `undefined` vira `createClient(undefined, undefined)`). Além disso `supabaseForUser` está **duplicado literalmente** nos dois arquivos de tool (`list-connections.ts:5-17` ≡ `list-contacts.ts:5-17`). |
| **A7** | `src/lib/evoApiHealth/useEvoApiAlertsBadge.ts:17` | **BAIXA** | Docstring afirma "`useActiveAlerts` — 15s refetch", mas `hooks.ts:23` usa `refetchMs = 60_000` com `staleTime: 60_000` — o comentário em `hooks.ts:34-37` inclusive documenta a mudança de 15s→60s. A docstring do badge ficou para trás. |
| **A8** | `src/utils/validationLogger.ts:147-151` | **BAIXA** | **Efeito colateral no import**: instanciar o módulo executa o construtor, que chama `loadPersistedEvents()` (lê e faz `JSON.parse` de `localStorage`) e escreve `window.__zappValidationLogger`. `setupInterceptors()` protege o monkey-patch de `console.*`/`fetch` com `if (import.meta.env.PROD) return` (`:39`), então **os patches não vazam para produção** — mas a leitura de localStorage e a propriedade global vazam. Importar este módulo nunca é gratuito. |
| **A9** | `src/lib/realtime/crossTabDedupe.ts:102-109, 191-198, 646-665` | **BAIXA** | **"Clock Skew Compensation" (MELHORIA #8.5) é efetivamente no-op.** `masterClockOffset` é inicializado em `0` (`:104`) e o único ponto que o transmite (`:655`) envia `masterClockOffset: 0` fixo — nunca há cálculo de desvio entre relógios. Portanto `getNormalizedTime()` (`:107`) é sempre `Date.now()`. A feature está documentada no cabeçalho (`:9`) como entregue; a implementação é decorativa. |
| **A10** | `src/utils/exportReport.ts:22-37` | **BAIXA (informativo)** | As três funções de export são stubs que **sempre lançam** `Error(BLOCKED_MESSAGE)` por política LGPD declarada (`:1-4`). É intencional, mas há **3 importadores de produção** que recebem exceção garantida — vale confirmar que todos tratam o throw como caminho esperado e não como falha. |
| **A11** | `src/lib/inbox/chatOptimizations.ts:20-23` | **BAIXA** | `deduplicateMessages` monta `existingIds` com `item.message_id ?? item.id` (uma chave por item) mas filtra testando **as duas** chaves do item recebido. Se um item existente tiver `message_id` definido e o recebido só tiver `id` igual, não deduplica; e se algum item existente tiver ambos `undefined`, o `Set` passa a conter `undefined` e descarta todo recebido sem `message_id`. Módulo é órfão (só teste), então o impacto hoje é nulo. |
| **A12** | `src/lib/realtime/` (nome do diretório) | **BAIXA** | Diretório chamado `realtime/` que **não contém Supabase Realtime** — só dedup cross-tab e um parser Mermaid. Nenhum `.channel()` aqui. Induz busca errada quando alguém investiga a regra de partition root. Sugestão: renomear para `crossTab/` ou documentar no topo. |

---

### Resumo quantitativo

| métrica | valor |
|---|---|
| Arquivos no escopo | 47 (27 lib-subdirs + 11 utils não-teste + 9 types) |
| Linhas não-teste auditadas | ~5.863 |
| Órfãos | 10 arquivos / ~740 linhas |
| Impl MORTA | 6 · **STUB** 3 (2 declarados) · **PARCIAL** 2 |
| Violações de partition root | **0** |
| Achados | 2 ALTA · 3 MÉDIA · 1 MÉDIA-BAIXA · 6 BAIXA |
