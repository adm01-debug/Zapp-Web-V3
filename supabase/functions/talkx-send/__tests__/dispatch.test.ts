// talkx-send — behavioral contract tests do DISPARO REAL (handler REAL via Deno.serve stub + fetch mock, sem rede/DB).
// Rodar: deno test --allow-net --allow-env --allow-read supabase/functions/talkx-send/__tests__/dispatch.test.ts
//
// Contrato sob teste (E61 — disparo real de campanha comprovado):
//   talkx-send recebe { campaignId, action } e, para cada destinatário elegível:
//     1. personaliza o template ({{nome}} → primeiro nome, etc.);
//     2. marca recipient 'sending' com personalized_message + request_id;
//     3. chama a Evolution API (updatePresence + sendText/sendMedia) — MOCK do envio;
//     4. marca 'sent'/'failed' com timestamps e atualiza contadores da campanha;
//     5. ao final, se status ainda 'sending' → 'completed'.
//   Blacklist → recipient 'skipped' (opt-out), sem chamada de envio.
//
// Prova: o caminho real de disparo (PostgREST → Evolution) é exercitado de ponta
// a ponta com o envio HTTP mockado — nenhuma chamada real à Evolution acontece.
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
const EVO_URL = "http://evo.mock";
for (const [k, v] of Object.entries({
  SELFHOSTED_SUPABASE_URL: SUPABASE_URL,
  SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  CRON_SECRET,
  EVOLUTION_API_URL: EVO_URL,
  EVOLUTION_API_KEY: "evo-key",
})) Deno.env.set(k, v);

const J = { "content-type": "application/json" };
const Jres = (body: string, status = 200) => new Response(body, { status, headers: J });

const CAMPAIGN_ID = "3f2b8f1e-6d4a-4c9e-9b7a-1c2d3e4f5a6b";
const CONN_ID = "7c9e4b2a-1f3d-4e5a-9b8c-0d1e2f3a4b5c";
const INSTANCE_ID = "inst-wpp-01";
const R1_ID = "a1a1a1a1-0000-4000-8000-000000000001";
const C1_ID = "b1b1b1b1-0000-4000-8000-000000000001";

// ── estado do mock ───────────────────────────────────────────────────────────
let campaign: Record<string, unknown> | null = null;
let campaignStatus: string | null = null;
let recipients: Array<Record<string, unknown>> = [];
let blacklist: Array<{ contact_id: string }> = [];
let evoResponse: { status: number; body: unknown } = { status: 200, body: { key: { remoteJid: "55..." } } };
const evoCalls: Array<{ url: string; body: unknown }> = [];
const patchedRecipients: Array<{ id: string; body: Record<string, unknown> }> = [];
const patchedCampaigns: Array<{ body: Record<string, unknown> }> = [];

function evoStatus(): string {
  return campaignStatus ?? (campaign?.status as string) ?? "sending";
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  const select = url.searchParams.get("select") ?? "";

  // Evolution API (envio mockado)
  if (url.origin === EVO_URL) {
    evoCalls.push({ url: url.toString(), body });
    return Jres(JSON.stringify(evoResponse.body), evoResponse.status);
  }

  // PostgREST
  if (url.pathname.endsWith("/rest/v1/talkx_campaigns")) {
    const idParam = url.searchParams.get("id") ?? "";
    if (method === "GET" && select.includes("status")) {
      return Jres(JSON.stringify({ status: evoStatus() }));
    }
    if (method === "GET") {
      return Jres(JSON.stringify(campaign ?? null)); // .single() → objeto bare
    }
    if (method === "PATCH") {
      patchedCampaigns.push({ body: body as Record<string, unknown> });
      if ((body as Record<string, unknown>).status) {
        campaignStatus = (body as Record<string, unknown>).status as string;
      }
      return new Response(null, { status: 204 });
    }
    void idParam;
  }
  if (url.pathname.endsWith("/rest/v1/whatsapp_connections") && method === "GET") {
    return Jres(JSON.stringify({ instance_id: INSTANCE_ID })); // .single()
  }
  if (url.pathname.endsWith("/rest/v1/talkx_recipients") && method === "GET") {
    return Jres(JSON.stringify(recipients));
  }
  if (url.pathname.endsWith("/rest/v1/talkx_recipients") && method === "PATCH") {
    const idParam = url.searchParams.get("id") ?? "";
    // suporta id=eq.<uuid> (patch individual) e id=in.(<uuid>,...) (blacklist batch)
    const ids = idParam.startsWith("in.")
      ? idParam.slice(3).replace(/[()]/g, "").split(",")
      : [idParam.replace(/^eq\./, "")];
    for (const id of ids) {
      patchedRecipients.push({ id, body: body as Record<string, unknown> });
    }
    return new Response(null, { status: 204 });
  }
  if (url.pathname.endsWith("/rest/v1/talkx_blacklist") && method === "GET") {
    return Jres(JSON.stringify(blacklist));
  }
  return Jres("[]");
}) as typeof fetch;

