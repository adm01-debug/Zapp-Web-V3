# Baseline — Testes de Edge Functions (Deno) + deno check

**Data:** 2026-08-06
**Repo:** zapp-web-v3 — HEAD `a963b496f` (`feat(fase2): migrations F2-31 (sync ORDER BY) + F2-34 (retencao webhook logs) + stack dlq-inspector v4`)
**Worktree:** `C:/zapp-web-v3-wt-testes` (branch `qa/edge-tests`)
**Deno:** 2.3.2 (CI: deno v2.x, ubuntu-latest)
**Contrato CI:** `.github/workflows/deno-contract-tests.yml` — loop `find supabase/functions -name '*.test.ts'` rodando `deno test --allow-net --allow-env --allow-read "$f"` por arquivo (SEM `--no-check`; exit 1 em falha).

> Objetivo: baseline para comparar com as mudanças em andamento em `evolution-api` (action `get-media-base64`) e `_shared` (evolution-media, evolution-api-proxy, storage-url) em outras branches.

---

## 1. Loop CI-equivalente (deno test)

Comando reproduzido (Windows/git-bash, `NO_COLOR=1`):

```bash
for f in $(find supabase/functions -name '*.test.ts' | sort); do
  timeout 240 env NO_COLOR=1 deno test --allow-net --allow-env --allow-read "$f"
done
```

### Resultado agregado

| Métrica | Valor |
|---|---|
| Arquivos de teste encontrados | **69** |
| Arquivos PASS (exit 0) | **57** |
| Arquivos FAIL (exit 1) | **12** |
| Testes executados (soma `ok \| N passed`) | **1273** |
| Asserts falhos | **0** |
| Falhas de type-check (testes nem chegaram a rodar) | **12 arquivos / 64 erros TS** |

**Conclusão principal:** as 12 falhas do baseline são TODAS `error: Type checking failed.` (o `deno test` type-checka por padrão no Deno 2.x; o CI não usa `--no-check`). **Não há nenhuma falha de assert** — 1273/1273 testes executados passaram. Os 12 arquivos que falham são exatamente o padrão pré-existente conhecido do contract-kit (caso C-9): `ParseResult`/`ContractParseResult` sem `.body`/`.response` em `ParseOk`, decorrente do contrato tipado do `_shared/contract-kit.ts`.

### Falhas por arquivo (todas type-check; 0 testes executados nesses arquivos)

| Arquivo | Erros TS | Padrão dominante |
|---|---|---|
| `_shared/__tests__/contract-cross-endpoint.test.ts` | 4 | TS2339 `ParseResult.response` |
| `_shared/__tests__/contract-gate-undefined-schema.test.ts` | 5 | TS2339 `ParseResult.response` |
| `_shared/__tests__/contract-matrix.test.ts` | 23 | TS2339 `ParseResult.body/.response` |
| `_shared/__tests__/contract-schemas-integrations.test.ts` | 7 | TS2339 `ParseResult.body/.response` |
| `_shared/__tests__/contract-versioning.test.ts` | 9 | TS2339 `ParseResult.body/.response` |
| `_shared/__tests__/edge-contract-schemas.test.ts` | 4 | TS2339 `ContractParseResult.response` |
| `audio-transcribe/__tests__/contract.test.ts` | 4 | TS2339 `ParseResult.response` |
| `connection-health-check/evaluateHealth.test.ts` | 1 | TS2339 `ParseResult.response` |
| `evolution-credentials/__tests__/contract.test.ts` | 4 | TS2339 `ParseResult.response` |
| `public-api/__tests__/e2e-send.test.ts` | 1 | TS2339 `ParseResult.response` |
| `send-email/__tests__/contract.test.ts` | 1 | TS2339 `ParseResult.response` |
| **`evolution-api/__tests__/get-media-base64.test.ts`** | **1** | **TS2322 — ver detalhe abaixo** |

**Total: 64 erros TS em 12 arquivos.** Exceção relevante (única fora do padrão ParseResult):

```
evolution-api/__tests__/get-media-base64.test.ts:87:9
TS2322 [ERROR]: Type 'Promise<unknown>' is not assignable to type 'Promise<Response>'.
  Type '{}' is missing the following properties from type 'Response': headers, ok, redirected, status, and 12 more.
        new Promise((_resolve, reject) => {
        ^
  (expected type vem do retorno de fetch() — lib.deno.fetch.d.ts)
```

### Testes do evolution-api (function tocada) — por arquivo

| Arquivo | Resultado |
|---|---|
| `evolution-api/index.test.ts` | ok — 2 passed |
| `__tests__/connect-auth-errors.test.ts` | ok — 2 passed |
| `__tests__/connect-missing-instance.test.ts` | ok — 1 passed |
| `__tests__/proxy-fetch-failure.test.ts` | ok — 6 passed |
| `__tests__/send-media-audio-instance.test.ts` | ok — 5 passed |
| `__tests__/send-sticker-instance.test.ts` | ok — 6 passed |
| `__tests__/v237-fallback.test.ts` | ok — 7 passed |
| `__tests__/get-media-base64.test.ts` | **FAIL — type-check (TS2322)** |

