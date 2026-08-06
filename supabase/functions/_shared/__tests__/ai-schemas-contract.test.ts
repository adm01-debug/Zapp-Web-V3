/**
 * Contract tests — TODOS os schemas AI/ML em _shared/schemas.ts.
 *
 * Cada schema: casos válidos, inválidos e edge cases via safeParse().
 * Fontes de verdade (não inventadas):
 *   - AiSuggestReplySchema      → _shared/schemas.ts:34 (ai-router suggest_reply)
 *   - AiConversationSummarySchema → _shared/schemas.ts:22 (ai-router conversation_summary)
 *   - AiAutoTagSchema           → _shared/schemas.ts:113
 *   - AiChurnAnalysisSchema     → _shared/schemas.ts:120
 *   - AiClassifyTicketsSchema   → _shared/schemas.ts:125
 *   - AiConversationAnalysisSchema → _shared/schemas.ts:130
 *   - AiEnhanceMessageSchema    → _shared/schemas.ts:137
 *   - TranscribeAudioSchema     → _shared/schemas.ts:144
 *   - ClassifyEmojiSchema / ClassifyStickerSchema / ClassifyAudioMemeSchema
 *
 * Rodar: deno test --allow-net --allow-env --allow-read supabase/functions/_shared/__tests__/ai-schemas-contract.test.ts
 */

import { assertEquals, assert } from "jsr:@std/assert";
import {
  AiSuggestReplySchema,
  AiConversationSummarySchema,
  AiAutoTagSchema,
  AiChurnAnalysisSchema,
  AiClassifyTicketsSchema,
  AiConversationAnalysisSchema,
  AiEnhanceMessageSchema,
  TranscribeAudioSchema,
  ClassifyEmojiSchema,
  ClassifyStickerSchema,
  ClassifyAudioMemeSchema,
  z,
} from "../schemas.ts";

const UUID = "3f0c8a4e-1b2d-4c5e-9f6a-7b8c9d0e1f2a";
const msg = (role: string, content: string) => ({ role, content });

// ─── AiSuggestReplySchema ───────────────────────────────────────────────────

Deno.test("Contract: AiSuggestReply — payload válido (1 msg + requestId)", () => {
  const result = AiSuggestReplySchema.safeParse({
    conversationHistory: [msg("user", "oi")],
    requestId: "req_1",
  });
  assertEquals(result.success, true);
});

Deno.test("Contract: AiSuggestReply — 50 msgs (limite max) aceito", () => {
  const result = AiSuggestReplySchema.safeParse({
    conversationHistory: Array.from({ length: 50 }, (_, i) =>
      msg(i % 2 === 0 ? "user" : "assistant", `msg ${i}`)
    ),
    requestId: "req_50",
  });
  assertEquals(result.success, true);
});

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

Deno.test("Contract: AiSuggestReply — conversationHistory > 50 deve falhar (max: 50)", () => {
  const result = AiSuggestReplySchema.safeParse({
    conversationHistory: Array.from({ length: 51 }, () => msg("user", "x")),
    requestId: "req_51",
  });
  assertEquals(result.success, false);
  const issue = result.success ? null : result.error.issues.find(i => i.path[0] === "conversationHistory");
  assert(issue, "deveria haver issue em conversationHistory");
  assert(issue.message.includes("50"), `mensagem inesperada: ${issue.message}`);
});

Deno.test("Contract: AiSuggestReply — sem requestId deve falhar (obrigatório)", () => {
  const result = AiSuggestReplySchema.safeParse({
    conversationHistory: [msg("user", "oi")],
  });
  assertEquals(result.success, false);
  const issue = result.success ? null : result.error.issues.find(i => i.path[0] === "requestId");
  assert(issue, "deveria haver issue em requestId");
  assertEquals(issue.code, "invalid_type");
});

Deno.test("Contract: AiSuggestReply — requestId acima de 256 chars deve falhar", () => {
  const result = AiSuggestReplySchema.safeParse({
    conversationHistory: [msg("user", "oi")],
    requestId: "r".repeat(257),
  });
  assertEquals(result.success, false);
});

Deno.test("Contract: AiSuggestReply — role inválido deve falhar (enum fechado)", () => {
  const result = AiSuggestReplySchema.safeParse({
    conversationHistory: [msg("bot", "oi")],
    requestId: "req_1",
  });
  assertEquals(result.success, false);
  const issue = result.success ? null : result.error.issues.find(i => i.path[0] === "conversationHistory");
  assert(issue, "deveria haver issue em conversationHistory");
  assertEquals(issue.message, "Invalid enum value. Expected 'user' | 'assistant' | 'system' | 'agent' | 'client', received 'bot'");
});

