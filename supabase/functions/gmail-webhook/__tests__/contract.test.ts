/**
 * Contract tests — gmail-webhook@v1 / @v2.
 *
 * O endpoint aceita DUAS formas: (a) push do Google Pub/Sub
 * ({ message: { data: base64, messageId, publishTime }, subscription })
 * e (b) chamada interna com action (ex.: registerWatch) + accountId.
 * Schema permissivo (.passthrough()/.nullish()) — nunca derrubar ingestão
 * por campo novo do Google.
 *
 * Schema testado: GmailWebhookV1Schema / GmailWebhookV2Schema
 * (webhook-schemas.ts, re-exportados por contract-schemas.ts) — os MESMOS
 * usados em produção, não mocks.
 *
 * Casos: push válido, chamada interna, message.data ausente, payload vazio,
 * null, tipos errados, campos extras, V2 (válido / timestamp ausente).
 */
import { assertEquals } from "jsr:@std/assert";
import {
  GmailWebhookV1Schema,
  GmailWebhookV2Schema,
} from "../../_shared/contract-schemas.ts";

const PUBSUB_PUSH = {
  message: {
    data: "eyJlbWFpbEFkZHJlc3MiOiJhQGIuY29tIiwiZXZlbnRUeXBlIjoiTUVTU0FHRV9SRUNFSVZFRCJ9",
    messageId: "message-id-1",
    publishTime: "2026-08-04T12:00:00.000Z",
  },
  subscription: "projects/my-project/subscriptions/gmail-push",
};

Deno.test("Contract: gmail-webhook v1 — payload Pub/Sub push válido", () => {
  const result = GmailWebhookV1Schema.safeParse(PUBSUB_PUSH);
  assertEquals(result.success, true);
});

Deno.test("Contract: gmail-webhook v1 — push com campos extras do Google é aceito (passthrough)", () => {
  const payload = { ...PUBSUB_PUSH, message: { ...PUBSUB_PUSH.message, attributes: { key: "v" } } };
  const result = GmailWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: gmail-webhook v1 — chamada interna válida (action + accountId)", () => {
  const payload = { action: "registerWatch", accountId: "acc_123" };
  const result = GmailWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: gmail-webhook v1 — message.data ausente é aceito (nullish)", () => {
  const payload = { message: { messageId: "message-id-1" }, subscription: "sub_1" };
  const result = GmailWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: gmail-webhook v1 — message ausente (só subscription) é aceito (nullish)", () => {
  const result = GmailWebhookV1Schema.safeParse({ subscription: "sub_1" });
  assertEquals(result.success, true);
});

Deno.test("Contract: gmail-webhook v1 — payload vazio {} é aceito (permissivo)", () => {
  const result = GmailWebhookV1Schema.safeParse({});
  assertEquals(result.success, true);
});

Deno.test("Contract: gmail-webhook v1 — null é rejeitado", () => {
  const result = GmailWebhookV1Schema.safeParse(null);
  assertEquals(result.success, false);
});

Deno.test("Contract: gmail-webhook v1 — undefined é rejeitado", () => {
  const result = GmailWebhookV1Schema.safeParse(undefined);
  assertEquals(result.success, false);
});

Deno.test("Contract: gmail-webhook v1 — message com tipo errado (string) é rejeitado", () => {
  const payload = { message: "not-an-object" };
  const result = GmailWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, false);
});

Deno.test("Contract: gmail-webhook v1 — message.data com tipo errado (number) é rejeitado", () => {
  const payload = { message: { data: 12345 } };
  const result = GmailWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, false);
});

Deno.test("Contract: gmail-webhook v1 — action com tipo errado (number) é rejeitado", () => {
  const payload = { action: 42 };
  const result = GmailWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, false);
});

// SEC-1 (2026-08-21): action arbitrário diferente de 'registerWatch' era
// aceito pelo schema antigo (z.string().max(100)) e, no handler, pulava a
// checagem de token PORQUE o guard antigo era `if (!action)` — qualquer
// string truthy escapava. O enum fecha isso na camada de contrato; o
// handler (index.ts) foi corrigido em paralelo para `action !== 'registerWatch'`.
Deno.test("Contract: gmail-webhook v1 — action arbitrário (bypass de auth, SEC-1) é rejeitado", () => {
  const payload = { action: "x", message: { data: "eyJlbWFpbEFkZHJlc3MiOiJ2aWN0aW1AeC5jb20ifQ==" } };
  const result = GmailWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, false);
});

Deno.test("Contract: gmail-webhook v1 — action 'renewWatch' inexistente é rejeitado (só 'registerWatch' existe)", () => {
  const result = GmailWebhookV1Schema.safeParse({ action: "renewWatch", accountId: "acc_1" });
  assertEquals(result.success, false);
});

Deno.test("Contract: gmail-webhook v2 — payload completo válido", () => {
  const payload = {
    version: "2.0",
    timestamp: 1785845494000,
    environment: "production",
    ...PUBSUB_PUSH,
  };
  const result = GmailWebhookV2Schema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: gmail-webhook v2 — inválido: timestamp ausente", () => {
  const payload = { version: "2.0", ...PUBSUB_PUSH };
  const result = GmailWebhookV2Schema.safeParse(payload);
  assertEquals(result.success, false);
});

Deno.test("Contract: gmail-webhook v2 — inválido: version não suportada (3.0)", () => {
  const payload = { version: "3.0", timestamp: 1, ...PUBSUB_PUSH };
  const result = GmailWebhookV2Schema.safeParse(payload);
  assertEquals(result.success, false);
});
