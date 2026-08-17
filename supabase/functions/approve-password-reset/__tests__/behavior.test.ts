/**
 * Behavior tests — approve-password-reset@v1 (handler real, fetch mockado).
 *
 * Cobre o fluxo de aprovação de reset de senha (Etapa 55) com EMAIL REAL:
 *   1. Sem JWT                     → 401 (requireAdminOrSupervisor)
 *   2. Não-admin                   → 403
 *   3. Aprovação com sucesso       → 200 { success: true, resetLink } E o
 *      email de reset É ENVIADO via Resend (mock) — to = email do solicitante,
 *      subject "Redefinição de senha — ZAPP Web", CTA com o action_link.
 *   4. Falha no envio do email     → 502 explícito "Approval recorded but email
 *      failed to send" + resetLink na resposta (fallback manual do admin).
 *   5. Request inexistente         → 404 genérico (sem vazamento de existência)
 *
 * Padrão do repo (espelha public-api/__tests__/e2e-send.test.ts): captura o
 * handler via Deno.serve e stub de globalThis.fetch para Supabase Auth/PostgREST
 * + Resend — sem rede real.
 *
 * Run: deno test --allow-env --allow-net --allow-read
 *      supabase/functions/approve-password-reset/__tests__/behavior.test.ts
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

const REQUEST_ID = "3f2b8f1e-6d4a-4c9e-9b7a-1c2d3e4f5a6b";

function makeReq(token: string | null, body: unknown): Request {
  const headers = new Headers({ "content-type": "application/json", origin: "http://localhost" });
  if (token) headers.set("authorization", `Bearer ${token}`);
  return new Request(`${BASE}/functions/v1/approve-password-reset`, {
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
let adminFlag = true;
let requestRow: Record<string, unknown> | null = {
  id: REQUEST_ID,
  email: "solicitante@test.com",
  status: "pending",
};
let resendStatus = 200;
let updateCount = 1; // resultado do guard atômico (count)

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** PostgREST `.single()` envia Accept object+json → resposta é objeto, não array. */
function wantsSingle(init?: RequestInit): boolean {
  const accept = new Headers(init?.headers).get("accept") ?? "";
  return accept.includes("application/vnd.pgrst.object+json");
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
  const single = wantsSingle(init);

  if (url.endsWith("/auth/v1/user") && method === "GET") {
    return jsonRes({ id: "admin-1", email: "admin@test.com" });
  }
  if (url.includes("/rest/v1/rpc/is_admin_or_supervisor") && method === "POST") {
    return jsonRes(adminFlag);
  }
  // password_reset_requests: fetch (GET .single()) e update (PATCH)
  if (url.includes("/rest/v1/password_reset_requests") && method === "GET") {
    if (!requestRow) return jsonRes({ code: "PGRST116", message: "No rows found" }, 406);
    return jsonRes(single ? requestRow : [requestRow]);
  }
  if (url.includes("/rest/v1/password_reset_requests") && method === "PATCH") {
    // .update(...).eq("id",..).eq("status","pending").select("id",{count:"exact",head:true})
    if (updateCount === 1 && requestRow) {
      return new Response(single ? JSON.stringify({ id: REQUEST_ID }) : "[]", {
        status: 200,
        headers: {
          "content-type": "application/json",
          "content-range": `0-0/${updateCount}`,
        },
      });
    }
    // count=0 → 409 (request já processado)
    return new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json", "content-range": `0-0/0` },
    });
  }
  // GoTrue generateLink (recovery)
  if (url.includes("/auth/v1/admin/generate_link") && method === "POST") {
    return jsonRes({
      properties: {
        action_link: "https://app.example.com/reset-password?token=reset123",
        hashed_token: "hashed-reset-token",
      },
      user: { id: "user-1" },
    });
  }
  // store_reset_token RPC
  if (url.includes("/rest/v1/rpc/store_reset_token") && method === "POST") {
    return jsonRes({ ok: true });
  }
  // Resend
  if (url.includes("api.resend.com/emails") && method === "POST") {
    return jsonRes({ id: "resend-reset-1" }, resendStatus);
  }
  return jsonRes({ unhandled: true, url }, 404);
}) as typeof fetch;

await import("../index.ts");
if (!captured) throw new Error("approve-password-reset did not register a handler via Deno.serve");
const handler: Handler = captured;

