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

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("WHATSAPP_CLOUD_APP_SECRET") ?? "";
const STRICT_MODE =
  (Deno.env.get("WHATSAPP_CLOUD_WEBHOOK_STRICT") ?? "true").toLowerCase() !== "false";
const EXTERNAL_URL = (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('EXTERNAL_SUPABASE_URL')) ?? "";
const EXTERNAL_KEY = (Deno.env.get('SELFHOSTED_SUPABASE_ANON_KEY') ?? Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY')) ?? "";
const SUPABASE_URL = (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL')) ?? "";
const SUPABASE_SERVICE_ROLE_KEY = (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) ?? "";

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
    console.warn(`[whatsapp-cloud-webhook] ping insert failed: ${(e as Error).message}`);
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
  const content =
    message.text?.body ??
    message.image?.caption ??
    message.video?.caption ??
    message.document?.filename ??
    `[${message.type}]`;

  try {
    await externalClient.rpc("rpc_upsert_contact", {
      p_remote_jid: remoteJid,
      p_instance: "wpp2",
      p_push_name: contact?.profile?.name ?? null,
    });
  } catch (_e) {
    // ignore — contact may already exist
  }

  await externalClient.rpc("rpc_insert_message", {
    p_remote_jid: remoteJid,
    p_content: content,
    p_message_id: message.id,
    p_message_type: message.type ?? "text",
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
    const entries = body?.entry ?? [];
    let processed = 0;
    let duplicates = 0;
    let ignoredFields = 0;

    for (const entry of entries) {
      const changes = entry?.changes ?? [];
      for (const change of changes) {
        const field = change?.field;
        if (!SUPPORTED_FIELDS.has(field)) {
          ignoredFields++;
          console.log(`[whatsapp-cloud-webhook][${rid}] ignored field=${field}`);
          continue;
        }
        const value = change?.value ?? {};
        const messages = value?.messages ?? [];
        const contacts = value?.contacts ?? [];
        for (const msg of messages) {
          if (await isDuplicate(msg.id)) {
            duplicates++;
            continue;
          }
          const contact = (contacts as MetaWAContact[]).find((c) => c?.wa_id === msg?.from);
          try {
            await persistInbound(msg, contact);
            processed++;
          } catch (e) {
            console.error(`[whatsapp-cloud-webhook][${rid}] persist error:`, e);
          }
        }
        const statuses = value?.statuses ?? [];
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
    console.error(`[whatsapp-cloud-webhook][${rid}] error`, e);
    return new Response(
      JSON.stringify({ ok: false, requestId: rid }),
      {
        status: 200, // ack para evitar retry-storm da Meta
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
