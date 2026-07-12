import { z } from "https://esm.sh/zod@3.23.8";
import { MetaWebhookPayloadSchema } from "./webhook-schemas.ts";

// Normalizes Meta WhatsApp Cloud API payloads to the unified Evolution model.

// Meta sends webhooks shaped as:
// { object: "whatsapp_business_account", entry: [{ id, changes: [{ value: { messaging_product, metadata, contacts, messages, statuses } }] }] }

export interface NormalizedIncoming {
  kind: 'message';
  wamid: string;
  fromPhone: string;          // E.164 without +
  remoteJid: string;          // <phone>@s.whatsapp.net
  pushName?: string;
  timestamp: number;          // unix seconds
  messageType: 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'contacts' | 'interactive' | 'reaction' | 'unsupported';
  content: string;
  mediaId?: string;
  mediaMimeType?: string;
  metadata?: Record<string, unknown>;
}

export interface NormalizedStatus {
  kind: 'status';
  wamid: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: number;
  errorMessage?: string;
  recipientPhone?: string;
}

export type NormalizedEvent = NormalizedIncoming | NormalizedStatus;

interface MetaMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type?: string; caption?: string };
  audio?: { id: string; mime_type?: string; voice?: boolean };
  video?: { id: string; mime_type?: string; caption?: string };
  document?: { id: string; mime_type?: string; filename?: string; caption?: string };
  sticker?: { id: string; mime_type?: string; animated?: boolean };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  contacts?: unknown[];
  reaction?: { message_id: string; emoji: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
}

interface MetaStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id?: string;
  errors?: Array<{ code: number; title: string; message?: string }>;
}

interface MetaContact {
  wa_id: string;
  profile?: { name?: string };
}

interface MetaChangeValue {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: MetaContact[];
  messages?: MetaMessage[];
  statuses?: MetaStatus[];
}

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{ field?: string; value?: MetaChangeValue }>;
  }>;
}

export function normalizeMetaPayload(payload: unknown): {
  events: NormalizedEvent[];
  phoneNumberId?: string;
  validationError?: z.ZodError;
} {
  const events: NormalizedEvent[] = [];
  let phoneNumberId: string | undefined;

  const parsed = MetaWebhookPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { events, validationError: parsed.error };
  }
  const p = parsed.data;


  for (const entry of p.entry) {
    if (!entry?.changes) continue;
    for (const change of entry.changes) {
      const value = change.value;
      if (!value) continue;

      if (value.metadata?.phone_number_id) {
        phoneNumberId = value.metadata.phone_number_id;
      }

      const contactName = (value.contacts && value.contacts[0]?.profile?.name) || undefined;

      // Incoming messages
      if (Array.isArray(value.messages)) {
        for (const m of value.messages) {
          const remoteJid = `${m.from}@s.whatsapp.net`;
          const ts = parseInt(m.timestamp, 10) || Math.floor(Date.now() / 1000);
          let messageType: NormalizedIncoming['messageType'] = 'unsupported';
          let content = '';
          let mediaId: string | undefined;
          let mediaMimeType: string | undefined;
          const metadata: Record<string, unknown> = { source: 'whatsapp_cloud_api', raw_type: m.type };

          switch (m.type) {
            case 'text':
              messageType = 'text';
              content = m.text?.body ?? '';
              break;
            case 'image':
              messageType = 'image';
              content = m.image?.caption ?? '';
              mediaId = m.image?.id;
              mediaMimeType = m.image?.mime_type;
              break;
            case 'audio':
              messageType = 'audio';
              mediaId = m.audio?.id;
              mediaMimeType = m.audio?.mime_type;
              metadata.voice = m.audio?.voice ?? false;
              break;
            case 'video':
              messageType = 'video';
              content = m.video?.caption ?? '';
              mediaId = m.video?.id;
              mediaMimeType = m.video?.mime_type;
              break;
            case 'document':
              messageType = 'document';
              content = m.document?.caption ?? m.document?.filename ?? '';
              mediaId = m.document?.id;
              mediaMimeType = m.document?.mime_type;
              metadata.filename = m.document?.filename;
              break;
            case 'sticker':
              messageType = 'sticker';
              mediaId = m.sticker?.id;
              mediaMimeType = m.sticker?.mime_type;
              break;
            case 'location':
              messageType = 'location';
              content = m.location?.name || m.location?.address || `${m.location?.latitude},${m.location?.longitude}`;
              metadata.location = m.location;
              break;
            case 'contacts':
              messageType = 'contacts';
              metadata.contacts = m.contacts;
              break;
            case 'reaction':
              messageType = 'reaction';
              content = m.reaction?.emoji ?? '';
              metadata.reaction_target = m.reaction?.message_id;
              break;
            case 'interactive':
              messageType = 'interactive';
              content =
                m.interactive?.button_reply?.title ??
                m.interactive?.list_reply?.title ?? '';
              metadata.interactive = m.interactive;
              break;
          }

          events.push({
            kind: 'message',
            wamid: m.id,
            fromPhone: m.from,
            remoteJid,
            pushName: contactName,
            timestamp: ts,
            messageType,
            content,
            mediaId,
            mediaMimeType,
            metadata,
          });
        }
      }

      // Status updates
      if (Array.isArray(value.statuses)) {
        for (const s of value.statuses) {
          events.push({
            kind: 'status',
            wamid: s.id,
            status: s.status,
            timestamp: parseInt(s.timestamp, 10) || Math.floor(Date.now() / 1000),
            errorMessage: s.errors?.[0]?.message ?? s.errors?.[0]?.title,
            recipientPhone: s.recipient_id,
          });
        }
      }
    }
  }

  return { events, phoneNumberId };
}

/**
 * Validates Meta webhook signature (X-Hub-Signature-256).
 * Returns true if the signature is valid. Rejects (returns false) when appSecret is empty.
 */
export async function validateMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!appSecret) {
    console.error('[meta-webhook] WHATSAPP_APP_SECRET not configured — rejecting all requests');
    return false;
  }
  if (!signatureHeader) return false;
  const expected = signatureHeader.startsWith('sha256=') ? signatureHeader.slice(7) : signatureHeader;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

  // Constant-time compare
  if (hex.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < hex.length; i++) mismatch |= hex.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}
