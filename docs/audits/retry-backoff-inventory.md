# Inventário: Retry / Backoff / Circuit Breaker no zapp-web-v3

> Auditoria F19 — Unificar retry/backoff. Data: 2026-08-02.
> Escopo: `src/` (frontend). Servidor (`supabase/functions/_shared/dlq-backoff.ts`)
> é mencionado apenas como espelho referenciado pelo cliente.
> Nenhum código foi alterado — apenas mapeamento.

---

## 1. Resumo executivo

Existem **pelo menos 21 arquivos** com lógica de retry/backoff/circuit-breaker,
distribuídos em **~13 implementações independentes** de retry e **4 circuit
breakers** distintos. A duplicação mais grave:

| Duplicação | Onde |
|---|---|
| `withRetry()` reimplementado em 2 lugares (lib + cópia local em voice) + loops inline em 8+ arquivos | `src/lib/retry.ts` vs `src/features/inbox/hooks/voice/retry.ts` vs loops inline |
| Fórmula de backoff exponencial reescrita ~9 vezes com parâmetros diferentes | `retryStrategyAudit.calculateRetryDelay`, `retry.ts`, `silentErrorPrevention.retryWithBackoff`, `externalProxy`, `failedMessagesEnqueue.computeBackoffMs`, `ai-router`, `useMessageQueue`, `useEvolutionApiManagement`, `evoApiHealth/proxy`, `useSipConnection`, `genericService` (linear) |
| Classificador de erro transitório reimplementado ~6 vezes | `isTransient` (evolutionSendRetry), `isTransientFailure` (failedMessagesEnqueue), `isRetryableError` (voice/retry), `classifyError`/`isRetryable` (retryStrategyAudit), `isPermanentQueryError` (genericService), checks inline (externalProxy, evoApiHealth) |
| Circuit breaker 4x | `evolutionCircuitBreaker.ts`, `externalProxyBreaker.ts` (2 breakers), classe interna `CircuitBreaker` em `retryStrategyAudit.ts`, objeto inline em `evolutionClient.ts` |
| Duas interfaces `RetryConfig` incompatíveis | `retryConfig.ts` (`maxRetries/baseBackoffMs/maxBackoffMs/timeoutMs`) vs `retryStrategyAudit.ts` (`maxAttempts/baseDelayMs/maxDelayMs/backoffMultiplier/jitterFactor`) |

---

## 2. Implementações de retry/backoff (núcleo)

### 2.1 `src/lib/retry.ts` — withRetry / withNetworkRetry ⭐ (candidato a base)
- **`withRetry<T>(operation, {maxRetries=3, baseDelayMs=1000, maxDelayMs=10000, shouldRetry, onRetry})`**
  - Fórmula: `delay = min(baseDelayMs * 2^attempt + Math.random()*500, maxDelayMs)` (jitter aditivo fixo de 500ms).
- **`withNetworkRetry<T>(operation, maxRetries=3)`** — wrapper que só retenta 5xx / fetch / network / timeout / 502-504.
- **Uso (10 arquivos):** `evolutionSendRetry.ts`, `useContactFormV3.ts`, `useAdminManagement.ts`, `AIConversationAssistant.tsx`, `EditContactDialog.tsx`, `messageSender.ts`, `useRetryAndErrorPrevention.ts` (import), `retryScheduleSimulation.ts` (documenta a fórmula).
- **Observação:** `withRetry` é o único com jitter + log estruturado + correlationId, mas não tem: classificador de erro unificado, métricas, orçamento de retry, timeout por loop.

