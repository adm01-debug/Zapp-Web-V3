// Contract tests — zapp-crm-sync@v1 (CRM plugável, Etapa 66, SIM-CRM F1)
// Cobre: registro de contrato, validação zod do payload, helpers puros de
// dispatch (buildBitrixLeadFields, translateBitrixError) e comportamento do
// handler REAL (Deno.serve stub + fetch mock, sem rede/DB — padrão da casa
// csat-auto-send handler-mock.test.ts).
//
// Rodar: deno test --allow-import --allow-read --allow-env supabase/functions/zapp-crm-sync/__tests__/contract.test.ts
import { assertEquals, assert } from "jsr:@std/assert";
import { ZappCrmSyncV1Schema, CONTRACT_SCHEMAS } from "../../_shared/contract-schemas.ts";

// ── Stub do Deno.serve ANTES do import dinâmico do handler (sem isso o
//    import bindaria porta e o test runner abortaria o módulo). ─────────────
type H = (r: Request) => Promise<Response> | Response;
let handler: H = () => new Response("");
Object.defineProperty(Deno, "serve", {
  value: (fn: H) => {
    handler = fn;
    return { finished: Promise.resolve(), shutdown: () => {} };
  },
  writable: true,
  configurable: true,
});

// ── Env de teste (requireUser valida JWT via GoTrue; edge lê config via PostgREST) ──
Deno.env.set("SELFHOSTED_SUPABASE_URL", "http://mock.local");
Deno.env.set("SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key-123456");
Deno.env.delete("BITRIX_WEBHOOK_URL"); // F2: provider sem env

const { buildBitrixLeadFields, translateBitrixError, PROVIDERS } = await import("../index.ts");

const UUID = "3f2b8f1e-6d4a-4c9e-9b7a-1c2d3e4f5a6b";
const J = { "content-type": "application/json" };
const Jres = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: J });

// JWT fake com payload decodável (sub + role authenticated + iss = env)
const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const FAKE_JWT = [
  b64url(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  b64url(JSON.stringify({ sub: UUID, role: "authenticated", iss: "http://mock.local" })),
  "sig",
].join(".");

// ── Estado do mock PostgREST (config de CRM) ────────────────────────────────
let configRows: Array<Record<string, unknown>> = [];
const touched: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const p = new URL(String(input)).pathname;
  const m = init?.method ?? "GET";
  touched.push(`${m} ${p}`);
  if (p.endsWith("/auth/v1/user")) {
    return Jres({ id: UUID, aud: "authenticated", role: "authenticated", email: "test@example.com" });
  }
  if (p.includes("/rest/v1/crm_sync_config")) {
    // Simula o filtro real do handler: .eq("enabled", true)
    const enabledFilter = new URL(String(input)).searchParams.get("enabled");
    const filtered = enabledFilter === "eq.true"
      ? configRows.filter((r) => r.enabled === true)
      : configRows;
    return Jres(filtered);
  }
  return Jres({ error: "unexpected mock path" }, 404);
}) as typeof fetch;

function validPayload(): Record<string, unknown> {
  return {
    entity_id: UUID,
    entity_data: {
      phone: "5511999999999",
      channel: "whatsapp",
      direction: "inbound",
      assunto: "Conversa WhatsApp — João",
      resumo: "Cliente pediu orçamento",
      sentiment: "positive",
      message_count: 12,
      agent_name: "Ana",
      zapp_conversation_id: UUID,
    },
  };
}

