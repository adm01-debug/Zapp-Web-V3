import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.23.8";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, checkRateLimit, getClientIP, contractErrorResponse } from "../_shared/validation.ts";
import { timingSafeStringEqual } from "../_shared/auth.ts";
import { extractEvolutionMessageId } from "../_shared/evolution-message-id.ts";
import { createCriticalPayloadSchemas, mapValidationIssuesToContractError } from "../_shared/criticalPayloadSchemas.ts";

const { publicApiSendSchema } = createCriticalPayloadSchemas(z);

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
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { db: { schema: "zapp" } });

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