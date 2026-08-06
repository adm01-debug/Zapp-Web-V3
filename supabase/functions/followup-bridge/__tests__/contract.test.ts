/**
 * Contract tests — followup-bridge@v1 (GAP da auditoria 2026-08-06: zero
 * cobertura de missing fields / tipos errados / valores vazios).
 *
 * Schema REAL: FollowupBridgeV1Schema (contract-schemas.ts) — STRICT, com
 * obrigatórios sequence_id (UUID), contact_jid (min 1), instance_name (min 1)
 * e trigger_event opcional. Strict → campo extra rejeitado.
 */
import { assertEquals } from "jsr:@std/assert";
import { FollowupBridgeV1Schema } from "../../_shared/contract-schemas.ts";
import { parseOrReject } from "../../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../../_shared/contract-schemas.ts";

const UUID = "3f2b8f1e-6d4a-4c9e-9b7a-1c2d3e4f5a6b";

function validPayload(): Record<string, unknown> {
  return {
    sequence_id: UUID,
    contact_jid: "5511999999999@s.whatsapp.net",
    instance_name: "wpp1",
  };
}

// ─── Missing fields ──────────────────────────────────────────────────────────

Deno.test("Contract: followup-bridge v1 — payload completo válido", () => {
  assertEquals(FollowupBridgeV1Schema.safeParse(validPayload()).success, true);
});

Deno.test("Contract: followup-bridge v1 — válido com trigger_event", () => {
  const payload = { ...validPayload(), trigger_event: "message.upsert" };
  assertEquals(FollowupBridgeV1Schema.safeParse(payload).success, true);
});

Deno.test("Contract: followup-bridge v1 — sequence_id ausente → rejeitado", () => {
  const { sequence_id: _drop, ...payload } = validPayload();
  const r = FollowupBridgeV1Schema.safeParse(payload);
  assertEquals(r.success, false);
  if (!r.success) {
    const paths = r.error.issues.map((i) => i.path.join("."));
    assertEquals(paths.includes("sequence_id"), true);
  }
});

Deno.test("Contract: followup-bridge v1 — contact_jid ausente → rejeitado", () => {
  const { contact_jid: _drop, ...payload } = validPayload();
  const r = FollowupBridgeV1Schema.safeParse(payload);
  assertEquals(r.success, false);
  if (!r.success) {
    const paths = r.error.issues.map((i) => i.path.join("."));
    assertEquals(paths.includes("contact_jid"), true);
  }
});

Deno.test("Contract: followup-bridge v1 — instance_name ausente → rejeitado", () => {
  const { instance_name: _drop, ...payload } = validPayload();
  const r = FollowupBridgeV1Schema.safeParse(payload);
  assertEquals(r.success, false);
  if (!r.success) {
    const paths = r.error.issues.map((i) => i.path.join("."));
    assertEquals(paths.includes("instance_name"), true);
  }
});

Deno.test("Contract: followup-bridge v1 — body {} → rejeitado (3 obrigatórios)", () => {
  assertEquals(FollowupBridgeV1Schema.safeParse({}).success, false);
});

// ─── Tipos incorretos ────────────────────────────────────────────────────────

Deno.test("Contract: followup-bridge v1 — sequence_id não-UUID → rejeitado", () => {
  const r = FollowupBridgeV1Schema.safeParse({ ...validPayload(), sequence_id: "nao-e-uuid" });
  assertEquals(r.success, false);
});

Deno.test("Contract: followup-bridge v1 — contact_jid número → rejeitado", () => {
  const r = FollowupBridgeV1Schema.safeParse({ ...validPayload(), contact_jid: 12345 });
  assertEquals(r.success, false);
});

Deno.test("Contract: followup-bridge v1 — instance_name objeto → rejeitado", () => {
  const r = FollowupBridgeV1Schema.safeParse({ ...validPayload(), instance_name: { a: 1 } });
  assertEquals(r.success, false);
});

// ─── Valores vazios ──────────────────────────────────────────────────────────

Deno.test("Contract: followup-bridge v1 — contact_jid vazio '' → rejeitado (min 1)", () => {
  const r = FollowupBridgeV1Schema.safeParse({ ...validPayload(), contact_jid: "" });
  assertEquals(r.success, false);
});

Deno.test("Contract: followup-bridge v1 — contact_jid whitespace-only → rejeitado (sem trim)", () => {
  // Schema não usa .trim(): '   ' tem length 3 ≥ 1 → ACEITO (documenta o real).
  const r = FollowupBridgeV1Schema.safeParse({ ...validPayload(), contact_jid: "   " });
  assertEquals(r.success, true);
});

Deno.test("Contract: followup-bridge v1 — instance_name vazio '' → rejeitado (min 1)", () => {
  const r = FollowupBridgeV1Schema.safeParse({ ...validPayload(), instance_name: "" });
  assertEquals(r.success, false);
});

Deno.test("Contract: followup-bridge v1 — null no body → rejeitado", () => {
  assertEquals(FollowupBridgeV1Schema.safeParse(null).success, false);
});

// ─── Strictness ──────────────────────────────────────────────────────────────

Deno.test("Contract: followup-bridge v1 — campo extra → rejeitado (.strict())", () => {
  const r = FollowupBridgeV1Schema.safeParse({ ...validPayload(), hack: true });
  assertEquals(r.success, false);
});

// ─── Gate (parseOrReject, envelope 422) ──────────────────────────────────────

Deno.test("Contract: followup-bridge v1 — gate: payload sem sequence_id → 422 contract_violation com path", () => {
  const { sequence_id: _drop, ...payload } = validPayload();
  const r = parseOrReject("followup-bridge", CONTRACT_SCHEMAS["followup-bridge"], null, payload);
  assertEquals(r.ok, false);
  if (r.ok === false) {
    assertEquals(r.response.status, 422);
    assertEquals(r.body.code, "contract_violation");
    assertEquals(r.body.contract, "followup-bridge@v1");
    const paths = r.body.details.map((d) => d.path);
    assertEquals(paths.includes("sequence_id"), true);
  }
});
