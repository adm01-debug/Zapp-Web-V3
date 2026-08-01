
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { parseBody, AiSuggestReplySchema, WebhookPayloadSchema } from "../_shared/schemas.ts";

Deno.test("Contract: AiSuggestReplySchema - Valid Payload", () => {
  const payload = {
    messages: [
      { sender: "agent", content: "Olá!" },
      { sender: "user", content: "Como posso ajudar?" }
    ],
    contactName: "João Silva",
    contactId: "550e8400-e29b-41d4-a716-446655440000"
  };
  
  const result = parseBody(AiSuggestReplySchema, payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: AiSuggestReplySchema - Invalid Payload (422 Scenario)", () => {
  const payload = {
    messages: "not-an-array", // Error: messages must be array
    contactId: "invalid-uuid"  // Error: must be UUID
  };
  
  const result = parseBody(AiSuggestReplySchema, payload);
  assertEquals(result.success, false);
  if (!result.success) {
    assertEquals(!!result.fieldErrors.messages, true);
    assertEquals(!!result.fieldErrors.contactId, true);
  }
});

Deno.test("Contract: WebhookPayloadSchema - Valid Evolution Payload", () => {
  const payload = {
    event: "messages.upsert",
    instance: "main-instance",
    data: { id: "msg-123", content: "Hello" }
  };
  
  const result = parseBody(WebhookPayloadSchema, payload);
  assertEquals(result.success, true);
});

Deno.test("Contract: WebhookPayloadSchema - Missing Required Fields", () => {
  const payload = {
    event: "messages.upsert"
    // Missing instance
  };
  
  const result = parseBody(WebhookPayloadSchema, payload);
  assertEquals(result.success, false);
  if (!result.success) {
    assertEquals(!!result.fieldErrors.instance, true);
  }
});

Deno.test("Contract: WebhookPayloadSchema - Empty Values Validation", () => {
  const payload = {
    event: "",
    instance: "   "
  };
  
  const result = parseBody(WebhookPayloadSchema, payload);
  assertEquals(result.success, false);
});
