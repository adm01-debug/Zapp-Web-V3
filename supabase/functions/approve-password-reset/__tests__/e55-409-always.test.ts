// approve-password-reset — E55 regressão: 409-ALWAYS (count ausente no guard atômico).
//
// Bug (GAP V3-5): o guard atômico usava
//   .update(...).eq("status","pending").select("id", { count: "exact", head: true })
// A opção count NÃO pertence ao select() do postgrest-js v2 — ela é opção do
// update() (e nem sequer entra no header Prefer). Resultado real (probe
// wt-w3/hermes/probe-approve-count.ts, runtime supabase-js 2.49.1):
//   RESULT: {"count":null,"error":null,"data":null}
// → !updatedCount é SEMPRE true → TODA aprovação/rejeição responde 409.
//
// Este arquivo simula o handler REAL (stub de Deno.serve + fetch mock) com o
// PostgREST real: PATCH + Prefer return=representation devolve as linhas
// afetadas no corpo; Content-Range só existe quando count=exact é pedido.
//
// Rodar: deno test --allow-read --allow-env supabase/functions/approve-password-reset/__tests__/e55-409-always.test.ts
import { assertEquals } from "jsr:@std/assert";
import { _resetRateLimitForTests } from "../../_shared/validation.ts";

type H = (r: Request) => Promise<Response> | Response;
let h: H = () => new Response("");
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
  SELFHOSTED_SUPABASE_ANON_KEY: "test-anon-key-123456",
  SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key-123456",
  APP_URL: "http://app.local",
})) Deno.env.set(k, v);
Deno.env.delete("RESEND_API_KEY"); // skip email real; emailSent=false é contrato

const J = { "content-type": "application/json" };
const Jres = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers: { ...J, ...headers } });

const UUID = "3f2b8f1e-6d4a-4c9e-9b7a-1c2d3e4f5a6b";

// ── estado do banco simulado (zapp.password_reset_requests) ────────────────
let dbRow: { id: string; email: string; status: string } | null = null;
// Simula a corrida: GET vê "pending", mas o PATCH afeta 0 linhas (outro admin venceu).
let raceZeroAffected = false;
const restCalls: Array<{ method: string; path: string; prefer: string | null }> = [];

globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const u = new URL(String(input));
  const method = (init?.method ?? "GET").toUpperCase();
  const prefer = new Headers(init?.headers).get("prefer");
  restCalls.push({ method, path: u.pathname, prefer });

  if (u.pathname.endsWith("/auth/v1/user")) {
    return Jres({ user: { id: "admin-1", email: "admin@example.com" } });
  }
  if (u.pathname.endsWith("/rest/v1/rpc/is_admin_or_supervisor")) {
    return Jres(true);
  }
  if (u.pathname.endsWith("/auth/v1/admin/generate_link")) {
    // GoTrue real devolve os campos FLAT (action_link/hashed_token/etc. no
    // topo) — o xform do supabase-js 2.49.1 destrutura exatamente esses campos
    // do topo e monta data.properties. Aninhar em "properties" → {} vazio.
    return Jres({
      id: "gl-1",
      type: "recovery",
      email: "user@example.com",
      action_link: "http://app.local/reset-password?token=abc123",
      hashed_token: "ht-abc123",
      redirect_to: "http://app.local/reset-password",
      verification_type: "recovery",
    });
  }
  if (u.pathname.endsWith("/rest/v1/rpc/store_reset_token")) {
    return new Response(null, { status: 204 });
  }
  if (u.pathname.endsWith("/rest/v1/password_reset_requests")) {
    if (method === "GET") {
      // .single(): postgrest-js manda Accept: application/vnd.pgrst.object+json
      // e o PostgREST real devolve o OBJETO direto (não array) — sem isso o
      // handler veria status undefined → 409 espúrio antes do guard atômico.
      const accept = new Headers(init?.headers).get("accept") ?? "";
      if (accept.includes("application/vnd.pgrst.object+json")) return Jres(dbRow);
      return Jres(dbRow ? [dbRow] : []);
    }
    if (method === "PATCH") {
      // PostgREST real: return=representation → linhas afetadas no corpo;
      // Content-Range */N SOMENTE quando o Prefer pede count=exact.
      const affected = raceZeroAffected || !dbRow || dbRow.status !== "pending" ? 0 : 1;
      if (affected === 1 && init?.body) {
        const patch = JSON.parse(String(init.body)) as Record<string, unknown>;
        dbRow = { ...dbRow!, ...patch } as typeof dbRow;
      }
      const headers: Record<string, string> = {};
      if (prefer?.includes("count=exact")) headers["Content-Range"] = `*/${affected}`;
      return Jres(affected === 1 ? [{ id: UUID }] : [], 200, headers);
    }
  }
  return Jres({ unhandled: true, url: String(input) }, 404);
}) as unknown as typeof fetch;

