// WhatsApp Cloud API Webhook (Meta — modo OFICIAL)
// - GET: Meta verification handshake (hub.mode=subscribe + hub.verify_token + hub.challenge)
// - POST: valida assinatura X-Hub-Signature-256 (HMAC-SHA256 com WHATSAPP_CLOUD_APP_SECRET),
//         filtra eventos suportados (messages/statuses), aplica idempotência por message.id
//         e persiste em FATOR X via rpc_insert_message.
//
// Este endpoint é exclusivo do MODO OFICIAL. O modo NÃO-OFICIAL (Evolution API) é
// servido por `evolution-webhook` com validação HMAC própria (x-evolution-signature).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyHmacSignature } from "../_shared/hmac-validation.ts";
import { contractErrorResponse } from "../_shared/validation.ts";
import { MetaWebhookPayloadSchema } from "../_shared/webhook-schemas.ts";
import { markEventProcessed } from "../_shared/evolution-helpers.ts";

interface MetaWAMessage {
  from: string;
  id: string;
  type?: string;
  timestamp?: string;
  text?: { body?: string };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { filename?: string };
  [key: string]: unknown;
}
interface MetaWAContact {
  wa_id?: string;
  profile?: { name?: string };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const verifyTokenRaw = Deno.env.get("WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN");
const VERIFY_TOKEN = typeof verifyTokenRaw === 'string' && verifyTokenRaw.length > 0 ? verifyTokenRaw : '';

const appSecretRaw = Deno.env.get("WHATSAPP_CLOUD_APP_SECRET");
const APP_SECRET = typeof appSecretRaw === 'string' && appSecretRaw.length > 0 ? appSecretRaw : '';

const strictModeEnvRaw = Deno.env.get("WHATSAPP_CLOUD_WEBHOOK_STRICT");
const STRICT_MODE_ENV = typeof strictModeEnvRaw === 'string' && strictModeEnvRaw.length > 0 ? strictModeEnvRaw : 'true';
const STRICT_MODE = STRICT_MODE_ENV.toLowerCase() !== "false";

const externalUrlHosted = Deno.env.get('SELFHOSTED_SUPABASE_URL');
const externalUrlDefault = Deno.env.get('EXTERNAL_SUPABASE_URL');
const EXTERNAL_URL = (typeof externalUrlHosted === 'string' && externalUrlHosted.length > 0)
  ? externalUrlHosted
  : (typeof externalUrlDefault === 'string' && externalUrlDefault.length > 0 ? externalUrlDefault : '');

const externalKeyHosted = Deno.env.get('SELFHOSTED_SUPABASE_ANON_KEY');
const externalKeyDefault = Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY');
const EXTERNAL_KEY = (typeof externalKeyHosted === 'string' && externalKeyHosted.length > 0)
  ? externalKeyHosted
  : (typeof externalKeyDefault === 'string' && externalKeyDefault.length > 0 ? externalKeyDefault : '');

const supabaseUrlHosted = Deno.env.get('SELFHOSTED_SUPABASE_URL');
const supabaseUrlDefault = Deno.env.get('SUPABASE_URL');
const SUPABASE_URL = (typeof supabaseUrlHosted === 'string' && supabaseUrlHosted.length > 0)
  ? supabaseUrlHosted
  : (typeof supabaseUrlDefault === 'string' && supabaseUrlDefault.length > 0 ? supabaseUrlDefault : '');

const supabaseServiceKeyHosted = Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY');
const supabaseServiceKeyDefault = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const SUPABASE_SERVICE_ROLE_KEY = (typeof supabaseServiceKeyHosted === 'string' && supabaseServiceKeyHosted.length > 0)
  ? supabaseServiceKeyHosted
  : (typeof supabaseServiceKeyDefault === 'string' && supabaseServiceKeyDefault.length > 0 ? supabaseServiceKeyDefault : '');

// FIX B4: NÃO criar clients em module scope com `!` — se qualquer env var faltar,
// o `createClient` explode no boot e a função retorna 500 BOOT_ERROR em tudo,
// inclusive no handshake GET do Meta. Lazy + guarded.
const externalClient =
  EXTERNAL_URL && EXTERNAL_KEY ? createClient(EXTERNAL_URL, EXTERNAL_KEY) : null;
const localClient =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null;

// Eventos do payload Meta que conhecemos. Qualquer field fora desta lista é
// ignorado (e logado), em vez de processado às cegas.
const SUPPORTED_FIELDS = new Set(["messages"]);

function jidFromPhone(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  return `${digits}@s.whatsapp.net`;
}

function reqId(): string {
  return crypto.randomUUID().slice(0, 8);
}

// Registra atividade do webhook (best-effort, nunca bloqueia o fluxo)
async function recordPing(
  kind: "handshake" | "event" | "invalid_signature" | "invalid_token",
  meta: Record<string, unknown> = {},
): Promise<void> {
  try {
    if (!localClient) return;
    await localClient.from("whatsapp_cloud_webhook_pings").insert({ kind, meta });
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.warn(`[whatsapp-cloud-webhook] ping insert failed: ${errorMsg}`);
  }
}

async function isDuplicate(messageId: string): Promise<boolean> {
  if (!messageId) return false;
  const eventId = `whatsapp-cloud:${messageId}`;
  // Reaproveita o helper compartilhado (mesmo usado pelo evolution-webhook): insert-first
  // com detecção de duplicata via violação de unique constraint em webhook_events_processed,
  // em vez de select-then-insert (que tinha uma janela de corrida sob entrega concorrente).
  const isNew = await markEventProcessed(localClient, eventId, "whatsapp-cloud", "messages.upsert");
  return !isNew;
}

async function persistInbound(message: MetaWAMessage, contact: MetaWAContact | undefined) {
  if (!externalClient) return;
  const remoteJid = jidFromPhone(message.from);

  const textBody = (message && typeof message.text === 'object' && message.text !== null && !Array.isArray(message.text))
    ? (message.text as Record<string, unknown>)
    : null;
  const textBodyStr = textBody && typeof textBody.body === 'string' ? textBody.body : undefined;

  const imageCaption = (message && typeof message.image === 'object' && message.image !== null && !Array.isArray(message.image))
    ? (message.image as Record<string, unknown>)
    : null;
  const imageCaptionStr = imageCaption && typeof imageCaption.caption === 'string' ? imageCaption.caption : undefined;

  const videoCaption = (message && typeof message.video === 'object' && message.video !== null && !Array.isArray(message.video))
    ? (message.video as Record<string, unknown>)
    : null;
  const videoCaptionStr = videoCaption && typeof videoCaption.caption === 'string' ? videoCaption.caption : undefined;

  const docFilename = (message && typeof message.document === 'object' && message.document !== null && !Array.isArray(message.document))
    ? (message.document as Record<string, unknown>)
    : null;
  const docFilenameStr = docFilename && typeof docFilename.filename === 'string' ? docFilename.filename : undefined;

  const content = textBodyStr ?? imageCaptionStr ?? videoCaptionStr ?? docFilenameStr ?? `[${message.type ?? 'unknown'}]`;

  const contactProfile = contact && typeof contact.profile === 'object' && contact.profile !== null && !Array.isArray(contact.profile)
    ? (contact.profile as Record<string, unknown>)
    : null;
  const contactName = contactProfile && typeof contactProfile.name === 'string' ? contactProfile.name : null;

  try {
    await externalClient.rpc("rpc_upsert_contact", {
      p_remote_jid: remoteJid,
      p_instance: "wpp2",
      p_push_name: contactName,
    });
  } catch (_e) {
    // ignore — contact may already exist
  }

  const messageType = typeof message.type === 'string' && message.type.length > 0 ? message.type : "text";
  await externalClient.rpc("rpc_insert_message", {
    p_remote_jid: remoteJid,
    p_content: content,
    p_message_id: message.id,
    p_message_type: messageType,
    p_from_me: false,
  });
}

Deno.serve(async (req) => {
  const rid = reqId();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // GET: Meta verification handshake
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token && VERIFY_TOKEN && token === VERIFY_TOKEN) {
      console.log(`[whatsapp-cloud-webhook][${rid}] verification ok`);
      void recordPing("handshake", { rid, mode, source: req.headers.get("user-agent") ?? null });
      return new Response(challenge ?? "", { status: 200, headers: corsHeaders });
    }
    console.warn(`[whatsapp-cloud-webhook][${rid}] verification failed mode=${mode}`);
    void recordPing("invalid_token", { rid, mode, hadToken: !!token });
    return new Response("forbidden", { status: 403, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: corsHeaders });
  }

