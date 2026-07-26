/**
 * Tests para validation.ts - Schemas Zod centralizados
 */
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Re-import direto do schema (evita problemas com paths)
import {
  sendMessageSchema,
  createContactSchema,
  retryConfigSchema,
  validateInput,
  safeValidateInput,
  messageContentSchema,
  contactPhoneSchema,
} from "../validation.ts";

Deno.test("messageContentSchema: deve aceitar mensagem válida", () => {
  const result = messageContentSchema.safeParse("Olá, tudo bem?");
  assertEquals(result.success, true);
});

Deno.test("messageContentSchema: deve rejeitar mensagem vazia", () => {
  const result = messageContentSchema.safeParse("");
  assertEquals(result.success, false);
});

Deno.test("messageContentSchema: deve rejeitar mensagem muito longa", () => {
  const result = messageContentSchema.safeParse("a".repeat(5000));
  assertEquals(result.success, false);
});

Deno.test("messageContentSchema: deve rejeitar só espaços", () => {
  const result = messageContentSchema.safeParse("     ");
  assertEquals(result.success, false);
});

Deno.test("contactPhoneSchema: deve aceitar telefone BR válido", () => {
  const result = contactPhoneSchema.safeParse("11999998888");
  assertEquals(result.success, true);
});

Deno.test("contactPhoneSchema: deve aceitar telefone com formatação", () => {
  const result = contactPhoneSchema.safeParse("(11) 99999-8888");
  assertEquals(result.success, true);
});

Deno.test("contactPhoneSchema: deve rejeitar telefone curto", () => {
  const result = contactPhoneSchema.safeParse("123");
  assertEquals(result.success, false);
});

Deno.test("sendMessageSchema: deve aceitar payload completo válido", () => {
  const result = sendMessageSchema.safeParse({
    contactId: "123e4567-e89b-12d3-a456-426614174000",
    content: "Olá!",
    messageType: "text",
  });
  assertEquals(result.success, true);
});

Deno.test("sendMessageSchema: deve rejeitar contactId inválido (não-UUID)", () => {
  const result = sendMessageSchema.safeParse({
    contactId: "not-a-uuid",
    content: "Olá!",
  });
  assertEquals(result.success, false);
});

Deno.test("sendMessageSchema: deve usar messageType default 'text'", () => {
  const result = sendMessageSchema.safeParse({
    contactId: "123e4567-e89b-12d3-a456-426614174000",
    content: "Olá!",
  });
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data.messageType, "text");
  }
});

Deno.test("createContactSchema: deve aceitar contato válido", () => {
  const result = createContactSchema.safeParse({
    name: "João Silva",
    phone: "11999998888",
    email: "joao@example.com",
    tags: [],
  });
  assertEquals(result.success, true);
});

Deno.test("createContactSchema: deve rejeitar sem nome", () => {
  const result = createContactSchema.safeParse({
    phone: "11999998888",
  });
  assertEquals(result.success, false);
});

Deno.test("createContactSchema: deve rejeitar mais de 50 tags", () => {
  const tags = Array(60).fill("123e4567-e89b-12d3-a456-426614174000");
  const result = createContactSchema.safeParse({
    name: "João",
    phone: "11999998888",
    tags,
  });
  assertEquals(result.success, false);
});

Deno.test("retryConfigSchema: deve aceitar config válida", () => {
  const result = retryConfigSchema.safeParse({
    maxRetries: 3,
    baseBackoffMs: 800,
    maxBackoffMs: 6000,
    timeoutMs: 30_000,
  });
  assertEquals(result.success, true);
});

Deno.test("retryConfigSchema: deve rejeitar maxBackoffMs < baseBackoffMs", () => {
  const result = retryConfigSchema.safeParse({
    maxRetries: 3,
    baseBackoffMs: 800,
    maxBackoffMs: 500, // < 800
    timeoutMs: 30_000,
  });
  assertEquals(result.success, false);
});

Deno.test("retryConfigSchema: deve rejeitar timeoutMs < baseBackoffMs", () => {
  const result = retryConfigSchema.safeParse({
    maxRetries: 3,
    baseBackoffMs: 800,
    maxBackoffMs: 6000,
    timeoutMs: 500, // < 800
  });
  assertEquals(result.success, false);
});

Deno.test("retryConfigSchema: deve rejeitar maxRetries > 10", () => {
  const result = retryConfigSchema.safeParse({
    maxRetries: 20,
    baseBackoffMs: 800,
    maxBackoffMs: 6000,
    timeoutMs: 30_000,
  });
  assertEquals(result.success, false);
});

Deno.test("validateInput: deve retornar data em caso de sucesso", () => {
  const data = validateInput(messageContentSchema, "Olá!");
  assertEquals(data, "Olá!");
});

Deno.test("validateInput: deve throw em caso de erro", () => {
  let threw = false;
  try {
    validateInput(messageContentSchema, "");
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test("safeValidateInput: deve retornar ok:true em caso de sucesso", () => {
  const result = safeValidateInput(messageContentSchema, "Olá!");
  assertEquals(result.ok, true);
});

Deno.test("safeValidateInput: deve retornar ok:false sem throw", () => {
  const result = safeValidateInput(messageContentSchema, "");
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertExists(result.error);
  }
});

Deno.test("sendMessageSchema: deve aceitar com mediaUrl", () => {
  const result = sendMessageSchema.safeParse({
    contactId: "123e4567-e89b-12d3-a456-426614174000",
    content: "Imagem",
    messageType: "image",
    mediaUrl: "https://example.com/image.jpg",
  });
  assertEquals(result.success, true);
});

Deno.test("sendMessageSchema: deve aceitar mediaPayload null", () => {
  const result = sendMessageSchema.safeParse({
    contactId: "123e4567-e89b-12d3-a456-426614174000",
    content: "Test",
    mediaPayload: null,
  });
  assertEquals(result.success, true);
});

Deno.test("createContactSchema: deve aceitar sem email (opcional)", () => {
  const result = createContactSchema.safeParse({
    name: "João",
    phone: "11999998888",
  });
  assertEquals(result.success, true);
});

Deno.test("createContactSchema: deve aceitar com tags vazias", () => {
  const result = createContactSchema.safeParse({
    name: "João",
    phone: "11999998888",
    tags: [],
  });
  assertEquals(result.success, true);
});