await import("../index.ts");

const b64u = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const JWT = `h.${b64u({ sub: "admin-1", role: "authenticated", iss: "http://mock.local" })}.s`;

const reset = () => {
  dbRow = { id: UUID, email: "user@example.com", status: "pending" };
  raceZeroAffected = false;
  restCalls.length = 0;
  _resetRateLimitForTests();
};
const call = (body: unknown) =>
  h(new Request("http://mock.local/approve-password-reset", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { ...J, authorization: `Bearer ${JWT}` },
  }));

// ─── E55: approve (a causa do 409-always) ────────────────────────────────────

Deno.test("E55: approve afetando 1 linha → 200 success + resetLink (regressão do 409-always)", async () => {
  reset();
  const res = await call({ requestId: UUID, action: "approve" });
  assertEquals(res.status, 200);
  const body = await res.json() as { success: boolean; emailSent: boolean; resetLink: string };
  assertEquals(body.success, true);
  assertEquals(body.resetLink, "http://app.local/reset-password?token=abc123");
  // O guard atômico precisa ter lido as linhas afetadas (select=id no PATCH).
  const patch = restCalls.find((c) => c.method === "PATCH" && c.path.endsWith("/password_reset_requests"));
  assertEquals(patch !== undefined, true);
  assertEquals(patch!.prefer?.includes("return=representation"), true);
});

Deno.test("E55: approve com corrida (0 linhas afetadas) → 409 legítimo (já processado)", async () => {
  reset();
  raceZeroAffected = true; // GET vê pending, PATCH afeta 0 → outro admin venceu
  const res = await call({ requestId: UUID, action: "approve" });
  assertEquals(res.status, 409);
});

Deno.test("E55: approve com status já != pending no fetch → 409 (sem gerar link)", async () => {
  reset();
  dbRow = { id: UUID, email: "user@example.com", status: "approved" };
  const res = await call({ requestId: UUID, action: "approve" });
  assertEquals(res.status, 409);
  // Sem generateLink (nenhuma chamada a /auth/v1/admin/generate_link)
  assertEquals(restCalls.some((c) => c.path.endsWith("/auth/v1/admin/generate_link")), false);
});

// ─── E55: reject (mesmo padrão de guard — mesmo bug) ─────────────────────────

Deno.test("E55: reject afetando 1 linha → 200 success (regressão do 409-always)", async () => {
  reset();
  const res = await call({ requestId: UUID, action: "reject", rejectionReason: "Suspeita" });
  assertEquals(res.status, 200);
  const body = await res.json() as { success: boolean };
  assertEquals(body.success, true);
  const patch = restCalls.find((c) => c.method === "PATCH" && c.path.endsWith("/password_reset_requests"));
  assertEquals(patch !== undefined, true);
  assertEquals(patch!.prefer?.includes("return=representation"), true);
});

Deno.test("E55: reject com corrida (0 linhas afetadas) → 409 legítimo", async () => {
  reset();
  raceZeroAffected = true;
  const res = await call({ requestId: UUID, action: "reject" });
  assertEquals(res.status, 409);
});
