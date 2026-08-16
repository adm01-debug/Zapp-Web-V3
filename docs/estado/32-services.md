# Estado: src/services (bloco 1E-a)

> Runtime: NAO_VERIFICADO | Auditado em: 2026-08-16 | Arquivos lidos: 46/46
> (41 lidos integralmente; 5 arquivos de teste lidos por índice de `describe`/imports —
> `connections/__tests__/*.test.ts` (4) e `email/__tests__/emailHealthService.test.ts`)
>
> Nada foi executado: sem `node_modules`, sem build, sem testes, sem acesso ao banco.
> Toda afirmação abaixo vem de leitura estática de código.

---

## 1. Visão Geral

`src/services/` é uma camada **Repository → Service → Hooks (TanStack Query)** com 8 pastas
(`api`, `connections`, `contacts`, `email`, `messages`, `queues`, `settings`, `users`),
46 arquivos, 5.448 linhas.

**Achado estrutural dominante:** apesar do tamanho, apenas **4 pontos de entrada** da pasta
são consumidos fora de `src/services/`:

| Ponto de entrada | Consumidores externos |
|---|---|
| `api/queryKeys.ts` (`queryKeys`) | **168 arquivos** — o único artefato realmente central |
| `connections/BridgeService.ts` | 1 (`src/hooks/connections/useConnectionsManagement.ts:4`) |
| `contacts/contactsRepository.ts` + `contacts/useContactsMutations.ts` | 2 (`src/features/inbox/hooks/useInboxBulkActions.ts:7`, `useArchiveConversationActions.ts:2`) |
| `email/*` (`emailApi`, `emailHealthService`, `types`) | 3 (`AdminEmailAuditPage.tsx:25`, `admin/email/useEmailHealthStatus.ts:5`, `hooks/useGmailHealth.ts:2`) |

Todo o resto — as **factories de query/mutation**, o `genericService`, e os domínios
`messages`, `queues`, `settings`, `users` inteiros, mais a maior parte de `connections` e
`contacts` — só é referenciado **de dentro de `src/services/`** (auto-consumo) ou por
nenhum arquivo. Verificação: `rg -l "useListQuery|useCreateMutation|useDetailQuery" src supabase --glob '!src/services/**'` → **0 resultados**.

O padrão de arquitetura foi construído por completo (repos, services, hooks, barrels, testes)
mas a aplicação **não migrou para ele**: hooks de produção vivem em `src/hooks/` e
`src/features/*/hooks/`, consumindo `supabase` direto e apenas importando `queryKeys` daqui.

**Nomenclatura vs. topologia (defasagem):** `messages/messagesRepository.ts` documenta
`evolution_messages`/`evolution_conversations` como estando em `evo` — falso desde a
migração evo→zapp (ver §5, A1). Não há uso de `EVOLUTION_API_URL` nem chamadas HTTP diretas
à Evolution API em `src/services/` (`rg -n "EVOLUTION_API_URL" src/services` → 0) —
**nenhuma violação do gateway** neste bloco.

---

## 2. Tabela de Arquivos

### 2.1 `src/services/api/` — factories e chaves de cache

