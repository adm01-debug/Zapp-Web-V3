# Estado: src/lib/__tests__ — bloco 1E-d

> Runtime: NAO_VERIFICADO | Auditado em: 2026-08-16 | Arquivos lidos: 79/79
> LIMITAÇÃO: toolchain ausente (sem node_modules) — análise estática, nenhum teste foi executado.
> Nenhuma afirmação abaixo diz que um teste passa ou falha. Onde há divergência entre
> teste e produção, ela é demonstrada por comparação de código-fonte, não por execução.

## 1. Visão Geral

79 arquivos, 18.573 linhas. **Nenhum teste órfão por SUT inexistente**: os 72 arquivos que
importam um módulo local apontam para arquivos que existem em `src/lib/` (verificado por
teste de existência `.ts`/`.tsx`/`/index.ts` em todos os 84 pares teste→SUT).

O achado deste bloco não é SUT deletado — é **teste que não roda** e **teste que valida uma
cópia da lógica em vez da lógica de produção**.

**2.177 linhas (11,7% do bloco) não são executadas por runner nenhum:**

| Motivo | Arquivos | Linhas |
|---|---|---|
| Estilo Deno (`Deno.test` + `https://deno.land/...`) — excluído do vitest, fora do escopo do workflow Deno | 4 | 441 |
| Suíte inteira comentada, resta só `describe.skip` placeholder | 2 | 1.159 |
| Excluído por `NEEDS-ENV` em `vitest.config.ts` | 1 | 542 |
| Nome não casa o glob `*.{test,spec}.{ts,tsx}` | 1 | 35 |

Dos 71 arquivos que efetivamente rodam sob vitest, a cobertura é majoritariamente boa:
~57 exercitam caminho de erro e/ou borda além do caminho feliz. As lacunas relevantes estão
concentradas nos módulos de envio/resiliência (seção 5).

## 2. Tabela de Suítes

