/**
 * Messages Repository
 *
 * Data access layer for messages and conversations.
 */

import { supabase } from '@/integrations/supabase/client';
import { createService } from '@/services/api/genericService';
import type { QueryParams } from '@/services/api/types';

/** Message interface — matches evo.evolution_messages physical columns. */
export interface Message {
  id: string;
  instance_name?: string;
  remote_jid?: string;
  message_id?: string;
  from_me?: boolean;
  push_name?: string;
  message_type?: string;
  content?: string;
  media_url?: string;
  status?: string;
  timestamp?: string;
  raw?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  contact_id?: string;
  conversation_id?: string;
  direction?: 'inbound' | 'outbound';
  is_read?: boolean;
  is_starred?: boolean;
  is_important?: boolean;
  follow_up_at?: string | null;
  follow_up_done?: boolean;
  category?: string | null;
  sentiment?: string | null;
  tags?: string[];
  notes?: string | null;
  deleted_at?: string | null;
  agent_id?: string | null;
  transcription?: string | null;
  transcription_status?: string | null;
  ptt?: boolean;
  media_meta?: Record<string, unknown> | null;
  reactions?: unknown[];
  caption?: string | null;
  full_name?: string | null;
  phone_number?: string | null;
}

/**
 * Conversation interface — matches evo.evolution_conversations physical columns.
 * status values are Portuguese per the CHECK constraint: 'aberta' | 'arquivada'.
 * assigned_to is the correct column name (not assigned_agent_id).
 */
export interface Conversation {
  id: string;
  instance_name?: string;
  remote_jid?: string;
  contact_id?: string;
  last_message_at?: string;
  last_message_preview?: string;
  unread_count?: number;
  assigned_to?: string | null;
  status?: 'aberta' | 'arquivada';
  raw?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// Base services — evolution_messages / evolution_conversations are the physical tables
// in the zapp schema (auto-updatable views over evo.evolution_messages root partition)
const messagesBaseService = createService<Message>('evolution_messages');
const conversationsBaseService = createService<Conversation>('evolution_conversations');

/** messages Repository constant. */
export const messagesRepository = {
  // Messages
  listMessages: (filters?: Partial<Message> & QueryParams) => messagesBaseService.list(filters),

  getMessage: (id: string) => messagesBaseService.get(id),

  createMessage: (data: Partial<Message>) => messagesBaseService.create(data),

  updateMessage: (id: string, updates: Partial<Message>) => messagesBaseService.update(id, updates),

  deleteMessage: (id: string) => messagesBaseService.delete(id),

  // Conversation messages
  async listConversationMessages(conversationId: string, filters?: Partial<QueryParams>) {
    const limit = filters?.pageSize ?? 50;
    const page = filters?.page ?? 1;
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data, error, count } = await supabase
      .from('evolution_messages')
      .select('*', { count: 'planned' })
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .range(from, to);

    return { data: data || [], error, count };
  },

  // Conversations
  listConversations: (filters?: Partial<Conversation> & QueryParams) =>
    conversationsBaseService.list(filters),

  getConversation: (id: string) => conversationsBaseService.get(id),

  createConversation: (data: Partial<Conversation>) => conversationsBaseService.create(data),

  updateConversation: (id: string, updates: Partial<Conversation>) =>
    conversationsBaseService.update(id, updates),

  deleteConversation: (id: string) => conversationsBaseService.delete(id),

  // Unread messages count
  async getUnreadMessagesCount(conversationId: string) {
    const { count, error } = await supabase
      .from('evolution_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('is_read', false);

    return { count: count || 0, error };
  },

  // Mark as read (E84 — rpc_mark_messages_read)
  async markMessagesAsRead(conversationId: string, _userId: string) {
    const { error } = await supabase.rpc('rpc_mark_messages_read', {
      p_conversation_id: conversationId,
    });
    return { error };
  },
};
