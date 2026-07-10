# Testes de Contrato — Webhooks & Edge Functions

> Introduzido em 2026-07-10 (branch `feat/contract-kit-zod-v1v2`). Runner: `deno test`.

## Arquitetura

| Arquivo | Papel |
|---|---|
| `_shared/contract-kit.ts` | Motor `parseOrReject`: valida body contra schema Zod, negocia versão (v1/v2) e emite o envelope 422 único. |
| `_shared/contract-schemas.ts` | Registro central `CONTRACT_SCHEMAS` (contrato → versão → schema Zod). Schemas derivados do consumo REAL de campos de cada `index.ts`. |
| `_shared/contract-versions.ts` | Registro `CONTRACTS` de versões `current`/`supported`/`sunset` por contrato. |
| `_shared/__tests__/contract-kit.test.ts` | Envelope 422 consistente, negociação de versão, deprecação, payloads adversariais. |
| `_shared/__tests__/contract-schemas.test.ts` | Matriz por endpoint: válido / campo ausente / tipo errado / valor vazio. |

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

## Versionamento v1/v2 e retrocompatibilidade

- Cliente pede versão via header `x-contract-version: v2`, ou `contract_version`/`version` no body (`"2.0"` → `v2`).
- Sem versão explícita: auto-detecção da mais nova para a mais antiga entre as `supported`.
- Versão em janela de **sunset** continua aceita; a resposta ganha `x-contract-deprecated: true` + header `sunset: <ISO>`.
- Versão fora de `supported` → 422 `unsupported_contract_version` listando as aceitas.
- Ciclo ativo: `evolution-webhook` — `current: v2`, `supported: [v1, v2]`, `sunset.v1: 2027-01-01`. Payloads v1 reais da Evolution (sem campo `version`) seguem aceitos via fallback.

## Como instrumentar um endpoint

```ts
import { parseOrReject } from "../_shared/contract-kit.ts";
import { MeuSchemaV1 } from "../_shared/contract-schemas.ts";

const raw = await req.json().catch(() => null);
const parsed = parseOrReject("meu-endpoint", { v1: MeuSchemaV1 }, req, raw, {
  requestId, extraHeaders: corsHeaders,
});
if (!parsed.ok) return parsed.response;   // 422 com envelope único
const body = parsed.data;                  // tipado e validado
// Em respostas de sucesso, mescle parsed.headers (x-contract-version / sunset).
```

Endpoints já instrumentados: `evolution-webhook` (schema no fluxo HMAC), `whatsapp-cloud-webhook`, `sicoob-bridge`, `elevenlabs-webhook`, `talkx-send`, `send-email`.

## Regras de desenho de schema

1. **Webhook externo** (provedor envia): permissivo — `.passthrough()`, `.nullish()`. Um 422 indevido em payload real = perda de dados (incidente 2026-07-03).
2. **Endpoint interno** (UI/cron): estrito — `.strict()`, enums fechados, UUID, limites.
3. Todo contrato em `CONTRACT_SCHEMAS` DEVE existir em `CONTRACTS` com schema para cada versão `supported` (teste de integridade garante).

## Rodando

```bash
deno test --allow-env --allow-net --allow-read supabase/functions/_shared/__tests__/
deno test --allow-env --allow-net --allow-read supabase/functions/**/__tests__/
```
