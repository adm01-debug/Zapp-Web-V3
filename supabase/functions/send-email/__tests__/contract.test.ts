/**
 * Contract tests — send-email@v1 (business).
 *
 * Garante o contrato derivado do consumo real em index.ts:
 *   a) { accountId, ... } → delega para gmail-send;
 *   b) { to, subject, html } → fallback Resend (to: e-mail ou lista ≤50).
 *
 * Modos de falha cobertos:
 *   - Nem accountId nem to/subject/html → contract_violation (paths to/subject/html).
 *   - E-mail malformado → contract_violation (path to).
 *   - subject/html vazios → contract_violation.
 *   - Body não-estruturado → invalid_json; versão não suportada →
 *     unsupported_contract_version. Status SEMPRE 422 com envelope único.
 *
 * Rodar: deno test supabase/functions/send-email/__tests__/contract.test.ts
 */

import { assertEquals, assert } from "jsr:@std/assert";
import { parseOrReject, type ContractErrorBody } from "../../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../../_shared/contract-schemas.ts";

const SCHEMAS = CONTRACT_SCHEMAS["send-email"];

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://edge.local/send-email", { method: "POST", headers });
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

Deno.test("send-email@v1: accountId válido → ok (delegação gmail-send)", () => {
  const r = parseOrReject<{ accountId?: string }>("send-email", SCHEMAS, req(), { accountId: "acc_1" });
  assert(r.ok, "accountId sozinho deve ser aceito");
  if (r.ok) {
    assertEquals(r.version, "v1");
    assertEquals(r.data.accountId, "acc_1");
  }
});

Deno.test("send-email@v1: fallback Resend válido (to/subject/html)", () => {
  const r = parseOrReject("send-email", SCHEMAS, req(), {
    to: "ana@example.com",
    subject: "Olá",
    html: "<p>corpo</p>",
  });
  assert(r.ok, "payload Resend completo deve ser aceito");
  if (r.ok) assertEquals(r.version, "v1");
});

Deno.test("send-email@v1: to como lista de e-mails (≤50) é aceito", () => {
  const r = parseOrReject("send-email", SCHEMAS, req(), {
    to: ["ana@example.com", "bob@example.com"],
    subject: "Lista",
    html: "<p>x</p>",
  });
  assert(r.ok, "lista de destinatários deve ser aceita");
});

Deno.test("send-email@v1: accountId + corpo completo → ok", () => {
  const r = parseOrReject("send-email", SCHEMAS, req(), {
    accountId: "acc_1",
    to: "ana@example.com",
    subject: "S",
    html: "<p>x</p>",
  });
  assert(r.ok, "accountId combinado com campos de envio deve ser aceito");
});

// ─── Inválidos ──────────────────────────────────────────────────────────────

Deno.test("send-email@v1: nem accountId nem to → contract_violation (to/subject/html)", async () => {
  const body = await assertContractError(
    parseOrReject("send-email", SCHEMAS, req(), {}),
    "contract_violation",
  );
  const paths = body.details.map((d) => d.path).sort();
  assertEquals(paths, ["html", "subject", "to"], "sem accountId, to/subject/html são obrigatórios");
});

Deno.test("send-email@v1: e-mail inválido → contract_violation (path to)", async () => {
  const body = await assertContractError(
    parseOrReject("send-email", SCHEMAS, req(), {
      to: "não-é-email",
      subject: "S",
      html: "<p>x</p>",
    }),
    "contract_violation",
  );
  assert(body.details.some((d) => d.path === "to"), "detail deve apontar para o campo to");
});

Deno.test("send-email@v1: subject vazio → contract_violation (path subject)", async () => {
  const body = await assertContractError(
    parseOrReject("send-email", SCHEMAS, req(), {
      to: "ana@example.com",
      subject: "",
      html: "<p>x</p>",
    }),
    "contract_violation",
  );
  assert(body.details.some((d) => d.path === "subject"), "detail deve apontar para subject");
});

Deno.test("send-email@v1: html vazio → contract_violation (path html)", async () => {
  const body = await assertContractError(
    parseOrReject("send-email", SCHEMAS, req(), {
      to: "ana@example.com",
      subject: "S",
      html: "",
    }),
    "contract_violation",
  );
  assert(body.details.some((d) => d.path === "html"), "detail deve apontar para html");
});

Deno.test("send-email@v1: accountId vazio → contract_violation", async () => {
  await assertContractError(
    parseOrReject("send-email", SCHEMAS, req(), { accountId: "" }),
    "contract_violation",
  );
});

Deno.test("send-email@v1: e-mail inválido dentro de lista → contract_violation", async () => {
  await assertContractError(
    parseOrReject("send-email", SCHEMAS, req(), {
      to: ["ana@example.com", "inválido"],
      subject: "S",
      html: "<p>x</p>",
    }),
    "contract_violation",
  );
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

Deno.test("send-email@v1: body null → invalid_json (não contract_violation)", async () => {
  await assertContractError(parseOrReject("send-email", SCHEMAS, req(), null), "invalid_json");
});

Deno.test("send-email@v1: body primitivo → invalid_json", async () => {
  await assertContractError(parseOrReject("send-email", SCHEMAS, req(), "texto"), "invalid_json");
});

Deno.test("send-email@v1: versão não suportada via header → unsupported_contract_version", async () => {
  const body = await assertContractError(
    parseOrReject("send-email", SCHEMAS, req({ "x-contract-version": "v9" }), { accountId: "a" }),
    "unsupported_contract_version",
  );
  assert(body.contract.includes("v9"), "label deve refletir a versão pedida");
});

Deno.test("send-email@v1: requestId é propagado no envelope quando fornecido", async () => {
  const r = parseOrReject("send-email", SCHEMAS, req(), null, { requestId: "req-123" });
  assert(r.ok === false);
  const body = await r.response!.json() as ContractErrorBody;
  assertEquals(body.requestId, "req-123");
});
