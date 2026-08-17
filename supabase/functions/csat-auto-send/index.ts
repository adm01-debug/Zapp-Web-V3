// csat-auto-send v2.0 — CSAT Automation Edge Function (INBOX-09 + DASHBOARD-05 + Etapa 66-CSAT)
// POST body: { survey_id?, contact_id, agent_id?, connection_id, conversation_id?, delay_minutes? }
//
// Flow (SIM-CSAT E2 — correções G2/G3/G4/G5/G7/G8):
//   1. Validate auth (require user JWT; service_role também passa)
//   2. Load csat_auto_config for connection_id (enabled / template / delay)
//   3. Fetch contact (phone, name, consent_status) — ANTES do insert (G5: sem survey órfão)
//   4. LGPD guard: consent_status != 'opt_out' (G7/F12)
//   5. Dedup: survey já existe p/ (contact, conversation) ou cooldown 30d (G3/F6)
//   6. Fetch whatsapp_connections.instance_name
//   7. Render template — variável primária {nome}; retrocompat {name}/{{nome}}/{{name}} (G4/F1)
//   8. Insert csat_surveys com send_at = now + delay, status='scheduled', message_text
//      — NÃO enfileira em evolution_message_queue (G2/F2: fila sem consumidor;
//        envio real acontece na edge csat-dispatch via evolutionClient.sendText)
//   9. Return { success, survey_id, send_at, instance_name }
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

const CSAT_COOLDOWN_DAYS = 30;

/**
 * Render template CSAT (G4/F1):
 *  - Primário: `{nome}` (variável documentada na UI — CSATAutoConfig).
 *  - Retrocompat: `{name}`, `{{nome}}`, `{{name}}`.
 *  - Tokens desconhecidos (`{agent}`, `{queue}`, `{{...}}`) são removidos —
 *    nunca deixam placeholder literal na mensagem.
 */
