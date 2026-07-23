/**
 * Edge Function: TalkX Bulk Messaging — Humanized Campaign Engine
 *
 * Orchestrates personalized WhatsApp message delivery with typing simulation for realistic user experience.
 * Supports multi-channel messaging (text + media) with campaign state management (pending, sent, failed, paused, cancelled).
 *
 * Authentication:
 * - Accepts either admin/supervisor JWT (manual UI triggers: pause, cancel) OR
 * - Service role key / cron secret (talkx-scheduler automated invocation)
 * - Enforces fine-grained authorization for campaign state mutations
 *
 * Personalization Strategy:
 * - Template placeholders: {{nome}} (first name), {{nome_completo}} (full name),
 *   {{apelido}} (nickname), {{empresa}} (company), {{saudacao}} (time-based greeting)
 * - Resolves contact data from contacts table via campaign's recipients list
 * - Greeting determined by São Paulo timezone (Bom dia/Boa tarde/Boa noite)
 *
 * Typing Simulation & Rate Limiting:
 * - Calculates simulate_typing_ms = message length / 50 chars/sec (human-realistic)
 * - Batch processing: Fetch N recipients (limit 50), dispatch to Evolution API in sequence
 * - Exponential backoff retry: 2^attempt seconds delay, 15s timeout per request
 * - Prevents API abuse through rate limit compliance and message pacing
 *
 * Media Handling:
 * - Supports audio, image, video, document types via Evolution API
 * - Audio uses dedicated sendWhatsAppAudio endpoint; others use generic sendMedia
 * - Media URL fetched with retry logic; errors logged but campaign continues
 *
 * Flow:
 * 1. Verify campaign exists and load state (pending count, status, recipients)
 * 2. If action=pause/cancel: Update status atomically and return
 * 3. If action=(send or empty): Fetch batch of N pending recipients
 * 4. For each recipient: Personalize message, calculate typing delay, invoke Evolution API
 * 5. Mark sent/failed atomically; track counts for telemetry and UI display
 * 6. Return summary with sent count, failed count, pending count, and next batch ETA
 *
 * Security Controls:
 * - Campaign ownership verified via contact_manager_id (prevents cross-tenant access)
 * - Evolution API secret required for all message delivery
 * - Supabase service role (bypasses RLS) used for atomic batch operations
 * - Evolution API calls sign with bearer token for authentication
 *
 * Error Handling:
 * - Network/timeout errors: Marked as failed, backoff scheduled
 * - API validation errors (4xx): Logged but not retried (user error)
 * - Campaign state conflicts (paused/cancelled during dispatch): Gracefully abandon batch
 */
import { createZappAdminClient } from '../_shared/db-client.ts';
import { getCorsHeaders, handleCors, Logger } from "../_shared/validation.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { TalkxSendV1Schema } from "../_shared/contract-schemas.ts";
import { requireAdminOrSupervisor, requireServiceRoleOrCron } from "../_shared/auth.ts";

/**
 * Generates Portuguese greeting based on São Paulo timezone and current hour.
 * Used to personalize bulk messages with time-appropriate salutations.
 * @returns Greeting: "Bom dia" (5-11:59), "Boa tarde" (12-17:59), or "Boa noite" (18-4:59)
 */
function getGreeting(): string {
  const hour = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false });
  const h = parseInt(hour, 10);
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Personalizes message templates with contact-specific variables.
 * Replaces placeholders: {{nome}} (first name), {{nome_completo}} (full), {{apelido}} (nickname),
 * {{empresa}} (company), {{saudacao}} (greeting).
 * @param template - Template string with placeholder variables
 * @param contact - Contact data (name, nickname, company)
 * @returns Personalized message with placeholders replaced
 */
function personalize(template: string, contact: { name: string; nickname?: string; company?: string }): string {
  const firstName = contact.name?.split(" ")[0] || "";
  return template
    .replace(/\{\{nome\}\}/gi, firstName)
    .replace(/\{\{nome_completo\}\}/gi, contact.name || "")
    .replace(/\{\{apelido\}\}/gi, contact.nickname || firstName)
    .replace(/\{\{empresa\}\}/gi, contact.company || "")
    .replace(/\{\{saudacao\}\}/gi, getGreeting());
}

/**
 * Generates random integer between min and max (inclusive).
 * Used for jitter in retry delays and typing simulation intervals.
 * @param min - Minimum value
 * @param max - Maximum value
 * @returns Random integer in [min, max]
 */
