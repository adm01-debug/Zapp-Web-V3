/**
 * Behavior tests — revoke-session@v1 (handler real, fetch mockado).
 *
 * Cobre o contrato de segurança da revogação de sessões (Etapa 56):
 *   1. Sem JWT                    → 401 (requireUser)
 *   2. Sessão de OUTRO usuário    → 403 (ownership check; não-admin)
 *   3. Dono revogando a própria   → 200 { success: true, revoked }
 *
 * Padrão do repo (espelha public-api/__tests__/e2e-send.test.ts): captura o
 * handler via Deno.serve e stub de globalThis.fetch para Supabase Auth/PostgREST.
 *
 * Run: deno test --allow-env --allow-net --allow-read
 *      supabase/functions/revoke-session/__tests__/behavior.test.ts
 */
import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { _resetRateLimitForTests } from "../../_shared/validation.ts";

// ─── Env stubs (antes do import do index.ts) ──────────────────────────────
const BASE = "https://self.example.com";
Deno.env.set("SELFHOSTED_SUPABASE_URL", BASE);
Deno.env.set("SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key-12345");
Deno.env.set("SELFHOSTED_SUPABASE_ANON_KEY", "test-anon-key-12345");

// ─── Capture do handler (Deno.serve) ──────────────────────────────────────
type Handler = (req: Request) => Promise<Response> | Response;
let captured: Handler | null = null;
const originalServe = Deno.serve;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (handler: Handler) => {
  captured = handler;
  return { finished: Promise.resolve(), shutdown: () => {} } as unknown as ReturnType<typeof originalServe>;
};

// ─── Helpers ───────────────────────────────────────────────────────────────
function b64url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function makeJwt(sub: string): string {
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const body = b64url({ role: "authenticated", sub, iss: `${BASE}/auth/v1` });
  return `${header}.${body}.sig-opaque`;
}

const MY_SESSION = "3f2b8f1e-6d4a-4c9e-9b7a-1c2d3e4f5a6b";
const OTHER_SESSION = "9f8e7d6c-5b4a-4c3b-9a8b-7c6d5e4f3a2b";

function makeReq(token: string | null, body: unknown): Request {
  const headers = new Headers({ "content-type": "application/json", origin: "http://localhost" });
  if (token) headers.set("authorization", `Bearer ${token}`);
  return new Request(`${BASE}/functions/v1/revoke-session`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

const calls: FetchCall[] = [];
let adminFlag = false; // is_admin_or_supervisor → true/false
let ownSessions: Array<{ id: string }> = [{ id: MY_SESSION }];
let revokeResult: unknown = 1;

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
  const method = (init?.method ?? "GET").toUpperCase();
  let body: unknown = undefined;
  if (init?.body) {
    try { body = JSON.parse(init.body as string); } catch { body = init.body; }
  }
  calls.push({ url, method, body });

  if (url.endsWith("/auth/v1/user") && method === "GET") {
    return jsonRes({ id: "user-1", email: "dono@test.com" });
  }
  if (url.includes("/rest/v1/rpc/is_admin_or_supervisor") && method === "POST") {
    return jsonRes(adminFlag);
  }
  if (url.includes("/rest/v1/rpc/sessions_list") && method === "POST") {
    return jsonRes(ownSessions);
  }
  if (url.includes("/rest/v1/rpc/sessions_revoke") && method === "POST") {
    return jsonRes(revokeResult);
  }
  return jsonRes({ unhandled: true, url }, 404);
}) as typeof fetch;

await import("../index.ts");
if (!captured) throw new Error("revoke-session did not register a handler via Deno.serve");
const handler: Handler = captured;

function reset() {
  calls.length = 0;
  adminFlag = false;
  ownSessions = [{ id: MY_SESSION }];
  revokeResult = 1;
  _resetRateLimitForTests();
}

// ─── Testes ────────────────────────────────────────────────────────────────

Deno.test({
  name: "revoke-session: 401 sem JWT (requireUser) — nenhuma chamada a banco",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    const res = await handler(makeReq(null, { sessionId: MY_SESSION }));
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error, "Unauthorized: missing bearer token");
    assertEquals(calls.length, 0, "auth falha antes de qualquer fetch");
  },
});

Deno.test({
  name: "revoke-session: 403 sessão de OUTRO usuário (não-admin) — sessions_revoke nunca é chamado",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    adminFlag = false;
    ownSessions = [{ id: MY_SESSION }]; // a do outro NÃO está na lista do dono
    const res = await handler(makeReq(makeJwt("user-1"), { sessionId: OTHER_SESSION }));
    assertEquals(res.status, 403);
    const body = await res.json();
    assertEquals(body.error, "Forbidden: you can only revoke your own sessions");
    assertEquals(
      calls.some((c) => c.url.includes("/rest/v1/rpc/sessions_revoke")),
      false,
      "revogação não deve ser chamada para sessão alheia",
    );
  },
});

Deno.test({
  name: "revoke-session: 200 dono revogando a própria sessão → sessions_revoke com p_admin=false",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    adminFlag = false;
    ownSessions = [{ id: MY_SESSION }];
    revokeResult = 1;
    const res = await handler(makeReq(makeJwt("user-1"), { sessionId: MY_SESSION }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);
    assertEquals(body.revoked, 1);

    const revoke = calls.find((c) => c.url.includes("/rest/v1/rpc/sessions_revoke"));
    assertExists(revoke, "sessions_revoke deve ser chamado");
    const rpcBody = revoke!.body as Record<string, unknown>;
    assertEquals(rpcBody.p_target_user_id, "user-1");
    assertEquals(rpcBody.p_admin, false);
    assertEquals(rpcBody.p_session_ids, [MY_SESSION]);
  },
});