Deno.test("Contract: AiSuggestReply — content acima de 10000 chars deve falhar", () => {
  const result = AiSuggestReplySchema.safeParse({
    conversationHistory: [msg("user", "x".repeat(10_001))],
    requestId: "req_1",
  });
  assertEquals(result.success, false);
});

Deno.test("Contract: AiSuggestReply — contactId não-UUID deve falhar", () => {
  const result = AiSuggestReplySchema.safeParse({
    contactId: "123",
    conversationHistory: [msg("user", "oi")],
    requestId: "req_1",
  });
  assertEquals(result.success, false);
  const issue = result.success ? null : result.error.issues.find(i => i.path[0] === "contactId");
  assert(issue, "deveria haver issue em contactId");
  assertEquals(issue.message, "Invalid uuid");
});

Deno.test("Contract: AiSuggestReply — payload vazio {} deve falhar", () => {
  const result = AiSuggestReplySchema.safeParse({});
  assertEquals(result.success, false);
});

Deno.test("Contract: AiSuggestReply — campos extras: schema permissivo (sem .strict()) aceita", () => {
  // GAP CONHECIDO: AiSuggestReplySchema NÃO usa .strict() — campos extras passam.
  // Teste documenta o comportamento REAL do contrato (não o desejado).
  const result = AiSuggestReplySchema.safeParse({
    conversationHistory: [msg("user", "oi")],
    requestId: "req_1",
    extra: { qualquer: true },
  });
  assertEquals(result.success, true);
});

// ─── AiConversationSummarySchema ────────────────────────────────────────────

Deno.test("Contract: AiConversationSummary — payload válido (1 msg)", () => {
  const result = AiConversationSummarySchema.safeParse({
    messages: [msg("user", "oi")],
  });
  assertEquals(result.success, true);
});

Deno.test("Contract: AiConversationSummary — contactId UUID válido aceito", () => {
  const result = AiConversationSummarySchema.safeParse({
    contactId: UUID,
    messages: [msg("user", "oi")],
  });
  assertEquals(result.success, true);
});

Deno.test("Contract: AiConversationSummary — 200 msgs (limite max) aceito", () => {
  const result = AiConversationSummarySchema.safeParse({
    messages: Array.from({ length: 200 }, (_, i) => msg("user", `m${i}`)),
  });
  assertEquals(result.success, true);
});

Deno.test("Contract: AiConversationSummary — sem messages deve falhar", () => {
  const result = AiConversationSummarySchema.safeParse({ contactId: UUID });
  assertEquals(result.success, false);
  const issue = result.success ? null : result.error.issues.find(i => i.path[0] === "messages");
  assert(issue, "deveria haver issue em messages");
  assertEquals(issue.code, "invalid_type"); // campo ausente → "Required" (mensagem custom só vale para [])
  assertEquals(issue.message, "Required");
});

Deno.test("Contract: AiConversationSummary — messages vazio deve falhar (min: 1)", () => {
  const result = AiConversationSummarySchema.safeParse({ messages: [] });
  assertEquals(result.success, false);
});

Deno.test("Contract: AiConversationSummary — messages > 200 deve falhar (max: 200)", () => {
  const result = AiConversationSummarySchema.safeParse({
    messages: Array.from({ length: 201 }, () => msg("user", "x")),
  });
  assertEquals(result.success, false);
});

Deno.test("Contract: AiConversationSummary — role inválido deve falhar", () => {
  const result = AiConversationSummarySchema.safeParse({
    messages: [msg("robo", "oi")],
  });
  assertEquals(result.success, false);
});

Deno.test("Contract: AiConversationSummary — contactId não-UUID deve falhar", () => {
  const result = AiConversationSummarySchema.safeParse({
    contactId: "abc",
    messages: [msg("user", "oi")],
  });
  assertEquals(result.success, false);
});

Deno.test("Contract: AiConversationSummary — payload vazio {} deve falhar", () => {
  const result = AiConversationSummarySchema.safeParse({});
  assertEquals(result.success, false);
});

// ─── AiAutoTagSchema ────────────────────────────────────────────────────────

Deno.test("Contract: AiAutoTag — payload válido", () => {
  const result = AiAutoTagSchema.safeParse({
    contactId: UUID,
    messages: [msg("user", "oi")],
    requestId: "req_1",
  });
  assertEquals(result.success, true);
});

