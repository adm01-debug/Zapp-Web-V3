# Estado: e2e, harness de teste e src/data — fechamento de cobertura

> Runtime: NAO_VERIFICADO | Auditado em: 2026-08-16 | Arquivos lidos: 38/40
> LIMITAÇÃO: sem `node_modules` — nem vitest nem playwright foram executados.
> Toda conclusão abaixo é **análise estática** (leitura de código + configs + workflows).
> Nenhuma afirmação sobre teste "passar" ou "falhar" é feita; o que se afirma é
> **se o arquivo é coletado e executado por algum runner**, o que é determinável
> estaticamente a partir de `testDir`/`include`/`exclude`/`testIgnore` e das vars
> de ambiente que os workflows definem (ou não definem).

---

## 1. Visão Geral

### 1.1 Recontagem do escopo

O plano da onda falava em 32 arquivos. A enumeração real com o filtro indicado
retorna **40**:

```
find src -name '*.ts' -o -name '*.tsx' | grep -vE '^src/(pages|features|components|shared|hooks|adapters|integrations|services|lib|utils|types)/'
```

| Diretório | Plano | Real | Delta |
|---|---|---|---|
| `src/tests/e2e/` | 13 | **13** | — |
| `src/test/` (raiz) | 7 | **9** | +2 (`realtimeEventParser.ts`, `stress-test.test.ts`) |
| `src/test/mocks/` | 2 | **4** | +2 (`supabase.ts`, `supabaseFunctions.ts`) |
| `src/__tests__/` | 5 | **8** | +3 |
| `src/__tests__/scripts/` | 1 | **1** | — |
| `src/data/` + `__tests__` | 2 | **2** | — |
| `src/_archive/` | 1 | **2** | +1 (`healthCheck.archived.ts`) |
| raiz `src/` | 1 | **1** | `vite-env.d.ts` |
| **fora do escopo do plano** | — | 6 | `App.tsx`, `main.tsx`, `i18n/index.ts`, `domain/messaging/{index,types}.ts` |
| **Total no escopo E12** | 32 | **40** | +8 |

Lidos integralmente: 38. Não lidos por completo: `src/data/emojiDatabase.ts`
(642 linhas de dado literal — inspecionado estruturalmente) e
`src/_archive/healthCheck.archived.ts` (299 linhas, verificado apenas quanto a
importadores).

### 1.2 Achado principal em uma frase

**Os 13 specs e2e têm runner de verdade** (job `e2e` do `ci.yml` + `quality-gate.yml`,
em todo push/PR) — isso **refuta** a hipótese de que ninguém os executa. Mas
**apenas 3 dos 13 specs exercitam de fato o build do PR**. Os outros 10 são
coletados e imediatamente descartados: 6 por gate de env que nenhum runner
define, 1 por `testIgnore` em CI, e 3 porque apontam para **URLs externas de
produção** em vez do servidor efêmero do teste. O gate "E2E tests" fica verde
executando ~8 asserções de smoke sobre um total nominal de 13 specs.

A causa raiz de metade disso é um **drift de porta**: `vite.config.ts` serve o
dev em `8080`, mas o `webServer` do `playwright.config.ts` sobe em `5173`. Os
specs que hardcodam `http://localhost:8080` foram escritos contra
`bun run dev` e nunca alcançam o servidor que o Playwright levanta.

---

## 2. Specs e2e

**Runner confirmado:** `playwright.config.ts` → `testDir: './src/tests/e2e'`,
`baseURL: 'http://localhost:5173'`, `webServer: npx vite --port 5173`,
3 projetos (chromium, firefox, webkit).
Invocado por `test:e2e` / `test:e2e:boot` em:
- `.github/workflows/ci.yml:455-456` — job `e2e`, em `push`/`PR` para `main`/`develop`
- `.github/workflows/quality-gate.yml:152-153` — em `push`/`PR` para `main`/`master`

`vitest.config.ts:exclude` contém `'src/tests/e2e/**'` — não há dupla coleta.

Legenda de veredito: **REAL** = exercita o build do PR · **SKIP** = coletado e
pulado sempre · **IGNORADO** = não coletado em CI · **EXTERNO** = roda contra
URL de produção/terceiro, não contra o build do PR.

