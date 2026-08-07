# Testes de Contrato — Webhooks & Edge Functions

> Introduzido em 2026-07-10 (branch `feat/contract-kit-zod-v1v2`). Runner: `deno test`.
> Cobertura 100% consolidada em 2026-08-04 (`parseOrReject` em todas as edge functions que leem body).

## Arquitetura

| Arquivo | Papel |
|---|---|
| `_shared/contract-kit.ts` | Motor `parseOrReject`: valida body contra schema Zod, negocia versão (v1/v2) e emite o envelope 422 único. |
| `_shared/contract-schemas.ts` | Registro central `CONTRACT_SCHEMAS` (contrato → versão → schema Zod). Schemas derivados do consumo REAL de campos de cada `index.ts`. |
| `_shared/contract-versions.ts` | Registro `CONTRACTS` de versões `current`/`supported`/`sunset` por contrato. |
| `_shared/edge-contract-schemas.ts` | Registry legado (`parseContractRequest`, `@deprecated` — 0 chamadores) + `ContractLifecycles` espelhando o canônico para os webhooks v2. |
| `_shared/webhook-schemas.ts` | Schemas dos webhooks externos (Evolution, Meta/WhatsApp Cloud, Gmail, ElevenLabs, WhatsApp legado) — V1 e V2. |
| `_shared/__tests__/contract-kit.test.ts` | Envelope 422 consistente, negociação de versão, deprecação, payloads adversariais. |
| `_shared/__tests__/contract-schemas.test.ts` | Matriz por endpoint: válido / campo ausente / tipo errado / valor vazio. |
| `_shared/__tests__/contract-coverage.test.ts` | **Gate de cobertura 100%**: toda função que lê body DEVE invocar o gate (allowlist: `main`, `mcp` — proxies que não podem consumir stream). |
| `_shared/__tests__/contract-versioning.test.ts` | Compatibilidade retroativa v1/v2: auto-detecção, header `x-contract-version`, 422 para versão não suportada, headers de sunset. |
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
- **Webhooks com ciclo v1/v2 ativo (7):** `evolution-webhook` (sunset v1 2027-01-01), `whatsapp-cloud-webhook`, `gmail-webhook`, `elevenlabs-webhook`, `whatsapp-webhook`, `sicoob-bridge`, `sicoob-bridge-reply` (sunset v1 2027-06-01). Payloads v1 reais (sem campo `version`) seguem aceitos via fallback.
- Contratos internos (UI/cron/IA) permanecem `v1` — versionamento é para superfícies externas com produtores independentes.

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
