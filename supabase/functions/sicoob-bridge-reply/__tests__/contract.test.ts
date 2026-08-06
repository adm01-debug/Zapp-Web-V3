/**
 * Contract tests — sicoob-bridge-reply@v1/@v2.
 *
 * Endpoint de resposta da ponte Sicoob (dual-mode). Schema de registro:
 * SicoobBridgeReplyV1Schema (contract-schemas.ts) — permissivo (.passthrough()),
 * todos os campos opcionais (contact_id, content, message_id, created_at,
 * agent_id). V2 = V1 + version/timestamp (metadata de contrato).
 *
 * Casos: válidos (completo/mínimo), campos ausentes, tipos errados, valores
 * vazios, versionamento v1/v2 (retrocompat, header, sunset).
 */
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  SicoobBridgeReplyV1Schema,
  SicoobBridgeReplyV2Schema,
} from "../../_shared/contract-schemas.ts";
import { parseOrReject } from "../../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../../_shared/contract-schemas.ts";

// ─── Schema V1 ───────────────────────────────────────────────────────────────

Deno.test("Contract: sicoob-bridge-reply v1 — payload completo válido", () => {
  const payload = {
    contact_id: "c1",
    content: "Resposta registrada",
    message_id: "m1",
    created_at: "2026-08-06T12:00:00Z",
    agent_id: "a1",
  };
  const result = SicoobBridgeReplyV1Schema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: sicoob-bridge-reply v1 — payload mínimo ({}) aceito (permissivo)", () => {
  const result = SicoobBridgeReplyV1Schema.safeParse({});
  assertEquals(result.success, true);
});

Deno.test("Contract: sicoob-bridge-reply v1 — null rejeitado", () => {
  assertEquals(SicoobBridgeReplyV1Schema.safeParse(null).success, false);
});

Deno.test("Contract: sicoob-bridge-reply v1 — tipos errados rejeitados", () => {
  // content numérico onde string é esperado
  assertEquals(SicoobBridgeReplyV1Schema.safeParse({ content: 42 }).success, false);
  // contact_id objeto
  assertEquals(SicoobBridgeReplyV1Schema.safeParse({ contact_id: { x: 1 } }).success, false);
});

Deno.test("Contract: sicoob-bridge-reply v1 — valores vazios: string vazia aceita (opcional)", () => {
  assertEquals(SicoobBridgeReplyV1Schema.safeParse({ content: "" }).success, true);
  assertEquals(SicoobBridgeReplyV1Schema.safeParse({ content: "   " }).success, true);
});

Deno.test("Contract: sicoob-bridge-reply v1 — campos extras ignorados (passthrough)", () => {
  const payload = { content: "ok", extra: { qualquer: true } };
  assertEquals(SicoobBridgeReplyV1Schema.safeParse(payload).success, true);
});

// ─── Schema V2 ───────────────────────────────────────────────────────────────

Deno.test("Contract: sicoob-bridge-reply v2 — payload V2 válido", () => {
  const payload = { content: "ok", version: "2.0", timestamp: Date.now() };
  assertEquals(SicoobBridgeReplyV2Schema.safeParse(payload).success, true);
});

Deno.test("Contract: sicoob-bridge-reply v2 — sem timestamp → rejeitado", () => {
  const payload = { content: "ok", version: "2.0" };
  assertEquals(SicoobBridgeReplyV2Schema.safeParse(payload).success, false);
});

Deno.test("Contract: sicoob-bridge-reply v2 — timestamp negativo → rejeitado", () => {
  const payload = { content: "ok", version: "2.0", timestamp: -5 };
  assertEquals(SicoobBridgeReplyV2Schema.safeParse(payload).success, false);
});

// ─── Versionamento v1/v2 (parseOrReject) ─────────────────────────────────────

Deno.test("Versioning: payload V1 aceito quando V2 é current (auto-detecção v1)", () => {
  const result = parseOrReject("sicoob-bridge-reply", CONTRACT_SCHEMAS["sicoob-bridge-reply"], null, { content: "ok" });
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.version, "v1");
});

Deno.test("Versioning: payload V2 preferido quando V2 é current", () => {
  const result = parseOrReject(
    "sicoob-bridge-reply",
    CONTRACT_SCHEMAS["sicoob-bridge-reply"],
    null,
    { content: "ok", version: "2.0", timestamp: Date.now() },
  );
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.version, "v2");
});

Deno.test("Versioning: x-contract-version header força v1", () => {
  const headers = new Headers({ "x-contract-version": "v1" });
  const req = new Request("http://localhost", { headers });
  const result = parseOrReject("sicoob-bridge-reply", CONTRACT_SCHEMAS["sicoob-bridge-reply"], req, { content: "ok" });
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.version, "v1");
});

Deno.test("Versioning: versão não suportada → 422 unsupported_contract_version", () => {
  const headers = new Headers({ "x-contract-version": "v99" });
  const req = new Request("http://localhost", { headers });
  const result = parseOrReject("sicoob-bridge-reply", CONTRACT_SCHEMAS["sicoob-bridge-reply"], req, { content: "ok" });
  assertEquals(result.ok, false);
  if (result.ok === false) {
    assertEquals(result.body.code, "unsupported_contract_version");
    assertEquals(result.response.status, 422);
    assertEquals(result.body.contract, "sicoob-bridge-reply@v99");
  }
});

Deno.test("Versioning: v1 deprecated → headers x-contract-deprecated + sunset", () => {
  const headers = new Headers({ "x-contract-version": "v1" });
  const req = new Request("http://localhost", { headers });
  const result = parseOrReject("sicoob-bridge-reply", CONTRACT_SCHEMAS["sicoob-bridge-reply"], req, { content: "ok" });
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.deprecated, true);
    assertEquals(result.headers["x-contract-deprecated"], "true");
    assertEquals(result.headers["sunset"], "2027-06-01");
  }
});