| arquivo de teste | linhas | SUT | SUT existe? | tipo | cobertura |
|---|---|---|---|---|---|
| `alertHistory.test.ts` | 210 | `alertHistory,webhookHealthAlerts` | sim | real | feliz+erro |
| `audit.test.ts` | 82 | `audit` | sim | real | feliz+erro+borda |
| `avatarColors.test.ts` | 93 | `avatarColors` | sim | real | feliz+erro+borda |
| `buildVersion.simulacao.test.ts` | 866 | `buildVersion,logger` | sim | real | feliz+borda |
| `centenarias.simulacao.test.ts` | 119 | `(nenhum — lógica inline)` | n/a | espelho (logica inline) | feliz+erro+borda |
| `clientRateLimiter.test.ts` | 134 | `clientRateLimiter` | sim | **Deno — nao executado** | n/a |
| `clientTelemetry.test.ts` | 493 | `clientTelemetry` | sim | real | feliz+erro+borda |
| `consoleErrorFilter.test.ts` | 145 | `consoleErrorFilter` | sim | real | feliz+erro+borda |
| `contactHealth.test.ts` | 168 | `contactHealth` | sim | real | feliz+borda |
| `contactsDB.test.ts` | 542 | `contactsDB` | sim | **excluido (NEEDS-ENV)** | n/a |
| `correlationId.test.ts` | 45 | `correlationId` | sim | real | feliz+erro+borda |
| `crossTabSendDedupe.test.ts` | 141 | `crossTabSendDedupe` | sim | real | feliz+erro+borda |
| `crypto.test.ts` | 101 | `crypto` | sim | real | feliz+borda |
| `csvUtils.test.ts` | 240 | `csvUtils` | sim | real | feliz+borda |
| `debug-dompurify-test.ts` | 35 | `sanitize` | sim | **nao coletado (nome)** | n/a |
| `dedupeMetrics.test.ts` | 223 | `dedupeMetrics` | sim | real | feliz+erro+borda |
| `devRealtimeLogger.test.ts` | 298 | `devRealtimeLogger` | sim | real | feliz+erro+borda |
| `diagnostics.test.ts` | 156 | `diagnostics` | sim | real | feliz+erro+borda |
| `eventBus.test.ts` | 226 | `eventBus` | sim | real | feliz+erro |
| `evolutionCircuitBreaker.test.ts` | 345 | `evolutionCircuitBreaker` | sim | real | feliz+erro+borda |
| `evolutionDiagnostics.test.ts` | 187 | `evolutionDiagnostics` | sim | real | feliz+erro |
| `evolutionInstance.test.ts` | 63 | `evolutionInstance` | sim | real | feliz+borda |
| `evolutionMessageId.test.ts` | 186 | `evolutionMessageId` | sim | real | feliz+borda |
| `evolutionSendRetry.invoke.test.ts` | 347 | `evolutionSendRetry` | sim | real | feliz+erro |
| `evolutionSendRetry.isTransient.test.ts` | 120 | `evolutionSendRetry` | sim | real | feliz+erro+borda |
| `externalProxy.test.ts` | 621 | `clientTelemetry,externalProxy` | sim | **skip (suite comentada)** | n/a |
| `failedMessagesEnqueue.test.ts` | 172 | `failedMessagesEnqueue` | sim | real | feliz+erro+borda |
| `failureRootCause.test.ts` | 255 | `failureRootCause` | sim | real | feliz+erro+borda |
| `featureFlags.test.ts` | 190 | `featureFlags` | sim | real | feliz+erro+borda |
| `formatters.parity.test.ts` | 56 | `formatters` | sim | real | feliz+borda |
| `formatters.test.ts` | 263 | `formatters` | sim | real | feliz+borda |
| `groupsAutoSync.test.ts` | 228 | `(nenhum — lógica inline)` | n/a | espelho (logica inline) | feliz+borda |
| `healthCheck.test.ts` | 88 | `(nenhum — lógica inline)` | n/a | **Deno — nao executado** | n/a |
| `idempotency.test.ts` | 221 | `idempotency` | sim | real | feliz+borda |
| `instrumentedExternal.test.ts` | 343 | `instrumentedExternal` | sim | real | feliz+erro+borda |
| `jid.test.ts` | 461 | `jid` | sim | real | feliz+erro+borda |
| `lazyWithRetry.test.ts` | 227 | `lazyWithRetry` | sim | real | feliz+erro+borda |
| `logger.test.ts` | 54 | `logger` | sim | real | feliz+erro |
| `loginAttempts.test.ts` | 150 | `loginAttempts` | sim | real | feliz+erro+borda |
| `normalizers.test.ts` | 290 | `normalizers` | sim | real | feliz+borda |
| `openContactInChat.test.ts` | 77 | `openContactInChat` | sim | real | feliz+borda |
| `phoneNormalization.test.ts` | 104 | `(nenhum — lógica inline)` | n/a | espelho (logica inline) | feliz+borda |
| `phoneUtils.test.ts` | 324 | `phoneUtils` | sim | real | feliz+erro+borda |
| `popupManager.test.ts` | 280 | `popupManager` | sim | real | feliz+erro+borda |
| `queryTimeout.test.ts` | 49 | `queryTimeout` | sim | **Deno — nao executado** | n/a |
| `rateLimiter.test.ts` | 195 | `(nenhum — lógica inline)` | n/a | espelho (logica inline) | feliz+borda |
| `reactRefs.test.ts` | 41 | `reactRefs` | sim | real | feliz+borda |
| `rechartsFormatters.test.ts` | 125 | `rechartsFormatters` | sim | real | feliz+borda |
| `recheckWebhookSignature.test.ts` | 144 | `recheckWebhookSignature` | sim | real | feliz+erro+borda |
| `requestDedupeKey.test.ts` | 160 | `requestDedupeKey` | sim | real | feliz+borda |
| `resilienceSimulation.test.ts` | 538 | `externalProxy` | sim | **skip (suite comentada)** | n/a |
| `retry.test.ts` | 488 | `retry` | sim | real | feliz+erro |
| `retryAlerts.test.ts` | 430 | `retryAlerts` | sim | real | feliz+erro+borda |
| `retryConfig.test.ts` | 239 | `retryConfig` | sim | real | feliz+erro+borda |
| `retryScheduleSimulation.test.ts` | 220 | `retryConfig,retryScheduleSimulation` | sim | real | so feliz |
| `rlsGroupAccess.test.ts` | 149 | `(nenhum — lógica inline)` | n/a | espelho (logica inline) | so feliz |
| `runtimeGuards.test.ts` | 301 | `runtimeGuards` | sim | real | feliz+borda |
| `safeStorage.test.ts` | 211 | `safeStorage` | sim | real | feliz+erro+borda |
| `sanitize-extra.test.ts` | 170 | `sanitize-extra` | sim | **Deno — nao executado** | n/a |
| `sanitize-v2.test.ts` | 463 | `sanitize` | sim | real | feliz+erro |
| `sanitize.test.ts` | 425 | `sanitize` | sim | real | feliz+erro+borda |
| `scanResponse.test.ts` | 421 | `scanResponse` | sim | real | feliz+erro+borda |
| `schemaDrift.test.ts` | 139 | `schemaDrift` | sim | real | feliz+erro+borda |
| `selfHostedDiagnostics.test.ts` | 292 | `selfHostedDiagnostics` | sim | real | feliz+erro |
| `sendFunctionRouter.test.ts` | 206 | `sendFunctionRouter` | sim | real | feliz+erro+borda |
| `sendIdempotency.test.ts` | 173 | `sendIdempotency` | sim | real | feliz+erro+borda |
| `sentry.test.ts` | 220 | `sentry` | sim | real | feliz+erro+borda |
| `supabaseHelpers.test.ts` | 64 | `supabaseHelpers` | sim | real | so feliz |
| `undoToast.test.ts` | 170 | `undoToast` | sim | real | so feliz |
| `utils.test.ts` | 51 | `utils` | sim | real | feliz+borda |
| `web-vitals.test.ts` | 428 | `webVitals` | sim | real | feliz+erro+borda |
| `webauthnUtils.test.ts` | 153 | `webauthnUtils` | sim | real | feliz+borda |
| `webhookEventsDeepLink.test.ts` | 177 | `webhookEventsDeepLink` | sim | real | feliz+erro+borda |
| `webhookHealthAlerts.test.ts` | 283 | `webhookHealthAlerts` | sim | real | feliz+erro+borda |
| `webhookStatusPriority.test.ts` | 130 | `(nenhum — lógica inline)` | n/a | espelho (logica inline) | feliz+erro+borda |
| `whatsappAdapter.sendInteractive.test.ts` | 171 | `whatsappAdapter` | sim | real | so feliz |
| `whatsappAdapter.test.ts` | 561 | `whatsappAdapter` | sim | real | feliz+erro+borda |
| `whatsappConnectionsCache.test.ts` | 515 | `whatsappConnectionsCache` | sim | real | feliz+erro+borda |
| `withRequestId.test.ts` | 102 | `withRequestId` | sim | real | feliz+borda |

