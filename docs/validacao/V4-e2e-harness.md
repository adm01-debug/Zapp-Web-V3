# V4 — Validação adversarial de 40-e2e-harness-data.md

> Validado em: 2026-08-16 | Achados testados: 6/6 | Nada executado
> Postura: refutação. Cada alegação foi reconferida na fonte primária, não no documento.
> Método: leitura direta de arquivo + `rg` no repo inteiro. Sem `node_modules`, sem banco,
> sem execução de vitest/playwright. Nenhuma afirmação abaixo depende de resultado de run.

---

## 1. Placar

| Veredito | Qtd | Achados |
|---|---|---|
| **CONFIRMADO** | 4 | #2 (porta), #3 (URL de produção), #5 (`RUN_INBOX_E2E`), #6 (`src/_archive/`) |
| **CONFIRMADO com ressalva** | 2 | #1 (3/13 e 1.092 — número certo, rótulo ambíguo), #4 (versão do doc procede; versão do agente irmão cai) |
| **SUPERDIMENSIONADO** | 0 | — |
| **REFUTADO** | 0 | — |
| **NAO_VERIFICAVEL** | 0 (mas ver §6 — 2 mecanismos de runtime só argumentáveis) | — |

**O documento sobrevive à revisão adversarial.** Não encontrei nenhuma alegação
substantiva falsa. Encontrei **13 citações `arquivo:linha` erradas** (§7) e **uma
subestimação**: o doc trata a asserção tautológica de `apikey` como hipotética
("asserções do tipo…"), quando ela **existe literalmente** no repo (§4).

---

## 2. Veredito por achado

