// ============================================================================
// CONTRATO COMPORTAMENTAL — zapp-crm-sync@v1  (CRM plugável, Etapa 66/SIM-CRM)
// ============================================================================
// SUITE COMPLEMENTAR a contract.test.ts (registry/schema/helpers, do
// implementador). Esta suite cobre os CENÁRIOS DE PONTA-A-PONTA do handler
// real via Deno.serve stub + fetch mock (sem rede/DB) — os 3 cenários do
// batch + invariantes:
//   1. CONFIG AUSENTE (0 rows ou nenhum enabled) → DISABLED HONESTO:
//      200 { synced: false, reason: 'not_configured' } — a UI usa este
//      reason para o estado "CRM não configurado" (hook L106). ZERO chamadas
//      de webhook. (F1 / fluxo passo 4 — NUNCA 500)
//   2. CONFIG PRESENTE provider 'bitrix24' enabled + env BITRIX_WEBHOOK_URL
//      → DISPATCH via webhook: POST `${BITRIX_WEBHOOK_URL}/crm.lead.add`
//      com body { fields: buildBitrixLeadFields(entity_data) } →
//      200 { synced: true, provider: 'bitrix24' } (+ bitrix_lead_id?).
//   3. CONFIG CORROMPIDA (provider fora do CHECK da tabela — defesa em
//      profundidade pós-leitura; settings não-objeto em B3b) →
//      400 { synced: false, reason: 'invalid_config' } — NUNCA crash/5xx,
//      ZERO chamadas de webhook. (F8)
//   4. CONFIG PRESENTE mas ENV AUSENTE (bitrix24 sem BITRIX_WEBHOOK_URL) →
//      400 { synced: false, reason: 'provider_not_configured' } — padrão
//      provado do bitrix-api L31-35. (F2)
//   5. DOWNSTREAM 5xx no webhook → erro TRADUZIDO, não crasha:
//      200 { synced: false, reason: 'error', provider: 'bitrix24' }
//      (+ provider_error sem stack; retry 2x 300/900ms em throw — o teste só
//      exige >=1 chamada). (F4)
// REQUEST/AUTH/GATE conforme header do index.ts: POST JSON, requireUser
// (bearer JWT com sub, role != anon; 401 sem token), parseOrReject 422 em
// body inválido/ausente. Invariante geral: NUNCA 5xx para fluxos de negócio.
//
// Rodar (idêntico ao CI): deno test --allow-net --allow-env --allow-read
//   supabase/functions/zapp-crm-sync/__tests__/behavioral.test.ts
// ============================================================================

import { assertEquals, assertMatch, assert } from "jsr:@std/assert";
import { readSourceFrom } from "../../_shared/test-helpers.ts";

// ---------------------------------------------------------------------------
// Bloco A — ÂNCORAS DE FONTE (contrato estrutural do index.ts)
// ---------------------------------------------------------------------------
async function sourceOrThrow(): Promise<string> {
  try {
    return await readSourceFrom(import.meta.url, "../index.ts");
  } catch (e) {
    throw new Error(
      "RED: zapp-crm-sync ainda não implementada (sem index.ts) — " +
        (e instanceof Error ? e.message : String(e)),
    );
  }
}

