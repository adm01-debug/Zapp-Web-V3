// ============================================================================
// CONTRATO — auto-export@v1  (exportação automática da rota /auto-export)
// ============================================================================
// STATUS: RED — a edge `auto-export` AINDA NÃO EXISTE (sem index.ts; a rota
// `/auto-export` entrega AutoExportManager bloqueado com ShieldAlert —
// ViewRouter.tsx:107 + sidebarNavConfig.ts:141; plano Etapa 69.3/80:
// "implementar exportação agendada reutilizando ExportButton/getData").
// Estes testes definem o contrato: devem ficar VERDES quando a edge for
// implementada seguindo o header abaixo. NÃO editar a edge para casar com o
// teste — o teste segue a realidade (regra de ouro do repo).
//
// Papel: edge de exportação automática. Gera o arquivo de exportação (CSV)
// dos dados do período e devolve uma URL ASSINADA para download. Sem dados
// no período → vazio HONESTO (empty: true, url: null) — NUNCA devolver URL
// falsa/placeholder. Consumida pela rota `/auto-export` (usuário logado).
//
// REQUEST (POST, body JSON; espelho do payload de exportação do front):
// {
//   "export_type": "messages" | "contacts" | "conversations",  // enum fechado
//   "period_days": 7,          // opcional, int 1..365, default 7
// }
//
// AUTH: requireUser(req) — usuário logado (JWT de frontend). Sem bearer ou
// token inválido → 401 { error }. Feature de usuário, NÃO cron/service-only.
// GATE: parseOrReject('auto-export', CONTRACT_SCHEMAS['auto-export'], req,
//       raw, { extraHeaders }) → 422 envelope canônico em body inválido.
//       Registrar a chave em _shared/contract-schemas.ts E contract-versions.ts.
//
// COMPORTAMENTO (cenários contratuais):
// 1. 401 — sem Authorization (ou token inválido) → 401, NUNCA processa.
// 2. VAZIO HONESTO — query do período retorna 0 linhas → 200
//    { success: true, empty: true, exported: 0, url: null } — sem URL falsa,
//    ZERO chamadas ao storage (upload/sign). "Honesto" = sem dados → sem URL.
// 3. COM DADOS → URL — N > 0 linhas → gera CSV, upload no bucket `exports`,
//    createSignedUrl → 200 { success: true, empty: false, exported: N,
//    url: "https://.../storage/v1/object/sign/exports/....csv?token=..." }.
// 4. GATE 422 — body inválido (export_type fora do enum, body não-objeto) →
//    422 { error: true, code: "contract_violation" | "invalid_json" }.
// NUNCA 5xx.
//
// Rodar (idêntico ao CI): deno test --allow-net --allow-env --allow-read
//   supabase/functions/auto-export/__tests__/contract.test.ts
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
      "RED: auto-export ainda não implementada (sem index.ts) — " +
        (e instanceof Error ? e.message : String(e)),
    );
  }
}

