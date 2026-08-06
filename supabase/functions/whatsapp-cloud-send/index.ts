// WhatsApp Cloud API sender — text, media, template, sticker, reaction, location, contacts, read
// Auth: requires JWT (validated below). Body schema validated with Zod via contract gate.
import { createZappClient } from '../_shared/db-client.ts';
import { getCorsHeaders, checkRateLimit } from "../_shared/validation.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";

const corsHeaders = getCorsHeaders();

const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_CLOUD_PHONE_NUMBER_ID") ?? "";
const ACCESS_TOKEN = Deno.env.get("WHATSAPP_CLOUD_ACCESS_TOKEN") ?? "";
const GRAPH_VERSION = "v21.0";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function callGraph(path: string, payload: Record<string, unknown>) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/${path}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });

  let data: unknown;
  try {
    data = await r.json();
  } catch {
    data = {};
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    data = {};
  }

  return { ok: r.ok, status: r.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  // JWT validation
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  let authedUserId = "";
  try {
    const supa = createZappClient(req);
    const { data: userData, error: userErr } = await supa.auth.getUser();
    if (userErr || !userData || typeof userData !== 'object' || !userData.user) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
    authedUserId = userData.user.id;
  } catch {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const rl = checkRateLimit(`whatsapp-cloud-send:${authedUserId}`, 60, 60_000);
  if (!rl.allowed) return jsonResponse({ error: "rate_limit_exceeded", message: "Tente novamente em instantes." }, 429);

  if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
    return jsonResponse(
      {
        error: "cloud_api_not_configured",
        message:
          "WHATSAPP_CLOUD_PHONE_NUMBER_ID e WHATSAPP_CLOUD_ACCESS_TOKEN não configurados.",
      },
      503
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = parseOrReject('whatsapp-cloud-send', CONTRACT_SCHEMAS['whatsapp-cloud-send'], req, raw, { extraHeaders: getCorsHeaders(req) });
  if (parsed.ok === false) return parsed.response;
  const p = parsed.data as Record<string, any>;

  // Special case: marking messages as read uses the same /messages endpoint
  // but with a different payload shape (no `to`, requires status=read + message_id).
  if (p.type === "read") {
    const messageIds = Array.isArray(p.messageIds) ? p.messageIds : [];
    if (messageIds.length === 0) {
      return jsonResponse({ error: "message_ids_required" }, 400);
    }
    const results = [];
    for (const midRaw of messageIds) {
      const mid = typeof midRaw === 'string' ? midRaw : '';
      if (!mid) {
        results.push({ id: '', ok: false, status: 0 });
        continue;
      }
      try {
        const r = await callGraph("messages", {
          messaging_product: "whatsapp",
          status: "read",
          message_id: mid,
        });
        results.push({ id: mid, ok: r.ok, status: r.status });
      } catch (e) {
        console.error("[whatsapp-cloud-send] read mark failed", mid, e instanceof Error ? e.message : String(e));
        results.push({ id: mid, ok: false, status: 0 });
      }
    }
    const allOk = results.every((x) => x.ok);
    return jsonResponse({ ok: allOk, results }, allOk ? 200 : 502);
  }

  // Build Graph payload for messages
  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: p.to,
    type: p.type,
    // Note: Official Cloud API does not natively support idempotency keys in the same way 
    // as Evolution, but we can track it in logs if needed.
  };

  switch (p.type) {
    case "text":
      if (!p.text) return jsonResponse({ error: "text_required" }, 400);
      payload.text = { body: p.text, preview_url: false };
      break;
    case "image":
    case "video":
    case "audio":
      if (!p.mediaUrl) return jsonResponse({ error: "media_url_required" }, 400);
      payload[p.type] = {
        link: p.mediaUrl,
        ...(p.caption && p.type !== "audio" ? { caption: p.caption } : {}),
      };
      break;
    case "sticker":
      if (!p.mediaUrl) return jsonResponse({ error: "media_url_required" }, 400);
      payload.sticker = { link: p.mediaUrl };
      break;
    case "document":
      if (!p.mediaUrl) return jsonResponse({ error: "media_url_required" }, 400);
      payload.document = {
        link: p.mediaUrl,
        ...(p.caption ? { caption: p.caption } : {}),
        ...(p.filename ? { filename: p.filename } : {}),
      };
      break;
    case "template":
      if (!p.template) return jsonResponse({ error: "template_required" }, 400);
      payload.template = {
        name: p.template.name,
        language: { code: p.template.language },
        ...(p.template.components ? { components: p.template.components } : {}),
      };
      break;
    case "reaction":
      if (!p.messageId) return jsonResponse({ error: "message_id_required" }, 400);
      payload.reaction = {
        message_id: p.messageId,
        emoji: p.emoji ?? "",
      };
      break;
    case "location":
      if (typeof p.latitude !== "number" || typeof p.longitude !== "number") {
        return jsonResponse({ error: "lat_lng_required" }, 400);
      }
      payload.location = {
        latitude: p.latitude,
        longitude: p.longitude,
        ...(p.name ? { name: p.name } : {}),
        ...(p.address ? { address: p.address } : {}),
      };
      break;
    case "contacts":
      if (!p.contacts?.length) {
        return jsonResponse({ error: "contacts_required" }, 400);
      }
      payload.contacts = p.contacts;
      break;
  }

  try {
    const r = await callGraph("messages", payload);
    if (!r.ok) {
      const dataStr = typeof r.data === 'object' && r.data !== null ? JSON.stringify(r.data).slice(0, 500) : '';
      console.error(
        "[whatsapp-cloud-send] graph error",
        r.status,
        dataStr
      );
      return jsonResponse({ error: "graph_error" }, 502);
    }

    const data = r.data as Record<string, unknown>;
    let waMsgId: string | null = null;
    if (Array.isArray(data.messages)) {
      const firstMsg = data.messages[0];
      if (firstMsg && typeof firstMsg === 'object' && !Array.isArray(firstMsg)) {
        const msg = firstMsg as Record<string, unknown>;
        if (typeof msg.id === 'string') {
          waMsgId = msg.id;
        }
      }
    }

    return jsonResponse({ ok: true, messageId: waMsgId });
  } catch (e) {
    console.error("[whatsapp-cloud-send] fetch error", e instanceof Error ? e.message : String(e));
    return jsonResponse({ error: "fetch_error" }, 502);
  }
});
