/**
 * Testes de contrato do Contract Kit (parseOrReject).
 *
 * Garante:
 *  1. FORMATO ÚNICO 422 — todo modo de falha produz o mesmo envelope
 *     { error, code, message, contract, details[] } com status 422.
 *  2. VERSIONAMENTO v1/v2 — negociação explícita (header/body), auto-detecção
 *     (mais nova → mais antiga) e rejeição de versão não suportada.
 *  3. RETROCOMPATIBILIDADE — v1 em sunset continua aceita, com headers
 *     `x-contract-deprecated: true` + `sunset`.
 *  4. ADVERSARIAL — campos ausentes, tipos errados, valores vazios, null,
 *     arrays, primitivos, chaves de prototype pollution.
 *
 * Rodar: deno test supabase/functions/_shared/__tests__/contract-kit.test.ts
 */

import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  parseOrReject,
  buildContractErrorBody,
  normalizeVersion,
  resolveRequestedVersion,
  type ContractErrorBody,
} from "../contract-kit.ts";
import {
  CONTRACT_SCHEMAS,
  EvolutionWebhookV1Schema,
  EvolutionWebhookV2Schema,
  TalkxSendV1Schema,
} from "../contract-schemas.ts";
import { CONTRACTS } from "../contract-versions.ts";

const EVOLUTION = { v1: EvolutionWebhookV1Schema, v2: EvolutionWebhookV2Schema };
const UUID = "3f0c8a4e-1b2d-4c5e-9f6a-7b8c9d0e1f2a";

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://edge.local/fn", { method: "POST", headers });
}

