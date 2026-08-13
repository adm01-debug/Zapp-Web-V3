/**
 * Contrato canônico de domínio — Zapp Messaging
 *
 * E23-E28 do Plano de Desacoplamento 100 Etapas.
 * Estes tipos são neutros de provider: não dependem de nomenclatura
 * Baileys (remote_jid, instance_name, from_me) nem de nomenclatura Meta
 * (wamid, wa_id). Adapters traduzem de/para o canônico.
 *
 * NÃO importar de @/adapters/evolutionAdapter neste arquivo.
 * NÃO importar de @/types/evolutionExternal neste arquivo.
 */

// ─── E24: ChannelAddress — substitui remote_jid no domínio ────────────────────
export interface ChannelAddress {
  /** Canal de comunicação (whatsapp, instagram, telegram, ...) */
  channel: 'whatsapp' | 'instagram' | 'telegram' | string;
  /** Endereço normalizado no canal (ex: '5541999999999@s.whatsapp.net') */
  address: string;
}

// ─── E25: ChannelAccount — substitui instanceName no domínio ─────────────────
export interface ChannelAccount {
  /** ID interno do workspace/conexão */
  id: string;
  /** Provider que gerencia esta conta */
  provider: 'evolution' | 'cloud' | string;
  /** Referência externa ao provider (instanceName, phone_number_id, ...) */
  externalRef: string;
}

// ─── E26: MessageType canônico ↔ mapeamento de providers ─────────────────────
export type CanonicalMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contact'
  | 'reaction'
  | 'interactive'
  | 'template'
  | 'unknown';

/** Mapeamento Baileys (Evolution) → canônico */
export const BAILEYS_TO_CANONICAL: Record<string, CanonicalMessageType> = {
  conversation:         'text',
  extendedTextMessage:  'text',
  imageMessage:         'image',
  videoMessage:         'video',
  audioMessage:         'audio',
  documentMessage:      'document',
  stickerMessage:       'sticker',
  locationMessage:      'location',
  contactMessage:       'contact',
  reactionMessage:      'reaction',
  buttonsMessage:       'interactive',
  listMessage:          'interactive',
  templateMessage:      'template',
};

/** Mapeamento Meta Cloud API → canônico */
export const META_TO_CANONICAL: Record<string, CanonicalMessageType> = {
  text:        'text',
  image:       'image',
  video:       'video',
  audio:       'audio',
  document:    'document',
  sticker:     'sticker',
  location:    'location',
  contacts:    'contact',
  reaction:    'reaction',
  interactive: 'interactive',
  template:    'template',
};

// ─── E27: DeliveryStatus canônico ─────────────────────────────────────────────
export type DeliveryStatus =
  | 'pending'    // enfileirado localmente
  | 'sent'       // aceito pelo provider
  | 'delivered'  // entregue ao dispositivo
  | 'read'       // lido pelo destinatário
  | 'failed'     // falha definitiva
  | 'unknown';

/** Mapeamento Evolution ACK → DeliveryStatus canônico */
export const EVOLUTION_ACK_TO_STATUS: Record<number, DeliveryStatus> = {
  [-1]: 'failed',
  [0]:  'pending',
  [1]:  'sent',
  [2]:  'delivered',
  [3]:  'read',
  [4]:  'read',
};

// ─── E29: ProviderCapabilities — declara o que cada provider suporta ──────────
export interface ProviderCapabilities {
  sticker:    boolean;
  reaction:   boolean;
  presence:   boolean;  // digitando / gravando áudio
  template:   boolean;
  interactive: boolean; // botões / listas
  voiceCall:  boolean;
}

export const EVOLUTION_CAPABILITIES: ProviderCapabilities = {
  sticker:     true,
  reaction:    true,
  presence:    true,
  template:    true,
  interactive: true,
  voiceCall:   false,
};

export const CLOUD_CAPABILITIES: ProviderCapabilities = {
  sticker:     false,
  reaction:    false,
  presence:    false,
  template:    true,
  interactive: true,
  voiceCall:   false,
};

// ─── E23: ChannelMessage — tipo de domínio canônico ───────────────────────────
export interface ChannelMessage {
  id: string;
  externalId?: string;          // wamid, Baileys key.id
  from: ChannelAddress;
  to: ChannelAddress;
  account: ChannelAccount;
  type: CanonicalMessageType;
  content: string;
  mediaUrl?: string;
  mediaMimetype?: string;
  status: DeliveryStatus;
  fromMe: boolean;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// ─── E23: ChannelContact — contato canônico ────────────────────────────────────
export interface ChannelContact {
  id?: string;
  address: ChannelAddress;
  displayName?: string;
  avatarUrl?: string;
  provider: string;
  externalRef: string;
}

// ─── E23: ChannelConversation — conversa canônica ─────────────────────────────
export interface ChannelConversation {
  id?: string;
  contact: ChannelContact;
  account: ChannelAccount;
  lastMessageAt?: Date;
  unreadCount?: number;
  metadata?: Record<string, unknown>;
}
