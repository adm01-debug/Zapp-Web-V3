/**
 * Contract tests — approve-password-reset@v1 (edge EXISTE — GREEN).
 *
 * Fluxo de reset de senha com aprovação admin (Etapa 55): admin/supervisor
 * aprova ou rejeita uma solicitação de reset. Cobertura:
 *
 *   - Contrato registrado (permissivo por design — handler valida negócio):
 *     campos aceitos, extras passam, null → 422 invalid_json no gate.
 *   - Ordem de segurança: rate-limit (429) → requireAdminOrSupervisor
 *     (401 sem JWT / 403 não-admin) → gate 422 (auth ANTES do contrato —
 *     oracle da micro-auditoria de gates 2026-08-05).
 *   - "Token inválido → erro tratado": requestId inexistente → 404
 *     "Reset request not found"; request já processado → 409
 *     "Request already processed" (atomicidade .eq(status,'pending'));
 *     guarda de compatibilidade → 400 quando requestId/action faltam.
 *   - Fluxo do token: generateLink (recovery, TTL 1h) + RPC
 *     `store_reset_token` (hash isolado via SECURITY DEFINER).
 *
 * DRIFT DOCUMENTADO (contrato registrado × consumo real): o schema
 * registrado (ApprovePasswordResetV1Schema) é placeholder permissivo com
 * campos `reset_id`/`request_id`/`approved`/`decision`, mas o handler lê
 * `requestId`/`action`/`rejectionReason`. A guarda de compatibilidade 400
 * no index.ts preserva o comportamento antigo — testada abaixo. Não
 * "corrigir" o schema sem ordem do integrador (regra de ouro do repo).
 */
import { assertEquals, assertMatch, assert } from "jsr:@std/assert";
import { z } from "https://esm.sh/zod@3.23.8";
import {
  ApprovePasswordResetV1Schema,
  CONTRACT_SCHEMAS,
} from "../../_shared/contract-schemas.ts";
import { parseOrReject } from "../../_shared/contract-kit.ts";
import { readSourceFrom, extractBlock } from "../../_shared/test-helpers.ts";

const UUID = "3f2b8f1e-6d4a-4c9e-9b7a-1c2d3e4f5a6b";

// ─── Schema registrado (comportamento REAL, permissivo) ─────────────────────

Deno.test("Contract: approve-password-reset v1 — payload real do handler → aceito", () => {
  const r = ApprovePasswordResetV1Schema.safeParse({ requestId: UUID, action: "approve" });
  assertEquals(r.success, true);
});

Deno.test("Contract: approve-password-reset v1 — reject com rejectionReason → aceito", () => {
  const r = ApprovePasswordResetV1Schema.safeParse({
    requestId: UUID,
    action: "reject",
    rejectionReason: "Atividade suspeita",
  });
  assertEquals(r.success, true);
});

Deno.test("Contract: approve-password-reset v1 — {} → aceito (placeholder permissivo; guard 400 no handler)", () => {
  // GAP CONHECIDO: schema registrado é placeholder (tudo optional + passthrough).
  // A proteção real contra body vazio é a guarda de compatibilidade 400 no
  // index.ts (testada abaixo nas âncoras).
  assertEquals(ApprovePasswordResetV1Schema.safeParse({}).success, true);
});

Deno.test("Contract: approve-password-reset v1 — campos do schema antigo → aceitos", () => {
  const r = ApprovePasswordResetV1Schema.safeParse({
    action: "approve",
    reset_id: UUID,
    request_id: UUID,
    approved: true,
    decision: "ok",
  });
  assertEquals(r.success, true);
});

Deno.test("Contract: approve-password-reset v1 — campo extra → aceito (.passthrough())", () => {
  assertEquals(ApprovePasswordResetV1Schema.safeParse({ requestId: UUID, hack: true }).success, true);
});

