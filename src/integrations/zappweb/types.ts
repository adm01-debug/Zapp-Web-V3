/**
 * Tipos do domínio Zap Webb — refletem o schema das tabelas `evolution_*`
 * conforme documentado em docs/HANDOFF_LOVABLE_ZAP_WEBB.md.
 *
 * Todas as tabelas (exceto `evolution_contacts`) são particionadas por
 * `instance_name` (24 partições). Sempre filtre por `instance_name` nas
 * queries via `ZAPPWEB_INSTANCE`.
 */

export type WhatsAppMessageType =
  | 'conversation'
  | 'extendedTextMessage'
  | 'text'
  | 'audioMessage'
  | 'audio'
  | 'imageMessage'
  | 'image'
  | 'videoMessage'
  | 'video'
  | 'documentMessage'
  | 'document'
  | 'stickerMessage'
  | 'sticker'
  | 'reaction'
  | string;

/** Message Status type alias. */
export type MessageStatus = 'sent' | 'delivered' | 'read' | 'pending' | 'failed';
/** Conversation Status type alias. */
export type ConversationStatus = 'aberta' | 'arquivada';
/** Conversation Priority type alias. */
export type ConversationPriority = 'normal' | 'alta' | 'urgente';
/** Lead Status type alias. */
export type LeadStatus =
  | 'novo'
  | 'qualificado'
  | 'em_negociacao'
  | 'cliente'
  | 'perdido'
  | string;

/** Evolution Contact interface definition. */
export interface EvolutionContact {
  id: string;
  remote_jid: string;
  phone_number: string | null;
  push_name: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  email: string | null;
  company: string | null;
  role_title: string | null;
  lead_status: LeadStatus;
  lead_score: number;
  assigned_to: string | null;
  tags: string[] | null;
  profile_picture_url: string | null;
  total_messages: number | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Evolution Conversation interface definition. */
export interface EvolutionConversation {
  id: string;
  contact_id: string | null;
  remote_jid: string;
  status: ConversationStatus;
  unread_count: number;
  last_message_content: string | null;
  last_message_type: WhatsAppMessageType | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  assigned_to: string | null;
  department: string | null;
  priority: ConversationPriority;
  is_bot_active: boolean | null;
  instance_name: string;
  evolution_contacts?: EvolutionContact | null;
}

/** Evolution Message interface definition. */
export interface EvolutionMessage {
  id: string;
  message_id: string;
  remote_jid: string;
  from_me: boolean;
  message_type: WhatsAppMessageType;
  content: string | null;
  media_url: string | null;
  media_mimetype: string | null;
  media_type: 'image' | 'audio' | 'video' | 'document' | 'sticker' | null;
  media_filename?: string | null;
  caption: string | null;
  quoted_message_id: string | null;
  status: MessageStatus | null;
  push_name?: string | null;
  contact_id: string | null;
  conversation_id: string | null;
  created_at: string;
  deleted_at: string | null;
  edited_at?: string | null;
  instance_name: string;
}