### 2.2 `src/lib/retryStrategyAudit.ts` — RetryExecutor / calculateRetryDelay ⭐ (candidato a base)
- **`calculateRetryDelay(config, attemptNumber)`** — `min(base * multiplier^attempt, max) + jitter simétrico (±factor)`.
- **`classifyError(err)` / `isRetryable(err)`** — enum `RetryableErrorType` (NETWORK/TIMEOUT/RATE_LIMIT/UNAVAILABLE/TEMPORARY_FAILURE/NOT_RETRYABLE) por message/code.
- **`RetryExecutor.execute(fn, shouldRetry?)`** — loop com: circuit breaker por operação, retry budget (5min), timeout, métricas (`RetryMetrics`), log estruturado.
- **`RetryMetricsTracker` + `retryMetricsTracker`** — registro global de executors, `getHealthStatus()`.
- **Presets:** `RETRY_CONFIG_TRANSIENT` (3×100ms, mult 2, jitter 0.2), `RETRY_CONFIG_API` (5×500ms, CB threshold 10/60s), `RETRY_CONFIG_DATABASE` (3×200ms), `RETRY_CONFIG_ASYNC` (10×1000ms, mult 1.5).
- **Uso (2 arquivos):** apenas `useRetryAndErrorPrevention.ts` (via `useRetryableAsync`/`useRetryMetrics`). Subutilizado — é a implementação mais completa e a menos usada.

### 2.3 `src/lib/silentErrorPrevention.ts` — retryWithBackoff
- **`retryWithBackoff<T>(fn, {maxAttempts=3, delayMs=100, backoffMultiplier=2, shouldRetry})`**
  - Fórmula: `delay = delayMs * multiplier^(attempt-1)` — **sem jitter, sem cap** (pode crescer indefinidamente).
- **Uso (2 arquivos):** `useRetryAndErrorPrevention.ts` (via `useSafeRetry`) + internamente.

### 2.4 `src/lib/evolutionSendRetry.ts` — invokeEvolutionWithRetry (orquestrador Evolution)
- **`invokeEvolutionWithRetry(action, opts, config)`** — retry de envio Evolution com:
  - Config dinâmica por instância via `loadRetryConfig()` (retryConfig.ts) → delega o loop ao `withRetry` (2.1).
  - `isTransient(err)` — classificador próprio (status 5xx/429 + padrões de mensagem).
  - Circuit breaker por instância (evolutionCircuitBreaker.ts).
  - DLQ: `enqueueClientFailedMessage()` em falha definitiva.
  - Idempotência cross-tab via `crossTabDedupe`.
- **Uso (3 arquivos):** `messageSender.ts`, `sendIdempotency.ts`, e o próprio `evolutionCircuitBreaker.ts` (referência).

### 2.5 `src/hooks/useEvolutionApiManagement.ts` — callApi (loop inline)
- **`callApi(action, body, {retries, timeoutMs, baseBackoffMs})`** — loop `while (attempt < retries)` com:
  - `isRetriableStatus(status)` (5xx/408/425/429, não 401/403), `parseRetryAfter(d.retryAfter)` (Retry-After).
  - Fórmula: `backoff = err.retryAfterMs ?? baseBackoffMs * 2^(attempt-1)` + jitter `Math.random()*100`.
  - AbortController por tentativa (timeout).
- **Uso:** rotas de API Evolution (send-text, send-media, etc.).

### 2.6 `src/lib/externalProxy.ts` — proxy com retry inline
- Loop `for (attempt=1; attempt<=MAX_ATTEMPTS=3)` com:
  - Fórmula: `backoffBase = 200 * 2^(attempt-1)` + jitter `random * (base*0.5)`.
  - Usa `externalProxyBreaker.ts` (isBreakerOpen/recordBreakerFailure), auth locks, coalescing.
  - Telemetria de tentativas (`attemptMeta`).

### 2.7 `src/lib/failedMessagesEnqueue.ts` — computeBackoffMs (DLQ client)
- **`computeBackoffMs(attempt)`** — `min(60_000 * 2^(safe-1), 3_600_000)` + jitter 15%, floor 1s.
  - **Espelha** o helper servidor `supabase/functions/_shared/dlq-backoff.ts` (comentado no código).
- **`isTransientFailure(input)`** — classificador próprio (5xx/429/timeout/network; 400/401/403/404/422 permanente).

