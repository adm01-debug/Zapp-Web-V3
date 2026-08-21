// E92 PREP — whatsapp-cloud-webhook mock tests (inbound cloud↔zapp SEM Meta).
// Rodar: deno test --allow-read --allow-env supabase/functions/whatsapp-cloud-webhook/__tests__/whatsapp-cloud-webhook-mock.test.ts
import { assertEquals } from "jsr:@std/assert";
type H = (r: Request) => Promise<Response> | Response;
let h: H = () => new Response("");
Object.defineProperty(Deno, "serve", { value: (fn: H) => { h = fn; return { finished: Promise.resolve(), shutdown: () => {} }; }, writable: true, configurable: true });
const SECRET = "test-app-secret";
for (const [k, v] of Object.entries({ SELFHOSTED_SUPABASE_URL: "http://mock.local", SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY: "test-key", WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN: "test-token", WHATSAPP_CLOUD_APP_SECRET: SECRET, WHATSAPP_CLOUD_INSTANCE: "wpp2" })) Deno.env.set(k, v);
const ledger = new Set<string>(); const acked: string[] = []; const J = { "content-type": "application/json" };
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => { const p = new URL(String(input)).pathname; const b = init?.body ? JSON.parse(String(init.body)) : null;
  if (p.endsWith("/webhook_events_processed")) return ledger.has(b.event_id) ? new Response(JSON.stringify({ code: "23505" }), { status: 409, headers: J }) : (ledger.add(b.event_id), new Response("[]", { status: 201, headers: J }));
  if (p.endsWith("/evolution_messages") && (init?.method ?? "GET") === "GET") return new Response(JSON.stringify([{ id: "ev-1", status: "sending" }]), { headers: J });
  if (p.endsWith("/evolution_messages")) { acked.push(b.status); return new Response(null, { status: 204 }); }
  return new Response("[]", { headers: J }); }) as typeof fetch;
await import("../index.ts");
const sign = async (raw: string) => { const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return "sha256=" + [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(raw)))].map((x) => x.toString(16).padStart(2, "0")).join(""); };
const post = async (raw: string, sig?: string) => h(new Request("http://mock.local/webhook", { method: "POST", body: raw, headers: { ...J, ...(sig ? { "x-hub-signature-256": sig } : {}) } }));
const signed = async (o: unknown) => { const raw = JSON.stringify(o); return post(raw, await sign(raw)); };
const msg = (id: string) => ({ object: "whatsapp_business_account", entry: [{ id: "0", changes: [{ field: "messages", value: { messaging_product: "whatsapp", contacts: [{ wa_id: "5511999999999", profile: { name: "T" } }], messages: [{ from: "5511999999999", id, timestamp: "1723000000", type: "text", text: { body: "oi" } }] } }] }] });
Deno.test("handshake: token certo→200+challenge, errado→403", async () => { const ok = await h(new Request("http://mock.local/w?hub.mode=subscribe&hub.verify_token=test-token&hub.challenge=ch123")); assertEquals(ok.status, 200); assertEquals(await ok.text(), "ch123");
  const bad = await h(new Request("http://mock.local/w?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=ch123")); assertEquals(bad.status, 403); });
Deno.test("POST assinatura válida → 200 + processada", async () => { const res = await signed(msg("wamid.1")); assertEquals(res.status, 200);
  // Auto-detecção (nenhuma versão pedida) tenta v2→v1; este fixture só casa com v1,
  // que está em janela de sunset (2027-06-01) → resposta carrega deprecated+sunset.
  assertEquals(res.headers.get("x-contract-version"), "v1");
  assertEquals(res.headers.get("x-contract-deprecated"), "true");
  assertEquals(res.headers.get("sunset"), "2027-06-01");
  const b = await res.json(); assertEquals(b.processed, 1); assertEquals(b.duplicate, false); });
Deno.test("assinatura inválida → 401", async () => { const res = await post(JSON.stringify(msg("wamid.2")), "sha256=deadbeef"); assertEquals(res.status, 401); });
Deno.test("duplicado → duplicate:true (ledger webhook_events_processed)", async () => { const raw = JSON.stringify(msg("wamid.3")); const sig = await sign(raw); assertEquals((await (await post(raw, sig)).json()).processed, 1); const res = await post(raw, sig); const b = await res.json(); assertEquals(b.duplicate, true); assertEquals(b.duplicates, 1); assertEquals(b.processed, 0); });
Deno.test("statuses sent/delivered/read → update evolution_messages", async () => { const p = { object: "whatsapp_business_account", entry: [{ id: "0", changes: [{ field: "statuses", value: { statuses: ["sent", "delivered", "read"].map((s, i) => ({ id: `wamid.ack.${i}`, status: s, timestamp: "1723000000", recipient_id: "5511999999999" })) } }] }] }; const res = await signed(p); const b = await res.json(); assertEquals(res.status, 200); assertEquals(b.statusesUpdated, 3); assertEquals(acked, ["sent", "delivered", "read"]); });
Deno.test("notificação vazia (entry []) → 200 benigno", async () => { const res = await signed({ object: "whatsapp_business_account", entry: [] }); assertEquals(res.status, 200); assertEquals((await res.json()).benign, true);
  // Etapa 24 (Bloco 2, 2026-08-21): entry:[] agora passa pelo gate normal
  // (o schema aceita, não é mais um bypass manual pré-gate) — por isso
  // carrega x-contract-version como qualquer outra resposta de sucesso.
  assertEquals(res.headers.get("x-contract-version"), "v1"); });
Deno.test("notificação vazia (entry null) → 200 benigno", async () => { const res = await signed({ object: "whatsapp_business_account", entry: null }); assertEquals(res.status, 200); assertEquals((await res.json()).benign, true); });
Deno.test("JSON malformado → 422 canônico (não mais 400 artesanal)", async () => { const raw = "{not valid json"; const res = await post(raw, await sign(raw)); assertEquals(res.status, 422);
  const body = await res.json(); assertEquals(body.code, "invalid_json"); assertEquals(body.error, true); });
