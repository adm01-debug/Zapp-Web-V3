/**
 * Contract tests — elevenlabs-webhook@v1 / @v2.
 *
 * O endpoint consome type|event_type e id|request_id (evento é logado como
 * 'unknown' quando ausente). Schema PERMISSIVO: aceita {} e campos extras
 * (.passthrough()) — um 422 indevido em payload real do provedor causaria
 * perda de dados (regra de webhooks externos do contract-kit).
 *
 * Schema testado: ElevenLabsWebhookV1Schema / ElevenLabsWebhookV2Schema
 * (webhook-schemas.ts, re-exportados por contract-schemas.ts) — os MESMOS
 * usados em produção via parseOrReject('elevenlabs-webhook', ...).
 *
 * Casos: válido (type+id), válido (event_type+request_id numérico), mínimo
 * {}, campos extras (passthrough), null/undefined, tipos errados, V2.
 */
import { assertEquals } from "jsr:@std/assert";
import {
  ElevenLabsWebhookV1Schema,
  ElevenLabsWebhookV2Schema,
} from "../../_shared/contract-schemas.ts";

Deno.test("Contract: elevenlabs-webhook v1 — payload válido (type + id)", () => {
  const payload = { type: "conversation.completed", id: "conv_abc123" };
  const result = ElevenLabsWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: elevenlabs-webhook v1 — payload válido (event_type + request_id numérico)", () => {
  const payload = { event_type: "run.completed", request_id: 123456 };
  const result = ElevenLabsWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: elevenlabs-webhook v1 — payload mínimo {} é aceito (permissivo)", () => {
  // Comportamento preservado do index.ts: evento ausente → logado como
  // 'unknown' e processado normalmente.
  const result = ElevenLabsWebhookV1Schema.safeParse({});
  assertEquals(result.success, true);
});

Deno.test("Contract: elevenlabs-webhook v1 — payload com error é aceito", () => {
  const payload = { type: "conversation.completed", id: "conv_1", error: { code: 500, msg: "boom" } };
  const result = ElevenLabsWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: elevenlabs-webhook v1 — campos extras são aceitos (passthrough)", () => {
  const payload = {
    type: "conversation.completed",
    id: "conv_1",
    unknown_future_field: { nested: [1, 2, { deep: true }] },
  };
  const result = ElevenLabsWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: elevenlabs-webhook v1 — null é rejeitado", () => {
  const result = ElevenLabsWebhookV1Schema.safeParse(null);
  assertEquals(result.success, false);
});

Deno.test("Contract: elevenlabs-webhook v1 — undefined é rejeitado", () => {
  const result = ElevenLabsWebhookV1Schema.safeParse(undefined);
  assertEquals(result.success, false);
});

Deno.test("Contract: elevenlabs-webhook v1 — inválido: type com tipo errado (number)", () => {
  const payload = { type: 42 };
  const result = ElevenLabsWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, false);
});

Deno.test("Contract: elevenlabs-webhook v1 — inválido: id com tipo não suportado (objeto)", () => {
  const payload = { type: "conversation.completed", id: { nested: true } };
  const result = ElevenLabsWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, false);
});

Deno.test("Contract: elevenlabs-webhook v1 — inválido: type acima do limite (100 chars)", () => {
  const payload = { type: "x".repeat(101) };
  const result = ElevenLabsWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, false);
});

Deno.test("Contract: elevenlabs-webhook v2 — payload completo válido", () => {
  const payload = {
    version: "2.0",
    timestamp: 1785845494000,
    type: "conversation.completed",
    id: "conv_1",
  };
  const result = ElevenLabsWebhookV2Schema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: elevenlabs-webhook v2 — inválido: timestamp ausente", () => {
  const result = ElevenLabsWebhookV2Schema.safeParse({ version: "2.0", type: "x" });
  assertEquals(result.success, false);
});

Deno.test("Contract: elevenlabs-webhook v2 — inválido: version não suportada (3.0)", () => {
  const payload = { version: "3.0", timestamp: 1 };
  const result = ElevenLabsWebhookV2Schema.safeParse(payload);
  assertEquals(result.success, false);
});