### 2.8 `src/hooks/useRetryAndErrorPrevention.ts` — hooks de retry (consolidação parcial)
- **`useRetryOperation(maxAttempts=3, baseDelayMs=500)`** — loop próprio com **multiplicador 3** (!), jitter 20%, cap 30s, toasts, FATAL_CODES. Usado para save de contato.
- **`useSafeRetry`** — wrapper do `retryWithBackoff` (2.3).
- **`useRetryableAsync` / `useRetryMetrics`** — wrappers do `RetryExecutor` (2.2).
- **`useSafeAsync` / `useSafeCallback` / `useSafePromise` / `useFireAndForget` / `useSuppressError` / `useAsyncEffect`** — wrappers do silentErrorPrevention (sem retry, mas no mesmo arquivo).

### 2.9 `src/features/inbox/hooks/useMessageQueue.ts` — fila de envio
- **`calculateNextRetryDelay(retryCount, config)`** — `min(baseDelay * 2^retryCount, maxDelay)` + jitter 20%.
- Loop de processamento de fila com retry agendado (`nextRetryAt`), métricas `[QUEUE_ERROR]`/`[INBOX_METRIC]`.

### 2.10 `src/integrations/supabase/ai-router.ts` — callAiRouter (loop inline)
- `for (attempt=0; attempt<retries)` com `delayMs = Math.pow(2, attempt) * 100` — **sem jitter**, retries default = 1. Sem classificador (retenta qualquer erro).

### 2.11 `src/services/api/genericService.ts` — applyRetry (backoff LINEAR)
- **`applyRetry(fn, maxRetries=3, delay=1000)`** — `delay * (i+1)` — **backoff linear, não exponencial**.
- Guarda `isPermanentQueryError` (42501, 401/403, 42P01/42883) — não retenta erro permanente.

### 2.12 `src/features/inbox/hooks/voice/retry.ts` — CÓPIA LOCAL de withRetry ⚠️
- **`withRetry(fn, maxRetries=2, baseDelay=500)`** — função local que **sombreia** a da lib (mesmo nome, assinatura diferente).
- **`isRetryableError(error)`** — classificador próprio (network/timeout/aborted/fetch/500/503/429).
- **Recomendação:** migrar para `withRetry` da lib — duplicação direta.

### 2.13 Outras implementações menores
| Arquivo | Função | Fórmula |
|---|---|---|
| `src/lib/realtime/crossTabDedupe.ts` | `writeWithRetry` (CAS) | tabela fixa `[10,20,40]ms`, 3 retries |
| `src/features/inbox/hooks/sip/useSipConnection.ts` | reconexão SIP | `min(1000 * 2^attempts, 30000)` |
| `src/hooks/useEvolutionAutoReconnect.ts` | auto-reconnect | `min(backoffRef*2, 60000)`, inicial 2s, máx 20 tentativas |
| `src/lib/evoApiHealth/proxy.ts` | retry schema-error | `Math.pow(2, retryCount)*1000 + rand*1000`, máx 5 |

---

## 3. Circuit breakers (4 implementações)

| # | Arquivo | Escopo | Threshold | Cooldown | Estado |
|---|---|---|---|---|---|
| 1 | `src/lib/evolutionCircuitBreaker.ts` ⭐ | por instância Evolution | 5 falhas consecutivas | 30s | CLOSED/OPEN/HALF_OPEN, eventos via `subscribeBreakerEvents`, `getAllBreakerStates()` p/ dashboard |
| 2 | `src/lib/externalProxyBreaker.ts` | por target do proxy | 4 falhas (request) / 3 em 30s (health) | 5s / 60s | Map simples fails/openedAt + health breaker + auth locks |
| 3 | `src/lib/retryStrategyAudit.ts` (classe interna `CircuitBreaker`) | por operação RetryExecutor | `circuitBreakerThreshold` do config (default 10) | `circuitBreakerResetMs` (default 60s) | closed/open/half_open — **não exportada**, só via RetryExecutor |
| 4 | `src/integrations/zappweb/evolutionClient.ts` (objeto inline `circuitBreaker`) | auth Evolution (401/403) | 3 erros consecutivos | 30 min | suspende chamadas; `bustKeyCache()` ao abrir |

