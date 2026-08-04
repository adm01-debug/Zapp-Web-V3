/**
 * Unified 422 Error Format — contrato de erro ÚNICO de todas as Edge
 * Functions que usam parseOrReject().
 *
 * Todo endpoint que falha validação de contrato responde EXATAMENTE o mesmo
 * envelope (independente da função):
 *
 *   {
 *     "error": true,
 *     "code": "contract_violation" | "invalid_json" | "unsupported_contract_version",
 *     "message": "...",
 *     "contract": "<nome-do-contrato>@<versão>",
 *     "requestId": "...",          // somente quando fornecido
 *     "details": [{ "path": "...", "message": "..." }]
 *   }
 *
 * Garantias testadas aqui (valem para TODAS as funções em CONTRACT_SCHEMAS):
 *   - Status é SEMPRE 422.
 *   - Content-Type é SEMPRE application/json.
 *   - Os três códigos canônicos mapeiam para o mesmo envelope.
 *   - details[] é array de { path, message } — path nunca vazio.
 *   - contract segue o formato "<nome>@v<número>".
 *   - requestId é propagado (e omitido quando ausente).
 *
 * Rodar: deno test supabase/functions/_shared/__tests__/unified-error-format.test.ts
 */

import { assertEquals, assert, assertMatch } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  parseOrReject,
  type ContractErrorBody,
  type ContractErrorCode,
} from "../contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../contract-schemas.ts";
import { contractLabel } from "../contract-versions.ts";

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://edge.local/fn", { method: "POST", headers });
}

/** Valida o envelope unificado completo e retorna o body parseado. */
async function assertUnifiedEnvelope(
  r: { ok: boolean; response?: Response; body?: ContractErrorBody },
  expectedCode: ContractErrorCode,
  opts: { requestId?: string } = {},
): Promise<ContractErrorBody> {
  // 1) Resultado é falha
  assertEquals(r.ok, false, "esperava falha de contrato");
  // 2) Status SEMPRE 422
  assertEquals(r.response!.status, 422, "status deve ser SEMPRE 422");
  // 3) Content-Type SEMPRE application/json
  assertEquals(r.response!.headers.get("Content-Type"), "application/json");
  // 4) Body JSON tem o envelope canônico
  const body = await r.response!.json() as ContractErrorBody;
  assertEquals(body.error, true);
  assertEquals(body.code, expectedCode);
  assert(typeof body.message === "string" && body.message.length > 0, "message não pode ser vazia");
  // 5) contract no formato "<nome>@v<número>"
  assertMatch(body.contract, /^[a-z0-9-]+@v\d+$/, `contract label inválida: ${body.contract}`);
  // 6) requestId: presente quando fornecido, ausente quando não
  if (opts.requestId) {
    assertEquals(body.requestId, opts.requestId);
  } else {
    assertEquals(body.requestId, undefined, "requestId deve ser omitido quando não fornecido");
  }
  // 7) details[] é array com path + message válidos
  assert(Array.isArray(body.details), "details deve ser array");
  for (const d of body.details) {
    assert(typeof d.path === "string" && d.path.length > 0, `detail.path inválido: ${d.path}`);
    assert(typeof d.message === "string" && d.message.length > 0, `detail.message inválido: ${d.message}`);
  }
  return body;
}

// ─── contract_violation ─────────────────────────────────────────────────────

Deno.test("unified-422: contract_violation envelope (send-email sem campos obrigatórios)", async () => {
  const r = parseOrReject(
    "send-email",
    CONTRACT_SCHEMAS["send-email"],
    null,
    { invalid: true },
  );
  const body = await assertUnifiedEnvelope(r, "contract_violation");
  assertEquals(body.contract, "send-email@v1");
  assert(body.details.length > 0, "contract_violation deve ter details");
});

Deno.test("unified-422: contract_violation aponta os paths exatos", async () => {
  const r = parseOrReject(
    "contacts-import",
    CONTRACT_SCHEMAS["contacts-import"],
    req(),
    { rows: [] },
  );
  const body = await assertUnifiedEnvelope(r, "contract_violation");
  assertEquals(body.contract, "contacts-import@v1");
  assert(body.details.some((d) => d.path === "rows"), "detail deve apontar para rows");
});

