/**
 * Evolution (Baileys) → modelo canônico de domínio Zapp
 *
 * E47 do Plano V2 de Desacoplamento — simétrico ao whatsapp-cloud-normalizer.ts
 * NÃO depende de nomes Baileys fora deste arquivo.
 * Adapte aqui ao trocar de provider Evolution por outro.
 */

import type {
  CanonicalMessageType,
  ChannelAddress,
  ChannelAccount,
  CanonicalMessage,
  CanonicalContact,
  CanonicalDeliveryStatus,
} from "./domain/messaging.ts";

import { BAILEYS_TO_CANONICAL } from "./domain/messaging.ts";

// ─── Shape Baileys (Evolution webhook payload) ─────────────────────────────────

export interface BaileysMessageKey {
  remoteJid?: string;
  fromMe?: boolean;
  id?: string;
  participant?: string;
}

export interface BaileysMessage {
  key: BaileysMessageKey;
  messageTimestamp?: number | { low: number; high: number; unsigned: boolean };
  pushName?: string;
  message?: Record<string, unknown>;
  status?: string | number;
  /** Raw message type string from Baileys (e.g. "imageMessage") */
  messageType?: string;
}

/** Extracts the canonical message type from a Baileys payload. */
export function baileysMsgType(msg: BaileysMessage): CanonicalMessageType {
  if (msg.messageType) return BAILEYS_TO_CANONICAL[msg.messageType] ?? 'unknown';
  if (msg.message) {
    const first = Object.keys(msg.message)[0] ?? '';
    return BAILEYS_TO_CANONICAL[first] ?? 'unknown';
  }
  return 'unknown';
}

/** Extracts text content from a Baileys message. */
export function baileysTextContent(msg: BaileysMessage): string {
  if (!msg.message) return '';
  const m = msg.message as Record<string, Record<string, unknown>>;
  return (
    (m.conversation as string) ??
    (m.extendedTextMessage?.text as string) ??
    (m.imageMessage?.caption as string) ??
    (m.videoMessage?.caption as string) ??
    (m.documentMessage?.caption as string) ??
    ''
  );
}

/** Normalizes a unix timestamp from Baileys (handles Long object). */
export function baileysTimestamp(ts?: number | { low: number; high: number; unsigned: boolean }): number {
  if (!ts) return Math.floor(Date.now() / 1000);
  if (typeof ts === 'number') return ts;
  return ts.low + ts.high * 2 ** 32;
}

/** Normalizes a phone number to E.164 without +, stripping @s.whatsapp.net */
function normalizeJid(jid?: string): string {
  return (jid ?? '').replace(/@[^@]+$/, '').replace(/[^0-9]/g, '');
}

/** Maps a Baileys delivery status string/number to CanonicalDeliveryStatus. */
export function baileysStatus(status?: string | number): CanonicalDeliveryStatus {
  const s = String(status ?? '').toLowerCase();
  if (['sent', '1', 'server_ack'].includes(s)) return 'sent';
  if (['delivered', '2', 'delivery_ack'].includes(s)) return 'delivered';
  if (['read', '3', 'read'].includes(s)) return 'read';
  if (['error', 'failed', '-1'].includes(s)) return 'failed';
  return 'sent';
}

/**
 * Normalizes a Baileys message payload to the Zapp canonical domain model.
 * Called by evolution-webhook-messages handlers.
 */
export function normalizeBaileysMessage(
  msg: BaileysMessage,
  instanceName: string,
): CanonicalMessage {
  const jid = msg.key.remoteJid ?? '';
  const phone = normalizeJid(jid);
  const remoteJid = jid.includes('@') ? jid : `${phone}@s.whatsapp.net`;

  const from: ChannelAddress = { channel: 'whatsapp', address: remoteJid };
  const account: ChannelAccount = {
    id: instanceName,
    provider: 'evolution',
    externalRef: instanceName,
  };

  return {
    id: msg.key.id ?? '',
    from,
    account,
    direction: msg.key.fromMe ? 'outbound' : 'inbound',
    type: baileysMsgType(msg),
    content: baileysTextContent(msg),
    timestamp: baileysTimestamp(msg.messageTimestamp),
    pushName: msg.pushName,
    status: baileysStatus(msg.status),
    raw: msg,
  };
}

/**
 * Extracts a minimal canonical contact from a Baileys message.
 */
export function normalizeBaileysContact(
  msg: BaileysMessage,
  instanceName: string,
): CanonicalContact {
  const jid = msg.key.remoteJid ?? '';
  const phone = normalizeJid(jid);
  const remoteJid = jid.includes('@') ? jid : `${phone}@s.whatsapp.net`;

  return {
    address: { channel: 'whatsapp', address: remoteJid },
    account: { id: instanceName, provider: 'evolution', externalRef: instanceName },
    phone,
    pushName: msg.pushName,
  };
}
