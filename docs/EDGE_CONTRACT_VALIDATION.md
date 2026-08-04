# Edge Function Contract Validation — Guia de Referência

> **Atualizado em:** 2026-08-04 (consolidação cobertura 100%)
> **Arquivos-chave:** `supabase/functions/_shared/contract-kit.ts`, `contract-schemas.ts`, `contract-versions.ts`

## O que é

Toda Edge Function que recebe body (JSON, multipart ou text) DEVE validar o
payload contra um schema Zod registrado em `CONTRACT_SCHEMAS` usando o gate
`parseOrReject`/`parseRequestOrReject` (contract-kit.ts). Isso garante:

1. **Envelope de erro 422 ÚNICO** em todo o stack (nunca 400, nunca 500 para
   payload inválido).
2. **Versionamento de contrato v1/v2** com sunset negociado por header.
3. **Cobertura verificável** — o teste `contract-coverage.test.ts` quebra o CI
   se uma função nascer lendo body sem gate.

## Envelope 422 (obrigatório em TODAS as funções)

```json
{
  "error": true,
  "code": "invalid_json" | "contract_violation" | "unsupported_contract_version",
  "message": "mensagem legível",
  "contract": "<nome-do-contrato>@<versão>",
  "requestId": "opcional",
  "details": [{ "path": "campo.afetado", "message": "motivo" }]
}
```

## Integração (snippet canônico)

```ts
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";

// Body OBRIGATÓRIO:
const raw = await req.json().catch(() => null);
// Body OPCIONAL (cron/GET):
// const raw = await req.json().catch(() => ({}));

const parsed = parseOrReject('nome-da-funcao', CONTRACT_SCHEMAS['nome-da-funcao'], req, raw, {
  extraHeaders: getCorsHeaders(req),
});
if (!parsed.ok) return parsed.response;
const body = parsed.data as Record<string, any>; // NUNCA `unknown` (TS2322)
```

Regras:
- Gate **depois** de auth/rate-limit, **antes** de qualquer uso do body.
- **Nunca** ler o body duas vezes (se já leu, passe o valor lido).
- JSON malformado → `invalid_json` 422 (o `.catch(() => null)` é obrigatório).
- Webhooks EXTERNOS (provedor envia): schema **permissivo** `.passthrough()` —
  um 422 indevido em payload real do provedor causa perda de dados
  (incidente 2026-07-03, evolution-webhook).
- Endpoints INTERNOS (UI/cron): schema **estrito** `.strict()` — falhar cedo.
- Exceção: `whatsapp-webhook` responde 200+warning para payload inválido
  (padrão Meta — 422 faria re-entrega infinita). Gate usado só para telemetria.

## Registro (obrigatório duplo)

Todo contrato precisa de entrada em **AMBOS**:

| Arquivo | Registro | Papel |
|---|---|---|
| `contract-schemas.ts` | `CONTRACT_SCHEMAS` | Schemas por função/versão (o que o gate lê em runtime) |
| `contract-versions.ts` | `CONTRACTS` | Versões suportadas, current, sunset |

## Versionamento v1/v2

- **Quando criar V2:** somente quando o **provedor externo** muda o envelope
  (ex: Evolution API passou a exigir `version: "2.0"`). NUNCA criar V2
  sintético — a Invariante 6 do `contract-registry-integrity.test.ts` rejeita
  `v1 === v2` (versionamento fantasma).
- **Negociação:** header `x-contract-version`, campo `contract_version`/`version`
  no body, ou auto-detecção (tenta da mais nova para a mais antiga).
- **Sunset:** versões legacy continuam aceitas até a data, mas a resposta ganha
  `x-contract-deprecated: true` + header `sunset`.

## Guard-rails (CI)

| Teste | Garante |
|---|---|
| `contract-registry-integrity.test.ts` | Invariantes 1-9: registro consistente, sem drift, sem refs a chaves ausentes, anti-placeholder |
| `contract-coverage.test.ts` | Toda função que lê body tem gate (ou allowlist justificada) |
| `contract-cross-endpoint.test.ts` | Envelope idêntico em TODOS os contratos |
| `contract-matrix.test.ts` | T3/T4/T8/T15 (body ausente, não-JSON, versão inválida, CORS) |
| `unified-error-format.test.ts` | Envelope 422 único em todas as funções |
| `contract-gate-undefined-schema.test.ts` | Gate NUNCA lança com schema ausente (regressão P0) |
| `contract-schemas-ai/integrations/infra.test.ts` | Casos válidos/inválidos (≥3-5 por schema) dos 45 schemas novos |
| `contract-versioning.test.ts` | Retrocompat v1/v2 dos 4 webhooks + sunset + v9 |

## Regra anti-placeholder

`z.object({}).passthrough()` é PROIBIDO como schema de função (falsa cobertura —
aceita qualquer payload) e a Invariante 9 quebra o CI se um surgir. Exceções
legítimas (GET sem body, status/health) devem usar `EmptyStrictV1Schema`
(aceita só `{}`). 6 contratos GET legítimos estão na allowlist explícita
(`PLACEHOLDER_ALLOWLIST` em contract-registry-integrity.test.ts): email-track-link,
email-track-pixel, webhook-secret-status, whatsapp-cloud-secrets-status,
whatsapp-cloud-webhook-verify, gmail-health.

## Estado (2026-08-04)

- 118 edge functions, **116 com gate efetivo** + 2 exceções documentadas (main/mcp — proxies que não podem consumir o stream) + voice-agent = **118/118**
- 118 contratos em `CONTRACT_SCHEMAS` + `CONTRACTS`
- 4 webhooks com V2 + sunset: evolution, whatsapp-cloud, gmail, elevenlabs
- 1800+ testes de contrato verdes (1829 em 2026-08-04)
