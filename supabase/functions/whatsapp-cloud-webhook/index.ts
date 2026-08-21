// WhatsApp Cloud API Webhook (Meta — modo OFICIAL)
// - GET: Meta verification handshake (hub.mode=subscribe + hub.verify_token + hub.challenge)
// - POST: valida assinatura X-Hub-Signature-256 (HMAC-SHA256 com WHATSAPP_CLOUD_APP_SECRET),
//         filtra eventos suportados (messages/statuses), aplica idempotência por message.id
//         e persiste no Evolution DB via rpc_insert_message.
//
// Evolução W5 (decouple-audit):
//  1. Normalizer v2 (_shared/whatsapp-cloud-normalizer.ts) substitui a extração inline
//     (text/image/video/document/location/interactive...) para mensagens E statuses.
//  2. Statuses (sent/delivered/read/failed) agora são PERSISTIDOS — imitando o handler de
//     status do evolution-webhook (handleMessagesUpdate): lookup em evolution_messages por
//     message_id + instance_name e update com guarda de prioridade (shouldUpdateStatus),
//     sem fabricar placeholder para ACK órfão (M-4).
//  3. p_instance resolvido via env WHATSAPP_CLOUD_INSTANCE (default 'wpp2').
//  4. HMAC: secret configurado + assinatura ausente/incorreta → 401; secret NÃO configurado
//     → warning + segue (dev mode).
//  5. Notificação vazia da Meta (entry null/[]) → 200 benigno (sem retry-storm).
//  6. Resposta de sucesso ganha `duplicate:true` quando houve mensagem já processada.
//
// Este endpoint é exclusivo do MODO OFICIAL. O modo NÃO-OFICIAL (Evolution API) é
// servido por `evolution-webhook` com validação HMAC própria (x-evolution-signature).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createZappAdminClient } from '../_shared/db-client.ts';
import { verifyHmacSignature } from "../_shared/hmac-validation.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";
import { markEventProcessed, shouldUpdateStatus } from "../_shared/evolution-helpers.ts";
import {
  normalizeMetaPayload,
  type NormalizedIncoming,
  type NormalizedStatus,
} from "../_shared/whatsapp-cloud-normalizer.ts";

import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { timingSafeStringEqual } from '../_shared/auth.ts';
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

/** Shape do body Meta validado pelo contrato (object + entry[].changes[]). */
interface MetaWebhookBody {
  object: string;
  entry: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        messages?: MetaWAMessage[];
        contacts?: MetaWAContact[];
        statuses?: Array<Record<string, unknown>>;
      };
    }>;
  }>;
}

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN") ?? "";
const APP_SECRET = Deno.env.get("WHATSAPP_CLOUD_APP_SECRET") ?? "";
// [W5] Instância alvo no Evolution DB — configurável via env, default 'wpp2'
// (compat com o valor hardcoded anterior).
const P_INSTANCE = Deno.env.get("WHATSAPP_CLOUD_INSTANCE") ?? "wpp2";
const EXTERNAL_URL = (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('EXTERNAL_SUPABASE_URL')) ?? "";
const EXTERNAL_KEY = (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('EXTERNAL_SUPABASE_SERVICE_ROLE_KEY')) ?? (Deno.env.get('SELFHOSTED_SUPABASE_ANON_KEY') ?? Deno.env.get('EXTERNAL_SUPABASE_ANON_KEY')) ?? "";
const externalClient =
  EXTERNAL_URL && EXTERNAL_KEY ? createClient(EXTERNAL_URL, EXTERNAL_KEY, { db: { schema: 'zapp' }, auth: { persistSession: false, autoRefreshToken: false } }) : null;
const localClient = createZappAdminClient();

// Eventos do payload Meta que conhecemos. Qualquer field fora desta lista é
// ignorado (e logado), em vez de processado às cegas.
// Meta WhatsApp Cloud API notification fields
const SUPPORTED_FIELDS = new Set(["messages", "statuses"]);

function reqId(): string {
  return crypto.randomUUID().slice(0, 8);
}

