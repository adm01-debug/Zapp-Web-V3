const BASE = "https://self.example.com";
Deno.env.set("SELFHOSTED_SUPABASE_URL", BASE);
Deno.env.set("SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key-12345");

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  console.log("FETCH:", init?.method ?? "GET", url);
  console.log("BODY:", init?.body?.toString());
  return new Response(JSON.stringify({
    properties: { action_link: "https://app.example.com/accept-invite?token=abc123", hashed_token: "ht" },
    user: { id: "invitee-1" },
  }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.1");
const admin = createClient(BASE, "test-service-role-key-12345", {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "zapp" },
});
const res = await admin.auth.admin.generateLink({
  type: "invite",
  email: "novo@test.com",
  options: { redirectTo: "https://app.example.com/accept-invite" },
});
console.log("RESULT:", JSON.stringify(res, null, 1));
console.log("action_link:", res.data?.properties?.action_link);
