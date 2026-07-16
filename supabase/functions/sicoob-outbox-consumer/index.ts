// Sprint 2 — Consumidor da outbox Sicoob.
// Invocado por pg_cron a cada 1 min. Drena itens pendentes com backoff exponencial.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { requireServiceRoleOrCron } from "../_shared/auth.ts";

const MAX_BATCH = 25;
const MAX_ATTEMPTS = 6; // ~1+2+4+8+16+32 min de backoff

/**
 * Edge Function: Sicoob Outbox Consumer — Batch Message Delivery with Exponential Backoff
 *
 * Processes pending and failed messages from sicoob_reply_outbox table, delivering them to Sicoob
 * chat-bridge API via POST. Implements atomic batch claiming (via RPC or SELECT+UPDATE fallback) to
 * prevent concurrent processing of the same outbox item across multiple invocations.
 *
 * Retry Strategy:
 * - Exponential backoff: 2^attempts minutes, capped at 60 minutes per retry
 * - Abandons after 6 attempts (cumulative ~63 minutes backoff: 1+2+4+8+16+32)
 * - Fatal errors (no Sicoob mapping, missing bridgeSecret config) marked abandoned immediately
 * - Transient failures (HTTP 5xx, timeouts) retry with backoff
 *
 * Flow:
 * 1. Claim up to 25 pending/failed items atomically via sicoob_outbox_claim RPC (with SELECT+UPDATE fallback)
 * 2. For each item: fetch contact Sicoob mapping (sicoob_contact_mapping), resolve agent name
 * 3. POST to Sicoob chat-bridge with 15s timeout; extract agent_id, message_id, content, Sicoob IDs
 * 4. Mark as sent (status=sent, last_error=null) or failed (status=failed/abandoned, next_attempt_at, last_error)
 * 5. Return summary: { ok: true, sent, failed, total }
 *
 * Error Handling:
 * - Missing Sicoob mapping: fatal → status=abandoned
 * - HTTP errors: log error text (first 300 chars) → status=failed with retry scheduling
 * - Network timeout (15s AbortSignal): transient → status=failed with retry scheduling
 * - Max attempts reached: status=abandoned, no further retries
 *
 * Dependencies:
 * - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: Environment configuration
 * - SICOOB_GIFTS_URL, SICOOB_GIFTS_BRIDGE_SECRET: External API credentials (required)
 * - sicoob_reply_outbox table: source of pending messages
 * - sicoob_contact_mapping table: maps internal contact_id to Sicoob user/vendedor/singular IDs
 * - profiles table: agent full_name lookup for customer-facing agent name resolution
 * - sicoob_outbox_claim RPC: atomic batch claiming with lock semantics (or fallback to SELECT+UPDATE)
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPreflight(req);

  const authErr = requireServiceRoleOrCron(req);
  if (authErr) return authErr;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sicoobGiftsUrl = Deno.env.get("SICOOB_GIFTS_URL");
    const bridgeSecret = Deno.env.get("SICOOB_GIFTS_BRIDGE_SECRET");
    if (!sicoobGiftsUrl || !bridgeSecret) {
      return json(req, { error: "SICOOB_GIFTS_URL/SECRET not configured" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, { db: { schema: "zapp" } });

    // Claim batch atomicamente (evita processamento concorrente)
    const { data: claimed, error: claimErr } = await supabase.rpc("sicoob_outbox_claim", {
      p_limit: MAX_BATCH,
    });

    if (claimErr) {
      // Fallback: sem RPC dedicada, faz SELECT + UPDATE simples
      const { data: pending } = await supabase
        .from("sicoob_reply_outbox")
        .select("id, contact_id, message_id, agent_id, content, attempts")
        .in("status", ["pending", "failed"])
        .lte("next_attempt_at", new Date().toISOString())
        .order("next_attempt_at", { ascending: true })
        .limit(MAX_BATCH);
      return await processBatch(req, pending ?? [], supabase, sicoobGiftsUrl, bridgeSecret);
    }

    return await processBatch(req, claimed ?? [], supabase, sicoobGiftsUrl, bridgeSecret);
  } catch (e) {
    return json(req, { error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

/**
 * Processes a batch of Sicoob outbox items, delivering each via chat-bridge API.
 *
 * For each item:
 * 1. Fetch sicoob_contact_mapping by contact_id (must exist; otherwise mark fatal failure)
 * 2. Resolve agent_name from profiles.full_name if agent_id provided; default to "Vendedor"
 * 3. POST to Sicoob chat-bridge (/functions/v1/chat-bridge) with:
 *    - Bearer token: bridgeSecret
 *    - Payload: action, contact_id, message_id, agent_id, agent_name, content, Sicoob IDs
 *    - 15s timeout window (AbortSignal)
 * 4. On success (200 OK): mark status=sent, processed_at, last_error=null
 * 5. On failure: call markFailed() to schedule exponential backoff retry or abandon
 *
 * Error Modes (Non-Fatal Retryable):
 * - HTTP 4xx/5xx responses: extract response text (first 300 chars), mark failed with backoff
 * - Network timeout: mark failed with backoff
 * - Fetch exceptions (AbortError, network failures): caught and marked failed with backoff
 *
 * Error Modes (Fatal, Abandoned):
 * - No sicoob_contact_mapping found for contact_id: mark abandoned immediately (no mapping exists)
 * - Catch-all: mark failed with backoff (will eventually abandon after MAX_ATTEMPTS)
 *
 * Returns: { ok: true, sent: count, failed: count, total: count }
 *
 * @param req - Incoming HTTP request (used implicitly for json response helper)
 * @param items - Array of outbox items claimed for processing
 * @param supabase - Supabase client with service-role permissions
 * @param sicoobGiftsUrl - Base URL of Sicoob chat-bridge (e.g., https://gifts.sicoob.com.br)
 * @param bridgeSecret - Bearer token for chat-bridge authentication
 */
