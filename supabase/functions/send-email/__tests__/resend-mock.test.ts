// send-email — behavioral tests (handler REAL via Deno.serve stub + fetch mock, sem rede/DB).
// Rodar: deno test --allow-read --allow-env supabase/functions/send-email/__tests__/resend-mock.test.ts
//
// Cobre o fluxo SEND:
//  - 401: sem JWT (requireUser);
//  - Resend mock: fallback {to, subject, html} com RESEND_API_KEY → 200
//    {messageId, provider:'resend'} e assert do payload enviado ao Resend;
//  - Resend erro → status/mensagem do provider;
//  - Sem RESEND_API_KEY → 503 (nunca 500);
//  - accountId → delega para gmail-send (fetch mock) → 200 pass-through.
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
let resendBody: unknown = { id: "resend-msg-1" };
let gmailSendStatus = 200;
let gmailSendBody: unknown = { messageId: "gmail-msg-1", threadId: "gmail-th-1" };
const resendCalls: Array<{ body: Record<string, unknown>; auth: string | null }> = [];
const gmailSendCalls: Array<{ body: Record<string, unknown>; auth: string | null }> = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const p = new URL(String(input)).pathname;
  const b = init?.body ? JSON.parse(String(init.body)) : null;
  const auth = new Headers(init?.headers).get("authorization");
  if (p.endsWith("/auth/v1/user")) return Jres({ user: { id: "user-1", email: "u@example.com" } });
  if (p.endsWith("/emails") && String(input).includes("api.resend.com")) {
    resendCalls.push({ body: b, auth });
    return Jres(resendBody, resendStatus);
  }
  if (p.endsWith("/functions/v1/gmail-send")) {
    gmailSendCalls.push({ body: b, auth });
    return Jres(gmailSendBody, gmailSendStatus);
  }
  return Jres({ unhandled: true, url: String(input) }, 404);
}) as typeof fetch;
await import("../index.ts");
const b64u = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const JWT = `h.${b64u({ sub: "user-1", role: "authenticated", iss: "http://mock.local" })}.s`;
const reset = () => {
  resendStatus = 200; resendBody = { id: "resend-msg-1" };
  gmailSendStatus = 200; gmailSendBody = { messageId: "gmail-msg-1", threadId: "gmail-th-1" };
  resendCalls.length = 0; gmailSendCalls.length = 0;
  Deno.env.set("RESEND_API_KEY", "test-resend-key");
  _resetRateLimitForTests();
};
reset();
const call = (body: unknown, jwt?: string) => h(new Request("http://mock.local/send-email", {
  method: "POST", body: JSON.stringify(body), headers: { ...J, ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) },
}));

// ─── 401 ───────────────────────────────────────────────────────────────────────
Deno.test("send-email: sem JWT → 401 (requireUser), sem chamadas externas", async () => {
  reset();
  const res = await call({ to: "ana@example.com", subject: "S", html: "<p>x</p>" });
  assertEquals(res.status, 401);
  assertEquals(resendCalls.length, 0);
  assertEquals(gmailSendCalls.length, 0);
});
Deno.test("send-email: JWT role=anon → 401", async () => {
  reset();
  const anon = `h.${b64u({ sub: "user-1", role: "anon", iss: "http://mock.local" })}.s`;
  assertEquals((await call({ to: "ana@example.com", subject: "S", html: "<p>x</p>" }, anon)).status, 401);
});

// ─── Resend mock (fallback sem accountId) ─────────────────────────────────────
Deno.test("send-email: fallback Resend → 200 {messageId, provider:'resend'} + payload correto", async () => {
  reset();
  const res = await call({ to: "ana@example.com", subject: "Olá", html: "<p>corpo</p>" }, JWT);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { messageId: "resend-msg-1", provider: "resend" });
  assertEquals(resendCalls.length, 1);
  const c = resendCalls[0];
  assertEquals(c.auth, "Bearer test-resend-key");
  assertEquals(c.body.from, "noreply@zappweb.app");
  assertEquals(c.body.to, ["ana@example.com"]);
  assertEquals(c.body.subject, "Olá");
  assertEquals(c.body.html, "<p>corpo</p>");
  assertEquals(gmailSendCalls.length, 0);
});
Deno.test("send-email: Resend com erro → status + mensagem do provider", async () => {
  reset();
  resendStatus = 422;
  resendBody = { message: "validation error: to is invalid" };
  const res = await call({ to: "ana@example.com", subject: "S", html: "<p>x</p>" }, JWT);
  assertEquals(res.status, 422);
  assertEquals(await res.json(), { error: "validation error: to is invalid" });
});
Deno.test("send-email: sem RESEND_API_KEY → 503 (nunca 500)", async () => {
  reset();
  Deno.env.delete("RESEND_API_KEY");
  const res = await call({ to: "ana@example.com", subject: "S", html: "<p>x</p>" }, JWT);
  assertEquals(res.status, 503);
  const b = await res.json() as { error: string };
  assertEquals(b.error.includes("Nenhum provedor de email configurado"), true);
});

// ─── Delegação accountId → gmail-send ─────────────────────────────────────────
Deno.test("send-email: accountId → delega para gmail-send (fetch mock) → 200 pass-through com JWT do caller", async () => {
  reset();
  const res = await call({ accountId: "acc-1", to: "ana@example.com", subject: "S", html: "<p>x</p>" }, JWT);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { messageId: "gmail-msg-1", threadId: "gmail-th-1" });
  assertEquals(gmailSendCalls.length, 1);
  assertEquals(resendCalls.length, 0);
  // Authorization do caller é repassado para gmail-send (verificação de propriedade da conta)
  assertEquals(gmailSendCalls[0].auth, `Bearer ${JWT}`);
  assertEquals(gmailSendCalls[0].body.accountId, "acc-1");
});
Deno.test("send-email: accountId com gmail-send 502 → 502 pass-through", async () => {
  reset();
  gmailSendStatus = 502;
  gmailSendBody = { error: "Failed to send message" };
  const res = await call({ accountId: "acc-1", to: "ana@example.com", subject: "S", html: "<p>x</p>" }, JWT);
  assertEquals(res.status, 502);
  assertEquals((await res.json() as { error: string }).error, "Failed to send message");
});
