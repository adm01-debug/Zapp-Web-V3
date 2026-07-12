// Evolution API Message Sender v6.0 (2026-04-26) — current version v8
// CRÍTICO v6+: Refactor para Vault-based config
//   - URL/key/instance lidos do Vault via fn_get_vault_secret
//   - Hardcoded fallback REMOVIDO (era ponto de falha em sessões passadas)
//   - Falha imediata se Vault não tem o secret (fail-fast)
// Source: Fator X (tdprnylgyrogbbhgdoik) version 8 · 2026-04-26
// SHA256: 0c585e2407ac428cb944756a2aeb6b1d1d0a6c535f14615e31a20f82d80f7a3e

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { requireServiceRoleOrCron } from "../_shared/auth.ts";

import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
const SUPABASE_URL = (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL'))!;
const SUPABASE_SERVICE_ROLE_KEY = (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
const BATCH_SIZE = 10;
const SEND_DELAY_MS = 600;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Cache de config Vault (renovado a cada cold start)
let _config: { url: string; key: string; instance: string } | null = null;
async function getConfig(): Promise<{ url: string; key: string; instance: string }> {
  if (_config) return _config;
  const [{ data: url }, { data: key }, { data: instance }] = await Promise.all([
    supabase.rpc("fn_get_vault_secret", { p_name: "evolution_api_url" }),
    supabase.rpc("fn_get_vault_secret", { p_name: "evolution_api_key" }),
    supabase.rpc("fn_get_vault_secret", { p_name: "evolution_instance_name" }),
  ]);
  if (!url || !key || !instance) {
    throw new Error(`Vault secrets missing: url=${!!url}, key=${!!key}, instance=${!!instance}`);
  }
  _config = { url, key, instance };
  return _config;
}

interface QueuedMessage {
  id: string;
  remote_jid: string;
  message_type: string;
  content: string | null;
  media_url: string | null;
  media_filename: string | null;
  template_id: string | null;
  template_vars: Record<string, any> | null;
  scheduled_at: string | null;
  priority: number | null;
  attempts: number | null;
  max_attempts: number | null;
  instance_name: string | null;
  metadata: Record<string, any> | null;
}

interface SendResult { success: boolean; messageId?: string; error?: string; http_status?: number; }

/** HTTP status considered terminal — never retry (auth/permission/validation). */
function isTerminalStatus(status?: number): boolean {
  return status === 400 || status === 401 || status === 403 || status === 404 || status === 422;
}

/** Exponential backoff with jitter (ms). base=30s, cap=10min. */
function nextBackoffMs(attempts: number): number {
  const base = 30_000;
  const cap = 600_000;
  const exp = Math.min(cap, base * Math.pow(2, Math.max(0, attempts - 1)));
  const jitter = Math.floor(Math.random() * Math.min(exp, 15_000));
  return exp + jitter;
}


/** Escape regex metacharacters in template variable keys to prevent injection. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeNumber(remoteJid: string): string {
  return remoteJid.replace("@s.whatsapp.net", "").replace("@c.us", "").replace("@g.us", "");
}

async function callEvolution(endpoint: string, body: Record<string, any>, instance: string): Promise<SendResult> {
  const cfg = await getConfig();
  try {
    const response = await fetch(`${cfg.url}/message/${endpoint}/${instance || cfg.instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const text = await response.text();
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${text.slice(0, 250)}`, http_status: response.status };
    }
    let result: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        result = parsed;
      }
    } catch { /* manter success se 2xx */ }
    const key = result.key;
    const messageId = (typeof key === 'object' && key !== null && !Array.isArray(key) && typeof key.id === 'string' ? key.id : null)
      || (typeof result.messageId === 'string' ? result.messageId : null)
      || (typeof result.id === 'string' ? result.id : null);
    return {
      success: true,
      messageId: messageId || undefined,
      http_status: response.status,
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function sendTextMessage(remoteJid: string, text: string, instance: string): Promise<SendResult> {
  return callEvolution("sendText", { number: normalizeNumber(remoteJid), text }, instance);
}

async function sendMediaMessage(
  remoteJid: string, mediaType: string, mediaUrl: string,
  caption: string | null, fileName: string | null, instance: string,
): Promise<SendResult> {
  const endpoint = mediaType === "image" ? "sendImage"
    : mediaType === "video" ? "sendVideo"
    : mediaType === "audio" ? "sendWhatsAppAudio"
    : mediaType === "document" ? "sendDocument"
    : "sendMedia";
  const body: Record<string, any> = { number: normalizeNumber(remoteJid), media: mediaUrl };
  if (caption) body.caption = caption;
  if (fileName) body.fileName = fileName;
  if (mediaType === "audio") body.audio = mediaUrl;
  return callEvolution(endpoint, body, instance);
}

async function sendButtonMessage(remoteJid: string, content: Record<string, any>, instance: string): Promise<SendResult> {
  return callEvolution("sendButtons", { number: normalizeNumber(remoteJid), ...content }, instance);
}

async function resolveContactName(remoteJid: string): Promise<string> {
  const { data, error } = await supabase
    .from("evolution_contacts")
    .select("push_name, name")
    .eq("remote_jid", remoteJid)
    .maybeSingle();
  if (error || !data) return "";
  return (data.push_name?.toString() || data.name?.toString() || "").split(" ")[0];
}

async function renderTemplate(
  templateText: string,
  vars: Record<string, any> | null,
  remoteJid: string,
): Promise<string> {
  let out = templateText;
  const allVars: Record<string, string> = {};
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      allVars[k] = String(v ?? "");
    }
  }
  if (out.match(/\{\{\s*nome\s*\}\}/i) && !allVars.nome) {
    const name = await resolveContactName(remoteJid);
    if (name) allVars.nome = name;
  }
  for (const [k, v] of Object.entries(allVars)) {
    // escapeRegex prevents metacharacter injection via variable keys
    const re = new RegExp(`\\{\\{\\s*${escapeRegex(k)}\\s*\\}\\}`, "gi");
    out = out.replace(re, v);
  }
  out = out.replace(/\{\{\s*\w+\s*\}\}/g, "");
  out = out.replace(/\s+/g, " ").replace(/\s+([.,!?])/g, "$1").trim();
  return out;
}

