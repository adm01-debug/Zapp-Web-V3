/**
 * talkx-control — Controla o estado de campanhas Talk X (start / pause / cancel).
 *
 * Recebe { action, campaignId } do frontend, valida auth de admin/supervisor e
 * atualiza o status da campanha atomicamente.
 *
 *   start  → status = 'sending'; dispara talkx-send em background (fire-and-forget)
 *   pause  → status = 'paused'
 *   cancel → status = 'cancelled'
 *
 * Auth: admin ou supervisor (requireAdminOrSupervisor).
 */
import { createZappAdminClient } from '../_shared/db-client.ts';
import { getCorsHeaders, handleCors, Logger } from "../_shared/validation.ts";
import { requireAdminOrSupervisor } from "../_shared/auth.ts";

type CampaignAction = "start" | "pause" | "cancel";

const STATUS_MAP: Record<CampaignAction, string> = {
  start: "sending",
  pause: "paused",
  cancel: "cancelled",
};

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };
  const log = new Logger("talkx-control", req);

  const authed = await requireAdminOrSupervisor(req);
  if (authed instanceof Response) return authed;

  try {
    const raw = await req.json().catch(() => null);
    if (!raw || typeof raw !== 'object') {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
    }

    const { action, campaignId } = raw as { action?: unknown; campaignId?: unknown };

    if (typeof campaignId !== 'string' || !campaignId) {
      return new Response(JSON.stringify({ error: "campaignId is required" }), { status: 400, headers });
    }
    if (!action || !["start", "pause", "cancel"].includes(action as string)) {
      return new Response(
        JSON.stringify({ error: "action must be one of: start, pause, cancel" }),
        { status: 400, headers }
      );
    }

    const typedAction = action as CampaignAction;
    const admin = createZappAdminClient();

    // Verify campaign exists
    const { data: campaign, error: campErr } = await admin
      .from("talkx_campaigns")
      .select("id, status")
      .eq("id", campaignId)
      .maybeSingle();

    if (campErr) {
      log.error("Campaign lookup error", { error: campErr.message });
      return new Response(JSON.stringify({ error: "Failed to verify campaign" }), { status: 500, headers });
    }
    if (!campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), { status: 404, headers });
    }

    const currentStatus = (campaign as Record<string, unknown>).status as string;

    // Guard against invalid transitions
    if (typedAction === "start" && ["sending", "completed", "cancelled"].includes(currentStatus)) {
      return new Response(
        JSON.stringify({ error: `Campaign cannot be started from status '${currentStatus}'` }),
        { status: 409, headers }
      );
    }
    if (typedAction === "pause" && currentStatus !== "sending") {
      return new Response(
        JSON.stringify({ error: `Campaign cannot be paused from status '${currentStatus}'` }),
        { status: 409, headers }
      );
    }
    if (typedAction === "cancel" && ["completed", "cancelled"].includes(currentStatus)) {
      return new Response(
        JSON.stringify({ error: `Campaign is already ${currentStatus}` }),
        { status: 409, headers }
      );
    }

    const newStatus = STATUS_MAP[typedAction];
    const updatePayload: Record<string, unknown> = { status: newStatus };
    if (typedAction === "start") updatePayload.started_at = new Date().toISOString();
    if (typedAction === "cancel") updatePayload.completed_at = new Date().toISOString();

    const { error: updateErr } = await admin
      .from("talkx_campaigns")
      .update(updatePayload)
      .eq("id", campaignId);

    if (updateErr) {
      log.error("Campaign update error", { error: updateErr.message, action: typedAction });
      return new Response(JSON.stringify({ error: "Failed to update campaign status" }), { status: 500, headers });
    }

    // For start: invoke talkx-send asynchronously (fire-and-forget).
    // We return 200 immediately; the send worker handles the actual delivery loop.
    if (typedAction === "start") {
      const supabaseUrl = (
        Deno.env.get("SELFHOSTED_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ?? ""
      ).replace(/\/+$/, "");
      const serviceKey =
        Deno.env.get("SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY") ??
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

      // Service role key is the standard Supabase pattern for inter-function invocation.
      // X-Internal-Call header lets talkx-send distinguish internal vs external callers.
      const internalSecret = Deno.env.get("TALKX_INTERNAL_SECRET") ?? serviceKey.slice(-16);
      if (supabaseUrl && serviceKey) {
        const sendTask = fetch(`${supabaseUrl}/functions/v1/talkx-send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
            "X-Internal-Call": internalSecret,
          },
          body: JSON.stringify({ campaignId, action: "start" }),
          signal: AbortSignal.timeout(5_000),
        }).catch((err) => {
          log.error("talkx-send dispatch failed", {
            error: err instanceof Error ? err.message : String(err),
            campaignId,
          });
        });

        // Register the background task so the Edge Runtime doesn't kill it on return.
        if (typeof (globalThis as Record<string, unknown>).EdgeRuntime !== "undefined") {
          (globalThis as Record<string, { waitUntil: (p: Promise<unknown>) => void }>).EdgeRuntime
            .waitUntil(sendTask as Promise<unknown>);
        }
      } else {
        log.error("Supabase URL or service key not configured — talkx-send not dispatched");
      }
    }

    log.done(200, { action: typedAction, campaignId, newStatus });

    return new Response(
      JSON.stringify({ success: true, action: typedAction, status: newStatus }),
      { headers }
    );
  } catch (err) {
    log.error("Unexpected error", { error: err instanceof Error ? err.message : String(err) });
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers });
  }
});
