// ============================================================================
// CONTRATO — zapp-notifications-dispatch@v1  (executor DASHBOARD-08, Etapa 68.4)
// ============================================================================
// STATUS: RED — a edge `zapp-notifications-dispatch` AINDA NÃO EXISTE
// (sem index.ts; o plano 68.4 nomeia o executor como `notification-dispatcher`;
// este contrato adota o nome da spec: `zapp-notifications-dispatch`).
// Estes testes definem o contrato: devem ficar VERDES quando a edge for
// implementada seguindo o header abaixo. NÃO editar a edge para casar com o
// teste — o teste segue a realidade (regra de ouro do repo).
//
// Papel: executor de notificações. Lê canais/templates configurados em
// `zapp.notification_channels_config` / `zapp.notification_templates`
// (front: useNotificationChannels.ts — DASHBOARD-08) e, para cada EVENTO que
// menciona uma conversa, envia via canal ativo (in-app/email/push/webhook).
// Sem executor = config morta (finding 25 L348-349); este contrato é o teste
// 68.9 "executor com canal mock".
//
// REQUEST (POST, body JSON; espelho dos payloads reais do front):
// {
//   "event_type": "conversation_mentioned",   // enum: conversation_mentioned | new_message
//   "conversation_id": "<uuid>",              // obrigatório — conversa mencionada
//   "workspace_id": "<uuid>",                 // obrigatório
//   "severity": "info" | "warning" | "critical",
//   "title": "string",
//   "message": "string",
//   "metadata": { ... }                        // opcional, passthrough
// }
//
// AUTH: requireServiceRoleOrCron (service-role bearer OU x-cron-secret ==
// CRON_SECRET) — espelho do irmão evolution-notification-dispatcher.
// GATE: parseOrReject('zapp-notifications-dispatch', CONTRACT_SCHEMAS['zapp-notifications-dispatch'],
//       req, raw, { extraHeaders }) → 422 envelope canônico em body inválido.
//       Registrar a chave em _shared/contract-schemas.ts E contract-versions.ts.
//
// COMPORTAMENTO (3 cenários contratuais):
// 1. SEM preferências ativas → NO-OP sem erro:
//    `notification_channels_config` com `enabled = true` → 0 linhas (ou nenhuma
//    casa o workspace/severidade) → 200 { noop: true, dispatched: 0, failed: 0 },
//    ZERO chamadas ao gateway de envio, sem erro.
// 2. EVENTO mencionou conversa + canal ativo → ENVIA via gateway do canal
//    (fetch para a URL do config do canal) → 200 { noop: false, dispatched: 1,
//    failed: 0 }; payload do gateway contém conversation_id/message.
// 3. ERRO DE ENVIO (gateway 5xx/throw) → REGISTRADO, não crasha:
//    erro persistido (UPDATE do canal com colunas de estado `last_sent_at`/
//    `error`, Etapa 68.3) → 200 { noop: false, dispatched: 0, failed: 1,
//    error: "..." } — NUNCA 5xx.
//
// Rodar (idêntico ao CI): deno test --allow-net --allow-env --allow-read
//   supabase/functions/zapp-notifications-dispatch/__tests__/contract.test.ts
// ============================================================================

import { assertEquals, assertMatch, assert } from "jsr:@std/assert";
import { readSourceFrom } from "../../_shared/test-helpers.ts";

// ---------------------------------------------------------------------------
// Bloco A — ÂNCORAS DE FONTE (contrato estrutural do index.ts)
// Falham agora (arquivo não existe); verificam que a implementação futura
// contém os marcadores do contrato.
// ---------------------------------------------------------------------------
async function sourceOrThrow(): Promise<string> {
  try {
    return await readSourceFrom(import.meta.url, "../index.ts");
  } catch (e) {
    throw new Error(
      "RED: zapp-notifications-dispatch ainda não implementada (sem index.ts) — " +
        (e instanceof Error ? e.message : String(e)),
    );
  }
}

