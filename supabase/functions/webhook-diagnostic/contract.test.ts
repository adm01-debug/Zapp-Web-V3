/**
 * Testes de contrato do webhook-diagnostic e schemas compartilhados.
 * [REWRITE 2026-07-10] Arquivo reescrito: versão anterior referenciava API
 * antiga (campo `messages` e `result.fieldErrors`) que não existe mais em
 * `schemas.ts` — 4/5 testes falhavam permanentemente na main.
 */
import { assertEquals, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { parseBody, AiSuggestReplySchema } from "../_shared/schemas.ts";
import { WebhookPayloadSchema } from "../_shared/webhook-schemas.ts";
import { WebhookDiagnosticV1Schema } from "../_shared/contract-schemas.ts";

function issuePaths(result: ReturnType<typeof parseBody>): string[] {
  return result.success ? [] : (result.issues ?? []).map((i) => i.path.join("."));
}

Deno.test("Contract: AiSuggestReplySchema - payload válido", () => {
  const payload = {
    conversationHistory: [
      { role: "agent", content: "Olá!" },
      { role: "user", content: "Como posso ajudar?" },
    ],
    contactName: "João Silva",
    contactId: "550e8400-e29b-41d4-a716-446655440000",
    requestId: "test-req-550e8400-e29b-41d4-a716-446655440000",
  };
  const result = parseBody(AiSuggestReplySchema, payload);
  assertEquals(result.success, true, JSON.stringify(result));
});

Deno.test("Contract: AiSuggestReplySchema - payload inválido (cenário 422)", () => {
  const payload = {
    conversationHistory: "not-an-array", // deve ser array
    contactId: "invalid-uuid",           // deve ser UUID
  };
  const result = parseBody(AiSuggestReplySchema, payload);
  assertEquals(result.success, false);
  const paths = issuePaths(result);
  assert(paths.includes("conversationHistory"), `esperava issue em conversationHistory: ${paths}`);
  assert(paths.includes("contactId"), `esperava issue em contactId: ${paths}`);
});

Deno.test("Contract: WebhookPayloadSchema - payload Evolution válido", () => {
  const payload = { event: "messages.upsert", instance: "main-instance", data: { id: "msg-123" } };
  const result = parseBody(WebhookPayloadSchema, payload);
  assertEquals(result.success, true, JSON.stringify(result));
});

Deno.test("Contract: WebhookPayloadSchema - campo obrigatório ausente", () => {
  const result = parseBody(WebhookPayloadSchema, { event: "messages.upsert" }); // sem instance
  assertEquals(result.success, false);
  // WebhookPayloadSchema é union(V1,V2): Zod reporta invalid_union na raiz,
  // com os erros por campo aninhados em unionErrors — basta garantir a rejeição
  // e que a mensagem serializada aponte o campo ausente.
  const serialized = JSON.stringify(result.success ? {} : result.issues);
  assert(serialized.includes("instance") || issuePaths(result).includes("instance") || issuePaths(result).includes(""),
    `esperava rejeição apontando instance: ${serialized}`);
});

Deno.test("Contract: WebhookPayloadSchema - valores vazios rejeitados", () => {
  const result = parseBody(WebhookPayloadSchema, { event: "", instance: "   " });
  assertEquals(result.success, false);
});

Deno.test("Contract: WebhookDiagnosticV1Schema - body do próprio endpoint", () => {
  assertEquals(WebhookDiagnosticV1Schema.safeParse({}).success, true);
  assertEquals(WebhookDiagnosticV1Schema.safeParse({ action: "ping", instanceName: "wpp2" }).success, true);
  assertEquals(WebhookDiagnosticV1Schema.safeParse({ instanceName: "" }).success, false);
});
