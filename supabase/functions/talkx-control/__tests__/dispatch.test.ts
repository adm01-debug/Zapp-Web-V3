// talkx-control — behavioral contract tests do disparo MANUAL (handler REAL via Deno.serve stub + fetch mock, sem rede/DB).
// Rodar: deno test --allow-net --allow-env --allow-read supabase/functions/talkx-control/__tests__/dispatch.test.ts
//
// Contrato sob teste (E61 — disparo real de campanha comprovado):
//   Frontend (useTalkX.startCampaign) → talkx-control { action:'start', campaignId } →
//   valida admin/supervisor (JWT) → status 'sending' + started_at →
//   dispatch fire-and-forget para /functions/v1/talkx-send { campaignId, action:'start' }
//   com service-role bearer + X-Internal-Call.
//   pause/cancel → status 'paused'/'cancelled' SEM disparo.
import { assertEquals, assert } from "jsr:@std/assert";

type H = (r: Request) => Promise<Response> | Response;
let h: H = () => new Response("");
Object.defineProperty(Deno, "serve", {
  value: (fn: H) => { h = fn; return { finished: Promise.resolve(), shutdown: () => {} }; },
  writable: true,
  configurable: true,
});

// ── env (módulo) ─────────────────────────────────────────────────────────────
const SUPABASE_URL = "http://mock.local";
const SERVICE_KEY = "svc-test-key-1234567890abcdef";
const ANON_KEY = "anon-test-key-1234567890";
for (const [k, v] of Object.entries({
  SELFHOSTED_SUPABASE_URL: SUPABASE_URL,
  SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  SELFHOSTED_SUPABASE_ANON_KEY: ANON_KEY,
  EVOLUTION_API_URL: "http://evo.mock",
  EVOLUTION_API_KEY: "evo-key",
})) Deno.env.set(k, v);

const J = { "content-type": "application/json" };
const Jres = (body: string, status = 200) => new Response(body, { status, headers: J });

const CAMPAIGN_ID = "3f2b8f1e-6d4a-4c9e-9b7a-1c2d3e4f5a6b";
const USER_ID = "9e8d7c6b-5a4f-4e3d-2c1b-0a9f8e7d6c5b";

// ── estado do mock ───────────────────────────────────────────────────────────
let campaignRow: Record<string, unknown> | null = null;
let isPrivileged = true;
let sendDispatchStatus = 200;
const sendDispatches: Array<{ url: string; body: unknown; headers: Record<string, string> }> = [];
const campaignPatches: Array<Record<string, unknown>> = [];

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : null;

  // dispatch interno para talkx-send (fire-and-forget do control)
  if (url.pathname.endsWith("/functions/v1/talkx-send")) {
    sendDispatches.push({
      url: url.toString(),
      body,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
    });
    return Jres(JSON.stringify({ success: true, sent: 0 }), sendDispatchStatus);
  }

  // Auth: getUser do supabase-js → GET /auth/v1/user
  if (url.pathname.endsWith("/auth/v1/user") && method === "GET") {
    return Jres(JSON.stringify({ user: { id: USER_ID, email: "admin@mock.local" } }));
  }

  // PostgREST
  if (url.pathname.endsWith("/rest/v1/rpc/is_admin_or_supervisor") && method === "POST") {
    return Jres(JSON.stringify(isPrivileged));
  }
  if (url.pathname.endsWith("/rest/v1/talkx_campaigns")) {
    if (method === "GET") {
      return Jres(JSON.stringify(campaignRow)); // maybeSingle → objeto bare ou null
    }
    if (method === "PATCH") {
      campaignPatches.push(body as Record<string, unknown>);
      return new Response(null, { status: 204 });
    }
  }
  return Jres("[]");
}) as typeof fetch;

await import("../index.ts");

// ── helpers ───────────────────────────────────────────────────────────────────
const reset = () => {
  campaignRow = null;
  isPrivileged = true;
  sendDispatchStatus = 200;
  sendDispatches.length = 0;
  campaignPatches.length = 0;
};

const b64u = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const JWT = () => `h.${b64u({ sub: USER_ID, role: "authenticated", iss: SUPABASE_URL })}.s`;

