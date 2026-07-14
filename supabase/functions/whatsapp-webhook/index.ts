import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.23.8";
import { getCorsHeaders, jsonResponse, errorResponse, Logger, requireEnv } from "../_shared/validation.ts";
import { verifyHmacSignature } from "../_shared/hmac-validation.ts";
import { initSentry, captureException, captureMessage } from "../_shared/sentry.ts";

const WhatsAppStatusSchema = z.object({
  id: z.string().max(500),
  status: z.enum(['sent', 'delivered', 'read', 'failed']),
  timestamp: z.string(),
  recipient_id: z.string().optional(),
  errors: z.array(z.object({ code: z.number(), title: z.string() })).optional(),
});

const WhatsAppWebhookSchema = z.object({
  object: z.string(),
  entry: z.array(z.object({
    id: z.string(),
    changes: z.array(z.object({
      value: z.object({
        messaging_product: z.string().optional(),
        metadata: z.object({
          display_phone_number: z.string(),
          phone_number_id: z.string(),
        }).optional(),
        statuses: z.array(WhatsAppStatusSchema).optional(),
        messages: z.array(z.object({
          id: z.string(),
          from: z.string(),
          timestamp: z.string(),
          type: z.string(),
          text: z.object({ body: z.string() }).optional(),
        })).optional(),
      }),
      field: z.string(),
    })),
  })),
});

serve(async (req) => {
  initSentry('whatsapp-webhook');

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const log = new Logger("whatsapp-webhook");

  // Handle webhook verification (GET request from WhatsApp)
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    const verifyToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN');
    if (!verifyToken) {
      log.error("WHATSAPP_VERIFY_TOKEN not configured");
      return new Response('Configuration error', { status: 500, headers: getCorsHeaders(req) });
    }

    if (mode === 'subscribe' && token === verifyToken) {
      log.info("Webhook verified successfully");
      return new Response(challenge, {
        status: 200,
        headers: { ...getCorsHeaders(req), 'Content-Type': 'text/plain' }
      });
    }

    log.warn("Webhook verification failed");
    return new Response('Forbidden', { status: 403, headers: getCorsHeaders(req) });
  }

  // Handle webhook events (POST request)
  if (req.method === 'POST') {
    try {
      const supabaseUrl = requireEnv('SUPABASE_URL');
      const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // [A-3 FIX 2026-07-12] Validate Meta's X-Hub-Signature-256 (HMAC-SHA256 of the
      // RAW body, keyed by the App Secret) BEFORE trusting any status/message update.
      // Without this, anyone who discovers the URL could POST forged `statuses` and
      // mark arbitrary messages read/failed (status poisoning). Read the body as text
      // so the signature is verified over the exact bytes Meta signed.
      const rawBody = await req.text();
      const appSecret = Deno.env.get('WHATSAPP_APP_SECRET');
      if (!appSecret) {
        // Fail-closed: Meta always signs. A missing App Secret means we cannot
        // authenticate the sender — refuse rather than process spoofable input.
        log.error("WHATSAPP_APP_SECRET not configured — refusing POST (fail-closed)");
        return errorResponse("Webhook not configured for signature verification", 503, req);
      }
      const signature = req.headers.get('x-hub-signature-256');
      if (!signature || !(await verifyHmacSignature(rawBody, signature, appSecret))) {
        log.warn("Invalid or missing X-Hub-Signature-256 — rejecting");
        return errorResponse("Invalid signature", 401, req);
      }

      let rawPayload: unknown;
      try {
        rawPayload = JSON.parse(rawBody);
      } catch {
        return jsonResponse({ success: true, warning: "Invalid JSON" }, 200, req);
      }
      const parsed = WhatsAppWebhookSchema.safeParse(rawPayload);

      if (!parsed.success) {
        log.warn("Invalid webhook payload", { errors: parsed.error.message });
        // Return 200 to acknowledge and prevent retries
        return jsonResponse({ success: true, warning: "Invalid payload format" }, 200, req);
      }

      const payload = parsed.data;
      log.info("Received webhook", { entries: payload.entry.length });

      // Process status updates
      for (const entry of payload.entry) {
        for (const change of entry.changes) {
          const value = change.value;

          // Handle status updates
          if (value.statuses) {
            for (const status of value.statuses) {
              log.info("Processing status update", { messageId: status.id, status: status.status });

              const { error } = await supabase
                .from('messages')
                .update({
                  status: status.status,
                  status_updated_at: new Date(parseInt(status.timestamp) * 1000).toISOString(),
                })
                .eq('external_id', status.id);

              if (error) {
                log.error("Error updating message status", { messageId: status.id, error: error.message });
              }
            }
          }

          // Handle incoming messages
          if (value.messages) {
            for (const message of value.messages) {
              log.info("Received message", { from: message.from, type: message.type });
            }
          }
        }
      }

      log.done(200);
      return jsonResponse({ success: true }, 200, req);
    } catch (error) {
      log.error("Webhook processing error", { error: error instanceof Error ? error.message : String(error) });
      await captureException(error, {
        functionName: 'whatsapp-webhook',
        requestUrl: req.url,
        metadata: {
          phase: 'webhook_processing',
          entryCount: payload?.entry?.length,
        },
      });
      log.done(500);
      return errorResponse("Internal server error", 500, req);
    }
  }

  return new Response('Method not allowed', { status: 405, headers: getCorsHeaders(req) });
});
