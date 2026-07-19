/**
 * Universal extractor for Evolution message types
 */
export type InternalMessageType =
  | 'text' | 'image' | 'audio' | 'video' | 'document'
  | 'sticker' | 'location' | 'interactive' | 'unsupported';

/** Message Category type alias. */
export type MessageCategory =
  | 'text' | 'media' | 'interactive' | 'location'
  | 'contact' | 'poll' | 'reaction' | 'system' | 'unknown';

/** Extracted Message Type interface definition. */
export interface ExtractedMessageType {
  rawType: string;
  internalType: InternalMessageType;
  category: MessageCategory;
  supported: boolean;
  label: string;
}

const MESSAGE_TYPE_BLUEPRINT: Record<string, Omit<ExtractedMessageType, 'rawType'>> = {
  conversation:           { internalType: 'text',         category: 'text',        supported: true,  label: 'Texto' },
  extendedTextMessage:    { internalType: 'text',         category: 'text',        supported: true,  label: 'Texto formatado' },
  imageMessage:           { internalType: 'image',        category: 'media',       supported: true,  label: 'Imagem' },
  videoMessage:           { internalType: 'video',        category: 'media',       supported: true,  label: 'Vídeo' },
  ptvMessage:             { internalType: 'video',        category: 'media',       supported: true,  label: 'Vídeo-nota' },
  audioMessage:           { internalType: 'audio',        category: 'media',       supported: true,  label: 'Áudio' },
  documentMessage:        { internalType: 'document',     category: 'media',       supported: true,  label: 'Documento' },
  stickerMessage:         { internalType: 'sticker',      category: 'media',       supported: true,  label: 'Figurinha' },
  locationMessage:        { internalType: 'location',     category: 'location',    supported: true,  label: 'Localização' },
  liveLocationMessage:    { internalType: 'location',     category: 'location',    supported: true,  label: 'Localização ao vivo' },
  contactMessage:         { internalType: 'unsupported',  category: 'contact',     supported: false, label: 'Cartão de contato' },
  contactsArrayMessage:   { internalType: 'unsupported',  category: 'contact',     supported: false, label: 'Lista de contatos' },
  pollCreationMessage:    { internalType: 'unsupported',  category: 'poll',        supported: false, label: 'Enquete' },
  pollUpdateMessage:      { internalType: 'unsupported',  category: 'poll',        supported: false, label: 'Voto em enquete' },
  reactionMessage:        { internalType: 'unsupported',  category: 'reaction',    supported: false, label: 'Reação' },
  buttonsMessage:         { internalType: 'interactive',  category: 'interactive', supported: true,  label: 'Mensagem com botões' },
  listMessage:            { internalType: 'interactive',  category: 'interactive', supported: true,  label: 'Mensagem de lista' },
  templateMessage:        { internalType: 'interactive',  category: 'interactive', supported: true,  label: 'Modelo (template)' },
  viewOnceMessage:        { internalType: 'unsupported',  category: 'media',       supported: false, label: 'Ver uma vez' },
};

const SHORT_ALIASES: Record<string, keyof typeof MESSAGE_TYPE_BLUEPRINT> = {
  text: 'conversation',
  image: 'imageMessage',
  video: 'videoMessage',
  audio: 'audioMessage',
  ptv: 'ptvMessage',
  document: 'documentMessage',
  sticker: 'stickerMessage',
  location: 'locationMessage',
  interactive: 'buttonsMessage',
};

/** extract Message Type function. */
export function extractMessageType(rawType: string | null | undefined): ExtractedMessageType {
  const raw = (rawType ?? '').trim();
  if (!raw) {
    return { rawType: '', internalType: 'text', category: 'text', supported: true, label: 'Texto' };
  }
  const canonicalKey = (SHORT_ALIASES[raw] ?? raw) as keyof typeof MESSAGE_TYPE_BLUEPRINT;
  const blueprint = MESSAGE_TYPE_BLUEPRINT[canonicalKey];
  if (blueprint) return { rawType: raw, ...blueprint };
  return {
    rawType: raw,
    internalType: 'unsupported',
    category: 'unknown',
    supported: false,
    label: raw,
  };
}
