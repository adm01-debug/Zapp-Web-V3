/**
 * gmail-tests — testes REAIS de gmail-send + gmail-token-refresh.
 *
 * Substitui a versão anterior (4 testes SEM efeito: asserts comentados,
 * early-return em CI e payloads/mocks mortos) por invocação REAL dos
 * handlers via capture de `Deno.serve` + fetch 100% stubado:
 *
 *   - Zero chamadas HTTP reais: Supabase REST (/rest/v1, /auth/v1/user),
 *     Gmail API (gmail.googleapis.com) e OAuth2 (oauth2.googleapis.com)
 *     são todos servidos por um stub global de fetch que também REGISTRA
 *     cada chamada (url, method, body, headers) para asserts de efeito.
 *   - Env é stubado ANTES do import (SELFHOSTED_SUPABASE_URL, anon/service
 *     keys, GOOGLE_CLIENT_ID/SECRET) — o early-return de CI do arquivo
 *     antigo não existe mais.
 *   - Comportamento com env ausente é coberto por teste REAL: gmail-send
 *     com token expirado e GOOGLE_CLIENT_ID ausente → 401 (gmail-send lê
 *     env em call-time; gmail-token-refresh lê em import-time, então o
 *     cenário dele só é validável via 500/404 em integração real).
 *
 * Rodar:
 *   deno test --allow-net --allow-env --allow-read supabase/functions/gmail-tests.test.ts
 */
import { assert, assertEquals } from "jsr:@std/assert";
import { _resetRateLimitForTests } from "./_shared/validation.ts";

// ─── Env stubs (obrigatório ANTES do import dos módulos) ───────────────────
Deno.env.set("SELFHOSTED_SUPABASE_URL", "https://stub.supabase.co");
Deno.env.set("SELFHOSTED_SUPABASE_ANON_KEY", "stub-anon-key-123456");
Deno.env.set("SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY", "stub-service-role-key-123");
Deno.env.set("GOOGLE_CLIENT_ID", "stub-google-client-id");
Deno.env.set("GOOGLE_CLIENT_SECRET", "stub-google-client-secret");

// ─── Capture dos handlers em vez de subir servidor real ────────────────────
type Handler = (req: Request) => Promise<Response> | Response;
const capturedHandlers: Handler[] = [];
const originalServe = Deno.serve;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (handler: Handler) => {
  capturedHandlers.push(handler);
  return { finished: Promise.resolve(), shutdown: () => {} } as unknown as ReturnType<typeof originalServe>;
};

// ─── Stub global de fetch (Supabase REST + Gmail API + OAuth2) ─────────────
interface CapturedCall {
  url: string;
  method: string;
  body: unknown;
  headers: Headers;
}
const calls: CapturedCall[] = [];

const ACCOUNT_ROW = {
  id: "acc_123",
  email: "sender@example.com",
  user_id: "user-1",
  access_token: "stub-access-token",
  token_expiry: "2099-01-01T00:00:00.000Z",
  refresh_token: "stub-refresh-token",
};

let gmailAccountsQueryResult: unknown[] = [ACCOUNT_ROW];
let gmailResponse: { ok: boolean; body: unknown } = {
  ok: true,
  body: { id: "msg_123", threadId: "th_123" },
};
let oauthResponse: { ok: boolean; body: unknown } = {
  ok: true,
  body: { access_token: "refreshed_token", expires_in: 3600 },
};

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** PostgREST `.single()` / `.maybeSingle()` espera objeto (não array). */
function wantsSingle(init?: RequestInit): boolean {
  const accept = new Headers(init?.headers).get("accept") ?? "";
  return accept.includes("application/vnd.pgrst.object+json");
}

