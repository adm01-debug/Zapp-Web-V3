/**
 * Contract tests — whatsapp-webhook@v1.
 *
 * O endpoint consome o envelope da Meta Cloud API (object/entry/changes) e
 * valida com Zod estrito (sem .passthrough()/nullish): payload fora do
 * contrato é logado e respondido 200 + warning (sem retry do provedor).
 *
 * Schema testado: WhatsappWebhookV1Schema (webhook-schemas.ts) — o MESMO
 * schema que o index.ts usa (desde a consolidação do contrato), não um mock.
 *
 * Casos: válido (message), válido (delivery status), mínimo, campos
 * ausentes, tipos errados, array vazio, null/undefined, campos extras.
 */
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { WhatsappWebhookV1Schema, WhatsappWebhookV2Schema } from "../../_shared/webhook-schemas.ts";
import { parseOrReject } from "../../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../../_shared/contract-schemas.ts";

function entry(changes: unknown[]): Record<string, unknown> {
  return { id: "entry_1", changes };
}

function messagePayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    object: "whatsapp_business_account",
    entry: [entry([{ field: "messages", value: { messaging_product: "whatsapp" } }])],
    ...overrides,
  };
}

Deno.test("Contract: whatsapp-webhook v1 — payload válido (message received)", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{
      id: "0",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: {
            display_phone_number: "16505551111",
            phone_number_id: "123456",
          },
          messages: [{
            id: "wamid.ABC",
            from: "5511999999999",
            timestamp: "1722800000",
            type: "text",
            text: { body: "olá, tudo bem?" },
          }],
        },
      }],
    }],
  };
  const result = WhatsappWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: whatsapp-webhook v1 — payload válido (delivery status)", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{
      id: "0",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          statuses: [{
            id: "wamid.ABC",
            status: "delivered",
            timestamp: "1722800100",
            recipient_id: "5511999999999",
          }],
        },
      }],
    }],
  };
  const result = WhatsappWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: whatsapp-webhook v1 — payload mínimo aceito (value vazio, sem messages/statuses)", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{
      id: "0",
      changes: [{ field: "messages", value: {} }],
    }],
  };
  const result = WhatsappWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: whatsapp-webhook v1 — inválido: object ausente (missing key)", () => {
  const payload = messagePayload();
  delete payload.object;
  const result = WhatsappWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, false);
});

Deno.test("Contract: whatsapp-webhook v1 — inválido: entry ausente (missing key)", () => {
  const result = WhatsappWebhookV1Schema.safeParse({ object: "whatsapp_business_account" });
  assertEquals(result.success, false);
});

Deno.test("Contract: whatsapp-webhook v1 — inválido: changes ausente dentro do entry", () => {
  const payload = { object: "whatsapp_business_account", entry: [{ id: "0" }] };
  const result = WhatsappWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, false);
});

Deno.test("Contract: whatsapp-webhook v1 — inválido: wrong type (entry como string)", () => {
  const payload = { object: "whatsapp_business_account", entry: "not-an-array" };
  const result = WhatsappWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, false);
});

Deno.test("Contract: whatsapp-webhook v1 — inválido: wrong type (text como string em vez de objeto)", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{
      id: "0",
      changes: [{
        field: "messages",
        value: {
          messages: [{ id: "m1", from: "5511", timestamp: "1722800000", type: "text", text: "olá" }],
        },
      }],
    }],
  };
  const result = WhatsappWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, false);
});

Deno.test("Contract: whatsapp-webhook v1 — inválido: status fora do enum", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{
      id: "0",
      changes: [{
        field: "messages",
        value: { statuses: [{ id: "m1", status: "expired", timestamp: "1722800100" }] },
      }],
    }],
  };
  const result = WhatsappWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, false);
});

Deno.test("Contract: whatsapp-webhook v1 — array vazio: entry [] é aceito (schema sem min(1))", () => {
  // Comportamento REAL do schema (sem .min(1) em entry/changes): o endpoint
  // itera zero entries e retorna sucesso. Documentado para travar o contrato
  // atual — se um dia quiser rejeitar, o teste deve ser atualizado junto.
  const payload = { object: "whatsapp_business_account", entry: [] };
  const result = WhatsappWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: whatsapp-webhook v1 — null é rejeitado", () => {
  const result = WhatsappWebhookV1Schema.safeParse(null);
  assertEquals(result.success, false);
});

Deno.test("Contract: whatsapp-webhook v1 — undefined é rejeitado", () => {
  const result = WhatsappWebhookV1Schema.safeParse(undefined);
  assertEquals(result.success, false);
});

Deno.test("Contract: whatsapp-webhook v1 — empty body {} é rejeitado", () => {
  const result = WhatsappWebhookV1Schema.safeParse({});
  assertEquals(result.success, false);
});

Deno.test("Contract: whatsapp-webhook v1 — campos extras no topo são ignorados (strip)", () => {
  const payload = messagePayload({ extra_top: { anything: true }, outro: 42 });
  const result = WhatsappWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, true);
});

// ─── Versionamento v1/v2 (contrato whatsapp-webhook) ─────────────────────────

Deno.test("Versioning: payload V1 aceito quando V2 é current (auto-detecção v1)", () => {
  const v1Payload = messagePayload();
  const result = parseOrReject(
    "whatsapp-webhook",
    CONTRACT_SCHEMAS["whatsapp-webhook"],
    null,
    v1Payload,
  );
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.version, "v1");
});

Deno.test("Versioning: payload V2 (version 2.0) preferido quando V2 é current", () => {
  const v2Payload = messagePayload({ version: "2.0", timestamp: Date.now() });
  const result = parseOrReject(
    "whatsapp-webhook",
    CONTRACT_SCHEMAS["whatsapp-webhook"],
    null,
    v2Payload,
  );
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.version, "v2");
});

Deno.test("Versioning: x-contract-version header força v1", () => {
  const headers = new Headers({ "x-contract-version": "v1" });
  const req = new Request("http://localhost", { headers });
  const v1Payload = messagePayload();
  const result = parseOrReject(
    "whatsapp-webhook",
    CONTRACT_SCHEMAS["whatsapp-webhook"],
    req,
    v1Payload,
  );
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.version, "v1");
});

Deno.test("Versioning: versão não suportada → 422 unsupported_contract_version", () => {
  const headers = new Headers({ "x-contract-version": "v99" });
  const req = new Request("http://localhost", { headers });
  const result = parseOrReject(
    "whatsapp-webhook",
    CONTRACT_SCHEMAS["whatsapp-webhook"],
    req,
    messagePayload(),
  );
  assertEquals(result.ok, false);
  if (result.ok === false) {
    assertEquals(result.body.code, "unsupported_contract_version");
    assertEquals(result.response.status, 422);
  }
});

Deno.test("Versioning: v1 deprecated → headers x-contract-deprecated + sunset", () => {
  const headers = new Headers({ "x-contract-version": "v1" });
  const req = new Request("http://localhost", { headers });
  const result = parseOrReject(
    "whatsapp-webhook",
    CONTRACT_SCHEMAS["whatsapp-webhook"],
    req,
    messagePayload(),
  );
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.deprecated, true);
    assertEquals(result.headers["x-contract-deprecated"], "true");
    assertEquals(result.headers["sunset"], "2027-06-01");
  }
});

Deno.test("Versioning: V2 schema exige timestamp positivo (inválido → contract_violation)", () => {
  const bad = messagePayload({ version: "2.0", timestamp: -5 });
  const result = WhatsappWebhookV2Schema.safeParse(bad);
  assertEquals(result.success, false);
});