Deno.test("A1 contrato fonte: edge existe e registra handler (Deno.serve)", async () => {
  assertMatch(await sourceOrThrow(), /Deno\.serve\(/);
});

Deno.test("A2 contrato fonte: auth service-role/cron (requireServiceRoleOrCron)", async () => {
  assertMatch(await sourceOrThrow(), /requireServiceRoleOrCron\(\s*req\s*\)/);
});

Deno.test("A3 contrato fonte: gate parseOrReject com contrato zapp-notifications-dispatch", async () => {
  assertMatch(await sourceOrThrow(), /parseOrReject\(\s*['"]zapp-notifications-dispatch['"]/);
});

Deno.test("A4 contrato fonte: lê canais ativos (notification_channels_config enabled=true)", async () => {
  const src = await sourceOrThrow();
  assertMatch(src, /notification_channels_config/);
  assertMatch(src, /\.eq\(\s*['"]enabled['"],\s*true\s*\)/);
});

Deno.test("A5 contrato fonte: envia via gateway do canal (fetch da URL no config)", async () => {
  assertMatch(await sourceOrThrow(), /fetch\(/);
});

Deno.test("A6 contrato fonte: erro de envio registrado e não crasha (try/catch + last_sent_at/error)", async () => {
  const src = await sourceOrThrow();
  assertMatch(src, /\btry\s*\{/);
  assertMatch(src, /\bcatch\s*\(/);
  assertMatch(src, /last_sent_at|['"]error['"]\s*:/);
});

Deno.test("A7 contrato fonte: chave registrada em CONTRACT_SCHEMAS + CONTRACT_VERSIONS", async () => {
  const schemas = await readSourceFrom(import.meta.url, "../../_shared/contract-schemas.ts");
  const versions = await readSourceFrom(import.meta.url, "../../_shared/contract-versions.ts");
  assertMatch(schemas, /['"]zapp-notifications-dispatch['"]\s*:/);
  assertMatch(versions, /['"]zapp-notifications-dispatch['"]\s*:/);
});

// ---------------------------------------------------------------------------
// Bloco B — COMPORTAMENTO via Deno.serve stub + fetch mock (sem rede/DB)
// Padrão whatsapp-cloud-webhook-mock.test.ts: stub do serve ANTES do import
// dinâmico; fetch mock roteia PostgREST (/rest/v1) vs gateway de envio.
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
for (const [k, v] of Object.entries({
  SELFHOSTED_SUPABASE_URL: "http://mock.local",
  SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY: "test-key",
  CRON_SECRET: "test-cron",
})) Deno.env.set(k, v);

const J = { "content-type": "application/json" };
const gatewayCalls: Array<{ url: string; body: unknown }> = [];
const stateUpdates: Array<{ body: unknown }> = [];
let channels: unknown[] = [];
let gatewayStatus = 200;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = new URL(String(input));
  const b = init?.body ? JSON.parse(String(init.body)) : null;
  if (u.pathname.startsWith("/rest/v1")) {
    if (u.pathname.endsWith("/notification_channels_config") && (init?.method ?? "GET") === "GET") {
      return new Response(JSON.stringify(channels), { headers: J });
    }
    if (u.pathname.endsWith("/notification_channels_config")) {
      stateUpdates.push({ body: b });
      return new Response(null, { status: 204 });
    }
    return new Response("[]", { headers: J });
  }
  gatewayCalls.push({ url: u.toString(), body: b });
  return new Response(gatewayStatus === 200 ? "ok" : "boom", { status: gatewayStatus });
}) as typeof fetch;

let importErr: string | null = null;
try {
  await import(new URL("../index.ts", import.meta.url).href);
} catch (e) {
  importErr = e instanceof Error ? e.message : String(e);
}
const mustExist = () => {
  if (importErr) throw new Error("RED: edge zapp-notifications-dispatch ainda não implementada (sem index.ts): " + importErr);
};

const CONV = "a1b2c3d4-1111-4111-8111-111111111111";
const event = (conversationId: string) => ({
  event_type: "conversation_mentioned",
  conversation_id: conversationId,
  workspace_id: "22222222-2222-4222-8222-222222222222",
  severity: "info",
  title: "Nova mensagem",
  message: "Alguém mencionou a conversa",
  metadata: { contact_name: "Fulano" },
});
const post = (o: unknown) =>
  h(new Request("http://mock.local/dispatch", {
    method: "POST",
    body: JSON.stringify(o),
    headers: { ...J, "x-cron-secret": "test-cron" },
  }));
const activeChannel = {
  id: 1,
  channel_name: "email",
  enabled: true,
  min_severity: null,
  config: { type: "email", webhook_url: "https://gateway.mock/send" },
  created_at: "2026-08-17T00:00:00Z",
  updated_at: "2026-08-17T00:00:00Z",
};

Deno.test("B1 sem preferências ativas → no-op sem erro (200, zero envios)", async () => {
  mustExist();
  channels = [];
  gatewayStatus = 200;
  gatewayCalls.length = 0;
  stateUpdates.length = 0;
  const res = await post(event(CONV));
  assertEquals(res.status, 200, "no-op deve responder 200, nunca 5xx");
  const body = await res.json() as Record<string, unknown>;
  assertEquals(body.noop, true);
  assertEquals(body.dispatched, 0);
  assertEquals(body.failed, 0);
  assertEquals(gatewayCalls.length, 0, "sem preferências ativas não pode chamar gateway");
});

Deno.test("B2 evento mencionou conversa → envia via canal ativo (mock gateway)", async () => {
  mustExist();
  channels = [activeChannel];
  gatewayStatus = 200;
  gatewayCalls.length = 0;
  stateUpdates.length = 0;
  const res = await post(event(CONV));
  assertEquals(res.status, 200);
  const body = await res.json() as Record<string, unknown>;
  assertEquals(body.dispatched, 1);
  assertEquals(gatewayCalls.length, 1, "canal ativo deve disparar exatamente 1 envio");
  const sent = gatewayCalls[0].body as Record<string, unknown>;
  assert(sent.conversation_id === CONV, "payload do gateway deve carregar a conversa mencionada");
});

Deno.test("B3 erro de envio → registrado, não crasha (200 + failed + estado persistido)", async () => {
  mustExist();
  channels = [activeChannel];
  gatewayStatus = 500;
  gatewayCalls.length = 0;
  stateUpdates.length = 0;
  const res = await post(event(CONV));
  assertEquals(res.status, 200, "erro de envio não pode derrubar o handler (sem 5xx)");
  const body = await res.json() as Record<string, unknown>;
  assertEquals(body.failed, 1);
  assertEquals(body.dispatched, 0);
  assertEquals(stateUpdates.length, 1, "erro deve ser registrado no estado do canal (last_sent_at/error)");
});