Deno.test("Contract: AiAutoTag — sem requestId deve falhar", () => {
  const result = AiAutoTagSchema.safeParse({
    contactId: UUID,
    messages: [msg("user", "oi")],
  });
  assertEquals(result.success, false);
});

Deno.test("Contract: AiAutoTag — messages vazio deve falhar", () => {
  const result = AiAutoTagSchema.safeParse({
    contactId: UUID,
    messages: [],
    requestId: "req_1",
  });
  assertEquals(result.success, false);
});

Deno.test("Contract: AiAutoTag — contactId ausente deve falhar", () => {
  const result = AiAutoTagSchema.safeParse({
    messages: [msg("user", "oi")],
    requestId: "req_1",
  });
  assertEquals(result.success, false);
});

// ─── AiChurnAnalysisSchema ──────────────────────────────────────────────────

Deno.test("Contract: AiChurnAnalysis — payload válido (1 contactId)", () => {
  const result = AiChurnAnalysisSchema.safeParse({ contactIds: [UUID] });
  assertEquals(result.success, true);
});

Deno.test("Contract: AiChurnAnalysis — contactIds vazio deve falhar (min: 1)", () => {
  const result = AiChurnAnalysisSchema.safeParse({ contactIds: [] });
  assertEquals(result.success, false);
});

Deno.test("Contract: AiChurnAnalysis — contactIds > 100 deve falhar (max: 100)", () => {
  const result = AiChurnAnalysisSchema.safeParse({
    contactIds: Array.from({ length: 101 }, () => UUID),
  });
  assertEquals(result.success, false);
});

Deno.test("Contract: AiChurnAnalysis — contactId não-UUID deve falhar", () => {
  const result = AiChurnAnalysisSchema.safeParse({ contactIds: ["abc"] });
  assertEquals(result.success, false);
});

Deno.test("Contract: AiChurnAnalysis — payload vazio {} deve falhar", () => {
  const result = AiChurnAnalysisSchema.safeParse({});
  assertEquals(result.success, false);
});

// ─── AiClassifyTicketsSchema ────────────────────────────────────────────────

Deno.test("Contract: AiClassifyTickets — payload vazio {} aceito (limit default 50)", () => {
  const result = AiClassifyTicketsSchema.safeParse({});
  assertEquals(result.success, true);
  if (result.success) assertEquals(result.data.limit, 50);
});

Deno.test("Contract: AiClassifyTickets — limit válido (1-200)", () => {
  const result = AiClassifyTicketsSchema.safeParse({ limit: 100 });
  assertEquals(result.success, true);
  if (result.success) assertEquals(result.data.limit, 100);
});

Deno.test("Contract: AiClassifyTickets — limit 0 deve falhar (min: 1)", () => {
  const result = AiClassifyTicketsSchema.safeParse({ limit: 0 });
  assertEquals(result.success, false);
});

Deno.test("Contract: AiClassifyTickets — limit 201 deve falhar (max: 200)", () => {
  const result = AiClassifyTicketsSchema.safeParse({ limit: 201 });
  assertEquals(result.success, false);
});

Deno.test("Contract: AiClassifyTickets — limit não-inteiro deve falhar", () => {
  const result = AiClassifyTicketsSchema.safeParse({ limit: 3.5 });
  assertEquals(result.success, false);
});

// ─── AiConversationAnalysisSchema ───────────────────────────────────────────

Deno.test("Contract: AiConversationAnalysis — payload válido", () => {
  const result = AiConversationAnalysisSchema.safeParse({
    contactId: UUID,
    messages: [msg("user", "oi")],
  });
  assertEquals(result.success, true);
});

Deno.test("Contract: AiConversationAnalysis — sem messages deve falhar", () => {
  const result = AiConversationAnalysisSchema.safeParse({ contactId: UUID });
  assertEquals(result.success, false);
});

Deno.test("Contract: AiConversationAnalysis — messages vazio deve falhar", () => {
  const result = AiConversationAnalysisSchema.safeParse({ messages: [] });
  assertEquals(result.success, false);
});

// ─── AiEnhanceMessageSchema ─────────────────────────────────────────────────

Deno.test("Contract: AiEnhanceMessage — payload válido (message + tone)", () => {
  const result = AiEnhanceMessageSchema.safeParse({
    message: "Olá, tudo bem?",
    tone: "professional",
  });
  assertEquals(result.success, true);
});

