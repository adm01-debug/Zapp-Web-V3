/**
 * Contract tests — sicoob-bridge-reply@v1/@v2.
 *
 * Endpoint de resposta da ponte Sicoob (dual-mode). Schema de registro:
 * SicoobBridgeReplyV1Schema (contract-schemas.ts) — contact_id/content
 * obrigatórios (extras passam via .passthrough(), campo legítimo do dual-mode
 * service-role/JWT). message_id, created_at, agent_id opcionais. V2 = V1 +
 * version/timestamp (metadata de contrato).
 *
 * DRIFT FECHADO (2026-08-21, Bloco 2/3 do PLANO-100-CONTRATOS-EDGE):
 * contact_id/content eram `.optional()` no schema, mas o handler sempre
 * exigiu os dois via bloco 400 manual — removido junto com este fix.
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

// Auditoria de re-verificação (Bloco 4/etapa 44): contact_id/agent_id
// viraram .uuid() — fixtures migradas de "c1"/"a1" pro formato UUID.
const CONTACT_UUID = "3f0c8a4e-1b2d-4c5e-9f6a-7b8c9d0e1f2a";
const AGENT_UUID = "5c1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8";
const MIN = { contact_id: CONTACT_UUID, content: "Resposta registrada" };

// ─── Schema V1 ───────────────────────────────────────────────────────────────

Deno.test("Contract: sicoob-bridge-reply v1 — payload completo válido", () => {
  const payload = {
    ...MIN,
    message_id: "m1",
    created_at: "2026-08-06T12:00:00Z",
    agent_id: AGENT_UUID,
  };
  const result = SicoobBridgeReplyV1Schema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: sicoob-bridge-reply v1 — payload mínimo (contact_id+content) aceito", () => {
  const result = SicoobBridgeReplyV1Schema.safeParse(MIN);
  assertEquals(result.success, true);
});

Deno.test("Contract: sicoob-bridge-reply v1 — {} rejeitado (contact_id/content obrigatórios)", () => {
  const result = SicoobBridgeReplyV1Schema.safeParse({});
  assertEquals(result.success, false);
});

Deno.test("Contract: sicoob-bridge-reply v1 — contact_id ausente rejeitado", () => {
  assertEquals(SicoobBridgeReplyV1Schema.safeParse({ content: "ok" }).success, false);
});

Deno.test("Contract: sicoob-bridge-reply v1 — content ausente rejeitado", () => {
  assertEquals(SicoobBridgeReplyV1Schema.safeParse({ contact_id: CONTACT_UUID }).success, false);
});

Deno.test("Contract: sicoob-bridge-reply v1 — null rejeitado", () => {
  assertEquals(SicoobBridgeReplyV1Schema.safeParse(null).success, false);
});

Deno.test("Contract: sicoob-bridge-reply v1 — tipos errados rejeitados", () => {
  // content numérico onde string é esperado
  assertEquals(SicoobBridgeReplyV1Schema.safeParse({ ...MIN, content: 42 }).success, false);
  // contact_id objeto
  assertEquals(SicoobBridgeReplyV1Schema.safeParse({ ...MIN, contact_id: { x: 1 } }).success, false);
});

Deno.test("Contract: sicoob-bridge-reply v1 — content vazio rejeitado (min 1)", () => {
  assertEquals(SicoobBridgeReplyV1Schema.safeParse({ contact_id: CONTACT_UUID, content: "" }).success, false);
});

Deno.test("Contract: sicoob-bridge-reply v1 — contact_id vazio rejeitado (formato UUID)", () => {
  assertEquals(SicoobBridgeReplyV1Schema.safeParse({ contact_id: "", content: "ok" }).success, false);
});

// Auditoria de re-verificação (Bloco 4/etapa 44): contact_id/agent_id agora
// exigem formato UUID de verdade — "c1"/"a1" (aceitos antes) devem reprovar.
Deno.test("Contract: sicoob-bridge-reply v1 — contact_id fora do formato UUID rejeitado", () => {
  assertEquals(SicoobBridgeReplyV1Schema.safeParse({ contact_id: "c1", content: "ok" }).success, false);
});

Deno.test("Contract: sicoob-bridge-reply v1 — agent_id fora do formato UUID rejeitado", () => {
  assertEquals(SicoobBridgeReplyV1Schema.safeParse({ ...MIN, agent_id: "a1" }).success, false);
});

Deno.test("Contract: sicoob-bridge-reply v1 — content só espaços aceito (min 1 não faz trim)", () => {
  // Zod .min(1) conta caracteres, não faz trim — "   " tem length 3.
  // Trim/normalização de conteúdo em branco é decisão de produto, não de contrato.
  assertEquals(SicoobBridgeReplyV1Schema.safeParse({ contact_id: CONTACT_UUID, content: "   " }).success, true);
});

Deno.test("Contract: sicoob-bridge-reply v1 — campos extras passam (passthrough, dual-mode service-role)", () => {
  const payload = { ...MIN, extra: { qualquer: true } };
  assertEquals(SicoobBridgeReplyV1Schema.safeParse(payload).success, true);
});

// ─── Schema V2 ───────────────────────────────────────────────────────────────

Deno.test("Contract: sicoob-bridge-reply v2 — payload V2 válido", () => {
  const payload = { ...MIN, version: "2.0", timestamp: Date.now() };
  assertEquals(SicoobBridgeReplyV2Schema.safeParse(payload).success, true);
});

Deno.test("Contract: sicoob-bridge-reply v2 — sem timestamp → rejeitado", () => {
  const payload = { ...MIN, version: "2.0" };
  assertEquals(SicoobBridgeReplyV2Schema.safeParse(payload).success, false);
});

Deno.test("Contract: sicoob-bridge-reply v2 — timestamp negativo → rejeitado", () => {
  const payload = { ...MIN, version: "2.0", timestamp: -5 };
  assertEquals(SicoobBridgeReplyV2Schema.safeParse(payload).success, false);
});

Deno.test("Contract: sicoob-bridge-reply v2 — contact_id/content ainda obrigatórios (herdados de V1)", () => {
  const payload = { version: "2.0", timestamp: Date.now() };
  assertEquals(SicoobBridgeReplyV2Schema.safeParse(payload).success, false);
});

// ─── Versionamento v1/v2 (parseOrReject) ─────────────────────────────────────

Deno.test("Versioning: payload V1 aceito quando V2 é current (auto-detecção v1)", () => {
  const result = parseOrReject("sicoob-bridge-reply", CONTRACT_SCHEMAS["sicoob-bridge-reply"], null, MIN);
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.version, "v1");
});

Deno.test("Versioning: payload V2 preferido quando V2 é current", () => {
  const result = parseOrReject(
    "sicoob-bridge-reply",
    CONTRACT_SCHEMAS["sicoob-bridge-reply"],
    null,
    { ...MIN, version: "2.0", timestamp: Date.now() },
  );
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.version, "v2");
});

Deno.test("Versioning: x-contract-version header força v1", () => {
  const headers = new Headers({ "x-contract-version": "v1" });
  const req = new Request("http://localhost", { headers });
  const result = parseOrReject("sicoob-bridge-reply", CONTRACT_SCHEMAS["sicoob-bridge-reply"], req, MIN);
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.version, "v1");
});

Deno.test("Versioning: versão não suportada → 422 unsupported_contract_version", () => {
  const headers = new Headers({ "x-contract-version": "v99" });
  const req = new Request("http://localhost", { headers });
  const result = parseOrReject("sicoob-bridge-reply", CONTRACT_SCHEMAS["sicoob-bridge-reply"], req, MIN);
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
  const result = parseOrReject("sicoob-bridge-reply", CONTRACT_SCHEMAS["sicoob-bridge-reply"], req, MIN);
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.deprecated, true);
    assertEquals(result.headers["x-contract-deprecated"], "true");
    assertEquals(result.headers["sunset"], "2027-06-01");
  }
});