function reset() {
  calls.length = 0;
  adminFlag = true;
  requestRow = { id: REQUEST_ID, email: "solicitante@test.com", status: "pending" };
  resendStatus = 200;
  updateCount = 1;
  _resetRateLimitForTests();
}

// ─── Testes ────────────────────────────────────────────────────────────────

Deno.test({
  name: "approve-password-reset: 401 sem JWT — nenhuma chamada a banco/resend",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    const res = await handler(makeReq(null, { requestId: REQUEST_ID, action: "approve" }));
    assertEquals(res.status, 401);
    assertEquals(calls.length, 0, "auth falha antes de qualquer fetch");
  },
});

Deno.test({
  name: "approve-password-reset: 403 não-admin",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    adminFlag = false;
    const res = await handler(makeReq(makeJwt("agent-1"), { requestId: REQUEST_ID, action: "approve" }));
    assertEquals(res.status, 403);
    assertEquals(calls.some((c) => c.url.includes("api.resend.com")), false);
  },
});

Deno.test({
  name: "approve-password-reset: 200 — EMAIL REAL enviado via Resend (to/subject/CTA com action_link)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    const res = await handler(makeReq(makeJwt("admin-1"), { requestId: REQUEST_ID, action: "approve" }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.success, true);
    assertEquals(body.message, "Solicitação aprovada");
    assertEquals(body.resetLink, "https://app.example.com/reset-password?token=reset123");

    // Guard atômico: update com status=pending → count 1
    const patch = calls.find((c) => c.url.includes("/rest/v1/password_reset_requests") && c.method === "PATCH");
    assertExists(patch, "update de aprovação deve ser chamado");
    const patchBody = patch!.body as Record<string, unknown>;
    assertEquals(patchBody.status, "approved");

    // generateLink recovery
    const gl = calls.find((c) => c.url.includes("/auth/v1/admin/generate_link"));
    assertExists(gl, "generateLink (recovery) deve ser chamado");
    const glBody = gl!.body as Record<string, unknown>;
    assertEquals(glBody.type, "recovery");
    assertEquals(glBody.email, "solicitante@test.com");

    // store_reset_token RPC
    const rpc = calls.find((c) => c.url.includes("/rest/v1/rpc/store_reset_token"));
    assertExists(rpc, "store_reset_token deve ser chamado");
    assertEquals((rpc!.body as Record<string, unknown>).p_request_id, REQUEST_ID);
    assertEquals((rpc!.body as Record<string, unknown>).p_token, "hashed-reset-token");

    // EMAIL REAL: resend chamado com o email do solicitante + CTA do link
    const mail = calls.find((c) => c.url.includes("api.resend.com/emails"));
    assertExists(mail, "sendTransactionalEmail (Resend) DEVE ser chamado");
    const mailBody = mail!.body as Record<string, unknown>;
    assertEquals(mailBody.to, ["solicitante@test.com"]);
    assertEquals(mailBody.from, "noreply@test.example.com");
    assertEquals(mailBody.subject, "Redefinição de senha — ZAPP Web");
    assert(
      (mailBody.html as string).includes("https://app.example.com/reset-password?token=reset123"),
      "CTA do email deve conter o action_link real",
    );
    assert((mailBody.html as string).includes("Redefinir senha"));
  },
});

Deno.test({
  name: "approve-password-reset: falha no email → 502 explícito com resetLink (fallback manual)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    resendStatus = 503; // Resend fora do ar
    const res = await handler(makeReq(makeJwt("admin-1"), { requestId: REQUEST_ID, action: "approve" }));
    assertEquals(res.status, 502);
    const body = await res.json();
    assertEquals(body.error, "Approval recorded but email failed to send");
    assertEquals(body.resetLink, "https://app.example.com/reset-password?token=reset123");
  },
});

Deno.test({
  name: "approve-password-reset: request inexistente → 404 genérico (sem vazamento)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    requestRow = null;
    const res = await handler(makeReq(makeJwt("admin-1"), { requestId: REQUEST_ID, action: "approve" }));
    assertEquals(res.status, 404);
    const body = await res.json();
    assertEquals(body.error, "Reset request not found");
    assertEquals(calls.some((c) => c.url.includes("api.resend.com")), false);
  },
});
