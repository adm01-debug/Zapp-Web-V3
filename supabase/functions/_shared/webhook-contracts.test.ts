import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { EvolutionWebhookV1Schema, EvolutionWebhookV2Schema, MetaWebhookPayloadSchema } from "./webhook-schemas.ts";

Deno.test("Contract: Evolution Webhook V1 valid", () => {
  const payload = {
    event: "messages.upsert",
    instance: "inst_123",
    data: { id: "123" }
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

Deno.test("Contract: Meta Webhook invalid - wrong object type", () => {
  const payload = {
    object: "user",
    entry: []
  };
  const result = MetaWebhookPayloadSchema.safeParse(payload);
  assertEquals(result.success, false);
});
