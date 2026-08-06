/**
 * Contract tests — webauthn@v1 (GAP da auditoria 2026-08-06: zero cobertura
 * do contrato edge — só existia teste do frontend webauthnUtils).
 *
 * Schema REAL: WebauthnV1Schema (contract-schemas.ts) — action enum
 * OBRIGATÓRIO (registration-options|verify-registration|authentication-options|
 * verify-authentication); userId/userEmail/userName/friendlyName opcionais e
 * credential opaco. Permissivo (extras passam).
 */
import { assertEquals } from "jsr:@std/assert";
import { WebauthnV1Schema } from "../../_shared/contract-schemas.ts";
import { parseOrReject } from "../../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../../_shared/contract-schemas.ts";

const ACTIONS = ["registration-options", "verify-registration", "authentication-options", "verify-authentication"] as const;

// ─── Válidos ─────────────────────────────────────────────────────────────────

Deno.test("Contract: webauthn v1 — cada action do enum é aceita", () => {
  for (const action of ACTIONS) {
    const r = WebauthnV1Schema.safeParse({ action });
    assertEquals(r.success, true, `action ${action} deveria passar`);
  }
});

Deno.test("Contract: webauthn v1 — payload completo válido", () => {
  const payload = {
    action: "verify-registration",
    userId: "u1",
    userEmail: "a@b.com",
    userName: "Joao",
    credential: { id: "x", response: {} },
    friendlyName: "Notebook",
  };
  assertEquals(WebauthnV1Schema.safeParse(payload).success, true);
});

// ─── Missing fields ──────────────────────────────────────────────────────────

Deno.test("Contract: webauthn v1 — action ausente → rejeitado", () => {
  const r = WebauthnV1Schema.safeParse({});
  assertEquals(r.success, false);
  if (!r.success) {
    const paths = r.error.issues.map((i) => i.path.join("."));
    assertEquals(paths.includes("action"), true);
  }
});

// ─── Tipos incorretos ────────────────────────────────────────────────────────

Deno.test("Contract: webauthn v1 — action inválida → rejeitado (enum fechado)", () => {
  const r = WebauthnV1Schema.safeParse({ action: "delete-account" });
  assertEquals(r.success, false);
});

Deno.test("Contract: webauthn v1 — action número → rejeitado", () => {
  const r = WebauthnV1Schema.safeParse({ action: 42 });
  assertEquals(r.success, false);
});

Deno.test("Contract: webauthn v1 — userId número → rejeitado", () => {
  const r = WebauthnV1Schema.safeParse({ action: "registration-options", userId: 123 });
  assertEquals(r.success, false);
});

Deno.test("Contract: webauthn v1 — userEmail inválido (sem @) → aceito (schema não valida formato)", () => {
  // Documenta o comportamento REAL: max(320) sem regex de email.
  const r = WebauthnV1Schema.safeParse({ action: "registration-options", userEmail: "sem-arroba" });
  assertEquals(r.success, true);
});

// ─── Valores vazios ──────────────────────────────────────────────────────────

Deno.test("Contract: webauthn v1 — action '' → rejeitado (enum)", () => {
  const r = WebauthnV1Schema.safeParse({ action: "" });
  assertEquals(r.success, false);
});

Deno.test("Contract: webauthn v1 — null no body → rejeitado", () => {
  assertEquals(WebauthnV1Schema.safeParse(null).success, false);
});

Deno.test("Contract: webauthn v1 — undefined no body → rejeitado", () => {
  assertEquals(WebauthnV1Schema.safeParse(undefined).success, false);
});

// ─── Permissividade ──────────────────────────────────────────────────────────

Deno.test("Contract: webauthn v1 — campo extra → aceito (.passthrough())", () => {
  const r = WebauthnV1Schema.safeParse({ action: "registration-options", extra: { x: 1 } });
  assertEquals(r.success, true);
});

// ─── Gate (parseOrReject, envelope 422) ──────────────────────────────────────

Deno.test("Contract: webauthn v1 — gate: sem action → 422 contract_violation com path", () => {
  const r = parseOrReject("webauthn", CONTRACT_SCHEMAS["webauthn"], null, {});
  assertEquals(r.ok, false);
  if (r.ok === false) {
    assertEquals(r.response.status, 422);
    assertEquals(r.body.code, "contract_violation");
    assertEquals(r.body.contract, "webauthn@v1");
    const paths = r.body.details.map((d) => d.path);
    assertEquals(paths.includes("action"), true);
  }
});

Deno.test("Contract: webauthn v1 — gate: action válida passa", () => {
  const r = parseOrReject("webauthn", CONTRACT_SCHEMAS["webauthn"], null, { action: "registration-options" });
  assertEquals(r.ok, true);
});
