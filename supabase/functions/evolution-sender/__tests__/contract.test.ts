/**
 * Contract tests — evolution-sender@v1 (infra / cron).
 *
 * evolution-sender é um WORKER DE FILA (cron service-role): lê a tabela
 * `evolution_message_queue` e envia via Evolution API. NÃO é uma API de
 * envio HTTP — o contrato registrado (EvolutionSenderV1Schema) é estrito e
 * sem body: apenas `{}` (ou JSON inválido tratado como `{}` no handler) é
 * aceito.
 *
 * Os testes abaixo travam essa realidade: um payload de "envio"
 * ({ instanceName, to, text }) — como o contrato antigo SendMessageSchema —
 * DEVE ser rejeitado com contract_violation (strict). Isso impede que
 * alguém transforme o worker em endpoint de envio sem atualizar o contrato.
 *
 * Rodar: deno test supabase/functions/evolution-sender/__tests__/contract.test.ts
 */

import { assertEquals, assert, assertMatch } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { parseOrReject, type ContractErrorBody } from "../../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../../_shared/contract-schemas.ts";

const SCHEMAS = CONTRACT_SCHEMAS["evolution-sender"];

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://edge.local/evolution-sender", { method: "POST", headers });
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

Deno.test("evolution-sender@v1: body vazio {} → ok (cron sem body)", () => {
  const r = parseOrReject("evolution-sender", SCHEMAS, req(), {});
  assert(r.ok, "cron dispara sem body — {} deve ser aceito");
  if (r.ok) assertEquals(r.version, "v1");
});

Deno.test("evolution-sender@v1: {} com requestId → ok e versão v1", () => {
  const r = parseOrReject("evolution-sender", SCHEMAS, req(), {}, { requestId: "cron-1" });
  assert(r.ok, "{} deve ser aceito mesmo com requestId");
  if (r.ok) {
    assertEquals(r.version, "v1");
    assertEquals(r.deprecated, false);
  }
});

// ─── Inválidos ──────────────────────────────────────────────────────────────

Deno.test("evolution-sender@v1: payload de envio { instanceName, to, text } → contract_violation (strict)", async () => {
  // Regressão guard: evolution-sender NÃO é API de envio. O contrato antigo
  // SendMessageSchema ({ instanceName, to, text, mediaUrl }) não se aplica ao
  // worker de fila — campos extras são rejeitados pelo schema estrito.
  const body = await assertContractError(
    parseOrReject("evolution-sender", SCHEMAS, req(), {
      instanceName: "wpp2",
      to: "5511999999999",
      text: "olá",
    }),
    "contract_violation",
  );
  assert(body.details.length > 0, "deve apontar os campos não permitidos");
});

Deno.test("evolution-sender@v1: campo único extra → contract_violation", async () => {
  await assertContractError(
    parseOrReject("evolution-sender", SCHEMAS, req(), { instanceName: "wpp2" }),
    "contract_violation",
  );
});

Deno.test("evolution-sender@v1: body array → contract_violation (schema é objeto)", async () => {
  await assertContractError(
    parseOrReject("evolution-sender", SCHEMAS, req(), [{ instanceName: "wpp2" }]),
    "contract_violation",
  );
});

Deno.test("evolution-sender@v1: body com mediaUrl (contrato de envio) → contract_violation", async () => {
  await assertContractError(
    parseOrReject("evolution-sender", SCHEMAS, req(), {
      instanceName: "wpp2",
      to: "5511999999999",
      mediaUrl: "https://cdn.example.com/a.jpg",
    }),
    "contract_violation",
  );
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

Deno.test("evolution-sender@v1: body null → invalid_json", async () => {
  await assertContractError(
    parseOrReject("evolution-sender", SCHEMAS, req(), null),
    "invalid_json",
  );
});

Deno.test("evolution-sender@v1: versão não suportada → unsupported_contract_version", async () => {
  await assertContractError(
    parseOrReject("evolution-sender", SCHEMAS, req({ "x-contract-version": "v2" }), {}),
    "unsupported_contract_version",
  );
});

Deno.test("evolution-sender@v1: contrato registrado em CONTRACTS como v1", async () => {
  // O contrato existe no registro de versões (contract-versions.ts) e o
  // endpoint usa parseOrReject com o schema registrado — sem isso o worker
  // não tem gate de contrato.
  const SOURCE = await Deno.readTextFile(new URL("../index.ts", import.meta.url));
  assertMatch(SOURCE, /parseOrReject\('evolution-sender'/);
  assertMatch(SOURCE, /EvolutionSenderV1Schema/);
});
