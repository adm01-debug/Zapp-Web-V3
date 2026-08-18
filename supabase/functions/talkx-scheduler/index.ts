/**
 * Talk X Scheduler — Checks for scheduled campaigns that are ready to start
 * Called by pg_cron every minute
 */
import { createZappAdminClient } from '../_shared/db-client.ts';
import { getCorsHeaders, handleCors, Logger } from "../_shared/validation.ts";
import { requireServiceRoleOrCron } from "../_shared/auth.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  // Internal/cron-only — must present service role token or CRON_SECRET header.
  const denied = requireServiceRoleOrCron(req);
  if (denied) return denied;

  // Contrato talkx-scheduler@v1 (G4): cron sem body → {} aceito.
  const parsed = parseOrReject('talkx-scheduler', CONTRACT_SCHEMAS['talkx-scheduler'], req, await req.json().catch(() => ({})), {
    extraHeaders: getCorsHeaders(req),
  });
  if (parsed.ok === false) return parsed.response;

  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };
  const log = new Logger("talkx-scheduler");

  try {
    const supabase = createZappAdminClient();

    // URL/keys da própria instância para o dispatch interno do talkx-send
    // (mesmo padrão de talkx-control — E61: vars eram usadas SEM declaração,
    // ReferenceError derrubava o disparo de toda campanha agendada).
    const supabaseUrl = (
      Deno.env.get("SELFHOSTED_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL") ?? ""
    ).replace(/\/+$/, "");
    const serviceKey =
      Deno.env.get("SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      "";

    const now = new Date().toISOString();
    const { data: dueCampaigns, error } = await supabase
      .from("talkx_campaigns")
      .select("id, name, scheduled_at")
      .eq("status", "scheduled")
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true })
      .limit(20);

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

    // Each campaign is claimed atomically (per campaign.id), so parallel processing is safe.
    const settled = await Promise.allSettled(
      dueCampaigns.map(async (campaign) => {
        // Atomic claim: only proceed if we can flip status from 'scheduled' → 'processing'.
        // Concurrent cron invocations will fail this update and skip the campaign.
        // E61: count via update(values, { count: "exact" }) — o select() do
        // transform builder (postgrest-js 1.19.2) ignora options; o padrão antigo
        // `.select("id", { count, head })` nunca populava `count` (claim sempre 0).
        const { count: claimed, error: claimError } = await supabase
          .from("talkx_campaigns")
          .update({ status: "processing" }, { count: "exact" })
          .eq("id", campaign.id)
          .eq("status", "scheduled");

        if (claimError) {
          log.error(`Failed to claim campaign ${campaign.id}`, { error: claimError.message });
          return null;
        }
        if (!claimed || claimed === 0) {
          log.info(`Campaign ${campaign.id} already claimed by another invocation, skipping`);
          return null;
        }

        const revertStatus = async () => {
          const { error: revertErr } = await supabase
            .from("talkx_campaigns")
            .update({ status: "scheduled" })
            .eq("id", campaign.id)
            .eq("status", "processing"); // only revert if still in processing state
          if (revertErr) {
            log.error(`Failed to revert campaign ${campaign.id} to scheduled`, { error: revertErr.message });
          }
        };

        try {
          const response = await fetch(
            `${supabaseUrl}/functions/v1/talkx-send`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
              body: JSON.stringify({ campaignId: campaign.id, action: "start" }),
              signal: AbortSignal.timeout(30_000),
            }
          );
          if (!response.ok) {
            const result = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
            log.error(`talkx-send returned ${response.status} for campaign ${campaign.id}`, { result });
            await revertStatus();
            return { campaignId: campaign.id, name: campaign.name, success: false, error: result };
          }
          const result = await response.json();
          log.info(`Scheduled campaign started: ${campaign.name} (${campaign.id})`);
          return { campaignId: campaign.id, name: campaign.name, success: true, result };
        } catch (err) {
          log.error(`Failed to start campaign ${campaign.id}`, { error: err instanceof Error ? err.message : String(err) });
          // Revert status so the campaign can be retried on the next cron tick
          await revertStatus();
          return { campaignId: campaign.id, name: campaign.name, success: false, error: "Failed to start campaign" };
        }
      })
    );

    const results = settled
      .map(r => (r.status === 'fulfilled' ? r.value : null))
      .filter((v): v is NonNullable<typeof v> => v !== null);

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
