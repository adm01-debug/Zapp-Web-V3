import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import {
  getWhatsappConnectionById,
  getFirstConnectedWhatsapp,
} from '@/lib/whatsappConnectionsCache';
// Uses RealtimeMessage type from parent hook

const log = getLogger('MessageSender');

interface SendMessageResult {
  id: string;
  contact_id: string | null;
  content: string;
  [key: string]: unknown;
}

/**
 * Resolves the WhatsApp connection to use for sending, with fallback.
 * Reads go through the module-level cache to avoid a DB round-trip on every send.
 */
async function resolveConnection(contactConnectionId: string | null) {
  let resolvedConnectionId = contactConnectionId;
  let connection: { instance_id: string | null; status: string | null } | null = null;

  if (resolvedConnectionId) {
    const row = await getWhatsappConnectionById(resolvedConnectionId);
    if (row) connection = { instance_id: row.instance_id, status: row.status };
  }

  if (!connection?.instance_id || connection.status !== 'connected') {
    const fallback = await getFirstConnectedWhatsapp();
    if (fallback?.instance_id) {
      resolvedConnectionId = fallback.id;
      connection = { instance_id: fallback.instance_id, status: fallback.status };
    }
  }

  return { resolvedConnectionId, connection };
}

/**
 * Builds the Evolution API action and body based on message type.
 */
function buildEvolutionPayload(
  instanceName: string,
  phone: string,
  content: string,
  messageType: string,
  mediaUrl?: string,
  mediaPayload?: string
): { action: string; body: Record<string, unknown> } {
  if (messageType === 'image' && mediaUrl) {
    return {
      action: 'send-media',
      body: { instanceName, number: phone, mediatype: 'image', media: mediaUrl, caption: content !== '[Imagem]' ? content : undefined },
    };
  }
  if (messageType === 'audio' && (mediaPayload || mediaUrl)) {
    return {
      action: 'send-audio',
      body: { instanceName, number: phone, audio: mediaUrl || mediaPayload, encoding: !mediaUrl && Boolean(mediaPayload) },
    };
  }
  if (messageType === 'video' && mediaUrl) {
    return {
      action: 'send-media',
      body: { instanceName, number: phone, mediatype: 'video', media: mediaUrl, caption: content !== '[Vídeo]' ? content : undefined },
    };
  }
  if (messageType === 'document' && mediaUrl) {
    return {
      action: 'send-media',
      body: { instanceName, number: phone, mediatype: 'document', media: mediaUrl, fileName: content },
    };
  }
  if (messageType === 'location') {
    try {
      const loc = JSON.parse(content);
      return {
        action: 'send-location',
        body: { instanceName, number: phone, latitude: loc.latitude, longitude: loc.longitude, name: loc.name || '', address: loc.address || '' },
      };
    } catch {
      log.warn('Invalid location content, sending as text');
    }
  }
  return { action: 'send-text', body: { instanceName, number: phone, text: content } };
}

/**
 * Sends a message: saves to DB, dispatches via Evolution API, updates status.
 */
export async function sendMessageToContact(
  contactId: string,
  content: string,
  messageType = 'text',
  mediaUrl?: string,
  mediaPayload?: string
): Promise<SendMessageResult> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
    .single();

  const { data, error } = await supabase
    .from('messages')
    .insert({
      contact_id: contactId,
      agent_id: profile?.id,
      content,
      sender: 'agent',
      message_type: messageType,
      media_url: mediaUrl || null,
      is_read: true,
      status: 'sending',
    })
    .select()
    .single();

  if (error) {
    log.error('Error saving message to DB:', error);
    throw error;
  }

  try {
    const { data: contact } = await supabase
      .from('contacts')
      .select('phone, whatsapp_connection_id')
      .eq('id', contactId)
      .single();

    const { resolvedConnectionId, connection } = await resolveConnection(contact?.whatsapp_connection_id ?? null);

    if (!connection?.instance_id || connection.status !== 'connected') {
      log.warn('WhatsApp connection not active, message marked as failed');
      await supabase.from('messages').update({ status: 'failed' }).eq('id', data.id);
      throw new Error('Nenhuma conexão WhatsApp ativa disponível');
    }

    const phone = contact?.phone?.replace(/\D/g, '');
    if (!phone) {
      throw new Error('Contato sem número de telefone válido');
    }

    const { action, body } = buildEvolutionPayload(connection.instance_id, phone, content, messageType, mediaUrl, mediaPayload);

    const { data: apiResult, error: apiError } = await supabase.functions.invoke(
      `evolution-api/${action}`,
      { body }
    );

    if (apiError || apiResult?.error) {
      log.error('Evolution API send error:', apiError || apiResult);
      await supabase.from('messages').update({ status: 'failed', whatsapp_connection_id: resolvedConnectionId }).eq('id', data.id);
      throw new Error(apiResult?.message || 'Falha ao enviar mensagem');
    }

    const externalId = apiResult?.key?.id || apiResult?.messageId || null;
    await supabase.from('messages').update({ status: 'sent', external_id: externalId, whatsapp_connection_id: resolvedConnectionId }).eq('id', data.id);
  } catch (evolutionError) {
    log.error('Error sending via Evolution API:', evolutionError);
    await supabase.from('messages').update({ status: 'failed' }).eq('id', data.id);
    throw evolutionError;
  }

  return data as SendMessageResult;
}