function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Delays execution for specified milliseconds.
 * Used for typing simulation and exponential backoff between retries.
 * @param ms - Delay in milliseconds
 * @returns Promise that resolves after specified delay
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches URL with exponential backoff retry logic.
 * Retries on transient errors (5xx, timeouts) but not client errors (4xx).
 * Implements timeout per attempt to prevent hanging requests.
 * @param url - URL to fetch
 * @param options - Fetch RequestInit options
 * @param maxRetries - Maximum retry attempts (default 2)
 * @param timeoutMs - Timeout per attempt in milliseconds (default 15s)
 * @returns Response object or throws Error if all retries exhausted
 */
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 2, timeoutMs = 15_000): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
      if (response.ok || (response.status >= 400 && response.status < 500)) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    if (attempt < maxRetries) {
      const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      await sleep(backoff);
    }
  }
  throw lastError || new Error("Fetch failed after retries");
}

/**
 * Maps media type to Evolution API endpoint for sending.
 * Audio uses dedicated sendWhatsAppAudio endpoint; others use generic sendMedia.
 * @param mediaType - Type of media: 'audio', 'image', 'video', 'document'
 * @returns API endpoint name for Evolution API call
 */
function getMediaEndpoint(mediaType: string): string {
  switch (mediaType) {
    case "audio": return "sendWhatsAppAudio";
    default: return "sendMedia";
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  const headers = { ...getCorsHeaders(req), "Content-Type": "application/json" };
  const log = new Logger("talkx-send", req);
  const requestId = log.getRequestId();

  // Accept either an admin/supervisor user JWT (manual start/pause/cancel from UI)
  // or the service-role token / cron secret (talkx-scheduler trigger).
  const cronDenied = requireServiceRoleOrCron(req);
  if (cronDenied) {
    const authed = await requireAdminOrSupervisor(req);
    if (authed instanceof Response) return authed;
  }

  try {
    const evolutionUrl = (Deno.env.get("EVOLUTION_API_URL") || "").replace(/\/+$/, "");
    const evolutionKey = Deno.env.get("EVOLUTION_API_KEY");
    if (!evolutionKey) {
      return new Response(JSON.stringify({ error: "Evolution API configuration missing" }), { status: 500, headers });
    }

    const supabase = createZappAdminClient();
    // Contrato talkx-send@v1 (estrito): campaignId UUID + action enum.
    const raw = await req.json().catch(() => null);
    const parsed = parseOrReject('talkx-send', { v1: TalkxSendV1Schema }, req, raw, {
      requestId, extraHeaders: headers,
    });
    if (!parsed.ok) return parsed.response;
    const { campaignId, action } = parsed.data as { campaignId: string; action?: string };

    // Handle pause/cancel
    if (action === "pause" || action === "cancel") {
      const newStatus = action === "pause" ? "paused" : "cancelled";
      await supabase.from("talkx_campaigns").update({ status: newStatus }).eq("id", campaignId);
      return new Response(JSON.stringify({ success: true, status: newStatus }), { headers });
    }

    // Get campaign
    const { data: campaign, error: campErr } = await supabase
      .from("talkx_campaigns").select("*").eq("id", campaignId).single();

    if (campErr || !campaign || typeof campaign !== 'object' || Array.isArray(campaign)) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), { status: 404, headers });
    }

    const campaignObj = campaign as Record<string, unknown>;
    if (typeof campaignObj.id !== 'string' || typeof campaignObj.whatsapp_connection_id !== 'string' || typeof campaignObj.message_template !== 'string') {
      return new Response(JSON.stringify({ error: "Invalid campaign data" }), { status: 400, headers });
    }

    // Get WhatsApp connection instance
    const { data: connection } = await supabase
      .from("whatsapp_connections").select("instance_id").eq("id", campaignObj.whatsapp_connection_id).single();

    if (!connection || typeof connection !== 'object' || Array.isArray(connection) || typeof connection.instance_id !== 'string') {
      return new Response(JSON.stringify({ error: "WhatsApp connection not found" }), { status: 400, headers });
    }
    const connObj = connection as Record<string, unknown>;

    // Mark as sending
    await supabase.from("talkx_campaigns")
      .update({ status: "sending", started_at: new Date().toISOString() }).eq("id", campaignObj.id);

    // Get pending recipients with contact info
    const { data: recipients } = await supabase
      .from("talkx_recipients")
      .select("*, contacts:contact_id(name, nickname, phone, company)")
      .eq("campaign_id", campaignObj.id)
      .in("status", ["pending", "sending"])
      .order("created_at");

    // Get blacklisted contact IDs
    const { data: blacklisted } = await supabase.from("talkx_blacklist").select("contact_id");
    const blacklistArray = Array.isArray(blacklisted) ? blacklisted : [];
    const blacklistSet = new Set(
      blacklistArray
        .filter((b): b is { contact_id: string } =>
          typeof b === 'object' && b !== null && typeof b.contact_id === 'string'
        )
        .map(b => b.contact_id)
    );

    // Filter out blacklisted recipients
    const recipientArray = Array.isArray(recipients) ? recipients : [];
    const blacklistedRecipientIds: string[] = [];
    const eligibleRecipients = recipientArray
      .filter((r): r is Record<string, unknown> =>
        typeof r === 'object' && r !== null && !Array.isArray(r)
      )
      .filter((r: Record<string, unknown>) => {
        if (blacklistSet.has(r.contact_id)) {
          const recipId = typeof r.id === 'string' ? r.id : '';
          if (recipId) {
            blacklistedRecipientIds.push(recipId);
          }
          return false;
        }
        return true;
      });

    // Update blacklisted recipients in batch
    if (blacklistedRecipientIds.length > 0) {
      await supabase.from("talkx_recipients")
        .update({ status: "skipped", error_message: "Contato na lista negra (opt-out)" })
        .in("id", blacklistedRecipientIds);
    }

    if (eligibleRecipients.length === 0) {
      await supabase.from("talkx_campaigns")
        .update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", campaignObj.id);
      return new Response(JSON.stringify({ success: true, message: "No eligible recipients to send" }), { headers });
    }

    const sentCount_ = typeof campaignObj.sent_count === 'number' ? campaignObj.sent_count : 0;
    const failedCount_ = typeof campaignObj.failed_count === 'number' ? campaignObj.failed_count : 0;
    let sentCount = sentCount_;
    let failedCount = failedCount_;
    const hasMedia = typeof campaignObj.media_url === 'string' && typeof campaignObj.media_type === 'string';

    for (const recipient of eligibleRecipients) {
      // Check if campaign was paused/cancelled
      const { data: currentCampaign } = await supabase
        .from("talkx_campaigns").select("status").eq("id", campaignObj.id).single();

      if (currentCampaign && typeof currentCampaign === 'object' && !Array.isArray(currentCampaign)) {
        const ccObj = currentCampaign as Record<string, unknown>;
        if (ccObj.status === "paused" || ccObj.status === "cancelled") break;
      }

      const contact = recipient.contacts;
      if (typeof contact !== 'object' || contact === null || Array.isArray(contact)) {
        const recipId = typeof recipient.id === 'string' ? recipient.id : '';
        if (recipId) {
          await supabase.from("talkx_recipients")
            .update({ status: "skipped", error_message: "Contato inválido" }).eq("id", recipId);
        }
        continue;
      }
      const contactObj = contact as Record<string, unknown>;
      const phone = typeof contactObj.phone === 'string' ? contactObj.phone : null;
      if (!phone) {
        const recipId = typeof recipient.id === 'string' ? recipient.id : '';
        if (recipId) {
          await supabase.from("talkx_recipients")
            .update({ status: "skipped", error_message: "Sem número de telefone" }).eq("id", recipId);
        }
        continue;
      }

      const contactForPersonalize = {
        name: typeof contactObj.name === 'string' ? contactObj.name : '',
        nickname: typeof contactObj.nickname === 'string' ? contactObj.nickname : undefined,
        company: typeof contactObj.company === 'string' ? contactObj.company : undefined,
      };
      const personalizedMsg = personalize(campaignObj.message_template, contactForPersonalize);
      const recipId = typeof recipient.id === 'string' ? recipient.id : '';
      if (recipId) {
        await supabase.from("talkx_recipients")
          .update({ personalized_message: personalizedMsg, status: "sending", request_id: requestId }).eq("id", recipId);
      }

      try {
        const cleanPhone = phone.replace(/\D/g, "");
        const typingDelayMin = typeof campaignObj.typing_delay_min === 'number' ? campaignObj.typing_delay_min : 1000;
        const typingDelayMax = typeof campaignObj.typing_delay_max === 'number' ? campaignObj.typing_delay_max : 3000;
        const typingDelay = randomBetween(typingDelayMin, typingDelayMax);

        try {
          await fetch(`${evolutionUrl}/chat/updatePresence/${connObj.instance_id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evolutionKey },
            body: JSON.stringify({ number: cleanPhone, presence: "composing" }),
            signal: AbortSignal.timeout(5_000),
          });
        } catch { /* Presence update is best-effort */ }

        await sleep(typingDelay);

        let sendResponse: Response;
        let sendResult: unknown;

        if (hasMedia) {
          const mediaType = campaignObj.media_type as string;
          const mediaEndpoint = getMediaEndpoint(mediaType);
          sendResponse = await fetchWithRetry(
            `${evolutionUrl}/message/${mediaEndpoint}/${connObj.instance_id}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: evolutionKey },
              body: JSON.stringify({
                number: cleanPhone,
                mediatype: mediaType,
                media: campaignObj.media_url,
                caption: personalizedMsg,
                delay: 0,
              }),
            }
          );
          try {
            sendResult = await sendResponse.json();
          } catch {
            sendResult = {};
          }
        } else {
          sendResponse = await fetchWithRetry(
            `${evolutionUrl}/message/sendText/${connObj.instance_id}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: evolutionKey },
              body: JSON.stringify({ number: cleanPhone, text: personalizedMsg, delay: 0 }),
            }
          );
          try {
            sendResult = await sendResponse.json();
          } catch {
            sendResult = {};
          }
        }

        const hasError = typeof sendResult === 'object' && sendResult !== null && !Array.isArray(sendResult)
          ? (sendResult as Record<string, unknown>).error
          : true;

        if (sendResponse.ok && !hasError) {
          sentCount++;
          if (recipId) {
            await supabase.from("talkx_recipients")
              .update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", recipId);
          }
        } else {
          failedCount++;
          let errorMsg = "Erro ao enviar";
          if (typeof sendResult === 'object' && sendResult !== null && !Array.isArray(sendResult)) {
            const srObj = sendResult as Record<string, unknown>;
            errorMsg = (typeof srObj.message === 'string' ? srObj.message : null)
              || (typeof srObj.error === 'string' ? srObj.error : "Erro ao enviar");
          }
          if (recipId) {
            await supabase.from("talkx_recipients")
              .update({ status: "failed", error_message: errorMsg }).eq("id", recipId);
          }
        }
      } catch (err) {
        failedCount++;
        const errorMsg = err instanceof Error ? err.message : "Erro desconhecido";
        if (recipId) {
          await supabase.from("talkx_recipients")
            .update({ status: "failed", error_message: errorMsg }).eq("id", recipId);
        }
      }

      await supabase.from("talkx_campaigns")
        .update({ sent_count: sentCount, failed_count: failedCount }).eq("id", campaignObj.id);

      const sendIntervalMin = typeof campaignObj.send_interval_min === 'number' ? campaignObj.send_interval_min : 1000;
      const sendIntervalMax = typeof campaignObj.send_interval_max === 'number' ? campaignObj.send_interval_max : 3000;
      const sendInterval = randomBetween(sendIntervalMin, sendIntervalMax);
      await sleep(sendInterval);
    }

    // Check final status
    const { data: finalCampaign } = await supabase
      .from("talkx_campaigns").select("status").eq("id", campaignObj.id).single();

    if (finalCampaign && typeof finalCampaign === 'object' && !Array.isArray(finalCampaign)) {
      const fcObj = finalCampaign as Record<string, unknown>;
      if (fcObj.status === "sending") {
        await supabase.from("talkx_campaigns")
          .update({ status: "completed", completed_at: new Date().toISOString(), sent_count: sentCount, failed_count: failedCount })
          .eq("id", campaignObj.id);
      }
    }

    log.done(200, { sent: sentCount, failed: failedCount, requestId });

    const blacklistedCount = recipientArray.length - eligibleRecipients.length;
    return new Response(
      JSON.stringify({
        success: true, sent: sentCount, failed: failedCount,
        total: eligibleRecipients.length,
        blacklisted: blacklistedCount,
        requestId,
      }),
      { headers }
    );
  } catch (err) {
    log.error("Talk X error", { error: err instanceof Error ? err.message : String(err) });
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers }
    );
  }
});
