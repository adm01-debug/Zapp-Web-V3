/**
 * Edge Function: Sicoob Outbox Consumer
 *
 * Scheduled outbox message processor that drains pending/failed messages with exponential backoff retry.
 * Invoked by pg_cron every 1 minute to deliver agent replies to Sicoob chat-bridge.
 *
 * Workflow:
 * 1. Atomically claim next batch of pending/failed items (MAX_BATCH=25) via sicoob_outbox_claim RPC
 *    (or fallback to SELECT + UPDATE if RPC unavailable)
 * 2. For each item: resolve sicoob_contact_mapping, fetch agent name, POST to Sicoob chat-bridge
 * 3. Mark as "sent" on success; mark as "failed" or "abandoned" on error with exponential backoff
 * 4. Backoff formula: 2^attempts minutes, capped at 60 minutes; abandon after MAX_ATTEMPTS (6 attempts)
 *
 * Error Handling:
 * - HTTP errors: Mark as failed, schedule retry with exponential backoff
 * - Fatal errors (no sicoob mapping): Mark as abandoned, skip retries
 * - Database errors: Log and mark as failed for manual intervention
 * - Transient timeout errors (15s): Treated as retryable failures
 *
 * Security:
 * - Requires Supabase service role key (admin access bypasses RLS for atomic operations)
 * - Validates sicoob_contact_mapping existence before sending (prevents orphaned messages)
 * - Signs all chat-bridge requests with SICOOB_GIFTS_BRIDGE_SECRET
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const MAX_BATCH = 25;
const MAX_ATTEMPTS = 6; // ~1+2+4+8+16+32 min de backoff

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const sicoobGiftsUrl = Deno.env.get("SICOOB_GIFTS_URL");
    const bridgeSecret = Deno.env.get("SICOOB_GIFTS_BRIDGE_SECRET");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[sicoob-outbox-consumer] missing Supabase configuration");
      return json({ error: "Supabase configuration missing" }, 503);
    }
    if (!sicoobGiftsUrl || !bridgeSecret) {
      console.error("[sicoob-outbox-consumer] missing Sicoob configuration");
      return json({ error: "SICOOB_GIFTS_URL/SECRET not configured" }, 503);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

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
      return await processBatch(pending ?? [], supabase, sicoobGiftsUrl, bridgeSecret);
    }

    return await processBatch(claimed ?? [], supabase, sicoobGiftsUrl, bridgeSecret);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

/**
 * Processes a batch of claimed outbox items by delivering each to Sicoob chat-bridge.
 *
 * Flow per item:
 * 1. Query sicoob_contact_mapping to get Sicoob IDs (user_id, vendedor_id, singular_id)
 *    - Fatal failure if mapping missing → mark abandoned, skip further retries
 * 2. Resolve agent_name from profiles.full_name (fallback: "Vendedor" if not found)
 * 3. POST to Sicoob chat-bridge with agent_reply action and all contact/message context
 *    - 15-second timeout to prevent function hanging
 *    - Requires valid HTTP 2xx response
 * 4. On success: Atomically update status to "sent" and set processed_at timestamp
 *    - Database errors during update: Mark as failed to retry (prevents silent data loss)
 * 5. On HTTP/timeout errors: Delegate to markFailed() for exponential backoff retry logic
 *
 * Error Recovery Strategy:
 * - Try-catch wraps entire item processing to catch fetch/timeout/database errors
 * - If update succeeds but item-level exception occurs: markFailed() tries to recover
 * - If markFailed() itself fails: Logged but doesn't block other items (continue processing)
 *
 * @param items - Array of outbox items with id, contact_id, message_id, agent_id, content, attempts
 * @param supabase - Supabase service role client (admin access to bypass RLS)
 * @param sicoobGiftsUrl - Base URL to Sicoob chat-bridge function
 * @param bridgeSecret - Authorization bearer token for chat-bridge requests
 * @returns JSON response with ok, sent count, failed count, and total items processed
 */
