// zapp-email-send — behavioral tests (handler REAL via Deno.serve stub + fetch mock, sem rede/DB).
// Rodar: deno test --allow-read --allow-env supabase/functions/zapp-email-send/__tests__/send-mock.test.ts
//
// Cobre o fluxo OUTBOUND (Resend API, EMAIL-02 wt-g5):
//  - 401: sem JWT / role=anon (requireUser);
//  - 503: sem RESEND_API_KEY (nunca 500);
//  - send: payload válido → Resend mock 200 {id} → grava zapp.emails
//    direction='outbound' status='sent' → 200 {ok, messageId, emailId};
//  - Resend erro → insert status='failed' + status do provider;
//  - anexos: storage upload + base64 repassado ao Resend; base64 inválido → 422.
import { assertEquals } from "jsr:@std/assert";
import { _resetRateLimitForTests } from "../../_shared/validation.ts";
type H = (r: Request) => Promise<Response> | Response;
let h: H = () => new Response("");
Object.defineProperty(Deno, "serve", { value: (fn: H) => { h = fn; return { finished: Promise.resolve(), shutdown: () => {} }; }, writable: true, configurable: true });
for (const [k, v] of Object.entries({
  SELFHOSTED_SUPABASE_URL: "http://mock.local",
  SELFHOSTED_SUPABASE_ANON_KEY: "test-anon-key-123456",
  SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
})) Deno.env.set(k, v);
const J = { "content-type": "application/json" };
const Jres = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: J });
// ── estado do mock ─────────────────────────────────────────────────────────────
let resendStatus = 200;
let resendBody: unknown = { id: "re-out-1" };
const resendCalls: Array<{ body: Record<string, unknown>; auth: string | null }> = [];
const emailInserts: Array<Record<string, unknown>> = [];
const storageUploads: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const p = new URL(String(input)).pathname;
  const m = init?.method ?? "GET";
  let b: Record<string, unknown> | null = null;
  if (init?.body) { try { b = JSON.parse(String(init.body)) as Record<string, unknown>; } catch { b = null; } } // storage upload body é binário
  const auth = new Headers(init?.headers).get("authorization");
  if (p.endsWith("/auth/v1/user")) return Jres({ user: { id: "user-1", email: "u@example.com" } });
  if (p.endsWith("/emails") && String(input).includes("api.resend.com")) {
    resendCalls.push({ body: b ?? {}, auth });
    return Jres(resendBody, resendStatus);
  }
  if (p.endsWith("/emails") && m === "POST") { emailInserts.push(b ?? {}); return Jres({ id: "email-1" }, 201); }
  if (p.startsWith("/storage/v1/object/email-attachments/")) { storageUploads.push(p); return Jres({ Key: p }, 200); }
  return Jres({ unhandled: true, url: String(input) }, 404);
}) as typeof fetch;
await import("../index.ts");
const b64u = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const JWT = `h.${b64u({ sub: "user-1", role: "authenticated", iss: "http://mock.local" })}.s`;
const reset = () => {
  resendStatus = 200; resendBody = { id: "re-out-1" };
  resendCalls.length = 0; emailInserts.length = 0; storageUploads.length = 0;
  Deno.env.set("RESEND_API_KEY", "test-resend-key");
  _resetRateLimitForTests();
};
reset();
const call = (body: unknown, jwt?: string) => h(new Request("http://mock.local/zapp-email-send", {
  method: "POST", body: JSON.stringify(body), headers: { ...J, ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) },
}));
const BODY = { to: "ana@example.com", subject: "Olá", html: "<p>corpo</p>" };

// ─── 401 ───────────────────────────────────────────────────────────────────────
Deno.test("zapp-email-send: sem JWT → 401 (requireUser), zero chamadas externas", async () => {
  reset();
  const res = await call(BODY);
  assertEquals(res.status, 401);
  assertEquals(resendCalls.length, 0);
  assertEquals(emailInserts.length, 0);
});
Deno.test("zapp-email-send: JWT role=anon → 401", async () => {
  reset();
  const anon = `h.${b64u({ sub: "user-1", role: "anon", iss: "http://mock.local" })}.s`;
  assertEquals((await call(BODY, anon)).status, 401);
});

