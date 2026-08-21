// zapp-email-inbound-webhook — behavioral tests (handler REAL via Deno.serve stub + fetch mock, sem rede/DB).
// Rodar: deno test --allow-read --allow-env supabase/functions/zapp-email-inbound-webhook/__tests__/inbound-mock.test.ts
//
// Cobre o fluxo INBOUND (webhook de entrada do Resend, EMAIL-02 wt-g5):
//  - 503 fail-closed: nenhum segredo configurado → 503 (nunca aceita anônimo);
//  - 401: x-webhook-secret ausente/errado; assinatura Svix ausente/errada;
//  - grava: webhook válido → insert em zapp.emails (direction='inbound', from
//    parseado, body/subject/cc) → 200 {ok, emailId};
//  - idempotência: message_id duplicado → 200 {duplicate:true} sem re-insert;
//  - anexos: storage upload + metadata no insert (falha de storage não derruba).
import { assertEquals } from "jsr:@std/assert";
import { _resetRateLimitForTests } from "../../_shared/validation.ts";
type H = (r: Request) => Promise<Response> | Response;
let h: H = () => new Response("");
Object.defineProperty(Deno, "serve", { value: (fn: H) => { h = fn; return { finished: Promise.resolve(), shutdown: () => {} }; }, writable: true, configurable: true });
for (const [k, v] of Object.entries({
  SELFHOSTED_SUPABASE_URL: "http://mock.local",
  SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
})) Deno.env.set(k, v);
const J = { "content-type": "application/json" };
const Jres = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: J });
// ── estado do mock ─────────────────────────────────────────────────────────────
let existingEmail: Record<string, unknown> | null = null;   // dedup GET zapp.emails
const emailInserts: Array<Record<string, unknown>> = [];
const storageUploads: string[] = [];
let storageFails = false;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const p = new URL(String(input)).pathname;
  const m = init?.method ?? "GET";
  let b: Record<string, unknown> | null = null;
  if (init?.body) { try { b = JSON.parse(String(init.body)) as Record<string, unknown>; } catch { b = null; } } // storage upload body é binário
  if (p.endsWith("/emails") && m === "GET") return Jres(existingEmail ? [existingEmail] : []);
  if (p.endsWith("/emails") && m === "POST") { emailInserts.push(b ?? {}); return Jres({ id: "email-1" }, 201); } // insert+select+single → objeto bare
  if (p.startsWith("/storage/v1/object/email-attachments/")) {
    storageUploads.push(p);
    return storageFails ? Jres({ error: "storage down" }, 500) : Jres({ Key: p }, 200);
  }
  return Jres({ unhandled: true, url: String(input) }, 404);
}) as typeof fetch;
await import("../index.ts");
const WEBHOOK_SECRET = "test-webhook-secret";
const reset = () => {
  existingEmail = null; emailInserts.length = 0; storageUploads.length = 0; storageFails = false;
  Deno.env.set("EMAIL_INBOUND_WEBHOOK_SECRET", WEBHOOK_SECRET);
  Deno.env.delete("RESEND_INBOUND_SIGNING_SECRET");
  _resetRateLimitForTests();
};
reset();
const PAYLOAD = {
  id: "re-msg-1",
  from: "Ana Silva <ana@example.com>",
  to: ["contato@zappweb.app"],
  cc: ["cc@example.com"],
  subject: "Assunto inbound",
  text: "corpo texto",
  html: "<p>corpo html</p>",
};
const call = (body: unknown, opts: { secret?: string; token?: string; svix?: Record<string, string> } = {}) => {
  const url = new URL("http://mock.local/zapp-email-inbound-webhook");
  if (opts.token) url.searchParams.set("token", opts.token);
  const headers: Record<string, string> = { ...J };
  if (opts.secret) headers["x-webhook-secret"] = opts.secret;
  if (opts.svix) Object.assign(headers, opts.svix);
  return h(new Request(url, { method: "POST", body: JSON.stringify(body), headers }));
};
const svixHeaders = async (raw: string, secret: string, ts = Math.floor(Date.now() / 1000)) => {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`svix-id-1.${ts}.${raw}`));
  const sig = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return { "svix-id": "svix-id-1", "svix-timestamp": String(ts), "svix-signature": `v1,${sig}` };
};

// ─── 503 fail-closed ───────────────────────────────────────────────────────────
Deno.test("zapp-email-inbound-webhook: nenhum segredo configurado → 503 (fail-closed, zero inserts)", async () => {
  reset();
  Deno.env.delete("EMAIL_INBOUND_WEBHOOK_SECRET");
  const res = await call(PAYLOAD);
  assertEquals(res.status, 503);
  assertEquals(emailInserts.length, 0);
});