async function sendTemplateMessage(msg: QueuedMessage, instance: string): Promise<SendResult> {
  if (!msg.template_id) return { success: false, error: "template_id missing for type=template" };
  const { data: tpl, error: tplErr } = await supabase
    .from("evolution_message_templates")
    .select("name, content, header_type, header_content, footer_text, is_active, approval_status")
    .eq("id", msg.template_id)
    .maybeSingle();
  if (tplErr || !tpl) {
    return { success: false, error: `template not found: ${tplErr?.message ?? "unknown"}` };
  }
  if (tpl.is_active === false) {
    return { success: false, error: `template inactive: ${tpl.name}` };
  }
  if (tpl.approval_status && tpl.approval_status !== "approved") {
    return { success: false, error: `template not approved (status=${tpl.approval_status}): ${tpl.name}` };
  }
  if (!tpl.content) return { success: false, error: `template has no content: ${tpl.name}` };

  let text = await renderTemplate(tpl.content, msg.template_vars, msg.remote_jid);
  // Guard against rendering an empty string — send nothing rather than a blank message
  if (!text) return { success: false, error: `template rendered to empty string: ${tpl.name}` };
  if (tpl.footer_text) text = `${text}\n\n${tpl.footer_text}`;
  return sendTextMessage(msg.remote_jid, text, instance);
}

async function processMessage(message: QueuedMessage): Promise<SendResult> {
  const cfg = await getConfig();
  const instance = message.instance_name || cfg.instance;
  if (!message.remote_jid) return { success: false, error: "remote_jid missing" };

  switch (message.message_type) {
    case "text":
      if (!message.content) return { success: false, error: "content missing for type=text" };
      return sendTextMessage(message.remote_jid, message.content, instance);
    case "image": case "video": case "audio": case "document":
      if (!message.media_url) return { success: false, error: `media_url missing for type=${message.message_type}` };
      return sendMediaMessage(
        message.remote_jid, message.message_type, message.media_url,
        message.content, message.media_filename, instance,
      );
    case "buttons":
      try {
        const obj = typeof message.content === "string" ? JSON.parse(message.content!) : message.content;
        return sendButtonMessage(message.remote_jid, obj as Record<string, any>, instance);
      } catch (e) {
        return { success: false, error: `invalid buttons JSON: ${e instanceof Error ? e.message : String(e)}` };
      }
    case "template":
      return sendTemplateMessage(message, instance);
    default:
      if (!message.content) return { success: false, error: `unknown type ${message.message_type} and no content` };
      return sendTextMessage(message.remote_jid, message.content, instance);
  }
}

async function markSent(messageId: string, result: SendResult): Promise<void> {
  const update: Record<string, any> = { status: "sent", sent_at: new Date().toISOString() };
  if (result.messageId) update.whatsapp_message_id = result.messageId;
  const { error } = await supabase.from("evolution_message_queue").update(update).eq("id", messageId);
  if (error) console.error(`[markSent] ${messageId}:`, error.message);
}

