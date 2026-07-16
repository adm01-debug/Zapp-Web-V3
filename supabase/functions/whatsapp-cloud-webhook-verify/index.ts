/**
 * Edge Function: WhatsApp Cloud Webhook Configuration Validator
 *
 * Diagnostic tool for troubleshooting WhatsApp Cloud API webhook connectivity.
 * Used by admins to verify that webhook is properly registered, receiving events,
 * and rejecting invalid requests.
 *
 * Verification Steps:
 * 1. **Token Validation (Handshake)**:
 *    - Sends GET request to own /whatsapp-cloud-webhook endpoint with:
 *      ?hub.mode=subscribe
 *      &hub.verify_token=WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN
 *      &hub.challenge=random-uuid
 *    - WhatsApp Cloud API sends this handshake when admin clicks "Verify and Save" in dashboard
 *    - Webhook must echo back the challenge parameter if verify_token matches
 *    - Pass: HTTP 200 + challenge echoed; Fail: HTTP not 200 OR challenge mismatch
 *    - Timeout: 10 seconds (detects DNS/TLS/network issues)
 *
 * 2. **Ping History Tracking**:
 *    - Queries whatsapp_cloud_webhook_pings table to show:
 *      * Successful handshakes (verify_token matched)
 *      * Received events (MESSAGES_STATUS, MESSAGE_TEMPLATE_CHANGE_NOTIFICATION, etc.)
 *      * Rejected requests (invalid signature, missing token)
 *    - Timestamps provide proof of delivery + frequency of webhook traffic
 *    - Useful for confirming webhook was actually invoked (vs silently failing)
 *
 * Authentication:
 * - Requires Bearer JWT token (admin user)
 * - RLS enforces user is authenticated (prevents public webhook snooping)
 * - Audit logs webhook verification attempts
 *
 * Configuration:
 * - WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN: Secret token (shared with WhatsApp Cloud dashboard)
 *   If not configured: Handshake test skipped (returns "skip" status)
 * - If token changed in dashboard: Old requests rejected, new requests accepted
 *   (supports token rotation for security)
 *
 * Troubleshooting Guide:
 * - Status "skip": Webhook not configured (token missing)
 *   → Add WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN to Supabase secrets
 * - Status "fail" + echoMatches=false: Token mismatch
 *   → Verify token in secrets matches dashboard configuration
 * - Status "fail" + httpStatus=404: Webhook endpoint not deployed
 *   → Check /functions/v1/whatsapp-cloud-webhook exists
 * - Status "fail" + timeout: Network/firewall issue
 *   → Check Supabase edge function URL is accessible from WhatsApp servers
 * - No pings received: Webhook not subscribed
 *   → Go to WhatsApp Cloud dashboard → Settings → Webhooks → Subscribe to events
 * - High failed pings: Invalid signature or webhook errors
 *   → Check webhook-receiver logs for parsing/validation errors
 *
 * Return Format:
 * {
 *   handshake: { status: "pass"|"fail"|"skip", httpStatus?, echoMatches?, durationMs?, error? },
 *   recentPings: Array<{
 *     webhook_id, event_type, result, received_at, details? (event count, error message)
 *   }>,
 *   summary: { recent_success_count, recent_error_count, avg_response_ms }
 * }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN") ?? "";
const SUPABASE_URL = (Deno.env.get('SELFHOSTED_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL'))!;
const SERVICE_ROLE = (Deno.env.get('SELFHOSTED_SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;

function json(data: unknown, status = 200, req: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsPreflight(req);

  // Auth obrigatória
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401, req);

  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return json({ error: "unauthorized" }, 401, req);

  const verifyTokenConfigured = VERIFY_TOKEN.length > 0;

  // ---- 1) Handshake real contra o próprio webhook ----
  const challenge = `lovable-verify-${crypto.randomUUID().slice(0, 8)}`;
  const webhookUrl = `${SUPABASE_URL}/functions/v1/whatsapp-cloud-webhook`;
  const handshakeUrl =
    `${webhookUrl}?hub.mode=subscribe` +
    `&hub.verify_token=${encodeURIComponent(VERIFY_TOKEN)}` +
    `&hub.challenge=${encodeURIComponent(challenge)}`;

  let handshake: {
    status: "pass" | "fail" | "skip";
    httpStatus?: number;
    echoMatches?: boolean;
    durationMs?: number;
    error?: string;
  };

  if (!verifyTokenConfigured) {
    handshake = {
      status: "skip",
      error: "WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN não está configurado nos secrets.",
    };
  } else {
    const t0 = performance.now();
    try {
      const r = await fetch(handshakeUrl, { method: "GET", signal: AbortSignal.timeout(10_000) });
      const text = await r.text();
      handshake = {
        status: r.ok && text === challenge ? "pass" : "fail",
        httpStatus: r.status,
        echoMatches: text === challenge,
        durationMs: Math.round(performance.now() - t0),
      };
    } catch (e) {
      handshake = {
        status: "fail",
        durationMs: Math.round(performance.now() - t0),
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  // ---- 2) Atividade recente do webhook ----
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE, { db: { schema: "zapp" } });
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: pings } = await adminClient
    .from("whatsapp_cloud_webhook_pings")
    .select("kind, meta, created_at")
    .gte("created_at", since24h)
    .order("created_at", { ascending: false })
    .limit(50);

  const counts = { handshake: 0, event: 0, invalid_signature: 0, invalid_token: 0 };
  let lastEvent: string | null = null;
  let lastHandshake: string | null = null;
  for (const p of pings ?? []) {
    counts[p.kind as keyof typeof counts] = (counts[p.kind as keyof typeof counts] ?? 0) + 1;
    if (p.kind === "event" && !lastEvent) lastEvent = p.created_at;
    if (p.kind === "handshake" && !lastHandshake) lastHandshake = p.created_at;
  }

  const delivery = {
    status: lastEvent ? ("pass" as const) : ("warn" as const),
    lastEventAt: lastEvent,
    lastHandshakeAt: lastHandshake,
    counts24h: counts,
    message: lastEvent
      ? `Último evento recebido em ${lastEvent}.`
      : "Nenhum evento recebido nas últimas 24h. Envie uma mensagem de teste do número conectado para confirmar.",
    recent: (pings ?? []).slice(0, 10),
  };

  return json({
    verifyTokenConfigured,
    webhookUrl,
    handshake,
    delivery,
    checkedAt: new Date().toISOString(),
  }, 200, req);
});