Deno.test("A1 contrato fonte: edge existe e registra handler (Deno.serve)", async () => {
  assertMatch(await sourceOrThrow(), /Deno\.serve\(/);
});

Deno.test("A2 contrato fonte: auth de usuário logado (requireUser → 401)", async () => {
  assertMatch(await sourceOrThrow(), /requireUser\(\s*req\s*\)/);
});

Deno.test("A3 contrato fonte: gate parseOrReject com contrato auto-export", async () => {
  assertMatch(await sourceOrThrow(), /parseOrReject\(\s*['"]auto-export['"]/);
});

Deno.test("A4 contrato fonte: lê dados do período (messages + filtro gte)", async () => {
  const src = await sourceOrThrow();
  assertMatch(src, /\.from\(\s*['"]messages['"]\s*\)/);
  assertMatch(src, /\.gte\(/);
});

Deno.test("A5 contrato fonte: vazio HONESTO — empty:true e url:null (sem URL falsa)", async () => {
  const src = await sourceOrThrow();
  assertMatch(src, /\bempty\s*:\s*true\b/);
  assertMatch(src, /\burl\s*:\s*null\b/);
});

Deno.test("A6 contrato fonte: gera CSV no bucket exports + URL assinada", async () => {
  const src = await sourceOrThrow();
  assertMatch(src, /\.from\(\s*['"]exports['"]\s*\)/);
  assertMatch(src, /\.upload\(/);
  assertMatch(src, /createSignedUrl\(/);
  assertMatch(src, /\.csv\b/);
});

Deno.test("A7 contrato fonte: chave registrada em CONTRACT_SCHEMAS + CONTRACT_VERSIONS", async () => {
  const schemas = await readSourceFrom(import.meta.url, "../../_shared/contract-schemas.ts");
  const versions = await readSourceFrom(import.meta.url, "../../_shared/contract-versions.ts");
  assertMatch(schemas, /['"]auto-export['"]\s*:/);
  assertMatch(versions, /['"]auto-export['"]\s*:/);
});

Deno.test("A8 contrato fonte: erro tratado e nunca 5xx (try/catch + errorResponse)", async () => {
  const src = await sourceOrThrow();
  assertMatch(src, /\btry\s*\{/);
  assertMatch(src, /\bcatch\s*\(/);
  assertMatch(src, /errorResponse\(/);
});

// ---------------------------------------------------------------------------
// Bloco B — COMPORTAMENTO via Deno.serve stub + fetch mock (sem rede/DB)
// Padrão whatsapp-cloud-webhook-mock.test.ts / gmail-tests.test.ts: stub do
// serve ANTES do import dinâmico; fetch mock roteia /auth/v1/user (requireUser),
// PostgREST (/rest/v1) e Storage (/storage/v1).
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
  SUPABASE_URL: "http://mock.local",
  SELFHOSTED_SUPABASE_ANON_KEY: "test-anon-key-12345",
  SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY: "test-service-role-12345",
})) Deno.env.set(k, v);

const J = { "content-type": "application/json" };
let messagesRows: unknown[] = [];
const storageCalls: Array<{ type: "upload" | "sign" | "other"; url: string }> = [];

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = new URL(String(input));
  const method = init?.method ?? "GET";
  // requireUser → supabase-js auth.getUser() (gmail-tests.test.ts shape: { user })
  if (u.pathname === "/auth/v1/user" && method === "GET") {
    return new Response(
      JSON.stringify({ user: { id: "user-1", email: "test@example.com" } }),
      { status: 200, headers: J },
    );
  }
  // PostgREST: tabela de exportação (messages)
  if (u.pathname.startsWith("/rest/v1/messages") && method === "GET") {
    return new Response(JSON.stringify(messagesRows), { headers: J });
  }
  // PostgREST: contacts (outro export_type do enum)
  if (u.pathname.startsWith("/rest/v1/contacts") && method === "GET") {
    return new Response(JSON.stringify(messagesRows), { headers: J });
  }
  // Storage: createSignedUrl — POST /storage/v1/object/sign/exports/<path>
  if (u.pathname.startsWith("/storage/v1/object/sign/")) {
    storageCalls.push({ type: "sign", url: u.toString() });
    return new Response(
      JSON.stringify({
        signedURL: "https://mock.local/storage/v1/object/sign/exports/auto-export-messages-2026-08-17.csv?token=abc",
        path: "exports/auto-export-messages-2026-08-17.csv",
      }),
      { status: 200, headers: J },
    );
  }
  // Storage: upload — POST /storage/v1/object/exports/<path>
  if (u.pathname.startsWith("/storage/v1/object/exports/")) {
    storageCalls.push({ type: "upload", url: u.toString() });
    return new Response(
      JSON.stringify({ Key: u.pathname.slice("/storage/v1/object/".length) }),
      { status: 200, headers: J },
    );
  }
  return new Response(JSON.stringify({ unhandled: true, url: u.toString() }), {
    status: 404,
    headers: J,
  });
}) as typeof fetch;

let importErr: string | null = null;
try {
  await import(new URL("../index.ts", import.meta.url).href);
} catch (e) {
  importErr = e instanceof Error ? e.message : String(e);
}
const mustExist = () => {
  if (importErr) {
    throw new Error("RED: edge auto-export ainda não implementada (sem index.ts): " + importErr);
  }
};

// JWT falso com sub/role/iss coerentes — validado contra o stub de /auth/v1/user.
function b64url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const USER_TOKEN = `${b64url({ alg: "none", typ: "JWT" })}.${b64url({
  sub: "user-1",
  role: "authenticated",
  iss: "http://mock.local",
})}.fake-signature`;

const exportPayload = {
  export_type: "messages",
  period_days: 7,
};
const post = (o: unknown, headers: Record<string, string> = {}) =>
  h(new Request("http://mock.local/auto-export", {
    method: "POST",
    body: JSON.stringify(o),
    headers: { ...J, ...headers },
  }));
const authedPost = (o: unknown) => post(o, { authorization: `Bearer ${USER_TOKEN}` });

Deno.test("B1 sem Authorization → 401 (nunca processa exportação)", async () => {
  mustExist();
  messagesRows = [{ id: "m1" }];
  storageCalls.length = 0;
  const res = await post(exportPayload);
  assertEquals(res.status, 401, "sem token deve responder 401");
  const body = await res.json() as Record<string, unknown>;
  assert(body.error !== undefined, "401 deve carregar envelope de erro");
  assertEquals(storageCalls.length, 0, "401 não pode tocar o storage");
});

Deno.test("B1b token inválido → 401 (mesmo envelope)", async () => {
  mustExist();
  storageCalls.length = 0;
  const res = await post(exportPayload, { authorization: "Bearer abc.def.ghi" });
  assertEquals(res.status, 401, "token inválido deve responder 401");
  const body = await res.json() as Record<string, unknown>;
  assert(body.error !== undefined, "401 deve carregar envelope de erro");
});

Deno.test("B2 vazio HONESTO → 200 empty:true, url:null, zero chamadas ao storage", async () => {
  mustExist();
  messagesRows = [];
  storageCalls.length = 0;
  const res = await authedPost(exportPayload);
  assertEquals(res.status, 200, "vazio não é erro (nunca 5xx)");
  const body = await res.json() as Record<string, unknown>;
  assertEquals(body.empty, true, "vazio deve ser honesto: empty:true");
  assertEquals(body.exported, 0);
  assertEquals(body.url, null, "sem dados NUNCA devolve URL (vazio honesto)");
  assertEquals(storageCalls.length, 0, "sem dados não pode fazer upload/sign");
});

Deno.test("B3 com dados → 200 empty:false + URL assinada do CSV exportado", async () => {
  mustExist();
  messagesRows = [
    { id: "m1", sender: "contact", created_at: "2026-08-10T10:00:00Z" },
    { id: "m2", sender: "agent", created_at: "2026-08-11T10:00:00Z" },
  ];
  storageCalls.length = 0;
  const res = await authedPost(exportPayload);
  assertEquals(res.status, 200, "com dados deve responder 200, nunca 5xx");
  const body = await res.json() as Record<string, unknown>;
  assertEquals(body.empty, false);
  assertEquals(body.exported, 2, "exported deve refletir o nº de linhas exportadas");
  assert(
    typeof body.url === "string" && body.url.startsWith("http") &&
      body.url.includes("/storage/v1/object/sign/"),
    "com dados deve devolver URL assinada do storage (http + /storage/v1/object/sign/)",
  );
  assert(storageCalls.some((c) => c.type === "upload"), "com dados deve fazer upload do CSV no bucket exports");
  assert(storageCalls.some((c) => c.type === "sign"), "com dados deve criar URL assinada (createSignedUrl)");
});

Deno.test("B4 gate 422 — export_type fora do enum → envelope canônico contract_violation", async () => {
  mustExist();
  const res = await authedPost({ export_type: "pdf", period_days: 7 });
  assertEquals(res.status, 422, "body inválido deve responder 422");
  const body = await res.json() as Record<string, unknown>;
  assertEquals(body.error, true, "envelope canônico: error:true");
  assertEquals(body.code, "contract_violation", "envelope canônico: code contract_violation");
  assert(Array.isArray(body.details), "envelope canônico: details[] com path/message");
});

Deno.test("B4b gate 422 — body não-objeto → invalid_json", async () => {
  mustExist();
  const res = await authedPost("não é objeto");
  assertEquals(res.status, 422, "body não-objeto deve responder 422");
  const body = await res.json() as Record<string, unknown>;
  assertEquals(body.error, true);
  assertEquals(body.code, "invalid_json", "envelope canônico: code invalid_json");
});