## 3. Testes órfãos (SUT inexistente) — candidatos a remoção

**Nenhum.** Todos os 84 pares teste→SUT resolvem para um arquivo existente. Verificação:
para cada import iniciado por `../` ou `@/lib/`, checagem de `src/lib/<nome>.{ts,tsx}` ou
`src/lib/<nome>/index.ts`.

Ressalva de método: a checagem é por **módulo**, não por **símbolo exportado**. Um teste que
importe um símbolo removido de um módulo que ainda existe não é detectável por esta análise
— exigiria typecheck, indisponível aqui. Marcado como **NAO_VERIFICADO**.

O análogo funcional de "órfão" neste bloco é outro: **SUT vivo cujo teste foi desligado**
(A2) e **teste vivo cujo SUT real nunca é carregado** (A1).

## 4. Placeholders e skips (falsa sensação de cobertura)

### 4.1 Suítes inteiras comentadas — restam placeholders vazios

- `src/lib/__tests__/externalProxy.test.ts:14-614` — 601 linhas comentadas em bloco.
  Resta `describe.skip(...)` com `it('original suites commented out; see header note', () => {})`
  em `externalProxy.test.ts:619-621` — um `it` de corpo vazio, zero asserções.
- `src/lib/__tests__/resilienceSimulation.test.ts:15-531` — 517 linhas comentadas; mesmo
  placeholder em `resilienceSimulation.test.ts:536-538`.

