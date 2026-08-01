// Smoke tests for the WhatsApp Cloud (Meta) normalizer + HMAC signature.
// These guarantee the unified message model stays stable across providers.

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  normalizeMetaPayload,
  validateMetaSignature,
} from "../whatsapp-cloud-normalizer.ts";

function metaTextPayload(opts: { phoneNumberId?: string; from?: string; body?: string; wamid?: string; pushName?: string } = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "WA_BIZ_ID",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "5511...", phone_number_id: opts.phoneNumberId ?? "PN_123" },
          contacts: opts.pushName ? [{ wa_id: opts.from ?? "5511999999999", profile: { name: opts.pushName } }] : undefined,
          messages: [{
            id: opts.wamid ?? "wamid.HBgN001",
            from: opts.from ?? "5511999999999",
            timestamp: "1714000000",
            type: "text",
            text: { body: opts.body ?? "olá" },
          }],
        },
      }],
    }],
  };
}

Deno.test("normalizer: text message → unified incoming event", () => {
  const { events, phoneNumberId } = normalizeMetaPayload(metaTextPayload({ pushName: "João" }));
  assertEquals(phoneNumberId, "PN_123");
  assertEquals(events.length, 1);
  const ev = events[0];
  if (ev.kind !== "message") throw new Error("expected message event");
  assertEquals(ev.messageType, "text");
  assertEquals(ev.content, "olá");
  assertEquals(ev.remoteJid, "5511999999999@s.whatsapp.net");
  assertEquals(ev.fromPhone, "5511999999999");
  assertEquals(ev.pushName, "João");
  assertEquals(ev.wamid, "wamid.HBgN001");
});

Deno.test("normalizer: image with caption → image event with mediaId/mime", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: {
      metadata: { phone_number_id: "PN" },
      messages: [{ id: "wamid.IMG", from: "5511", timestamp: "1", type: "image",
        image: { id: "MEDIA_ABC", mime_type: "image/jpeg", caption: "look" } }],
    } }] }],
  };
  const { events } = normalizeMetaPayload(payload);
  const ev = events[0];
  if (ev.kind !== "message") throw new Error();
  assertEquals(ev.messageType, "image");
  assertEquals(ev.content, "look");
  assertEquals(ev.mediaId, "MEDIA_ABC");
  assertEquals(ev.mediaMimeType, "image/jpeg");
});

Deno.test("normalizer: audio voice flag preserved in metadata", () => {
  const payload = {
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: "PN" },
      messages: [{ id: "w", from: "5511", timestamp: "1", type: "audio",
        audio: { id: "A1", mime_type: "audio/ogg", voice: true } }],
    } }] }],
  };
  const { events } = normalizeMetaPayload(payload);
  const ev = events[0];
  if (ev.kind !== "message") throw new Error();
  assertEquals(ev.messageType, "audio");
  assertEquals(ev.metadata?.voice, true);
});

Deno.test("normalizer: status events (delivered/read/failed)", () => {
  const payload = {
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: "PN" },
      statuses: [
        { id: "wamid.A", status: "delivered", timestamp: "1" },
        { id: "wamid.B", status: "failed", timestamp: "2",
          errors: [{ code: 131000, title: "Generic", message: "boom" }] },
      ],
    } }] }],
  };
  const { events } = normalizeMetaPayload(payload);
  assertEquals(events.length, 2);
  const a = events[0]; const b = events[1];
  if (a.kind !== "status" || b.kind !== "status") throw new Error();
  assertEquals(a.status, "delivered");
  assertEquals(b.status, "failed");
  assertEquals(b.errorMessage, "boom");
});

Deno.test("normalizer: empty/invalid payload yields no events", () => {
  assertEquals(normalizeMetaPayload({}).events.length, 0);
  assertEquals(normalizeMetaPayload(null).events.length, 0);
  assertEquals(normalizeMetaPayload({ entry: [] }).events.length, 0);
});

Deno.test("signature: valid HMAC-SHA256 passes", async () => {
  const secret = "app_secret_for_test";
  const body = JSON.stringify({ hello: "world" });
  // Compute expected sig
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  const ok = await validateMetaSignature(body, `sha256=${hex}`, secret);
  assert(ok);
});

Deno.test("signature: tampered body fails", async () => {
  const secret = "s";
  const sig = "sha256=" + "0".repeat(64);
  const ok = await validateMetaSignature("payload", sig, secret);
  assertEquals(ok, false);
});

Deno.test("signature: missing header → false (when secret configured)", async () => {
  const ok = await validateMetaSignature("body", null, "secret");
  assertEquals(ok, false);
});

Deno.test("signature: no secret configured → permissive (dev mode)", async () => {
  const ok = await validateMetaSignature("body", null, "");
  assertEquals(ok, true);
});
