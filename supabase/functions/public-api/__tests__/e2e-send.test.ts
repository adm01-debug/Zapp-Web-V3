/**
 * End-to-end integration test for `public-api`.
 *
 * Mocks the Evolution API + Supabase REST so we can drive the real
 * handler from a synthetic Request and assert that:
 *   1. The function returns HTTP 200 with `success: true` and the same
 *      requestId that came in via `x-request-id`.
 *   2. The `messages` row is updated to `status: 'sent'` with the
 *      `external_id` extracted from the same Evolution envelope that
 *      drove the response — i.e. chat-side state and HTTP status agree.
 *   3. When Evolution returns a non-OK response, the message is marked
 *      `failed` and the function still returns HTTP 200 with the proxied
 *      envelope (so callers can branch on `success`).
 */
import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { _resetRateLimitForTests } from "../../_shared/validation.ts";

// ─── Env stubs (must be set before importing index.ts) ────────────────────
Deno.env.set("SUPABASE_URL", "https://stub.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-service-key");
Deno.env.set("EVOLUTION_API_URL", "https://evo.stub");
Deno.env.set("EVOLUTION_API_KEY", "stub-evo-key");

// ─── Capture the handler instead of starting a real server ────────────────
type Handler = (req: Request) => Promise<Response> | Response;
let captured: Handler | null = null;
const originalServe = Deno.serve;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (handler: Handler) => {
  captured = handler;
  return { finished: Promise.resolve(), shutdown: () => {} } as unknown as ReturnType<typeof originalServe>;
};

// ─── Mock fetch covering Supabase REST + Evolution API ────────────────────
interface CapturedCall {
  url: string;
  method: string;
  body: unknown;
}
const calls: CapturedCall[] = [];
let evolutionResponse: { ok: boolean; body: unknown } = {
  ok: true,
  body: { key: { id: "WAMSG_FROM_EVOLUTION_123" }, status: "PENDING" },
};

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** PostgREST `.single()` / `.maybeSingle()` sends this Accept header and
 * expects a single object (not an array). Helps the mock pick the right shape. */
function wantsSingle(init?: RequestInit): boolean {
  const accept = new Headers(init?.headers).get("accept") ?? "";
  return accept.includes("application/vnd.pgrst.object+json");
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const method = (init?.method ?? "GET").toUpperCase();
  let body: unknown = undefined;
  if (init?.body) {
    try { body = JSON.parse(init.body as string); } catch { body = init.body; }
  }
  calls.push({ url, method, body });

  const single = wantsSingle(init);
  const wrap = (row: unknown) => single ? row : [row];

  // Supabase global_settings (api_token check via .single())
  if (url.includes("/rest/v1/global_settings")) {
    return jsonRes(wrap({ value: "valid-token" }));
  }
  // whatsapp_connections lookup (.single())
  if (url.includes("/rest/v1/whatsapp_connections")) {
    return jsonRes(wrap({
      id: "conn-1",
      instance_id: "wpp2",
      status: "connected",
      is_default: true,
    }));
  }
  // contacts lookup — return existing so we skip insert.
  // Handler was updated (BUG-D fix) from zapp.contacts to evolution_contacts;
  // match both so the mock stays forward-compatible.
  if ((url.includes("/rest/v1/evolution_contacts") || url.includes("/rest/v1/contacts")) && method === "GET") {
    return jsonRes(wrap({ id: "contact-1" }));
  }
  // evolution_contacts insert (new contact creation branch)
  if ((url.includes("/rest/v1/evolution_contacts") || url.includes("/rest/v1/contacts")) && method === "POST") {
    return jsonRes(wrap({ id: "contact-new-1" }));
  }
  // messages insert
  if (/\/rest\/v1\/messages(\?|$)/.test(url) && method === "POST") {
    return jsonRes(wrap({ id: "msg-1", status: "sending" }));
  }
  // messages update (PATCH)
  if (/\/rest\/v1\/messages(\?|$)/.test(url) && method === "PATCH") {
    return jsonRes(wrap({ id: "msg-1", ...(body as Record<string, unknown>) }));
  }
  // Evolution send — covers both the legacy direct path and the new
  // supabase.functions.invoke('evolution-api', ...) which POSTs to
  // {SUPABASE_URL}/functions/v1/evolution-api.
  if (
    url.includes("/message/sendText/") ||
    url.includes("/functions/v1/evolution-api")
  ) {
    return jsonRes(evolutionResponse.body, evolutionResponse.ok ? 200 : 500);
  }

  return jsonRes({ unhandled: true, url }, 404);
};