O comentário no próprio arquivo declara a intenção: *"This placeholder keeps vitest from
failing the file with 'No test suite found'"* (`externalProxy.test.ts:617`). Efeito colateral:
`wc -l` e contagem ingênua de `it(`/`expect(` atribuem a estes dois arquivos 65 testes e
122 asserções que **não existem como código executável**. Qualquer métrica de suíte que não
descarte estes dois arquivos superestima o bloco em ~1.150 linhas.

### 4.2 Arquivos Deno dentro de diretório vitest — executados por ninguém

`clientRateLimiter.test.ts`, `healthCheck.test.ts`, `queryTimeout.test.ts`,
`sanitize-extra.test.ts` usam `Deno.test(...)` e importam
`https://deno.land/std@0.224.0/assert/mod.ts`.

- Excluídos explicitamente do vitest — `vitest.config.ts`, bloco `// DENO`, que os lista
  nominalmente e afirma *"Rodam apenas com `deno test` (suíte separada)"*.
- Mas essa suíte separada não os alcança: `.github/workflows/deno-contract-tests.yml:53`
  coleta apenas `find supabase/functions -name '*.test.ts'`. `src/lib/` está fora do escopo,
  e os gatilhos `paths:` do workflow (linhas 4-12) só disparam em `supabase/functions/**`.
- `package.json` não tem script `deno test`; `deno.json` não define `tasks`.

Conclusão: a afirmação do comentário em `vitest.config.ts` está **desatualizada**. São 441
linhas de teste que nenhum runner executa.

`healthCheck.test.ts` é o pior caso — mesmo se fosse executado, é tautológico:
- `healthCheck.test.ts:8` — `assertExists(true)`
- `healthCheck.test.ts:13` — `assertEquals(true, true)`
- `healthCheck.test.ts:18-19` — `const expectedTtl = 5000; assertEquals(expectedTtl, 5000)`
- `healthCheck.test.ts:35+` — reimplementa `formatUptime` dentro do teste e testa a cópia.

O arquivo não importa `healthCheck.ts` em momento algum. Não há SUT.

### 4.3 Arquivo não coletado por incompatibilidade de nome

`src/lib/__tests__/debug-dompurify-test.ts` — o glob é
`include: ['src/**/*.{test,spec}.{ts,tsx}']` (`vitest.config.ts:20`), que exige `.test.ts`.
O arquivo termina em `-test.ts` (hífen, não ponto) e portanto **não é coletado**. Contém 2
testes reais de `sanitizeHtml`, funcionais, apenas invisíveis ao runner. Correção trivial:
renomear para `debug-dompurify.test.ts`.

### 4.4 Excluído por ambiente

`contactsDB.test.ts` (542 linhas, 51 testes — a suíte mais densa do bloco em cobertura de
erro/borda) está excluída em `vitest.config.ts` sob `// NEEDS-ENV`, exigindo
`VITE_EXTERNAL_SUPABASE_URL/ANON_KEY`. Não há workflow no repo que forneça essas variáveis
e rode este arquivo — o "script de integração" citado no comentário não foi localizado.
**NAO_VERIFICADO** se roda em algum lugar fora do repo.

## 5. Lacunas de cobertura relevantes

1. **`src/lib/externalProxy.ts` — módulo em produção, zero cobertura.** Ver A2. É a maior
   lacuna do bloco: o único teste do módulo está comentado.
