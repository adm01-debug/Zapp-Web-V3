import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.23.8";
import { handleCors, errorResponse, jsonResponse, requireEnv, Logger, checkRateLimit, getClientIP, contractErrorResponse } from "../_shared/validation.ts";
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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate API token
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey || typeof apiKey !== 'string' || apiKey.length === 0) {
      return errorResponse('Missing x-api-key header', 401, req);
    }

    const { data: setting, error: settingError } = await supabase
      .from('global_settings')
      .select('value')
      .eq('key', 'api_token')
      .single();

    if (settingError) {
      const errorMsg = settingError instanceof Error ? settingError.message : String(settingError);
      log.error('Failed to fetch API token setting', { error: errorMsg });
      return errorResponse('Internal server error', 500, req);
    }

    if (!setting || typeof setting !== 'object' || Array.isArray(setting)) {
      return errorResponse('Invalid API token', 403, req);
    }

    const settingObj = setting as Record<string, unknown>;
    const storedToken = typeof settingObj.value === 'string' ? settingObj.value : '';
    if (!storedToken || storedToken !== apiKey) {
      log.warn('Invalid API token attempt');
      return errorResponse('Invalid API token', 403, req);
    }

    if (req.method !== 'POST') {
      return errorResponse('Method not allowed', 405, req);
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return errorResponse('Invalid JSON body', 400, req);
    }

    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
      return errorResponse('Invalid JSON body', 400, req);
    }

    const body = rawBody as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';
    if (action !== 'send') {
      return errorResponse('Unknown action. Supported: send', 400, req);
    }

    const parsed = publicApiSendSchema.safeParse(body);
    if (!parsed.success) {
      const mapped = mapValidationIssuesToContractError(parsed.error.issues);
      return contractErrorResponse(
        mapped.code,
        mapped.message,
        parsed.error.issues,
        requestId,
        req
      );
    }

    const { number, message, connectionId } = parsed.data;
    const phone = number.replace(/\D/g, '');

    // Find connection
    let connection: Record<string, unknown> | null = null;
    if (connectionId) {
      const { data } = await supabase
        .from('whatsapp_connections')
        .select('*')
        .eq('id', connectionId)
        .eq('status', 'connected')
        .single();
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        connection = data as Record<string, unknown>;
      }
    } else {
      const { data } = await supabase
        .from('whatsapp_connections')
        .select('*')
        .eq('is_default', true)
        .eq('status', 'connected')
        .single();
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        connection = data as Record<string, unknown>;
      }
    }

    if (!connection) {
      return errorResponse('No active WhatsApp connection found', 404, req);
    }

    // Find or create contact
    let contact: Record<string, unknown> | null = null;
    const { data: existingContact } = await supabase
      .from('contacts')
      .select('id')
      .eq('phone', phone)
      .single();

    if (existingContact && typeof existingContact === 'object' && !Array.isArray(existingContact)) {
      contact = existingContact as Record<string, unknown>;
    } else {
      const connectionId = typeof connection.id === 'string' ? connection.id : null;
      if (!connectionId) {
        return errorResponse('Invalid connection ID', 500, req);
      }
      const { data: newContact } = await supabase
        .from('contacts')
        .insert({ name: phone, phone, whatsapp_connection_id: connectionId })
        .select('id')
        .single();
      if (newContact && typeof newContact === 'object' && !Array.isArray(newContact)) {
        contact = newContact as Record<string, unknown>;
      }
    }

    if (!contact) {
      return errorResponse('Failed to create contact', 500, req);
    }

    // Insert message — stamp request_id for end-to-end tracing.
    const contactId = typeof contact.id === 'string' ? contact.id : null;
    const connectionIdForMsg = typeof connection.id === 'string' ? connection.id : null;
    if (!contactId || !connectionIdForMsg) {
      return errorResponse('Invalid contact or connection ID', 500, req);
    }

    const { data: msg, error: msgError } = await supabase
      .from('messages')
      .insert({
        contact_id: contactId,
        content: message,
        sender: 'agent',
        message_type: 'text',
        status: 'sending',
        whatsapp_connection_id: connectionIdForMsg,
        request_id: requestId,
      })
      .select()
      .single();

    if (msgError) {
      const errorMsg = msgError instanceof Error ? msgError.message : String(msgError);
      log.error('Failed to save message', { error: errorMsg });
      return errorResponse('Failed to save message', 500, req);
    }

    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
      return errorResponse('Failed to save message', 500, req);
    }
    const msgObj = msg as Record<string, unknown>;

    // Send via evolution-api edge function (centralized proxy).
    // Routing through invoke avoids duplicating CORS/retry/error normalization
    // and gives us a uniform contract for instanceName forwarding.
    const msgId = typeof msgObj.id === 'string' ? msgObj.id : null;
    if (!msgId) {
      return errorResponse('Invalid message ID', 500, req);
    }

    try {
      const instanceId = typeof connection.instance_id === 'string' ? connection.instance_id : null;
      if (instanceId) {
        const { data: invokeData, error: invokeError } = await supabase.functions.invoke(
          'evolution-api',
          {
            body: {
              action: 'send-text',
              instanceName: instanceId,
              number: phone,
              text: message,
            },
          }
        );

        if (invokeError) {
          const errorMsg = invokeError instanceof Error ? invokeError.message : String(invokeError);
          log.error('evolution-api invoke error', { error: errorMsg });
          await supabase.from('messages').update({ status: 'failed' }).eq('id', msgId);
        } else {
          if (invokeData && typeof invokeData === 'object' && !Array.isArray(invokeData)) {
            const externalId = extractEvolutionMessageId(invokeData as Record<string, unknown>);
            if (externalId && typeof externalId === 'string' && externalId.length > 0) {
              await supabase
                .from('messages')
                .update({ external_id: externalId, status: 'sent' })
                .eq('id', msgId);
            }
          }
        }
      }
    } catch (sendErr) {
      log.error('Evolution API send error', { error: String(sendErr) });
      await supabase.from('messages').update({ status: 'failed' }).eq('id', msgId);
    }

    const responseContactId = typeof contact.id === 'string' ? contact.id : null;
    log.done(200, { messageId: msgId, requestId });
    return jsonResponse({ success: true, messageId: msgId, contactId: responseContactId, requestId }, 200, req);
  } catch (err) {
    log.error('Unhandled error', { error: err instanceof Error ? err.message : String(err) });
    return errorResponse('Internal server error', 500, req);
  }
});
