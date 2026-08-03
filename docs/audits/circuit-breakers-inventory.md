# Inventário: Circuit Breakers do ZAPP Web — Estado Atual

> F9-19 — Três circuit breakers independentes para a mesma Evolution API,
> com limiares divergentes e sem estado compartilhado.
> Data da verificação: **2026-08-03** (estado do código em `src/`).
> Nenhum código foi alterado para produzir este documento — apenas mapeamento
> e registro de estado.
> Cross-ref: [`retry-backoff-inventory.md`](./retry-backoff-inventory.md)
> (auditoria F19, 2026-08-02) · F9-05 (remoção do `retryStrategyAudit.ts`) ·
> F9-19 no `PLANO_IMPLEMENTACAO_100.md`.

---

## 1. Resumo executivo

Existem **3 circuit breakers ativos e independentes para a MESMA Evolution
API**, com políticas divergentes e **nenhum estado compartilhado**:

| # | Arquivo | Tipo | Threshold | Cooldown | Gatilho |
|---|---|---|---|---|---|
| CB-1 | `src/lib/evolutionCircuitBreaker.ts` ⭐ | máquina de estados `CLOSED/OPEN/HALF_OPEN` | 5 falhas consecutivas | 30 s | qualquer falha transitória do envio |
| CB-2 | `src/lib/retryStrategyAudit.ts` (classe interna `CircuitBreaker`) | classe `closed/open/half_open` | 10 (configurável) | 60 s | qualquer erro da operação no `RetryExecutor` |
| CB-3 | `src/integrations/zappweb/evolutionClient.ts` (objeto literal) | objeto simples sem HALF_OPEN | 3 erros consecutivos | **30 min** | somente auth (401/403) |

Consequência prática (F9-19): o mesmo serviço abre circuito com **3, 5 ou 10
falhas** e permanece aberto por **30 s, 60 s ou 30 min** dependendo de qual
caminho de código falhou. Um caminho pode estar em `OPEN` enquanto outro
segue martelando a API — nenhum dos três compartilha estado.

---

## 2. Estado por breaker

### CB-1 — `src/lib/evolutionCircuitBreaker.ts` ⭐ (canônico, 260 L)

**Estado verificado em 2026-08-03:** implementação completa e ativa, consumida
por `src/lib/evolutionSendRetry.ts` (imports em `:23-26`; uso em `:135-173`;
`CircuitOpenError` também enfileira na DLQ em `:204-206`).

- **Máquina de estados:** `CLOSED` → `OPEN` → `HALF_OPEN` → (`CLOSED` | `OPEN`),
  com transições emitidas via `emitTransition` → `subscribeBreakerEvents`
  (tag `[breaker-event]` para grep em dashboards).
- **Config default** (`DEFAULT_BREAKER_CONFIG`, `:43-46`): `failureThreshold: 5`,
  `cooldownMs: 30_000`.
- **Sem janela temporal:** conta apenas falhas **consecutivas** — 5 falhas
  espaçadas em uma hora abrem o circuito igual a 5 falhas em um segundo; um
  único sucesso intercalado zera o contador (`recordSuccess`, `:190-206`).
- **Estado por instância** (Map `breakers`, `:55`), **in-memory por aba** —
  reload zera (decisão deliberada, documentada no cabeçalho `:21-24`).
- **Inspeção:** `canCall()` (com transição OPEN→HALF_OPEN), `inspect()`,
  `getAllBreakerStates()` (dashboard/admin), `CircuitOpenError` com
  `retryAfterMs`.
- **Testes:** `evolutionCircuitBreaker.test.ts` (ganchos `__setBreakerNow` /
  `__resetBreakerState`).
- **Estado em runtime:** todos os circuitos iniciam `CLOSED` com
  `consecutiveFailures: 0`; nada persiste entre abas ou reloads.

### CB-2 — `src/lib/retryStrategyAudit.ts` (classe interna `CircuitBreaker`, ~:195-232)

**Estado verificado em 2026-08-03:** classe **não exportada** — só acessível
via `RetryExecutor.execute()` (map `circuitBreakerMap` por `operationName`,
`:239-267`). Arquivo inteiro é candidato a remoção pelo F9-05.

- **Config default** (`:89-90`): `circuitBreakerThreshold: 10`,
  `circuitBreakerResetMs: 60_000`; criado apenas se `config.circuitBreakerThreshold`
  estiver setado (`:264-267`).
- **Estados:** strings lowercase `'closed' | 'open' | 'half_open'`.
- **Semântica:** `canExecute()` permite em `closed`/`half_open`; em `open`
  reabre para `half_open` após `resetTimeMs`. `recordFailure()` conta
  **falhas consecutivas** (sem janela temporal).
- **Consumidores reais:** apenas `useRetryAndErrorPrevention.ts`
  (`useRetryableAsync`) → 2 diálogos de CRUD (`EditContactDialog.tsx`,
  `useContactFormV3.ts`). Nenhum caminho de mensageria.
- **Estado em runtime:** por `operationName`, in-memory por aba; sem
  eventos/inspector externo.

### CB-3 — `src/integrations/zappweb/evolutionClient.ts` (objeto literal, ~:136-168)

**Estado verificado em 2026-08-03:** objeto `circuitBreaker` inline, ativo no
fluxo de auth da Evolution (busca de key via edge fn + chamadas autenticadas).