/** Asserta o envelope 422 canônico — usado em TODOS os modos de falha. */
async function assertContractError(
  r: { ok: boolean; response?: Response; body?: ContractErrorBody },
  expectedCode: string,
): Promise<ContractErrorBody> {
  assertEquals(r.ok, false, "esperava falha de contrato");
  const res = r.response!;
  assertEquals(res.status, 422);
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

// ─── 1. Normalização e resolução de versão ──────────────────────────────────

Deno.test("normalizeVersion: aliases numéricos e literais", () => {
  assertEquals(normalizeVersion("v1"), "v1");
  assertEquals(normalizeVersion("V2"), "v2");
  assertEquals(normalizeVersion("2.0"), "v2");
  assertEquals(normalizeVersion("1"), "v1");
  assertEquals(normalizeVersion(2), "v2");
  assertEquals(normalizeVersion(""), null);
  assertEquals(normalizeVersion(null), null);
  assertEquals(normalizeVersion({}), null);
});

Deno.test("resolveRequestedVersion: precedência header > contract_version > version", () => {
  const r = req({ "x-contract-version": "v2" });
  assertEquals(resolveRequestedVersion(r, { contract_version: "v1" }), "v2");
  assertEquals(resolveRequestedVersion(req(), { contract_version: "v1", version: "2.0" }), "v1");
  assertEquals(resolveRequestedVersion(req(), { version: "2.0" }), "v2");
  assertEquals(resolveRequestedVersion(req(), {}), null);
  assertEquals(resolveRequestedVersion(null, [1, 2, 3]), null, "array não carrega versão");
});

// ─── 2. Caminho feliz + auto-detecção v2→v1 (retrocompat) ────────────────────

Deno.test("evolution-webhook: payload v1 real (sem version) → aceito como v1 via fallback", () => {
  const payload = { event: "messages.upsert", instance: "wpp2", data: { id: "x" }, sender: null, apikey: null };
  const r = parseOrReject("evolution-webhook", EVOLUTION, req(), payload);
  assert(r.ok);
  assertEquals(r.version, "v1");
});

Deno.test("evolution-webhook: payload v2 (version:'2.0') → detectado como v2, sem deprecação", () => {
  const payload = { event: "messages.upsert", instance: "wpp2", data: {}, version: "2.0", timestamp: Date.now() };
  const r = parseOrReject("evolution-webhook", EVOLUTION, req(), payload);
  assert(r.ok);
  assertEquals(r.version, "v2");
  assertEquals(r.deprecated, false);
  assertEquals(r.headers["x-contract-version"], "v2");
  assertEquals(r.headers["x-contract-deprecated"], undefined);
});

Deno.test("retrocompat: v1 em janela de sunset → aceito com headers de deprecação", () => {
  const sunset = CONTRACTS["evolution-webhook"].sunset?.v1;
  assert(sunset, "registro deve ter sunset para v1");
  assert(Date.parse(sunset!) > Date.now(), "teste pressupõe sunset no futuro");
  const payload = { event: "connection.update", instance: "wpp2", data: null, sender: null, apikey: null };
  const r = parseOrReject("evolution-webhook", EVOLUTION, req(), payload);
  assert(r.ok);
  assertEquals(r.version, "v1");
  assertEquals(r.deprecated, true);
  assertEquals(r.headers["x-contract-deprecated"], "true");
  assertEquals(r.headers["sunset"], sunset);
});

Deno.test("versão explícita v1 via header ainda é aceita (não removida durante sunset)", () => {
  const payload = { event: "messages.upsert", instance: "wpp2" };
  const r = parseOrReject("evolution-webhook", EVOLUTION, req({ "x-contract-version": "v1" }), payload);
  assert(r.ok);
  assertEquals(r.version, "v1");
  assertEquals(r.deprecated, true);
});

// ─── 3. Modos de falha → envelope único ──────────────────────────────────────

Deno.test("422 unsupported_contract_version: v3 pedida explicitamente", async () => {
  const r = parseOrReject("evolution-webhook", EVOLUTION, req({ "x-contract-version": "v3" }), { event: "x", instance: "y" });
  const body = await assertContractError(r, "unsupported_contract_version");
  assert(body.message.includes("v1") && body.message.includes("v2"), "mensagem deve listar suportadas");
});

Deno.test("422 invalid_json: body null (JSON inválido)", async () => {
  const r = parseOrReject("talkx-send", { v1: TalkxSendV1Schema }, req(), null);
  await assertContractError(r, "invalid_json");
});

Deno.test("422 invalid_json: body primitivo (string/number/bool)", async () => {
  for (const b of ["texto", 42, true]) {
    const r = parseOrReject("talkx-send", { v1: TalkxSendV1Schema }, req(), b);
    await assertContractError(r, "invalid_json");
  }
});

Deno.test("422 contract_violation: campo obrigatório ausente", async () => {
  const r = parseOrReject("talkx-send", { v1: TalkxSendV1Schema }, req(), { action: "start" });
  const body = await assertContractError(r, "contract_violation");
  assert(body.details.some((d) => d.path === "campaignId"), "details deve apontar campaignId");
});

Deno.test("422 contract_violation: tipo errado (number em vez de uuid string)", async () => {
  const r = parseOrReject("talkx-send", { v1: TalkxSendV1Schema }, req(), { campaignId: 123, action: "start" });
  const body = await assertContractError(r, "contract_violation");
  assert(body.details.some((d) => d.path === "campaignId"));
});

Deno.test("422 contract_violation: valor vazio (uuid='')", async () => {
  const r = parseOrReject("talkx-send", { v1: TalkxSendV1Schema }, req(), { campaignId: "", action: "start" });
  await assertContractError(r, "contract_violation");
});

Deno.test("422 contract_violation: enum fora do domínio (action='resume')", async () => {
  const r = parseOrReject("talkx-send", { v1: TalkxSendV1Schema }, req(), { campaignId: UUID, action: "resume" });
  const body = await assertContractError(r, "contract_violation");
  assert(body.details.some((d) => d.path === "action"));
});

Deno.test("422 contract_violation: campo extra em schema .strict()", async () => {
  const r = parseOrReject("talkx-send", { v1: TalkxSendV1Schema }, req(), { campaignId: UUID, evil: 1 });
  await assertContractError(r, "contract_violation");
});

Deno.test("adversarial: __proto__/constructor como chaves não quebram o kit", async () => {
  const raw = JSON.parse('{"campaignId":"' + UUID + '","__proto__":{"admin":true},"constructor":{"x":1}}');
  const r = parseOrReject("talkx-send", { v1: TalkxSendV1Schema }, req(), raw);
  // .strict() rejeita chaves extras — resposta deve ser 422 limpo, nunca crash
  await assertContractError(r, "contract_violation");
  assertEquals(({} as Record<string, unknown>).admin, undefined, "prototype não pode ter sido poluído");
});

Deno.test("consistência: os 3 códigos de erro produzem envelope idêntico em shape", async () => {
  const cases: Array<[unknown, Record<string, string>, string]> = [
    [null, {}, "invalid_json"],
    [{ campaignId: UUID }, { "x-contract-version": "v9" }, "unsupported_contract_version"],
    [{}, {}, "contract_violation"],
  ];
  const shapes = new Set<string>();
  for (const [body, headers, code] of cases) {
    const r = parseOrReject("talkx-send", { v1: TalkxSendV1Schema }, req(headers), body);
    const eb = await assertContractError(r, code);
    shapes.add(Object.keys(eb).sort().join(","));
  }
  assertEquals(shapes.size, 1, "todos os modos de falha devem ter as mesmas chaves no envelope");
});

Deno.test("requestId propaga para o envelope quando fornecido", () => {
  const eb = buildContractErrorBody("talkx-send", "v1", "contract_violation", "x", [], "req-123");
  assertEquals(eb.requestId, "req-123");
  const eb2 = buildContractErrorBody("talkx-send", "v1", "contract_violation", "x", []);
  assertEquals("requestId" in eb2, false, "requestId ausente não deve virar undefined serializado");
});

// ─── 4. Registro central: todo contrato registrado tem schema para toda versão suportada ──

Deno.test("integridade: CONTRACT_SCHEMAS cobre todas as versões suportadas dos contratos registrados", () => {
  for (const [name, schemas] of Object.entries(CONTRACT_SCHEMAS)) {
    const spec = CONTRACTS[name];
    assert(spec, `contrato '${name}' precisa existir em contract-versions.ts`);
    for (const v of spec.supported) {
      assert(schemas[v], `contrato '${name}' sem schema para versão suportada '${v}'`);
    }
    assert(spec.supported.includes(spec.current), `'${name}': current fora de supported`);
  }
});
