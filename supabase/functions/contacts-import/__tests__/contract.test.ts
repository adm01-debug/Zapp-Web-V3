/**
 * Contract tests — contacts-import@v1 (business).
 *
 * Garante o contrato derivado do consumo real em index.ts:
 *   - rows[] é OBRIGATÓRIO e não pode ser vazio (min: 1, max: 10_000).
 *   - workspace_id é opcional — o handler usa o default 'wpp2'.
 *
 * Modos de falha cobertos: rows ausente/vazio/tipo errado/acima do limite,
 * body não-estruturado (invalid_json) e versão não suportada. Status SEMPRE
 * 422 com envelope único.
 *
 * Rodar: deno test supabase/functions/contacts-import/__tests__/contract.test.ts
 */

import { assertEquals, assert, assertMatch } from "jsr:@std/assert";
import { parseOrReject, type ContractErrorBody } from "../../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../../_shared/contract-schemas.ts";

const SCHEMAS = CONTRACT_SCHEMAS["contacts-import"];

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://edge.local/contacts-import", { method: "POST", headers });
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

Deno.test("contacts-import@v1: rows[] com contatos → ok", () => {
  const r = parseOrReject("contacts-import", SCHEMAS, req(), {
    rows: [{ name: "Ana", phone: "5511999999999" }],
  });
  assert(r.ok, "rows com um contato deve ser aceito");
  if (r.ok) assertEquals(r.version, "v1");
});

Deno.test("contacts-import@v1: rows múltiplos + workspace_id explícito → ok", () => {
  const r = parseOrReject<{ workspace_id?: string }>("contacts-import", SCHEMAS, req(), {
    rows: [
      { name: "Ana", phone: "5511999999999" },
      { name: "Bob", phone: "5511888888888" },
      { name: "Cid", phone: "5511777777777" },
    ],
    workspace_id: "wpp2",
  });
  assert(r.ok, "várias linhas com workspace_id deve ser aceito");
  if (r.ok) assertEquals(r.data.workspace_id, "wpp2");
});

Deno.test("contacts-import@v1: sem workspace_id → ok (default 'wpp2' no handler)", () => {
  const r = parseOrReject("contacts-import", SCHEMAS, req(), { rows: [{}] });
  assert(r.ok, "workspace_id opcional — omissão deve ser aceita");
});

// ─── Inválidos ──────────────────────────────────────────────────────────────

Deno.test("contacts-import@v1: rows vazio [] → contract_violation (min: 1)", async () => {
  const body = await assertContractError(
    parseOrReject("contacts-import", SCHEMAS, req(), { rows: [] }),
    "contract_violation",
  );
  assert(body.details.some((d) => d.path === "rows"), "detail deve apontar para rows");
});

Deno.test("contacts-import@v1: sem rows → contract_violation (path rows)", async () => {
  const body = await assertContractError(
    parseOrReject("contacts-import", SCHEMAS, req(), {}),
    "contract_violation",
  );
  assert(body.details.some((d) => d.path === "rows"), "detail deve apontar para rows");
});

Deno.test("contacts-import@v1: rows com tipo errado (string) → contract_violation", async () => {
  await assertContractError(
    parseOrReject("contacts-import", SCHEMAS, req(), { rows: "não-é-array" }),
    "contract_violation",
  );
});

Deno.test("contacts-import@v1: rows acima de 10_000 → contract_violation (max)", async () => {
  const rows = Array.from({ length: 10_001 }, () => ({}));
  await assertContractError(
    parseOrReject("contacts-import", SCHEMAS, req(), { rows }),
    "contract_violation",
  );
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

Deno.test("contacts-import@v1: body null → invalid_json", async () => {
  await assertContractError(
    parseOrReject("contacts-import", SCHEMAS, req(), null),
    "invalid_json",
  );
});

Deno.test("contacts-import@v1: versão não suportada → unsupported_contract_version", async () => {
  await assertContractError(
    parseOrReject("contacts-import", SCHEMAS, req({ "x-contract-version": "v2" }), {
      rows: [{ name: "Ana" }],
    }),
    "unsupported_contract_version",
  );
});

Deno.test("contacts-import@v1: default workspace_id 'wpp2' existe no handler", async () => {
  // O default não é do schema — é do handler. Travamos o contrato completo:
  // schema aceita omissão E o index.ts aplica o default documentado.
  const SOURCE = await Deno.readTextFile(new URL("../index.ts", import.meta.url));
  assertMatch(SOURCE, /workspace_id\s*\?\?\s*'wpp2'/);
});
