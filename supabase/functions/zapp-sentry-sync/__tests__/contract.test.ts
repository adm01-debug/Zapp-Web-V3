// ============================================================================
// CONTRATO — zapp-sentry-sync@v1  (Sentry: contrato real desligado, Onda G3)
// ============================================================================
// STATUS: RED — a edge `zapp-sentry-sync` AINDA NÃO EXISTE (sem index.ts).
// Estes testes definem o contrato: devem ficar VERDES quando a edge for
// implementada seguindo o header abaixo. NÃO editar a edge para casar com o
// teste — o teste segue a realidade (regra de ouro do repo).
//
// Papel: contrato real de integração Sentry. Lê a config em
// `zapp.sentry_config` (migration da Onda G3: dsn_ref, organization, enabled;
// RLS admin) e:
//   - config AUSENTE → resposta honesta `not_configured` (nunca 5xx, nunca
//     dados falsos/mock);
//   - config PRESENTE + enabled → sincroniza EVENTOS REAIS da API do Sentry
//     (fetch) e devolve envelope honesto.
// O front (SentryIntegrationView.tsx) hoje mostra `mockErrors` inventados —
// este contrato é o que permite o estado honesto "Sem eventos reais".
//
// REQUEST (GET, sem body — edge espelho do irmão zapp-google-calendar-sync):
//   GET /functions/v1/zapp-sentry-sync
//   Authorization: Bearer <jwt do admin>
// (Se o integrador escolher POST, mudar só o verbo no helper `sync()` do
//  Bloco B — o restante do contrato permanece.)
//
// AUTH: requireAdminOrSupervisor (401 sem JWT; 403 não-admin/supervisor) —
// aceita-se requireUser + checagem de admin equivalente. AUTH ANTES de
// qualquer leitura de config.
// GATE: parseOrReject('zapp-sentry-sync', CONTRACT_SCHEMAS['zapp-sentry-sync'],
//       req, await req.json().catch(() => ({}))) → 422 envelope canônico em
//       body inválido. Registrar a chave em _shared/contract-schemas.ts E
//       _shared/contract-versions.ts (schema bodyless EmptyStrict).
//
// COMPORTAMENTO (3 cenários contratuais):
// 1. SEM JWT → 401 (auth gate antes de qualquer I/O).
// 2. CONFIG AUSENTE (sentry_config = 0 rows) → 200
//    { synced: false, reason: 'not_configured' }, ZERO chamadas à API do
//    Sentry, nunca 5xx.
// 3. CONFIG PRESENTE + enabled=true → sincroniza via API do Sentry (fetch) →
//    200 { synced: boolean, ... } honesto (synced=false ⇒ reason string),
//    nunca 5xx.
//
// Rodar (idêntico ao CI): deno test --allow-net --allow-env --allow-read
//   supabase/functions/zapp-sentry-sync/__tests__/contract.test.ts
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
      "RED: zapp-sentry-sync ainda não implementada (sem index.ts) — " +
        (e instanceof Error ? e.message : String(e)),
    );
  }
}