// Now import the handler — top-level Deno.serve will be captured above.
await import("../index.ts");
if (!captured) throw new Error("public-api did not register a handler via Deno.serve");
const handler: Handler = captured;

function makeReq(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://stub/public-api", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": "valid-token",
      "x-request-id": "trace-abc-123",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function reset() {
  calls.length = 0;
  evolutionResponse = {
    ok: true,
    body: { key: { id: "WAMSG_FROM_EVOLUTION_123" }, status: "PENDING" },
  };
  _resetRateLimitForTests();
}

// ─── Tests ───────────────────────────────────────────────────────────────

Deno.test({
  name: "public-api: success — returns 200, propagates requestId, and updates messages.status='sent' with external_id from same envelope",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    const res = await handler(makeReq({
      action: "send",
      number: "5511999990000",
      message: "Hello world",
    }));

    assertEquals(res.status, 200);
    const json = await res.json();
    assertEquals(json.success, true);
    assertEquals(json.messageId, "msg-1");
    assertEquals(json.requestId, "trace-abc-123");

    const patches = calls.filter(c => c.method === "PATCH" && /\/rest\/v1\/messages(\?|$)/.test(c.url));
    assert(patches.length >= 1, `expected at least one messages PATCH, got ${patches.length}`);
    const sentPatch = patches.find(p => (p.body as Record<string, unknown>)?.status === "sent");
    assertExists(sentPatch, "expected a PATCH setting status='sent'");
    const patchBody = sentPatch!.body as Record<string, unknown>;
    // The external_id MUST come from the same Evolution envelope used to
    // build the response — i.e. extractEvolutionMessageId(envelope).
    assertEquals(patchBody.external_id, "WAMSG_FROM_EVOLUTION_123");
    assertEquals(patchBody.status, "sent");
  },
});

Deno.test({
  name: "public-api: failure — Evolution non-OK envelope does NOT mark message as 'sent', marks 'failed', HTTP stays 200",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    evolutionResponse = { ok: false, body: { error: "instance offline" } };

    const res = await handler(makeReq({
      action: "send",
      number: "5511999990000",
      message: "Will fail",
    }));

    // The function still returns 200 because the row was saved; the chat
    // and HTTP envelope agree because the same Evolution response drives
    // both — and that response carries no `key.id`, so no 'sent' update.
    assertEquals(res.status, 200);
    const sentPatch = calls.find(c =>
      c.method === "PATCH" &&
      /\/rest\/v1\/messages(\?|$)/.test(c.url) &&
      (c.body as Record<string, unknown>)?.status === "sent"
    );
    assertEquals(sentPatch, undefined, "must NOT mark message 'sent' when Evolution envelope has no key.id");

    // Must mark 'failed' (the invokeError branch runs the failed update)
    const failedPatch = calls.find(c =>
      c.method === "PATCH" &&
      /\/rest\/v1\/messages(\?|$)/.test(c.url) &&
      (c.body as Record<string, unknown>)?.status === "failed"
    );
    assertExists(failedPatch, "must PATCH messages to status='failed' when Evolution invoke returns an error");
  },
});

Deno.test({
  name: "public-api: rejects missing x-api-key with 401",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    const req = new Request("https://stub/public-api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "send", number: "5511999990000", message: "x" }),
    });
    const res = await handler(req);
    assertEquals(res.status, 401);
  },
});

Deno.test({
  name: "public-api: wrong x-api-key returns 403",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    const res = await handler(makeReq(
      { action: "send", number: "5511999990000", message: "Hi" },
      { "x-api-key": "wrong-token" }
    ));
    assertEquals(res.status, 403);
  },
});

Deno.test({
  name: "public-api: unknown action returns 400",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    const res = await handler(makeReq({ action: "delete", number: "5511999990000", message: "Hi" }));
    assertEquals(res.status, 400);
    const json = await res.json();
    assert((json.error as string).includes("Unknown action"));
  },
});

Deno.test({
  name: "public-api: invalid JSON body returns 400",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    const req = new Request("https://stub/public-api", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "valid-token" },
      body: "{ not json !!!",
    });
    const res = await handler(req);
    assertEquals(res.status, 400);
  },
});