  // POST: lê raw body para validar assinatura
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256") ?? "";

  if (APP_SECRET) {
    const ok = signature
      ? await verifyHmacSignature(rawBody, signature, APP_SECRET)
      : false;
    if (!ok) {
      console.warn(
        `[whatsapp-cloud-webhook][${rid}] invalid signature (strict=${STRICT_MODE} hasSig=${!!signature})`,
      );
      void recordPing("invalid_signature", { rid, hasSig: !!signature, strict: STRICT_MODE });
      if (STRICT_MODE) {
        return new Response(
          JSON.stringify({ error: "invalid_signature", requestId: rid }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }
  } else if (STRICT_MODE) {
    // Secret not configured: in strict mode reject all requests rather than
    // processing unauthenticated payloads. Operator must set the env var.
    console.error(
      `[whatsapp-cloud-webhook][${rid}] WHATSAPP_CLOUD_APP_SECRET not configured — rejecting in strict mode`,
    );
    void recordPing("invalid_signature", { rid, reason: "no_secret_configured", strict: true });
    return new Response(
      JSON.stringify({ error: "webhook_not_configured", requestId: rid }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } else {
    console.warn(
      `[whatsapp-cloud-webhook][${rid}] WHATSAPP_CLOUD_APP_SECRET not configured — signature validation skipped (non-strict)`,
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response(
      JSON.stringify({ error: "invalid_json", requestId: rid }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const parsed = MetaWebhookPayloadSchema.safeParse(body);
  if (!parsed.success) {
    console.warn(`[whatsapp-cloud-webhook][${rid}] contract_violation:`, parsed.error.issues);
    return contractErrorResponse(
      'INVALID_META_PAYLOAD',
      'Payload does not match WhatsApp Cloud Webhook contract',
      parsed.error.issues,
      rid,
      req
    );
  }

  // A Meta só envia object="whatsapp_business_account".
  // Note: Schema already validates object="whatsapp_business_account" via z.literal
  // If we reach here, it's valid.

  try {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return new Response(
        JSON.stringify({ error: "invalid_body_type", requestId: rid }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const bodyObj = body as Record<string, unknown>;
    const entries = Array.isArray(bodyObj.entry) ? bodyObj.entry : [];
    let processed = 0;
    let duplicates = 0;
    let ignoredFields = 0;

    for (const entryRaw of entries) {
      if (typeof entryRaw !== 'object' || entryRaw === null || Array.isArray(entryRaw)) continue;
      const entry = entryRaw as Record<string, unknown>;
      const changes = Array.isArray(entry.changes) ? entry.changes : [];

      for (const changeRaw of changes) {
        if (typeof changeRaw !== 'object' || changeRaw === null || Array.isArray(changeRaw)) continue;
        const change = changeRaw as Record<string, unknown>;

        const field = typeof change.field === 'string' ? change.field : '';
        if (!SUPPORTED_FIELDS.has(field)) {
          ignoredFields++;
          console.log(`[whatsapp-cloud-webhook][${rid}] ignored field=${field}`);
          continue;
        }

        const value = typeof change.value === 'object' && change.value !== null && !Array.isArray(change.value)
          ? (change.value as Record<string, unknown>)
          : {};

        const messages = Array.isArray(value.messages) ? value.messages : [];
        const contacts = Array.isArray(value.contacts) ? value.contacts : [];

        for (const msgRaw of messages) {
          if (typeof msgRaw !== 'object' || msgRaw === null || Array.isArray(msgRaw)) continue;
          const msg = msgRaw as MetaWAMessage;

          if (typeof msg.id !== 'string' || !msg.id) continue;
          if (await isDuplicate(msg.id)) {
            duplicates++;
            continue;
          }

          let contact: MetaWAContact | undefined;
          if (typeof msg.from === 'string' && msg.from) {
            for (const contactRaw of contacts) {
              if (typeof contactRaw !== 'object' || contactRaw === null || Array.isArray(contactRaw)) continue;
              const c = contactRaw as Record<string, unknown>;
              if (typeof c.wa_id === 'string' && c.wa_id === msg.from) {
                contact = c as MetaWAContact;
                break;
              }
            }
          }

          try {
            await persistInbound(msg, contact);
            processed++;
          } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            console.error(`[whatsapp-cloud-webhook][${rid}] persist error:`, errorMsg);
          }
        }

        const statuses = Array.isArray(value.statuses) ? value.statuses : [];
        if (statuses.length) {
          console.log(
            `[whatsapp-cloud-webhook][${rid}] statuses count=${statuses.length}:`,
            JSON.stringify(statuses).slice(0, 300),
          );
        }
      }
    }

    void recordPing("event", { rid, processed, duplicates, ignoredFields });
    return new Response(
      JSON.stringify({ ok: true, processed, duplicates, ignoredFields, requestId: rid }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    console.error(`[whatsapp-cloud-webhook][${rid}] error`, errorMsg);
    return new Response(
      JSON.stringify({ ok: false, requestId: rid }),
      {
        status: 200, // ack para evitar retry-storm da Meta
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