- **Config:** `THRESHOLD: 3`, `OPEN_MS: 30 * 60_000` (**30 minutos**).
- **Gatilho exclusivo:** `recordError(status)` só conta `401`/`403` — erros
  não-auth **zeram** o contador. Em erro auth, chama `bustKeyCache()` (key
  pode ter sido rotacionada no Vault).
- **Sem HALF_OPEN:** `isOpen()` retorna `true` até `openUntil` passar; ao
  expirar, zera contadores e loga `CLOSED — retomando chamadas`.
- **Estado em runtime:** in-memory por aba; inicia fechado.

---

## 3. Tabela de divergência (por que F9-19 é risco)

| Aspecto | CB-1 `evolutionCircuitBreaker` | CB-2 `retryStrategyAudit` | CB-3 `evolutionClient` |
|---|---|---|---|
| Threshold | 5 | 10 | 3 |
| Cooldown | 30 s | 60 s | 30 min |
| Gatilho | falha transitória (qualquer) | qualquer erro da operação | somente 401/403 |
| Máquina de estados | CLOSED/OPEN/HALF_OPEN | closed/open/half_open | sem HALF_OPEN |
| Janela temporal | ❌ (consecutivas) | ❌ (consecutivas) | ❌ (consecutivas) |
| Estado compartilhado | ❌ | ❌ | ❌ |
| Persistência | in-memory (aba) | in-memory (aba) | in-memory (aba) |
| Eventos/inspeção | ✅ `subscribeBreakerEvents` / `getAllBreakerStates` | ❌ | ❌ |
| Escopo do estado | por instância Evolution | por operationName | global do módulo |
| Testes | ✅ | indireto | ❌ |

**Cenário concreto do risco:** durante degradação intermitente da Evolution,
CB-1 (5 consecutivas) pode nunca abrir — cada sucesso zera o contador —,
enquanto CB-3 abre por 30 min ao ver 3×401 e suspende chamadas que CB-1
continuaria permitindo; e CB-2, em outra aba, abre/fecha com política própria.
N abas do mesmo operador = N circuitos independentes (todos in-memory).

---

## 4. Estado atual (2026-08-03) — o que está pendente

- [ ] **Consolidação não iniciada.** Os 3 breakers seguem ativos e
      independentes; nenhum foi eleito/removido (remediação F9-19 pendente).
- [ ] **Janela deslizante ausente** em todos (ex.: 5 falhas em 60 s) —
      degradação intermitente é invisível ao contador consecutivo (F9-19, ação 3).
- [ ] **Aceite F9-19 não atingido:** `grep -rln "THRESHOLD\|failureThreshold\|circuitBreakerThreshold" src/ --include=*.ts | grep -v __tests__` ainda retorna
      **15 arquivos** (o alvo é `1`). Desses, **4 têm breaker real** (os 3
      abaixo + `externalProxyBreaker.ts`); os demais 11 usam `THRESHOLD` como
      constante genérica sem relação com circuit breaker (ex.: `webVitals.ts`,
      `useRateLimitAlerts.ts`, `connectionPool.ts`, `clientTelemetry.ts`).
- [ ] **`retryStrategyAudit.ts`** segue no código aguardando o F9-05.
- [x] CB-1 já possui: eventos estruturados, inspeção, `CircuitOpenError` e
      fallback DLQ — base natural para o breaker único.

---

## 5. Breakers relacionados (fora do escopo F9-19)

| Arquivo | Alvo | Threshold | Cooldown | Nota |
|---|---|---|---|---|
| `src/lib/externalProxyBreaker.ts` | proxy externo (não-Evolution) | 4 falhas (request) / 3 em 30 s (health) | 5 s / 60 s | 2 mecanismos no mesmo arquivo, por target; conta no aceite `grep` do F9-19 |
| `src/lib/ai-router.ts` | — | — | — | cita circuit breaker **apenas em comentários** (E1-E9); código tem só loop de retry |

A auditoria F19 (`retry-backoff-inventory.md`, seção 3) contabiliza
**4 implementações** somando o `externalProxyBreaker.ts` ao trio F9-19.

---

## 6. Remediação planejada (F9-19 + F19)

1. **Eleger CB-1** (`evolutionCircuitBreaker.ts`) como implementação única.
2. **Migrar CB-3** (`evolutionClient.ts`) para consumir CB-1, preservando a
   regra 401/403 como **tipo de falha** (não como breaker paralelo).
3. **Remover CB-2** junto com o `retryStrategyAudit.ts` (F9-05).
4. **Adicionar janela deslizante** ao breaker canônico (ex.: 5 falhas em 60 s).
5. Consolidar `externalProxyBreaker` na classe única na sequência do F19
   (preservando constantes de produção via config).

### Como inspecionar o estado em runtime (hoje)

- CB-1: `getAllBreakerStates()` ou logs `[breaker-event]` / `[breaker]`.
- CB-3: logs `[evolutionClient] circuit breaker OPEN/CLOSED`.
- CB-2: sem superfície externa — apenas logs `Circuit breaker opened after N
  failures` do `RetryExecutor`.

---

## 7. Verificação

- Data da verificação: 2026-08-03 · comando `grep` acima: **15 arquivos**
  (alvo 1); 4 com breaker real, 11 com `THRESHOLD` genérico.
- Fontes lidas: `evolutionCircuitBreaker.ts` (260 L, completo),
  `retryStrategyAudit.ts` (`:89-90`, `:195-267`), `evolutionClient.ts`
  (`:136-168`), `externalProxyBreaker.ts` (`:1-95`), `evolutionSendRetry.ts`
  (`:23-26`, `:135-173`, `:204-206`).