Deno.test({
  name: "public-api: invoke throws (network error) — message marked 'failed', returns 200",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
      if (url.includes("/functions/v1/evolution-api")) {
        throw new TypeError("network failure");
      }
      return origFetch(input, init);
    };
    try {
      const res = await handler(makeReq({ action: "send", number: "5511999990000", message: "Hi" }));
      assertEquals(res.status, 200, "handler must return 200 even when invoke throws");
      const failedPatch = calls.find(c =>
        c.method === "PATCH" &&
        /\/rest\/v1\/messages(\?|$)/.test(c.url) &&
        (c.body as Record<string, unknown>)?.status === "failed"
      );
      assertExists(failedPatch, "must PATCH messages to status='failed' when invoke throws");
      const sentPatch = calls.find(c =>
        c.method === "PATCH" &&
        /\/rest\/v1\/messages(\?|$)/.test(c.url) &&
        (c.body as Record<string, unknown>)?.status === "sent"
      );
      assertEquals(sentPatch, undefined, "must NOT mark 'sent' when invoke throws");
    } finally {
      globalThis.fetch = origFetch;
    }
  },
});

Deno.test({
  name: "public-api: no active WhatsApp connection returns 404",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
      if (url.includes("/rest/v1/whatsapp_connections")) {
        // PostgREST .single() with no row → 406 with JSON null
        return new Response("null", { status: 406, headers: { "content-type": "application/json" } });
      }
      return origFetch(input, init);
    };
    try {
      const res = await handler(makeReq({ action: "send", number: "5511999990000", message: "Hi" }));
      assertEquals(res.status, 404);
    } finally {
      globalThis.fetch = origFetch;
    }
  },
});

Deno.test({
  name: "public-api: explicit connectionId — queries by id, not is_default",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    const validUUID = "00000000-0000-4000-a000-000000000001";
    const res = await handler(makeReq({
      action: "send",
      number: "5511999990000",
      message: "Hi",
      connectionId: validUUID,
    }));
    assertEquals(res.status, 200);
    const connCall = calls.find(c => c.url.includes("/rest/v1/whatsapp_connections"));
    assertExists(connCall, "must query whatsapp_connections");
    assert(connCall!.url.includes(validUUID), "must query by connectionId UUID");
  },
});

Deno.test({
  name: "public-api: creates new contact when not found, uses new contact in message",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
      const method = (init?.method ?? "GET").toUpperCase();
      // Return no contact for GET so insert branch runs
      if ((url.includes("/rest/v1/evolution_contacts") || url.includes("/rest/v1/contacts")) && method === "GET") {
        const single = wantsSingle(init);
        // maybeSingle() with no rows: null body, 200 for PGRST
        return new Response(single ? "null" : "[]", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return origFetch(input, init);
    };
    try {
      const res = await handler(makeReq({ action: "send", number: "5511999990000", message: "Hi" }));
      assertEquals(res.status, 200);
      const json = await res.json();
      assertEquals(json.success, true);
      const contactInsert = calls.find(c =>
        c.method === "POST" &&
        (c.url.includes("/rest/v1/evolution_contacts") || c.url.includes("/rest/v1/contacts"))
      );
      assertExists(contactInsert, "expected POST to evolution_contacts to create contact");
    } finally {
      globalThis.fetch = origFetch;
    }
  },
});

Deno.test({
  name: "public-api: success — extracts external_id from alternate Evolution shape (messageId field)",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    reset();
    evolutionResponse = { ok: true, body: { messageId: "WAMSG_ALT_FORMAT_456" } };
    const res = await handler(makeReq({ action: "send", number: "5511999990000", message: "Hello" }));
    assertEquals(res.status, 200);
    const sentPatch = calls.find(c =>
      c.method === "PATCH" &&
      /\/rest\/v1\/messages(\?|$)/.test(c.url) &&
      (c.body as Record<string, unknown>)?.status === "sent"
    );
    assertExists(sentPatch, "must find PATCH with status=sent for alternate Evolution response shape");
    assertEquals((sentPatch!.body as Record<string, unknown>).external_id, "WAMSG_ALT_FORMAT_456");
  },
});

// ─── Cleanup (in case the runner reuses the global env) ──────────────────
globalThis.addEventListener("unload", () => {
  globalThis.fetch = originalFetch;
  // deno-lint-ignore no-explicit-any
  (Deno as any).serve = originalServe;
});
