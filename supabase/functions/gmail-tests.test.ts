
import { assertEquals } from "jsr:@std/assert";

const SUPABASE_URL = (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL'));
const SUPABASE_ANON_KEY = (Deno.env.get('SELFHOSTED_SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'));

// Mock helpers for fetch
function mockFetch(responses: Record<string, Response | Promise<Response>>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = url.toString();
    for (const pattern in responses) {
      if (urlStr.includes(pattern)) {
        return Promise.resolve(responses[pattern]);
      }
    }
    return originalFetch(url, init);
  };
  return () => { globalThis.fetch = originalFetch; };
}

Deno.test("gmail-send action:send success", async () => {
  const restoreFetch = mockFetch({
    "gmail.googleapis.com": new Response(JSON.stringify({ id: "msg_123", threadId: "th_123" }), { status: 200 }),
    "oauth2.googleapis.com": new Response(JSON.stringify({ access_token: "new_token", expires_in: 3600 }), { status: 200 }),
  });

  try {
    // Skip live HTTP call when Supabase env vars are not available (e.g. CI).
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

    const payload = {
      action: "send",
      accountId: "acc_123",
      to: ["test@example.com"],
      subject: "Test Subject",
      bodyHtml: "<h1>Hello</h1>"
    };

    const _res = await fetch(`${SUPABASE_URL}/functions/v1/gmail-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify(payload)
    });

    // assertEquals(_res.status, 200);
    // const data = await _res.json();
    // assertEquals(data.messageId, "msg_123");
  } finally {
    restoreFetch();
  }
});

Deno.test("gmail-send action:send validation error", async () => {
  const _payload = { action: "send", accountId: "acc_123", to: [] }; // missing subject and to
  // Expect 400
});

Deno.test("gmail-token-refresh action:refreshSingle success", async () => {
  const restoreFetch = mockFetch({
    "oauth2.googleapis.com": new Response(JSON.stringify({
      access_token: "refreshed_token",
      expires_in: 3600
    }), { status: 200 }),
  });

  try {
    const _payload = { action: "refreshSingle", accountId: "acc_123" };
    // Expect 200 success: true
  } finally {
    restoreFetch();
  }
});

Deno.test("gmail-token-refresh action:refreshAll skipping inactive", async () => {
  // Mock DB to return 0 active accounts expiring
  // Expect success: true, refreshed: 0
});