// ─── 401 (x-webhook-secret) ────────────────────────────────────────────────────
Deno.test("zapp-email-inbound-webhook: x-webhook-secret ausente → 401", async () => {
  reset();
  assertEquals((await call(PAYLOAD)).status, 401);
  assertEquals(emailInserts.length, 0);
});
Deno.test("zapp-email-inbound-webhook: x-webhook-secret errado → 401", async () => {
  reset();
  assertEquals((await call(PAYLOAD, { secret: "errado" })).status, 401);
});
Deno.test("zapp-email-inbound-webhook: token via query ?token= válido → aceito (fallback do header)", async () => {
  reset();
  const res = await call(PAYLOAD, { token: WEBHOOK_SECRET });
  assertEquals(res.status, 200);
  assertEquals((await res.json() as { ok: boolean }).ok, true);
});

// ─── 401 (Svix) ────────────────────────────────────────────────────────────────
Deno.test("zapp-email-inbound-webhook: assinatura Svix ausente → 401", async () => {
  reset();
  Deno.env.set("RESEND_INBOUND_SIGNING_SECRET", "svix-test-secret");
  assertEquals((await call(PAYLOAD, { secret: WEBHOOK_SECRET })).status, 401);
});
Deno.test("zapp-email-inbound-webhook: assinatura Svix errada → 401", async () => {
  reset();
  Deno.env.set("RESEND_INBOUND_SIGNING_SECRET", "svix-test-secret");
  const res = await call(PAYLOAD, { secret: WEBHOOK_SECRET, svix: { "svix-id": "a", "svix-timestamp": String(Math.floor(Date.now() / 1000)), "svix-signature": "v1,AAAA" } });
  assertEquals(res.status, 401);
  assertEquals(emailInserts.length, 0);
});

// ─── inbound grava ─────────────────────────────────────────────────────────────
Deno.test("zapp-email-inbound-webhook: webhook válido → 200 ok + grava zapp.emails direction=inbound (from parseado)", async () => {
  reset();
  const res = await call(PAYLOAD, { secret: WEBHOOK_SECRET });
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, emailId: "email-1" });
  assertEquals(emailInserts.length, 1);
  const row = emailInserts[0];
  assertEquals(row.message_id, "re-msg-1");
  assertEquals(row.direction, "inbound");
  assertEquals(row.provider, "resend");
  assertEquals(row.from_email, "ana@example.com");
  assertEquals(row.from_name, "Ana Silva");
  assertEquals(row.to_emails, ["contato@zappweb.app"]);
  assertEquals(row.cc_emails, ["cc@example.com"]);
  assertEquals(row.subject, "Assunto inbound");
  assertEquals(row.text_body, "corpo texto");
  assertEquals(row.html_body, "<p>corpo html</p>");
  assertEquals(row.status, "received");
  assertEquals(row.user_id, null); // inbound = caixa da empresa, sem dono
});
Deno.test("zapp-email-inbound-webhook: Svix válido (com webhook secret) → 200 + grava", async () => {
  reset();
  Deno.env.set("RESEND_INBOUND_SIGNING_SECRET", "svix-test-secret");
  const raw = JSON.stringify(PAYLOAD);
  const svix = await svixHeaders(raw, "svix-test-secret");
  const res = await call(PAYLOAD, { secret: WEBHOOK_SECRET, svix });
  assertEquals(res.status, 200);
  assertEquals(emailInserts.length, 1);
});

// ─── idempotência (re-delivery) ────────────────────────────────────────────────
Deno.test("zapp-email-inbound-webhook: message_id duplicado → 200 {duplicate:true} sem re-insert", async () => {
  reset();
  existingEmail = { id: "email-existente" };
  const res = await call(PAYLOAD, { secret: WEBHOOK_SECRET });
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, duplicate: true, emailId: "email-existente" });
  assertEquals(emailInserts.length, 0);
});