**evolution-api: 29 testes passando em 7 arquivos; 1 arquivo bloqueado por type-check** (get-media-base64, o próprio arquivo da action em mudança — ATENÇÃO: se a mudança em andamento mexer no stub de fetch/Response desse teste, o TS2322 pode mudar de forma/contagem; é o ponto mais sensível para diff pós-mudanças).

---

## 2. deno check (functions tocadas)

```bash
NO_COLOR=1 deno check supabase/functions/evolution-api/index.ts
NO_COLOR=1 deno check supabase/functions/_shared/evolution-media.ts
NO_COLOR=1 deno check supabase/functions/_shared/evolution-api-proxy.ts
NO_COLOR=1 deno check supabase/functions/_shared/storage-url.ts
```

| Arquivo | Exit | Erros |
|---|---|---|
| `supabase/functions/evolution-api/index.ts` | 1 | **3 erros (pré-existentes, padrão C-9)** |
| `supabase/functions/_shared/evolution-media.ts` | 0 | 0 |
| `supabase/functions/_shared/evolution-api-proxy.ts` | 0 | 0 |
| `supabase/functions/_shared/storage-url.ts` | 0 | 0 |

### Erros pré-existentes do evolution-api/index.ts (3)

```
TS2339 [ERROR]: Property 'response' does not exist on type 'ParseResult<unknown>'.
  Property 'response' does not exist on type 'ParseOk<unknown>'.
    if (!parsed.ok) return parsed.response;          index.ts:63:39

TS2339 [ERROR]: Property 'response' does not exist on type 'ParseResult<unknown>'.
  Property 'response' does not exist on type 'ParseOk<unknown>'.
    if (!parsed.ok) return parsed.response;          index.ts:73:35

TS2345 [ERROR]: Argument of type 'SupabaseClient<any, "zapp", any>' is not assignable to
  parameter of type 'SupabaseClient<any, "public", any>'.
  Type '"zapp"' is not assignable to type '"public"'.
    const resolvedStickerUrl = rawStickerUrl ? await resolvePrivateBucketUrl(supabase, rawStickerUrl) : undefined;
                                                     index.ts:131:80
```

> Padrão idêntico ao caso C-9 documentado no skill `supabase-edge-function-ops` (evolution-webhook): contract-kit `ParseResult` `.body`/`.response` + `SupabaseClient<any,"zapp">` vs `"public"` pós-regeneração de `src/integrations/supabase/types.ts`. **Não são regressão das mudanças em andamento — são o estado do HEAD.**

---

## 3. Observações para comparação pós-mudanças

1. **Contagem-alvo por arquivo (baseline):**
   - `evolution-api/index.ts` → 3 erros TS (2× TS2339 em 63/73 + 1× TS2345 em 131)
   - `_shared/evolution-media.ts`, `_shared/evolution-api-proxy.ts`, `_shared/storage-url.ts` → 0 erros
2. **Arquivos de teste que DEVEM permanecer com o mesmo status:** `get-media-base64.test.ts` (TS2322 na linha 87 do stub `new Promise(...)` sem retorno `Response` tipado) e os 11 arquivos com TS2339 ParseResult (64 erros no total da suíte).
3. **1273 testes passando é o piso:** qualquer mudança que derrube teste executado (assert) ou adicione arquivo com type-check falho além dos 12 = regressão detectável.
4. **CI hoje já falha nos 12 arquivos** (o contrato não usa `--no-check`) — ou seja, o baseline do CI neste HEAD é 57/69 verde. Isto é pré-existente e conhecido (C-9), não causado pelas mudanças em análise.

## 4. Como reproduzir

```bash
git worktree add C:/zapp-web-v3-wt-testes -b qa/edge-tests
cd /c/zapp-web-v3-wt-testes
# testes (CI-equivalente)
for f in $(find supabase/functions -name '*.test.ts' | sort); do
  timeout 240 env NO_COLOR=1 deno test --allow-net --allow-env --allow-read "$f"; echo "rc=$?"
done
# checks
NO_COLOR=1 deno check supabase/functions/evolution-api/index.ts
NO_COLOR=1 deno check supabase/functions/_shared/evolution-media.ts
NO_COLOR=1 deno check supabase/functions/_shared/evolution-api-proxy.ts
NO_COLOR=1 deno check supabase/functions/_shared/storage-url.ts
```

Logs brutos por arquivo: `/tmp/edge-tests-out/*.log` (sessão da coleta; não persistidos no repo).
