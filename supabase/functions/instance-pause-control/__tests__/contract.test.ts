/**
 * Contract tests — instance-pause-control@v1 (business).
 *
 * Garante o contrato derivado do consumo real em index.ts (rotas por
 * body.action: list | history | pause | unpause | recent_events |
 * mark_investigated | status):
 *   - action é OBRIGATÓRIA (string 1..100) — sem action → contract_violation.
 *   - limit (1..200), instance (1..100) e minutes (1..1440) são opcionais.
 *
 * Modos de falha cobertos: action ausente/vazia/tipo errado, limit e minutes
 * fora do range, body não-estruturado (invalid_json) e versão não suportada.
 * Status SEMPRE 422 com envelope único.
 *
 * Rodar: deno test supabase/functions/instance-pause-control/__tests__/contract.test.ts
 */

import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { parseOrReject, type ContractErrorBody } from "../../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../../_shared/contract-schemas.ts";

const SCHEMAS = CONTRACT_SCHEMAS["instance-pause-control"];

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://edge.local/instance-pause-control", { method: "POST", headers });
}

async function assertContractError(
  r: { ok: boolean; response?: Response; body?: ContractErrorBody },
  expectedCode: string,
): Promise<ContractErrorBody> {
  assertEquals(r.ok, false, "esperava falha de contrato");
  const res = r.response!;
  assertEquals(res.status, 422, "status deve ser SEMPRE 422");
  assertEquals(res.headers.get("Content-Type"), "application/json");
  const body = await res.json() as ContractErrorBody;
  assertEquals(body.error, true);
  assertEquals(body.code, expectedCode);
  assert(typeof body.message === "string" && body.message.length > 0, "message vazia");
  assert(typeof body.contract === "string" && body.contract.includes("@"), "contract sem label name@vX");
  assert(Array.isArray(body.details), "details deve ser array");
  for (const d of body.details) {
    assert(typeof d.path === "string" && d.path.length > 0, "detail.path inválido");
    assert(typeof d.message === "string" && d.message.length > 0, "detail.message inválido");
  }
  return body;
}

// ─── Válidos ────────────────────────────────────────────────────────────────

Deno.test("instance-pause-control@v1: action 'pause' com instance/minutes → ok", () => {
  const r = parseOrReject("instance-pause-control", SCHEMAS, req(), {
    action: "pause",
    instance: "wpp2",
    minutes: 30,
  });
  assert(r.ok, "action + opcionais válidos deve ser aceito");
  if (r.ok) assertEquals(r.version, "v1");
});

Deno.test("instance-pause-control@v1: action 'list' com limit → ok", () => {
  const r = parseOrReject("instance-pause-control", SCHEMAS, req(), {
    action: "list",
    limit: 10,
  });
  assert(r.ok, "action list + limit deve ser aceito");
});

Deno.test("instance-pause-control@v1: action 'status' sem opcionais → ok", () => {
  const r = parseOrReject("instance-pause-control", SCHEMAS, req(), { action: "status" });
  assert(r.ok, "apenas action deve ser aceito");
});

// ─── Inválidos ──────────────────────────────────────────────────────────────

Deno.test("instance-pause-control@v1: sem action → contract_violation (path action)", async () => {
  const body = await assertContractError(
    parseOrReject("instance-pause-control", SCHEMAS, req(), {}),
    "contract_violation",
  );
  assert(body.details.some((d) => d.path === "action"), "detail deve apontar para action");
});

Deno.test("instance-pause-control@v1: action vazia → contract_violation", async () => {
  await assertContractError(
    parseOrReject("instance-pause-control", SCHEMAS, req(), { action: "" }),
    "contract_violation",
  );
});

Deno.test("instance-pause-control@v1: action com tipo errado → contract_violation", async () => {
  await assertContractError(
    parseOrReject("instance-pause-control", SCHEMAS, req(), { action: 42 }),
    "contract_violation",
  );
});

Deno.test("instance-pause-control@v1: minutes fora do range (0) → contract_violation", async () => {
  await assertContractError(
    parseOrReject("instance-pause-control", SCHEMAS, req(), { action: "pause", minutes: 0 }),
    "contract_violation",
  );
});

Deno.test("instance-pause-control@v1: minutes acima de 1440 → contract_violation", async () => {
  await assertContractError(
    parseOrReject("instance-pause-control", SCHEMAS, req(), { action: "pause", minutes: 1441 }),
    "contract_violation",
  );
});

Deno.test("instance-pause-control@v1: limit acima de 200 → contract_violation", async () => {
  await assertContractError(
    parseOrReject("instance-pause-control", SCHEMAS, req(), { action: "list", limit: 201 }),
    "contract_violation",
  );
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

Deno.test("instance-pause-control@v1: body null → invalid_json", async () => {
  await assertContractError(
    parseOrReject("instance-pause-control", SCHEMAS, req(), null),
    "invalid_json",
  );
});

Deno.test("instance-pause-control@v1: versão não suportada → unsupported_contract_version", async () => {
  await assertContractError(
    parseOrReject("instance-pause-control", SCHEMAS, req({ "x-contract-version": "v3" }), {
      action: "pause",
    }),
    "unsupported_contract_version",
  );
});