| arquivo | linhas | o que faz | tabelas/RPCs tocadas | status | impl | o que falta |
|---|---|---|---|---|---|---|
| `api/queryKeys.ts` | 638 | Catálogo central de chaves TanStack: 52 namespaces (`contacts`…`contactSummaryBatch`) | nenhuma (só strings) | **EM_USO** (168 arquivos) | COMPLETA | chaves inconsistentes p/ invalidação em `users`/`messages` (A5, A6); `settings.workspace()` sem `workspaceId` (A4) |
| `api/index.ts` | 31 | Barrel: reexporta `queryKeys` + 8 factories de query + 6 de mutation | — | **EM_USO** (só `queryKeys` é consumido; consta em `scripts/dead-code-allowlist.txt:168`) | COMPLETA | exporta 13 símbolos sem nenhum consumidor externo |
| `api/types.ts` | 65 | 9 interfaces (`ListResponse`, `QueryParams`, `SupabaseError`…) | — | EM_USO (interno) | COMPLETA | `QueryParams` só define `page`/`pageSize`; código usa `limit`/`offset` que só passam pela index signature (A7) |
| `api/genericService.ts` | 307 | `createService(table)` — CRUD genérico + `subscribe()` realtime + `applyRetry()` | tabela dinâmica via `supabase.from(t)`; realtime `schema: 'zapp'` default (`:30`) | EM_USO (interno; 5 repositories) | **PARCIAL** | `deleteMany` sempre retorna 0 (A3); `db` tipado como `any` (`:34-37`) |
| `api/queryFactory.ts` | 179 | 5 factories `useQuery` + `handleQueryError` + `retryConfig` + stub | — | **PARCIAL**: `useListQuery`/`useDetailQuery`/`useSearchQuery` usados internamente; resto órfão | PARCIAL/STUB | `useRealtimeQuery`, `usePaginatedQuery`, `handleQueryError`, `retryConfig` = 0 consumidores; `useInfiniteQueryStub:134` é **STUB que lança** |
| `api/mutationFactory.ts` | 282 | 5 factories `useMutation` + `handleMutationError` | — | PARCIAL: `useCreate/Update/DeleteMutation` internos; resto órfão | COMPLETA | `useBulkMutation`, `useAsyncMutation`, `handleMutationError` = 0 consumidores |

### 2.2 `src/services/connections/`

| arquivo | linhas | o que faz | tabelas/RPCs tocadas | status | impl | o que falta |
|---|---|---|---|---|---|---|
| `connections/BridgeService.ts` | 44 | Ping de saúde do Supabase **externo** (Evolution DB) | `contacts` no `externalSupabase` (`:20`) | **EM_USO** | PARCIAL | comentário `:18` admite que `v_webhook_health` não existe; retorna sempre `health: null` — o tipo `HealthRow` nunca é preenchido |
| `connections/connectionsRepository.ts` | 129 | CRUD WhatsApp + channel connections + health | `whatsapp_connections` (`:64,:114`), `channel_connections` (`:93,:102`) | ORFAO | COMPLETA | `listChannelConnections` lê `filters.limit/offset` que não existem em `QueryParams` (`:90-91`) |
| `connections/connectionsService.ts` | 80 | Validação + delegação ao repository | via repository | ORFAO | COMPLETA | — |
| `connections/index.ts` | 32 | Barrel do domínio | — | ORFAO | COMPLETA | import circular: `index → useConnectionsQueries → index` (A8) |
| `connections/useConnectionsMutations.ts` | 66 | 4 hooks de mutation | via service | ORFAO | COMPLETA | — |
| `connections/useConnectionsQueries.ts` | 100 | 6 hooks de query/invalidação | via service | ORFAO | COMPLETA | — |
| `connections/__tests__/BridgeService.test.ts` | 115 | testa `checkHealth` (6 casos) | mocks | EM_USO (testa código vivo) | COMPLETA | — |
| `connections/__tests__/connectionsRepository.test.ts` | 216 | 6 blocos `describe` | mocks | ORFAO (testa código órfão) | COMPLETA | — |
| `connections/__tests__/connectionsService.test.ts` | 250 | 10 blocos `describe` | mocks | ORFAO | COMPLETA | — |
| `connections/__tests__/useConnectionsMutations.test.ts` | 126 | 4 blocos `describe` | mocks | ORFAO | COMPLETA | — |

### 2.3 `src/services/contacts/`

| arquivo | linhas | o que faz | tabelas/RPCs tocadas | status | impl | o que falta |
|---|---|---|---|---|---|---|
| `contacts/contactsRepository.ts` | 209 | CRUD + soft-delete (`deleted_at`) + busca dupla name/email + `searchWithRetry` | `contacts` (`:31,:61,:69`) | **EM_USO** (`useInboxBulkActions.ts:7` → `updateStatusBulk`) | COMPLETA | `search` faz **2 queries** e dedup em memória (`:60-93`) em vez de `.or()`; `deleteMany` herda A3 |
| `contacts/contactsService.ts` | 177 | Validação (email/nome) + delegação | via repository | ORFAO (só citado em comentário: `ContactDetails.tsx:126`) | COMPLETA | — |
| `contacts/index.ts` | 37 | Barrel | — | ORFAO | COMPLETA | import circular (A8) |
| `contacts/useContactsMutations.ts` | 96 | 7 hooks de mutation | via service | **EM_USO parcial**: só `useArchiveContact`/`useRestoreContact` (`useArchiveConversationActions.ts:2`) | COMPLETA | 5 dos 7 hooks sem consumidor |
| `contacts/useContactsQueries.ts` | 119 | 8 hooks de query | via service | ORFAO | COMPLETA | `useContactsSearch` daqui não é o usado na app — o vivo é `src/features/contacts/hooks/useContactsSearch.ts:44` (homônimo) |