// ─── invalid_json ───────────────────────────────────────────────────────────

Deno.test("unified-422: body null → invalid_json (nunca contract_violation)", async () => {
  const r = parseOrReject("send-email", CONTRACT_SCHEMAS["send-email"], req(), null);
  const body = await assertUnifiedEnvelope(r, "invalid_json");
  assert(body.details.length > 0, "invalid_json deve ter detail de root");
});

Deno.test("unified-422: TODAS as funções com body não-estruturado → invalid_json + 422", async () => {
  // Uniformidade global: para CADA contrato registrado, body null produz o
  // mesmo código, o mesmo status e o mesmo Content-Type.
  const names = Object.keys(CONTRACT_SCHEMAS).sort();
  assert(names.length >= 20, `esperava registro amplo de contratos, tem ${names.length}`);
  for (const name of names) {
    const r = parseOrReject(name, CONTRACT_SCHEMAS[name], req(), null);
    const body = await assertUnifiedEnvelope(r, "invalid_json");
    const expected = contractLabel(name); // respeita current (v1 OU v2)
    assertEquals(body.contract, expected, `label de ${name} deve ser ${expected}`);
  }
});

// ─── unsupported_contract_version ───────────────────────────────────────────

Deno.test("unified-422: versão não suportada → unsupported_contract_version", async () => {
  const r = parseOrReject(
    "evolution-sender",
    CONTRACT_SCHEMAS["evolution-sender"],
    req({ "x-contract-version": "v9" }),
    {},
  );
  const body = await assertUnifiedEnvelope(r, "unsupported_contract_version");
  assertEquals(body.contract, "evolution-sender@v9", "label deve refletir a versão pedida");
  assert(
    body.message.includes("v9") && body.message.includes("v1"),
    "message deve listar as versões suportadas",
  );
});

Deno.test("unified-422: versão não suportada via body.contract_version", async () => {
  const r = parseOrReject(
    "instance-pause-control",
    CONTRACT_SCHEMAS["instance-pause-control"],
    req(),
    { action: "pause", contract_version: "v2" },
  );
  await assertUnifiedEnvelope(r, "unsupported_contract_version");
});

// ─── requestId ──────────────────────────────────────────────────────────────

Deno.test("unified-422: requestId propagado em todos os modos de falha", async () => {
  const cases: Array<{ name: string; body: unknown; req: Request | null; code: ContractErrorCode }> = [
    { name: "send-email", body: null, req: req(), code: "invalid_json" },
    { name: "send-email", body: {}, req: req(), code: "contract_violation" },
    {
      name: "contacts-import",
      body: { rows: [{}] },
      req: req({ "x-contract-version": "v7" }),
      code: "unsupported_contract_version",
    },
  ];
  for (const c of cases) {
    const r = parseOrReject(c.name, CONTRACT_SCHEMAS[c.name], c.req, c.body, {
      requestId: "req-unified-1",
    });
    await assertUnifiedEnvelope(r, c.code, { requestId: "req-unified-1" });
  }
});

// ─── Caminho feliz (edge) ───────────────────────────────────────────────────

Deno.test("unified-422: payload válido NÃO gera envelope de erro", () => {
  const r = parseOrReject(
    "send-email",
    CONTRACT_SCHEMAS["send-email"],
    req(),
    { accountId: "acc_1" },
  );
  assert(r.ok, "payload válido deve passar");
  if (r.ok) {
    assertEquals(r.version, "v1");
    assertEquals(r.headers["x-contract-version"], "v1");
  }
});

Deno.test("unified-422: contrato sem registro em CONTRACTS usa fallback de versão", async () => {
  // parseOrReject não pode lançar para contrato desconhecido — falha com
  // envelope mesmo assim (label com a versão pedida/current).
  const r = parseOrReject("contrato-inexistente", { v1: CONTRACT_SCHEMAS["health"]!["v1"] }, req(), null);
  await assertUnifiedEnvelope(r, "invalid_json");
});