await import("../index.ts");

// ── helpers ───────────────────────────────────────────────────────────────────
const reset = () => {
  campaign = null;
  campaignStatus = null;
  recipients = [];
  blacklist = [];
  evoResponse = { status: 200, body: { key: { remoteJid: "55..." } } };
  evoCalls.length = 0;
  patchedRecipients.length = 0;
  patchedCampaigns.length = 0;
};

const sendCall = (body: unknown) =>
  h(new Request("http://mock.local/functions/v1/talkx-send", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { ...J, "x-cron-secret": CRON_SECRET },
  }));

const recipient = (id: string, contactId: string, phone: string | null, name: string) => ({
  id,
  campaign_id: CAMPAIGN_ID,
  contact_id: contactId,
  status: "pending",
  contacts: { name, nickname: null, phone, company: null },
});

/** Espelha getGreeting() do index.ts (saudação por hora em America/Sao_Paulo). */
function expectedGreeting(): string {
  const hour = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false });
  const h = parseInt(hour, 10);
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

/** Último patch do recipient (o handler pacha 2x: 'sending' → 'sent'/'failed'). */
const lastRecipientPatch = (id: string) => {
  const patches = patchedRecipients.filter((p) => p.id === id);
  return patches.length > 0 ? patches[patches.length - 1] : undefined;
};

const textCampaign = (overrides: Record<string, unknown> = {}) => ({
  id: CAMPAIGN_ID,
  name: "Campanha E61",
  status: "sending",
  message_template: "Olá {{nome}}, tudo bem? {{saudacao}}!",
  media_type: null,
  media_url: null,
  sent_count: 0,
  failed_count: 0,
  total_recipients: 1,
  typing_delay_min: 0,
  typing_delay_max: 0,
  send_interval_min: 0,
  send_interval_max: 0,
  whatsapp_connection_id: CONN_ID,
  ...overrides,
});

// ─── 1. PROVA: envio de texto real → Evolution (mock) + recipient 'sent' + campanha 'completed' ──
Deno.test("talkx-send: disparo real — sendText chamado com número limpo + template personalizado; recipient sent; campanha completed", async () => {
  reset();
  campaign = textCampaign();
  recipients = [recipient(R1_ID, C1_ID, "+55 (11) 99999-9999", "Maria da Silva")];
  const res = await sendCall({ campaignId: CAMPAIGN_ID, action: "start" });
  const json = await res.json();

  assertEquals(res.status, 200);
  assertEquals(json.success, true);
  assertEquals(json.sent, 1, "1 envio bem-sucedido");
  assertEquals(json.failed, 0);

  // Evolution chamada: updatePresence + sendText (nesta ordem)
  assertEquals(evoCalls.length, 2, "updatePresence + sendText");
  assert(evoCalls[0].url.includes(`chat/updatePresence/${INSTANCE_ID}`), "presence primeiro");
  assert(evoCalls[1].url.includes(`message/sendText/${INSTANCE_ID}`), "sendText depois");
  const sendBody = evoCalls[1].body as Record<string, unknown>;
  assertEquals(sendBody.number, "5511999999999", "número limpo (sem máscara)");
  assertEquals(sendBody.text, `Olá Maria, tudo bem? ${expectedGreeting()}!`);
  assertEquals(sendBody.delay, 0);

  // recipient marcado sent com timestamp (ÚLTIMO patch — o 1º é 'sending')
  const sentPatch = lastRecipientPatch(R1_ID);
  assert(sentPatch, "recipient R1 deve ser patchado");
  assertEquals(sentPatch.body.status, "sent");
  assert(typeof sentPatch.body.sent_at === "string" && sentPatch.body.sent_at.length > 0, "sent_at preenchido");

  // contadores + completed
  const lastCampaignPatch = patchedCampaigns[patchedCampaigns.length - 1];
  assertEquals(lastCampaignPatch.body.status, "completed");
  assertEquals(lastCampaignPatch.body.sent_count, 1);
  assertEquals(lastCampaignPatch.body.failed_count, 0);
});

