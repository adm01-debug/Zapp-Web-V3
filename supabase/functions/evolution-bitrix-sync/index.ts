/**
 * Edge Function: Evolution Bitrix24 Batch Sync (v3.0)
 *
 * Processes asynchronous queue of WhatsApp contact and deal creation/updates to Bitrix24 CRM.
 * Enables offline-first contact sync: local changes queued, then delivered to Bitrix24 via
 * webhook URL with automatic retry and backoff on transient failures.
 *
 * Queue Model:
 * - evolution_bitrix_queue table: pending sync operations with status, attempts, next_attempt_at
 * - Atomic claiming: UPDATE with WHERE status='pending' to atomically transition to 'processing'
 * - Batch processing: Up to 20 pending items per invocation; controlled backoff between items
 * - Max attempts: 3 retries per item (default); exhausted items marked status='failed'
 *
 * Operations Supported:
 * - create/contact: POST crm.contact.add, update evolution_contacts.bitrix_id on success
 * - create/deal: POST crm.deal.add, update evolution_deals.bitrix_id on success
 * - update/contact: POST crm.contact.update with bitrix_id
 * - update/deal: POST crm.deal.update with bitrix_id
 *
 * Retry Strategy:
 * - Exponential backoff: 5 * 2^(attempts-1) minutes per retry (capped at 60 minutes)
 * - Transient failures (network, HTTP 5xx): Retry scheduled
 * - Fatal failures (missing bitrix_id, Bitrix API error): Exhausted immediately or after max attempts
 * - Between-item delay: 500ms to throttle Bitrix24 API load
 *
 * Stage Mapping:
 * WhatsApp deal stages map to Bitrix24 pipeline stages:
 * - novo_cliente → NEW, novo_pedido → PREPARATION, orcamento_enviado → PREPAYMENT_INVOICE,
 *   pagamento_pendente → EXECUTING, pago → FINAL_INVOICE, pedido_finalizado → WON, perdido → LOSE
 *
 * Telemetry:
 * - Inserts metrics into evolution_performance_metrics (processed count, success, failed, duration_ms)
 * - Used for monitoring queue throughput and sync health
 *
 * Authentication: Service-role or cron-triggered only (requireServiceRoleOrCron).
 * Configuration: BITRIX_WEBHOOK_URL from Supabase vault (getSecret, cached in _bitrixUrl).
 *
 * Response: { success, version: "v3", processed, success, failed, duration_ms, timestamp }
 * Error Responses: 503 if Bitrix24 not configured, 500 on unhandled errors
 */

// Evolution Bitrix24 Sync v3.0 (2026-04-26)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { requireServiceRoleOrCron } from "../_shared/auth.ts";
import { getSecret } from "../_shared/vault.ts";

