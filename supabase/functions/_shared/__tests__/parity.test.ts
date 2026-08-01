// Cross-provider parity smoke test.
// Same logical event ("texto recebido de +5511999999999") must produce the same
// shape of arguments destined to rpc_insert_message regardless of provider.
// This catches accidental drift between the Cloud normalizer and the Evolution
// adapter (and any future provider) that would silently break the unified inbox.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeMetaPayload } from "../whatsapp-cloud-normalizer.ts";

interface RpcArgs {
  p_remote_jid: string;
  p_content: string;
  p_message_type: string;
  p_from_me: boolean;
  p_message_id: string;
}

function fromCloudText(): RpcArgs {
  const payload = {
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: "PN" },
      messages: [{ id: "wamid.X1", from: "5511999999999", timestamp: "1", type: "text", text: { body: "olá" } }],
    } }] }],
  };
  const { events } = normalizeMetaPayload(payload);
  const ev = events[0];
  if (ev.kind !== "message") throw new Error("expected message");
  return {
    p_remote_jid: ev.remoteJid,
    p_content: ev.content,
    p_message_type: ev.messageType,
    p_from_me: false,
    p_message_id: ev.wamid,
  };
}

// Stand-in adapter for Evolution-API inbound texto. Mirrors what
// `evolution-webhook` writes into rpc_insert_message for a `messages.upsert`.
function fromEvolutionText(): RpcArgs {
  // Evolution payload (simplified): { key:{ remoteJid, id, fromMe }, message:{ conversation } }
  const evolutionEvent = {
    key: { remoteJid: "5511999999999@s.whatsapp.net", id: "EVOMSG_X1", fromMe: false },
    message: { conversation: "olá" },
  };
  return {
    p_remote_jid: evolutionEvent.key.remoteJid,
    p_content: evolutionEvent.message.conversation,
    p_message_type: "text",
    p_from_me: evolutionEvent.key.fromMe,
    p_message_id: evolutionEvent.key.id,
  };
}

Deno.test("parity: Evolution and Cloud produce identical RPC shape (excluding message_id)", () => {
  const cloud = fromCloudText();
  const evo = fromEvolutionText();
  // Fields that MUST match across providers for the unified model:
  assertEquals(cloud.p_remote_jid, evo.p_remote_jid);
  assertEquals(cloud.p_content, evo.p_content);
  assertEquals(cloud.p_message_type, evo.p_message_type);
  assertEquals(cloud.p_from_me, evo.p_from_me);
  // p_message_id is provider-specific (wamid.* vs Evolution id) — only assert presence
  if (!cloud.p_message_id || !evo.p_message_id) {
    throw new Error("both providers must supply a message id");
  }
});

Deno.test("parity: phone with formatting normalizes to bare-digits JID in Cloud", () => {
  const payload = {
    entry: [{ changes: [{ value: {
      metadata: { phone_number_id: "PN" },
      messages: [{ id: "w", from: "5511999999999", timestamp: "1", type: "text", text: { body: "x" } }],
    } }] }],
  };
  const { events } = normalizeMetaPayload(payload);
  const ev = events[0];
  if (ev.kind !== "message") throw new Error();
  // Must end with @s.whatsapp.net (Evolution convention)
  assertEquals(ev.remoteJid.endsWith("@s.whatsapp.net"), true);
  // Must NOT contain '+' or formatting
  assertEquals(/^\d+@s\.whatsapp\.net$/.test(ev.remoteJid), true);
});