Deno.test("A1 contrato fonte: edge existe e registra handler (Deno.serve)", async () => {
  assertMatch(await sourceOrThrow(), /Deno\.serve\(/);
});

Deno.test("A2 contrato fonte: auth admin/user (401 sem JWT)", async () => {
  // Aceita requireAdminOrSupervisor OU requireUser + checagem admin equivalente
  assertMatch(
    await sourceOrThrow(),
    /require(?:AdminOrSupervisor|User)\(\s*req\s*\)/,
  );
});

Deno.test("A3 contrato fonte: gate parseOrReject com contrato zapp-sentry-sync", async () => {
  assertMatch(await sourceOrThrow(), /parseOrReject\(\s*['"]zapp-sentry-sync['"]/);
});

Deno.test("A4 contrato fonte: lê config (zapp.sentry_config)", async () => {
  assertMatch(await sourceOrThrow(), /sentry_config/);
});

Deno.test("A5 contrato fonte: resposta honesta not_configured", async () => {
  assertMatch(await sourceOrThrow(), /not_configured/);
});

Deno.test("A6 contrato fonte: envelope de resposta com synced/reason (chaves QUOTED)", async () => {
  // Âncoras casam TEXTO-FONTE: JSON.stringify({ synced, ... }) shorthand NÃO
  // casa — a implementação precisa de chaves quotadas ("synced": ..., "reason": ...)
  const src = await sourceOrThrow();
  assertMatch(src, /['"]synced['"]\s*:/);
  assertMatch(src, /['"]reason['"]\s*:/);
});

Deno.test("A7 contrato fonte: chave registrada em CONTRACT_SCHEMAS + CONTRACT_VERSIONS", async () => {
  const schemas = await readSourceFrom(import.meta.url, "../../_shared/contract-schemas.ts");
  const versions = await readSourceFrom(import.meta.url, "../../_shared/contract-versions.ts");
  assertMatch(schemas, /['"]zapp-sentry-sync['"]\s*:/);
  assertMatch(versions, /['"]zapp-sentry-sync['"]\s*:/);
});

// ---------------------------------------------------------------------------
// Bloco B — COMPORTAMENTO via Deno.serve stub + fetch mock (sem rede/DB)
// Padrão zapp-notifications-dispatch/__tests__/contract.test.ts: stub do
// serve ANTES do import dinâmico; fetch mock roteia auth (/auth/v1/user),
// PostgREST (/rest/v1) vs API do Sentry (qualquer outra URL).
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
// Env ANTES do import dinâmico — auth.ts/db-client.ts leem variantes
// diferentes (SELFHOSTED_* e SUPABASE_*); setar AMBOS os pares.
for (const [k, v] of Object.entries({
  SELFHOSTED_SUPABASE_URL: "http://mock.local",
  SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key-123",
  SELFHOSTED_SUPABASE_ANON_KEY: "test-anon-key-123",
  SUPABASE_URL: "http://mock.local",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key-123",
  SUPABASE_ANON_KEY: "test-anon-key-123",
  CRON_SECRET: "test-cron-secret-123",
})) Deno.env.set(k, v);

const J = { "content-type": "application/json" };
const externalCalls: Array<{ url: string; body: unknown }> = [];
const restCalls: Array<{ url: string; method: string }> = [];
let configRows: unknown[] = [];

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = new URL(String(input));
  const b = init?.body ? JSON.parse(String(init.body)) : null;
  // Auth backend: supabase-js client.auth.getUser() → GET /auth/v1/user
  if (u.pathname.startsWith("/auth/v1/user")) {
    return new Response(
      JSON.stringify({
        user: {
          id: "admin-user-1",
          aud: "authenticated",
          role: "authenticated",
          email: "admin@zapp.local",
          app_metadata: {},
          user_metadata: {},
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      }),
      { headers: J },
    );
  }
  if (u.pathname.startsWith("/rest/v1")) {
    restCalls.push({ url: u.pathname, method: init?.method ?? "GET" });
    // requireAdminOrSupervisor → RPC is_admin_or_supervisor
    if (u.pathname.endsWith("/rpc/is_admin_or_supervisor")) {
      return new Response("true", { headers: J });
    }
    if (u.pathname.endsWith("/sentry_config") && (init?.method ?? "GET") === "GET") {
      return new Response(JSON.stringify(configRows), { headers: J });
    }
    return new Response("[]", { headers: J });
  }
  // Qualquer outra URL = API do Sentry (ingest/issues) — grava e responde ok
  externalCalls.push({ url: u.toString(), body: b });
  return new Response("[]", { headers: J });
}) as typeof fetch;

let importErr: string | null = null;
try {
  await import(new URL("../index.ts", import.meta.url).href);
} catch (e) {
  importErr = e instanceof Error ? e.message : String(e);
}
const mustExist = () => {
  if (importErr) {
    throw new Error("RED: edge zapp-sentry-sync ainda não implementada (sem index.ts): " + importErr);
  }
};

// JWT fake: payload com sub/role/aud/iss — requireUser valida via
// /auth/v1/user (mock acima); iss bate com SELFHOSTED_SUPABASE_URL.
const b64u = (o: Record<string, unknown>) =>
  btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const ADMIN_JWT = `${b64u({ alg: "HS256", typ: "JWT" })}.${b64u({
  sub: "admin-user-1",
  role: "authenticated",
  aud: "authenticated",
  iss: "http://mock.local",
  exp: 9999999999,
})}.fake-sig`;

const syncReq = (jwt?: string) =>
  h(new Request("http://mock.local/zapp-sentry-sync", {
    method: "GET",
    headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
  }));

const configRow = {
  id: 1,
  dsn_ref: "vault/sentry_dsn",
  organization: "atomicabr",
  enabled: true,
  created_at: "2026-08-17T00:00:00Z",
};

Deno.test("B1 sem JWT → 401 (auth antes de qualquer leitura/I/O)", async () => {
  mustExist();
  restCalls.length = 0;
  externalCalls.length = 0;
  const res = await syncReq();
  assertEquals(res.status, 401, "sem JWT deve ser 401, nunca 200");
  assertEquals(
    { rest: restCalls.length, external: externalCalls.length },
    { rest: 0, external: 0 },
    "401 deve ocorrer ANTES de qualquer chamada a banco/API do Sentry",
  );
});

Deno.test("B2 config ausente (0 rows) → 200 { synced:false, reason:'not_configured' }, zero chamadas Sentry", async () => {
  mustExist();
  configRows = [];
  restCalls.length = 0;
  externalCalls.length = 0;
  const res = await syncReq(ADMIN_JWT);
  assertEquals(res.status, 200, "config ausente deve responder 200, nunca 5xx");
  const body = await res.json() as Record<string, unknown>;
  assertEquals(body.synced, false);
  assertEquals(body.reason, "not_configured");
  assertEquals(externalCalls.length, 0, "sem config não pode chamar a API do Sentry");
});

Deno.test("B3 config presente + enabled → sync real via API do Sentry, envelope honesto, nunca 5xx", async () => {
  mustExist();
  configRows = [configRow];
  restCalls.length = 0;
  externalCalls.length = 0;
  const res = await syncReq(ADMIN_JWT);
  assertEquals(res.status, 200, "configurado deve responder 200, nunca 5xx");
  const body = await res.json() as Record<string, unknown>;
  assert(
    typeof body.synced === "boolean",
    "envelope deve carregar synced booleano honesto (real ou erro tratado)",
  );
  if (body.synced === false) {
    assert(
      typeof body.reason === "string",
      "synced:false exige reason string (ex.: provider_error)",
    );
  }
  assertEquals(
    externalCalls.length >= 1,
    true,
    "configurado deve chamar a API REAL do Sentry (contrato anti-mock)",
  );
});