Deno.test("Contract: approve-password-reset v1 — null → rejeitado (zod object)", () => {
  assertEquals(ApprovePasswordResetV1Schema.safeParse(null).success, false);
});

// ─── Registro canônico ───────────────────────────────────────────────────────

Deno.test("Contract: approve-password-reset v1 — registrado em CONTRACT_SCHEMAS", () => {
  assert(CONTRACT_SCHEMAS["approve-password-reset"]?.v1);
});

// ─── Gate (parseOrReject, envelope 422) ─────────────────────────────────────

Deno.test("Contract: approve-password-reset v1 — gate: body null → 422 invalid_json", () => {
  // Handler: req.json().catch(() => null) → parseOrReject → 422 canônico.
  const r = parseOrReject(
    "approve-password-reset",
    CONTRACT_SCHEMAS["approve-password-reset"],
    null,
    null,
  );
  assertEquals(r.ok, false);
  if (r.ok === false) {
    assertEquals(r.response.status, 422);
    assertEquals(r.body.error, true);
    assertEquals(r.body.code, "invalid_json");
  }
});

Deno.test("Contract: approve-password-reset v1 — gate: payload válido → ok (permissivo)", () => {
  const r = parseOrReject(
    "approve-password-reset",
    CONTRACT_SCHEMAS["approve-password-reset"],
    null,
    { requestId: UUID, action: "approve" },
  );
  assertEquals(r.ok, true);
});

// ─── Âncoras de fonte (comportamento real do index.ts) ──────────────────────

const SOURCE = await readSourceFrom(import.meta.url, "../index.ts");

Deno.test("Contract: approve-password-reset v1 — rate limit ANTES da auth (429)", () => {
  assertMatch(SOURCE, /checkRateLimit\(`approve-reset:\$\{ip\}`, 10, 60_000\)/);
  assertMatch(SOURCE, /errorResponse\("Rate limit exceeded", 429, req\)/);
});

Deno.test("Contract: approve-password-reset v1 — admin-only: auth ANTES do gate (401/403)", () => {
  // requireAdminOrSupervisor → 401 sem JWT / 403 não-admin; só depois o
  // contrato 422 roda — anônimo nunca vê erro de validação de body.
  assertMatch(SOURCE, /requireAdminOrSupervisor\(req\)/);
  assertMatch(SOURCE, /instanceof Response\) return/);
  assertMatch(
    SOURCE,
    /requireAdminOrSupervisor\(req\)[\s\S]{0,3000}?parseOrReject\('approve-password-reset'/,
  );
});

Deno.test("Contract: approve-password-reset v1 — requestId inexistente → 404 (token inválido tratado)", () => {
  assertMatch(SOURCE, /errorResponse\("Reset request not found", 404, req\)/);
});

Deno.test("Contract: approve-password-reset v1 — request já processado → 409 (não 500)", () => {
  assertMatch(SOURCE, /errorResponse\("Request already processed", 409, req\)/);
  assertMatch(SOURCE, /\.eq\("status", "pending"\)/); // guard atômico (2x: approve + reject)
});

Deno.test("Contract: approve-password-reset v1 — guarda de compatibilidade 400 (requestId/action)", () => {
  const block = extractBlock(SOURCE, "Guarda de compatibilidade", { maxSize: 1500 });
  assertMatch(block, /requestId/);
  assertMatch(block, /400, req\)/);
});

Deno.test("Contract: approve-password-reset v1 — geração do token: generateLink + store_reset_token", () => {
  assertMatch(SOURCE, /generateLink\(/);
  assertMatch(SOURCE, /\.rpc\(\s*["']store_reset_token["']/);
  assertMatch(SOURCE, /type: "recovery"/);
});

Deno.test("Contract: approve-password-reset v1 — sem vazamento de existência (404 genérico)", () => {
  // Nunca confirma qual email/usuário falhou (anti-enumeração).
  assertMatch(SOURCE, /Reset request not found/);
});
