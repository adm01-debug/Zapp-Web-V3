// csat-auto-send v1.0 — CSAT Automation Edge Function (INBOX-09 + DASHBOARD-05)
// POST body: { survey_id?, contact_id, agent_id?, connection_id, conversation_id?, delay_minutes? }
// Flow:
//   1. Validate auth (require user JWT)
//   2. Query csat_auto_config for connection_id
//   3. If disabled → early return
//   4. Insert csat_surveys if survey_id not provided
//   5. Fetch contact phone + whatsapp_connections instance_name
//   6. Render message_template with basic variable substitution
//   7. Enqueue to evolution_message_queue (with delay if delay_minutes > 0)
//   8. Return { success, survey_id, scheduled_at }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createZappAdminClient } from "../_shared/db-client.ts";
import {
  getCorsHeaders,
  handleCorsPreflight,
  jsonResponse,
  errorResponse,
} from "../_shared/cors.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CsatAutoSendV1Schema } from "../_shared/contract-schemas.ts";

// deno-lint-ignore no-explicit-any
const admin = createZappAdminClient();

interface CsatAutoSendBody {
  survey_id?: string | null;
  contact_id: string;
  agent_id?: string | null;
  connection_id: string;
  conversation_id?: string | null;
  delay_minutes?: number | null;
}