| spec | linhas | o que cobre | executado por qual runner? | veredito |
|---|---|---|---|---|
| `app-boot.spec.ts` | 44 | shell HTTP<400, React monta em `#root`, `<title>` não vazio | ci.yml `e2e` + quality-gate — `goto('/')` relativo → baseURL 5173 | **REAL** (3 testes) |
| `no-workbox-precache.spec.ts` | 96 | nenhum `workbox-*.js` requisitado, sem cache `workbox-precache`, boot ≤6s (10s em CI) | idem — `DEV_ORIGIN = localhost:5173` explícito | **REAL** (2 testes) |
| `service-worker-guard.spec.ts` | 113 | SW não registra em preview Lovable nem em localhost; kill-switch `?sw=off` | idem — `DEV_ORIGIN = localhost:5173` | **REAL** (3 testes) |
| `boot-resilience.spec.ts` | 76 | SPA monta com backend bloqueado; sem loop de reload | `testIgnore` explícito quando `CI` (playwright.config.ts:13) | **IGNORADO em CI** |
| `app-metrics.spec.ts` | 96 | `window.__zappMetrics()`, falha `unauthenticated`, TTM nulo sem sessão | alvo `localhost:8080`; webServer é 5173 → conexão recusada → `test.skip(!STRICT)` | **SKIP** |
| `auth-session-toggle.spec.ts` | 149 | matriz sessão none/expired/corrupted sem loop de redirect | idem `localhost:8080` → `test.skip(!STRICT)` | **SKIP** |
| `inbox-filter-presets.spec.ts` | 285 | salvar/aplicar/remover preset de filtro + persistência | `test.skip(!RUN)` com `RUN_INBOX_E2E` | **SKIP** |
| `inbox-filters-persistence.spec.ts` | 207 | aba/sub-aba/busca sobrevivem a reload e troca de rota | `test.skip(!RUN)` | **SKIP** |
| `inbox-unassigned-conversations.spec.ts` | 181 | 2 conversas `assigned_to=null` aparecem e contam em "Não lidas" | `test.skip(!RUN)` | **SKIP** |
| `inbox-unassigned-empty-permissions.spec.ts` | 174 | regressão: permissões vazias não podem sumir com conversas | `test.skip(!RUN)` | **SKIP** |
| `no-workbox-after-reload.spec.ts` | 110 | sem workbox após reload | alvo `https://zapp-web-v3.vercel.app/` (2×, default) | **EXTERNO** |
| `no-service-worker-persist.spec.ts` | 129 | sem SW antes/depois de reload (CDP + DOM) | teste 1: `localhost:8080` → SKIP · teste 2: preview `*.lovable.app` | **SKIP + EXTERNO** |
| `no-workbox-precache-cache-storage.spec.ts` | 88 | CacheStorage sem `workbox-precache-v2-*` após open e force-update | teste 1: `localhost:8080` → SKIP · teste 2: preview `*.lovable.app` | **SKIP + EXTERNO** |

### 2.1 Vars de gate: nenhuma é definida por runner algum

Grep sobre `.github/workflows/`, `scripts/`, `*.sh`, `*.mjs`, `*.json` —
**zero ocorrências** para todas as nove:

```
RUN_INBOX_E2E · E2E_STRICT_METRICS · E2E_STRICT_AUTH_LOOP · E2E_STRICT_SW
E2E_STRICT_WORKBOX · E2E_STRICT_WB_CACHE · E2E_LOCALHOST_URL
E2E_PREVIEW_URL · E2E_PUBLISHED_URL
```

Consequência: os 4 specs de inbox (847 linhas, o maior bloco do diretório)
nunca executam uma única asserção em lugar nenhum — nem em CI, nem localmente
por padrão. São **documentação executável desligada**.

### 2.2 O drift de porta 8080 × 5173

```
vite.config.ts:116          server.port = 8080     ← `bun run dev`
playwright.config.ts:24     webServer  = npx vite --port 5173
playwright.config.ts:19     baseURL    = http://localhost:5173
```

