/**
 * evolution-event-types.ts — CONSTANTE ÚNICA de tipos de evento Evolution.
 * [PATCH 24] Fonte da verdade compartilhada com o consumer Python
 * (evolution-stack consumer/consumer.py:59-63 — EVENTS, 18 tipos).
 * Paridade: evolution-webhook/__tests__/contract.test.ts (18 entradas) +
 * artifact JSON evolution-event-types.json (mesma lista, p/ leitura no Python).
 */
export const EVO_EVENT_TYPES = [
  'messages.upsert',
  'messages.update',
  'messages.edited',
  'messages.delete',
  'contacts.upsert',
  'contacts.update',
  'chats.upsert',
  'chats.update',
  'connection.update',
  'labels.edit',
  'labels.association',
  'groups.upsert',
  'groups.update',
  'group-participants.update',
  'call',
  'qrcode.updated',
  'logout.instance',
  'send.message',
] as const;

export type EvoEventType = (typeof EVO_EVENT_TYPES)[number];

export const EVO_EVENT_TYPES_SET: ReadonlySet<string> = new Set<string>(EVO_EVENT_TYPES);

/**
 * [PATCH 28] Map chave protobuf → message_type canônico (evolution_messages /
 * ingest_ledger). Espelha parseMessageContent (evolution-media.ts:284-337).
 */
export const EVO_PROTOBUF_MESSAGE_TYPE_MAP: Readonly<Record<string, string>> = {
  conversation: 'text',
  extendedTextMessage: 'text',
  imageMessage: 'image',
  videoMessage: 'video',
  audioMessage: 'audio',
  documentMessage: 'document',
  documentWithCaptionMessage: 'document',
  locationMessage: 'location',
  stickerMessage: 'sticker',
  reactionMessage: 'reaction',
  contactMessage: 'contact',
  contactsArrayMessage: 'contact',
  pollCreationMessage: 'poll',
};
