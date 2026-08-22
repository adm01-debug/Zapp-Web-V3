# Testes de Contrato — Webhooks & Edge Functions

> Introduzido em 2026-07-10 (branch `feat/contract-kit-zod-v1v2`). Runner: `deno test`.
> Cobertura 100% consolidada em 2026-08-04 (`parseOrReject` em todas as edge functions que leem body).

## Arquitetura

| Arquivo | Papel |
|---|---|
| `_shared/contract-kit.ts` | Motor `parseOrReject`: valida body contra schema Zod, negocia versão (v1/v2) e emite o envelope 422 único. |
| `_shared/contract-schemas.ts` | Registro central `CONTRACT_SCHEMAS` (contrato → versão → schema Zod). Schemas derivados do consumo REAL de campos de cada `index.ts`. |
| `_shared/contract-versions.ts` | Registro `CONTRACTS` de versões `current`/`supported`/`sunset` por contrato. |
| `_shared/edge-contract-schemas.ts` | Registry legado (`EdgeFunctionContractSchemas` — mantido pelo Invariante 8) + `ContractLifecycles` espelhando o canônico para os webhooks v2. `parseContractRequest`/`contractErrorResponse` removidos em 2026-08-21 (Bloco 2, etapas 20/21/93 — 0 chamadores de produção). |
| `_shared/webhook-schemas.ts` | Schemas dos webhooks externos (Evolution, Meta/WhatsApp Cloud, Gmail, ElevenLabs, WhatsApp legado) — V1 e V2. |
| `_shared/__tests__/contract-kit.test.ts` | Envelope 422 consistente, negociação de versão, deprecação, payloads adversariais. |
| `_shared/__tests__/contract-schemas.test.ts` | Matriz por endpoint: válido / campo ausente / tipo errado / valor vazio. |
| `_shared/__tests__/contract-coverage.test.ts` | **Gate de cobertura 100%**: toda função que lê body DEVE invocar o gate (allowlist: `main`, `mcp` — proxies que não podem consumir stream). |
| `_shared/__tests__/contract-versioning.test.ts` | Compatibilidade retroativa v1/v2: auto-detecção, header `x-contract-version`, 422 para versão não suportada, headers de sunset. |
| `_shared/__tests__/contract-sunset-policy.test.ts` | Política pós-sunset (etapa 55): `isSunsetExpired`, 410 `contract_version_sunset` para versão pedida explicitamente, auto-detecção permanece imune, canário sobre sunsets reais ainda não expirados. |
| `_shared/adversarial-matrix.ts` | Gerador automático de casos por campo (Bloco 6): introspecciona o schema Zod real de cada contrato e deriva missing_required/wrong_type/empty_string/invalid_enum/explicit_null/extra_field — sem fixture manual por contrato. |
| `_shared/__tests__/contract-field-matrix.test.ts` | Consome `adversarial-matrix.ts` para os contratos não-multipart: casos gerados e testados, gate "no silent caps" sobre wrong_type/explicit_null omitidos. |
| `_shared/__tests__/contract-multipart-matrix.test.ts` | Etapa 72: os 3 contratos multipart (file-security-scanner, secure-upload, voice-changer) excluídos do gerador genérico (não sintetiza `File` real) — testados à mão com `File` real via `parseOrReject`. |
| `_shared/__tests__/unified-error-format.test.ts` | Shape canônico do envelope de erro em todos os códigos. |
| `_shared/__tests__/contract-cross-endpoint.test.ts` | Consistência do shape entre endpoints (1 shape canônico para todas as falhas). |

## Formato único de erro (HTTP 422)

```json
{
  "error": true,
  "code": "contract_violation | invalid_json | unsupported_contract_version",
  "message": "Payload não satisfaz o contrato talkx-send@v1.",
  "contract": "talkx-send@v1",
  "requestId": "abc-123",
  "details": [{ "path": "campaignId", "message": "campaignId deve ser UUID" }]
}
```

Nenhuma falha de validação pode usar shape avulso ou status diferente de 422
(correção 2026-08-06: `whatsapp-cloud-api` emitia 400 `{error, message}` para
campos obrigatórios por rota → agora `contract_violation` 422 canônico).

## Envelopes de domínio (exceções documentadas ao 422 canônico)

