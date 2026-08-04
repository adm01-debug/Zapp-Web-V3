/**
 * Contract tests — ai-suggest-reply.
 *
 * STEP 4B: ai-suggest-reply/index.ts agora é um proxy que encaminha para o
 * ai-router com action="suggest_reply". O contrato de payload é validado pelo
 * AiSuggestReplySchema (_shared/schemas.ts:34) no handler do router.
 *
 * Cobertura:
 *   - conversationHistory vazio → falha (min: 1)
 *   - conversationHistory > 50 → falha (max: 50)
 *   - sem requestId → falha (obrigatório)
 *   - campos extras → comportamento real (schema permissivo, sem .strict())
 *   - edge cases: role inválido, content > 10000, requestId > 256
 *
 * Rodar: deno test --allow-net --allow-env --allow-read supabase/functions/ai-suggest-reply/__tests__/contract.test.ts
 */

import { assertEquals, assert, assertMatch } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { AiSuggestReplySchema } from "../../_shared/schemas.ts";
import { readSourceFrom } from "../../_shared/test-helpers.ts";

const SOURCE = await readSourceFrom(import.meta.url, "../index.ts");

const msg = (role: string, content: string) => ({ role, content });

// ─── Válidos ────────────────────────────────────────────────────────────────

Deno.test("Contract: AiSuggestReply — payload válido (1 msg + requestId)", () => {
  const result = AiSuggestReplySchema.safeParse({
    conversationHistory: [msg("user", "oi")],
    requestId: "req_1",
  });
  assertEquals(result.success, true);
});

Deno.test("Contract: AiSuggestReply — payload válido com contactId UUID + context", () => {
  const result = AiSuggestReplySchema.safeParse({
    contactId: "3f0c8a4e-1b2d-4c5e-9f6a-7b8c9d0e1f2a",
    conversationHistory: [msg("user", "oi"), msg("assistant", "olá")],
    context: "cliente VIP",
    requestId: "req_2",
  });
  assertEquals(result.success, true);
});

Deno.test("Contract: AiSuggestReply — 50 msgs (limite max) aceito", () => {
  const result = AiSuggestReplySchema.safeParse({
    conversationHistory: Array.from({ length: 50 }, (_, i) => msg("user", `m${i}`)),
    requestId: "req_50",
  });
  assertEquals(result.success, true);
});

// ─── conversationHistory vazio → falha (min: 1) ─────────────────────────────

Deno.test("Contract: AiSuggestReply — conversationHistory vazio deve falhar (min: 1)", () => {
  const result = AiSuggestReplySchema.safeParse({
    conversationHistory: [],
    requestId: "req_1",
  });
  assertEquals(result.success, false);
  const issue = result.success ? null : result.error.issues.find(i => i.path[0] === "conversationHistory");
  assert(issue, "deveria haver issue em conversationHistory");
  assertEquals(issue.message, "Conversation history cannot be empty");
});

Deno.test("Contract: AiSuggestReply — sem conversationHistory deve falhar", () => {
  const result = AiSuggestReplySchema.safeParse({ requestId: "req_1" });
  assertEquals(result.success, false);
});

// ─── conversationHistory > 50 → falha (max: 50) ─────────────────────────────

Deno.test("Contract: AiSuggestReply — conversationHistory com 51 msgs deve falhar (max: 50)", () => {
  const result = AiSuggestReplySchema.safeParse({
    conversationHistory: Array.from({ length: 51 }, () => msg("user", "x")),
    requestId: "req_51",
  });
  assertEquals(result.success, false);
  const issue = result.success ? null : result.error.issues.find(i => i.path[0] === "conversationHistory");
  assert(issue, "deveria haver issue em conversationHistory");
  assert(String(issue.message).includes("50"), `mensagem inesperada: ${issue.message}`);
});

// ─── sem requestId → falha ──────────────────────────────────────────────────