// ─── 2. Blacklist → skipped, sem chamada de envio ─────────────────────────────
Deno.test("talkx-send: contato na blacklist → recipient skipped (opt-out) e Evolution NÃO é chamada", async () => {
  reset();
  campaign = textCampaign();
  recipients = [recipient(R1_ID, C1_ID, "+55 (11) 99999-9999", "Maria da Silva")];
  blacklist = [{ contact_id: C1_ID }];
  const res = await sendCall({ campaignId: CAMPAIGN_ID, action: "start" });
  const json = await res.json();

  assertEquals(json.success, true);
  assertEquals(json.message, "No eligible recipients to send");
  // early-return sem recipients elegíveis NÃO carrega sent/failed (contrato real)
  assertEquals(evoCalls.length, 0, "nenhuma chamada à Evolution para contato bloqueado");
  const skipPatch = patchedRecipients.find((p) => p.id === R1_ID);
  assert(skipPatch, "recipient deve ser patchado");
  assertEquals(skipPatch.body.status, "skipped");
  assert(String(skipPatch.body.error_message).includes("lista negra"), "motivo opt-out");
});

// ─── 3. Sem telefone → skipped, sem envio ─────────────────────────────────────
Deno.test("talkx-send: recipient sem phone → skipped 'Sem número de telefone', sem envio", async () => {
  reset();
  campaign = textCampaign();
  recipients = [recipient(R1_ID, C1_ID, null, "Sem Telefone")];
  const res = await sendCall({ campaignId: CAMPAIGN_ID, action: "start" });
  const json = await res.json();

  assertEquals(json.sent, 0);
  assertEquals(evoCalls.length, 0);
  const skipPatch = patchedRecipients.find((p) => p.id === R1_ID);
  assertEquals(skipPatch?.body.status, "skipped");
  assertEquals(skipPatch?.body.error_message, "Sem número de telefone");
});

// ─── 4. Falha da Evolution → recipient 'failed' com erro ─────────────────────
Deno.test("talkx-send: Evolution retorna erro → recipient failed com error_message; campanha completed com failed_count", async () => {
  reset();
  campaign = textCampaign();
  recipients = [recipient(R1_ID, C1_ID, "+55 (11) 99999-9999", "Maria da Silva")];
  evoResponse = { status: 400, body: { message: "Invalid number" } };
  const res = await sendCall({ campaignId: CAMPAIGN_ID, action: "start" });
  const json = await res.json();

  assertEquals(json.success, true);
  assertEquals(json.sent, 0);
  assertEquals(json.failed, 1);
  const failedPatch = lastRecipientPatch(R1_ID);
  assertEquals(failedPatch?.body.status, "failed");
  const lastCampaignPatch = patchedCampaigns[patchedCampaigns.length - 1];
  assertEquals(lastCampaignPatch.body.status, "completed");
  assertEquals(lastCampaignPatch.body.failed_count, 1);
});

// ─── 5. Mídia → sendMedia com mediatype/caption ───────────────────────────────
Deno.test("talkx-send: campanha com mídia → sendMedia/{instance} com mediatype + caption personalizado", async () => {
  reset();
  campaign = textCampaign({
    media_type: "image",
    media_url: "https://cdn.mock/banner.png",
    message_template: "Veja {{nome}}!",
  });
  recipients = [recipient(R1_ID, C1_ID, "5511999999999", "João")];
  const res = await sendCall({ campaignId: CAMPAIGN_ID, action: "start" });
  const json = await res.json();

  assertEquals(json.sent, 1);
  assert(evoCalls.some((c) => c.url.includes(`message/sendMedia/${INSTANCE_ID}`)), "sendMedia chamado");
  const mediaCall = evoCalls.find((c) => c.url.includes("sendMedia"))!;
  const mediaBody = mediaCall.body as Record<string, unknown>;
  assertEquals(mediaBody.mediatype, "image");
  assertEquals(mediaBody.media, "https://cdn.mock/banner.png");
  assertEquals(mediaBody.caption, "Veja João!");
  const sentPatch = lastRecipientPatch(R1_ID);
  assertEquals(sentPatch?.body.status, "sent");
});

// ─── 6. Pause/cancel via talkx-send (contrato de controle) ───────────────────
Deno.test("talkx-send: action=pause → campanha paused sem processar recipients", async () => {
  reset();
  campaign = textCampaign();
  recipients = [recipient(R1_ID, C1_ID, "+55 (11) 99999-9999", "Maria da Silva")];
  const res = await sendCall({ campaignId: CAMPAIGN_ID, action: "pause" });
  const json = await res.json();

  assertEquals(res.status, 200);
  assertEquals(json.status, "paused");
  assertEquals(evoCalls.length, 0);
  const pausePatch = patchedCampaigns.find((p) => p.body.status === "paused");
  assert(pausePatch, "status paused persistido");
});

// ─── 7. Campanha inexistente → 404 ────────────────────────────────────────────
Deno.test("talkx-send: campaignId inexistente → 404 Campaign not found", async () => {
  reset();
  campaign = null;
  const res = await sendCall({ campaignId: CAMPAIGN_ID, action: "start" });
  assertEquals(res.status, 404);
});
