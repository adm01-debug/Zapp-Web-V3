/**
 * Types for evolution_* tables in the external FATOR X database
 */

// ─── evolution_messages ───────────────────────────────────────
export interface EvolutionMessage {
  id: string;
  message_id: string;
  remote_jid: string;
  from_me: boolean;
  message_type: string;
  content: string | null;
  media_url: string | null;
  media_mimetype: string | null;
  media_type: string | null;
  media_filename: string | null;
  media_size: number | null;
  caption: string | null;
  quoted_message_id: string | null;
  is_starred: boolean;
  is_important: boolean;
  category: string | null;
  sentiment: string | null;
  tags: string[] | null;
  notes: string | null;
  follow_up_at: string | null;
  follow_up_done: boolean;
  payload: Record<string, unknown> | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
  contact_id: string | null;
  conversation_id: string | null;
  direction: string;
  status: string;
  status_at: string | null;
  sent_by_bot: boolean;
  template_name: string | null;
  instance_name: string;
  push_name: string | null;
  deleted_at: string | null;
  reactions?: Array<{
    text: string;
    key: { remoteJid: string; fromMe: boolean; id: string };
  }> | null;
  media_meta?: {
    ptt?: boolean;
    [key: string]: unknown;
  } | null;
  ptt?: boolean;
}

// ─── evolution_messages (lite) ────────────────────────────────
// Lightweight projection used by chat list rendering. Excludes payload,
// raw_data, notes, tags, follow_up_*, contact_id, conversation_id, status,
// status_at duplicates, etc. Heavy fields are fetched on-demand via
// `useMessageDetails` (rpc_get_message_details).
export type EvolutionMessageLite = Pick<
  EvolutionMessage,
  | 'id'
  | 'message_id'
  | 'remote_jid'
  | 'from_me'
  | 'direction'
  | 'status'
  | 'message_type'
  | 'content'
  | 'media_url'
  | 'media_mimetype'
  | 'media_type'
  | 'media_filename'
  | 'caption'
  | 'quoted_message_id'
  | 'is_starred'
  | 'is_important'
  | 'sent_by_bot'
  | 'push_name'
  | 'instance_name'
  | 'created_at'
  | 'status_at'
  | 'deleted_at'
> & {
  reactions?: Array<{
    text: string;
    key: { remoteJid: string; fromMe: boolean; id: string };
  }> | null;
};

/**
 * Project a full EvolutionMessage (e.g. from a realtime payload) into the
 * lite shape, dropping heavy fields. Tolerant of missing keys.
 */
export function toEvolutionMessageLite(
  m: Partial<EvolutionMessage> & { id: string }
): EvolutionMessageLite {
  return {
    id: m.id,
    message_id: m.message_id ?? '',
    remote_jid: m.remote_jid ?? '',
    from_me: m.from_me ?? false,
    direction: m.direction ?? 'inbound',
    status: m.status ?? 'received',
    message_type: m.message_type ?? 'text',
    content: m.content ?? null,
    media_url: m.media_url ?? null,
    media_mimetype: m.media_mimetype ?? null,
    media_type: m.media_type ?? null,
    media_filename: m.media_filename ?? null,
    caption: m.caption ?? null,
    quoted_message_id: m.quoted_message_id ?? null,
    is_starred: m.is_starred ?? false,
    is_important: m.is_important ?? false,
    sent_by_bot: m.sent_by_bot ?? false,
    push_name: m.push_name ?? null,
    instance_name: m.instance_name ?? '',
    created_at: m.created_at ?? new Date().toISOString(),
    status_at: m.status_at ?? null,
    deleted_at: m.deleted_at ?? null,
    reactions: Array.isArray(m.reactions) ? m.reactions : [],
  };
}

// ─── evolution_webhook_events ─────────────────────────────────
export interface EvolutionWebhookEvent {
  id: string;
  event_type: string;
  instance_name: string;
  remote_jid: string | null;
  from_me: boolean;
  message_type: string;
  push_name: string | null;
  payload: Record<string, unknown> | unknown[];
  processed: boolean;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
}

// ─── evolution_settings ───────────────────────────────────────
export interface EvolutionSetting {
  id: string;
  key: string;
  value: string;
  description: string | null;
  category: string;
  is_secret: boolean;
  created_at: string;
  updated_at: string;
}

// ─── evolution_contacts ───────────────────────────────────────
export interface EvolutionContact {
  id: string;
  remote_jid: string;
  push_name: string | null;
  profile_picture_url: string | null;
  instance_name: string;
  is_group: boolean;
  tags: string[] | null;
  company: string | null;
  ai_sentiment: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

// ─── evolution_conversations ──────────────────────────────────
export interface EvolutionConversation {
  id: string;
  remote_jid: string;
  contact_id: string | null;
  instance_name: string;
  status: string;
  assigned_to: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Derived contact from messages (since evolution_contacts is empty) ──
export interface DerivedContact {
  remoteJid: string;
  pushName: string | null;
  phone: string;
  lastMessageAt: string;
  messageCount: number;
  unreadCount: number;
  lastMessageContent: string | null;
  lastMessageDirection: string;
  instanceName: string;
  profilePictureUrl?: string | null;
  tags?: string[] | null;
  company?: string | null;
  ai_sentiment?: string | null;
}