// ─── anexos → storage + metadata (falha de storage não derruba ingestão) ──────
Deno.test("zapp-email-inbound-webhook: anexo válido → storage upload + attachments no insert", async () => {
  reset();
  const b64 = btoa("conteudo do anexo");
  const res = await call({ ...PAYLOAD, attachments: [{ filename: "relatorio.pdf", content_type: "application/pdf", content: b64 }] }, { secret: WEBHOOK_SECRET });
  assertEquals(res.status, 200);
  assertEquals(storageUploads.length, 1);
  assertEquals(storageUploads[0].includes("inbound/re-msg-1/relatorio.pdf"), true);
  const row = emailInserts[0];
  assertEquals((row.attachments as Array<Record<string, unknown>>)[0].filename, "relatorio.pdf");
  assertEquals((row.attachments as Array<Record<string, unknown>>)[0].storage_path, "inbound/re-msg-1/relatorio.pdf");
});
Deno.test("zapp-email-inbound-webhook: storage falha → email ainda grava (anexo ignorado, best-effort)", async () => {
  reset();
  storageFails = true;
  const res = await call({ ...PAYLOAD, attachments: [{ filename: "a.pdf", content: btoa("x") }] }, { secret: WEBHOOK_SECRET });
  assertEquals(res.status, 200);
  assertEquals(emailInserts.length, 1);
  assertEquals((emailInserts[0].attachments as unknown[]).length, 0);
});

// ─── etapa 23 (Bloco 2, 2026-08-21): 422 canônico substitui o 400 artesanal ──
// validateMinimalPayload rodava ANTES do gate — o 422 canônico nunca era
// atingido. Agora as mesmas regras (to/subject/text-ou-html obrigatórios)
// vivem no schema (superRefine) e o ÚNICO caminho de rejeição é parseOrReject.
Deno.test("zapp-email-inbound-webhook: sem 'to' → 422 canônico (contract_violation, path 'to')", async () => {
  reset();
  const { to: _to, ...semTo } = PAYLOAD;
  const res = await call(semTo, { secret: WEBHOOK_SECRET });
  assertEquals(res.status, 422);
  const body = await res.json() as { error: boolean; code: string; contract: string; details: Array<{ path: string }> };
  assertEquals(body.error, true);
  assertEquals(body.code, "contract_violation");
  assertEquals(body.contract, "zapp-email-inbound-webhook@v1");
  assertEquals(body.details.some((d) => d.path === "to"), true);
  assertEquals(emailInserts.length, 0);
});
Deno.test("zapp-email-inbound-webhook: 'to' vazio → 422 (path 'to')", async () => {
  reset();
  const res = await call({ ...PAYLOAD, to: [] }, { secret: WEBHOOK_SECRET });
  assertEquals(res.status, 422);
  const body = await res.json() as { details: Array<{ path: string }> };
  assertEquals(body.details.some((d) => d.path === "to"), true);
});
Deno.test("zapp-email-inbound-webhook: sem 'subject' → 422 (path 'subject')", async () => {
  reset();
  const { subject: _subject, ...semSubject } = PAYLOAD;
  const res = await call(semSubject, { secret: WEBHOOK_SECRET });
  assertEquals(res.status, 422);
  const body = await res.json() as { details: Array<{ path: string }> };
  assertEquals(body.details.some((d) => d.path === "subject"), true);
});
Deno.test("zapp-email-inbound-webhook: subject só espaços → 422 (trim, path 'subject')", async () => {
  reset();
  const res = await call({ ...PAYLOAD, subject: "   " }, { secret: WEBHOOK_SECRET });
  assertEquals(res.status, 422);
  const body = await res.json() as { details: Array<{ path: string }> };
  assertEquals(body.details.some((d) => d.path === "subject"), true);
});
Deno.test("zapp-email-inbound-webhook: sem text e sem html → 422 (path 'text')", async () => {
  reset();
  const { text: _text, html: _html, ...semCorpo } = PAYLOAD;
  const res = await call(semCorpo, { secret: WEBHOOK_SECRET });
  assertEquals(res.status, 422);
  const body = await res.json() as { details: Array<{ path: string }> };
  assertEquals(body.details.some((d) => d.path === "text"), true);
  assertEquals(emailInserts.length, 0);
});
Deno.test("zapp-email-inbound-webhook: só html (sem text) → aceito (200)", async () => {
  reset();
  const { text: _text, ...soHtml } = PAYLOAD;
  const res = await call(soHtml, { secret: WEBHOOK_SECRET });
  assertEquals(res.status, 200);
  assertEquals(emailInserts.length, 1);
});
Deno.test("zapp-email-inbound-webhook: body vazio (nenhum campo) → 422 acumula os 3 erros de negócio", async () => {
  reset();
  const res = await call({ id: "re-msg-2", from: "x@example.com" }, { secret: WEBHOOK_SECRET });
  assertEquals(res.status, 422);
  const body = await res.json() as { details: Array<{ path: string }> };
  const paths = body.details.map((d) => d.path).sort();
  assertEquals(paths, ["subject", "text", "to"]);
});