2. **Testes-espelho não cobrem o SUT real** (A1, A3): `webhookStatusPriority`, `rateLimiter`,
   `phoneNormalization`, `groupsAutoSync`, `rlsGroupAccess`, `centenarias.simulacao` somam
   934 linhas que rodam verdes sem tocar em `supabase/functions/`.
3. **`whatsappAdapter.sendInteractive.test.ts`** — 4 testes, 8 asserções, nenhuma de erro ou
   borda (só caminho feliz), para um caminho de envio ao WhatsApp.
4. **`undoToast.test.ts`, `supabaseHelpers.test.ts`, `retryScheduleSimulation.test.ts`** —
   sem asserção de erro nem de borda detectada; só caminho feliz.
5. **`alertHistory.test.ts`** — 23 testes, 24 asserções (≈1 por teste) e nenhuma cobertura de
   borda; densidade sugere verificação superficial.

## 6. Achados

### A1 — `webhookStatusPriority.test.ts` valida lógica que produção não tem mais · 🔴 Crítico

O teste define sua própria cópia de `STATUS_PRIORITY` e `shouldUpdateStatus`
(`src/lib/__tests__/webhookStatusPriority.test.ts:5-22`) e nunca importa o módulo real.
A produção vive em `supabase/functions/_shared/evolution-helpers.ts:320-335` e **divergiu**:

| | teste (cópia) | produção |
|---|---|---|
| `'played'` | `3` (`webhookStatusPriority.test.ts:10`) | `4` (`evolution-helpers.ts:321`) |
| `newStatus === 'failed'` | `return true` incondicional (`:18`) | `return currentPriority < STATUS_PRIORITY['delivered']` (`evolution-helpers.ts:332`) |

Consequências concretas — o teste afirma o oposto do que produção faz:
- `webhookStatusPriority.test.ts:104` afirma `shouldUpdateStatus('delivered','failed') === true`;
  produção calcula `2 < 2` → **false**.
- `webhookStatusPriority.test.ts:105` afirma `shouldUpdateStatus('read','failed') === true`;
  produção calcula `3 < 2` → **false**.
- `webhookStatusPriority.test.ts:110` afirma `shouldUpdateStatus('read','played') === false`;
  produção calcula `4 > 3` → **true**.

A mudança em produção foi deliberada e está comentada em `evolution-helpers.ts:330-331`
(*"preventing stale error ACKs from downgrading already-confirmed messages"*). O teste
congelou o comportamento anterior e continua verde porque testa a si mesmo. É cobertura
negativa: sinaliza saúde sobre uma regra de negócio que foi revertida.

**Ação:** apagar a cópia inline e importar `shouldUpdateStatus`/`STATUS_PRIORITY` de
`supabase/functions/_shared/evolution-helpers.ts`, ou mover o teste para a suíte Deno de
contract tests que já cobre `supabase/functions/**`.

### A2 — `externalProxy.ts` está vivo em produção com o teste desligado · 🔴 Crítico

O cabeçalho de `externalProxy.test.ts:1-13` justifica o comentário da suíte afirmando que o
módulo "is slated for removal" e instrui: *"Remove this file together with
`src/lib/externalProxy.ts` and its remaining importers."* A remoção nunca aconteceu — o
módulo tem **5 importadores ativos**:

- `src/features/inbox/hooks/useFallbackContact.ts:5`
- `src/pages/admin-webhook-overview/useWebhookOverview.ts:6`
- `src/pages/admin-webhook-secret-status/useAdminWebhookStatus.ts:11`
- `src/pages/admin-webhook-events/useWebhookEvents.ts:5`
- `src/pages/admin-realtime-monitor/EventsLiveBlock.tsx:28`

O mesmo vale para `resilienceSimulation.test.ts`, que cobria circuit breaker, retry/backoff e
locks de auth desse cliente. Resultado: caminho de código ativo (incluindo fallback de contato
na inbox) sem nenhum teste, e 1.159 linhas de teste preservadas "para histórico" no diretório
ativo. Decidir: reativar as suítes ou concluir a remoção do módulo — o estado atual é o pior
dos dois.