const originalFetch = globalThis.fetch;
// Corpo síncrono, mas `async` é exigido pelo tipo de globalThis.fetch
// (retorno Promise<Response>) — mesmo padrão de public-api/__tests__/e2e-send.test.ts.
// deno-lint-ignore require-await
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string"
    ? input
    : input instanceof URL
    ? input.toString()
    : (input as Request).url;
  const method = (init?.method ?? "GET").toUpperCase();
  let body: unknown = undefined;
  if (init?.body) {
    try { body = JSON.parse(init.body as string); } catch { body = init.body; }
  }
  calls.push({ url, method, body, headers: new Headers(init?.headers ?? {}) });

  const single = wantsSingle(init);

  // requireUser → client.auth.getUser()
  if (url.includes("/auth/v1/user")) {
    return jsonRes({ user: { id: "user-1", email: "test@example.com" } });
  }
  // gmail_accounts: selects (single) + PATCH de atualização
  if (url.includes("/rest/v1/gmail_accounts")) {
    return jsonRes(single ? gmailAccountsQueryResult[0] ?? null : gmailAccountsQueryResult);
  }
  // Demais tabelas (email_tracked_messages, evolution_alerts…) — resposta genérica
  if (url.includes("/rest/v1/")) {
    return jsonRes(single ? { id: "row-1" } : [{ id: "row-1" }]);
  }
  // Gmail API (send/modify/trash/drafts)
  if (url.includes("gmail.googleapis.com")) {
    return jsonRes(gmailResponse.body, gmailResponse.ok ? 200 : 500);
  }
  // OAuth2 token refresh
  if (url.includes("oauth2.googleapis.com")) {
    return jsonRes(oauthResponse.body, oauthResponse.ok ? 200 : 500);
  }
  return jsonRes({ unhandled: true, url }, 404);
};

// Importa os módulos — Deno.serve é capturado acima (não sobe servidor).
await import("./gmail-send/index.ts");
await import("./gmail-token-refresh/index.ts");
if (capturedHandlers.length !== 2) {
  throw new Error(`esperava 2 handlers (gmail-send + gmail-token-refresh), capturou ${capturedHandlers.length}`);
}
const gmailSendHandler = capturedHandlers[0];
const gmailTokenRefreshHandler = capturedHandlers[1];

// ─── Helpers de request ─────────────────────────────────────────────────────
function b64url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** JWT falso com sub/role/iss coerentes — validado contra o stub de /auth/v1/user. */
const FAKE_USER_JWT = `${b64url({ alg: "none", typ: "JWT" })}.${b64url({
  sub: "user-1",
  role: "authenticated",
  iss: "https://stub.supabase.co",
})}.fake-signature`;

function makeUserReq(body: unknown): Request {
  return new Request("https://stub/gmail-send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${FAKE_USER_JWT}`,
    },
    body: JSON.stringify(body),
  });
}

function makeServiceReq(body: unknown): Request {
  return new Request("https://stub/gmail-token-refresh", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer stub-service-role-key-123",
    },
    body: JSON.stringify(body),
  });
}

function reset() {
  calls.length = 0;
  gmailAccountsQueryResult = [ACCOUNT_ROW];
  gmailResponse = { ok: true, body: { id: "msg_123", threadId: "th_123" } };
  oauthResponse = { ok: true, body: { access_token: "refreshed_token", expires_in: 3600 } };
  Deno.env.set("GOOGLE_CLIENT_ID", "stub-google-client-id");
  Deno.env.set("GOOGLE_CLIENT_SECRET", "stub-google-client-secret");
  _resetRateLimitForTests();
}

// ─── Testes ─────────────────────────────────────────────────────────────────
// sanitizeOps/sanitizeResources desligados: os handlers usam
// AbortSignal.timeout() (timer pendente após resposta stub) — mesmo padrão
// de public-api/__tests__/e2e-send.test.ts e evolution-api (_helpers.ts).

Deno.test({
  name: "gmail-send action:send success — payload válido → 200 + messageId/threadId (fetch stub, sem rede)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    const res = await gmailSendHandler(makeUserReq({
      action: "send",
      accountId: "acc_123",
      to: ["test@example.com"],
      subject: "Test Subject",
      bodyHtml: "<h1>Hello</h1>",
    }));

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.messageId, "msg_123");
    assertEquals(data.threadId, "th_123");

    // Chamou a Gmail API UMA vez, com o access_token vindo do banco (stub).
    const gmailCalls = calls.filter(c => c.url.includes("gmail.googleapis.com"));
    assertEquals(gmailCalls.length, 1, "deve chamar exatamente 1x a Gmail API");
    assert(
      gmailCalls[0].headers.get("authorization")?.includes("stub-access-token"),
      "Authorization da Gmail API deve conter o access_token do banco",
    );

    // Nenhuma chamada fora dos hosts stubados (garante zero rede real).
    const unexpected = calls.filter(c =>
      !c.url.includes("stub.supabase.co") &&
      !c.url.includes("gmail.googleapis.com") &&
      !c.url.includes("oauth2.googleapis.com")
    );
    assertEquals(unexpected.length, 0, `chamadas fora do stub: ${JSON.stringify(unexpected.map(c => c.url))}`);
  },
});