Deno.test("Contract: AiSuggestReply — sem requestId deve falhar (obrigatório)", () => {
  const result = AiSuggestReplySchema.safeParse({
    conversationHistory: [msg("user", "oi")],
  });
  assertEquals(result.success, false);
  const issue = result.success ? null : result.error.issues.find(i => i.path[0] === "requestId");
  assert(issue, "deveria haver issue em requestId");
  assertEquals(issue.code, "invalid_type");
});

Deno.test("Contract: AiSuggestReply — requestId vazio é aceito pelo schema (sem min(1))", () => {
  // Comportamento REAL: requestId só tem .max(256), sem .min(1) — "" passa no
  // schema. O ai-router limpa requestId vazio na camada de idempotência
  // (PHASE 4: rawRequestId.trim() → "" → idempotência desabilitada).
  const result = AiSuggestReplySchema.safeParse({
    conversationHistory: [msg("user", "oi")],
    requestId: "",
  });
  assertEquals(result.success, true);
});

// ─── campos extras ──────────────────────────────────────────────────────────

Deno.test("Contract: AiSuggestReply — campos extras: schema permissivo (sem .strict()) aceita", () => {
  // GAP CONHECIDO: AiSuggestReplySchema NÃO usa .strict() — campos extras
  // passam na validação atual. Teste documenta o comportamento REAL; se o
  // schema ganhar .strict() num follow-up, este teste deve ser invertido.
  const result = AiSuggestReplySchema.safeParse({
    conversationHistory: [msg("user", "oi")],
    requestId: "req_1",
    campoExtra: "valor",
  });
  assertEquals(result.success, true);
});

// ─── Edge cases ─────────────────────────────────────────────────────────────

Deno.test("Contract: AiSuggestReply — role inválido deve falhar (enum fechado)", () => {
  const result = AiSuggestReplySchema.safeParse({
    conversationHistory: [msg("bot", "oi")],
    requestId: "req_1",
  });
  assertEquals(result.success, false);
  const issue = result.success ? null : result.error.issues.find(i => i.path[0] === "conversationHistory");
  assert(issue, "deveria haver issue em conversationHistory");
  assert(String(issue.message).includes("Invalid enum value"), `mensagem inesperada: ${issue.message}`);
});

Deno.test("Contract: AiSuggestReply — content acima de 10000 chars deve falhar", () => {
  const result = AiSuggestReplySchema.safeParse({
    conversationHistory: [msg("user", "x".repeat(10_001))],
    requestId: "req_1",
  });
  assertEquals(result.success, false);
});

Deno.test("Contract: AiSuggestReply — requestId acima de 256 chars deve falhar", () => {
  const result = AiSuggestReplySchema.safeParse({
    conversationHistory: [msg("user", "oi")],
    requestId: "r".repeat(257),
  });
  assertEquals(result.success, false);
});

Deno.test("Contract: AiSuggestReply — contactId não-UUID deve falhar", () => {
  const result = AiSuggestReplySchema.safeParse({
    contactId: "abc",
    conversationHistory: [msg("user", "oi")],
    requestId: "req_1",
  });
  assertEquals(result.success, false);
});

Deno.test("Contract: AiSuggestReply — payload vazio {} deve falhar", () => {
  const result = AiSuggestReplySchema.safeParse({});
  assertEquals(result.success, false);
});

Deno.test("Contract: AiSuggestReply — mensagens sem role devem falhar", () => {
  const result = AiSuggestReplySchema.safeParse({
    conversationHistory: [{ content: "oi" }],
    requestId: "req_1",
  });
  assertEquals(result.success, false);
});

// ─── Fonte: proxy encaminha com action=suggest_reply ────────────────────────

Deno.test("Contract: ai-suggest-reply — index.ts encaminha para ai-router com action=suggest_reply", () => {
  assertMatch(SOURCE, /action: "suggest_reply"/);
  assertMatch(SOURCE, /AI_ROUTER_URL/);
  assertMatch(SOURCE, /body: JSON\.stringify\(\{ \.\.\.body, action: "suggest_reply" \}\)/);
});

Deno.test("Contract: ai-suggest-reply — exige Authorization (proxy autenticado)", () => {
  assertMatch(SOURCE, /if \(!authHeader\) return errorResponse\("Unauthorized", 401, req\)/);
});