// ─── 503 sem RESEND_API_KEY ────────────────────────────────────────────────────
Deno.test("zapp-email-send: sem RESEND_API_KEY → 503 (nunca 500), sem inserts", async () => {
  reset();
  Deno.env.delete("RESEND_API_KEY");
  const res = await call(BODY, JWT);
  assertEquals(res.status, 503);
  assertEquals(emailInserts.length, 0);
  assertEquals(resendCalls.length, 0);
});

// ─── send feliz (Resend mock) ──────────────────────────────────────────────────
Deno.test("zapp-email-send: payload válido → Resend 200 → grava zapp.emails outbound/sent + 200 {ok,messageId,emailId}", async () => {
  reset();
  const res = await call(BODY, JWT);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, messageId: "re-out-1", emailId: "email-1" });
  assertEquals(resendCalls.length, 1);
  const c = resendCalls[0];
  assertEquals(c.auth, "Bearer test-resend-key");
  assertEquals(c.body.from, "noreply@zappweb.app");
  assertEquals(c.body.to, ["ana@example.com"]);
  assertEquals(c.body.subject, "Olá");
  assertEquals(c.body.html, "<p>corpo</p>");
  assertEquals(emailInserts.length, 1);
  const row = emailInserts[0];
  assertEquals(row.message_id, "re-out-1");
  assertEquals(row.direction, "outbound");
  assertEquals(row.status, "sent");
  assertEquals(row.user_id, "user-1");
  assertEquals(row.from_email, "noreply@zappweb.app");
  assertEquals(row.to_emails, ["ana@example.com"]);
});

// ─── erro do Resend → registra failed ──────────────────────────────────────────
Deno.test("zapp-email-send: Resend 422 → 422 + insert status=failed com error_message", async () => {
  reset();
  resendStatus = 422;
  resendBody = { message: "validation error" };
  const res = await call(BODY, JWT);
  assertEquals(res.status, 422);
  assertEquals((await res.json() as { error: string }).error, "validation error");
  assertEquals(emailInserts.length, 1);
  const row = emailInserts[0];
  assertEquals(row.status, "failed");
  assertEquals(row.error_message, "resend_422: validation error");
  assertEquals("message_id" in row, false); // insert de falha não registra message_id
});

// ─── anexos ────────────────────────────────────────────────────────────────────
Deno.test("zapp-email-send: anexo válido → storage upload + base64 repassado ao Resend + metadata no insert", async () => {
  reset();
  const b64 = btoa("conteudo");
  const res = await call({ ...BODY, attachments: [{ filename: "doc.pdf", content_type: "application/pdf", content: b64 }] }, JWT);
  assertEquals(res.status, 200);
  assertEquals(storageUploads.length, 1);
  assertEquals(storageUploads[0].includes("outbound/user-1/"), true);
  assertEquals(resendCalls[0].body.attachments, [{ filename: "doc.pdf", content: b64 }]);
  const row = emailInserts[0];
  assertEquals((row.attachments as Array<Record<string, unknown>>)[0].filename, "doc.pdf");
  assertEquals((row.attachments as Array<Record<string, unknown>>)[0].content_type, "application/pdf");
});
Deno.test("zapp-email-send: anexo base64 inválido → 422 sem chamar Resend nem storage", async () => {
  reset();
  const res = await call({ ...BODY, attachments: [{ filename: "a.pdf", content: "!!!não-base64!!!" }] }, JWT);
  assertEquals(res.status, 422);
  assertEquals(resendCalls.length, 0);
  assertEquals(storageUploads.length, 0);
  assertEquals(emailInserts.length, 0);
});
