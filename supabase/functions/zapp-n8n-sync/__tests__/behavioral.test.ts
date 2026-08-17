// ============================================================================
// CONTRATO — zapp-n8n-sync@v1  (integração N8n real, Etapa 72 / construção
// g2 do batch audit-20260817)
// ============================================================================
// STATUS: suite do TESTER (behavioral). O implementador criou a edge REAL no
// MESMO worktree durante a sessão (variante "RED vira GREEN ao vivo",
// wt-crm 2026-08-17): `supabase/functions/zapp-n8n-sync/index.ts` +
// migration `20260817260000_n8n_config_contract.sql` (tabela single-row
// `zapp.n8n_config`, RPCs fn_edge_get_n8n_config / fn_edge_upsert_n8n_config).
//
// DESVIO vs spec documentado no header: a tarefa pedia "testes deno da edge
// N8n (not_configured; config corrompida 400)" — a implementação real
// nomeou a edge `zapp-n8n-sync` e o 400 de "config corrompida" virou a
// validação de `configure` (baseUrl vazia → 400; URL não-http(s) → ramo
// INALCANÇÁVEL porque normalizeBaseUrl prefixa https:// — ver B4). Regra de
// ouro: os testes seguem a REALIDADE, não a spec.
//
// Divisão de testes (ambos rodam no glob do CI):
//   - index.test.ts  → unit do núcleo (implementador): normalizeBaseUrl,
//     deriveStatus, fetchN8nConfig com RPC fake.
//   - behavioral.test.ts (ESTE) → ponta-a-ponta do handler real: auth 401,
//     gate 422, estados not_configured/disabled/configured, configure 200/400,
//     nunca 5xx.
//
// REQUEST (POST, body JSON; actions do contrato ZappN8nSyncV1Schema,
// estrito — discriminadUnion):
//   { action: "status" }
//   { action: "configure", baseUrl: string (min 1, max 2048) }
// GET (sem corpo) → mesma resposta da action "status".
//
// AUTH: requireAdminOrSupervisor (JWT de usuário + RPC is_admin_or_supervisor;
// 401 sem token, 403 sem privilégio). GATE: parseOrReject('zapp-n8n-sync',
// CONTRACT_SCHEMAS['zapp-n8n-sync'], ...) → 422 envelope canônico
// (invalid_json / contract_violation). RATE LIMIT: checkRateLimit 30/60s → 429.
//
// STORAGE: `zapp.n8n_config` (single-row id=1) via RPCs SECURITY DEFINER
// (service_role) — NUNCA .from() direto nem exposição de webhook_secret.
//
// ESTADOS (deriveStatus — estado honesto):
//   - sem linha na tabela        → 200 { ok, configured: false,
//     status: "not_configured", baseUrl: null, updatedAt: null }
//   - linha enabled=false        → 200 { configured: true, status: "disabled" }
//     (contrato desligado: nada é enviado ao n8n até o dispatch existir)
//   - linha enabled=true         → 200 { configured: true, status: "configured" }
//   - configure baseUrl válida   → 200 { configured: true, status: "disabled" }
//     + upsert (p_base_url normalizada, p_enabled=false)
//   - configure baseUrl em branco("   ") → 400 { ok: false, error: "baseUrl is required" }
//
// Rodar (idêntico ao CI): deno test --allow-net --allow-env --allow-read
//   supabase/functions/zapp-n8n-sync/__tests__/behavioral.test.ts
// ============================================================================

import { assertEquals, assert, assertMatch } from "jsr:@std/assert";
import { parseOrReject } from "../../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../../_shared/contract-schemas.ts";
import { readSourceFrom } from "../../_shared/test-helpers.ts";

// ---------------------------------------------------------------------------
// Bloco A — ÂNCORAS DE FONTE (contrato estrutural do index.ts real)
// ---------------------------------------------------------------------------
const SOURCE = await readSourceFrom(import.meta.url, "../index.ts");

