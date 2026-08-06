/**
 * Contract tests — chatbot-l1.
 *
 * Schema real: ChatbotL1V1Schema = ChatbotL1Schema.strict() (_shared/schemas.ts:160) — usado
 * via parseOrReject('chatbot-l1', CONTRACT_SCHEMAS['chatbot-l1']) no index.ts → 422 unificado.
 * Contrato: { contactId: uuid (obrigatório), message: string 1..10000 (obrigatório), connectionId?: string ≤200 }.
 *
 * Rodar: deno test --allow-net --allow-env --allow-read supabase/functions/chatbot-l1/__tests__/contract.test.ts
 */

import { assertEquals, assert } from "jsr:@std/assert";
import { ChatbotL1Schema } from "../../_shared/schemas.ts";
import { readSourceFrom } from "../../_shared/test-helpers.ts";

const SOURCE = await readSourceFrom(import.meta.url, "../index.ts");
const UUID = "3f0c8a4e-1b2d-4c5e-9f6a-7b8c9d0e1f2a";

// ─── Válidos ────────────────────────────────────────────────────────────────

Deno.test("Contract: ChatbotL1 — payload válido (message + contactId)", () => {
  const result = ChatbotL1Schema.safeParse({
    contactId: UUID,
    message: "Olá, preciso de ajuda",
  });
  assertEquals(result.success, true);
});

Deno.test("Contract: ChatbotL1 — payload válido com connectionId", () => {
  const result = ChatbotL1Schema.safeParse({
    contactId: UUID,
    message: "oi",
    connectionId: "conn_1",
  });
  assertEquals(result.success, true);
});

Deno.test("Contract: ChatbotL1 — message com 10000 chars (limite max) aceito", () => {
  const result = ChatbotL1Schema.safeParse({
    contactId: UUID,
    message: "x".repeat(10_000),
  });
  assertEquals(result.success, true);
});

// ─── Tipos incorretos ───────────────────────────────────────────────────────

Deno.test("Contract: ChatbotL1 — contactId ausente deve falhar", () => {
  const result = ChatbotL1Schema.safeParse({ message: "oi" });
  assertEquals(result.success, false);
  const issue = result.success ? null : result.error.issues.find(i => i.path[0] === "contactId");
  assert(issue, "deveria haver issue em contactId");
  assertEquals(issue.code, "invalid_type");
});

Deno.test("Contract: ChatbotL1 — contactId não-UUID deve falhar", () => {
  const result = ChatbotL1Schema.safeParse({ contactId: "123", message: "oi" });
  assertEquals(result.success, false);
  const issue = result.success ? null : result.error.issues.find(i => i.path[0] === "contactId");
  assert(issue, "deveria haver issue em contactId");
  assertEquals(issue.message, "Invalid uuid");
});

Deno.test("Contract: ChatbotL1 — contactId tipo errado (number) deve falhar", () => {
  const result = ChatbotL1Schema.safeParse({ contactId: 42, message: "oi" });
  assertEquals(result.success, false);
});

Deno.test("Contract: ChatbotL1 — message ausente deve falhar", () => {
  const result = ChatbotL1Schema.safeParse({ contactId: UUID });
  assertEquals(result.success, false);
});

Deno.test("Contract: ChatbotL1 — message vazio deve falhar (min: 1)", () => {
  const result = ChatbotL1Schema.safeParse({ contactId: UUID, message: "" });
  assertEquals(result.success, false);
});

Deno.test("Contract: ChatbotL1 — message > 10000 deve falhar (max: 10000)", () => {
  const result = ChatbotL1Schema.safeParse({ contactId: UUID, message: "x".repeat(10_001) });
  assertEquals(result.success, false);
});

Deno.test("Contract: ChatbotL1 — message tipo errado (array) deve falhar", () => {
  const result = ChatbotL1Schema.safeParse({ contactId: UUID, message: ["oi"] });
  assertEquals(result.success, false);
});

Deno.test("Contract: ChatbotL1 — payload vazio {} deve falhar", () => {
  const result = ChatbotL1Schema.safeParse({});
  assertEquals(result.success, false);
  assert(!result.success && result.error.issues.length >= 2, "{} deveria falhar em contactId e message");
});

// ─── Comportamento do schema (permissivo em extras) ─────────────────────────

Deno.test("Contract: ChatbotL1 — campos extras são aceitos (sem .strict())", () => {
  // GAP CONHECIDO: ChatbotL1Schema não usa .strict() — campos extras passam.
  const result = ChatbotL1Schema.safeParse({
    contactId: UUID,
    message: "oi",
    hack: { tentativa: true },
  });
  assertEquals(result.success, true);
});

// ─── Fonte: index.ts valida com ChatbotL1V1Schema via parseOrReject ─────────

Deno.test("Contract: ChatbotL1 — index.ts valida com parseOrReject + CONTRACT_SCHEMAS['chatbot-l1']", () => {
  assertMatchSource(/parseOrReject\('chatbot-l1', CONTRACT_SCHEMAS\['chatbot-l1'\]/);
  assertMatchSource(/CONTRACT_SCHEMAS\[/);
});

Deno.test("Contract: ChatbotL1 — falha de validação responde 422 via parsed.response", () => {
  assertMatchSource(/if \(!parsed\.ok\) return parsed\.response/);
});

function assertMatchSource(pattern: RegExp): void {
  assert(pattern.test(SOURCE), `padrão não encontrado no index.ts: ${pattern}`);
}
