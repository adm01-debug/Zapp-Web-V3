import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  WebhookSecurityService,
  createWebhookValidator,
  readWebhookSecretsFromEnv,
} from "../hmac-validation.ts";

async function makeRequest(payload: string, signature: string): Promise<Request> {
  return new Request("https://x.test/webhook", {
    method: "POST",
    headers: {
      "x-evolution-signature": signature,
      "content-type": "application/json",
    },
    body: payload,
  });
}

async function signWith(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", k, enc.encode(payload));
  return `sha256=${
    Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("")
  }`;
}

Deno.test("single-secret constructor stays backwards-compatible", async () => {
  const svc = new WebhookSecurityService("only-secret");
  const payload = '{"hello":"world"}';
  const sig = await signWith("only-secret", payload);
  const r = await svc.validateRequest(await makeRequest(payload, sig));
  assertEquals(r.valid, true);
  assertEquals(r.signatureValid, true);
});

Deno.test("array-of-one secret behaves like single-secret", async () => {
  const svc = new WebhookSecurityService(["only-secret"]);
  const payload = '{"a":1}';
  const sig = await signWith("only-secret", payload);
  const r = await svc.validateRequest(await makeRequest(payload, sig));
  assertEquals(r.valid, true);
});

Deno.test("multi-secret: signature with primary (slot 0) accepted", async () => {
  const svc = new WebhookSecurityService(["new-secret", "old-secret"]);
  const payload = '{"event":"upsert"}';
  const sig = await signWith("new-secret", payload);
  const r = await svc.validateRequest(await makeRequest(payload, sig));
  assertEquals(r.valid, true);
  assertEquals(r.signatureValid, true);
});

Deno.test("multi-secret: signature with rotation-tail (slot 1) accepted", async () => {
  const svc = new WebhookSecurityService(["new-secret", "old-secret"]);
  const payload = '{"event":"upsert"}';
  const sig = await signWith("old-secret", payload);
  const r = await svc.validateRequest(await makeRequest(payload, sig));
  assertEquals(r.valid, true);
  assertEquals(r.signatureValid, true);
});

Deno.test("multi-secret: signature with unknown key rejected", async () => {
  const svc = new WebhookSecurityService(["new-secret", "old-secret"]);
  const payload = '{"x":1}';
  const sig = await signWith("attacker-secret", payload);
  const r = await svc.validateRequest(await makeRequest(payload, sig));
  assertEquals(r.valid, false);
  assertEquals(r.signatureValid, false);
});

Deno.test("multi-secret: empty secrets in array are filtered (unset env tolerated)", async () => {
  const svc = new WebhookSecurityService(["", "real-secret", ""]);
  const payload = '{"y":2}';
  const sig = await signWith("real-secret", payload);
  const r = await svc.validateRequest(await makeRequest(payload, sig));
  assertEquals(r.valid, true);
});

Deno.test("multi-secret: signing always uses primary (slot 0)", async () => {
  const svc = new WebhookSecurityService(["primary", "secondary"]);
  const sig = await svc.signPayload("hello");
  const expected = await signWith("primary", "hello");
  assertEquals(sig, expected);
});

Deno.test("signPayload throws when no secret configured", async () => {
  const svc = new WebhookSecurityService([""]);
  let threw = false;
  try {
    await svc.signPayload("x");
  } catch (e) {
    threw = true;
    assertEquals((e as Error).message, "No secret configured — cannot sign payload");
  }
  assertEquals(threw, true);
});

Deno.test("readWebhookSecretsFromEnv: prefers _SECRETS list", () => {
  const original = Deno.env.get("TEST_BASE_SECRETS");
  const originalSingle = Deno.env.get("TEST_BASE_SECRET");
  try {
    Deno.env.set("TEST_BASE_SECRETS", "a,b,c");
    Deno.env.set("TEST_BASE_SECRET", "should-be-ignored");
    assertEquals(readWebhookSecretsFromEnv("TEST_BASE"), ["a", "b", "c"]);
  } finally {
    if (original !== undefined) Deno.env.set("TEST_BASE_SECRETS", original);
    else Deno.env.delete("TEST_BASE_SECRETS");
    if (originalSingle !== undefined) Deno.env.set("TEST_BASE_SECRET", originalSingle);
    else Deno.env.delete("TEST_BASE_SECRET");
  }
});

Deno.test("readWebhookSecretsFromEnv: falls back to single _SECRET", () => {
  const orig = Deno.env.get("TEST_BASE2_SECRET");
  Deno.env.delete("TEST_BASE2_SECRETS");
  try {
    Deno.env.set("TEST_BASE2_SECRET", "solo");
    assertEquals(readWebhookSecretsFromEnv("TEST_BASE2"), ["solo"]);
  } finally {
    if (orig !== undefined) Deno.env.set("TEST_BASE2_SECRET", orig);
    else Deno.env.delete("TEST_BASE2_SECRET");
  }
});

Deno.test("readWebhookSecretsFromEnv: trims whitespace and filters empty", () => {
  const orig = Deno.env.get("TEST_BASE3_SECRETS");
  try {
    Deno.env.set("TEST_BASE3_SECRETS", " a , , b ,");
    assertEquals(readWebhookSecretsFromEnv("TEST_BASE3"), ["a", "b"]);
  } finally {
    if (orig !== undefined) Deno.env.set("TEST_BASE3_SECRETS", orig);
    else Deno.env.delete("TEST_BASE3_SECRETS");
  }
});