Deno.test("Contract: AiEnhanceMessage — tone inválido deve falhar (enum fechado)", () => {
  const result = AiEnhanceMessageSchema.safeParse({
    message: "oi",
    tone: "aggressive",
  });
  assertEquals(result.success, false);
  const issue = result.success ? null : result.error.issues.find(i => i.path[0] === "tone");
  assert(issue, "deveria haver issue em tone");
  assertEquals(issue.code, "invalid_enum_value");
});

Deno.test("Contract: AiEnhanceMessage — message vazio deve falhar (min: 1)", () => {
  const result = AiEnhanceMessageSchema.safeParse({ message: "" });
  assertEquals(result.success, false);
});

Deno.test("Contract: AiEnhanceMessage — message > 10000 deve falhar", () => {
  const result = AiEnhanceMessageSchema.safeParse({ message: "x".repeat(10_001) });
  assertEquals(result.success, false);
});

Deno.test("Contract: AiEnhanceMessage — payload vazio {} deve falhar", () => {
  const result = AiEnhanceMessageSchema.safeParse({});
  assertEquals(result.success, false);
});

// ─── TranscribeAudioSchema ──────────────────────────────────────────────────

Deno.test("Contract: TranscribeAudio — payload válido (audioUrl https público)", () => {
  const result = TranscribeAudioSchema.safeParse({
    audioUrl: "https://media.example.com/audio.mp3",
    messageId: "m1",
    enableDiarization: true,
  });
  assertEquals(result.success, true);
});

Deno.test("Contract: TranscribeAudio — payload vazio {} aceito (todos opcionais)", () => {
  const result = TranscribeAudioSchema.safeParse({});
  assertEquals(result.success, true);
});

Deno.test("Contract: TranscribeAudio — audioUrl http (não-https) deve falhar (SSRF guard)", () => {
  const result = TranscribeAudioSchema.safeParse({
    audioUrl: "http://media.example.com/audio.mp3",
  });
  assertEquals(result.success, false);
  const issue = result.success ? null : result.error.issues.find(i => i.path[0] === "audioUrl");
  assert(issue, "deveria haver issue em audioUrl");
  assertEquals(issue.message, "image_url must be a public HTTPS URL");
});

Deno.test("Contract: TranscribeAudio — audioUrl localhost deve falhar (SSRF guard)", () => {
  const result = TranscribeAudioSchema.safeParse({
    audioUrl: "https://localhost:3000/audio.mp3",
  });
  assertEquals(result.success, false);
});

Deno.test("Contract: TranscribeAudio — audioUrl não-URL deve falhar", () => {
  const result = TranscribeAudioSchema.safeParse({ audioUrl: "not-a-url" });
  assertEquals(result.success, false);
});

Deno.test("Contract: TranscribeAudio — enableDiarization tipo errado deve falhar", () => {
  const result = TranscribeAudioSchema.safeParse({ enableDiarization: "yes" });
  assertEquals(result.success, false);
});

// ─── ClassifyEmojiSchema / ClassifyStickerSchema / ClassifyAudioMemeSchema ──

const IMAGE_SCHEMAS: Array<{ name: string; schema: z.ZodTypeAny; urlField: string }> = [
  { name: "ClassifyEmoji", schema: ClassifyEmojiSchema, urlField: "image_url" },
  { name: "ClassifySticker", schema: ClassifyStickerSchema, urlField: "image_url" },
  { name: "ClassifyAudioMeme", schema: ClassifyAudioMemeSchema, urlField: "audio_url" }, // campo real: audio_url
];

for (const { name, schema, urlField } of IMAGE_SCHEMAS) {
  Deno.test(`Contract: ${name} — payload vazio {} aceito (todos opcionais)`, () => {
    assertEquals(schema.safeParse({}).success, true);
  });

  Deno.test(`Contract: ${name} — ${urlField} https público aceito`, () => {
    assertEquals(
      schema.safeParse({ [urlField]: "https://cdn.example.com/img.png" }).success,
      true,
    );
  });

  Deno.test(`Contract: ${name} — ${urlField} http deve falhar (SSRF guard)`, () => {
    const result = schema.safeParse({ [urlField]: "http://cdn.example.com/img.png" });
    assertEquals(result.success, false);
  });

  Deno.test(`Contract: ${name} — ${urlField} localhost deve falhar (SSRF guard)`, () => {
    assertEquals(schema.safeParse({ [urlField]: "https://127.0.0.1/img.png" }).success, false);
  });
}