| # | afirmação | veredito | evidência verificada (caminho:linha) | nota |
|---|---|---|---|---|
| 1 | 13 specs em `src/tests/e2e/`, 1.748 linhas | **CONFIRMADO** | `wc -l src/tests/e2e/*.spec.ts` → 13 arquivos, 1748 total | bate exatamente |
| 1 | Só 3 dos 13 exercitam o build do PR | **CONFIRMADO** | `app-boot.spec.ts` (goto relativo), `no-workbox-precache.spec.ts:15`, `service-worker-guard.spec.ts:19` (ambos `DEV_ORIGIN='http://localhost:5173'`) | os 3 somam 8 `test()`, ×3 projetos = 24 execuções |
| 1 | "1.092 linhas descartadas" | **CONFIRMADO com ressalva** | 285+207+181+174+96+149 = **1.092** exatos | é a soma dos **6** specs de A1, não dos **10** não-REAIS. Ver §5 |
| 1 | 4 specs "preview" apontam para fora | **PARCIALMENTE REFUTADO pelo próprio doc — e o doc acerta** | `service-worker-guard.spec.ts:21-36` e `no-workbox-precache.spec.ts:22-36` definem `proxyToDev()` + `context.route(PREVIEW_ORIGIN)` | `id-preview--zapp-test.lovable.app` é **hostname falso proxiado para 5173**; o doc corretamente NÃO o confunde com o preview real `22c0b518` |
| 1 | `boot-resilience` ignorado em CI | **CONFIRMADO** | `playwright.config.ts:13` — `testIgnore: process.env.CI ? '**/boot-resilience.spec.ts' : undefined` | citação de linha correta |
| 2 | vite serve em 8080 | **CONFIRMADO** | `vite.config.ts:116` — `port: 8080` | citação correta |
| 2 | playwright sobe webServer em 5173 | **CONFIRMADO (linha errada)** | `playwright.config.ts:15` baseURL, `:21` command | doc cita `:19` e `:24` — **ambas erradas**. Ver §3 |
| 2 | 4 specs hardcodam 8080 e caem em `test.skip` gracioso | **CONFIRMADO** | `app-metrics.spec.ts:14`, `auth-session-toggle.spec.ts:20`, `no-service-worker-persist.spec.ts:18`, `no-workbox-precache-cache-storage.spec.ts:13` | 4 arquivos, exatamente. Skip verificado em `app-metrics.spec.ts:50-53` (try/catch → `test.skip(!STRICT)`) |
| 3 | `no-workbox-after-reload` aponta para produção | **CONFIRMADO** | `no-workbox-after-reload.spec.ts:19` e `:21` — **ambos** `'https://zapp-web-v3.vercel.app/'` | `PREVIEW_URL` e `PUBLISHED_URL` são a **mesma** URL; os 2 testes batem no mesmo alvo |
| 3 | `page.goto()` não rejeita em 404 | **CONFIRMADO (fato de framework)** | `:40` `goto(..., {waitUntil:'domcontentloaded'})` dentro de try; só erro de rede cai no catch | comportamento documentado do Playwright; não reproduzível offline, mas o código só trata exceção |
| 4 | `ci.yml` **define** a var | **CONFIRMADO** | `.github/workflows/ci.yml:26` — `VITE_SUPABASE_PUBLISHABLE_KEY: test-anon-key` (bloco `env:` global, linhas 22-28) | citação correta |
| 4 | `quality-gate.yml` **não** define | **CONFIRMADO** | `.github/workflows/quality-gate.yml:17-21` — bloco `env:` tem só `CI`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_EXTERNAL_*` | doc cita `17-22`; o bloco termina em 21 |
| 4 | ambos rodam a mesma suíte vitest | **CONFIRMADO** | `ci.yml:360` `bun run test -- --coverage`; `quality-gate.yml:130` `npm run test`; `package.json:25` `"test": "… vitest run"` | doc cita `:132` para o quality-gate — errado, é `:130` |
| 4 | `vitest.config.ts` não define a var | **CONFIRMADO** | `vitest.config.ts:16-19` — `test.env` tem só `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` | |
| 4 | `src/test/setup.ts` não define nenhuma env | **CONFIRMADO** | arquivo inteiro: `import "@testing-library/jest-dom"` + `Object.defineProperty(window,'matchMedia',…)`. Zero `vi.stubEnv`, zero `process.env` | |
| 4 | agente irmão: "não é definida em lugar nenhum" | **REFUTADO** | 8 arquivos a definem (`rg VITE_SUPABASE_PUBLISHABLE_KEY .github/`) | ver §4 |
| 5 | `RUN_INBOX_E2E` não existe em workflow algum | **CONFIRMADO** | `rg -n "RUN_INBOX_E2E" --hidden .` no repo **inteiro**: 22 hits, **todos** em (a) os 4 specs, (b) `docs/`, (c) `estado_atualizado.md`. **Zero** em `.github/`, `scripts/`, `package.json` | reteste feito repo-wide, não só em `.github/` |
| 6 | `src/_archive/` sem importador vivo | **CONFIRMADO** | `rg -n "_archive" src/ scripts/ supabase/ e2e/`: únicas menções são `src/lib/healthCheck.ts:4` (comentário), `src/integrations/zappweb/evolutionClient.ts:5` (comentário), `scripts/dead-code-allowlist.txt:185-186`, `scripts/ts-nocheck-baseline.txt:1`, `scripts/decouple/inventory.mjs` (exclusão) | **zero `import`**. Ambas as citações de linha do doc corretas |
| 6 | 604 linhas arquivadas | **CONFIRMADO** | `evolutionClient.archived.ts` 305 + `healthCheck.archived.ts` 299 = **604** | |
| 6 | shim vivo lança erro com mapa de migração | **CONFIRMADO** | `src/integrations/zappweb/evolutionClient.ts:1-11` — `@deprecated` + mapa `sendText/markChatRead/getConnectionState → evolution-proxy` | |

---

## 3. Reteste do conflito de porta (as duas linhas, verbatim)

```
vite.config.ts:116                port: 8080,
playwright.config.ts:15           baseURL: 'http://localhost:5173',
playwright.config.ts:21           command: 'npx vite --port 5173',
```

**Veredito: CONFIRMADO na substância, com duas citações de linha erradas no doc**
(que diz `playwright.config.ts:19` para o baseURL e `:24` para o webServer; os
valores reais são `:15` e `:21` — o bloco `webServer` abre em `:20`).

Três verificações adversariais que tentei e que **não derrubaram** o achado:

1. **"E se `npx vite --port 5173` não sobrescrever o `server.port: 8080` do config?"**
   Se não sobrescrevesse, o vite subiria em 8080, o `webServer.url:
   'http://localhost:5173'` nunca responderia, e o Playwright abortaria o job
   inteiro por timeout (120 s, `playwright.config.ts:24`). O job "E2E tests"
   passa. Logo **5173 é a porta servida** e 8080 está vazio — o próprio verde do
   gate é a prova do drift.

2. **"E se algo mais escutasse em 8080 no runner?"** `reuseExistingServer:
   !process.env.CI` → em CI é `false`, o Playwright sobe o seu próprio processo
   e nada mais é iniciado. Nenhum step de `ci.yml`/`quality-gate.yml` levanta
   servidor antes do e2e (verificado: os steps anteriores são `bun install` e
   `bunx playwright install`).

3. **"E se o skip não fosse gracioso e o job quebrasse?"** Verificado em
   `app-metrics.spec.ts:49-54`: o `goto` está em `try`, o `catch` chama
   `test.skip(!STRICT, …)` e só re-lança se `E2E_STRICT_METRICS=1`. Idem
   `auth-session-toggle.spec.ts:94-97`. Nos outros dois o padrão é a função
   auditora devolver `null` e o teste chamar `test.skip(result === null, …)`
   (`no-workbox-precache-cache-storage.spec.ts:77`,
   `no-service-worker-persist.spec.ts:118`). Silêncio verde confirmado.

**Ressalva única (não derruba, contextualiza):** a frase "nunca executam em
lugar nenhum" vale para CI. **Localmente**, se o dev tiver `bun run dev` (8080)
ativo enquanto roda `bun run test:e2e:boot`, esses 4 specs **alcançam** o dev
server e rodam de verdade. Ou seja, a suíte tem semântica dependente de estado
da máquina do dev — o que é uma crítica *adicional*, não uma refutação.

**Sub-achado que o doc registra corretamente e vale sublinhar:** há **quatro**
portas no repo, não três — 8080 (`vite.config.ts:116`), 5173
(`playwright.config.ts:21` **e** `playwright.a11y.config.ts:82`), 4173
(`playwright.e2e.config.ts:38,84`, com `--strictPort` e comentário
"DRIFT-DE-PORTA fix" em `:82-83`). O `playwright.e2e.config.ts:9-10` documenta a
divergência exatamente como o doc cita.

---

## 4. Veredito sobre `VITE_SUPABASE_PUBLISHABLE_KEY` — qual das duas versões procede

**Procede a versão do documento 40. A versão do agente irmão ("não é definida em
lugar nenhum") está REFUTADA.**

`rg -n "VITE_SUPABASE_PUBLISHABLE_KEY" .github/ vitest.config.ts vite.config.ts playwright*.ts package.json` — 15 hits em 8 arquivos:

| Fonte | Define? | Linha |
|---|---|---|
| `.github/workflows/ci.yml` | **SIM** `test-anon-key` | `:26` |
| `.github/workflows/quality-gate.yml` | **NÃO** | bloco `env:` `:17-21` |
| `.github/workflows/flaky-test-detector.yml` | **SIM** `test-anon-key` | `:15` |
| `.github/workflows/e2e-nightly-full.yml` | SIM (secret) | `:52` |
| `.github/workflows/e2e-crm-vps.yml` / `e2e-admin-vps.yml` / `e2e-inbox-vps.yml` | SIM (secret) | `:69` / `:39` / `:72` |
| `.github/workflows/deploy-vps.yml` / `deploy-vps-selfhosted.yml` | SIM (secret) | `:55,96,97` / `:78,114,115` |
| `playwright.a11y.config.ts` | SIM (`|| 'test-anon-key'`) | `:91-92` |
| `vite.config.ts` (`define` fallback `''`) | SIM, mas **não sob vitest** | `:15` |
| `vitest.config.ts` (`test.env`) | **NÃO** | `:16-19` |
| `src/test/setup.ts` | **NÃO** | arquivo inteiro |

A assimetria que o doc 40 aponta é **real e verificada**: `ci.yml:360` e
`quality-gate.yml:130` rodam a **mesma** suíte vitest (`package.json:25`), e a
var existe em um e não no outro.

### 4.1 Onde o doc 40 **subestimou** — a asserção tautológica não é hipotética, ela existe

O doc 40 fala em "asserções **do tipo** `expect(headers.apikey).toBe(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)`",
tratando o caso como ilustrativo, e cita como "segunda fonte" apenas o
*comentário* em `src/lib/evoApiHealth/__tests__/proxy.test.ts:406`. Encontrei o
caso literal, e ele não está quarentenado:

```
src/features/inbox/components/__tests__/TextToAudioButton.auth.test.tsx:16
    const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