### 2.4 `src/services/email/`

| arquivo | linhas | o que faz | tabelas/RPCs tocadas | status | impl | o que falta |
|---|---|---|---|---|---|---|
| `email/emailApi.ts` | 78 | Audit logs paginados, health summary, marcar thread lida, status token, retry de job | tabelas `email_revalidation_jobs` (`:30,:63,:70`), `email_health_summary` (`:46`); RPCs `rpc_email_mark_thread_read` (`:53`), `rpc_email_token_status` (`:59`) | **EM_USO** (`AdminEmailAuditPage.tsx:25`, `useEmailHealthStatus.ts:13`) | COMPLETA | 2 RPCs sem definição em `supabase/migrations` (A2) |
| `email/emailHealthRepository.ts` | 51 | Telemetria local do `safeClient` + summary remoto | RPC `rpc_get_email_health_summary` (`:11`) | EM_USO (via service) | COMPLETA | RPC sem migration (A2); erro é engolido com `log.warn` + `return null` (`:15-17`) |
| `email/emailHealthService.ts` | 100 | Agrega status/failures/paginação, `calculateStatus` | via repository | **EM_USO** (`useGmailHealth.ts:2`, `useEmailHealthStatus.ts:5`) | COMPLETA | — |
| `email/types.ts` | 32 | 3 interfaces (`EmailFailure`, `EmailHealthInfo`, `EmailHealthFilters`) | — | **EM_USO** (inclusive citado como contrato por `supabase/functions/email-health/index.ts:8`) | COMPLETA | — |
| `email/__tests__/emailHealthService.test.ts` | 309 | 9 blocos `describe` (calculateStatus, filtros, paginação) | mocks | EM_USO | COMPLETA | — |

### 2.5 `src/services/messages/`

| arquivo | linhas | o que faz | tabelas/RPCs tocadas | status | impl | o que falta |
|---|---|---|---|---|---|---|
| `messages/messagesRepository.ts` | 136 | CRUD mensagens/conversas, thread paginada, unread count, marcar lidas | `evolution_messages` (`:73,:96,:121`), `evolution_conversations` (`:74`); RPC `rpc_mark_messages_read` (`:131`, existe em 2 migrations) | **ORFAO** (única referência externa é uma **string literal** em `src/test/realtimeFanout.test.ts:122`) | COMPLETA | comentários afirmam schema `evo` — defasado (A1) |
| `messages/messagesService.ts` | 126 | Validação + regras (`status:'aberta'/'arquivada'`) | via repository | ORFAO | COMPLETA | — |
| `messages/index.ts` | 25 | Barrel | — | ORFAO | COMPLETA | import circular (A8) |
| `messages/useMessagesMutations.ts` | 103 | 8 hooks de mutation | via service | ORFAO | COMPLETA | invalida `messages.lists()` para mutações de **conversa** (A6) |
| `messages/useMessagesQueries.ts` | 72 | 6 hooks de query | via service | ORFAO | COMPLETA | — |

### 2.6 `src/services/queues/`

| arquivo | linhas | o que faz | tabelas/RPCs tocadas | status | impl | o que falta |
|---|---|---|---|---|---|---|
| `queues/queuesRepository.ts` | 39 | CRUD genérico | `queues` (`:22`) | ORFAO | COMPLETA | — |
| `queues/queuesService.ts` | 59 | Validação (`name`, `account_id`) | via repository | ORFAO | COMPLETA | — |
| `queues/index.ts` | 8 | Barrel | — | ORFAO | COMPLETA | — |
| `queues/useQueuesMutations.ts` | 39 | 3 hooks | via service | ORFAO | COMPLETA | — |
| `queues/useQueuesQueries.ts` | 50 | 4 hooks | via service | ORFAO | COMPLETA | — |

