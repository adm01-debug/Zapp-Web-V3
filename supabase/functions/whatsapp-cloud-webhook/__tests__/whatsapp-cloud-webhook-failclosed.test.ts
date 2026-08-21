// SEC-5 (2026-08-21) — regressão do fail-closed quando WHATSAPP_CLOUD_APP_SECRET
// não está configurado. Arquivo separado do mock principal (isolamento de
// processo — CI roda cada *.test.ts em processo próprio) porque o mock
// principal seta o secret no escopo do módulo e nunca exercita este ramo.
// Rodar: deno test --allow-read --allow-env supabase/functions/whatsapp-cloud-webhook/__tests__/whatsapp-cloud-webhook-failclosed.test.ts
import { assertEquals } from "jsr:@std/assert";

type H = (r: Request) => Promise<Response> | Response;
let h: H = () => new Response("");
Object.defineProperty(Deno, "serve", {
  value: (fn: H) => { h = fn; return { finished: Promise.resolve(), shutdown: () => {} }; },
  writable: true,
  configurable: true,
});

// Deliberadamente SEM WHATSAPP_CLOUD_APP_SECRET.
for (const [k, v] of Object.entries({
  SELFHOSTED_SUPABASE_URL: "http://mock.local",
  SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY: "test-key",
  WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN: "test-token",
  WHATSAPP_CLOUD_INSTANCE: "wpp2",
})) Deno.env.set(k, v);
Deno.env.delete("WHATSAPP_CLOUD_APP_SECRET");

globalThis.fetch = (() => Promise.resolve(new Response("[]", { headers: { "content-type": "application/json" } }))) as typeof fetch;

await import("../index.ts");

Deno.test("SEC-5: sem WHATSAPP_CLOUD_APP_SECRET → 503 fail-closed (não processa sem auth)", async () => {
  const payload = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "0", changes: [{ field: "messages", value: {
      messaging_product: "whatsapp",
      contacts: [{ wa_id: "5511999999999", profile: { name: "Attacker" } }],
      messages: [{ from: "5511999999999", id: "wamid.forged", timestamp: "1723000000", type: "text", text: { body: "forged, no auth" } }],
    } }] }],
  });
  // Nenhum x-hub-signature-256 — payload forjado sem nenhuma credencial.
  const res = await h(new Request("http://mock.local/webhook", {
    method: "POST",
    body: payload,
    headers: { "content-type": "application/json" },
  }));
  assertEquals(res.status, 503);
  const body = await res.json();
  // Etapa 26 (Bloco 2, 2026-08-21): migrado pra errorEnvelope — error agora
  // é boolean, o código do erro vive em `code`.
  assertEquals(body.error, true);
  assertEquals(body.code, "webhook_misconfigured");
  assertEquals(body.reason, "no_secret_configured");
});

Deno.test("SEC-5: GET handshake continua funcionando sem o secret configurado (não afetado)", async () => {
  const res = await h(new Request("http://mock.local/w?hub.mode=subscribe&hub.verify_token=test-token&hub.challenge=ch1"));
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "ch1");
});