function authedRequest(body: unknown): Request {
  return new Request("https://fn.local/zapp-crm-sync", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${FAKE_JWT}` },
    body: JSON.stringify(body),
  });
}

// ─── Registro ───────────────────────────────────────────────────────────────

Deno.test("Registry: zapp-crm-sync tem schema v1 em CONTRACT_SCHEMAS", () => {
  const versions = CONTRACT_SCHEMAS["zapp-crm-sync"];
  assert(versions, "zapp-crm-sync deve estar registrado em CONTRACT_SCHEMAS");
  assert(versions.v1, "zapp-crm-sync deve manter v1 (backward compatibility)");
});

Deno.test("Registry: PROVIDERS espelha o CHECK da tabela", () => {
  assertEquals([...PROVIDERS].sort(), ["bitrix24", "custom_cloud"]);
});

// ─── Schema: payloads válidos ───────────────────────────────────────────────

Deno.test("Contract: zapp-crm-sync v1 — payload mínimo válido", () => {
  const payload = { entity_data: { phone: "5511999999999", channel: "whatsapp", direction: "inbound" } };
  assertEquals(ZappCrmSyncV1Schema.safeParse(payload).success, true);
});

Deno.test("Contract: zapp-crm-sync v1 — payload completo válido", () => {
  assertEquals(ZappCrmSyncV1Schema.safeParse(validPayload()).success, true);
});

Deno.test("Contract: zapp-crm-sync v1 — opcionais nullish e dry_run aceitos", () => {
  const payload = {
    entity_data: {
      phone: "5511999999999",
      channel: "sms",
      direction: "outbound",
      assunto: null,
      resumo: null,
      sentiment: null,
      message_count: 0,
      agent_name: null,
      zapp_conversation_id: null,
      dry_run: true,
    },
  };
  assertEquals(ZappCrmSyncV1Schema.safeParse(payload).success, true);
});

// ─── Schema: payloads inválidos (falham cedo, 422 consistente) ──────────────

Deno.test("Contract: zapp-crm-sync v1 — entity_id não-UUID → rejeitado", () => {
  const payload = validPayload();
  payload.entity_id = "not-a-uuid";
  const r = ZappCrmSyncV1Schema.safeParse(payload);
  assertEquals(r.success, false);
  if (!r.success) {
    const paths = r.error.issues.map((i) => i.path.join("."));
    assertEquals(paths.includes("entity_id"), true);
  }
});

Deno.test("Contract: zapp-crm-sync v1 — direction fora do enum → rejeitado", () => {
  const payload = validPayload();
  (payload.entity_data as Record<string, unknown>).direction = "sideways";
  const r = ZappCrmSyncV1Schema.safeParse(payload);
  assertEquals(r.success, false);
  if (!r.success) {
    const paths = r.error.issues.map((i) => i.path.join("."));
    assertEquals(paths.includes("entity_data.direction"), true);
  }
});

Deno.test("Contract: zapp-crm-sync v1 — phone vazio → rejeitado", () => {
  const payload = validPayload();
  (payload.entity_data as Record<string, unknown>).phone = "";
  assertEquals(ZappCrmSyncV1Schema.safeParse(payload).success, false);
});

Deno.test("Contract: zapp-crm-sync v1 — message_count negativo → rejeitado", () => {
  const payload = validPayload();
  (payload.entity_data as Record<string, unknown>).message_count = -1;
  assertEquals(ZappCrmSyncV1Schema.safeParse(payload).success, false);
});

Deno.test("Contract: zapp-crm-sync v1 — chave extra no topo (strict) → rejeitado", () => {
  const payload = { ...validPayload(), surprise: true };
  assertEquals(ZappCrmSyncV1Schema.safeParse(payload).success, false);
});

Deno.test("Contract: zapp-crm-sync v1 — entity_data ausente → rejeitado", () => {
  assertEquals(ZappCrmSyncV1Schema.safeParse({ entity_id: UUID }).success, false);
});

// ─── Helpers de dispatch ────────────────────────────────────────────────────

Deno.test("Dispatch: buildBitrixLeadFields mapeia entity_data → campos Bitrix", () => {
  const fields = buildBitrixLeadFields({
    phone: "5511999999999",
    channel: "whatsapp",
    direction: "inbound",
    assunto: "Conversa WhatsApp — João",
    resumo: "Resumo da conversa",
    zapp_conversation_id: UUID,
  });
  assertEquals(fields.TITLE, "Conversa WhatsApp — João");
  assertEquals(fields.PHONE, [{ VALUE: "5511999999999", VALUE_TYPE: "WORK" }]);
  assertEquals(fields.COMMENTS, "Resumo da conversa");
  assertEquals(fields.UF_CRM_WHATSAPP_CONTACT_ID, UUID);
});

Deno.test("Dispatch: buildBitrixLeadFields — fallbacks honestos (sem assunto/resumo)", () => {
  const fields = buildBitrixLeadFields({ phone: "5511999999999", channel: "whatsapp", direction: "outbound" });
  assertEquals(fields.TITLE, "Lead WhatsApp — 5511999999999");
  assertEquals(fields.COMMENTS, null);
  assertEquals(fields.UF_CRM_WHATSAPP_CONTACT_ID, null);
});

Deno.test("Dispatch: translateBitrixError — DUPLICATE → duplicate (F6)", () => {
  const t = translateBitrixError('{"error":"DUPLICATE_ENTITY"}', 400);
  assertEquals(t.reason, "duplicate");
  assertEquals(t.provider_error, undefined);
});

Deno.test("Dispatch: translateBitrixError — ALREADY EXISTS → duplicate (F6)", () => {
  assertEquals(translateBitrixError("lead already exists", 400).reason, "duplicate");
});

Deno.test("Dispatch: translateBitrixError — 5xx → error com provider_error truncado (F4)", () => {
  const t = translateBitrixError("upstream exploded", 502);
  assertEquals(t.reason, "error");
  assertEquals(t.provider_error, "upstream exploded");
});

Deno.test("Dispatch: translateBitrixError — corpo vazio → error sem crash", () => {
  const t = translateBitrixError("", 500);
  assertEquals(t.reason, "error");
});

// ─── Comportamento do handler (F1/F2 + honestidade) ─────────────────────────

Deno.test("Behavior: sem Authorization → 401 (requireUser)", async () => {
  const res = await handler(new Request("https://fn.local/zapp-crm-sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(validPayload()),
  }));
  assertEquals(res.status, 401);
});

Deno.test("Behavior: F1 — 0 rows na config → 200 {synced:false, reason:not_configured}", async () => {
  configRows = [];
  touched.length = 0;
  const res = await handler(authedRequest(validPayload()));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.synced, false);
  assertEquals(body.reason, "not_configured");
  assert(Array.isArray(body.providers));
  assert(touched.some((t) => t.includes("/rest/v1/crm_sync_config")), "edge deve ler a config");
});

Deno.test("Behavior: F1 — todas disabled → 200 not_configured", async () => {
  configRows = [{ provider: "bitrix24", enabled: false, settings: {} }];
  const res = await handler(authedRequest(validPayload()));
  assertEquals(res.status, 200);
  assertEquals((await res.json()).reason, "not_configured");
});

Deno.test("Behavior: F2 — bitrix24 enabled sem BITRIX_WEBHOOK_URL → 400 provider_not_configured", async () => {
  configRows = [{ provider: "bitrix24", enabled: true, settings: {} }];
  const res = await handler(authedRequest(validPayload()));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.synced, false);
  assertEquals(body.reason, "provider_not_configured");
  assertEquals(body.provider, "bitrix24");
});

Deno.test("Behavior: custom_cloud enabled → 200 not_implemented honesto (stub)", async () => {
  configRows = [{ provider: "custom_cloud", enabled: true, settings: {} }];
  const res = await handler(authedRequest(validPayload()));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.synced, false);
  assertEquals(body.reason, "not_implemented");
  assertEquals(body.provider, "custom_cloud");
});