Domínio inteiro sem **nenhum** consumidor externo (`rg -l "services/queues" src supabase scripts` → 0).

### 2.7 `src/services/settings/`

| arquivo | linhas | o que faz | tabelas/RPCs tocadas | status | impl | o que falta |
|---|---|---|---|---|---|---|
| `settings/settingsRepository.ts` | 208 | get/update/upsert de settings + 2 subscriptions realtime com `dispose()` | `user_settings` (`:100,:110,:121`), `workspace_settings` (`:135,:146,:157`); realtime `schema:'zapp'` (`:176,:196`) | ORFAO | COMPLETA | `getUserSettings` (`:98-106`) **descarta o `error`** e retorna `null` — falha de permissão vira "sem settings" |
| `settings/settingsService.ts` | 86 | Validação de `theme`/`language` | via repository | ORFAO | COMPLETA | `upsertWorkspaceSettings` não valida `name` (assimétrico com `update`) |
| `settings/index.ts` | 13 | Barrel | — | ORFAO | COMPLETA | — |
| `settings/useSettingsMutations.ts` | 59 | 4 hooks | via service | ORFAO | COMPLETA | — |
| `settings/useSettingsQueries.ts` | 30 | 2 hooks | via service | ORFAO | COMPLETA | `useWorkspaceSettings` usa chave sem `workspaceId` (A4) |

Domínio inteiro sem consumidor externo (`rg -l "services/settings" src supabase scripts` → 0).

### 2.8 `src/services/users/`

| arquivo | linhas | o que faz | tabelas/RPCs tocadas | status | impl | o que falta |
|---|---|---|---|---|---|---|
| `users/usersRepository.ts` | 112 | CRUD de users **e** agents (ambos sobre `profiles`), `getCurrentUser`, `getAgentsByStatus` | `profiles` (`:46,:47,:82,:91`), `auth.getUser()` (`:79`) | ORFAO | **PARCIAL** | `.offset()` inexistente no PostgREST (A9); `listAgents` = `listUsers` sem filtro de `role` (A10); PK inconsistente `id` vs `user_id` (A11) |
| `users/usersService.ts` | 148 | Validação de email/nome | via repository | ORFAO | COMPLETA | — |
| `users/index.ts` | 37 | Barrel | — | ORFAO | COMPLETA | import circular (A8) |
| `users/useUsersMutations.ts` | 86 | 6 hooks | via service | ORFAO | COMPLETA | invalidam `users.lists()`, que não é prefixo de `userList`/`agentList` (A5) |
| `users/useUsersQueries.ts` | 144 | 10 hooks | via service | ORFAO | COMPLETA | `useUser` e `useAgent` compartilham a chave `users.detail(id)` com `queryFn` diferentes (`:29` vs `:68`) |

Domínio inteiro sem consumidor externo (`rg -l "services/users" src supabase scripts` → 0).

---

## 3. Chamado Por

| Símbolo de `src/services/` | Chamador (caminho:linha) |
|---|---|
| `queryKeys` | 168 arquivos — p.ex. `src/hooks/useCSAT.ts`, `src/features/sla/hooks/useSLARules.ts`, `src/pages/AdminRealtimeMonitorPage.tsx`, `src/lib/evoApiHealth/hooks.ts` |
| `BridgeService` | `src/hooks/connections/useConnectionsManagement.ts:4` |
| `contactsRepository` | `src/features/inbox/hooks/useInboxBulkActions.ts:7`; mock em `useInboxBulkActions.test.ts:21`; leitura do próprio arquivo-fonte em `archivedScenarios.simulacao.test.ts:509` |
| `useArchiveContact`, `useRestoreContact` | `src/features/inbox/hooks/useArchiveConversationActions.ts:2` |
| `emailApi`, `EmailRevalidationJob` | `src/pages/admin/AdminEmailAuditPage.tsx:25`; `src/pages/admin/email/useEmailHealthStatus.ts:13` |
| `emailHealthService` | `src/pages/admin/email/useEmailHealthStatus.ts:5`; `src/hooks/useGmailHealth.ts:2` |
| `EmailHealthInfo`, `EmailFailure` | `src/pages/admin/email/useEmailHealthStatus.ts:6`; `src/hooks/useGmailHealth.ts:3`; contrato citado em `supabase/functions/email-health/index.ts:8` |
| `messagesRepository` | **nenhum runtime** — só a string `'src/services/messages/messagesRepository.ts'` em `src/test/realtimeFanout.test.ts:122` |
| `api/index.ts` | listado em `scripts/dead-code-allowlist.txt:168` (barrel isento do detector) |

