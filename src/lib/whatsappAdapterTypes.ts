/** Whats App Mode type alias. */
export type WhatsAppMode = 'official' | 'unofficial';
/** Whats App Transport type alias. */
export type WhatsAppTransport = 'cloud' | 'evolution';

/** Resolved Transport interface definition. */
export interface ResolvedTransport {
  transport: WhatsAppTransport;
  requestedMode: WhatsAppMode;
  /** True quando o admin pediu official mas caímos para evolution por falta de secrets. */
  degraded: boolean;
  reason?: string;
  missingSecrets?: string[];
}

/** Parameters for sending a plain-text WhatsApp message via the adapter. */
export interface SendTextParams {
  remoteJid: string;
  text: string;
  instance?: string;
  quotedMessageId?: string;
  mentions?: string[];
}

/** Send Media Params interface definition. */
export interface SendMediaParams {
  remoteJid: string;
  mediaUrl: string;
  type: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
  filename?: string;
  mimetype?: string;
  instance?: string;
}

/** Send Audio Params interface definition. */
export interface SendAudioParams {
  remoteJid: string;
  audioUrl: string;
  instance?: string;
  ptt?: boolean;
}

/** Send Sticker Params interface definition. */
export interface SendStickerParams {
  remoteJid: string;
  stickerUrl: string;
  instance?: string;
}

/** Send Reaction Params interface definition. */
export interface SendReactionParams {
  remoteJid: string;
  messageId: string;
  reaction: string;
  fromMe?: boolean;
  instance?: string;
}

/** Send Location Params interface definition. */
export interface SendLocationParams {
  remoteJid: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  instance?: string;
}

/** Send Contact Params interface definition. */
export interface SendContactParams {
  remoteJid: string;
  fullName: string;
  phone: string;
  instance?: string;
}

/** Template Component interface definition. */
export interface TemplateComponent {
  type: 'header' | 'body' | 'button' | string;
  sub_type?: string;
  index?: number;
  parameters?: Array<{ type: string; text?: string; payload?: string; [key: string]: unknown }>;
}

/** Send Template Params interface definition. */
export interface SendTemplateParams {
  remoteJid: string;
  name: string;
  language?: string;
  components?: Array<Record<string, unknown>>;
}

/** Presence Params interface definition. */
export interface PresenceParams {
  remoteJid: string;
  presence: 'composing' | 'paused' | 'recording' | 'available' | 'unavailable';
  instance?: string;
}

/** Mark As Read Params interface definition. */
export interface MarkAsReadParams {
  remoteJid: string;
  messageIds: string[];
  instance?: string;
}