### A3 — Cinco testes-espelho adicionais validam cópias, não o SUT · 🟠 Alto

Mesmo padrão de A1, sem divergência comprovada (ainda). Cada um declara no comentário que
espelha lógica de `evolution-webhook`, mas nenhum importa de `supabase/functions/`:

- `rateLimiter.test.ts:5-21` — reimplementa `RateLimiter`, `RATE_LIMIT_WINDOW_MS`,
  `RATE_LIMIT_MAX_EVENTS`. Comentário: *"extracted from evolution-webhook"*. Grep por
  `RATE_LIMIT_MAX_EVENTS` em `supabase/functions/` e `src/` **não retorna nada** — ou a
  constante foi renomeada, ou a lógica espelhada não existe mais. **NAO_VERIFICADO** qual.
- `groupsAutoSync.test.ts:19-32` — `extractGroupData`/`normalizeApiResponse` inline; grep por
  ambos fora de testes **não retorna nada**.
- `phoneNormalization.test.ts:4-12` — `normalizePhone` inline; existe
  `normalizePhone` real exportado e usado em
  `supabase/functions/_shared/evolution-webhook-msg-handlers.ts:5`.
- `rlsGroupAccess.test.ts:8-26` — reimplementa política RLS de `whatsapp_groups` como funções
  TS. Não valida o banco; valida quatro `if`s escritos no próprio arquivo. Um `DROP POLICY` em
  produção não quebraria este teste.
- `centenarias.simulacao.test.ts:18-40` — reimplementa cota global/por-alvo inline.

Estes arquivos têm valor como documentação executável de regra de negócio, mas **não são
testes de regressão**: nada os quebra quando produção muda. A1 é a prova de que o risco já se
materializou uma vez.

### A4 — Comentário de `vitest.config.ts` afirma execução que não ocorre · 🟠 Alto

`vitest.config.ts`, bloco `// DENO`: *"Rodam apenas com `deno test` (suíte separada)"*. Não
há suíte separada que os alcance (ver 4.2). O comentário faz a quarentena parecer uma
realocação de runner quando na prática é desativação. Corrigir o comentário ou estender
`deno-contract-tests.yml` para incluir os 4 arquivos (`src/shared/__tests__/validation.test.ts`
e `src/hooks/__tests__/useAudioRecorder.cleanup.test.ts`, listados no mesmo bloco, estão fora
do meu escopo mas têm o mesmo problema).

### A5 — `debug-dompurify-test.ts` invisível ao runner por nome · 🟡 Médio

Ver 4.3. Dois testes válidos de `sanitizeHtml` nunca coletados. Renomear para
`debug-dompurify.test.ts`. O nome também sugere artefato de depuração pontual — avaliar se
deve existir em vez de ser corrigido.

### A6 — `healthCheck.test.ts` é tautológico mesmo se reativado · 🟡 Médio

Ver 4.2. `assertEquals(true, true)`, `assertExists(true)`, constante comparada consigo mesma,
e `formatUptime` reimplementado localmente. 88 linhas, zero valor de verificação. Candidato a
remoção pura — reativá-lo não traria cobertura de `healthCheck.ts`.

### A7 — Asserções fracas em pontos de resiliência · 🟢 Baixo

`resolves.toBeDefined()` / `rejects.toBeDefined()` aceitam qualquer valor não-undefined e
qualquer erro, sem verificar tipo, código ou mensagem:
- `whatsappConnectionsCache.test.ts:291` e `:303` — `rejects.toBeDefined()` no caminho de falha
  de carregamento de conexões.
- `externalProxy.test.ts:565` e `:611` — dentro do bloco comentado (sem efeito hoje).

Em `whatsappConnectionsCache` vale apertar para `rejects.toThrow(<tipo/mensagem>)`; um erro de
programação (ex.: `TypeError`) satisfaz a asserção atual tão bem quanto o erro esperado.
