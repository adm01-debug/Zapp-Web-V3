import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, checkRateLimit, getClientIP, contractErrorResponse } from "../_shared/validation.ts";
import { timingSafeStringEqual } from "../_shared/auth.ts";
import { extractEvolutionMessageId } from "../_shared/evolution-message-id.ts";
import { createCriticalPayloadSchemas, mapValidationIssuesToContractError } from "../_shared/criticalPayloadSchemas.ts";

const { publicApiSendSchema } = createCriticalPayloadSchemas(z);

/**
 * Edge Function: Public API for External Message Sending
 *
 * HTTP API endpoint for external systems to send WhatsApp messages via authenticated token.
 * Acts as a bridge between third-party integrations and the Evolution API, handling contact
 * management, message persistence, and delivery coordination.
 *
 * Security Model:
 * - API Token Authentication: x-api-key header must match global_settings key='api_token'
 *   Uses timing-safe comparison (timingSafeStringEqual) to prevent timing attacks.
 *   Token stored encrypted at rest in Supabase; never logged or exposed.
 * - Rate Limiting: 60 requests per minute per IP address; enforced before auth check (fail-fast)
 * - CORS: Handled via handleCors; allows cross-origin requests from configured origins
 * - Schema Validation: Request payload validated against publicApiSendSchema (Zod);
 *   failures return contract-based error responses with detailed field issues
 *
 * Request Format (POST application/json):
 * {
 *   "action": "send" (required, must be "send"),
 *   "number": "+55 11 99999-9999" (required, phone number; non-digits stripped),
 *   "message": "Hello" (required, text content ≤160 chars per schema),
 *   "connectionId": "uuid" (optional, defaults to is_default=true connection)
 * }
 *
 * Workflow:
 * 1. Rate limit check (60/min per IP)
 * 2. API key validation (timing-safe against global_settings)
 * 3. Schema validation (publicApiSendSchema)
 * 4. Connection lookup: By connectionId if provided, else default; must have status='connected'
 * 5. Contact resolution: Look up by phone+connectionId, create if missing
 * 6. Message persistence: Insert into messages table with status='sending'
 * 7. Evolution delivery: Invoke evolution-api (async; non-blocking if failure)
 *    - On success: Update message.external_id and status='sent'
 *    - On failure: Update message.status='failed', log error, continue
 * 8. Response: { success, messageId, contactId, requestId }
 *
 * Error Responses:
 * - 400: Invalid JSON, missing action, unknown action, schema validation failure
 * - 401: Missing x-api-key header
 * - 403: Invalid API token
 * - 404: No active WhatsApp connection found
 * - 405: Method not allowed (must be POST)
 * - 429: Rate limit exceeded (60/min per IP)
 * - 500: Database insert/update failure, unhandled exception
 *
 * Side Effects:
 * - Creates contact if missing (with name=phone, whatsapp_connection_id)
 * - Inserts message record in status='sending' (persisted regardless of Evolution outcome)
 * - Updates message.status and external_id based on Evolution API response
 * - Logs all operations via Logger (requestId for tracing)
 *
 * Reliability:
 * - Message persistence is atomic before Evolution send attempt (ensures durability)
 * - Evolution send failures do not fail the API response (graceful degradation)
 * - Message status updated async; can be retried independently if needed
 * - All errors logged with requestId for audit trail
 */
Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("public-api", req);
  const requestId = log.getRequestId();

  const ip = getClientIP(req);
  const rl = checkRateLimit(`public-api:${ip}`, 60, 60_000);
  if (!rl.allowed) return errorResponse('Rate limit exceeded', 429, req);

  try {
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const supabaseServiceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) return errorResponse('Missing x-api-key header', 401, req);

    const { data: setting } = await supabase.from('global_settings').select('value').eq('key', 'api_token').single();
    if (!setting?.value || !timingSafeStringEqual(setting.value, apiKey)) {
      log.warn('Invalid API token attempt');
      return errorResponse('Invalid API token', 403, req);
    }

    if (req.method !== 'POST') return errorResponse('Method not allowed', 405, req);

    const raw = await req.json().catch(() => null);
    if (!raw) return errorResponse('Invalid JSON body', 400, req);

    const { action } = raw as { action?: string };
    if (action !== 'send') return errorResponse('Unknown action. Supported: send', 400, req);

    const parsed = publicApiSendSchema.safeParse(raw);
    if (!parsed.success) {
      const mapped = mapValidationIssuesToContractError(parsed.error.issues);
      return contractErrorResponse(mapped.code, mapped.message, parsed.error.issues, requestId, req);
    }

    const { number, message, connectionId } = parsed.data;
    const phone = number.replace(/\D/g, '');

    let connection;
    if (connectionId) {
      const { data } = await supabase.from('whatsapp_connections').select('*').eq('id', connectionId).eq('status', 'connected').single();
      connection = data;
    } else {
      const { data } = await supabase.from('whatsapp_connections').select('*').eq('is_default', true).eq('status', 'connected').single();
      connection = data;
    }

    if (!connection) return errorResponse('No active WhatsApp connection found', 404, req);

    let { data: contact } = await supabase.from('contacts').select('id').eq('phone', phone).eq('whatsapp_connection_id', connection.id).single();
    if (!contact) {
      const { data: newContact } = await supabase.from('contacts').insert({ name: phone, phone, whatsapp_connection_id: connection.id }).select('id').single();
      contact = newContact;
    }
    if (!contact) return errorResponse('Failed to create contact', 500, req);

    const { data: msg, error: msgError } = await supabase.from('messages').insert({ contact_id: contact.id, content: message, sender: 'agent', message_type: 'text', status: 'sending', whatsapp_connection_id: connection.id, request_id: requestId }).select().single();
    if (msgError) {
      log.error('Failed to save message', { error: msgError.message });
      return errorResponse('Failed to save message', 500, req);
    }

    try {
      if (connection.instance_id) {
        const { data: invokeData, error: invokeError } = await supabase.functions.invoke('evolution-api', { body: { action: 'send-text', instanceName: connection.instance_id, number: phone, text: message } });
        if (invokeError) {
          log.error('evolution-api invoke error', { error: invokeError.message });
          await supabase.from('messages').update({ status: 'failed' }).eq('id', msg.id);
        } else {
          const externalId = extractEvolutionMessageId(invokeData);
          if (externalId) await supabase.from('messages').update({ external_id: externalId, status: 'sent' }).eq('id', msg.id);
        }
      }
    } catch (sendErr) {
      log.error('Evolution API send error', { error: String(sendErr) });
      await supabase.from('messages').update({ status: 'failed' }).eq('id', msg.id);
    }

    log.done(200, { messageId: msg.id, requestId });
    return jsonResponse({ success: true, messageId: msg.id, contactId: contact.id, requestId }, 200, req);
  } catch (err) {
    log.error('Unhandled error', { error: err instanceof Error ? err.message : String(err) });
    return errorResponse('Internal server error', 500, req);
  }
});