Deno.test("A1 contrato fonte: edge existe e registra handler (Deno.serve)", async () => {
  assertMatch(await sourceOrThrow(), /Deno\.serve\(/);
});

Deno.test("A2 contrato fonte: auth usuário logado (requireUser)", async () => {
  assertMatch(await sourceOrThrow(), /requireUser\(\s*req\s*\)/);
});

Deno.test("A3 contrato fonte: gate parseOrReject com contrato zapp-crm-sync", async () => {
  assertMatch(await sourceOrThrow(), /parseOrReject\(\s*['"]zapp-crm-sync['"]/);
});

Deno.test("A4 contrato fonte: lê config ativa (crm_sync_config enabled=true)", async () => {
  const src = await sourceOrThrow();
  assertMatch(src, /crm_sync_config/);
  assertMatch(src, /\.eq\(\s*['"]enabled['"],\s*true\s*\)/);
});

Deno.test("A5 contrato fonte: dispatch via webhook (fetch para o provider)", async () => {
  assertMatch(await sourceOrThrow(), /fetch\(/);
});

Deno.test("A6 contrato fonte: config ausente/corrompida tratadas, sem crash (try/catch + reasons)", async () => {
  const src = await sourceOrThrow();
  assertMatch(src, /\btry\s*\{/);
  assertMatch(src, /\bcatch\s*\(/);
  assertMatch(src, /['"]not_configured['"]/);
  assertMatch(src, /['"]invalid_config['"]/);
});

Deno.test("A7 contrato fonte: chave registrada em CONTRACT_SCHEMAS + CONTRACT_VERSIONS", async () => {
  const schemas = await readSourceFrom(import.meta.url, "../../_shared/contract-schemas.ts");
  const versions = await readSourceFrom(import.meta.url, "../../_shared/contract-versions.ts");
  assertMatch(schemas, /['"]zapp-crm-sync['"]\s*:/);
  assertMatch(versions, /['"]zapp-crm-sync['"]\s*:/);
});

Deno.test("A8 contrato fonte: provider bitrix24 usa env BITRIX_WEBHOOK_URL", async () => {
  assertMatch(await sourceOrThrow(), /BITRIX_WEBHOOK_URL/);
});

// ---------------------------------------------------------------------------
// Bloco B — COMPORTAMENTO via Deno.serve stub + fetch mock (sem rede/DB)
// Padrão whatsapp-cloud-webhook-mock.test.ts / gmail-tests.test.ts: stub do
// serve ANTES do import dinâmico; fetch mock roteia auth (/auth/v1/user),
// PostgREST (/rest/v1) vs webhook do provider.
// ---------------------------------------------------------------------------
type H = (r: Request) => Promise<Response> | Response;
let h: H = () => new Response("", { status: 500 });
Object.defineProperty(Deno, "serve", {
  value: (fn: H) => {
    h = fn;
    return { finished: Promise.resolve(), shutdown: () => {} };
  },
  writable: true,
  configurable: true,
});
// Ambos os pares de env (cloud e self-hosted) — robusto a qualquer variante
// de db-client/auth lendo um ou outro.
for (const [k, v] of Object.entries({
  SUPABASE_URL: "http://mock.local",
  SELFHOSTED_SUPABASE_URL: "http://mock.local",
  SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  SELFHOSTED_SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_ANON_KEY: "test-anon-key",
})) Deno.env.set(k, v);
// BITRIX_WEBHOOK_URL é setada por teste (B2/B5) e apagada nos demais.

const J = { "content-type": "application/json" };
const webhookCalls: Array<{ url: string; body: unknown }> = [];
let configRows: unknown[] = [];
let webhookStatus = 200;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = new URL(String(input));
  const b = init?.body ? JSON.parse(String(init.body)) : null;
  // requireUser → client.auth.getUser() (padrão gmail-tests.test.ts)
  if (u.pathname.includes("/auth/v1/user")) {
    return new Response(
      JSON.stringify({ user: { id: "user-1", email: "test@example.com" } }),
      { headers: J },
    );
  }
  // Config de CRM: GET zapp.crm_sync_config (service_role, schema zapp)
  if (u.pathname.includes("/rest/v1/crm_sync_config") && (init?.method ?? "GET") === "GET") {
    return new Response(JSON.stringify(configRows), { headers: J });
  }
  if (u.pathname.startsWith("/rest/v1")) {
    return new Response("[]", { headers: J });
  }
  // Qualquer outra URL = webhook do provider (BITRIX_WEBHOOK_URL)
  webhookCalls.push({ url: u.toString(), body: b });
  return new Response(webhookStatus === 200 ? "ok" : "boom", { status: webhookStatus });
}) as typeof fetch;

let importErr: string | null = null;
try {
  await import(new URL("../index.ts", import.meta.url).href);
} catch (e) {
  importErr = e instanceof Error ? e.message : String(e);
}
const mustExist = () => {
  if (importErr) throw new Error("RED: edge zapp-crm-sync ainda não implementada (sem index.ts): " + importErr);
};

// JWT falso com sub/role/iss coerentes — validado pelo stub /auth/v1/user
function b64url(o: unknown): string {
  return btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const FAKE_USER_JWT = `${b64url({ alg: "none", typ: "JWT" })}.${b64url({
  sub: "user-1",
  role: "authenticated",
  iss: "http://mock.local",
})}.fake-signature`;

const CONV = "a1b2c3d4-1111-4111-8111-111111111111";

const payload = (over: Record<string, unknown> = {}) => ({
  entity_id: CONV,
  entity_data: {
    phone: "5511999999999",
    channel: "whatsapp",
    direction: "inbound",
    assunto: "Orçamento",
    resumo: "Cliente pediu orçamento",
    sentiment: "neutral",
    message_count: 3,
    agent_name: "Ana",
    zapp_conversation_id: CONV,
  },
  ...over,
});

const post = (o: unknown) =>
  h(new Request("http://mock.local/zapp-crm-sync", {
    method: "POST",
    body: JSON.stringify(o),
    headers: { ...J, Authorization: `Bearer ${FAKE_USER_JWT}` },
  }));

const bitrixRow = { provider: "bitrix24", enabled: true, settings: {} };
const reset = () => {
  configRows = [];
  webhookStatus = 200;
  webhookCalls.length = 0;
  Deno.env.delete("BITRIX_WEBHOOK_URL");
};

Deno.test("B1 config ausente → 200 { synced:false, reason:'not_configured' } sem chamar webhook", async () => {
  mustExist();
  reset();
  const res = await post(payload());
  assertEquals(res.status, 200, "not_configured é estado de negócio: 200, nunca 5xx");
  const body = await res.json() as Record<string, unknown>;
  assertEquals(body.synced, false);
  assertEquals(body.reason, "not_configured");
  assertEquals(webhookCalls.length, 0, "sem config ativa não pode chamar webhook");
});

Deno.test("B2 config bitrix24 + env → dispatch /crm.lead.add, 200 { synced:true, provider:'bitrix24' }", async () => {
  mustExist();
  reset();
  configRows = [bitrixRow];
  Deno.env.set("BITRIX_WEBHOOK_URL", "https://webhook.mock/bitrix24");
  const res = await post(payload());
  assertEquals(res.status, 200);
  const body = await res.json() as Record<string, unknown>;
  assertEquals(body.synced, true);
  assertEquals(body.provider, "bitrix24");
  assertEquals(webhookCalls.length, 1, "config ativa deve disparar exatamente 1 chamada de webhook");
  assert(
    webhookCalls[0].url.endsWith("/crm.lead.add"),
    `webhook deve apontar para crm.lead.add (recebido: ${webhookCalls[0].url})`,
  );
  const sent = webhookCalls[0].body as { fields?: Record<string, unknown> };
  const fields = sent.fields ?? {};
  const phoneArr = fields.PHONE as Array<{ VALUE: string }> | undefined;
  assertEquals(phoneArr?.[0]?.VALUE, "5511999999999", "fields.PHONE[0].VALUE deve carregar o phone");
  assertEquals(
    fields.UF_CRM_WHATSAPP_CONTACT_ID,
    CONV,
    "fields.UF_CRM_WHATSAPP_CONTACT_ID deve carregar o zapp_conversation_id",
  );
});

Deno.test("B3 config corrompida (provider desconhecido) → 400 { synced:false, reason:'invalid_config' } sem crash", async () => {
  mustExist();
  reset();
  configRows = [{ provider: "salesforce", enabled: true, settings: {} }];
  const res = await post(payload());
  assertEquals(res.status, 400, "config corrompida é erro de contrato: 400, nunca 5xx");
  const body = await res.json() as Record<string, unknown>;
  assertEquals(body.synced, false);
  assertEquals(body.reason, "invalid_config");
  assertEquals(webhookCalls.length, 0, "config corrompida NÃO pode chamar webhook");
});

Deno.test("B3b F8 defesa em profundidade: settings não-objeto → 400 { reason:'invalid_config' }", async () => {
  mustExist();
  reset();
  // CHECK jsonb_typeof(settings)='object' impede no DB; a edge deve
  // re-validar na leitura (F8) — settings corrompido NUNCA pode virar sync.
  configRows = [{ provider: "bitrix24", enabled: true, settings: "corrupted-not-an-object" }];
  const res = await post(payload());
  assertEquals(res.status, 400, "settings não-objeto deve ser invalid_config, nunca sync");
  const body = await res.json() as Record<string, unknown>;
  assertEquals(body.synced, false);
  assertEquals(body.reason, "invalid_config");
  assertEquals(webhookCalls.length, 0, "settings corrompido NÃO pode chamar webhook");
});

Deno.test("B4 config bitrix24 presente mas env ausente → 400 { synced:false, reason:'provider_not_configured' }", async () => {
  mustExist();
  reset();
  configRows = [bitrixRow];
  // BITRIX_WEBHOOK_URL não setada (reset já apagou)
  const res = await post(payload());
  assertEquals(res.status, 400, "env ausente é erro de configuração: 400 honesto (padrão bitrix-api L31-35)");
  const body = await res.json() as Record<string, unknown>;
  assertEquals(body.synced, false);
  assertEquals(body.reason, "provider_not_configured");
  assertEquals(webhookCalls.length, 0);
});

Deno.test("B5 downstream 5xx → erro traduzido, não crasha: 200 { synced:false, reason:'error', provider }", async () => {
  mustExist();
  reset();
  configRows = [bitrixRow];
  Deno.env.set("BITRIX_WEBHOOK_URL", "https://webhook.mock/bitrix24");
  webhookStatus = 500;
  const res = await post(payload());
  assertEquals(res.status, 200, "falha do provider é estado de negócio: 200, nunca 5xx");
  const body = await res.json() as Record<string, unknown>;
  assertEquals(body.synced, false);
  assertEquals(body.reason, "error");
  assertEquals(body.provider, "bitrix24");
  assert(webhookCalls.length >= 1, "deve ter tentado o webhook (retry 2x 300/900ms em throw é permitido)");
});
