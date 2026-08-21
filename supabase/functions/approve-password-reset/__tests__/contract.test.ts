/**
 * Contract tests — approve-password-reset@v1 (edge EXISTE — GREEN).
 *
 * Fluxo de reset de senha com aprovação admin (Etapa 55): admin/supervisor
 * aprova ou rejeita uma solicitação de reset. Cobertura:
 *
 *   - Contrato registrado valida o consumo REAL: requestId (obrigatório),
 *     action (enum approve|reject, obrigatório), rejectionReason (opcional).
 *   - Ordem de segurança: rate-limit (429) → requireAdminOrSupervisor
 *     (401 sem JWT / 403 não-admin) → gate 422 (auth ANTES do contrato —
 *     oracle da micro-auditoria de gates 2026-08-05).
 *   - "Token inválido → erro tratado": requestId inexistente → 404
 *     "Reset request not found"; request já processado → 409
 *     "Request already processed" (atomicidade .eq(status,'pending')).
 *   - Fluxo do token: generateLink (recovery, TTL 1h) + RPC
 *     `store_reset_token` (hash isolado via SECURITY DEFINER).
 *
 * DRIFT FECHADO (2026-08-21, Bloco 2/3 do PLANO-100-CONTRATOS-EDGE): o
 * schema antigo era placeholder permissivo com campos `reset_id`/
 * `request_id`/`approved`/`decision` — nunca lidos pelo handler (que sempre
 * usou `requestId`/`action`/`rejectionReason`) nem enviados pelo único
 * chamador real (`PasswordResetRequestsPanel.tsx`, confirmado por grep).
 * O bloco 400 manual que compensava isso foi removido — o gate 422 agora
 * reprova de verdade.
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

Deno.test("Contract: approve-password-reset v1 — {} → rejeitado (requestId/action obrigatórios)", () => {
  assertEquals(ApprovePasswordResetV1Schema.safeParse({}).success, false);
});

Deno.test("Contract: approve-password-reset v1 — apenas requestId (sem action) → rejeitado", () => {
  assertEquals(ApprovePasswordResetV1Schema.safeParse({ requestId: UUID }).success, false);
});

Deno.test("Contract: approve-password-reset v1 — action fora do enum → rejeitado", () => {
  const r = ApprovePasswordResetV1Schema.safeParse({ requestId: UUID, action: "delete" });
  assertEquals(r.success, false);
});

Deno.test("Contract: approve-password-reset v1 — requestId vazio → rejeitado", () => {
  assertEquals(ApprovePasswordResetV1Schema.safeParse({ requestId: "", action: "approve" }).success, false);
});

Deno.test("Contract: approve-password-reset v1 — campos do schema antigo (reset_id/approved/decision) → rejeitados", () => {
  // Regressão do drift fechado: esses campos nunca foram lidos pelo handler
  // nem enviados por nenhum chamador real — agora corretamente rejeitados
  // (schema .strict()) em vez de aceitos silenciosamente.
  const r = ApprovePasswordResetV1Schema.safeParse({
    action: "approve",
    reset_id: UUID,
    request_id: UUID,
    approved: true,
    decision: "ok",
  });
  assertEquals(r.success, false);
});

Deno.test("Contract: approve-password-reset v1 — campo extra desconhecido → rejeitado (.strict())", () => {
  assertEquals(ApprovePasswordResetV1Schema.safeParse({ requestId: UUID, action: "approve", hack: true }).success, false);
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

Deno.test("Contract: approve-password-reset v1 — gate: payload válido → ok", () => {
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

Deno.test("Contract: approve-password-reset v1 — sem guarda 400 manual (gate 422 já reprova)", () => {
  // Regressão do drift fechado: o bloco 400 manual foi removido do
  // index.ts — requestId/action ausentes ou inválidos agora batem no
  // gate 422 canônico (parseOrReject), nunca chegam a esta função.
  assertEquals(/Guarda de compatibilidade/.test(SOURCE), false);
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

// ─── Email com link REAL (Etapa 55 — gap fechado nesta rodada) ──────────────

Deno.test("Contract: approve-password-reset v1 — aprovação ENVIA email com o link real (Resend)", () => {
  // O link gerado (action_link) precisa chegar ao usuário — antes, a EF
  // devolvia o link ao caller e NINGUÉM enviava email (toast mentia).
  assertMatch(SOURCE, /api\.resend\.com\/emails/);
  assertMatch(SOURCE, /action_link|actionLink/);
  assertMatch(SOURCE, /RESEND_API_KEY/);
  // O email usa o endereço do solicitante (resetRequest.email), nunca outro.
  assertMatch(SOURCE, /resetRequest\.email/);
});

Deno.test("Contract: approve-password-reset v1 — falha de email NÃO derruba a aprovação (emailSent: false)", () => {
  // Modo de falha documentado no header da EF: aprovação persiste mesmo sem
  // email — resposta carrega emailSent para o caller decidir o UX.
  assertMatch(SOURCE, /let emailSent = false/); // default: não enviado
  const emailBlock = extractBlock(SOURCE, "let emailSent = false", { until: "log.done", maxSize: 4000 });
  assertMatch(emailBlock, /try\s*\{/); // envio protegido
  assertMatch(emailBlock, /catch/); // falha capturada, não lançada
  // Aprovação persiste: resposta ainda é success com a flag emailSent.
  assertMatch(SOURCE, /success: true,?\s*emailSent/);
});