Deno.test("A1 contrato fonte: edge registra handler (Deno.serve)", () => {
  assertMatch(SOURCE, /Deno\.serve\(/);
});

Deno.test("A2 contrato fonte: auth admin/supervisor (requireAdminOrSupervisor)", () => {
  assertMatch(SOURCE, /requireAdminOrSupervisor\(/);
});

Deno.test("A3 contrato fonte: gate parseOrReject com contrato zapp-n8n-sync", () => {
  assertMatch(SOURCE, /parseOrReject\(\s*['"]zapp-n8n-sync['"]/);
});

Deno.test("A4 contrato fonte: acesso via RPCs SECURITY DEFINER (nunca .from() direto)", () => {
  assertMatch(SOURCE, /fn_edge_get_n8n_config/);
  assertMatch(SOURCE, /fn_edge_upsert_n8n_config/);
  assert(!/\.from\(\s*['"]n8n_config['"]/.test(SOURCE), "leitura/escrita direta na tabela é proibida");
});

Deno.test("A5 contrato fonte: 400 de validação do configure (baseUrl required / URL inválida)", () => {
  assertMatch(SOURCE, /baseUrl is required/);
  assertMatch(SOURCE, /baseUrl deve ser uma URL http\(s\) válida/);
});

Deno.test("A6 contrato fonte: estado honesto not_configured + erro tratado (try/catch)", () => {
  assertMatch(SOURCE, /not_configured/);
  assertMatch(SOURCE, /\btry\s*\{/);
  assertMatch(SOURCE, /\bcatch\s*\(/);
});

Deno.test("A7 contrato fonte: chave 'zapp-n8n-sync' registrada em CONTRACT_SCHEMAS + CONTRACT_VERSIONS", async () => {
  const schemas = await readSourceFrom(import.meta.url, "../../_shared/contract-schemas.ts");
  const versions = await readSourceFrom(import.meta.url, "../../_shared/contract-versions.ts");
  assertMatch(schemas, /['"]zapp-n8n-sync['"]\s*:/);
  assertMatch(versions, /['"]zapp-n8n-sync['"]\s*:/);
});

// ---------------------------------------------------------------------------
// Bloco C — MATRIZ do contrato registrado (ZappN8nSyncV1Schema canônico)
// ---------------------------------------------------------------------------
const V1 = CONTRACT_SCHEMAS["zapp-n8n-sync"].v1!;

function gateReq(body: unknown): Request {
  return new Request("https://edge.local/zapp-n8n-sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === null ? "null" : JSON.stringify(body),
  });
}

Deno.test("C1 contrato: status válido", () => {
  assertEquals(V1.safeParse({ action: "status" }).success, true);
});

Deno.test("C2 contrato: configure válido (mínimo)", () => {
  const r = V1.safeParse({ action: "configure", baseUrl: "https://n8n.atomicabr.com.br" });
  assertEquals(r.success, true);
});

Deno.test("C3 contrato: configure válido (limite max 2048 exato)", () => {
  const r = V1.safeParse({ action: "configure", baseUrl: "https://n8n.example.com/" + "a".repeat(2016) });
  assertEquals(r.success, true);
});

Deno.test("C4 contrato: estrito — action desconhecida falha", () => {
  assertEquals(V1.safeParse({ action: "list" }).success, false);
  assertEquals(V1.safeParse({ action: "delete" }).success, false);
});

Deno.test("C5 contrato: estrito — sem action falha", () => {
  assertEquals(V1.safeParse({ baseUrl: "https://x" }).success, false);
});

Deno.test("C6 contrato: configure sem baseUrl falha", () => {
  assertEquals(V1.safeParse({ action: "configure" }).success, false);
});

Deno.test("C7 contrato: baseUrl vazia falha (min 1)", () => {
  assertEquals(V1.safeParse({ action: "configure", baseUrl: "" }).success, false);
});

Deno.test("C8 contrato: baseUrl acima de 2048 falha (max)", () => {
  assertEquals(V1.safeParse({ action: "configure", baseUrl: "https://n8n.example.com/" + "a".repeat(2017) }).success, false);
});

Deno.test("C9 contrato: estrito — campo extra em status falha", () => {
  assertEquals(V1.safeParse({ action: "status", extra: 1 }).success, false);
});

Deno.test("C10 contrato: estrito — campo extra em configure falha", () => {
  assertEquals(V1.safeParse({ action: "configure", baseUrl: "https://x", api_key: "sk" }).success, false);
});

Deno.test("C11 gate: body null → 422 invalid_json", async () => {
  const r = parseOrReject("zapp-n8n-sync", CONTRACT_SCHEMAS["zapp-n8n-sync"], gateReq(null), null, { extraHeaders: {} });
  assertEquals(r.ok, false);
  if (r.ok === false) {
    assertEquals(r.response.status, 422);
    const body = await r.response.json() as { code: string };
    assertEquals(body.code, "invalid_json");
  }
});

Deno.test("C12 gate: payload sem action → 422 contract_violation", async () => {
  const payload = { baseUrl: "https://x" };
  const r = parseOrReject("zapp-n8n-sync", CONTRACT_SCHEMAS["zapp-n8n-sync"], gateReq(payload), payload, { extraHeaders: {} });
  assertEquals(r.ok, false);
  if (r.ok === false) {
    assertEquals(r.response.status, 422);
    const body = await r.response.json() as { code: string; contract: string };
    assertEquals(body.code, "contract_violation");
    assertEquals(body.contract, "zapp-n8n-sync@v1");
  }
});

// ---------------------------------------------------------------------------
// Bloco B — COMPORTAMENTO ponta-a-ponta (serve-stub + fetch mock, sem rede/DB)
// O handler REAL é exercitado: auth JWT (mock /auth/v1/user + rpc
// is_admin_or_supervisor), gate, RPCs de config mockadas.
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
  SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
  SELFHOSTED_SUPABASE_ANON_KEY: "test-anon-key",
  JWT_SECRET: "test-jwt-secret",
})) Deno.env.set(k, v);

const J = { "content-type": "application/json" };
let configRow: Record<string, unknown> | null = null;
const upsertCalls: Array<{ body: unknown }> = [];

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = new URL(String(input));
  const method = init?.method ?? "GET";
  const b = init?.body ? JSON.parse(String(init.body)) : null;
  // GoTrue mock — requireUser valida o token via /auth/v1/user.
  if (u.pathname.startsWith("/auth/v1")) {
    return new Response(JSON.stringify({ id: "user-1", aud: "authenticated", role: "authenticated" }), { headers: J });
  }
  if (u.pathname.startsWith("/rest/v1")) {
    if (u.pathname.endsWith("/rpc/is_admin_or_supervisor")) {
      return new Response("true", { headers: J });
    }
    if (u.pathname.endsWith("/rpc/fn_edge_get_n8n_config")) {
      return new Response(JSON.stringify(configRow), { headers: J });
    }
    if (u.pathname.endsWith("/rpc/fn_edge_upsert_n8n_config")) {
      upsertCalls.push({ body: b });
      const p = (b ?? {}) as { p_base_url?: string; p_enabled?: boolean };
      return new Response(JSON.stringify({ id: 1, base_url: p.p_base_url ?? null, enabled: p.p_enabled ?? false }), { headers: J });
    }
    return new Response("[]", { headers: J });
  }
  return new Response("not found", { status: 404 });
}) as typeof fetch;

// JWT HS256 real assinado com JWT_SECRET (o mock de /auth/v1/user é a
// autoridade; a assinatura evita rejeição local de exp/iss no supabase-js).
const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const signJwt = async () => {
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({ sub: "user-1", role: "authenticated", iss: "http://mock.local", exp: 4_102_444_800, iat: 1_700_000_000 });
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode("test-jwt-secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${header}.${payload}`)))]
    .map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${header}.${payload}.${sig}`;
};
let JWT = "";

const post = (o: unknown) =>
  h(new Request("http://mock.local/zapp-n8n-sync", {
    method: "POST",
    body: o === null ? "null" : JSON.stringify(o),
    headers: { ...J, Authorization: `Bearer ${JWT}` },
  }));
const get = () =>
  h(new Request("http://mock.local/zapp-n8n-sync", {
    method: "GET",
    headers: { ...J, Authorization: `Bearer ${JWT}` },
  }));
const row = (over: Partial<Record<string, unknown>>) => ({
  id: 1,
  base_url: "https://n8n.example.com",
  enabled: false,
  updated_at: "2026-08-17T12:00:00Z",
  ...over,
});

Deno.test("B1 POST status sem linha → 200 not_configured (estado honesto)", async () => {
  configRow = null;
  upsertCalls.length = 0;
  const res = await post({ action: "status" });
  assertEquals(res.status, 200, "not_configured deve responder 200, nunca 5xx");
  const body = await res.json() as Record<string, unknown>;
  assertEquals(body.configured, false);
  assertEquals(body.status, "not_configured");
  assertEquals(body.baseUrl, null);
  assertEquals(upsertCalls.length, 0, "status não pode escrever");
});

Deno.test("B2 POST status linha enabled=false → 200 disabled (contrato desligado)", async () => {
  configRow = row({ enabled: false });
  const res = await post({ action: "status" });
  assertEquals(res.status, 200);
  const body = await res.json() as Record<string, unknown>;
  assertEquals(body.configured, true);
  assertEquals(body.status, "disabled");
  assertEquals(body.baseUrl, "https://n8n.example.com");
});

Deno.test("B3 POST status linha enabled=true → 200 configured, SEM webhook_secret exposto", async () => {
  configRow = row({ enabled: true, webhook_secret: "shh" });
  const res = await post({ action: "status" });
  assertEquals(res.status, 200);
  const body = await res.json() as Record<string, unknown>;
  assertEquals(body.status, "configured");
  assert(!("webhook_secret" in body), "webhook_secret é segredo e nunca pode sair na resposta");
});

Deno.test("B4 POST configure URL sem protocolo → 200 com baseUrl normalizada (https:// prefixado)", async () => {
  // REALIDADE: normalizeBaseUrl prefixa https:// → o ramo 400 de URL
  // inválida é inalcançável; o comportamento real é normalizar e persistir.
  configRow = null;
  upsertCalls.length = 0;
  const res = await post({ action: "configure", baseUrl: "n8n.example.com" });
  assertEquals(res.status, 200);
  const body = await res.json() as Record<string, unknown>;
  assertEquals(body.status, "disabled");
  assertEquals(body.baseUrl, "https://n8n.example.com");
  assertEquals(upsertCalls.length, 1, "configure deve persistir 1 upsert");
  const p = (upsertCalls[0].body ?? {}) as { p_base_url?: string; p_enabled?: boolean };
  assertEquals(p.p_base_url, "https://n8n.example.com");
  assertEquals(p.p_enabled, false, "contrato desligado: enabled permanece false");
});

Deno.test("B5 POST configure baseUrl em branco → 400 baseUrl is required (0 upserts)", async () => {
  configRow = null;
  upsertCalls.length = 0;
  const res = await post({ action: "configure", baseUrl: "   " });
  assertEquals(res.status, 400, "baseUrl em branco deve responder 400, nunca 5xx");
  const body = await res.json() as Record<string, unknown>;
  assertEquals(body.ok, false);
  assertEquals(upsertCalls.length, 0, "payload inválido não pode persistir");
});

Deno.test("B6 POST sem Bearer → 401 (auth antes de tocar no banco)", async () => {
  const res = await h(new Request("http://mock.local/zapp-n8n-sync", {
    method: "POST",
    body: JSON.stringify({ action: "status" }),
    headers: J,
  }));
  assertEquals(res.status, 401);
});

Deno.test("B7 POST body null → 422 invalid_json (gate; nunca 5xx)", async () => {
  const res = await post(null);
  assertEquals(res.status, 422);
  const body = await res.json() as { code: string };
  assertEquals(body.code, "invalid_json");
});

Deno.test("B8 GET sem corpo → 200 (mesma resposta da action status)", async () => {
  configRow = null;
  const res = await get();
  assertEquals(res.status, 200);
  const body = await res.json() as Record<string, unknown>;
  assertEquals(body.status, "not_configured");
});

Deno.test("B9 POST action desconhecida → 422 contract_violation (gate estrito)", async () => {
  const res = await post({ action: "delete" });
  assertEquals(res.status, 422);
  const body = await res.json() as { code: string };
  assertEquals(body.code, "contract_violation");
});

// JWT assinado só depois do stub (evita custo antes dos testes B1-B9).
JWT = await signJwt();