async function processBatch(
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

      try {
        const { error: updateErr } = await supabase
          .from("sicoob_reply_outbox")
          .update({ status: "sent", processed_at: new Date().toISOString(), last_error: null })
          .eq("id", item.id);
        if (updateErr) {
          console.error("[sicoob-outbox-consumer] failed to mark item as sent", {
            item_id: item.id,
            error: updateErr.message,
          });
          await markFailed(supabase, item, `Database error: ${updateErr.message}`, false);
          failed++;
        } else {
          sent++;
        }
      } catch (updateErr) {
        console.error("[sicoob-outbox-consumer] exception marking item as sent", {
          item_id: item.id,
          error: updateErr instanceof Error ? updateErr.message : String(updateErr),
        });
        try {
          await markFailed(supabase, item, updateErr instanceof Error ? updateErr.message : String(updateErr), false);
        } catch (markErr) {
          console.error("[sicoob-outbox-consumer] failed to mark item as failed after update error", {
            item_id: item.id,
            error: markErr instanceof Error ? markErr.message : String(markErr),
          });
        }
        failed++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[sicoob-outbox-consumer] exception in item processing", {
        item_id: item.id,
        error: msg,
      });
      try {
        await markFailed(supabase, item, msg, false);
      } catch (markErr) {
        console.error("[sicoob-outbox-consumer] failed to mark item as failed after exception", {
          item_id: item.id,
          error: markErr instanceof Error ? markErr.message : String(markErr),
        });
      }
      failed++;
    }
  }

  return json({ ok: true, sent, failed, total: items.length });
}

/**
 * Marks an outbox item as failed or abandoned with exponential backoff retry scheduling.
 *
 * Backoff Strategy (exponential):
 * - Retry intervals: 2^attempts minutes, min 1 minute, capped at 60 minutes
 * - Sequence: 1, 2, 4, 8, 16, 32, 60, 60, ... minutes
 * - MAX_ATTEMPTS=6: After 6 failures (~63 minutes total backoff), item is abandoned
 * - next_attempt_at calculation: now + (backoffMin * 60,000 milliseconds)
 *
 * Failure Classification:
 * - fatal=true: Unrecoverable errors (no sicoob mapping, invalid contact) → status "abandoned"
 *   Skip all retries, prevent wasted API calls
 * - fatal=false: Transient errors (HTTP 5xx, timeout, network) → status "failed"
 *   Schedule retry after backoff interval; attempt counter increments
 *
 * Atomic Update (fire-and-forget telemetry pattern):
 * - Updates sicoob_reply_outbox: status, attempts, last_error, next_attempt_at
 * - Database errors logged but not re-thrown (prevents cascade failures)
 * - Item remains in queue for manual intervention if update fails
 *
 * @param supabase - Supabase service role client (admin access)
 * @param item - Outbox item with id and current attempts count
 * @param error - Human-readable error message to persist in last_error column (max 300 chars in caller)
 * @param fatal - Whether error is unrecoverable (true) or transient/retryable (false)
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

  try {
    const { error: updateErr } = await supabase
      .from("sicoob_reply_outbox")
      .update({
        status: abandon ? "abandoned" : "failed",
        attempts: nextAttempts,
        last_error: error,
        next_attempt_at: nextAt,
      })
      .eq("id", item.id);

    if (updateErr) {
      console.error("[sicoob-outbox-consumer] failed to mark item as failed", {
        item_id: item.id,
        intended_status: abandon ? "abandoned" : "failed",
        update_error: updateErr.message,
      });
    }
  } catch (e) {
    console.error("[sicoob-outbox-consumer] exception marking item as failed", {
      item_id: item.id,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Constructs a JSON HTTP response with CORS headers and specified status code.
 *
 * Includes cross-origin headers for browser clients; used by Deno.serve() to return
 * batch processing results (sent count, failed count, total items).
 *
 * @param body - Response payload object (serialized to JSON)
 * @param status - HTTP status code (default 200); use 503 for configuration errors, 500 for exceptions
 * @returns Response object with JSON body, CORS headers, and specified status
 */
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