Deno.test("readWebhookSecretsFromEnv: returns [] when nothing set", () => {
  Deno.env.delete("TEST_BASE4_SECRETS");
  Deno.env.delete("TEST_BASE4_SECRET");
  assertEquals(readWebhookSecretsFromEnv("TEST_BASE4"), []);
});

// --- Shared-secret bearer path (x-webhook-secret) ---------------------------

function makeSharedSecretRequest(payload: string, sharedSecret: string, header = "x-webhook-secret"): Request {
  return new Request("https://x.test/webhook", {
    method: "POST",
    headers: { [header]: sharedSecret, "content-type": "application/json" },
    body: payload,
  });
}

Deno.test("shared-secret: valid x-webhook-secret passes strict mode without a signature", async () => {
  const svc = new WebhookSecurityService(["the-strong-secret"], true /* strict */);
  const r = await svc.validateRequest(makeSharedSecretRequest('{"event":"connection.update"}', "the-strong-secret"));
  assertEquals(r.valid, true);
  assertEquals(r.signatureValid, false);
  assertEquals(r.sharedSecretValid, true);
});

Deno.test("shared-secret: matches a rotation-tail secret too", async () => {
  const svc = new WebhookSecurityService(["new-secret", "old-secret"], true);
  const r = await svc.validateRequest(makeSharedSecretRequest('{"a":1}', "old-secret"));
  assertEquals(r.valid, true);
  assertEquals(r.sharedSecretValid, true);
});

Deno.test("shared-secret: wrong x-webhook-secret is rejected (even in non-strict mode)", async () => {
  const svc = new WebhookSecurityService(["the-strong-secret"], false /* non-strict */);
  const r = await svc.validateRequest(makeSharedSecretRequest('{"a":1}', "wrong-secret"));
  assertEquals(r.valid, false);
  assertEquals(r.sharedSecretValid, false);
  assertEquals(r.error, "Invalid webhook shared secret");
});

Deno.test("shared-secret: disabled via allowSharedSecret=false → strict still rejects", async () => {
  const svc = new WebhookSecurityService(["the-strong-secret"], true, false /* allowSharedSecret */);
  const r = await svc.validateRequest(makeSharedSecretRequest('{"a":1}', "the-strong-secret"));
  assertEquals(r.valid, false);
  assertEquals(r.error, "Missing webhook signature");
});

Deno.test("shared-secret: a valid HMAC signature still wins when both are present", async () => {
  const svc = new WebhookSecurityService(["the-strong-secret"], true);
  const payload = '{"event":"messages.upsert"}';
  const sig = await signWith("the-strong-secret", payload);
  const req = new Request("https://x.test/webhook", {
    method: "POST",
    headers: {
      "x-evolution-signature": sig,
      "x-webhook-secret": "irrelevant-because-signature-present",
      "content-type": "application/json",
    },
    body: payload,
  });
  const r = await svc.validateRequest(req);
  assertEquals(r.valid, true);
  assertEquals(r.signatureValid, true);
});

// --- [C-9 2026-08-06] HMAC primário: precedência e gate de deprecação ---------

Deno.test("C-9: HMAC primário — assinatura presente porém INVÁLIDA rejeita mesmo com x-webhook-secret válido", async () => {
  // Antes do C-9 o index.ts checava x-webhook-secret ANTES do HMAC: um request
  // com assinatura inválida + segredo estático válido passava pelo plaintext.
  // Com HMAC primário, assinatura encontrada manda: inválida => 401.
  const svc = new WebhookSecurityService(["the-strong-secret"], true);
  const payload = '{"event":"messages.upsert"}';
  const badSig = await signWith("attacker-key", payload); // válida p/ OUTRA chave
  const req = new Request("https://x.test/webhook", {
    method: "POST",
    headers: {
      "x-evolution-signature": badSig,
      "x-webhook-secret": "the-strong-secret", // válido, mas NÃO deve salvar
      "content-type": "application/json",
    },
    body: payload,
  });
  const r = await svc.validateRequest(req);
  assertEquals(r.valid, false);
  assertEquals(r.signatureValid, false);
  assertEquals(r.error, "Invalid webhook signature");
});

Deno.test("C-9: createWebhookValidator com allowSharedSecret=true (default) aceita shared-secret DEPRECATED", async () => {
  const validate = createWebhookValidator(["the-strong-secret"], true, true);
  const r = await validate(makeSharedSecretRequest('{"event":"connection.update"}', "the-strong-secret"));
  assertEquals(r.valid, true);
  assertEquals(r.signatureValid, false);
  assertEquals(r.sharedSecretValid, true);
});

Deno.test("C-9: EVOLUTION_WEBHOOK_ALLOW_SHARED_SECRET=false — shared-secret rejeitado, HMAC segue aceito", async () => {
  const validate = createWebhookValidator(["the-strong-secret"], true, false /* HMAC-only */);
  // Plaintext deprecated barrado
  const r1 = await validate(makeSharedSecretRequest('{"event":"connection.update"}', "the-strong-secret"));
  assertEquals(r1.valid, false);
  assertEquals(r1.error, "Missing webhook signature");
  // HMAC continua funcionando
  const payload = '{"event":"messages.upsert"}';
  const sig = await signWith("the-strong-secret", payload);
  const r2 = await validate(await makeRequest(payload, sig));
  assertEquals(r2.valid, true);
  assertEquals(r2.signatureValid, true);
});
