# Edge Function Contract Validation — Guia de Referência

> **Atualizado em:** 2026-08-22 (doc-sync — Bloco 10, etapa 99, PLANO-100-CONTRATOS-EDGE)
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
if (parsed.ok === false) return parsed.response; // NUNCA `if (!parsed.ok)` — ver nota abaixo
const body = parsed.data as Record<string, any>; // NUNCA `unknown` (TS2322)
```

**Narrowing (obrigatório):** o exemplo acima usava `if (!parsed.ok)` até 2026-08-22 —
**errado**. O `tsconfig.json` do repo define `strictNullChecks: false`, herdado pelo
Deno para `supabase/functions`; sob essa config a negação `!parsed.ok` NÃO estreita a
union discriminada `ParseOk | ParseFail`, e `parsed.response`/`parsed.body` viram
`TS2339` (incidente 2026-08-06: 122 ocorrências corrigidas em 117 `index.ts` + 9
arquivos de teste). Use sempre `=== false` / `=== true`, que funciona sob qualquer
config.

Regras:
- Gate **depois** de auth/rate-limit, **antes** de qualquer uso do body.
- **Nunca** ler o body duas vezes (se já leu, passe o valor lido).
- JSON malformado → `invalid_json` 422 (o `.catch(() => null)` é obrigatório).
- Webhooks EXTERNOS (provedor envia): schema **permissivo** `.passthrough()` —
  um 422 indevido em payload real do provedor causa perda de dados
  (incidente 2026-07-03, evolution-webhook).
- Endpoints INTERNOS (UI/cron): schema **estrito** `.strict()` — falhar cedo.
- Exceção: `whatsapp-cloud-webhook` responde 200 mesmo pra payload
  inválido/vazio da Meta (padrão do provedor — 422 causaria retry-storm de
  redelivery). Gate usado só pra telemetria/versionamento, nunca pra rejeitar.
  (Nome corrigido em 2026-08-22 — a doc citava `whatsapp-webhook`, que não
  existe mais como diretório neste repo.)

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
| `contract-versioning.test.ts` | Retrocompat v1/v2 dos 5 webhooks com sunset (ver "Estado" abaixo) + versão não suportada (v9) |

## Regra anti-placeholder

`z.object({}).passthrough()` é PROIBIDO como schema de função (falsa cobertura —
aceita qualquer payload) e a Invariante 9 quebra o CI se um surgir. Exceções
legítimas (GET sem body, status/health) devem usar `EmptyStrictV1Schema`
(aceita só `{}`). 7 contratos estão na allowlist explícita
(`PLACEHOLDER_ALLOWLIST` em contract-registry-integrity.test.ts, conferido em
2026-08-22 — a lista anterior citava "gmail-health", que **não existe como
diretório neste repo**): `email-track-link`, `email-track-pixel`,
`webhook-secret-status`, `whatsapp-cloud-secrets-status`,
`whatsapp-cloud-webhook-verify`, `auth-email-hook` (hook interno do Supabase Auth,
sem diretório de função própria), `warroom-monthly-test` (entrada temporária até o
workstream fechar o schema real).

## Estado (2026-08-22, doc-sync — conferido ao vivo)

- **124 contratos** em `CONTRACT_SCHEMAS` e `CONTRACTS` (contagem idêntica dos dois
  lados — sem drift, verificado via `Object.keys(...).length` nos dois registros).
- **2 exceções documentadas de cobertura**: `main`/`mcp` (proxies que não podem
  consumir o stream do body — ver `contract-coverage.test.ts`).
- **5 webhooks com V2 + sunset** (corrigido — a versão anterior desta doc citava "4:
  evolution, whatsapp-cloud, gmail, elevenlabs"; `elevenlabs-*` NUNCA teve
  versionamento v1/v2, e faltavam os 2 contratos Sicoob): `evolution-webhook` (sunset
  v1 2027-01-01), `whatsapp-cloud-webhook`, `gmail-webhook`, `sicoob-bridge`,
  `sicoob-bridge-reply` (sunset v1 2027-06-01 nos últimos 4).
- Contagem exata de testes de contrato varia conforme os arquivos evoluem — rode
  `deno test supabase/functions/_shared/__tests__/` para o número corrente em vez de
  confiar num total hardcoded nesta doc (ela sempre ficará desatualizada; o valor de
  2026-08-04 aqui — "1800+, 1829" — já estava obsoleto há semanas quando esta seção
  foi revisada).
