// talkx-scheduler — behavioral contract tests (handler REAL via Deno.serve stub + fetch mock, sem rede/DB).
// Rodar: deno test --allow-net --allow-env --allow-read supabase/functions/talkx-scheduler/__tests__/dispatch.test.ts
//
// Contrato sob teste (E61 — disparo real de campanha agendada):
//   pg_cron (* * * * *) → /functions/v1/talkx-scheduler (cron secret) →
//   claim atômico scheduled→processing → fetch interno /functions/v1/talkx-send
//   com { campaignId, action:'start' } → resposta agregada { started, failed, details }.
//
// ESTADO RED esperado (bug real E61): index.ts usa `supabaseUrl`/`serviceKey`
// (linhas ~86/89) SEM declará-los — ReferenceError no momento do disparo, capturado
// pelo catch interno, que reverte a campanha para 'scheduled' e retorna
// { success:true, started:0, failed:1 } — ou seja, a campanha NUNCA dispara.
// Os testes de dispatch abaixo falham com o bug presente e passam com o fix
// (declaração das vars no mesmo padrão de talkx-control).
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
const CRON_SECRET = "cron-test-secret";
for (const [k, v] of Object.entries({
  SELFHOSTED_SUPABASE_URL: SUPABASE_URL,
  SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  CRON_SECRET,
  EVOLUTION_API_URL: "http://evo.mock",
  EVOLUTION_API_KEY: "evo-key",
})) Deno.env.set(k, v);

const J = { "content-type": "application/json" };
const Jres = (body: string, status = 200, extraHeaders: Record<string, string> = {}) =>
  new Response(body, { status, headers: { ...J, ...extraHeaders } });

const CAMPAIGN_ID = "3f2b8f1e-6d4a-4c9e-9b7a-1c2d3e4f5a6b";
const CAMPAIGN_NAME = "Black Friday 2026";

// ── estado do mock PostgREST + talkx-send ────────────────────────────────────
let dueCampaigns: Array<Record<string, unknown>> = [];
let claimCount = 1; // rows afetadas pelo update de claim (0 = já claimada por outro)
let sendStatus = 200;
let sendBody: Record<string, unknown> = { success: true, sent: 1 };
const sendInvocations: Array<{ url: string; body: unknown; headers: Record<string, string> }> = [];
const patchedCampaigns: Array<{ id: string; body: Record<string, unknown>; filter: string; allParams: string }> = [];

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : null;

  if (url.pathname.endsWith("/functions/v1/talkx-send")) {
    sendInvocations.push({
      url: url.toString(),
      body,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
    });
    return Jres(JSON.stringify(sendBody), sendStatus);
  }

  // PostgREST: /rest/v1/talkx_campaigns
  if (url.pathname.endsWith("/rest/v1/talkx_campaigns")) {
    const status = url.searchParams.get("status");
    if (method === "GET" && status === "eq.scheduled") {
      return Jres(JSON.stringify(dueCampaigns));
    }
    if (method === "PATCH") {
      const filter = url.searchParams.get("id") ?? "";
      const id = filter.replace(/^eq\./, "");
      patchedCampaigns.push({ id, body: body as Record<string, unknown>, filter, allParams: url.search });
      // claim: update + count exact → supabase-js lê count do Content-Range
      return new Response(null, {
        status: 204,
        headers: { "content-range": `*/${claimCount}` },
      });
    }
  }
  return Jres("[]");
}) as typeof fetch;

await import("../index.ts");

// ── helpers ───────────────────────────────────────────────────────────────────
const reset = () => {
  dueCampaigns = [];
  claimCount = 1;
  sendStatus = 200;
  sendBody = { success: true, sent: 1 };
  sendInvocations.length = 0;
  patchedCampaigns.length = 0;
};

const cronCall = (body: unknown = {}) =>
  h(new Request("http://mock.local/functions/v1/talkx-scheduler", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { ...J, "x-cron-secret": CRON_SECRET },
  }));

