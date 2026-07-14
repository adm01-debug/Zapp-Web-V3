export type WhatsAppMode = 'official' | 'unofficial';
export type WhatsAppTransport = 'cloud' | 'evolution';

export interface ResolvedTransport {
  transport: WhatsAppTransport;
  requestedMode: WhatsAppMode;
  /** True quando o admin pediu official mas caímos para evolution por falta de secrets. */
  degraded: boolean;
  reason?: string;
  missingSecrets?: string[];
}

export interface SendTextParams {
  remoteJid: string;
  text: string;
  instance?: string;
  quotedMessageId?: string;
  mentions?: string[];
}

export interface SendMediaParams {
  remoteJid: string;
  mediaUrl: string;
  type: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
  filename?: string;
  mimetype?: string;
  instance?: string;
}

export interface SendAudioParams {
  remoteJid: string;
  audioUrl: string;
  instance?: string;
  ptt?: boolean;
}

export interface SendStickerParams {
  remoteJid: string;
  stickerUrl: string;
  instance?: string;
}

export interface SendReactionParams {
  remoteJid: string;
  messageId: string;
  reaction: string;
  fromMe?: boolean;
  instance?: string;
}

export interface SendLocationParams {
  remoteJid: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  instance?: string;
}

export interface SendContactParams {
  remoteJid: string;
  fullName: string;
  phone: string;
  instance?: string;
}

export interface TemplateComponent {
  type: 'header' | 'body' | 'button' | string;
  sub_type?: string;
  index?: number;
  parameters?: Array<{ type: string; text?: string; payload?: string; [key: string]: unknown }>;
}

export interface SendTemplateParams {
  remoteJid: string;
  name: string;
  language?: string;
  components?: Array<Record<string, unknown>>;
}

export interface PresenceParams {
  remoteJid: string;
  presence: 'composing' | 'paused' | 'recording' | 'available' | 'unavailable';
  instance?: string;
}

export interface MarkAsReadParams {
  remoteJid: string;
  messageIds: string[];
  instance?: string;
}
