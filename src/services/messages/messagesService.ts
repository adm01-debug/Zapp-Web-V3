/**
 * Messages Service
 *
 * Business logic layer for messages and conversations.
 */

import { messagesRepository, type Message, type Conversation } from './messagesRepository';
import type { ListResponse, QueryParams } from '@/services/api/types';

export const messagesService = {
  // Messages
  listMessages: async (filters?: Partial<Message> & QueryParams): Promise<ListResponse<Message>> => {
    return messagesRepository.listMessages(filters);
  },

  getMessage: async (id: string): Promise<Message | null> => {
    if (!id) throw new Error('Message ID is required');
    return messagesRepository.getMessage(id);
  },

  createMessage: async (data: Partial<Message>): Promise<Message> => {
    if (!data.conversation_id) {
      throw new Error('Conversation ID is required');
    }
    if (!data.content || data.content.trim().length === 0) {
      throw new Error('Message content is required');
    }
    if (!data.sender_type) {
      throw new Error('Sender type is required');
    }

    return messagesRepository.createMessage({
      ...data,
      content: data.content.trim(),
      message_type: data.message_type || 'text',
      status: 'sent',
      is_read: false,
    });
  },

  updateMessage: async (id: string, updates: Partial<Message>): Promise<Message> => {
    if (!id) throw new Error('Message ID is required');

    if (updates.content && updates.content.trim().length === 0) {
      throw new Error('Message content cannot be empty');
    }

    return messagesRepository.updateMessage(id, {
      ...updates,
      content: updates.content?.trim(),
    });
  },

  deleteMessage: async (id: string): Promise<{ id: string }> => {
    if (!id) throw new Error('Message ID is required');
    return messagesRepository.deleteMessage(id);
  },

  // Conversation messages
  listConversationMessages: async (conversationId: string, filters?: Partial<QueryParams>) => {
    if (!conversationId) throw new Error('Conversation ID is required');
    return messagesRepository.listConversationMessages(conversationId, filters);
  },

  // Conversations
  listConversations: async (filters?: Partial<Conversation> & QueryParams): Promise<ListResponse<Conversation>> => {
    return messagesRepository.listConversations(filters);
  },

  getConversation: async (id: string): Promise<Conversation | null> => {
    if (!id) throw new Error('Conversation ID is required');
    return messagesRepository.getConversation(id);
  },

  createConversation: async (data: Partial<Conversation>): Promise<Conversation> => {
    if (!data.contact_id) {
      throw new Error('Contact ID is required');
    }

    return messagesRepository.createConversation({
      ...data,
      status: 'open',
    });
  },

  updateConversation: async (id: string, updates: Partial<Conversation>): Promise<Conversation> => {
    if (!id) throw new Error('Conversation ID is required');
    return messagesRepository.updateConversation(id, updates);
  },

  deleteConversation: async (id: string): Promise<{ id: string }> => {
    if (!id) throw new Error('Conversation ID is required');
    return messagesRepository.deleteConversation(id);
  },

  // Conversation management
  closeConversation: async (id: string): Promise<Conversation> => {
    if (!id) throw new Error('Conversation ID is required');
    return messagesRepository.updateConversation(id, { status: 'closed' });
  },

  reopenConversation: async (id: string): Promise<Conversation> => {
    if (!id) throw new Error('Conversation ID is required');
    return messagesRepository.updateConversation(id, { status: 'open' });
  },

  assignConversation: async (id: string, agentId: string): Promise<Conversation> => {
    if (!id) throw new Error('Conversation ID is required');
    if (!agentId) throw new Error('Agent ID is required');

    return messagesRepository.updateConversation(id, {
      assigned_agent_id: agentId,
      status: 'open',
    });
  },

  // Message status
  getUnreadMessagesCount: async (conversationId: string) => {
    if (!conversationId) throw new Error('Conversation ID is required');
    return messagesRepository.getUnreadMessagesCount(conversationId);
  },

  markAsRead: async (conversationId: string, userId: string) => {
    if (!conversationId) throw new Error('Conversation ID is required');
    return messagesRepository.markMessagesAsRead(conversationId, userId);
  },

  // Real-time updates
  onMessageChange: (conversationId: string, callback: (message: Message) => void) => {
    return messagesRepository.subscribeToMessages(conversationId, callback);
  },

  onConversationChange: (callback: (conversation: Conversation) => void) => {
    return messagesRepository.subscribeToConversations(callback);
  },
};