const publicCall = () =>
  h(new Request("http://mock.local/functions/v1/talkx-scheduler", {
    method: "POST",
    body: JSON.stringify({}),
    headers: J,
  }));

// ─── 1. Auth: sem cron secret / service role → 401 ───────────────────────────
Deno.test("talkx-scheduler: sem cron secret → 401 e ZERO consultas", async () => {
  reset();
  const res = await publicCall();
  assertEquals(res.status, 401);
  assertEquals(sendInvocations.length, 0);
  assertEquals(dueCampaigns.length, 0);
});

// ─── 2. RED (gap E61): campanha vencida → claim + disparo talkx-send ─────────
Deno.test("talkx-scheduler: campanha vencida → claim atômico + dispatch talkx-send {campaignId, action:'start'}", async () => {
  reset();
  dueCampaigns = [{ id: CAMPAIGN_ID, name: CAMPAIGN_NAME, scheduled_at: "2026-08-18T10:00:00.000Z" }];
  const res = await cronCall();
  const json = await res.json();
  assertEquals(res.status, 200);
  assertEquals(json.success, true);
  // RED hoje: started=0, failed=1 (ReferenceError de supabaseUrl capturado e revertido)
  assertEquals(json.started, 1, "dispatch do talkx-send deve ocorrer (started=1)");
  assertEquals(json.failed, 0);
  // Claim registrado (scheduled → processing)
  assertEquals(patchedCampaigns.length, 1);
  assertEquals(patchedCampaigns[0].body.status, "processing");
  assertEquals(patchedCampaigns[0].id, CAMPAIGN_ID);
  // talkx-send invocado com o payload correto
  assertEquals(sendInvocations.length, 1, "talkx-send deve ser invocado exatamente 1x");
  const inv = sendInvocations[0];
  assertEquals(inv.body, { campaignId: CAMPAIGN_ID, action: "start" });
  assert(inv.url.includes("/functions/v1/talkx-send"), "URL do talkx-send");
});

// ─── 3. Nenhuma campanha vencida → sem dispatch ──────────────────────────────
Deno.test("talkx-scheduler: nenhuma campanha vencida → success sem dispatch", async () => {
  reset();
  dueCampaigns = [];
  const res = await cronCall();
  const json = await res.json();
  assertEquals(res.status, 200);
  assertEquals(json.success, true);
  assertEquals(sendInvocations.length, 0);
  assertEquals(patchedCampaigns.length, 0);
});

// ─── 4. Corrida de claim: outra invocação já claimou → skip (sem dispatch) ───
Deno.test("talkx-scheduler: claim concorrente (0 rows) → campanha pulada, sem dispatch", async () => {
  reset();
  dueCampaigns = [{ id: CAMPAIGN_ID, name: CAMPAIGN_NAME, scheduled_at: "2026-08-18T10:00:00.000Z" }];
  claimCount = 0;
  const res = await cronCall();
  const json = await res.json();
  assertEquals(json.started, 0);
  assertEquals(json.failed, 0);
  assertEquals(sendInvocations.length, 0, "sem claim não pode disparar");
});

// ─── 5. talkx-send falha (500) → status revertido para scheduled ─────────────
Deno.test("talkx-scheduler: talkx-send 500 → campanha revertida para scheduled (retry no próximo tick)", async () => {
  reset();
  dueCampaigns = [{ id: CAMPAIGN_ID, name: CAMPAIGN_NAME, scheduled_at: "2026-08-18T10:00:00.000Z" }];
  sendStatus = 500;
  sendBody = { error: "boom" };
  const res = await cronCall();
  const json = await res.json();
  assertEquals(res.status, 200);
  assertEquals(json.started, 0);
  assertEquals(json.failed, 1);
  // revert: update status=scheduled com filtro status=eq.processing
  const revert = patchedCampaigns.filter((p) => p.body.status === "scheduled");
  assertEquals(revert.length, 1, "deve reverter para scheduled");
  assert(revert[0].allParams.includes("status=eq.processing"), "revert condicionado a processing");
});