:48   expect(init.headers.Authorization).not.toBe(`Bearer ${ANON}`);
:50   expect(init.headers.apikey).toBe(ANON);
:59   expect(init.headers.Authorization).toBe(`Bearer ${ANON}`);
```

E o SUT lê **a mesma** variável:

```
src/features/inbox/components/TextToAudioButton.tsx:81
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
:82 Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
```

Consequência exata: quando a var é `undefined`, `:50` vira
`expect(undefined).toBe(undefined)` e `:59` vira
`expect('Bearer undefined').toBe('Bearer undefined')` — **tautologias**. Quando é
`'test-anon-key'`, ambas comparam strings reais. O teste está no `include` do
vitest (`src/**/*.{test,spec}.{ts,tsx}`) e **não** aparece na quarentena de
`vitest.config.ts:exclude` — confirmado por grep.

Este é o teste-regressão do **issue #1000 / PR #1002** ("a EF paga elevenlabs-tts
deve receber o access_token da sessão, NÃO a anon key"). É uma guarda de
segurança/custo cuja força **muda de workflow para workflow no mesmo commit**.
O achado A4 do doc 40, portanto, é **mais grave do que ele mesmo declara**.

### 4.2 O único elo não verificável offline

A cadeia `process.env.VITE_* (workflow) → import.meta.env.VITE_* (vitest)` é
comportamento documentado do Vitest (`import.meta.env` espelha `process.env`),
mas **não pode ser executado aqui**. Se esse espelhamento não ocorresse, a var
seria `undefined` nos dois workflows e o achado A4 mudaria de "inconsistente"
para "sempre vacuoso" — continuaria sendo um achado, com severidade diferente.
Registro como a única premissa de runtime do §4 do doc 40.

---

## 5. Recontagem das linhas de spec descartadas

`wc -l src/tests/e2e/*.spec.ts` — **1.748 linhas / 13 arquivos / 25 blocos `test()`**:

| spec | linhas | `test()` | classificação (reconferida) |
|---|---|---|---|
| `app-boot.spec.ts` | 44 | 3 | **REAL** — `goto('/')` relativo → baseURL 5173 |
| `no-workbox-precache.spec.ts` | 96 | 2 | **REAL** — `DEV_ORIGIN:15` = 5173; o teste "preview" é proxiado via `context.route` (`:87`) |
| `service-worker-guard.spec.ts` | 113 | 3 | **REAL** — `DEV_ORIGIN:19` = 5173; 2 testes usam hostname falso proxiado (`:43`, `:97`) |
| `boot-resilience.spec.ts` | 76 | 2 | IGNORADO em CI (`playwright.config.ts:13`) |
| `app-metrics.spec.ts` | 96 | 1 | SKIP — 8080 (`:14`) |
| `auth-session-toggle.spec.ts` | 149 | 1 | SKIP — 8080 (`:20`) |
| `inbox-filter-presets.spec.ts` | 285 | 2 | SKIP — `RUN_INBOX_E2E` (`:21`, `:150`) |
| `inbox-filters-persistence.spec.ts` | 207 | 3 | SKIP — `RUN_INBOX_E2E` (`:19`, `:120`) |
| `inbox-unassigned-conversations.spec.ts` | 181 | 1 | SKIP — `RUN_INBOX_E2E` (`:24`, `:132`) |
| `inbox-unassigned-empty-permissions.spec.ts` | 174 | 1 | SKIP — `RUN_INBOX_E2E` (`:20`, `:120`) |
| `no-workbox-after-reload.spec.ts` | 110 | 2 | EXTERNO — `vercel.app` nas duas (`:19`, `:21`) |
| `no-service-worker-persist.spec.ts` | 129 | 2 | SKIP(8080 `:18`) + EXTERNO(preview real `:20-21`) |
| `no-workbox-precache-cache-storage.spec.ts` | 88 | 2 | SKIP(8080 `:13`) + EXTERNO(preview real `:15-16`) |
| **TOTAL** | **1.748** | **25** | |

### Os três números, e qual pertence a qual afirmação

| recorte | linhas | confere? |
|---|---|---|
| **A1** — os **6** specs que não executam **nenhuma** asserção em runner algum (4 inbox + `app-metrics` + `auth-session-toggle`) | 285+207+181+174+96+149 = **1.092** | ✅ **exato**, dígito a dígito |
| §1.2 — os **10** specs que **não exercitam o build do PR** (os 6 acima + `boot-resilience` + os 3 externos) | 1.748 − 44 − 96 − 113 = **1.495** | ✅ mas o doc **não** afirma 1.092 aqui |
| os **3** REAIS | 44+96+113 = **253** (14,5% das linhas; 8 de 25 `test()` = 32%) | ✅ |

**Ressalva sobre o rótulo:** a paráfrase "3 dos 13 exercitam o build do PR; 1.092
linhas descartadas" mistura os dois recortes. Se "descartado" = "não exercita o
PR", o número é **1.495**, não 1.092. O documento original está correto porque
escopa os 1.092 dentro do achado A1 ("6 dos 13"), mas a frase é fácil de citar
errado. Recomendo o par explícito: **1.092 nunca executam · 1.495 não medem o PR**.

Nota adicional: contar as 217 linhas de `no-service-worker-persist` +
`no-workbox-precache-cache-storage` como integralmente "descartadas" é
**generoso em ambas as direções** — metade de cada um é SKIP e metade roda
contra alvo externo. Nenhuma das duas metades mede o PR, então o total de 1.495
se sustenta.

---

## 6. Duas premissas que não posso executar (declaradas, não escondidas)

1. `--port 5173` sobrescreve `server.port: 8080` — argumentado por contradição em §3.2, não executado.
2. `import.meta.env` do vitest espelha `process.env` do workflow — §4.2.

Nenhuma das duas, se falsa, transforma um achado em falso positivo: ambas apenas
mudariam a severidade.

---

## 7. Errata de citações `arquivo:linha` do doc 40

Substantivamente inócuas, mas 13 delas erradas prejudicam a auditabilidade:

| doc 40 diz | real | onde |
|---|---|---|
| `playwright.config.ts:19` (baseURL) | `:15` | §2.2, A2 |
| `playwright.config.ts:24` (webServer) | `:20` (bloco) / `:21` (command) | §2.2, A2 |
| `auth-session-toggle.spec.ts:21` (BASE_URL) | `:20` | A2 |
| `no-workbox-precache-cache-storage.spec.ts:14` (BASE) | `:13` | A2 |
| `no-workbox-after-reload.spec.ts:17-20` | `:18-21` | A3 |
| `no-service-worker-persist.spec.ts:19-21` | `:18` (localhost) / `:20-21` (preview) | A3 |
| `no-workbox-precache-cache-storage.spec.ts:15-17` | `:14-16` | A3 |
| `quality-gate.yml:17-22` | `:17-21` | §4.1, A4 |
| `quality-gate.yml:132` (vitest) | `:130` | A4 |
| `vitest.config.ts:14` (`retry`) | `:15` | A12 |
| `src/test/setup.ts` "15 linhas" | 14 linhas de conteúdo | §3.1 |

**Corretas e reconferidas:** `vite.config.ts:116`, `playwright.config.ts:13`,
`ci.yml:26`, `ci.yml:360`, `ci.yml:455-456`, `quality-gate.yml:152-153`,
`flaky-test-detector.yml:15`, `playwright.a11y.config.ts:91`,
`app-metrics.spec.ts:14`, `no-service-worker-persist.spec.ts:18`,
os 4 `test.skip(!RUN)` dos inbox (`:150`, `:120`, `:132`, `:120`),
`healthCheck.ts:4`, `evolutionClient.ts:5`, `dead-code-allowlist.txt:185`,
`playwright.e2e.config.ts` (comentário 8080/4173, linhas `:9-10`),
`realtimeEventParser.ts` órfão (0 importadores; `dead-code-allowlist.txt:151`),
`TextToAudioButton.auth.test.tsx` fora da quarentena.

---

## 8. Conclusão adversarial

Tentei derrubar os seis achados e não consegui derrubar nenhum. O achado #2
(conflito de porta), apontado pelo orquestrador como "o mais acionável", **passa
no teste mais duro que consegui montar**: o próprio verde do gate "E2E tests"
prova que 5173 é a porta servida, o que prova que os 4 specs que miram 8080
falam com o vazio. O achado #4 é **mais grave** do que o doc 40 declara, porque a
asserção tautológica de `apikey` não é hipotética — é
`TextToAudioButton.auth.test.tsx:50`, a guarda de regressão do issue #1000.
O único defeito real do documento é editorial: 13 citações de linha deslocadas e
uma frase-resumo ("1.092 descartadas") que convida à leitura errada de escopo.