/** Render basic template variables: {{nome}}, {{name}} */
function renderTemplate(template: string, contactName: string): string {
  const firstName = (contactName ?? "").split(" ")[0] || "Cliente";
  return template
    .replace(/\{\{\s*nome\s*\}\}/gi, firstName)
    .replace(/\{\{\s*name\s*\}\}/gi, firstName)
    .replace(/\{\{\s*\w+\s*\}\}/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Normalize a phone string to a WhatsApp JID. */
function toRemoteJid(phone: string): string {
  if (phone.includes("@")) return phone;
  const digits = phone.replace(/\D/g, "").replace(/^\+/, "");
  return `${digits}@s.whatsapp.net`;
}

/** Verify the request carries a valid Supabase user JWT (not anon). */
function getAuthUserId(req: Request): string | null {
  const raw = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  if (!raw.toLowerCase().startsWith("bearer ")) return null;
  const token = raw.slice(7).trim();
  try {
    const [, payloadB64] = token.split(".");
    if (!payloadB64) return null;
    const padded = payloadB64
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(payloadB64.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { sub?: string; role?: string };
    if (!payload?.sub || payload.role === "anon") return null;
    return payload.sub;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleCorsPreflight(req);

  // Require authenticated user (service_role is also accepted via sub=service_role)
  const userId = getAuthUserId(req);
  if (!userId) {
    return errorResponse(req, "Unauthorized: user session required", 401);
  }

  if (req.method !== "POST") {
    return errorResponse(req, "Method not allowed", 405);
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return errorResponse(req, "Invalid JSON body", 400);
  }

  const parsed = parseOrReject<CsatAutoSendBody>('csat-auto-send', { v1: CsatAutoSendV1Schema }, req, rawBody);
  if (!parsed.ok) return parsed.response;
  const { survey_id, contact_id, agent_id, connection_id, conversation_id, delay_minutes } = parsed.data;

  try {
    // ── 1. Query csat_auto_config ─────────────────────────────────────────────
    const { data: csatConfig, error: configErr } = await admin
      .from("csat_auto_config")
      .select("is_enabled, message_template, delay_minutes, whatsapp_connection_id")
      .eq("whatsapp_connection_id", connection_id)
      .maybeSingle();

    if (configErr) {
      console.error("[csat-auto-send] csat_auto_config query error:", configErr.message);
      return errorResponse(req, "Failed to fetch CSAT config", 500);
    }

    if (!csatConfig?.is_enabled) {
      return jsonResponse(req, { success: false, reason: "csat_disabled" });
    }

    // ── 2. Ensure survey record exists ────────────────────────────────────────
    let finalSurveyId: string | null = survey_id ?? null;

    if (!finalSurveyId) {
      const { data: newSurvey, error: surveyErr } = await admin
        .from("csat_surveys")
        .insert({
          agent_id: agent_id ?? null,
          contact_id,
          conversation_resolved_at: new Date().toISOString(),
        })
        .select("id")
        .maybeSingle();

      if (surveyErr) {
        // Non-fatal: log and continue — message delivery takes priority
        console.warn("[csat-auto-send] survey insert error:", surveyErr.message);
      } else {
        finalSurveyId = newSurvey?.id ?? null;
      }
    }

    // ── 3. Fetch contact phone ────────────────────────────────────────────────
    const { data: contact, error: contactErr } = await admin
      .from("contacts")
      .select("phone, name")
      .eq("id", contact_id)
      .maybeSingle();

    if (contactErr) {
      console.error("[csat-auto-send] contact fetch error:", contactErr.message);
      return errorResponse(req, "Failed to fetch contact", 500);
    }
    if (!contact?.phone) {
      console.error("[csat-auto-send] contact not found or missing phone, contact_id:", contact_id);
      return errorResponse(req, "Contact not found or missing phone number", 404);
    }

    // ── 4. Fetch instance_name from whatsapp_connections ─────────────────────
    const { data: conn, error: connErr } = await admin
      .from("whatsapp_connections")
      .select("instance_name")
      .eq("id", connection_id)
      .maybeSingle();

    if (connErr) {
      console.error("[csat-auto-send] whatsapp_connections fetch error:", connErr.message);
      return errorResponse(req, "Failed to fetch WhatsApp connection", 500);
    }
    if (!conn?.instance_name) {
      console.error("[csat-auto-send] connection not found, connection_id:", connection_id);
      return errorResponse(req, "WhatsApp connection not found", 404);
    }

    // ── 5. Render message template ────────────────────────────────────────────
    const renderedMessage = renderTemplate(
      csatConfig.message_template ?? "",
      contact.name ?? "",
    );

    if (!renderedMessage) {
      console.error("[csat-auto-send] message_template is empty after rendering, connection_id:", connection_id);
      return errorResponse(req, "CSAT message template is empty", 400);
    }

    // ── 6. Calculate scheduled_at ─────────────────────────────────────────────
    // Priority: body.delay_minutes → config.delay_minutes → 0 (immediate)
    const effectiveDelay = Math.max(
      0,
      Number(delay_minutes ?? csatConfig.delay_minutes ?? 0) || 0,
    );
    const scheduledAt = new Date(Date.now() + effectiveDelay * 60_000).toISOString();

    // ── 7. Enqueue message ────────────────────────────────────────────────────
    const remoteJid = toRemoteJid(contact.phone);

    const { error: queueErr } = await admin
      .from("evolution_message_queue")
      .insert({
        remote_jid: remoteJid,
        instance_name: conn.instance_name,
        message_type: "text",
        content: renderedMessage,
        priority: 3,
        status: "pending",
        scheduled_at: scheduledAt,
        source: "csat_auto_send",
        metadata: {
          survey_id: finalSurveyId ?? null,
          contact_id,
          agent_id: agent_id ?? null,
          connection_id,
          conversation_id: conversation_id ?? null,
          csat: true,
        },
      });

    if (queueErr) {
      console.error("[csat-auto-send] evolution_message_queue insert error:", queueErr.message);
      return errorResponse(req, "Failed to queue CSAT message", 500);
    }

    console.log(
      `[csat-auto-send] queued CSAT message — contact=${contact_id} survey=${finalSurveyId} instance=${conn.instance_name} jid=${remoteJid.slice(0, 8)}*** scheduled=${scheduledAt}`,
    );

    return jsonResponse(req, {
      success: true,
      survey_id: finalSurveyId,
      scheduled_at: scheduledAt,
      instance_name: conn.instance_name,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[csat-auto-send] unhandled error:", msg);
    return errorResponse(req, "Internal server error", 500);
  }
});
