// W4 (2026-07-06): núcleo derivado do schema gerado; 'avatar' e 'createdAt' são
import type { ContactRow } from '@/integrations/supabase/schema';
// aliases camelCase client-side (mapeados de avatar_url/created_at nos adapters).
/** Contact type alias. */
export type Contact = Pick<NonNullable<ContactRow>, 'id' | 'name' | 'phone' | 'tags'> &
  Partial<
    Pick<
      NonNullable<ContactRow>,
      | 'nickname'
      | 'surname'
      | 'job_title'
      | 'company'
      | 'email'
      | 'contact_type'
      | 'whatsapp_connection_id'
    >
  > & {
    avatar?: string;
    createdAt: Date;
  };

// WhatsApp Interactive Message Types
/** Interactive Button interface definition. */
export interface InteractiveButton {
  type: 'reply' | 'url' | 'phone';
  id: string;
  title: string;
  // For URL buttons
  url?: string;
  // For phone buttons
  phoneNumber?: string;
}

/** Interactive List Section interface definition. */
export interface InteractiveListSection {
  title: string;
  rows: {
    id: string;
    title: string;
    description?: string;
  }[];
}

/** Interactive Message interface definition. */
export interface InteractiveMessage {
  type: 'buttons' | 'list' | 'cta_url';
  header?: {
    type: 'text' | 'image' | 'video' | 'document';
    text?: string;
    mediaUrl?: string;
  };
  body: string;
  footer?: string;
  // For button type
  buttons?: InteractiveButton[];
  // For list type
  listButtonText?: string;
  sections?: InteractiveListSection[];
}

// Location Message Types
/** Location Message interface definition. */
export interface LocationMessage {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  isLive?: boolean;
  liveUntil?: Date;
}

// Message Reaction Types (WhatsApp API)
/** Message Reaction interface definition. */
export interface MessageReaction {
  emoji: string;
  userId: string;
  userName?: string;
  timestamp: Date;
}

/** Message interface definition. */
export interface Message {
  id: string;
  conversationId: string;
  content: string;
  type:
    | 'text'
    | 'image'
    | 'audio'
    | 'video'
    | 'document'
    | 'interactive'
    | 'button_response'
    | 'location'
    | 'sticker';
  mediaUrl?: string;
  sender: 'contact' | 'agent';
  agentId?: string;
  timestamp: Date;
  status:
    | 'sending'
    | 'retrying'
    | 'sent'
    | 'delivered'
    | 'read'
    | 'played'
    | 'failed'
    | 'failed_auth'
    | 'failed_retries';
  // Interactive message data
  interactive?: InteractiveMessage;
  // Button response data (when user clicks a button)
  buttonResponse?: {
    buttonId: string;
    buttonTitle: string;
    originalMessageId: string;
  };
  // Reply/Quote reference
  replyTo?: {
    messageId: string;
    content: string;
    sender: 'contact' | 'agent';
  };
  // Location data
  location?: LocationMessage;
  // Forwarded indicator
  isForwarded?: boolean;
  // Reactions (WhatsApp API format)
  reactions?: MessageReaction[];
  // Audio transcription
  transcription?: string | null;
  transcriptionStatus?: 'pending' | 'processing' | 'completed' | 'failed' | null;
  // Edit tracking
  isEdited?: boolean;
  // Database fields (present when loaded from DB)
  external_id?: string;
  is_deleted?: boolean;
  /** Timestamp ISO de quando a mensagem foi apagada (soft delete via protocolMessage REVOKE). */
  deleted_at?: string | null;
  message_type?: string;
  senderName?: string;
  created_at?: string;
  updated_at?: string;
  // Persisted retry counters (survive page reload)
  retry_attempt?: number | null;
  retry_total?: number | null;
  /** Cache do avatar do contato para mensagens recebidas. */
  contactAvatar?: string | null;
  /** Indica se a mensagem é interna (whisper/nota). */
  isWhisper?: boolean;
  /** @internal Flag used for optimistic updates in the UI */
  _optimistic?: boolean;
  /** Meta-informações brutas (Evolution/WhatsApp API). Campos conhecidos são tipados; campos adicionais são aceitos via index. */
  media_meta?: (Record<string, unknown> & { ptt?: boolean; isPtv?: boolean }) | null;
}

export interface Conversation {
  id: string;
  contact: Contact;
  lastMessage?: Message;
  unreadCount: number;
  status: 'open' | 'pending' | 'resolved' | 'waiting';
  priority: 'high' | 'medium' | 'low';
  assignedTo?: Agent;
  queue?: Queue;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  // Sentiment tracking
  sentiment?: 'positive' | 'neutral' | 'negative' | 'critical';
  sentimentScore?: number;
  // SLA Overrides
  sla_warning_threshold_minutes?: number;
  sla_critical_threshold_minutes?: number;
  sla_notification_message?: string;
  sla_enabled?: boolean;
  is_muted?: boolean;
}

/** Agent interface definition. */
export interface Agent {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: 'dev' | 'admin' | 'supervisor' | 'agent';
  status: 'online' | 'away' | 'offline';
  activeChats: number;
  maxChats: number;
  queues: string[];
}

/** Queue interface definition. */
export interface Queue {
  id: string;
  name: string;
  color: string;
  description?: string;
  agents: string[];
  waitingCount: number;
}

/** Quick Reply interface definition. */
export interface QuickReply {
  id: string;
  title: string;
  content: string;
  shortcut: string;
  category: string;
}

/** Whats App Instance interface definition. */
export interface WhatsAppInstance {
  id: string;
  name: string;
  phone: string;
  status: 'connected' | 'disconnected' | 'connecting';
  qrCode?: string;
}
