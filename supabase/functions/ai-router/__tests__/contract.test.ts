/**
 * Contract tests — ai-router (edge function unificada de AI/ML).
 *
 * O router não tem schema Zod no nível do corpo: ele extrai `action` de
 * `body.action` (PHASE 4) e roteia para o handler da ação, que valida o
 * payload via parseBody(<SchemaDaAcao>, body) — 422 em caso de falha.
 *
 * Este arquivo testa:
 *   1. O contrato de ROTEAMENTO (fonte): action obrigatória, switch fechado,
 *      body vazio {} → falha de roteamento.
 *   2. safeParse() dos schemas de ação consumidos pelo router (payload
 *      válido, payload sem campo obrigatório, payload vazio {}).
 *
 * Rodar: deno test --allow-net --allow-env --allow-read supabase/functions/ai-router/__tests__/contract.test.ts
 */

import { assertEquals, assert, assertMatch } from "jsr:@std/assert";
import {
  AiSuggestReplySchema,
  AiConversationSummarySchema,
  AiEnhanceMessageSchema,
  AiAutoTagSchema,
} from "../../_shared/schemas.ts";
import { readSourceFrom } from "../../_shared/test-helpers.ts";

const SOURCE = await readSourceFrom(import.meta.url, "../index.ts");
const UUID = "3f0c8a4e-1b2d-4c5e-9f6a-7b8c9d0e1f2a";

// ─── Roteamento (contrato no nível do router) ───────────────────────────────

Deno.test("Contract: ai-router — action é extraída de body.action (obrigatória)", () => {
  // PHASE 4: `action = String(body.action || "").toLowerCase().trim()`
  assertMatch(SOURCE, /String\(body\.action \|\| ""\)\.toLowerCase\(\)\.trim\(\)/);
});

Deno.test("Contract: ai-router — switch roteia as 10 ações conhecidas", () => {
  for (const action of [
    "auto_tag",
    "conversation_summary",
    "enhance_message",
    "classify_emoji",
    "classify_sticker",
    "churn_analysis",
    "conversation_analysis",
    "suggest_reply",
    "transcribe_audio",
    "classify_tickets",
  ]) {
    assertMatch(SOURCE, new RegExp(`case "${action}":`));
  }
});

Deno.test("Contract: ai-router — payload vazio {} não roteia (default → erro)", () => {
  // action vazia cai no `default:` → errorResponse("Action routing failed", 500)
  assertMatch(SOURCE, /default:\s*return errorResponse\("Action routing failed", 500, req\)/);
});

Deno.test("Contract: ai-router — action desconhecida → rota default (erro)", () => {
  assertMatch(SOURCE, /default:\s*return errorResponse\("Action routing failed", 500, req\)/);
});

Deno.test("Contract: ai-router — handlers validam via parseBody + schema da ação", () => {
  // handleSuggestReply valida com AiSuggestReplySchema e marca 422 em falha.
  assertMatch(SOURCE, /parseBody\(AiSuggestReplySchema, body\)/);
  assertMatch(SOURCE, /isValidationError: true/);
});

// ─── suggest_reply: payload da ação ─────────────────────────────────────────

Deno.test("Contract: ai-router suggest_reply — payload válido com histórico + requestId", () => {
  const result = AiSuggestReplySchema.safeParse({
    conversationHistory: [{ role: "user", content: "Olá, qual o prazo?" }],
    requestId: "req_abc",
  });
  assertEquals(result.success, true);
});

Deno.test("Contract: ai-router suggest_reply — sem requestId deve falhar", () => {
  const result = AiSuggestReplySchema.safeParse({
    conversationHistory: [{ role: "user", content: "oi" }],
  });
  assertEquals(result.success, false);
});

Deno.test("Contract: ai-router suggest_reply — payload vazio {} deve falhar", () => {
  const result = AiSuggestReplySchema.safeParse({});
  assertEquals(result.success, false);
});

// ─── conversation_summary: payload da ação ──────────────────────────────────

Deno.test("Contract: ai-router conversation_summary — payload válido com messages", () => {
  const result = AiConversationSummarySchema.safeParse({
    contactId: UUID,
    messages: [{ role: "user", content: "oi" }, { role: "assistant", content: "olá" }],
  });
  assertEquals(result.success, true);
});

Deno.test("Contract: ai-router conversation_summary — sem messages deve falhar", () => {
  const result = AiConversationSummarySchema.safeParse({ contactId: UUID });
  assertEquals(result.success, false);
});

Deno.test("Contract: ai-router conversation_summary — payload vazio {} deve falhar", () => {
  const result = AiConversationSummarySchema.safeParse({});
  assertEquals(result.success, false);
});

// ─── enhance_message: payload da ação ───────────────────────────────────────

Deno.test("Contract: ai-router enhance_message — payload válido com prompt (message + tone)", () => {
  const result = AiEnhanceMessageSchema.safeParse({
    message: "Pode me ajudar?",
    tone: "empathetic",
  });
  assertEquals(result.success, true);
});

Deno.test("Contract: ai-router enhance_message — sem message deve falhar", () => {
  const result = AiEnhanceMessageSchema.safeParse({ tone: "casual" });
  assertEquals(result.success, false);
});

Deno.test("Contract: ai-router enhance_message — payload vazio {} deve falhar", () => {
  const result = AiEnhanceMessageSchema.safeParse({});
  assertEquals(result.success, false);
});

// ─── auto_tag: payload da ação ──────────────────────────────────────────────

Deno.test("Contract: ai-router auto_tag — payload válido", () => {
  const result = AiAutoTagSchema.safeParse({
    contactId: UUID,
    messages: [{ role: "user", content: "oi" }],
    requestId: "req_1",
  });
  assertEquals(result.success, true);
});

Deno.test("Contract: ai-router auto_tag — payload vazio {} deve falhar", () => {
  const result = AiAutoTagSchema.safeParse({});
  assertEquals(result.success, false);
});

// ─── Resposta de validação: erros expõem path + mensagem ───────────────────

Deno.test("Contract: ai-router — erro de validação expõe issue com path", () => {
  const result = AiSuggestReplySchema.safeParse({});
  assert(!result.success);
  if (!result.success) {
    assert(result.error.issues.length > 0);
    const paths = result.error.issues.map(i => i.path.join("."));
    assert(paths.includes("requestId"), `faltou requestId nos issues: ${paths.join(", ")}`);
    assert(paths.includes("conversationHistory"), `faltou conversationHistory nos issues: ${paths.join(", ")}`);
  }
});