const adminCall = (body: unknown) =>
  h(new Request("http://mock.local/functions/v1/talkx-control", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { ...J, authorization: `Bearer ${JWT()}` },
  }));

const anonCall = (body: unknown) =>
  h(new Request("http://mock.local/functions/v1/talkx-control", {
    method: "POST",
    body: JSON.stringify(body),
    headers: J,
  }));

const campaign = (status: string) => ({ id: CAMPAIGN_ID, status });

// ─── 1. Auth: sem JWT → 401, sem nenhuma consulta ────────────────────────────
Deno.test("talkx-control: sem JWT → 401, sem dispatch", async () => {
  reset();
  const res = await anonCall({ action: "start", campaignId: CAMPAIGN_ID });
  assertEquals(res.status, 401);
  assertEquals(sendDispatches.length, 0);
  assertEquals(campaignPatches.length, 0);
});

// ─── 2. start → status 'sending' + dispatch talkx-send (prova do caminho manual) ──
Deno.test("talkx-control: start → campanha 'sending' + dispatch fire-and-forget talkx-send {campaignId, action:'start'}", async () => {
  reset();
  campaignRow = campaign("draft");
  const res = await adminCall({ action: "start", campaignId: CAMPAIGN_ID });
  const json = await res.json();

  assertEquals(res.status, 200);
  assertEquals(json.success, true);
  assertEquals(json.status, "sending");

  // status persistido com started_at
  assertEquals(campaignPatches.length, 1);
  assertEquals(campaignPatches[0].status, "sending");
  assert(typeof campaignPatches[0].started_at === "string", "started_at preenchido");

  // dispatch do talkx-send (caminho real do disparo manual)
  assertEquals(sendDispatches.length, 1, "talkx-send deve ser disparado");
  assertEquals(sendDispatches[0].body, { campaignId: CAMPAIGN_ID, action: "start" });
  assert(sendDispatches[0].url.includes("/functions/v1/talkx-send"), "URL do talkx-send");
  const authHeader = sendDispatches[0].headers["authorization"] ?? sendDispatches[0].headers["Authorization"] ?? "";
  assert(authHeader.includes(SERVICE_KEY), "dispatch autenticado com service-role");
  assert("x-internal-call" in sendDispatches[0].headers, "header X-Internal-Call presente");
});

// ─── 3. Transições inválidas → 409, sem patch e sem dispatch ─────────────────
Deno.test("talkx-control: start de campanha 'completed' → 409, sem patch/dispatch", async () => {
  reset();
  campaignRow = campaign("completed");
  const res = await adminCall({ action: "start", campaignId: CAMPAIGN_ID });
  assertEquals(res.status, 409);
  assertEquals(campaignPatches.length, 0);
  assertEquals(sendDispatches.length, 0);
});

// ─── 4. pause de 'sending' → 'paused', SEM dispatch ──────────────────────────
Deno.test("talkx-control: pause de 'sending' → status paused, sem dispatch talkx-send", async () => {
  reset();
  campaignRow = campaign("sending");
  const res = await adminCall({ action: "pause", campaignId: CAMPAIGN_ID });
  const json = await res.json();

  assertEquals(res.status, 200);
  assertEquals(json.status, "paused");
  assertEquals(campaignPatches.length, 1);
  assertEquals(campaignPatches[0].status, "paused");
  assertEquals(sendDispatches.length, 0, "pause não dispara envio");
});

// ─── 5. Campanha inexistente → 404 ───────────────────────────────────────────
Deno.test("talkx-control: campaignId inexistente → 404", async () => {
  reset();
  campaignRow = null;
  const res = await adminCall({ action: "start", campaignId: CAMPAIGN_ID });
  assertEquals(res.status, 404);
  assertEquals(sendDispatches.length, 0);
});

// ─── 6. Não-privilegiado → 403 ───────────────────────────────────────────────
Deno.test("talkx-control: usuário sem privilégio → 403, sem dispatch", async () => {
  reset();
  campaignRow = campaign("draft");
  isPrivileged = false;
  const res = await adminCall({ action: "start", campaignId: CAMPAIGN_ID });
  assertEquals(res.status, 403);
  assertEquals(sendDispatches.length, 0);
});
