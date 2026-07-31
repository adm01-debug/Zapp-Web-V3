import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";

async function generateHmac(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const WEBHOOK_URL = Deno.env.get("WEBHOOK_URL") || "http://localhost:54321/functions/v1/evolution-webhook";
const SECRET = Deno.env.get("EVOLUTION_WEBHOOK_SECRET") || "test-secret";

interface FuzzPayload {
  event: string;
  instance: string;
  data: unknown;
}

async function sendFuzz(payload: FuzzPayload) {
  const body = JSON.stringify(payload);
  const signature = await generateHmac(body, SECRET);
  
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-evolution-signature": signature
    },
    body
  });
  
  console.log(`Payload: ${payload.event} | Status: ${res.status}`);
  return res.status;
}

const FUZZ_DATA = [
  { event: "messages-upsert", instance: "wpp2", data: { messages: [{ id: "1", content: "hello" }] } },
  { event: "contacts-upsert", instance: "wpp2", data: [{ id: "c1", name: "Alice" }] },
  { event: "invalid-event", instance: "wpp2", data: {} },
  { event: "messages-upsert", instance: "", data: null },
];

for (const d of FUZZ_DATA) {
  await sendFuzz(d);
}