**Nota:** `ai-router.ts` menciona circuit breaker em comentários (E1-E9) mas o código só tem retry loop — sem breaker real.

---

## 4. Configuração de retry

### `src/lib/retryConfig.ts` — fonte de config dinâmica
- `RetryConfig` (diferente da do retryStrategyAudit): `maxRetries, baseBackoffMs, maxBackoffMs, timeoutMs`.
- `DEFAULT_RETRY_CONFIG`: 3 / 800ms / 6000ms / 30s.
- Persistência: `global_settings` → `retry.global.*` e `retry.instance.<name>.*`; resolução instance → global → default.
- Cache TTL 60s + dedupe inflight; `getRetryConfigSync` p/ hooks; `validateRetryConfig` + `RetryConfigValidationError`.
- **Uso (9 arquivos):** `evolutionSendRetry.ts`, `useEvolutionApiManagement.ts`, `useInstanceRetryConfig.ts` (hook admin), `RetryConfigPanel.tsx`, `RetrySchedulePreview.tsx`, `retryScheduleSimulation.ts`, `services/api/index.ts`, `services/api/queryFactory.ts`, `shared/validation.ts`.

### `src/lib/retryScheduleSimulation.ts`
- `simulateRetrySchedule(config)` — simulação determinística do cronograma de `withRetry` (fórmula `min(base*2^i, max)`, sem jitter) para preview na UI. `formatScheduleMs`.

### Duplicação de interface
- `retryConfig.ts` (campos `maxRetries/baseBackoffMs/maxBackoffMs/timeoutMs`) **vs** `retryStrategyAudit.ts` (campos `maxAttempts/baseDelayMs/maxDelayMs/backoffMultiplier/jitterFactor`). Duas fontes de verdade incompatíveis; `RetryExecutor` não consome `retryConfig.ts`.

---

## 5. Consumidores de UI (não implementam, apenas exibem)

`RetryConfigPanel.tsx`, `RetryConfigBackoffTable.tsx` (perfis rate_limit/network/timeout), `RetrySchedulePreview.tsx`, `RetryMetricsPanel.tsx` + `useRetryMetricsPanelState.ts`, `RetryAlertsBanner.tsx`, `RetryAlertsConfig.tsx`, `BulkReprocessGuidedDialog.tsx`, `DLQPanel.tsx`/`DLQAuditHistory.tsx`, `FailedMessageAlertsMount.tsx`, `useRetryMetrics.ts`, `useFailedMessages.ts`, `useDlqAuditLog.ts`, `useDispatchErrorLogs.ts`.

---

## 6. Duplicações identificadas (detalhe)

1. **`withRetry` duplicado:** `src/lib/retry.ts` (com jitter+log) vs `src/features/inbox/hooks/voice/retry.ts` (cópia local, sem jitter) vs loop em `useRetryOperation` (mult 3, com toast) vs loop inline em `callAiRouter`, `evoApiHealth`, `genericService`, `externalProxy`, `useMessageQueue`, `useSipConnection`, `useEvolutionAutoReconnect`, `useEvolutionApiManagement`.
2. **Fórmula de backoff reescrita ~9x** com constantes divergentes:
   - retry.ts: `base*2^n + rand*500` cap 10s
   - retryStrategyAudit: `base*mult^n ± jitter` (mult configurável)
   - silentErrorPrevention: `base*2^(n-1)` sem cap/jitter
   - externalProxy: `200*2^(n-1)` + 50% jitter
   - failedMessagesEnqueue: `60s*2^(n-1)` cap 1h + 15% jitter
   - useMessageQueue: `base*2^n` + 20% jitter
   - ai-router: `100*2^n`
   - evoApiHealth: `1000*2^n + rand*1000`
   - genericService: `1000*(n)` — LINEAR
   - useSipConnection/useEvolutionAutoReconnect: reconnect doubling com caps diferentes (30s vs 60s)