Nenhum arquivo de `supabase/functions/` importa código de `src/services/` (fronteira Deno/Vite respeitada).

---

## 4. Órfãos (veredito)

| Órfão | Linhas | Veredito | Justificativa |
|---|---|---|---|
| `src/services/queues/**` (5 arq.) | 195 | **SEGURO** | zero referências no repo inteiro; sem testes; `queues` é lida por outros hooks fora de services |
| `src/services/settings/**` (5 arq.) | 396 | **VERIFICAR** | zero referências, mas contém o fix documentado `REALTIME_CHANNELS_AUDIT` (`settingsRepository.ts:16-31`) — confirmar se o padrão `dispose()` deve migrar antes de apagar |
| `src/services/users/**` (5 arq.) | 527 | **SEGURO** | zero referências; contém bugs reais (A9, A10) que só existem por não ter sido exercitado |
| `src/services/messages/**` (5 arq.) | 462 | **VERIFICAR** | zero uso runtime, porém `src/test/realtimeFanout.test.ts:122` referencia o caminho como *string* — remover o arquivo quebra esse teste |
| `connections/{Repository,Service,index,useConnections*}` (6 arq.) | 407 | **NAO_REMOVER** | cobertos por 592 linhas de teste vivo (3 suítes) e o barrel `index.ts` é dependência de `BridgeService`? **não** — `BridgeService` é importado por caminho direto, mas apagar `index.ts` quebra os 3 test files |
| `contacts/{Service,index,useContactsQueries}` + 5 hooks de mutation | ~333 | **NAO_REMOVER** | `useContactsMutations.ts` e `contactsRepository.ts` da mesma pasta estão EM_USO; `index.ts` é importado por `useContactsMutations.ts:9` |
| `queryFactory`: `useRealtimeQuery`, `usePaginatedQuery`, `useInfiniteQueryStub`, `handleQueryError`, `retryConfig` | ~70 | **VERIFICAR** | `retryConfig` colide por nome com `@/lib/retryConfig` (esse sim EM_USO, 13 arquivos) — risco de remoção errada |
| `mutationFactory`: `useBulkMutation`, `useAsyncMutation`, `handleMutationError` | ~100 | **SEGURO** | zero consumidores; sem colisão de nome |
| `emailHealthRepository` (singleton exportado, `:51`) | 1 | SEGURO | a classe é instanciada diretamente em `emailHealthService.ts:101`; o singleton exportado não tem consumidor |

> Nota: `scripts/dead-code-allowlist.txt:168` já isenta `src/services/api/index.ts`. Os demais
> barrels órfãos (`queues/index.ts`, `settings/index.ts`, `users/index.ts`, `messages/index.ts`)
> **não** estão na allowlist.

---

## 5. Achados