// Registra atividade do webhook (best-effort, nunca bloqueia o fluxo)
async function recordPing(
  kind: "handshake" | "event" | "invalid_signature" | "invalid_token" | "webhook_misconfigured",
  meta: Record<string, unknown> = {},
): Promise<void> {
  try {
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

/**
 * [W5] Persiste mensagem inbound NORMALIZADA (normalizer v2) via RPCs canônicos.
 * A extração inline antiga (text.body ?? image.caption ?? ...) foi substituída
 * pelo normalizeMetaPayload — aqui só mapeamos o modelo canônico para as RPCs.
 */
async function persistInbound(message: NormalizedIncoming) {
  if (!externalClient) return;
  try {
    await externalClient.rpc("rpc_upsert_contact", {
      p_remote_jid: message.remoteJid,
      p_instance: P_INSTANCE,
      p_push_name: message.pushName ?? null,
    });
  } catch (_e) {
    // ignore — contact may already exist
  }

  await externalClient.rpc("rpc_insert_message", {
    p_instance: P_INSTANCE,
    p_remote_jid: message.remoteJid,
    p_content: message.content || `[${message.messageType}]`,
    p_message_id: message.wamid,
    p_message_type: message.messageType,
    p_from_me: false,
    p_direction: "inbound",
    p_provider: "whatsapp_cloud",
    p_timestamp: new Date(message.timestamp * 1000).toISOString(),
    p_push_name: message.pushName ?? null,
    p_metadata: message.metadata ?? null,
  });
}

/**
 * [W5] Persiste status ACK (sent/delivered/read/failed) — NÃO apenas loga.
 * Imita o handler de status do evolution-webhook (handleMessagesUpdate):
 * lookup em evolution_messages por message_id + instance_name, guarda de
 * prioridade shouldUpdateStatus (sent→delivered→read; failed só antes de
 * delivered) e update de status/status_at/updated_at. ACK órfão (mensagem
 * desconhecida) é logado e descartado — nunca fabrica placeholder (M-4: o
 * placeholder bloquearia o upsert real da mensagem).
 */
async function persistStatus(status: NormalizedStatus): Promise<"updated" | "skipped" | "orphan"> {
  if (!externalClient) return "skipped";
  if (!["sent", "delivered", "read", "failed"].includes(status.status)) return "skipped";
  try {
    const { data: current } = await externalClient.from("evolution_messages")
      .select("id, status")
      .eq("message_id", status.wamid)
      .eq("instance_name", P_INSTANCE)
      .maybeSingle();

    if (!current?.id) {
      console.warn(
        `[whatsapp-cloud-webhook] orphan ACK for unknown message message_id=${status.wamid} status=${status.status} — skipping placeholder (awaiting real upsert)`,
      );
      return "orphan";
    }

    if (shouldUpdateStatus(current.status, status.status)) {
      const now = new Date().toISOString();
      await externalClient.from("evolution_messages")
        .update({
          status: status.status,
          status_at: new Date(status.timestamp * 1000).toISOString(),
          updated_at: now,
        })
        .eq("id", current.id);
      console.log(`[whatsapp-cloud-webhook] message ${status.wamid} status: ${current.status} → ${status.status}`);
      return "updated";
    }
    return "skipped";
  } catch (e) {
    console.error(`[whatsapp-cloud-webhook] status persist error:`, e);
    return "skipped";
  }
}

/**
 * [W5] Notificação vazia/benigna da Meta (entry null ou []) → ack 200 sem crash.
 * Payload JSON válido com object=whatsapp_business_account e entry nulo/vazio
 * não é violação de contrato digna de 422 (que provocaria retry-storm da Meta
 * por até 24h) — é ack silencioso. Entry AUSENTE continua caindo no contrato 422.
 */
function isBenignEmptyNotification(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const b = body as Record<string, unknown>;
  if (b.object !== "whatsapp_business_account") return false;
  const entry = b.entry;
  return entry === null || (Array.isArray(entry) && entry.length === 0);
}

Deno.serve(async (req) => {
  const rid = reqId();

  if (req.method === "OPTIONS") {
    return handleCorsPreflight(req);
  }

  const url = new URL(req.url);

  // GET: Meta verification handshake
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token && VERIFY_TOKEN && timingSafeStringEqual(token, VERIFY_TOKEN)) {
      void recordPing("handshake", { rid, mode, source: req.headers.get("user-agent") ?? null });
      return new Response(challenge ?? "", { status: 200, headers: getCorsHeaders(req) });
    }
    void recordPing("invalid_token", { rid, mode, hadToken: !!token });
    return new Response("forbidden", { status: 403, headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405, headers: getCorsHeaders(req) });
  }

  // POST: lê raw body para validar assinatura
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256") ?? "";

  // [W5] HMAC obrigatório quando o secret ESTÁ configurado: assinatura ausente
  // ou incorreta → 401.
  // SEC-5 (2026-08-21): secret NÃO configurado agora falha-fechado (503), como
  // evolution-webhook e zapp-email-inbound-webhook. O comportamento anterior
  // (warning + segue, "dev mode") aceitava qualquer POST sem autenticação
  // enquanto o secret não fosse provisionado — mesma classe de risco que o
  // fail-closed de evolution-webhook (A-1 FIX 2026-07-12) já existe para
  // prevenir. Este endpoint serve o modo Meta OFICIAL, hoje inativo em
  // produção (o modo ativo é evolution-webhook) — sem risco de regressão
  // funcional, só remove uma janela de exposição pré-existente.
  if (APP_SECRET) {
    const ok = signature
      ? await verifyHmacSignature(rawBody, signature, APP_SECRET)
      : false;
    if (!ok) {
      console.warn(
        `[whatsapp-cloud-webhook][${rid}] invalid signature (hasSig=${!!signature})`,
      );
      void recordPing("invalid_signature", { rid, hasSig: !!signature });
      return new Response(
        JSON.stringify({ error: "invalid_signature", requestId: rid }),
        { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }
  } else {
    console.error(
      `[whatsapp-cloud-webhook][${rid}] WHATSAPP_CLOUD_APP_SECRET not configured — refusing (fail-closed)`,
    );
    void recordPing("webhook_misconfigured", { rid });
    return new Response(
      JSON.stringify({ error: "webhook_misconfigured", reason: "no_secret_configured", requestId: rid }),
      { status: 503, headers: { ...getCorsHeaders(req), "Content-Type": "application/json", "Retry-After": "120" } },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response(
      JSON.stringify({ error: "invalid_json", requestId: rid }),
      { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  // [W5] Notificação vazia da Meta → 200 benigno ANTES do contrato (evita 422 →
  // retry-storm da Meta para payload estruturalmente inofensivo).
  if (isBenignEmptyNotification(body)) {
    console.log(`[whatsapp-cloud-webhook][${rid}] benign empty notification (entry null/empty) — acked`);
    void recordPing("event", { rid, processed: 0, duplicates: 0, ignoredFields: 0, benign: true });
    return new Response(
      JSON.stringify({
        ok: true, processed: 0, duplicates: 0, ignoredFields: 0,
        statusesUpdated: 0, statusesSkipped: 0, statusesOrphan: 0,
        duplicate: false, benign: true, requestId: rid,
      }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  // Contrato whatsapp-cloud-webhook@v1/v2: parseOrReject com o schema Meta
  // (object=whatsapp_business_account + entry[]). Permissivo — campo novo do
  // provedor nunca derruba a ingestão; falha real → envelope 422 único.
  const parsed = parseOrReject('whatsapp-cloud-webhook', CONTRACT_SCHEMAS['whatsapp-cloud-webhook'], req, body, {
    requestId: rid,
    extraHeaders: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
  if (parsed.ok === false) {
    console.warn(`[whatsapp-cloud-webhook][${rid}] contract_violation:`, parsed.body.details);
    return parsed.response;
  }

  // A Meta só envia object="whatsapp_business_account".
  // Note: Schema already validates object="whatsapp_business_account" via z.literal
  // If we reach here, it's valid.

  try {
    const payload = parsed.data as MetaWebhookBody;
    const entries = payload?.entry ?? [];

    // [W5] Normalizer v2 (E48): mensagens E statuses → modelo canônico. A extração
    // inline (jidFromPhone, text/image/video/document captions, mapeamento de tipo)
    // foi REMOVIDA — normalizeMetaPayload é a fonte única de verdade.
    const normalized = normalizeMetaPayload(payload);
    if (normalized.validationError) {
      // Não deve ocorrer (mesmo schema do contrato), mas nunca derruba o fluxo.
      console.warn(`[whatsapp-cloud-webhook][${rid}] normalizer validation error:`, normalized.validationError.issues);
    }
    const normByWamid = new Map<string, NormalizedIncoming>();
    for (const ev of normalized.events) {
      if (ev.kind === "message") normByWamid.set(ev.wamid, ev);
    }

    let processed = 0;
    let duplicates = 0;
    let ignoredFields = 0;
    let statusesUpdated = 0;
    let statusesSkipped = 0;
    let statusesOrphan = 0;

    for (const entry of entries) {
      const changes = entry?.changes ?? [];
      for (const change of changes) {
        const field = change?.field;
        if (!field || !SUPPORTED_FIELDS.has(field)) {
          ignoredFields++;
          continue;
        }
        const value = change?.value ?? {};
        const messages = value?.messages ?? [];
        for (const msg of messages) {
          if (await isDuplicate(msg.id)) {
            duplicates++;
            continue;
          }
          const normalizedMsg = normByWamid.get(msg.id);
          if (!normalizedMsg) {
            console.warn(`[whatsapp-cloud-webhook][${rid}] normalizer produced no event for message id=${msg.id} — skipped`);
            ignoredFields++;
            continue;
          }
          try {
            await persistInbound(normalizedMsg);
            processed++;
          } catch (e) {
            console.error(`[whatsapp-cloud-webhook][${rid}] persist error:`, e);
          }
        }
      }
    }

    // [W5] Statuses PERSISTIDOS (não apenas logados) — mesmo mecanismo do evolution.
    for (const ev of normalized.events) {
      if (ev.kind !== "status") continue;
      const outcome = await persistStatus(ev);
      if (outcome === "updated") statusesUpdated++;
      else if (outcome === "orphan") statusesOrphan++;
      else statusesSkipped++;
    }

    void recordPing("event", { rid, processed, duplicates, ignoredFields, statusesUpdated, statusesSkipped, statusesOrphan });
    return new Response(
      JSON.stringify({
        ok: true, processed, duplicates, ignoredFields,
        statusesUpdated, statusesSkipped, statusesOrphan,
        duplicate: duplicates > 0, requestId: rid,
      }),
      { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(`[whatsapp-cloud-webhook][${rid}] error`, e);
    return new Response(
      JSON.stringify({ ok: false, requestId: rid }),
      {
        status: 200, // ack para evitar retry-storm da Meta
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      },
    );
  }
});
