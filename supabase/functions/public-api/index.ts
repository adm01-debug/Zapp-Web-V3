import { handleCors, errorResponse, errorEnvelope, jsonResponse, Logger, checkRateLimit, getClientIP, getCorsHeaders } from "../_shared/validation.ts";
import { timingSafeStringEqual } from "../_shared/auth.ts";
import { createZappAdminClient } from "../_shared/db-client.ts";
import { extractEvolutionMessageId } from "../_shared/evolution-message-id.ts";
import { parseOrReject } from "../_shared/contract-kit.ts";
import { CONTRACT_SCHEMAS } from "../_shared/contract-schemas.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const log = new Logger("public-api", req);
  const requestId = log.getRequestId();

  const ip = getClientIP(req);
  const rl = checkRateLimit(`public-api:${ip}`, 60, 60_000);
  if (!rl.allowed) return errorEnvelope('rate_limit_exceeded', 'Rate limit exceeded', 429, req);

  try {
    const supabase = createZappAdminClient();

    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) return errorEnvelope('unauthorized', 'Missing x-api-key header', 401, req);

    const { data: setting } = await supabase.from('global_settings').select('value').eq('key', 'api_token').single();
    if (!setting?.value || !timingSafeStringEqual(setting.value, apiKey)) {
      log.warn('Invalid API token attempt');
      return errorEnvelope('forbidden', 'Invalid API token', 403, req);
    }

    if (req.method !== 'POST') return errorResponse('Method not allowed', 405, req);

    const raw = await req.json().catch(() => null);
    const parsed = parseOrReject('public-api', CONTRACT_SCHEMAS['public-api'], req, raw, { extraHeaders: getCorsHeaders(req) });
    if (parsed.ok === false) return parsed.response;

    const body = parsed.data as Record<string, any>;
    const { action } = body;
    // Defense-in-depth: o gate já valida action === 'send' (literal no contrato).
    if (action !== 'send') return errorResponse('Unknown action. Supported: send', 400, req);

    const { number, message, connectionId } = body;
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

    // BUG-D fix: zapp.contacts is a non-insertable VIEW on evo.evolution_contacts.
    // Use evolution_contacts directly (auto-updatable view in zapp schema).
    let { data: contact } = await supabase.from('evolution_contacts')
      .select('id')
      .eq('phone_number', phone)
      .eq('instance_name', connection.instance_id)
      .maybeSingle();
    if (!contact) {
      const remoteJid = `${phone.startsWith('55') ? phone : '55' + phone}@c.us`;
      const now = new Date().toISOString();
      const { data: newContact } = await supabase.from('evolution_contacts')
        .insert({ remote_jid: remoteJid, phone_number: phone, full_name: phone, instance_name: connection.instance_id, created_at: now, updated_at: now })
        .select('id')
        .single();
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
    return errorEnvelope('internal_error', 'Internal server error', 500, req);
  }
});