Deno.test({
  name: "gmail-send action:send validation error — to/subject ausentes → 400; env ausente (token expirado sem GOOGLE_CLIENT_ID) → 401",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();

    // (a) `to` ausente (schema permite omitir; handler valida) → 400
    let res = await gmailSendHandler(makeUserReq({ action: "send", accountId: "acc_123" }));
    assertEquals(res.status, 400);
    let body = await res.json();
    assert(body.error.includes("to array com emails válidos obrigatório"), `erro inesperado: ${body.error}`);
    assertEquals(
      calls.filter(c => c.url.includes("gmail.googleapis.com")).length,
      0,
      "validação falhou ANTES de chamar a Gmail API",
    );

    // (b) `subject` ausente → 400
    res = await gmailSendHandler(makeUserReq({
      action: "send",
      accountId: "acc_123",
      to: ["test@example.com"],
    }));
    assertEquals(res.status, 400);
    body = await res.json();
    assert(body.error.includes("subject obrigatório"), `erro inesperado: ${body.error}`);

    // (c) env ausente: token expirado + GOOGLE_CLIENT_ID/SECRET removidos
    // (gmail-send lê env em call-time) → getValidToken retorna null → 401
    gmailAccountsQueryResult = [{ ...ACCOUNT_ROW, token_expiry: "2020-01-01T00:00:00.000Z" }];
    Deno.env.delete("GOOGLE_CLIENT_ID");
    Deno.env.delete("GOOGLE_CLIENT_SECRET");
    try {
      res = await gmailSendHandler(makeUserReq({
        action: "send",
        accountId: "acc_123",
        to: ["test@example.com"],
        subject: "S",
      }));
      assertEquals(res.status, 401);
      body = await res.json();
      assert(body.error.includes("Token inválido"), `erro inesperado: ${body.error}`);
    } finally {
      reset();
    }
  },
});

Deno.test({
  name: "gmail-token-refresh action:refreshSingle success — conta válida + OAuth2 stub → 200 {success:true} e PATCH persistindo novo token",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    const accountId = "00000000-0000-4000-a000-000000000001";
    const res = await gmailTokenRefreshHandler(makeServiceReq({ action: "refreshSingle", accountId }));

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.success, true);
    assert(typeof data.newExpiry === "string" && data.newExpiry.length > 0, "newExpiry deve vir no body");

    // Chamou o OAuth2 para renovar o access_token
    const oauthCalls = calls.filter(c => c.url.includes("oauth2.googleapis.com"));
    assertEquals(oauthCalls.length, 1, "deve chamar o OAuth2 token endpoint");

    // E persistiu o novo token no banco (PATCH em gmail_accounts)
    const patches = calls.filter(c => c.method === "PATCH" && c.url.includes("/rest/v1/gmail_accounts"));
    assertEquals(patches.length, 1, "deve dar PATCH em gmail_accounts com o novo token");
    const patchBody = patches[0].body as Record<string, unknown>;
    assertEquals(patchBody.access_token, "refreshed_token");
    assert(typeof patchBody.token_expiry === "string", "token_expiry deve ser atualizado");
  },
});

Deno.test({
  name: "gmail-token-refresh action:refreshAll skipping inactive — 0 contas ativas → 200 {success:true, refreshed:0} e query filtra is_active=true",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    gmailAccountsQueryResult = []; // nenhuma conta ativa expirando

    const res = await gmailTokenRefreshHandler(makeServiceReq({ action: "refreshAll" }));

    assertEquals(res.status, 200);
    const data = await res.json();
    assertEquals(data.success, true);
    assertEquals(data.refreshed, 0);
    assert(data.message.includes("Nenhum token para renovar"), `mensagem inesperada: ${data.message}`);

    // A query de refreshAll filtra contas ativas com token expirando — nada
    // de fetch para o OAuth2 quando não há contas elegíveis.
    const accountQuery = calls.find(c =>
      c.method === "GET" && c.url.includes("/rest/v1/gmail_accounts")
    );
    assert(accountQuery, "deve consultar gmail_accounts");
    assert(accountQuery!.url.includes("is_active=eq.true"), `query deve filtrar is_active=true: ${accountQuery!.url}`);
    assertEquals(
      calls.filter(c => c.url.includes("oauth2.googleapis.com")).length,
      0,
      "sem contas elegíveis, não deve chamar o OAuth2",
    );
  },
});

// ─── Cleanup (caso o runner reutilize o processo) ───────────────────────────
globalThis.addEventListener("unload", () => {
  globalThis.fetch = originalFetch;
  // deno-lint-ignore no-explicit-any
  (Deno as any).serve = originalServe;
});
