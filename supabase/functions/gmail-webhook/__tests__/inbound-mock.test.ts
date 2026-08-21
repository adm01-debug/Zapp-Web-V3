// gmail-webhook — behavioral tests (handler REAL via Deno.serve stub + fetch mock, sem rede/DB).
// Rodar: deno test --allow-read --allow-env supabase/functions/gmail-webhook/__tests__/inbound-mock.test.ts
//
// Cobre o fluxo INBOUND Pub/Sub (Gmail push notification):
//  - 401: push sem token / token errado (F2 fail-closed) e registerWatch sem JWT;
//  - grava: push válido → processHistory → fetch da mensagem na Gmail API →
//    upsert em gmail_threads + gmail_messages (persistência real via mock PostgREST);
//  - GET /status → healthy.
import { assertEquals } from "jsr:@std/assert";
type H = (r: Request) => Promise<Response> | Response;
let h: H = () => new Response("");
Object.defineProperty(Deno, "serve", { value: (fn: H) => { h = fn; return { finished: Promise.resolve(), shutdown: () => {} }; }, writable: true, configurable: true });
const PUSH_TOKEN = "test-pubsub-token";
for (const [k, v] of Object.entries({
  SELFHOSTED_SUPABASE_URL: "http://mock.local",
  SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  SELFHOSTED_SUPABASE_ANON_KEY: "test-anon-key-123456",
  GMAIL_PUBSUB_TOPIC: "projects/zapp/topics/gmail-push",
  GMAIL_PUBSUB_TOKEN: PUSH_TOKEN,
})) Deno.env.set(k, v);
const J = { "content-type": "application/json" };
const Jres = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { ...J, ...headers } });
// ── estado do mock ─────────────────────────────────────────────────────────────
let account: Record<string, unknown> | null = null;           // email_accounts
let watch: Record<string, unknown> | null = null;              // email_watch_history
let historyPayload: { history: Array<{ messagesAdded: Array<{ message: { id: string } }> }> };
const threadUpserts: Array<Record<string, unknown>> = [];
const msgUpserts: Array<Record<string, unknown>> = [];
const watchUpserts: Array<Record<string, unknown>> = [];
const gmailApiCalls: string[] = [];
const b64 = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const MSG = {
  id: "msg-1", threadId: "th-1", snippet: "Olá mundo", labelIds: ["INBOX", "UNREAD"],
  payload: {
    mimeType: "multipart/alternative",
    headers: [
      { name: "Subject", value: "Assunto teste" },
      { name: "From", value: "Ana Silva <ana@example.com>" },
      { name: "To", value: "bob@example.com" },
      { name: "Date", value: "2026-08-17T10:00:00.000Z" },
    ],
    parts: [
      { mimeType: "text/plain", body: { data: b64("corpo texto") } },
      { mimeType: "text/html", body: { data: b64("<p>corpo html</p>") } },
    ],
  },
};
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = new URL(String(input));
  const p = u.pathname;
  const m = init?.method ?? "GET";
  const b = init?.body ? JSON.parse(String(init.body)) : null;
  const single = (new Headers(init?.headers).get("accept") ?? "").includes("application/vnd.pgrst.object+json");
  if (p.endsWith("/auth/v1/user")) return Jres({ user: { id: "user-1", email: "u@example.com" } });
  if (p.endsWith("/email_accounts")) return Jres(single ? account : account ? [account] : []);
  if (p.endsWith("/email_watch_history") && m === "GET") return Jres(single ? watch : watch ? [watch] : []);
  if (p.endsWith("/email_watch_history") && m === "POST") { watchUpserts.push(b); return Jres([], 201); }
  if (p.endsWith("/gmail_threads") && m === "POST") { threadUpserts.push(b); return Jres([], 201); }
  if (p.endsWith("/gmail_threads") && m === "PATCH") return new Response(null, { status: 204 });
  if (p.endsWith("/gmail_threads") && m === "GET") return Jres(single ? { id: "th-1" } : [{ id: "th-1" }]);
  if (p.endsWith("/gmail_messages") && m === "POST") { msgUpserts.push(b); return Jres([], 201); }
  if (p.endsWith("/gmail_messages") && m === "GET") return Jres([], 200, { "content-range": "0-0/1" }); // count unread
  if (p.startsWith("/gmail/v1/users/me/history")) { gmailApiCalls.push("history"); return Jres(historyPayload); }
  if (p.startsWith("/gmail/v1/users/me/messages/")) { gmailApiCalls.push("message"); return Jres(MSG); }
  return Jres({ unhandled: true, url: String(input) }, 404);
}) as typeof fetch;
await import("../index.ts");
const ACCOUNT: Record<string, unknown> = {
  id: "acc-1", email: "bob@example.com", access_token: "stub-access-token",
  refresh_token: "stub-refresh-token", token_expires_at: "2099-01-01T00:00:00.000Z",
  client_id: null, client_secret: null,
};
const reset = () => {
  account = null; watch = null;
  historyPayload = { history: [{ messagesAdded: [{ message: { id: "msg-1" } }] }] };
  threadUpserts.length = 0; msgUpserts.length = 0; watchUpserts.length = 0; gmailApiCalls.length = 0;
};
reset();
const pushBody = (emailAddress = "bob@example.com", historyId = "h-200") => ({
  message: { data: b64(JSON.stringify({ emailAddress, historyId })), messageId: "pm-1", publishTime: "2026-08-17T10:00:00.000Z" },
  subscription: "projects/zapp/subscriptions/gmail-push",
});
const push = (body: unknown, token?: string) => h(new Request(`http://mock.local/gmail-webhook${token ? `?token=${token}` : ""}`, {
  method: "POST", body: JSON.stringify(body), headers: J,
}));

