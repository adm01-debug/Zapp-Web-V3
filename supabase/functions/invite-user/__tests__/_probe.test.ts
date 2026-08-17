import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
const BASE = "https://self.example.com";
Deno.env.set("SELFHOSTED_SUPABASE_URL", BASE);
Deno.env.set("SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key-12345");
Deno.env.set("SELFHOSTED_SUPABASE_ANON_KEY", "test-anon-key-12345");
Deno.env.set("APP_URL", "https://app.example.com");
Deno.env.set("RESEND_API_KEY", "re_test_resend_key_123");

type Handler = (req: Request) => Promise<Response> | Response;
let captured: Handler | null = null;
const originalServe = Deno.serve;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (handler: Handler) => {
  captured = handler;
  return { finished: Promise.resolve(), shutdown: () => {} } as unknown as ReturnType<typeof originalServe>;
};

function b64url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
const jwt = [b64url({ alg: "HS256", typ: "JWT" }), b64url({ role: "authenticated", sub: "admin-1", iss: `${BASE}/auth/v1` }), "sig"].join(".");

const calls: string[] = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const method = (init?.method ?? "GET").toUpperCase();
  let body: unknown = undefined;
  if (init?.body) { try { body = JSON.parse(init.body as string); } catch { body = init.body; } }
  let resp: Response;
  if (url.endsWith("/auth/v1/user") && method === "GET") resp = new Response(JSON.stringify({ id: "admin-1", email: "admin@test.com" }), { status: 200, headers: { "content-type": "application/json" } });
  else if (url.includes("/rest/v1/rpc/is_admin_or_supervisor")) resp = new Response(JSON.stringify(true), { status: 200, headers: { "content-type": "application/json" } });
  else if (url.includes("/rest/v1/user_roles")) resp = new Response("[]", { status: 201, headers: { "content-type": "application/json" } });
  else if (url.includes("/rest/v1/rpc/invite_user")) resp = new Response(JSON.stringify("invite-row-1"), { status: 200, headers: { "content-type": "application/json" } });
  else if (url.includes("api.resend.com")) resp = new Response(JSON.stringify({ id: "m1" }), { status: 200, headers: { "content-type": "application/json" } });
  else if (url.includes("/auth/v1/admin/users") && method === "POST") resp = new Response(JSON.stringify({ id: "invitee-1", email: "novo@test.com" }), { status: 200, headers: { "content-type": "application/json" } });
  else if (url.includes("/auth/v1/admin/generate_link") && method === "POST") resp = new Response(JSON.stringify({ properties: { action_link: "https://app.example.com/accept-invite?token=abc123", hashed_token: "ht" }, user: { id: "invitee-1" } }), { status: 200, headers: { "content-type": "application/json" } });
  else resp = new Response(JSON.stringify({ unhandled: true, url }), { status: 404, headers: { "content-type": "application/json" } });
  calls.push(`${method} ${url} BODY=${JSON.stringify(body)} => ${resp.status} ${JSON.stringify(await resp.clone().text())}`);
  return resp;
}) as typeof fetch;

await import("../index.ts");
if (!captured) throw new Error("no handler");
const handler: Handler = captured;
const req = new Request(`${BASE}/functions/v1/invite-user`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${jwt}`, origin: "http://localhost" },
  body: JSON.stringify({ email: "novo@test.com", role: "supervisor" }),
});
const res = await handler(req);
console.log("STATUS:", res.status);
console.log("BODY:", await res.text());
console.log("CALLS:", JSON.stringify(calls, null, 1));
