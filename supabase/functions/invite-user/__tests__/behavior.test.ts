/**
 * Behavior tests — invite-user@v1 (handler real, fetch mockado).
 *
 * Cobre o contrato de segurança do fluxo de convite (Etapa 57):
 *   1. Sem JWT                     → 401 (requireAdminOrSupervisor)
 *   2. JWT válido não-admin        → 403 (is_admin_or_supervisor = false)
 *   3. Admin/supervisor            → 200 { success: true, invite_id } com
 *      EMAIL REAL ENVIADO via Resend (mock: POST api.resend.com/emails) —
 *      assert do corpo (to = email convidado, subject, CTA com action_link)
 *   4. Email já registrado         → 409 "Email already registered" (não 500)
 *   5. Falha no envio do email     → 502 explícito + rollback (deleteUser)
 *
 * Padrão do repo (espelha public-api/__tests__/e2e-send.test.ts): captura o
 * handler via Deno.serve e stub de globalThis.fetch para Supabase Auth/PostgREST
 * + Resend — sem rede real.
 *
 * Run: deno test --allow-env --allow-net --allow-read
 *      supabase/functions/invite-user/__tests__/behavior.test.ts
 */
import { assertEquals, assert, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { _resetRateLimitForTests } from "../../_shared/validation.ts";

// ─── Env stubs (antes do import do index.ts) ──────────────────────────────
const BASE = "https://self.example.com";
Deno.env.set("SELFHOSTED_SUPABASE_URL", BASE);
Deno.env.set("SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key-12345");
Deno.env.set("SELFHOSTED_SUPABASE_ANON_KEY", "test-anon-key-12345");
Deno.env.set("APP_URL", "https://app.example.com");
Deno.env.set("RESEND_API_KEY", "re_test_resend_key_123");
Deno.env.set("RESEND_FROM_EMAIL", "noreply@test.example.com");

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

function makeReq(token: string | null, body: unknown): Request {
  const headers = new Headers({ "content-type": "application/json", origin: "http://localhost" });
  if (token) headers.set("authorization", `Bearer ${token}`);
  return new Request(`${BASE}/functions/v1/invite-user`, {
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
let adminFlag = true; // is_admin_or_supervisor → true/false
let createUserError: { status: number; body: unknown } | null = null;
let resendStatus = 200;
let inviteRpcError: { status: number; body: unknown } | null = null;

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

  // GoTrue: validação do token (auth.getUser)
  if (url.endsWith("/auth/v1/user") && method === "GET") {
    return jsonRes({ id: "admin-1", email: "admin@test.com" });
  }
  // GoTrue: createUser
  if (url.includes("/auth/v1/admin/users") && method === "POST" && !url.includes("generate")) {
    if (createUserError) return jsonRes(createUserError.body, createUserError.status);
    return jsonRes({ id: "invitee-1", email: "novo@test.com" });
  }
  // GoTrue: deleteUser (rollback)
  if (url.includes("/auth/v1/admin/users/") && method === "DELETE") {
    return jsonRes({});
  }
  // GoTrue: generateLink
  if (url.includes("/auth/v1/admin/generate_link") && method === "POST") {
    return jsonRes({
      properties: {
        action_link: "https://app.example.com/accept-invite?token=abc123",
        hashed_token: "hashed-token-abc",
      },
      user: { id: "invitee-1" },
    });
  }
  // PostgREST: role check
  if (url.includes("/rest/v1/rpc/is_admin_or_supervisor") && method === "POST") {
    return jsonRes(adminFlag);
  }
  // PostgREST: user_roles upsert
  if (url.includes("/rest/v1/user_roles") && method === "POST") {
    return jsonRes([]);
  }
  // PostgREST: invite_user RPC
  if (url.includes("/rest/v1/rpc/invite_user") && method === "POST") {
    if (inviteRpcError) return jsonRes(inviteRpcError.body, inviteRpcError.status);
    return jsonRes("invite-row-1");
  }
  // Resend
  if (url.includes("api.resend.com/emails") && method === "POST") {
    return jsonRes({ id: "resend-msg-1" }, resendStatus);
  }

  return jsonRes({ unhandled: true, url }, 404);
}) as typeof fetch;

await import("../index.ts");
if (!captured) throw new Error("invite-user did not register a handler via Deno.serve");
const handler: Handler = captured;

function reset() {
  calls.length = 0;
  adminFlag = true;
  createUserError = null;
  resendStatus = 200;
  inviteRpcError = null;
  _resetRateLimitForTests();
}

// ─── Testes ────────────────────────────────────────────────────────────────

Deno.test({
  name: "invite-user: 401 sem JWT (requireAdminOrSupervisor) — nenhuma chamada a banco/resend",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    const res = await handler(makeReq(null, { email: "novo@test.com" }));
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(body.error, "Unauthorized: missing bearer token");
    assertEquals(calls.length, 0, "auth falha antes de qualquer fetch");
  },
});

Deno.test({
  name: "invite-user: 403 não-admin (is_admin_or_supervisor = false)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    adminFlag = false;
    const res = await handler(makeReq(makeJwt("agent-1"), { email: "novo@test.com" }));
    assertEquals(res.status, 403);
    const body = await res.json();
    assertEquals(body.error, "Forbidden: admin or supervisor required");
    const rpcs = calls.filter((c) => c.url.includes("/rpc/"));
    assertEquals(rpcs.length, 1, "só o role check roda; createUser nunca é chamado");
    assertEquals(calls.some((c) => c.url.includes("/auth/v1/admin/users")), false);
  },
});

