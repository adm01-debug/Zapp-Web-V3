// WhatsApp Cloud API sender — text, media, template, sticker, reaction, location, contacts, interactive, read
// Auth: requires JWT (validated below). Body schema validated with Zod via contract gate.
// Envelope: E83 parity — sucesso e erro de envio usam o MESMO shape do caminho
// Evolution (`version` + `key.{id,remoteJid,fromMe}` / `{error:true,status,message,details}`),
// e envios outbound persistem no mesmo ledger (`evolution_send_idempotency`) e na
// mesma fila (DLQ `failed_messages`) que o proxy Evolution.
import { createZappClient, createZappAdminClient } from '../_shared/db-client.ts';
import { getCorsHeaders, checkRateLimit } from "../_shared/validation.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";
import { EVOLUTION_ENVELOPE_VERSION } from "../_shared/evolution-api-proxy.ts";
import { enqueueFailedMessage } from "../_shared/enqueue-failed-message.ts";
import { isValidIdemKey, lookupSendCache, storeSendCache } from "../_shared/send-idempotency.ts";

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

/** Envelope de erro no shape do proxy Evolution (HTTP 200 + `{error:true,...}`) — E83 parity. */
function sendErrorEnvelope(code: string, message: string, status: number, details?: unknown) {
  return jsonResponse({
    version: EVOLUTION_ENVELOPE_VERSION,
    contract: "whatsapp-cloud-send@v1",
    error: true,
    status,
    code,
    message,
    ...(details !== undefined ? { details } : {}),
  });
}

/** Caminho DLQ equivalente por tipo (mesmo vocabulário `/message/*` do proxy Evolution). */
function dlqPathForType(type: string): string {
  switch (type) {
    case "text": return "/message/sendText";
    case "sticker": return "/message/sendSticker";
    case "reaction": return "/message/sendReaction";
    case "location": return "/message/sendLocation";
    case "contacts": return "/message/sendContact";
    case "template": return "/message/sendTemplate";
    case "interactive": return "/message/sendButtons";
    default: return "/message/sendMedia";
  }
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

  // [R1-EXT/F2] Gate de alvo com exceção de bootstrap (Regra A/E): contato
  // EXISTE no banco e não é visível/fila/admin → 403 SEND_FORBIDDEN;
  // contato INEXISTENTE → permite (número novo/não sincronizado).
  if (typeof p.to === "string" && p.to.trim()) {
    const admin = createZappAdminClient();
    const isJid = p.to.includes("@");
    let q = admin.from("evolution_contacts").select("id").eq("deleted_at", null);
    q = isJid ? q.eq("remote_jid", p.to) : q.eq("phone_number", p.to.replace(/[^0-9]/g, ""));
    const { data: contato } = await q.maybeSingle();
    if (contato) {
      const [{ data: visivel }, { data: naFila }, { data: isAdmin }] = await Promise.all([
        admin.rpc("is_contact_visible_to_user", { _contact_id: contato.id, _user_id: authedUserId }),
        admin.rpc("is_queue_member_of_contact", { _contact_id: contato.id, _user_id: authedUserId }),
        admin.rpc("is_admin_or_supervisor", { _user_id: authedUserId }),
      ]);
      if (!(visivel || naFila || isAdmin)) {
        return jsonResponse({ version: EVOLUTION_ENVELOPE_VERSION, contract: "whatsapp-cloud-send@v1", error: true, status: 403, code: "SEND_FORBIDDEN", message: "Você não tem acesso a esta conversa.", details: [{ path: "to", message: "Acesso negado: conversa não visível ao usuário" }] }, 403);
      }
    }
  }

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
    case "interactive":
      if (!p.interactive || typeof p.interactive !== "object") {
        return sendErrorEnvelope("interactive_required", "interactive é obrigatório para type=interactive.", 400);
      }
      payload.interactive = p.interactive;
      break;
  }

  // Ledger de idempotência (mesma tabela `evolution_send_idempotency` do caminho
  // Evolution): replay de retries com a mesma chave sem duplicar no WhatsApp.
  const idemKey = typeof p.idemKey === "string" ? p.idemKey : undefined;
  const ledgerEnabled = idemKey !== undefined && isValidIdemKey(idemKey);
  if (ledgerEnabled) {
    const cached = await lookupSendCache(idemKey!);
    if (cached) {
      console.log(`[whatsapp-cloud-send] idempotency HIT for ${idemKey}`);
      return jsonResponse(cached.response);
    }
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
      // Mesma fila do caminho Evolution (DLQ `failed_messages`), fire-and-forget.
      enqueueFailedMessage({
        instance_name: PHONE_NUMBER_ID || "cloud",
        remote_jid: typeof p.to === "string" ? p.to : null,
        path: dlqPathForType(p.type),
        method: "POST",
        payload: p,
        http_status: r.status,
        error_code: "graph_error",
        error_message: `Graph API ${r.status}: ${dataStr}`.slice(0, 500),
      });
      return sendErrorEnvelope(
        "graph_error",
        `A Meta Graph API recusou o envio (HTTP ${r.status}).`,
        r.status >= 400 && r.status <= 599 ? r.status : 502,
        r.data
      );
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

    // Envelope no shape do caminho Evolution: `{ version, key: { id, remoteJid, fromMe }, status }`.
    const envelope = {
      version: EVOLUTION_ENVELOPE_VERSION,
      key: {
        remoteJid: p.to,
        fromMe: true,
        id: waMsgId,
      },
      status: "PENDING",
      messageTimestamp: Math.floor(Date.now() / 1000),
      // Aditivo (back-compat com consumidores antigos do shape `{ messageId }`).
      messageId: waMsgId,
    };

    if (ledgerEnabled) {
      await storeSendCache({
        idem_key: idemKey!,
        instance_name: PHONE_NUMBER_ID || "cloud",
        path: dlqPathForType(p.type),
        response: envelope,
        http_status: 200,
        external_message_id: waMsgId,
      });
    }

    return jsonResponse(envelope);
  } catch (e) {
    console.error("[whatsapp-cloud-send] fetch error", e instanceof Error ? e.message : String(e));
    // Timeout/network → mesmo enqueue transitório do proxy Evolution (DLQ).
    enqueueFailedMessage({
      instance_name: PHONE_NUMBER_ID || "cloud",
      remote_jid: typeof p.to === "string" ? p.to : null,
      path: dlqPathForType(p.type),
      method: "POST",
      payload: p,
      http_status: null,
      error_code: "network_error",
      error_message: (e instanceof Error ? e.message : String(e)).slice(0, 500),
    });
    return sendErrorEnvelope(
      "fetch_error",
      "Falha de rede ao contatar a Meta Graph API.",
      504,
      { error: e instanceof Error ? e.message : String(e) }
    );
  }
});
