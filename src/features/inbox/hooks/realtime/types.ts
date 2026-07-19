/** Transient in-app notification payload shown when a new inbound message arrives in the background. */
export interface NewMessageNotification {
  id: string;
  contactId: string;
  contactName: string;
  contactAvatar: string | null;
  message: string;
  timestamp: Date;
}

/** Full message row as returned by Supabase Realtime subscriptions on `public.messages`, augmented with client-only fields (`contactAvatar`, `reactions`, `media_meta`). */
export interface RealtimeMessage {
  id: string;
  contact_id: string | null;
  agent_id: string | null;
  content: string;
  sender: string;
  message_type: string;
  media_url: string | null;
  is_read: boolean | null;
  status:
    | 'sending'
    | 'retrying'
    | 'sent'
    | 'delivered'
    | 'read'
    | 'played'
    | 'failed'
    | 'failed_auth'
    | 'failed_retries'
    | null;
  status_updated_at: string | null;
  created_at: string;
  updated_at: string;
  external_id: string | null;
  whatsapp_connection_id: string | null;
  transcription: string | null;
  transcription_status: string | null;
  is_deleted: boolean | null;
  /** Timestamp do soft delete (protocolMessage REVOKE). Null = mensagem viva. */
  deleted_at?: string | null;
  retry_attempt?: number | null;
  retry_total?: number | null;
  /** Cache do avatar do contato para mensagens recebidas. Propagado durante a hidratação/reconciliação. */
  contactAvatar?: string | null;
  reactions?: MessageReaction[] | null;
  /** Meta-informações brutas da Evolution/WhatsApp API (ex.: ptt, mime_type). */
  media_meta?: Record<string, unknown> | null;
  /** ID de meme de áudio do WhatsApp Business. Presente apenas em mensagens de tipo audio_meme. */
  audio_meme_id?: string | null;
}

/** Emoji reaction placed on a message by a specific user. */
export interface MessageReaction {
  user_id: string;
  emoji: string;
  created_at?: string;
}

/** Contact row shape used in the inbox conversation list; merges `public.contacts` columns with WhatsApp-specific metadata. */
export interface ConversationContact {
  id: string;
  name: string;
  surname: string | null;
  nickname: string | null;
  phone: string;
  email: string | null;
  avatar_url: string | null;
  tags: string[] | null;
  company: string | null;
  job_title: string | null;
  assigned_to: string | null;
  queue_id: string | null;
  created_at: string;
  updated_at: string;
  whatsapp_connection_id: string | null;
  contact_type: string | null;
  group_category: string | null;
  ai_sentiment: string | null;
  channel_type: string | null;
  channel_connection_id: string | null;
}

/** Aggregated view of a contact together with their sorted, deduplicated message list, unread count, and last message reference. */
export interface ConversationWithMessages {
  contact: ConversationContact;
  messages: RealtimeMessage[];
  unreadCount: number;
  lastMessage: RealtimeMessage | null;
}
