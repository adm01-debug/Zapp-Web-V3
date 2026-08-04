import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  EvolutionWebhookV1Schema,
  EvolutionWebhookV2Schema,
  MetaWebhookPayloadSchema,
} from "./contract-schemas.ts";

// ─── Evolution Webhook V1 ───────────────────────────────────────────────────

Deno.test("Contract: Evolution Webhook V1 valid", () => {
  const payload = {
    event: "messages.upsert",
    instance: "inst_123",
    data: { id: "123" }
  };
  const result = EvolutionWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: Evolution Webhook V1 aceita apikey/sender null (connection.update em reconexão)", () => {
  // Estrutura real observada em produção (Evolution v2.3.7, wpp2 em loop de
  // reconexão): apikey vem null antes da sessão autenticar. URLs/hosts foram
  // anonimizados (example.com); os campos e tipos são idênticos ao payload
  // original. Regressão do incidente 422/contract_violation de 2026-07-03.
  const payload = {
    event: "connection.update",
    instance: "wpp2",
    data: { state: "connecting", statusReason: 401 },
    destination: "https://supabase.example.com/functions/v1/evolution-webhook",
    date_time: "2026-07-03T20:34:02-03:00",
    sender: null,
    apikey: null,
    server_url: "https://evolution.example.com",
  };
  const result = EvolutionWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: Evolution Webhook V1 invalid - missing instance", () => {
  const payload = {
    event: "messages.upsert",
    data: { id: "123" }
  };
  const result = EvolutionWebhookV1Schema.safeParse(payload);
  assertEquals(result.success, false);
});

Deno.test("Contract: Evolution Webhook V1 invalid - body vazio {}", () => {
  const result = EvolutionWebhookV1Schema.safeParse({});
  assertEquals(result.success, false);
});

Deno.test("Contract: Evolution Webhook V1 invalid_json - null", () => {
  const result = EvolutionWebhookV1Schema.safeParse(null);
  assertEquals(result.success, false);
});

Deno.test("Contract: Evolution Webhook V1 invalid_json - primitivo (string)", () => {
  const result = EvolutionWebhookV1Schema.safeParse("not-json");
  assertEquals(result.success, false);
});

Deno.test("Contract: Evolution Webhook V1 invalid_json - array", () => {
  const result = EvolutionWebhookV1Schema.safeParse(["messages.upsert"]);
  assertEquals(result.success, false);
});

// ─── Evolution Webhook V2 ───────────────────────────────────────────────────

Deno.test("Contract: Evolution Webhook V2 valid", () => {
  const payload = {
    version: "2.0",
    event: "messages.upsert",
    instance: "inst_123",
    timestamp: Date.now(),
    data: { id: "123" }
  };
  const result = EvolutionWebhookV2Schema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: Evolution Webhook V2 payload completo (todos os campos novos)", () => {
  // V2: version obrigatória, timestamp obrigatório, environment opcional,
  // sender/apikey nullish (herdado do V1) e data como record OU array.
  const payload = {
    version: "2.0",
    event: "messages.upsert",
    instance: "wpp1",
    timestamp: 1785845494000,
    environment: "production",
    data: { key: { remoteJid: "5511999999999@s.whatsapp.net", pushName: "Maria" } },
    sender: "5511999999999",
    apikey: "abc123",
    extra_future_field: { nested: true },
  };
  const result = EvolutionWebhookV2Schema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: Evolution Webhook V2 data como ARRAY é aceito (labels.association)", () => {
  const payload = {
    version: "2.0",
    event: "labels.association",
    instance: "wpp1",
    timestamp: 1785845494000,
    data: [{ labelId: "1", chatId: "5511@s.whatsapp.net" }],
  };
  const result = EvolutionWebhookV2Schema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: Evolution Webhook V2 invalid - timestamp ausente", () => {
  const payload = {
    version: "2.0",
    event: "messages.upsert",
    instance: "inst_123",
  };
  const result = EvolutionWebhookV2Schema.safeParse(payload);
  assertEquals(result.success, false);
});

Deno.test("Contract: Evolution Webhook V2 unsupported_contract_version - version 3.0", () => {
  const payload = {
    version: "3.0",
    event: "messages.upsert",
    instance: "inst_123",
    timestamp: Date.now(),
  };
  const result = EvolutionWebhookV2Schema.safeParse(payload);
  assertEquals(result.success, false);
});

Deno.test("Contract: Evolution Webhook V2 invalid - timestamp não positivo", () => {
  const payload = {
    version: "2.0",
    event: "messages.upsert",
    instance: "inst_123",
    timestamp: 0,
  };
  const result = EvolutionWebhookV2Schema.safeParse(payload);
  assertEquals(result.success, false);
});

// ─── Meta (WhatsApp Cloud) Webhook ──────────────────────────────────────────

Deno.test("Contract: Meta Webhook valid", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "entry_1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              messages: [{ id: "msg_1" }]
            }
          }
        ]
      }
    ]
  };
  const result = MetaWebhookPayloadSchema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: Meta Webhook múltiplos entries com delivery status", () => {
  // Payload real da Meta: um entry com status (delivered) e outro com
  // mensagem nova; value tem mais campos que o mínimo (metadata, contacts).
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "0",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "16505551111",
                phone_number_id: "123456",
              },
              statuses: [
                {
                  id: "wamid.ABC",
                  status: "delivered",
                  timestamp: "1722800100",
                  recipient_id: "5511999999999",
                },
              ],
            },
          },
        ],
      },
      {
        id: "1",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "16505551111", phone_number_id: "123456" },
              contacts: [{ profile: { name: "Maria" }, wa_id: "5511999999999" }],
              messages: [
                {
                  from: "5511999999999",
                  id: "wamid.XYZ",
                  timestamp: "1722800200",
                  text: { body: "oi" },
                  type: "text",
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const result = MetaWebhookPayloadSchema.safeParse(payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: Meta Webhook invalid - wrong object type", () => {
  const payload = {
    object: "user",
    entry: []
  };
  const result = MetaWebhookPayloadSchema.safeParse(payload);
  assertEquals(result.success, false);
});

Deno.test("Contract: Meta Webhook invalid - entry vazio", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [],
  };
  const result = MetaWebhookPayloadSchema.safeParse(payload);
  assertEquals(result.success, false);
});

Deno.test("Contract: Meta Webhook invalid - changes vazio dentro do entry", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{ id: "0", changes: [] }],
  };
  const result = MetaWebhookPayloadSchema.safeParse(payload);
  assertEquals(result.success, false);
});

Deno.test("Contract: Meta Webhook invalid_json - null", () => {
  const result = MetaWebhookPayloadSchema.safeParse(null);
  assertEquals(result.success, false);
});

Deno.test("Contract: Meta Webhook invalid_json - body vazio {}", () => {
  const result = MetaWebhookPayloadSchema.safeParse({});
  assertEquals(result.success, false);
});
