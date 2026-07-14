import { getLogger } from '@/lib/logger';
import {
  getWhatsappConnectionById,
  getFirstConnectedWhatsapp,
} from '@/lib/whatsappConnectionsCache';

const log = getLogger('MessageSender');

export interface SendMessageResult {
  id: string;
  contact_id: string | null;
  content: string;
  [key: string]: unknown;
}

export function classifyAuthError(err: unknown): {
  isAuth: boolean;
  code?: number;
  reason?: string;
} {
  if (!err || typeof err !== 'object') return { isAuth: false };
  const anyErr = err as { status?: number; message?: string; error?: { message?: string } };
  const status = anyErr.status;
  const msg = (anyErr.message || anyErr.error?.message || '').toLowerCase();
  if (status === 401 || status === 403)
    return { isAuth: true, code: status, reason: anyErr.message };
  if (
    msg.includes('unauthorized') ||
    msg.includes('forbidden') ||
    msg.includes('invalid token') ||
    msg.includes('invalid api key')
  ) {
    return { isAuth: true, code: status, reason: anyErr.message || msg };
  }
  return { isAuth: false };
}

export async function resolveConnection(contactConnectionId: string | null) {
  let resolvedConnectionId = contactConnectionId;
  let connection: {
    instance_id: string | null;
    instance_name: string | null;
    status: string | null;
  } | null = null;

  if (resolvedConnectionId) {
    const row = await getWhatsappConnectionById(resolvedConnectionId);
    if (row)
      connection = {
        instance_id: row.instance_id,
        instance_name: row.instance_name,
        status: row.status,
      };
  }

  if (!connection?.instance_id || connection.status !== 'connected') {
    const fallback = await getFirstConnectedWhatsapp();
    if (fallback?.instance_id) {
      resolvedConnectionId = fallback.id;
      connection = {
        instance_id: fallback.instance_id,
        instance_name: fallback.instance_name,
        status: fallback.status,
      };
    }
  }

  return { resolvedConnectionId, connection };
}

export function buildEvolutionPayload(
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
      body: {
        instanceName,
        number: phone,
        mediatype: 'image',
        media: mediaUrl,
        caption: content !== '[Imagem]' ? content : undefined,
      },
    };
  }
  if (messageType === 'audio' && (mediaPayload || mediaUrl)) {
    return {
      action: 'send-audio',
      body: {
        instanceName,
        number: phone,
        audio: mediaUrl || mediaPayload,
        encoding: !mediaUrl && Boolean(mediaPayload),
      },
    };
  }
  if (messageType === 'video' && mediaUrl) {
    return {
      action: 'send-media',
      body: {
        instanceName,
        number: phone,
        mediatype: 'video',
        media: mediaUrl,
        caption: content !== '[Vídeo]' ? content : undefined,
      },
    };
  }
  if (messageType === 'document' && mediaUrl) {
    return {
      action: 'send-media',
      body: {
        instanceName,
        number: phone,
        mediatype: 'document',
        media: mediaUrl,
        fileName: content,
      },
    };
  }
  if (messageType === 'location') {
    try {
      const loc = JSON.parse(content) as {
        latitude: number;
        longitude: number;
        name?: string;
        address?: string;
      };
      return {
        action: 'send-location',
        body: {
          instanceName,
          number: phone,
          latitude: loc.latitude,
          longitude: loc.longitude,
          name: loc.name || '',
          address: loc.address || '',
        },
      };
    } catch {
      log.error(
        'Invalid location JSON — refusing to send as plain text to avoid corrupting the message',
        { preview: content.slice(0, 80) }
      );
      throw new Error('Invalid location content: JSON parse failed');
    }
  }
  return { action: 'send-text', body: { instanceName, number: phone, text: content } };
}