> Adicionado na A5 (2026-08-07). O type guard `isContractErrorResponse`
> (`src/shared/webhookEventSchemas.ts`) ativa o parser compartilhado do envelope
> canônico. O guard é **puro** (typeof checks, sem dependências) e valida:
> `{ error: true, code: string, message: string, details?: Array<{path,message}> }`
> — `contract`/`requestId` opcionais e não validados; `code` validado como string
> (não enum, para tolerar codes novos do backend); `details` opcional, mas se
> presente DEVE ser array. Existem envelopes de DOMÍNIO que compartilham campos
> (`error: true`, `code`, `message`, `details?`) mas NÃO são o envelope canônico:

### (a) evolution-api — envelope de domínio com `status` HTTP

```json
{
  "version": "1.0",
  "error": true,
  "status": 410,
  "code": "MEDIA_EXPIRED",
  "message": "Mídia expirada — não é possível baixar.",
  "contract": "evolution-media@v1",
  "details": [{ "path": "mediaKey", "message": "expired" }]
}
```

- Shape: `{ version, error, status, code, message, contract?, details? }` — o campo
  `status` carrega o HTTP real e `code` é o identificador **consumido pelo frontend**
  para decisão de UI (não é o enum de contrato).
- Mapeamento status × code vigente:

| status | code | significado |
|---|---|---|
| 410 | `MEDIA_EXPIRED` | mídia expirada no WhatsApp — não retentar |
| 429 | rate limit | throttling — retry com cooldown/backoff |
| 503 | `paused` | instância pausada — sinalizar ao usuário, não retentar |
| 422 | validação pura | payload malformado — corrigir antes de reenviar |

- Campos extras (`version`, `status`) são tolerados pelo guard; o que o distingue do
  envelope canônico é o `status`/origem, não o shape — o parser compartilhado serve
  para ambos quando `details` é array.

### (b) securityErrorResponse — veredito de segurança (secure-upload / file-security-scanner)

```json
{
  "error": true,
  "code": "MALWARE_DETECTED",
  "message": "Arquivo bloqueado pelo scanner.",
  "verdict": "malicious",
  "scanId": "scan_abc123",
  "details": { "verdict": "malicious", "threat": "trojan", "sha256": "..." }
}
```

- `details` é um **OBJETO de metadados do veredito** (não array de issues) e `code` é
  o veredito/bloqueio (`MALWARE_DETECTED`, `SUSPICIOUS_FILE`, …) — **NÃO converter
  para o envelope canônico** (não há `{path,message}` por issue).
- `isContractErrorResponse` retorna `false` para este shape (teste dedicado em
  `src/shared/__tests__/webhookEventSchemas.test.ts`) — diferenciar os dois é o
  objetivo do guard.
- Parsing normalizado no frontend: `parseScanInvocation` → `ScanResult`
  (`src/lib/scanResponse.ts`); consumido por `useFileUploadLogic`.

### (c) Erros NÃO de validação (404/502/503 etc.)

O envelope canônico se aplica **somente** a falhas de validação de contrato (422).
Erros de transporte/infra — 404 (rota inexistente), 502/503 (gateway/indisponível),
timeouts — NÃO usam o envelope canônico e NÃO devem ser parseados por
`isContractErrorResponse`: tratá-los como "contrato violado" esconde a causa real
(retry vs. bug). Regra: aplicar o guard de contrato somente após confirmar falha de
validação (HTTP 422 ou envelope com `details` array); o restante segue o fluxo de
erro do cliente HTTP (retry/backoff/erro de infraestrutura).

## Versionamento v1/v2 e retrocompatibilidade

- Cliente pede versão via header `x-contract-version: v2`, ou `contract_version`/`version` no body (`"2.0"` → `v2`).
- Sem versão explícita: auto-detecção da mais nova para a mais antiga entre as `supported`.
- Versão em janela de **sunset** continua aceita; a resposta ganha `x-contract-deprecated: true` + header `sunset: <ISO>`.
- Versão fora de `supported` → 422 `unsupported_contract_version` listando as aceitas.
- **Webhooks com ciclo v1/v2 ativo (5):** `evolution-webhook` (sunset v1 2027-01-01), `whatsapp-cloud-webhook`, `gmail-webhook`, `sicoob-bridge`, `sicoob-bridge-reply` (sunset v1 2027-06-01). Payloads v1 reais (sem campo `version`) seguem aceitos via fallback. (Correção de doc-drift 2026-08-22: a lista antiga citava "elevenlabs-webhook"/"whatsapp-webhook", que nunca existiram em `CONTRACTS`.)
- Contratos internos (UI/cron/IA) permanecem `v1` — versionamento é para superfícies externas com produtores independentes.

### Pós-sunset: o que acontece quando a data passa (etapa 55, Bloco 5)

