/**
 * Talk X Scheduler — Checks for scheduled campaigns that are ready to start
 * Called by pg_cron every minute
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getCorsHeaders, handleCors, Logger } from "../_shared/validation.ts";
import { requireServiceRoleOrCron } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Internal/cron-only — must present service role token or CRON_SECRET header.
  const denied = requireServiceRoleOrCron(req);
  if (denied) return denied;

  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };
  const log = new Logger("talkx-scheduler");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date().toISOString();
    const { data: dueCampaigns, error } = await supabase
      .from("talkx_campaigns")
      .select("id, name, scheduled_at")
      .eq("status", "scheduled")
      .lte("scheduled_at", now);

    if (error) {
      log.error("Error fetching scheduled campaigns", { error: error.message });
      return new Response(JSON.stringify({ error: "Failed to fetch scheduled campaigns" }), { status: 500, headers });
    }

    if (!dueCampaigns || dueCampaigns.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No campaigns due", checked_at: now }),
        { headers }
      );
    }

    const results = [];

    for (const campaign of dueCampaigns) {
      // Atomic claim: only proceed if we can flip status from 'scheduled' → 'processing'.
      // Concurrent cron invocations will fail this update and skip the campaign.
      const { count: claimed } = await supabase
        .from("talkx_campaigns")
        .update({ status: "processing" })
        .eq("id", campaign.id)
        .eq("status", "scheduled")
        .select("id", { count: "exact", head: true });

      if (!claimed || claimed === 0) {
        log.info(`Campaign ${campaign.id} already claimed by another invocation, skipping`);
        continue;
      }

      try {
        const response = await fetch(
          `${supabaseUrl}/functions/v1/talkx-send`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({ campaignId: campaign.id, action: "start" }),
          }
        );
        const result = await response.json();
        results.push({ campaignId: campaign.id, name: campaign.name, success: response.ok, result });
        log.info(`Scheduled campaign started: ${campaign.name} (${campaign.id})`);
      } catch (err) {
        log.error(`Failed to start campaign ${campaign.id}`, { error: err instanceof Error ? err.message : String(err) });
        // Revert status so the campaign can be retried on the next cron tick
        await supabase.from("talkx_campaigns").update({ status: "scheduled" }).eq("id", campaign.id);
        results.push({ campaignId: campaign.id, name: campaign.name, success: false, error: "Failed to start campaign" });
      }
    }

    log.done(200, { started: results.filter((r) => r.success).length });

    return new Response(
      JSON.stringify({
        success: true,
        started: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        details: results,
      }),
      { headers }
    );
  } catch (err) {
    log.error("Scheduler error", { error: err instanceof Error ? err.message : String(err) });
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers }
    );
  }
});