Deno.test({
  name: "invite-user: 200 admin — email REAL enviado via Resend (to/subject/CTA com action_link)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    const res = await handler(makeReq(makeJwt("admin-1"), {
      email: "novo@test.com",
      role: "supervisor",
      message: "Bem-vindo ao time",
    }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);
    assertEquals(body.invite_id, "invite-row-1");

    // createUser com email_confirm=false e sem senha (aceite ativa a conta)
    const cu = calls.find((c) => c.url.includes("/auth/v1/admin/users") && c.method === "POST");
    assertExists(cu, "createUser deve ser chamado");
    const cuBody = cu!.body as Record<string, unknown>;
    assertEquals(cuBody.email, "novo@test.com");
    assertEquals(cuBody.email_confirm, false);

    // role upsert
    const ups = calls.find((c) => c.url.includes("/rest/v1/user_roles"));
    assertExists(ups, "user_roles upsert deve ser chamado");
    assertEquals((ups!.body as Record<string, unknown>).role, "supervisor");

    // RPC invite_user com token/expiração
    const rpc = calls.find((c) => c.url.includes("/rest/v1/rpc/invite_user"));
    assertExists(rpc, "invite_user RPC deve ser chamado");
    const rpcBody = rpc!.body as Record<string, unknown>;
    assertEquals(rpcBody.p_email, "novo@test.com");
    assertEquals(rpcBody.p_role, "supervisor");
    assertEquals(rpcBody.p_token, "hashed-token-abc");

    // EMAIL REAL: resend chamado com o email convidado
    const mail = calls.find((c) => c.url.includes("api.resend.com/emails"));
    assertExists(mail, "sendTransactionalEmail (Resend) DEVE ser chamado");
    const mailBody = mail!.body as Record<string, unknown>;
    assertEquals(mailBody.to, ["novo@test.com"]);
    assertEquals(mailBody.from, "noreply@test.example.com");
    assertEquals(mailBody.subject, "Convite para o ZAPP Web");
    assert(
      (mailBody.html as string).includes("https://app.example.com/accept-invite?token=abc123"),
      "CTA do email deve conter o action_link real do GoTrue",
    );
    assert((mailBody.html as string).includes("Aceitar convite"));
    assert((mailBody.html as string).includes("supervisor"), "mensagem deve citar o papel");
  },
});

Deno.test({
  name: "invite-user: email já registrado → 409 (erro tratado, nunca 500)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    createUserError = {
      status: 400,
      body: { code: "user_already_exists", message: "A user with this email address has already been registered" },
    };
    const res = await handler(makeReq(makeJwt("admin-1"), { email: "existente@test.com" }));
    assertEquals(res.status, 409);
    const body = await res.json();
    assertEquals(body.error, "Email already registered");
    assertEquals(calls.some((c) => c.url.includes("api.resend.com")), false, "sem email em duplicado");
  },
});

Deno.test({
  name: "invite-user: falha no envio do email → 502 explícito + rollback (deleteUser)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    resendStatus = 503; // Resend fora do ar
    const res = await handler(makeReq(makeJwt("admin-1"), { email: "novo@test.com" }));
    assertEquals(res.status, 502);
    const body = await res.json();
    assertEquals(body.error, "Invite created but email failed to send");
    const del = calls.find((c) => c.url.includes("/auth/v1/admin/users/") && c.method === "DELETE");
    assertExists(del, "rollback deleteUser deve rodar após falha de email");
  },
});
