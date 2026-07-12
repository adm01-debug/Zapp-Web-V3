import { Conversation, Message } from '@/types/chat';
import type {
  ConversationWithMessages,
  RealtimeMessage,
} from '@/features/inbox/hooks/realtime/types';

/**
 * Pure transformation functions to map between internal Realtime formats
 * and legacy UI formats (Conversation/Message).
 */

export function mapToLegacyConversation(
  resolved: ConversationWithMessages | null
): Conversation | null {
  if (!resolved) return null;

  return {
    id: resolved.contact.id,
    contact: {
      id: resolved.contact.id,
      name: resolved.contact.name,
      phone: resolved.contact.phone,
      email: resolved.contact.email || undefined,
      avatar: resolved.contact.avatar_url || undefined,
      tags: resolved.contact.tags || [],
      createdAt: new Date(resolved.contact.created_at),
      contact_type: resolved.contact.contact_type || undefined,
      whatsapp_connection_id: resolved.contact.whatsapp_connection_id || undefined,
    },
    lastMessage: resolved.lastMessage
      ? {
          id: resolved.lastMessage.id,
          conversationId: resolved.contact.id,
          content: resolved.lastMessage.content,
          type: resolved.lastMessage.message_type as Message['type'],
          sender: resolved.lastMessage.sender as Message['sender'],
          timestamp: new Date(resolved.lastMessage.created_at),
          status: 'read' as const,
        }
      : undefined,
    unreadCount: resolved.unreadCount,
    status: 'open',
    priority: 'medium',
    tags: resolved.contact.tags || [],
    createdAt: new Date(resolved.contact.created_at),
    updatedAt: new Date(resolved.contact.updated_at),
  };
}

export function mapToLegacyMessages(
  messageSource: RealtimeMessage[],
  contactId: string,
  contactAvatar?: string | null
): Message[] {
  return messageSource.map((m) => ({
    id: m.id,
    conversationId: contactId,
    content: m.content,
    type: m.message_type as Message['type'],
    sender: m.sender as Message['sender'],
    agentId: m.agent_id || undefined,
    timestamp: new Date(m.created_at),
    status: (m.status as Message['status'] | null) || (m.is_read ? 'read' : 'delivered'),
    mediaUrl: m.media_url || undefined,
    transcription: m.transcription || null,
    transcriptionStatus: (m.transcription_status as Message['transcriptionStatus']) || null,
    is_deleted: m.is_deleted ?? false,
    external_id: m.external_id || undefined,
    retry_attempt: m.retry_attempt ?? null,
    retry_total: m.retry_total ?? null,
    contactAvatar: m.contactAvatar || contactAvatar,
  }));
}
