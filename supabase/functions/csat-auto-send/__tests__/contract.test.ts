/**
 * Contract tests — csat-auto-send@v1 (GAP da auditoria 2026-08-06: zero
 * cobertura de missing fields / tipos errados / valores vazios).
 *
 * Schema REAL: CsatAutoSendV1Schema (contract-schemas.ts) — STRICT, com
 * obrigatórios contact_id (UUID) e connection_id (UUID); survey_id, agent_id,
 * conversation_id (UUID) e delay_minutes (int 0-1440) nullish.
 */
import { assertEquals } from "jsr:@std/assert";
import { CsatAutoSendV1Schema } from "../../_shared/contract-schemas.ts";
import { parseOrReject } from "../../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../../_shared/contract-schemas.ts";

const UUID = "3f2b8f1e-6d4a-4c9e-9b7a-1c2d3e4f5a6b";

function validPayload(): Record<string, unknown> {
  return { contact_id: UUID, connection_id: UUID };
}

// ─── Missing fields ──────────────────────────────────────────────────────────

Deno.test("Contract: csat-auto-send v1 — payload mínimo válido", () => {
  assertEquals(CsatAutoSendV1Schema.safeParse(validPayload()).success, true);
});

Deno.test("Contract: csat-auto-send v1 — válido completo (todos os opcionais)", () => {
  const payload = {
    ...validPayload(),
    survey_id: UUID,
    agent_id: UUID,
    conversation_id: UUID,
    delay_minutes: 30,
  };
  assertEquals(CsatAutoSendV1Schema.safeParse(payload).success, true);
});

Deno.test("Contract: csat-auto-send v1 — contact_id ausente → rejeitado", () => {
  const { contact_id: _drop, ...payload } = validPayload();
  const r = CsatAutoSendV1Schema.safeParse(payload);
  assertEquals(r.success, false);
  if (!r.success) {
    const paths = r.error.issues.map((i) => i.path.join("."));
    assertEquals(paths.includes("contact_id"), true);
  }
});

Deno.test("Contract: csat-auto-send v1 — connection_id ausente → rejeitado", () => {
  const { connection_id: _drop, ...payload } = validPayload();
  const r = CsatAutoSendV1Schema.safeParse(payload);
  assertEquals(r.success, false);
  if (!r.success) {
    const paths = r.error.issues.map((i) => i.path.join("."));
    assertEquals(paths.includes("connection_id"), true);
  }
});

Deno.test("Contract: csat-auto-send v1 — body {} → rejeitado (2 obrigatórios)", () => {
  assertEquals(CsatAutoSendV1Schema.safeParse({}).success, false);
});

// ─── Tipos incorretos ────────────────────────────────────────────────────────

Deno.test("Contract: csat-auto-send v1 — contact_id não-UUID → rejeitado", () => {
  const r = CsatAutoSendV1Schema.safeParse({ ...validPayload(), contact_id: "abc" });
  assertEquals(r.success, false);
});

Deno.test("Contract: csat-auto-send v1 — connection_id número → rejeitado", () => {
  const r = CsatAutoSendV1Schema.safeParse({ ...validPayload(), connection_id: 42 });
  assertEquals(r.success, false);
});

Deno.test("Contract: csat-auto-send v1 — delay_minutes string → rejeitado", () => {
  const r = CsatAutoSendV1Schema.safeParse({ ...validPayload(), delay_minutes: "30" });
  assertEquals(r.success, false);
});

Deno.test("Contract: csat-auto-send v1 — survey_id não-UUID → rejeitado", () => {
  const r = CsatAutoSendV1Schema.safeParse({ ...validPayload(), survey_id: "x" });
  assertEquals(r.success, false);
});

// ─── Valores vazios / limites ────────────────────────────────────────────────

Deno.test("Contract: csat-auto-send v1 — contact_id vazio '' → rejeitado", () => {
  const r = CsatAutoSendV1Schema.safeParse({ ...validPayload(), contact_id: "" });
  assertEquals(r.success, false);
});

Deno.test("Contract: csat-auto-send v1 — delay_minutes 0 → aceito (min 0)", () => {
  const r = CsatAutoSendV1Schema.safeParse({ ...validPayload(), delay_minutes: 0 });
  assertEquals(r.success, true);
});

Deno.test("Contract: csat-auto-send v1 — delay_minutes negativo → rejeitado", () => {
  const r = CsatAutoSendV1Schema.safeParse({ ...validPayload(), delay_minutes: -1 });
  assertEquals(r.success, false);
});

Deno.test("Contract: csat-auto-send v1 — delay_minutes acima de 1440 → rejeitado", () => {
  const r = CsatAutoSendV1Schema.safeParse({ ...validPayload(), delay_minutes: 1441 });
  assertEquals(r.success, false);
});

Deno.test("Contract: csat-auto-send v1 — null no body → rejeitado", () => {
  assertEquals(CsatAutoSendV1Schema.safeParse(null).success, false);
});

// ─── Strictness ──────────────────────────────────────────────────────────────

Deno.test("Contract: csat-auto-send v1 — campo extra → rejeitado (.strict())", () => {
  const r = CsatAutoSendV1Schema.safeParse({ ...validPayload(), hack: true });
  assertEquals(r.success, false);
});

// ─── Gate (parseOrReject, envelope 422) ──────────────────────────────────────

Deno.test("Contract: csat-auto-send v1 — gate: sem contact_id → 422 contract_violation com path", () => {
  const { contact_id: _drop, ...payload } = validPayload();
  const r = parseOrReject("csat-auto-send", CONTRACT_SCHEMAS["csat-auto-send"], null, payload);
  assertEquals(r.ok, false);
  if (r.ok === false) {
    assertEquals(r.response.status, 422);
    assertEquals(r.body.code, "contract_violation");
    assertEquals(r.body.contract, "csat-auto-send@v1");
    const paths = r.body.details.map((d) => d.path);
    assertEquals(paths.includes("contact_id"), true);
  }
});