function renderTemplate(template: string, contactName: string): string {
  const firstName = (contactName ?? "").split(" ")[0] || "Cliente";
  return template
    .replace(/\{\{\s*nome\s*\}\}/gi, firstName)
    .replace(/\{\{\s*name\s*\}\}/gi, firstName)
    .replace(/\{\s*nome\s*\}/gi, firstName)
    .replace(/\{\s*name\s*\}/gi, firstName)
    .replace(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g, "")
    .replace(/\{\s*[a-zA-Z0-9_]+\s*\}/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
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

  const parsed = parseOrReject("csat-auto-send", { v1: CsatAutoSendV1Schema }, req, rawBody);
  if (parsed.ok === false) return parsed.response;
  const { contact_id, agent_id, connection_id, conversation_id, delay_minutes } = parsed.data as CsatAutoSendBody;

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

    // ── 2. Fetch contact — ANTES de qualquer insert (G5: survey órfão) ────────
    const { data: contact, error: contactErr } = await admin
      .from("contacts")
      .select("phone, name, consent_status")
      .eq("id", contact_id)
      .maybeSingle();

    if (contactErr) {
      console.error("[csat-auto-send] contact fetch error:", contactErr.message);
      return errorResponse(req, "Failed to fetch contact", 500);
    }
    if (!contact?.phone) {
      console.error("[csat-auto-send] contact not found or missing phone, contact_id:", contact_id);
      return jsonResponse(req, { success: false, reason: "contact_without_phone" }, 404);
    }

    // ── 3. LGPD guard (G7/F12): nunca enviar pesquisa para contato opt-out ────
    if (contact.consent_status === "opt_out") {
      console.log(`[csat-auto-send] LGPD opt-out — survey skipped contact=${contact_id}`);
      return jsonResponse(req, { success: false, reason: "lgpd_opt_out" });
    }

    // ── 4. Dedup 1 pesquisa/conversa + cooldown 30d (G3/F6) ───────────────────
    const cooldownCutoff = new Date(Date.now() - CSAT_COOLDOWN_DAYS * 86_400_000).toISOString();

    let existingQuery = admin
      .from("csat_surveys")
      .select("id, send_at")
      .eq("contact_id", contact_id)
      .limit(1);

    if (conversation_id) {
      // Conversa conhecida: já existe survey para ESTA conversa (qualquer
      // idade — UNIQUE parcial conversation_id) OU cooldown 30d por contato.
      existingQuery = existingQuery.or(`conversation_id.eq.${conversation_id},created_at.gte.${cooldownCutoff}`);
    } else {
      // Sem conversa: cooldown 30d por contato.
      existingQuery = existingQuery.gte("created_at", cooldownCutoff);
    }

    const { data: existingSurveys, error: dedupErr } = await existingQuery;

    if (dedupErr) {
      console.error("[csat-auto-send] dedup query error:", dedupErr.message);
      return errorResponse(req, "Failed to check existing surveys", 500);
    }

    if (existingSurveys && existingSurveys.length > 0) {
      console.log(
        `[csat-auto-send] dedup hit — contact=${contact_id} conversation=${conversation_id ?? "-"} survey=${existingSurveys[0].id}`,
      );
      return jsonResponse(req, {
        success: false,
        reason: "already_surveyed",
        survey_id: existingSurveys[0].id ?? null,
      });
    }

    // ── 5. Fetch instance_name from whatsapp_connections (antes do insert) ────
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
      return jsonResponse(req, { success: false, reason: "connection_not_found" }, 404);
    }

    // ── 6. Render message template (G4: {nome} primário) ──────────────────────
    const renderedMessage = renderTemplate(
      csatConfig.message_template ?? "",
      contact.name ?? "",
    );

    if (!renderedMessage) {
      console.error("[csat-auto-send] message_template is empty after rendering, connection_id:", connection_id);
      return jsonResponse(req, { success: false, reason: "empty_template" }, 400);
    }

    // ── 7. Delay → send_at (o dispatch envia quando send_at <= now()) ─────────
    // Priority: body.delay_minutes → config.delay_minutes → 0 (immediate)
    const effectiveDelay = Math.max(
      0,
      Number(delay_minutes ?? csatConfig.delay_minutes ?? 0) || 0,
    );
    const sendAt = new Date(Date.now() + effectiveDelay * 60_000).toISOString();

    // ── 8. Insert survey (status='scheduled' — o dispatch faz o envio real) ───
    const { data: newSurvey, error: surveyErr } = await admin
      .from("csat_surveys")
      .insert({
        agent_id: agent_id ?? null,
        contact_id,
        conversation_id: conversation_id ?? null,
        whatsapp_connection_id: connection_id,
        conversation_resolved_at: new Date().toISOString(),
        send_at: sendAt,
        status: "scheduled",
        message_text: renderedMessage,
      })
      .select("id, send_at")
      .maybeSingle();

    if (surveyErr || !newSurvey?.id) {
      // 23505 = unique_violation (uq_csat_surveys_conversation) — corrida de
      // double-fire da UI: responde idempotente em vez de 500.
      if (surveyErr?.code === "23505") {
        console.warn(`[csat-auto-send] unique_violation on insert — dedup race, contact=${contact_id}`);
        return jsonResponse(req, { success: false, reason: "already_surveyed" });
      }
      console.error("[csat-auto-send] survey insert error:", surveyErr?.message);
      return errorResponse(req, "Failed to create survey", 500);
    }

    console.log(
      `[csat-auto-send] survey scheduled — contact=${contact_id} survey=${newSurvey.id} ` +
      `instance=${conn.instance_name} send_at=${sendAt} (direct send via csat-dispatch, NOT queue)`,
    );

    return jsonResponse(req, {
      success: true,
      survey_id: newSurvey.id,
      send_at: newSurvey.send_at ?? sendAt,
      instance_name: conn.instance_name,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[csat-auto-send] unhandled error:", msg);
    return errorResponse(req, "Internal server error", 500);
  }
});