| ID | Caminho:linha | Descrição | Severidade |
|---|---|---|---|
| **A1** | `src/services/messages/messagesRepository.ts:11`, `:52`, `:71-72` | Documentação de schema **defasada**: os comentários afirmam que `evolution_messages`/`evolution_conversations` são "colunas físicas de `evo.*`" e que em `zapp` são "views auto-updatable sobre a raiz particionada em `evo`". A topologia medida em 2026-08-16 é o inverso: as raízes particionadas físicas estão em **`zapp`**, e `evo.evolution_messages`/`_conversations`/`_contacts` **não existem**. O código em si está correto (usa o cliente padrão, schema `zapp`); só os comentários mentem — e são exatamente o tipo de comentário que induz o próximo agente a fazer `.schema('evo')`. | 🟠 Alto (documental) |
| **A2** | `src/services/email/emailApi.ts:53`, `:59`; `src/services/email/emailHealthRepository.ts:11` | 3 RPCs chamados **sem definição em `supabase/migrations/`**: `rpc_email_mark_thread_read`, `rpc_email_token_status`, `rpc_get_email_health_summary` (`rg -l "FUNCTION[^(]*<rpc>" supabase/migrations` → 0 para os três). Código **EM_USO** em produção (`AdminEmailAuditPage`, `useGmailHealth`). Ou existem só no DB (drift migration↔DB), ou as chamadas falham. Não verificável aqui (zero acesso ao banco) → **NAO_VERIFICADO**, mas é uma divergência real entre repo e runtime. | 🔴 Crítico (a confirmar no DB) |
| **A3** | `src/services/api/genericService.ts:202-217` | `deleteMany()` faz `db.from(t).delete()` + filtros e depois lê `const { count } = await query` — mas `count` só é populado quando `{ count: 'exact' }` é passado ao `.delete()`. Sem isso, `count` é `null` e a função **sempre retorna 0**. Propaga para `contactsRepository.deleteMany` → `contactsService.deleteMany` → `useDeleteContactsBulk`, que exibe toast de sucesso com contagem falsa. Hoje o caminho é órfão externamente, mas o defeito está na factory compartilhada. | 🟠 Alto |
| **A4** | `src/services/settings/useSettingsQueries.ts:24` + `src/services/api/queryKeys.ts:114` | `queryKeys.settings.workspace()` **não recebe `workspaceId`** — a chave é sempre `['settings','workspace']`. `useWorkspaceSettings(workspaceId)` usa essa chave constante, então dois workspaces distintos compartilham a mesma entrada de cache: trocar de workspace serve os settings do anterior. Vazamento cross-tenant no cache do cliente. | 🟠 Alto |
| **A5** | `src/services/users/useUsersMutations.ts:15,29,41,54,68,81` vs `useUsersQueries.ts:17,56` | Todas as 6 mutations invalidam `queryKeys.users.lists()` = `['users','list']`, mas as listas realmente consultadas usam `users.userList()` = `['users','users-list',…]` e `users.agentList()` = `['users','agents-list',…]`. Como a invalidação do TanStack é por **prefixo**, `['users','list']` nunca casa com `['users','users-list']`. Criar/editar/apagar usuário **não atualiza a lista**. Mesmo problema em `useInvalidateUsers.invalidateList` (`useUsersQueries.ts:135`). | 🟠 Alto (módulo órfão) |
| **A6** | `src/services/messages/useMessagesMutations.ts:47,72,85` + `queryKeys.ts:85-92` | Mutations de **conversa** (`useCreateConversation`, `useCloseConversation`, `useAssignConversation`, `useUpdateConversation`) invalidam `messages.lists()`/`messages.details()`, mas as conversas são cacheadas sob `messages.conversationLists()` / `messages.conversationDetails()` — prefixos irmãos, nunca casam. Fechar/atribuir conversa não refresca a lista de conversas. | 🟠 Alto (módulo órfão) |
| **A7** | `src/services/api/types.ts:52-57`; usos em `connections/connectionsRepository.ts:90-91`, `users/usersRepository.ts:94-95` | `QueryParams` define `page`/`pageSize`, mas dois repositories leem `filters?.limit` / `filters?.offset`. Compila só porque `FilterParams` tem `[key: string]: unknown` (`types.ts:61`). Qualquer chamador que passe `{page, pageSize}` (o contrato documentado) recebe silenciosamente o default `limit=50, offset=0` — paginação morta sem erro. | 🟡 Médio |
| **A8** | `contacts/useContactsMutations.ts:9`, `useContactsQueries.ts:10`; `connections/useConnectionsMutations.ts:8`, `useConnectionsQueries.ts:10`; `messages/useMessages*.ts:6,7`; `users/useUsers*.ts:8,9` | **Import circular** sistemático: `index.ts` reexporta os hooks, e os hooks importam de `'./index'` em vez de `'./xService'`. 4 domínios afetados. Em Vite/ESM funciona por hoisting, mas é frágil (ordem de avaliação) e quebra tree-shaking — parte da razão de o bloco inteiro nunca ser eliminado como dead code. | 🟡 Médio |
| **A9** | `src/services/users/usersRepository.ts:91-95` | `safeFrom('profiles').select(...).limit(...).offset(...)` — `.offset()` **não faz parte** da API do `PostgrestFilterBuilder` (paginação é `.range(from,to)`). Só compila porque `SafeQueryBuilder` é `any` (`src/integrations/supabase/safeClientTypes.ts:13`). Em runtime seria `TypeError: q.offset is not a function`. Nunca detectado porque `getAgentsByStatus` é órfão. **NAO_VERIFICADO em runtime** (sem `node_modules` para confirmar a superfície da lib). | 🟠 Alto (latente) |
| **A10** | `src/services/users/usersRepository.ts:46-47, 65-75` | `usersBaseService` e `agentsBaseService` são **o mesmo `createService('profiles')` sem filtro de `role`**. `listAgents()`/`searchAgents()` retornam todos os perfis, inclusive `admin`/`viewer`; `getAgent(id)` devolve qualquer profile. A distinção users↔agents anunciada no comentário `:45` não é implementada em lugar nenhum (só `getAgentsByStatus:93` filtra `role IN ('agent','supervisor')`). | 🟡 Médio |
| **A11** | `src/services/users/usersRepository.ts:54` vs `:84` | Inconsistência de chave: `getUser(id)` usa `.eq('id', id)` (via `genericService.get`), enquanto `getCurrentUser()` usa `.eq('user_id', user.id)`. Um dos dois está errado quanto à PK real de `zapp.profiles` — não verificável sem banco → **NAO_VERIFICADO**. | 🟡 Médio |
| **A12** | `src/services/settings/settingsRepository.ts:98-106` | `getUserSettings` desestrutura só `{ data }` e descarta o `error`. Falha de RLS/permissão (42501) é indistinguível de "usuário sem settings" — o app cai em defaults silenciosamente. Contrasta com `getWorkspaceSettings:134-141`, que ao menos captura o erro (mas também o converte em `null`). | 🟡 Médio |
| **A13** | `src/services/connections/BridgeService.ts:19-34` | O "health check" nunca produz health: sonda `contacts` no `externalSupabase` e retorna `health: null` em **todos** os caminhos de sucesso. O tipo de retorno `HealthRow \| null` é sempre `null`; consumidores que dependam de `health` recebem nada. Comentário `:18` confirma que `v_webhook_health` "may not exist yet". Este é o único arquivo de `connections/` EM_USO. | 🟡 Médio |
| **A14** | `src/services/contacts/contactsRepository.ts:60-93` | `search()` dispara **2 round-trips** (`ilike name` + `ilike email`, 20 cada) e deduplica em JS, em vez de um `.or('name.ilike.…,email.ilike.…')`. Em `contatos` (dezenas de milhares de linhas) dobra o custo e o limite efetivo é imprevisível (até 40 → dedup). `searchWithRetry:206` multiplica isso por até 3 tentativas. | 🟢 Baixo |
| **A15** | `src/services/api/queryFactory.ts:171-179` | `retryConfig` exportado daqui tem **0 consumidores** e colide por nome com `@/lib/retryConfig` (que tem 13 consumidores reais). O próprio JSDoc `:167` admite que "NAO e integrado ao TanStack Query automaticamente". Armadilha de refactor: um `rg retryConfig` sugere que é usado. | 🟢 Baixo |

---

### Resumo quantitativo

- **46 arquivos** / 5.448 linhas auditados.
- **EM_USO (com consumidor externo real):** 9 arquivos — `api/queryKeys.ts`, `api/index.ts`, `connections/BridgeService.ts` (+ seu teste), `contacts/contactsRepository.ts`, `contacts/useContactsMutations.ts` (parcial), `email/emailApi.ts`, `email/emailHealthService.ts`, `email/types.ts`, `email/emailHealthRepository.ts` (+ teste).
- **EM_USO apenas internamente (auto-consumo de `src/services/`):** 4 arquivos (`api/genericService.ts`, `api/queryFactory.ts`, `api/mutationFactory.ts`, `api/types.ts`).
- **ORFAO:** 33 arquivos ≈ **2.900 linhas** (~53% do bloco) — domínios `queues`, `settings`, `users`, `messages` completos + a maior parte de `connections` e `contacts`.
- **Violações do gateway Evolution:** 0.
- **Referências a `evo.*` para dado de negócio:** 0 em código; 3 em comentários (A1).