Antes desta etapa, `isDeprecatedVersion` virava `false` quando `Date.now()`
ultrapassava o `sunset` — e nada mais acontecia: a versão continuava aceita
para sempre, só sem o header de aviso. Isso não era uma política, era um gap.

A política implementada:

1. **Header/body pedindo explicitamente a versão expirada** (`x-contract-version: v1`,
   ou `contract_version`/`version: "1"` no body) → `parseOrReject` responde
   **410 Gone**, código `contract_version_sunset`, apontando a versão `current`
   no `message`. Ver `isSunsetExpired()` em `contract-versions.ts` e o bloco
   "2b" de `parseOrReject` em `contract-kit.ts`.
2. **Auto-detecção (payload sem versão explícita, reconhecido só pelo formato)
   continua aceita para sempre**, mesmo após o sunset — decisão deliberada,
   não uma lacuna. É o caminho real de webhooks externos (Meta, Sicoob,
   evolution-stack): eles nunca setam `x-contract-version` nem incluem
   `version` no payload v1. Aplicar o 410 nesse caminho reproduziria em
   definitivo o incidente 2026-07-03 (rejeição indevida de payload real de
   provedor = perda de dados) — só que permanente em vez de pontual.
3. A versão expirada **permanece listada em `supported`** (documentação/
   introspecção); é o runtime que decide a cada request, com base na data
   corrente. Não é necessário nenhum deploy no dia exato do sunset para a
   transição valer — e não é necessário remover a versão do registro depois.
4. `contract-sunset-policy.test.ts` tem um teste-canário que falha se algum
   sunset **real** em `CONTRACTS` já tiver passado. Se ele falhar um dia, é
   sinal de que uma migração v1→v2 real está em curso — decida deliberadamente
   (normalmente nada precisa mudar, já que a auto-detecção segue permissiva),
   não "conserte" o teste ajustando a data.

**Runbook — adicionar sunset a um contrato novo/existente:** edite `sunset: { v1: "<ISO futura>" }`
em `CONTRACTS` (`contract-versions.ts`). Nenhuma outra mudança é necessária —
`contractHeaders()` já anota `x-contract-deprecated`/`sunset` na janela ativa,
e `isSunsetExpired()` já cobre a transição pós-data automaticamente.

## Como instrumentar um endpoint

```ts
import { parseOrReject } from "../_shared/contract-kit.ts";
import { MeuSchemaV1 } from "../_shared/contract-schemas.ts";

const raw = await req.json().catch(() => null);
const parsed = parseOrReject("meu-endpoint", { v1: MeuSchemaV1 }, req, raw, {
  requestId, extraHeaders: corsHeaders,
});
if (parsed.ok === false) return parsed.response; // 422 com envelope único
const body = parsed.data;                         // tipado e validado
// Em respostas de sucesso, mescle parsed.headers (x-contract-version / sunset).
```

**Narrowing (obrigatório):** use `parsed.ok === false` — NUNCA `!parsed.ok`.
O tsconfig.json do repo (frontend Lovable) define `strictNullChecks: false`,
herdado pelo Deno; sob essa config a negação não estreia a union
`ParseOk|ParseFail` → TS2339 latente e CI vermelho (incidente 2026-08-06:
122 ocorrências corrigidas em 117 index.ts + 9 arquivos de teste).

**Cobertura:** 120/120 edge functions instrumentadas (gate de cobertura no CI).
Endpoints sem body (GET/cron/health) usam `EmptyStrict`; proxies (`main`, `mcp`)
são allowlist documentada (não podem consumir o stream do body).

## Regras de desenho de schema

1. **Webhook externo** (provedor envia): permissivo — `.passthrough()`, `.nullish()`. Um 422 indevido em payload real = perda de dados (incidente 2026-07-03).
2. **Endpoint interno** (UI/cron): estrito — `.strict()`, enums fechados, UUID, limites.
3. Todo contrato em `CONTRACT_SCHEMAS` DEVE existir em `CONTRACTS` com schema para cada versão `supported` (teste de integridade garante).
4. V2 SEMPRE estende V1 (todos os campos V1 continuam válidos) + `version: z.literal('2.0')` + `timestamp`. Retrocompat por auto-detecção.

## Rodando

```bash
# Suíte completa (loop CI-equivalente — 70 arquivos, ~2-3 min)
find supabase/functions -name '*.test.ts' -type f | while read f; do
  NO_COLOR=1 deno test --allow-net --allow-env --allow-read "$f" || echo "FAIL $f"
done
```
