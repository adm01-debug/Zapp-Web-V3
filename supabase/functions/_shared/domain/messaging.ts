/**
 * Contrato canônico de domínio — Zapp Messaging (espelho Deno)
 *
 * E45 do Plano V2: espelho Deno do src/domain/messaging/types.ts.
 * Mantido em sync manual — se alterar um, altere o outro.
 * Estes tipos são neutros de provider.
 */

// ─── ChannelAddress ────────────────────────────────────────────────────────────
export interface ChannelAddress {
  channel: 'whatsapp' | 'instagram' | 'telegram' | string;
  address: string;
}

// ─── ChannelAccount ───────────────────────────────────────────────────────────
export interface ChannelAccount {
  id: string;
  provider: 'evolution' | 'cloud' | string;
  externalRef: string;
}

// ─── MessageType canônico ─────────────────────────────────────────────────────
export type CanonicalMessageType =
  | 'text' | 'image' | 'video' | 'audio' | 'document'
  | 'sticker' | 'location' | 'contact' | 'reaction'
  | 'interactive' | 'template' | 'unknown';

// ─── DeliveryStatus canônico ──────────────────────────────────────────────────
export type CanonicalDeliveryStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

// ─── CanonicalMessage ─────────────────────────────────────────────────────────
export interface CanonicalMessage {
  id: string;
  from: ChannelAddress;
  account: ChannelAccount;
  direction: 'inbound' | 'outbound';
  type: CanonicalMessageType;
  content: string;
  timestamp: number;
  pushName?: string;
  status?: CanonicalDeliveryStatus;
  mediaId?: string;
  mediaMimeType?: string;
  mediaUrl?: string;
  reactionEmoji?: string;
  reactionTargetId?: string;
  quotedId?: string;
  raw?: unknown;
}

// ─── CanonicalContact ─────────────────────────────────────────────────────────
export interface CanonicalContact {
  address: ChannelAddress;
  account: ChannelAccount;
  phone: string;
  pushName?: string;
  profilePicUrl?: string;
}

// ─── ProviderCapabilities ────────────────────────────────────────────────────
export interface ProviderCapabilities {
  sendText: boolean;
  sendMedia: boolean;
  sendAudio: boolean;
  sendSticker: boolean;
  sendReaction: boolean;
  sendLocation: boolean;
  sendTemplate: boolean;
  sendInteractive: boolean;
  presence: boolean;
  qrCode: boolean;
  groupManagement: boolean;
}

// ─── Mapeamentos Baileys → canônico ──────────────────────────────────────────
export const BAILEYS_TO_CANONICAL: Record<string, CanonicalMessageType> = {
  conversation: 'text',
  extendedTextMessage: 'text',
  imageMessage: 'image',
  videoMessage: 'video',
  audioMessage: 'audio',
  documentMessage: 'document',
  stickerMessage: 'sticker',
  locationMessage: 'location',
  contactMessage: 'contact',
  reactionMessage: 'reaction',
  buttonsMessage: 'interactive',
  listMessage: 'interactive',
  templateMessage: 'template',
};

// ─── Mapeamentos Meta Cloud → canônico ───────────────────────────────────────
export const META_TO_CANONICAL: Record<string, CanonicalMessageType> = {
  text: 'text',
  image: 'image',
  video: 'video',
  audio: 'audio',
  document: 'document',
  sticker: 'sticker',
  location: 'location',
  contacts: 'contact',
  reaction: 'reaction',
  interactive: 'interactive',
  template: 'template',
};
