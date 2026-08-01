// WhatsApp Cloud API sender — text, media, template, sticker, reaction, location, contacts, read
// Auth: requires JWT (validated below). Body schema validated with Zod.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import { contractErrorResponse, getCorsHeaders } from "../_shared/validation.ts";

const corsHeaders = getCorsHeaders();

const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_CLOUD_PHONE_NUMBER_ID") ?? "";
const ACCESS_TOKEN = Deno.env.get("WHATSAPP_CLOUD_ACCESS_TOKEN") ?? "";
const GRAPH_VERSION = "v21.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const SendSchema = z.object({
  to: z.string().min(5), // E.164 phone w/o '+'
  type: z.enum([
    "text",
    "image",
    "video",
    "audio",
    "document",
    "sticker",
    "template",
    "reaction",
    "location",
    "contacts",
    "read",
  ]),
  text: z.string().optional(),
  mediaUrl: z.string().url().optional(),
  caption: z.string().optional(),
  filename: z.string().optional(),
  template: z
    .object({
      name: z.string(),
      language: z.string().default("pt_BR"),
      components: z.array(z.any()).optional(),
    })
    .optional(),
  // reaction
  messageId: z.string().optional(),
  emoji: z.string().optional(),
  // location
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  name: z.string().optional(),
  address: z.string().optional(),
  // contacts
  contacts: z.array(z.any()).optional(),
  // read
  messageIds: z.array(z.string()).optional(),
});

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
  });
  const data = await r.json().catch(() => ({}));
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
  try {
    const supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: userData, error: userErr } = await supa.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "unauthorized" }, 401);
    }
  } catch {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }
  const parsed = SendSchema.safeParse(body);
  if (!parsed.success) {
    return contractErrorResponse(
      "VALIDATION_ERROR",
      "Invalid send payload",
      parsed.error.issues,
      undefined,
      req
    );
  }
  const p = parsed.data;

  // Special case: marking messages as read uses the same /messages endpoint
  // but with a different payload shape (no `to`, requires status=read + message_id).
  if (p.type === "read") {
    if (!p.messageIds?.length) {
      return jsonResponse({ error: "message_ids_required" }, 400);
    }
    const results = [];
    for (const mid of p.messageIds) {
      const r = await callGraph("messages", {
        messaging_product: "whatsapp",
        status: "read",
        message_id: mid,
      });
      results.push({ id: mid, ok: r.ok, status: r.status });
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
      console.error(
        "[whatsapp-cloud-send] graph error",
        r.status,
        JSON.stringify(r.data).slice(0, 500)
      );
      return jsonResponse(
        { error: "graph_error", status: r.status, details: r.data },
        502
      );
    }
    // deno-lint-ignore no-explicit-any
    const waMsgId = (r.data as any)?.messages?.[0]?.id ?? null;
    return jsonResponse({ ok: true, messageId: waMsgId, raw: r.data });
  } catch (e) {
    console.error("[whatsapp-cloud-send] fetch error", e);
    return jsonResponse({ error: "fetch_error", message: String(e) }, 502);
  }
});