Specs que usam `goto('/')` **relativo** herdam o baseURL e funcionam
(`app-boot`). Specs que hardcodam `process.env.E2E_LOCALHOST_URL ?? 'http://localhost:8080'`
apontam para uma porta onde nada está escutando. O `playwright.e2e.config.ts`
documenta a divergência no comentário ("A porta do dev real do app é 8080 …;
o E2E usa 4173 isolado") — ou seja, há **três** portas em jogo no repositório
(8080 dev, 5173 boot suite, 4173 suíte `e2e/`), e os specs de `src/tests/e2e`
foram escritos contra a primeira enquanto rodam sob a segunda.

### 2.3 Specs que testam produção, não o PR

`no-workbox-after-reload.spec.ts` aponta seus dois testes para
`https://zapp-web-v3.vercel.app/`. Em GitHub Actions há rede, então
`page.goto()` **não lança** e o `test.skip(result === null)` não dispara: o
spec roda de verdade — mas contra o deploy Vercel corrente, não contra o
código do PR. Um PR que introduza workbox no bundle passa nesse gate; um
incidente no Vercel reprova um PR sem relação. O mesmo vale para os testes
`preview` de `no-service-worker-persist` e
`no-workbox-precache-cache-storage`, que miram
`id-preview--22c0b518-…lovable.app`.

Agravante: `page.goto()` só rejeita em erro de rede, **não** em status HTTP de
erro. Se a URL de preview Lovable responder 404, o spec segue e afirma
"nenhum cache workbox" sobre uma página de erro — asserção vacuamente
verdadeira.

---

## 3. Harness de teste (setup, mocks, config)

### 3.1 `src/test/setup.ts` — 15 linhas

Faz exatamente duas coisas:
1. `import "@testing-library/jest-dom"`
2. Define `window.matchMedia` com `matches: false` fixo.

**Não define nenhuma variável de ambiente.** Não há `vi.stubEnv`, nem
`process.env.X = …`, nem cleanup global, nem `afterEach(cleanup)`, nem mock de
`ResizeObserver`/`IntersectionObserver`/`scrollTo`.

### 3.2 `vitest.config.ts`

- `environment: 'happy-dom'`, `globals: true`, `pool: 'forks'`, `maxWorkers: 3`
- `retry: process.env.CI ? 2 : 0` — mascara flakiness em CI
- `test.env` define **somente** `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
- **Quarentena de 27 arquivos** em `exclude`, categorizada em comentário
  (ORPHAN / FAILING / DENO / NEEDS-ENV). É uma quarentena honesta e
  documentada, mas representa 27 suites desligadas fora deste escopo.
- Thresholds de cobertura baixos: lines 25, functions 18, branches 15, statements 24.
- `coverage.exclude` contém `'src/test/'` — os helpers do harness não contam
  para cobertura (correto).

Observação relevante: `vitest.config.ts` **não importa** `vite.config.ts`. O
bloco `define` de `MANAGED_PUBLIC_ENV_FALLBACKS` (vite.config.ts:12-27), que
injeta `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY` com fallback `''`, **não
se aplica sob vitest**. Sob vitest, `import.meta.env.VITE_*` vem do carregamento
de env do próprio Vite (arquivos `.env` + `process.env` com prefixo `VITE_`)
somado ao `test.env`.

### 3.3 Mocks — `src/test/mocks/` (4 arquivos)

| arquivo | linhas | o que é | avaliação |
|---|---|---|---|
| `supabase.ts` | 89 | factory de client encadeável (`select/eq/order/…` → `mockReturnThis`), com `single`/`maybeSingle`/`then` resolvendo `{data,error}` | sólido; o spy `schema` existe deliberadamente **para os testes asseverarem que nunca é chamado** — alinhado com a regra 2 do CLAUDE.md |
| `supabaseFunctions.ts` | 64 | factory tipada de `functions.invoke` + helpers `ok()`/`fail()` | bom; elimina casts `any`, documenta o envelope |
| `auth.tsx` | 69 | fixtures `mockUser`/`mockProfile`/`mockSession`/`mockAuthContext` | **`MockAuthProvider` é inerte**: recebe `value` e o descarta (`value: _value`), renderizando `<>{children}</>`. O comentário admite ("We mock the useAuth hook directly in tests"). Um teste que passe `value={mockAuthContextLoggedOut}` esperando efeito não terá nenhum. |
| `queryClient.tsx` | 28 | `createTestQueryClient()` + `TestQueryWrapper` com `retry:false, gcTime:0, staleTime:0` | correto |

### 3.4 Helpers não-teste em `src/test/`

| arquivo | linhas | situação |
|---|---|---|
| `typing.ts` | 79 | helpers de cast (`asTyped`, `mockOf`, `asMock`, `globalAs`). Zero-runtime, bem documentado, com `// ignore-audit` justificado. OK. |
| `load-test.ts` | 39 | `simulateLoad()` — dispara N `fetch` paralelos e mede latência. Consumido só por `stress-test.test.ts`. |
| `realtimeEventParser.ts` | 92 | **órfão**: exporta `parseHookEvent`/`parseEdgeLabel`/`ALL_EVENTS`; grep em `src/` e `scripts/` não encontra **nenhum importador**. O único arquivo que poderia usá-lo (`realtimeFanoutWildcard.test.ts`) reimplementa a lógica localmente em vez de importar. 92 linhas de parser com mensagens de erro elaboradas e zero cobertura e zero uso. |
| `fixtures/TRILHA_MENSAGENS_NAVEGAVEL.mmd` | — | fixture real, consumida por `realtimeFanout.test.ts` e `realtimeFanoutEvents.test.ts` |

---

## 4. Variáveis de ambiente definidas × ausentes (com impacto em asserções)

### 4.1 Veredito sobre `VITE_SUPABASE_PUBLISHABLE_KEY` — **confirmado no harness, refutado em parte no CI**

O agente irmão afirmou que a var "não é definida em lugar nenhum", tornando
asserções sobre `apikey` vacuamente verdadeiras. A leitura direta de
`src/test/setup.ts` e `vitest.config.ts` **confirma a primeira metade** e
**refuta a segunda como afirmação global**:

| Fonte | Define `VITE_SUPABASE_PUBLISHABLE_KEY`? |
|---|---|
| `src/test/setup.ts` | **NÃO** — o arquivo só toca `matchMedia` |
| `vitest.config.ts` (`test.env`) | **NÃO** — só `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` |
| `vite.config.ts` (`define`) | Sim, com fallback `''` — **mas não se aplica sob vitest** (config separado) |
| `.github/workflows/ci.yml:26` (env do workflow) | **SIM** → `test-anon-key` |
| `.github/workflows/flaky-test-detector.yml:15` | **SIM** → `test-anon-key` |
| `.github/workflows/quality-gate.yml:17-22` | **NÃO** |
| `playwright.a11y.config.ts:91` (env do webServer) | **SIM** → `test-anon-key` |
| `playwright.config.ts` (webServer da boot suite) | **NÃO** |

**Conclusão precisa:** o harness de teste, por si só, não define a var. Ela
chega (ou não) pelo ambiente do workflow. Como `VITE_SUPABASE_PUBLISHABLE_KEY`
tem o prefixo `VITE_`, o carregamento de env do Vite a propaga de `process.env`
para `import.meta.env`. Portanto:

- **Localmente** (`bun run test`, sem `.env`): `undefined` → asserções do tipo
  `expect(headers.apikey).toBe(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)`
  viram `expect(undefined).toBe(undefined)` — **vacuamente verdadeiras**.
- **No job `unit-tests` do `ci.yml`**: `'test-anon-key'` → a asserção compara
  valores reais e **tem conteúdo**.
- **No `quality-gate.yml`, que também roda `npm run test`**: a var **não está**
  no bloco `env` → **vacuamente verdadeira ali**.

Ou seja: **a mesma suíte unitária roda com semântica diferente em dois
workflows do mesmo repositório.** Um teste de `apikey` pode ter conteúdo no
`ci.yml` e ser tautológico no `quality-gate.yml`, na mesma commit. Isso é pior
do que "sempre vacuoso", porque é silenciosamente inconsistente e não
reproduzível localmente.

Segunda fonte independente registrada no próprio código:
`src/lib/evoApiHealth/__tests__/proxy.test.ts:406` comenta
*"In the test environment VITE_SUPABASE_PUBLISHABLE_KEY is unset → SUPABASE_ANON = ''"*
— um teste fora deste escopo já documenta a premissa de que a var é vazia,
premissa que é **falsa** dentro do `ci.yml`.

### 4.2 Tabela consolidada (contexto vitest)

| Var | `vitest.config.ts` | `setup.ts` | `ci.yml` | `quality-gate.yml` |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | ✅ `http://localhost:54321` | — | ✅ `https://example.supabase.co` | ✅ |
| `VITE_SUPABASE_ANON_KEY` | ✅ `test-anon-key` | — | ✅ | ✅ |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ❌ | ❌ | ✅ | **❌** |
| `VITE_EXTERNAL_SUPABASE_URL` | ❌ | ❌ | ✅ | ✅ |
| `VITE_EXTERNAL_SUPABASE_ANON_KEY` | ❌ | ❌ | ✅ | ✅ |

Nota: `test.env` do vitest **sobrescreve** o env do workflow para
`VITE_SUPABASE_URL`/`ANON_KEY`. Logo, sob vitest a URL é sempre
`http://localhost:54321`, nunca o `example.supabase.co` do workflow — o que é
o comportamento desejado, mas significa que o bloco `env:` do `ci.yml` é
parcialmente inerte para a suíte unitária.

---

## 5. src/data e src/_archive

### 5.1 `src/data/` — vivo e testado

| arquivo | linhas | situação |
|---|---|---|
| `emojiDatabase.ts` | 642 | Dado literal: 11 categorias, cada uma `{label, icon, emojis:[{emoji, keywords[]}]}`. Exporta `emojiDatabase`, `getAllEmojis`, `searchEmojis`, `EMOJI_CATEGORY_KEYS`. **Consumidor único e vivo:** `src/components/ui/emoji-picker.tsx:10`. |
| `__tests__/emojiDatabase.test.ts` | 281 | ~45 casos importando o SUT real (`from '../emojiDatabase'`). Testa estrutura, categorias conhecidas, `EMOJI_CATEGORY_KEYS`, `getAllEmojis`, `searchEmojis`. **Sem espelho, sem placeholder.** É o teste de melhor qualidade do escopo. |

Ressalva menor: `it('has exactly 11 categories')` é uma asserção de contagem
rígida — adicionar uma categoria quebra o teste sem que nada esteja errado.
Custo baixo, mas é acoplamento a um número mágico.

### 5.2 `src/_archive/` — corretamente quarentenado, **sem importador vivo**

| arquivo | linhas | importadores |
|---|---|---|
| `evolutionClient.archived.ts` | 305 | **NENHUM.** As duas únicas menções são (a) um comentário em `src/integrations/zappweb/evolutionClient.ts:5` apontando o histórico e (b) `scripts/dead-code-allowlist.txt:185` ("nunca importar"). |
| `healthCheck.archived.ts` | 299 | **NENHUM.** Idem: comentário em `src/lib/healthCheck.ts:4` + allowlist + `scripts/ts-nocheck-baseline.txt`. |

O shim vivo `src/integrations/zappweb/evolutionClient.ts` esvaziou todas as
funções para `(): never => { throw … }` com mapa de migração para
`evolution-proxy` — padrão correto de desligamento (falha ruidosa, não
silenciosa).

Ressalva: `src/_archive/**` está no `ignores` do `eslint.config.js` (linhas 169
e 238), mas **não** no `exclude` do `tsconfig.app.json`, cujo `include` é
`["src"]`. Os 604 linhas arquivadas continuam sendo type-checked
(`healthCheck.archived.ts` consta em `ts-nocheck-baseline.txt`, o que confirma
que o typecheck o alcança). Custo real: tempo de `tsc` e ruído no baseline.

### 5.3 `src/vite-env.d.ts`

Uma linha: `/// <reference types="vite/client" />`. Correto e necessário.
Observação: como o projeto usa `import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY`
em 12+ arquivos, seria aqui o lugar de declarar uma `interface ImportMetaEnv`
tipada — hoje todos esses acessos são `any`, o que é exatamente o que permite
que `expect(undefined).toBe(undefined)` compile sem alarme (ver §4.1).

---

## 6. Achados (A1..A12)

Severidade: 🔴 Alto · 🟠 Médio · 🟡 Baixo

### 🔴 A1 — 6 dos 13 specs e2e nunca executam asserção em runner algum
`src/tests/e2e/inbox-filter-presets.spec.ts:150`,
`inbox-filters-persistence.spec.ts:120`,
`inbox-unassigned-conversations.spec.ts:132`,
`inbox-unassigned-empty-permissions.spec.ts:120` (gate `RUN_INBOX_E2E`);
`app-metrics.spec.ts:57`, `auth-session-toggle.spec.ts:96` (porta 8080).
Nenhuma das vars de gate aparece em `.github/workflows/`, `scripts/` ou
`package.json`. São **1.092 linhas** de spec que o job "E2E tests" coleta e
descarta. O gate reporta verde. → São documentação, não teste.

### 🔴 A2 — Drift de porta invalida silenciosamente 4 specs
`vite.config.ts:116` (`port: 8080`) × `playwright.config.ts:19,24`
(`baseURL`/`webServer` em `5173`). Specs com `?? 'http://localhost:8080'`
(`app-metrics.spec.ts:14`, `auth-session-toggle.spec.ts:21`,
`no-service-worker-persist.spec.ts:18`,
`no-workbox-precache-cache-storage.spec.ts:14`) miram uma porta vazia e caem
no `test.skip` gracioso. Correção de uma linha por spec (usar `goto('/')`
relativo, como `app-boot.spec.ts` faz) reativaria a cobertura.

### 🔴 A3 — 3 specs validam o deploy de produção, não o build do PR
`no-workbox-after-reload.spec.ts:17-20` aponta ambos os testes para
`https://zapp-web-v3.vercel.app/`; os testes `preview` de
`no-service-worker-persist.spec.ts:19-21` e
`no-workbox-precache-cache-storage.spec.ts:15-17` apontam para
`id-preview--…lovable.app`. Em CI há rede, então **não** pulam — rodam contra
um alvo externo. Um PR que reintroduza workbox passa; uma instabilidade no
Vercel reprova um PR inocente. Agravante: `page.goto()` não rejeita em 404,
então uma página de erro satisfaz "nenhum cache workbox" vacuamente.

### 🟠 A4 — Mesma suíte unitária, semântica diferente em dois workflows
`.github/workflows/ci.yml:26` define `VITE_SUPABASE_PUBLISHABLE_KEY=test-anon-key`;
`.github/workflows/quality-gate.yml:17-22` **não** define. Ambos rodam a suíte
vitest (`ci.yml:360` e `quality-gate.yml:132`). Asserções que comparam
`import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY` têm conteúdo em um e são
`expect(undefined).toBe(undefined)` no outro, na mesma commit. Ver §4.1.
Correção: definir a var em `vitest.config.ts:test.env`, tornando o
comportamento determinístico e independente de workflow.

### 🟠 A5 — Teste-espelho auto-declarado em `realtimeFanoutWildcard.test.ts`
`src/test/realtimeFanoutWildcard.test.ts:13-30` reimplementa `parseEdgeEvents`
e `parseHookEventBlock` localmente, com o comentário:

> *"Reimplementações isoladas — espelham a lógica em realtimeFanoutEvents.test.ts.
> Mantê-las aqui (e não importar) garante que o teste falha se o parser de lá divergir."*

O raciocínio é invertido: uma cópia local **nunca** detecta divergência do
original — ela testa a si mesma e permanece verde enquanto o SUT real quebra.
O SUT verdadeiro existe e é importável: `src/lib/realtime/edgeEvents.ts`
(usado corretamente por `realtimeFanoutEvents.test.ts:14`). São **26 casos de
teste** (o maior bloco de asserções do harness) apontados para código morto
de teste.

### 🟠 A6 — `webhook-fuzzer.test.ts` testa uma função que ele mesmo define
`src/__tests__/webhook-fuzzer.test.ts:4-16`: `validateWebhookPayload` é
declarada dentro do arquivo de teste, sob o comentário *"Simulating a webhook
handler validation logic"*. Não há import de nenhum módulo do projeto além de
`fast-check`. Os 3 testes (1.100 execuções de property) validam um validador de
UUID que **não existe em produção**. Zero acoplamento ao SUT.

### 🟠 A7 — Blocos de "segurança" que são tautologias de mock
`src/__tests__/security-and-performance.test.ts:43-77` ("Security - RLS &
Access Control") e `:150-170` ("Knowledge Base Search"): o padrão é
`mockRpc.mockResolvedValue({data:true})` → chamar → `expect(result.data).toBe(true)`.
Afirma-se que o mock devolve o que se mandou o mock devolver. Nenhum código de
RLS, permissão ou busca é exercitado.
Mesmo padrão em `src/__tests__/dlq-transfers-rls.test.ts:52-100`
("DLQ RPC gating (mocked)" e "Transfers RPC respects RLS (mocked)"): `makeClient`
recebe o handler que produz a resposta que o teste então verifica. O título
promete verificação de RLS; o corpo verifica um literal.
**Contraponto justo:** os dois primeiros `describe` do mesmo arquivo
(`:31-50`, helpers `isRlsDeniedError`/`canAccessAdminResource`/`highestRole`)
importam SUT real e são testes legítimos.

### 🟠 A8 — `src/test/realtimeEventParser.ts` é órfão (92 linhas, 0 importadores)
Exporta `parseHookEvent`, `parseEdgeLabel`, `ALL_EVENTS`, `Evt`, `ParseResult`
com mensagens de erro detalhadas em pt-BR. Grep em `src/` e `scripts/` não
retorna nenhum importador. Ironicamente, o arquivo que mais se beneficiaria
dele (`realtimeFanoutWildcard.test.ts`, ver A5) escreve sua própria cópia.
Não está coberto por teste nem por cobertura (`coverage.exclude` inclui
`src/test/`).

### 🟡 A9 — `stress-test.test.ts`: única suíte cujo único teste é `it.skip`
`src/test/stress-test.test.ts:8` — `it.skip("should handle parallel requests…")`,
com justificativa honesta (depende de rede ao Supabase de produção). O arquivo
existe apenas para manter `simulateLoad` (`src/test/load-test.ts`, 39 linhas)
formalmente referenciado. Um arquivo de teste sem nenhum `expect` executável.
Nota: o teste, se reativado, faria 10 requisições reais contra
`https://supabase.atomicabr.com.br/rest/v1/profiles` — produção.

### 🟡 A10 — `MockAuthProvider` é um no-op que aceita e descarta `value`
`src/test/mocks/auth.tsx:59-68`: a prop `value` é renomeada para `_value` e
nunca usada; o componente devolve `<>{children}</>`. Um teste que faça
`<MockAuthProvider value={mockAuthContextLoggedOut}>` para simular logout não
terá efeito algum e provavelmente passará pelo motivo errado. O comentário
interno admite o desenho ("We mock the useAuth hook directly"), mas a
assinatura convida ao mau uso.

### 🟡 A11 — `tsconfig.app.json` exclui 2 arquivos que não existem mais
`tsconfig.app.json:34` (`src/__tests__/resolve-jid-exhaustive.test.ts`) e
`:35` (`src/__tests__/security-simulations.test.ts`) — ambos ausentes do
disco. Exclusões obsoletas: não quebram nada, mas mascaram a intenção e
crescem sem limpeza. Relacionado: `src/_archive/**` está ignorado no ESLint
(`eslint.config.js:169,238`) mas **não** excluído do `tsconfig`, então 604
linhas arquivadas continuam sendo type-checked.

### 🟡 A12 — `retry: 2` em CI mascara flakiness na suíte unitária
`vitest.config.ts:14` — `retry: process.env.CI ? 2 : 0`. Combinado com o
`flaky-test-detector.yml` existente, o retry automático reduz o sinal que o
próprio detector procura. Não é erro, mas é uma escolha que troca ruído por
cegueira e merece registro num inventário de estado.

---

## 7. O que está bom (para não enviesar o inventário)

Nem tudo neste bloco é dívida. Vale registrar o que sustenta peso:

- **`src/data/__tests__/emojiDatabase.test.ts`** (281 l, ~45 casos) — importa o
  SUT real, cobre estrutura, chaves e busca. Sem espelho, sem gate, sem skip.
- **`src/__tests__/conversation-transfers-events.integration.test.ts`** (194 l,
  17 casos) — importa `safeParseEvent` e os schemas Zod reais de
  `@/shared/webhookEventSchemas` e exercita o envelope `postgres_changes`
  com payloads válidos e inválidos. Testa contrato de verdade.
- **`src/__tests__/scripts/repair-types-schemas.test.ts`** (205 l, 8 casos) —
  cria sandbox em `tmpdir`, **copia o script real sem alteração** e injeta
  stubs comunicando por arquivos de estado. Cobre fast-path, retries,
  esgotamento, falha do gerador e dois modos de dry-run. É o teste mais bem
  construído do escopo.
- **`src/test/realtimeFanout.test.ts` + `realtimeFanoutEvents.test.ts`** —
  validadores de drift entre o diagrama `.mmd` e o código real, falhando nas
  duas direções (órfão no código / phantom no diagrama).
  `realtimeFanoutEvents.test.ts:14` importa o parser real de
  `@/lib/realtime/edgeEvents` — exatamente o que A5 deveria fazer.
- **`src/test/contractSnapshot.test.ts`** (138 l) — garante offline que todo
  `.rpc('fn')` do `src/` está no `rpcCatalog.ts` tipado ou na allowlist,
  espelhando deliberadamente os regex do `scripts/audit-contract.mjs` para que
  checagem offline e auditoria online não divirjam. Mensagem de falha
  acionável.
- **`src/test/mocks/supabase.ts:71-74`** — o spy `schema` existe para que os
  testes **asseverem que `.schema()` nunca é chamado**, alinhado com a regra 2
  do `CLAUDE.md` (`evo` não exposto no PostgREST). Mock com opinião, no bom
  sentido.
- **`src/_archive/`** — desligamento correto: sem importador vivo, shim que
  lança erro ruidoso com mapa de migração, allowlist de dead-code explícita.

---

## 8. Correções sugeridas, por custo crescente

| # | Ação | Arquivos | Custo | Recupera |
|---|---|---|---|---|
| 1 | Trocar `?? 'http://localhost:8080'` por `goto('/')` relativo | 4 specs | 4 linhas | ~6 testes e2e (A2) |
| 2 | Definir `VITE_SUPABASE_PUBLISHABLE_KEY` em `vitest.config.ts:test.env` | 1 linha | trivial | determinismo entre workflows (A4) |
| 3 | `realtimeFanoutWildcard.test.ts` importar de `@/lib/realtime/edgeEvents` e apagar as cópias | 1 arquivo | ~20 linhas | 26 casos passam a testar o SUT (A5) |
| 4 | Apontar `no-workbox-after-reload` para o `baseURL` do webServer | 1 spec | 2 linhas | gate volta a medir o PR (A3) |
| 5 | Decidir sobre `RUN_INBOX_E2E`: setar num workflow **ou** mover os 4 specs para `e2e/` | 4 specs + 1 workflow | médio | 847 linhas (A1) |
| 6 | Remover `src/test/realtimeEventParser.ts` **ou** consumi-lo em (3) | 1 arquivo | trivial | −92 linhas mortas (A8) |
| 7 | Substituir `validateWebhookPayload` local pelo validador real de produção | 1 teste | médio | fuzzing com valor (A6) |
| 8 | Reescrever os blocos tautológicos como testes do SUT ou apagá-los | 2 testes | médio | honestidade do sinal (A7) |
| 9 | Limpar exclusões obsoletas do `tsconfig.app.json`; excluir `src/_archive/**` | 1 config | trivial | −604 linhas do typecheck (A11) |

---

## 9. Rastreabilidade

Fontes primárias lidas para este documento:

```
src/tests/e2e/*.spec.ts                    (13 arquivos, 1.748 linhas)
src/test/*.{ts,tsx}                        (9 arquivos)
src/test/mocks/*.{ts,tsx}                  (4 arquivos)
src/__tests__/*.{ts,tsx}                   (8 arquivos)
src/__tests__/scripts/repair-types-schemas.test.ts
src/data/emojiDatabase.ts + __tests__/
src/_archive/{evolutionClient,healthCheck}.archived.ts
src/vite-env.d.ts
vitest.config.ts · playwright.config.ts · playwright.e2e.config.ts
playwright.a11y.config.ts · vite.config.ts · tsconfig.app.json · package.json
.github/workflows/ci.yml · quality-gate.yml · flaky-test-detector.yml
```

Comandos de verificação reproduzíveis:

```sh
# Nenhuma var de gate é definida por runner algum
grep -rn "RUN_INBOX_E2E\|E2E_STRICT_\|E2E_LOCALHOST_URL" .github/ scripts/ package.json

# Drift de porta
grep -n "port" vite.config.ts playwright.config.ts

# Archive sem importador vivo
grep -rn "evolutionClient.archived\|healthCheck.archived" src/ supabase/ scripts/

# Parser órfão
grep -rn "realtimeEventParser\|parseHookEvent\|parseEdgeLabel" src/ scripts/
```

---

## 8. Fechamento pelo orquestrador — 3 arquivos residuais

Recontagem independente após a entrega do E12 revelou 3 arquivos de `src/__tests__/` ainda não
nomeados. Auditados diretamente (leitura integral), fechando `src/` em **100%**.

| arquivo | linhas | SUT | importa o SUT? | tipo | veredito |
|---|---|---|---|---|---|
| `src/__tests__/auth-flows.test.tsx` | 71 | `useAuth` + `AuthProvider` | **sim** (`../features/auth/hooks/useAuth`, `../features/auth/components/AuthProvider`) | real, mockando só o client Supabase | legítimo |
| `src/__tests__/deep-links.test.tsx` | 50 | `AppRoutes` | **sim** (`../components/routing/AppRoutes`) | real, com `MemoryRouter` e páginas mockadas | legítimo |
| `src/__tests__/sprint1-security-hardening.test.ts` | 133 | migrations (HIGH-1..HIGH-3) | n/a — lê arquivo do disco | **grep-based sobre `supabase/migrations/`** | ver A8 |

### A8 (🟠) — a guarda de segurança do Sprint 1 valida texto de migration, não o banco

`sprint1-security-hardening.test.ts:1-9` declara a limitação com honestidade rara: *"checar a
definição corrente das funções via `pg_proc` seria o ideal, mas em ambiente unit não temos DB"*.
O teste então lê o arquivo de migration mais recente que contém os guards e faz asserção sobre o
texto (17 `expect`, zero import de SUT).

O problema não é a técnica — é a premissa, que a Fase 4A desmentiu: **387 versões estão aplicadas
em produção sem arquivo correspondente no repo, e 822 funções vivem sem declaração**
(`docs/estado/37`). Logo o teste pode passar com o arquivo correto no repo enquanto a função em
produção foi redefinida fora de banda — exatamente a regressão que ele existe para pegar.

Não é código morto e não deve ser removido: é a única guarda automatizada desses três invariantes.
Mas seu veredito é **PARCIAL**, não COMPLETA. A correção real é um teste de integração contra
`pg_proc`, na linha do que a Fase 4A fez manualmente.

Os outros dois são testes legítimos, importam o SUT de verdade, sem skip e sem placeholder.
