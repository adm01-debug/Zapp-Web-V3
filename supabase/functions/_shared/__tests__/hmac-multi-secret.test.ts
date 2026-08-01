import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  WebhookSecurityService,
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