async function markFailed(messageId: string, result: SendResult): Promise<void> {
  const { error } = await supabase.from("evolution_message_queue").update({
    status: "failed",
    error_message: result.error?.slice(0, 1000) ?? "unknown error",
  }).eq("id", messageId);
  if (error) console.error(`[markFailed] ${messageId}:`, error.message);
}

async function markPending(messageId: string, lastError?: string, backoffMs?: number, httpStatus?: number): Promise<void> {
  // v7: preserva error_message + agenda scheduled_at com jitter para evitar tempestades de retry
  const update: Record<string, any> = { status: "pending" };
  if (lastError) update.error_message = lastError.slice(0, 1000);
  if (typeof httpStatus === "number") update.last_http_status = httpStatus;
  if (backoffMs && backoffMs > 0) {
    update.scheduled_at = new Date(Date.now() + backoffMs).toISOString();
  }
  const { error } = await supabase.from("evolution_message_queue").update(update).eq("id", messageId);
  if (error) console.error(`[markPending] ${messageId}:`, error.message);
}


async function processQueue(): Promise<{
  processed: number; sent: number; failed: number; retried: number;
  duration_ms: number; errors: string[];
}> {
  const startTime = Date.now();
  const errors: string[] = [];
  let processed = 0, sent = 0, failed = 0, retried = 0;

  const { data: messages, error } = await supabase
    .from("evolution_message_queue")
    .select("*")
    .eq("status", "pending")
    .or(`scheduled_at.is.null,scheduled_at.lte.${new Date().toISOString()}`)
    // nullsFirst:false ensures NULLs sort after explicit priorities, preserving intended order
    .order("priority", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    errors.push(`select pending: ${error.message}`);
    return { processed, sent, failed, retried, duration_ms: Date.now() - startTime, errors };
  }
  if (!messages || messages.length === 0) {
    return { processed, sent, failed, retried, duration_ms: Date.now() - startTime, errors };
  }

  for (const message of messages) {
    const m = message as QueuedMessage;
    const newAttempts = (m.attempts ?? 0) + 1;
    const maxAttempts = m.max_attempts ?? 3;

    const { error: leaseRowErr, count: updated } = await supabase
      .from("evolution_message_queue")
      .update({ status: "processing", attempts: newAttempts }, { count: "exact" })
      .eq("id", m.id)
      .eq("status", "pending");
    if (leaseRowErr || updated === 0) {
      if (leaseRowErr) errors.push(`lease ${m.id}: ${leaseRowErr.message}`);
      continue;
    }
    processed++;

    let result: SendResult;
    try {
      result = await processMessage(m);
    } catch (e) {
      // Unexpected exception — return row to pending so the next cycle can retry
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[processQueue] unexpected error processing ${m.id}:`, msg);
      await markPending(m.id, msg);
      retried++;
      continue;
    }

    if (result.success) {
      await markSent(m.id, result);
      sent++;
    } else if (newAttempts >= maxAttempts) {
      await markFailed(m.id, result);
      failed++;
      if (errors.length < 5 && result.error) errors.push(result.error.slice(0, 200));
    } else {
      await markPending(m.id, result.error);
      retried++;
    }
    await new Promise((r) => setTimeout(r, SEND_DELAY_MS));
  }
  return { processed, sent, failed, retried, duration_ms: Date.now() - startTime, errors };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return handleCorsPreflight(request);

  // Internal cron endpoint — require service role or cron secret
  const authErr = requireServiceRoleOrCron(request);
  if (authErr) return authErr;

  try {
    console.log(`[${new Date().toISOString()}] evolution-sender v6 fired`);
    const result = await processQueue();
    await supabase.from("evolution_performance_metrics").insert({
      metric_date: new Date().toISOString().slice(0, 10),
      metric_type: "queue_processing",
      metric_value: result.processed,
      metadata: {
        sent: result.sent, failed: result.failed, retried: result.retried,
        duration_ms: result.duration_ms,
        errors: result.errors.length > 0 ? result.errors.slice(0, 5) : null,
      },
    }).then(() => {}, () => {});
    return new Response(JSON.stringify({
      success: true, version: "v6", ...result, timestamp: new Date().toISOString(),
    }), { status: 200, headers: { ...getCorsHeaders(request), "Content-Type": "application/json" } });
  } catch (error) {
    console.error("evolution-sender v6 error:", error);
    return new Response(JSON.stringify({
      error: "Internal server error",
    }), { status: 500, headers: { ...getCorsHeaders(request), "Content-Type": "application/json" } });
  }
});