3. **Classificadores de erro transitório ~6x:** `isTransient` (evolutionSendRetry), `isTransientFailure` (failedMessagesEnqueue), `isRetryableError` (voice/retry), `classifyError`/`isRetryable` (retryStrategyAudit), `isPermanentQueryError` (genericService), checks inline (externalProxy, evoApiHealth). Padrões divergentes (ex.: voice/retry não cobre ECONNRESET; retryStrategyAudit cobre).
4. **Circuit breaker 4x** com 3 estados implementados de formas diferentes (classes vs Maps vs objeto literal).
5. **Duas interfaces RetryConfig** incompatíveis + config dinâmica (`retryConfig.ts`) que o `RetryExecutor` não consome.
6. **DLQ backoff duplicado client×server:** `computeBackoffMs` (client) espelha `_shared/dlq-backoff.ts` (server) — drift potencial.

---

## 7. Recomendação de consolidação (F19)

Criar um módulo único `src/lib/retry/` (ou `src/lib/resilience/`) com:

1. **`backoff.ts`** — `calculateBackoffMs({baseDelayMs, multiplier, maxDelayMs, jitterFactor}, attempt)` — fórmula única, parâmetros default únicos. Substitui as 9 fórmulas.
2. **`retry.ts`** — `withRetry(operation, RetryOptions)` unificado a partir de `src/lib/retry.ts` (manter jitter + log + correlationId), ganhando: classificador, timeout por loop, orçamento, métricas (absorver capacidades do `RetryExecutor`).
3. **`classify.ts`** — `classifyError`/`isTransient` unificado (absorver `RetryableErrorType` + padrões do `isTransient` da Evolution + `isPermanentQueryError`).
4. **`circuitBreaker.ts`** — classe genérica (CLOSED/OPEN/HALF_OPEN, subscribe, inspeção) parametrizável; substituir os 4 breakers (evolutionCircuitBreaker, externalProxyBreaker, classe interna, objeto do evolutionClient).
5. **`retryConfig.ts`** — unificar a interface (adotar campos do `retryConfig.ts` e mapear `RetryExecutor` para consumi-la; ou uma interface única `{maxAttempts, baseDelayMs, maxDelayMs, multiplier, jitterFactor, timeoutMs}`).

Ordem de migração sugerida (menor risco primeiro):
1. `voice/retry.ts` → importar `withRetry` da lib (elimina cópia).
2. Loops inline de `ai-router`, `evoApiHealth`, `genericService` (linear → exponencial padronizado), `useSipConnection`, `useEvolutionAutoReconnect` → `withRetry`/`calculateBackoffMs`.
3. `useEvolutionApiManagement.callApi` → manter Retry-After, delegar cálculo ao backoff único.
4. `externalProxy` + `failedMessagesEnqueue` → breakers/backoff compartilhados (preservando constantes de produção via config).
5. Unificar breakers → classe única; manter `evolutionCircuitBreaker` como facade para compatibilidade de imports/tests.
6. Migrar `useRetryOperation`/`useSafeRetry`/`useRetryableAsync` para os primitivos únicos (mantendo hooks como facade).

### Riscos / cuidados
- **Constantes de produção divergentes** (ex.: DLQ 60s base vs Evolution 800ms) devem virar config, não valores hardcoded no módulo único.
- `retryScheduleSimulation.ts` e `RetryConfigBackoffTable.tsx` dependem das fórmulas atuais — atualizar junto.
- Tests existentes: `retryConfig.test.ts`, `retryScheduleSimulation.test.ts`, `evolutionSendRetry.invoke.test.ts`, `evolutionSendRetry.isTransient.test.ts`, `evolutionCircuitBreaker.test.ts`, `externalProxy.test.ts` — manter exports/facades para não quebrar.
- Backoff **linear** do `genericService` pode ser intencional (queryFactory) — confirmar antes de trocar para exponencial.