async function processBatch(
  req: Request,
  items: Array<{ id: string; contact_id: string; message_id: string; agent_id: string | null; content: string; attempts: number }>,
  supabase: ReturnType<typeof createClient>,
  sicoobGiftsUrl: string,
  bridgeSecret: string,
) {
  let sent = 0, failed = 0;

  for (const item of items) {
    try {
      const { data: mapping } = await supabase
        .from("sicoob_contact_mapping")
        .select("sicoob_user_id, sicoob_vendedor_id, sicoob_singular_id")
        .eq("contact_id", item.contact_id)
        .single();

      if (!mapping) {
        await markFailed(supabase, item, "no sicoob mapping", true);
        failed++;
        continue;
      }

      let agentName = "Vendedor";
      if (item.agent_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", item.agent_id)
          .single();
        if (profile?.full_name) agentName = profile.full_name;
      }

      const resp = await fetch(`${sicoobGiftsUrl}/functions/v1/chat-bridge`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bridgeSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "agent_reply",
          contact_id: item.contact_id,
          message_id: item.message_id,
          agent_id: item.agent_id,
          agent_name: agentName,
          content: item.content,
          sicoob_user_id: mapping.sicoob_user_id,
          sicoob_vendedor_id: mapping.sicoob_vendedor_id,
          sicoob_singular_id: mapping.sicoob_singular_id,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!resp.ok) {
        const txt = (await resp.text().catch(() => "")).slice(0, 300);
        await markFailed(supabase, item, `HTTP ${resp.status}: ${txt}`, false);
        failed++;
        continue;
      }

      await supabase
        .from("sicoob_reply_outbox")
        .update({ status: "sent", processed_at: new Date().toISOString(), last_error: null })
        .eq("id", item.id);
      sent++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await markFailed(supabase, item, msg, false);
      failed++;
    }
  }

  return json(req, { ok: true, sent, failed, total: items.length });
}

/**
 * Marks an outbox item as failed or abandoned with exponential backoff retry scheduling.
 *
 * Exponential Backoff Retry Schedule:
 * - attempts=1: 2^1 = 2 minutes until next_attempt_at
 * - attempts=2: 2^2 = 4 minutes
 * - attempts=3: 2^3 = 8 minutes
 * - attempts=4: 2^4 = 16 minutes
 * - attempts=5: 2^5 = 32 minutes
 * - attempts=6: 2^6 = 64 → capped at 60 minutes (Math.min)
 *
 * Abandonment Logic:
 * - If fatal=true: status=abandoned immediately (no retry; e.g., no Sicoob mapping exists)
 * - Else if nextAttempts >= MAX_ATTEMPTS (6): status=abandoned (max retries exhausted)
 * - Otherwise: status=failed, schedule retry at next_attempt_at
 *
 * Updates sicoob_reply_outbox with:
 * - status: 'abandoned' | 'failed'
 * - attempts: incremented by 1
 * - last_error: error message (first occurrence of failure reason)
 * - next_attempt_at: ISO timestamp for scheduler to re-claim and retry
 *
 * Side Effects:
 * - Database update to sicoob_reply_outbox (upsert-like behavior via eq('id', item.id))
 * - No throw on update failure (silent catch to prevent loop disruption)
 *
 * @param supabase - Supabase client with service-role permissions
 * @param item - Outbox item record with id and current attempts count
 * @param error - Failure reason or error message to persist
 * @param fatal - If true, mark abandoned immediately without retry scheduling
 */
async function markFailed(
  supabase: ReturnType<typeof createClient>,
  item: { id: string; attempts: number },
  error: string,
  fatal: boolean,
) {
  const nextAttempts = item.attempts + 1;
  const abandon = fatal || nextAttempts >= MAX_ATTEMPTS;
  const backoffMin = Math.min(Math.pow(2, nextAttempts), 60);
  const nextAt = new Date(Date.now() + backoffMin * 60_000).toISOString();

  await supabase
    .from("sicoob_reply_outbox")
    .update({
      status: abandon ? "abandoned" : "failed",
      attempts: nextAttempts,
      last_error: error,
      next_attempt_at: nextAt,
    })
    .eq("id", item.id);
}

/**
 * Wraps a response body as JSON with CORS headers and 200/5xx status.
 *
 * Applies CORS headers (Access-Control-Allow-Origin, etc.) from getCorsHeaders(req)
 * to enable cross-origin preflight and actual requests from browser clients.
 * Sets Content-Type: application/json for proper media type signaling.
 *
 * Used throughout Sicoob outbox consumer for error responses (4xx/5xx) and success summaries.
 *
 * @param req - Incoming HTTP request (used to extract CORS origin for header generation)
 * @param body - Any serializable value; typically { error, ok, sent, failed, total, status, elapsed_ms }
 * @param status - HTTP status code (default 200 for success; 400/500 for errors)
 * @returns Response with JSON body, CORS headers, and specified status
 */
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}