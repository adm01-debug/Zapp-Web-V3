// ============================================================================
// W1 — Testes do client cloud (Meta Graph API) com fetch STUBADO.
// Importa o módulo REAL do clone (supabase/functions/_shared/providers/cloud/client.ts).
// Rodar: deno test W1_cloud_client.test.ts
// ============================================================================
import { assertEquals, assertRejects, assert } from "jsr:@std/assert";
import {
  createCloudClient,
  normalizeE164,
  type CloudClientResponse,
} from "./client.ts";

// ─── Harness de fetch stubado ───────────────────────────────────────────────

type FetchCall = { url: string; init?: RequestInit };

function stubFetch(
  handler: (call: FetchCall, index: number) => Response | Promise<Response>,
) {
  const calls: FetchCall[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const call: FetchCall = { url, init };
    calls.push(call);
    return handler(call, calls.length - 1);
  }) as typeof fetch;
  return {
    calls,
    restore() {
      globalThis.fetch = orig;
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function client(token = "t0k3n", phoneId = "123456") {
  return createCloudClient({ token, phoneId, maxRetries: 2, timeoutMs: 5000 });
}

const OK_MESSAGES = {
  messaging_product: "whatsapp",
  contacts: [{ input: "5511999999999", wa_id: "5511999999999" }],
  messages: [{ id: "wamid.ABC" }],
};

// ─── sendText ───────────────────────────────────────────────────────────────

Deno.test("sendText 200 ok: payload E.164, bearer, idempotency", async () => {
  const stub = stubFetch(() => jsonResponse(OK_MESSAGES));
  try {
    const c = client();
    const r = await c.sendText("wpp2", "11999999999", "ola");
    assertEquals(r.ok, true);
    if (r.ok === false) return;
    assertEquals(r.data.messages?.[0]?.id, "wamid.ABC");

    assertEquals(stub.calls.length, 1);
    const call = stub.calls[0];
    assertEquals(call.url, "https://graph.facebook.com/v21.0/123456/messages");
    assertEquals(call.init?.method, "POST");
    const headers = new Headers(call.init?.headers);
    assertEquals(headers.get("Authorization"), "Bearer t0k3n");
    assertEquals(headers.get("Content-Type"), "application/json");
    const idemKey = headers.get("X-Idempotency-Key");
    assert(idemKey && /^[0-9a-f]{64}$/.test(idemKey), "X-Idempotency-Key sha256 hex");
    assertEquals(JSON.parse(String(call.init?.body)), {
      messaging_product: "whatsapp",
      to: "5511999999999", // 11 digitos BR → prefixo 55
      type: "text",
      text: { body: "ola" },
    });
  } finally {
    stub.restore();
  }
});

Deno.test("sendText 401: sem retry, message do body", async () => {
  const stub = stubFetch(() => jsonResponse({ error: { message: "Invalid token", code: 190 } }, 401));
  try {
    const r = await client().sendText("wpp2", "5511999999999", "oi");
    assertEquals(r.ok, false);
    assertEquals(stub.calls.length, 1);
    if (r.ok === false) {
      assertEquals(r.status, 401);
      assert(r.message.includes("Invalid token"));
    }
  } finally {
    stub.restore();
  }
});

Deno.test("sendText 429: retry ate 3 attempts, idempotency estavel", async () => {
  const stub = stubFetch(() => jsonResponse({ error: { message: "Rate limit" } }, 429));
  try {
    const r = await client().sendText("wpp2", "5511999999999", "oi");
    assertEquals(r.ok, false);
    assertEquals(stub.calls.length, 3); // 1 inicial + 2 retries
    if (r.ok === false) assertEquals(r.status, 429);
    const keys = stub.calls.map((c) => new Headers(c.init?.headers).get("X-Idempotency-Key"));
    assert(keys.every((k) => k === keys[0]), "mesma idempotency key nos retries");
  } finally {
    stub.restore();
  }
});

Deno.test("sendText 131047: 4xx sem retry", async () => {
  const stub = stubFetch(() =>
    jsonResponse(
      { error: { message: "(#131047) Re-engagement message", type: "OAuthException", code: 131047 } },
      400,
    ),
  );
  try {
    const r = await client().sendText("wpp2", "5511999999999", "oi");
    assertEquals(r.ok, false);
    assertEquals(stub.calls.length, 1);
    if (r.ok === false) {
      assertEquals(r.status, 400);
      assert(r.message.includes("131047"));
    }
  } finally {
    stub.restore();
  }
});

Deno.test("sendText E.164 invalido: 400 sem fetch", async () => {
  const stub = stubFetch(() => jsonResponse(OK_MESSAGES));
  try {
    const r = await client().sendText("wpp2", "123", "oi");
    assertEquals(r.ok, false);
    assertEquals(stub.calls.length, 0);
    if (r.ok === false) {
      assertEquals(r.status, 400);
      assert(r.message.includes("E.164"));
    }
  } finally {
    stub.restore();
  }
});

Deno.test("fail-closed: 200 sem messaging_product → resposta inesperada", async () => {
  const stub = stubFetch(() => jsonResponse({ ok: true, whatever: 1 }));
  try {
    const r = await client().sendText("wpp2", "5511999999999", "oi");
    assertEquals(r.ok, false);
    if (r.ok === false) {
      assertEquals(r.status, 200);
      assertEquals(r.message, "resposta inesperada");
    }
  } finally {
    stub.restore();
  }
});

// ─── sendMedia ──────────────────────────────────────────────────────────────

Deno.test("sendMedia URL publica: download + POST /media (multipart) + POST /messages", async () => {
  const stub = stubFetch((call, i) => {
    if (i === 0) {
      assertEquals(call.url, "https://cdn.example.com/foto.jpg");
      assert(!new Headers(call.init?.headers).has("Authorization"), "download sem auth");
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
    }
    if (i === 1) {
      assertEquals(call.url, "https://graph.facebook.com/v21.0/123456/media");
      assertEquals(call.init?.method, "POST");
      const headers = new Headers(call.init?.headers);
      assert(headers.get("X-Idempotency-Key"), "idempotency no upload");
      const fd = call.init?.body;
      assert(fd instanceof FormData, "body multipart FormData");
      assertEquals(fd.get("messaging_product"), "whatsapp");
      assertEquals(fd.get("type"), "image/jpeg");
      const file = fd.get("file");
      assert(file instanceof Blob, "campo file e Blob");
      return jsonResponse({ id: "MEDIA_987" });
    }
    assertEquals(call.url, "https://graph.facebook.com/v21.0/123456/messages");
    return jsonResponse(OK_MESSAGES);
  });
  try {
    const r = await client().sendMedia("wpp2", "5511999999999", {
      media: "https://cdn.example.com/foto.jpg",
      mediatype: "image",
      filename: "foto.jpg",
    });
    assertEquals(r.ok, true);
    assertEquals(stub.calls.length, 3);
    if (r.ok === false) return;
    const body = JSON.parse(String(stub.calls[2].init?.body));
    assertEquals(body, {
      messaging_product: "whatsapp",
      to: "5511999999999",
      type: "image",
      image: { id: "MEDIA_987" },
    });
  } finally {
    stub.restore();
  }
});

Deno.test("sendMedia media_id pronto: sem upload, POST /messages direto", async () => {
  const stub = stubFetch(() => jsonResponse(OK_MESSAGES));
  try {
    const r = await client().sendMedia("wpp2", "5511999999999", {
      media: "MEDIA_555",
      mediatype: "document",
      filename: "contrato.pdf",
    });
    assertEquals(r.ok, true);
    assertEquals(stub.calls.length, 1);
    if (r.ok === false) return;
    const body = JSON.parse(String(stub.calls[0].init?.body));
    assertEquals(body, {
      messaging_product: "whatsapp",
      to: "5511999999999",
      type: "document",
      document: { id: "MEDIA_555", filename: "contrato.pdf" },
    });
  } finally {
    stub.restore();
  }
});

// ─── checkWhatsApp ──────────────────────────────────────────────────────────

Deno.test("checkWhatsApp: status valid → true", async () => {
  const stub = stubFetch(() =>
    jsonResponse({ contacts: [{ input: "5511999999999", status: "valid", wa_id: "5511999999999" }] }),
  );
  try {
    const r = await client().checkWhatsApp("wpp2", ["5511999999999"]);
    assertEquals(r.ok, true);
    if (r.ok === false) return;
    assertEquals(r.data, true);
    assertEquals(JSON.parse(String(stub.calls[0].init?.body)), {
      blocking: "no",
      contacts: ["5511999999999"],
    });
    assertEquals(stub.calls[0].url, "https://graph.facebook.com/v21.0/123456/contacts");
  } finally {
    stub.restore();
  }
});

Deno.test("checkWhatsApp: erro 131030 → false", async () => {
  const stub = stubFetch(() =>
    jsonResponse({
      contacts: [{ input: "5511988888888", status: "invalid", error: { code: 131030, title: "Number does not exist" } }],
    }),
  );
  try {
    const r = await client().checkWhatsApp("wpp2", ["5511988888888"]);
    assertEquals(r.ok, true);
    if (r.ok === false) return;
    assertEquals(r.data, false);
  } finally {
    stub.restore();
  }
});

// ─── getQrCode / listGroups: fail-closed por design ─────────────────────────

Deno.test("getQrCode e listGroups lancam Error nao suportado", async () => {
  const c = client();
  await assertRejects(() => c.getQrCode("wpp2"), Error, "cloud: recurso nao suportado");
  await assertRejects(() => c.listGroups("wpp2"), Error, "cloud: recurso nao suportado");
});

// ─── getConnectionState ─────────────────────────────────────────────────────

Deno.test("getConnectionState 200 → state open / isHealthy true", async () => {
  const stub = stubFetch(() =>
    jsonResponse({ id: "123456", display_phone_number: "5511999999999", quality_rating: "GREEN", platform_type: "CLOUD_API" }),
  );
  try {
    const r = await client().getConnectionState("wpp2");
    assertEquals(r.ok, true);
    assertEquals(stub.calls[0].url, "https://graph.facebook.com/v21.0/123456?fields=id,display_phone_number,quality_rating,platform_type");
    if (r.ok === false) return;
    assertEquals(r.data.state, "open");
    assertEquals(r.data.isHealthy, true);
    assertEquals(r.data.phone?.quality_rating, "GREEN");
  } finally {
    stub.restore();
  }
});

Deno.test("getConnectionState 401 → ok:false sem retry", async () => {
  const stub = stubFetch(() => jsonResponse({ error: { message: "token invalido" } }, 401));
  try {
    const r = await client().getConnectionState("wpp2");
    assertEquals(r.ok, false);
    assertEquals(stub.calls.length, 1);
    if (r.ok === false) assertEquals(r.status, 401);
  } finally {
    stub.restore();
  }
});

// ─── getProfilePicture / restartInstance / normalizeE164 ────────────────────

Deno.test("getProfilePicture vazio → profilePicUrl null", async () => {
  const stub = stubFetch(() => jsonResponse({}));
  try {
    const r = await client().getProfilePicture("wpp2", "5511999999999");
    assertEquals(r.ok, true);
    assertEquals(
      stub.calls[0].url,
      "https://graph.facebook.com/v21.0/123456?fields=profile_picture_url",
    );
    if (r.ok === false) return;
    assertEquals(r.data.profilePicUrl, null);
  } finally {
    stub.restore();
  }
});

Deno.test("restartInstance → 501 fail-closed (nao lanca)", async () => {
  const r = await client().restartInstance("wpp2");
  assertEquals(r.ok, false);
  if (r.ok === false) assertEquals(r.status, 501);
});

Deno.test("normalizeE164: BR sem DDI ganha 55; com DDI mantem; invalido null", () => {
  assertEquals(normalizeE164("11999999999"), "5511999999999");
  assertEquals(normalizeE164("+55 11 99999-9999"), "5511999999999");
  assertEquals(normalizeE164("5511999999999"), "5511999999999");
  assertEquals(normalizeE164("999999"), null);
  assertEquals(normalizeE164(""), null);
});

// ─── tipos: shape do retorno (compile-time) ─────────────────────────────────

Deno.test("tipo de retorno: union ok/data | ok:false/status/message", () => {
  const c = client();
  const r: CloudClientResponse<unknown> = { ok: false, status: 500, message: "x", retries: 0 };
  assertEquals(r.ok, false);
  void c;
});
