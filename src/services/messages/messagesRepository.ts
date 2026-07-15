// @ts-nocheck
/**
 * Messages Repository
 *
 * Data access layer for messages and conversations.
 */

import { supabase } from '@/integrations/supabase/client';
import { createService } from '@/services/api/genericService';
import type { ListResponse, QueryParams } from '@/services/api/types';

export interface Message {
  id: string;
  conversation_id: string;
  contact_id: string;
  sender_type: 'contact' | 'agent' | 'system';
  sender_id?: string;
  content: string;
  media_urls?: string[];
  message_type: 'text' | 'image' | 'document' | 'audio' | 'video';
  status: 'sent' | 'delivered' | 'read' | 'failed';
  is_read: boolean;
  read_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  contact_id: string;
  queue_id?: string;
  assigned_agent_id?: string;
  status: 'open' | 'closed' | 'waiting' | 'paused';
  subject?: string;
  last_message_at?: string;
  created_at: string;
  updated_at: string;
}

// Base services
const messagesBaseService = createService<Message>('messages');
const conversationsBaseService = createService<Conversation>('conversations');

export const messagesRepository = {
  // Messages
  listMessages: (filters?: Partial<Message> & QueryParams) =>
    messagesBaseService.list(filters),

  getMessage: (id: string) =>
    messagesBaseService.get(id),

  createMessage: (data: Partial<Message>) =>
    messagesBaseService.create(data),

  updateMessage: (id: string, updates: Partial<Message>) =>
    messagesBaseService.update(id, updates),

  deleteMessage: (id: string) =>
    messagesBaseService.delete(id),

  // Conversation messages
  async listConversationMessages(conversationId: string, filters?: Partial<QueryParams>) {
    const { data, error, count } = await supabase
      .from('messages')
      .select('*', { count: 'exact' })
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(filters?.limit || 50)
      .offset(filters?.offset || 0);

    return { data: data || [], error, count };
  },

  // Conversations
  listConversations: (filters?: Partial<Conversation> & QueryParams) =>
    conversationsBaseService.list(filters),

  getConversation: (id: string) =>
    conversationsBaseService.get(id),

  createConversation: (data: Partial<Conversation>) =>
    conversationsBaseService.create(data),

  updateConversation: (id: string, updates: Partial<Conversation>) =>
    conversationsBaseService.update(id, updates),

  deleteConversation: (id: string) =>
    conversationsBaseService.delete(id),

  // Unread messages count
  async getUnreadMessagesCount(conversationId: string) {
    const { count, error } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversationId)
      .eq('is_read', false);

    return { count: count || 0, error };
  },

  // Mark as read
  async markMessagesAsRead(conversationId: string, userId: string) {
    const { error } = await supabase
      .from('messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('is_read', false);

    return { error };
  },

  // Realtime subscriptions
  subscribeToMessages: (conversationId: string, callback: (message: Message) => void) => {
    return supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'zapp',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: any) => callback(payload.new || payload.old)
      )
      .subscribe();
  },

  subscribeToConversations: (callback: (conversation: Conversation) => void) =>
    conversationsBaseService.subscribe(callback),
};