// ─── 401 (F2 fail-closed) ──────────────────────────────────────────────────────
Deno.test("gmail-webhook inbound: push sem token → 401 (fail-closed), zero chamadas Gmail", async () => {
  reset(); account = { ...ACCOUNT };
  const res = await push(pushBody());
  assertEquals(res.status, 401);
  assertEquals(gmailApiCalls.length, 0);
  assertEquals(msgUpserts.length, 0);
});
Deno.test("gmail-webhook inbound: push com token errado → 401", async () => {
  reset(); account = { ...ACCOUNT };
  assertEquals((await push(pushBody(), "token-errado")).status, 401);
});
Deno.test("gmail-webhook inbound: registerWatch sem JWT → 401 (requireUser)", async () => {
  reset();
  const res = await push({ action: "registerWatch", accountId: "acc-1" });
  assertEquals(res.status, 401);
  assertEquals(msgUpserts.length, 0);
});

// ─── inbound grava (push válido → persiste mensagem no banco) ─────────────────
Deno.test("gmail-webhook inbound: push válido → 200 ok + grava gmail_threads/gmail_messages (from/subject/body parseados)", async () => {
  reset(); account = { ...ACCOUNT }; watch = { history_id: "h-100" };
  const res = await push(pushBody(), PUSH_TOKEN);
  assertEquals(res.status, 200);
  // Auto-detecção (nenhuma versão pedida) tenta v2→v1; este fixture só casa com v1,
  // que está em janela de sunset (2027-06-01) → resposta carrega deprecated+sunset.
  assertEquals(res.headers.get("x-contract-version"), "v1");
  assertEquals(res.headers.get("x-contract-deprecated"), "true");
  assertEquals(res.headers.get("sunset"), "2027-06-01");
  assertEquals(await res.json(), { ok: true });
  // processHistory: history + message fetchados da Gmail API
  assertEquals(gmailApiCalls, ["history", "message"]);
  // grava: thread upsertada
  const th = threadUpserts[0] as Record<string, unknown>;
  assertEquals(th.account_id, "acc-1");
  assertEquals(th.thread_id, "th-1");
  assertEquals(th.subject, "Assunto teste");
  // grava: mensagem upsertada com headers parseados
  const m = msgUpserts[0] as Record<string, unknown>;
  assertEquals(m.account_id, "acc-1");
  assertEquals(m.message_id, "msg-1");
  assertEquals(m.thread_id_ref, "th-1");
  assertEquals(m.from_email, "ana@example.com");
  assertEquals(m.from_name, "Ana Silva");
  assertEquals(m.subject, "Assunto teste");
  assertEquals(m.body_plain, "corpo texto");
  assertEquals(m.body_html, "<p>corpo html</p>");
  assertEquals(m.is_read, false);   // UNREAD no labelIds
  assertEquals(m.is_sent, false);
  assertEquals(m.label_ids, ["INBOX", "UNREAD"]);
  // watch history avançado para o historyId do push
  const w = watchUpserts[watchUpserts.length - 1] as Record<string, unknown>;
  assertEquals(w.history_id, "h-200");
  assertEquals(w.account_id, "acc-1");
});

// ─── caminhos benignos / status ────────────────────────────────────────────────
Deno.test("gmail-webhook inbound: push com token válido mas conta inexistente → 200 skipped account_not_found", async () => {
  reset(); // account = null → email_accounts vazio
  const res = await push(pushBody("nao-existe@example.com"), PUSH_TOKEN);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, skipped: "account_not_found" });
  assertEquals(gmailApiCalls.length, 0);
  assertEquals(msgUpserts.length, 0);
});
Deno.test("gmail-webhook inbound: GET /status → healthy + token_configured", async () => {
  const res = await h(new Request("http://mock.local/gmail-webhook", { method: "GET" }));
  assertEquals(res.status, 200);
  const b = await res.json() as Record<string, unknown>;
  assertEquals(b.service, "gmail-webhook");
  assertEquals(b.status, "healthy");
  assertEquals(b.token_configured, true);
});