import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
const SUPABASE_URL = (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL'))!;
const SUPABASE_SERVICE_ROLE_KEY = (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

interface BitrixResult { success: boolean; error?: string; result?: unknown; }
interface QueuePayload { full_name?: string; push_name?: string; phone_number?: string; email?: string; notes?: string; title?: string; value?: number | string; stage?: string; bitrix_id?: number; contact_id?: string; }
interface QueueItem { id: string; status: string; attempts: number; max_attempts: number; operation: "create" | "update"; entity_type: "contact" | "deal"; payload: QueuePayload; local_id?: string; created_at: string; next_attempt_at?: string | null; }

let _bitrixUrl: string | null | undefined;
async function getBitrixUrl(): Promise<string | null> {
  if (_bitrixUrl === undefined) { _bitrixUrl = await getSecret("bitrix_webhook_url"); }
  return _bitrixUrl;
}

/**
 * Invokes Bitrix24 API method via webhook POST.
 *
 * Sends JSON payload to configured Bitrix24 webhook URL with 20-second timeout.
 * Handles HTTP errors, JSON parse errors, and Bitrix API errors uniformly.
 * Response object contains either success=true+result or success=false+error message.
 *
 * @param method - Bitrix24 API method name (e.g., "crm.contact.add", "crm.deal.update")
 * @param params - API request parameters as Record; converted to JSON body
 * @returns BitrixResult with success flag, error message (on failure), or result data (on success)
 */
async function bitrixCall(method: string, params: Record<string, unknown>): Promise<BitrixResult> {
  const url = await getBitrixUrl();
  if (!url) return { success: false, error: "BITRIX_WEBHOOK_URL não configurada" };
  try {
    const r = await fetch(`${url}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params), signal: AbortSignal.timeout(20000) });
    if (!r.ok) return { success: false, error: `HTTP ${r.status}: ${(await r.text()).slice(0,200)}` };
    const d = await r.json();
    if (d.error) return { success: false, error: d.error_description || d.error };
    return { success: true, result: d.result };
  } catch (e) { return { success: false, error: e instanceof Error ? e.message : "network error" }; }
}

const STAGE_MAP: Record<string, string> = { "novo_cliente":"NEW","novo_pedido":"PREPARATION","orcamento_enviado":"PREPAYMENT_INVOICE","pagamento_pendente":"EXECUTING","pago":"FINAL_INVOICE","em_producao":"EXECUTING","pedido_enviado":"EXECUTING","pedido_finalizado":"WON","perdido":"LOSE" };

function toBitrixContact(c: QueuePayload): Record<string, unknown> {
  const bc: Record<string, unknown> = { NAME: c.full_name || c.push_name || "Contato WhatsApp", PHONE: [] as Array<Record<string, string>>, SOURCE_ID: "WHATSAPP" };
  if (c.phone_number) (bc.PHONE as Array<Record<string, string>>).push({ VALUE: c.phone_number, VALUE_TYPE: "MOBILE" });
  if (c.email) bc.EMAIL = [{ VALUE: c.email, VALUE_TYPE: "WORK" }];
  if (c.notes) bc.COMMENTS = c.notes;
  return bc;
}

function toBitrixDeal(d: QueuePayload, contactId?: number): Record<string, unknown> {
  const bd: Record<string, unknown> = { TITLE: d.title || "Pedido WhatsApp", SOURCE_ID: "WHATSAPP" };
  if (d.value) bd.OPPORTUNITY = Number(d.value);
  if (d.stage) bd.STAGE_ID = STAGE_MAP[d.stage] || "NEW";
  if (contactId) bd.CONTACT_ID = contactId;
  if (d.notes) bd.COMMENTS = d.notes;
  return bd;
}

/**
 * Processes pending queue items for Bitrix24 sync.
 *
 * Workflow:
 * 1. Query evolution_bitrix_queue: select up to 20 pending items (status='pending')
 *    where next_attempt_at is null or <= NOW (ready for retry)
 * 2. Filter exhausted items (attempts >= max_attempts); mark status='failed'
 * 3. For each remaining item:
 *    a. Atomically claim: UPDATE status='processing', increment attempts
 *    b. Invoke appropriate Bitrix API (create/update, contact/deal)
 *    c. On success: mark status='completed', update local bitrix_id
 *    d. On failure: schedule retry with exponential backoff OR mark exhausted
 *    e. Throttle with 500ms delay between items (API rate limiting)
 *
 * Exponential Backoff Formula:
 * - backoff_minutes = min(60, 5 * 2^(attempts-1))
 * - next_attempt_at = NOW + backoff_minutes minutes
 *
 * @returns {{ processed, success, failed }} - Statistics for telemetry
 */
async function processQueue() {
  let processed = 0, success = 0, failed = 0;
  const { data, error: selErr } = await supabase.from("evolution_bitrix_queue").select("*").eq("status", "pending").or(`next_attempt_at.is.null,next_attempt_at.lte.${new Date().toISOString()}`).order("created_at").limit(20);
  if (selErr) { console.error("[processQueue] select error:", selErr.message); return { processed: 0, success: 0, failed: 0 }; }
  const rows = (data || []) as QueueItem[];
  const items = rows.filter(i => (i.attempts || 0) < (i.max_attempts || 3));
  const exhaustedIds = rows.filter(i => (i.attempts || 0) >= (i.max_attempts || 3)).map(i => i.id);
  if (exhaustedIds.length > 0) {
    const { error: exErr } = await supabase.from("evolution_bitrix_queue").update({ status: "failed", last_error: "max_attempts exceeded" }).in("id", exhaustedIds).eq("status", "pending");
    if (exErr) console.error("[processQueue] mark exhausted batch:", exErr.message);
  }
  if (!items.length) return { processed: 0, success: 0, failed: 0 };
  for (const item of items) {
    processed++;
    const { count: claimed, error: claimErr } = await supabase.from("evolution_bitrix_queue").update({ status: "processing", attempts: (item.attempts || 0) + 1 }, { count: "exact" }).eq("id", item.id).eq("status", "pending");
    if (claimErr) { console.error(`[processQueue] claim error for ${item.id}:`, claimErr.message); continue; }
    if (!claimed || claimed === 0) continue;
    let result: BitrixResult;
    if (item.operation === "create") {
      if (item.entity_type === "contact") {
        const r = await bitrixCall("crm.contact.add", { fields: toBitrixContact(item.payload) });
        if (r.success) await supabase.from("evolution_contacts").update({ bitrix_id: r.result as number }).eq("id", item.local_id);
        result = r;
      } else {
        let cid: number | undefined;
        if (item.payload?.contact_id) { const { data: c } = await supabase.from("evolution_contacts").select("bitrix_id").eq("id", item.payload.contact_id).maybeSingle(); if (c?.bitrix_id) cid = c.bitrix_id; }
        const r = await bitrixCall("crm.deal.add", { fields: toBitrixDeal(item.payload, cid) });
        if (r.success) await supabase.from("evolution_deals").update({ bitrix_id: r.result as number }).eq("id", item.local_id);
        result = r;
      }
    } else if (item.operation === "update") {
      const bid = item.payload?.bitrix_id;
      if (!bid) { result = { success: false, error: "no bitrix_id" }; }
      else { const method = item.entity_type === "contact" ? "crm.contact.update" : "crm.deal.update"; const fields = item.entity_type === "contact" ? toBitrixContact(item.payload) : toBitrixDeal(item.payload); result = await bitrixCall(method, { id: bid, fields }); }
    } else { result = { success: false, error: `op desconhecida: ${item.operation}` }; }
    if (result.success) { await supabase.from("evolution_bitrix_queue").update({ status: "completed", processed_at: new Date().toISOString(), last_error: null }).eq("id", item.id); success++; }
    else { const att = (item.attempts || 0) + 1; const exh = att >= (item.max_attempts || 3); const bo = Math.min(60, 5 * Math.pow(2, att - 1)); await supabase.from("evolution_bitrix_queue").update({ status: exh ? "failed" : "pending", last_error: result.error?.slice(0,500), next_attempt_at: exh ? null : new Date(Date.now() + bo*60000).toISOString() }).eq("id", item.id); failed++; }
    await new Promise(r => setTimeout(r, 500));
  }
  return { processed, success, failed };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleCorsPreflight(req);
  const authErr = requireServiceRoleOrCron(req);
  if (authErr) return authErr;
  const bitrixUrl = await getBitrixUrl();
  if (!bitrixUrl) return new Response(JSON.stringify({ error: "Bitrix24 não configurado" }), { status: 503, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
  try {
    const start = Date.now();
    const result = await processQueue();
    await supabase.from("evolution_performance_metrics").insert({ metric_date: new Date().toISOString().slice(0, 10), metric_type: "bitrix_sync", metric_value: result.processed, metadata: { ...result, duration_ms: Date.now() - start } }).then(()=>{},()=>{});
    return new Response(JSON.stringify({ success: true, version: "v3", ...result, duration_ms: Date.now() - start, timestamp: new Date().toISOString() }), { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[evolution-bitrix-sync] unhandled error:", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
  }
});