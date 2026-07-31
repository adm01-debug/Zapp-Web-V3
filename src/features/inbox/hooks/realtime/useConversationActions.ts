import { dbFrom } from '@/integrations/datasource/db';
import { getLogger } from '@/lib/logger';
import { sendMessageToContact } from './messageSender';
import { isValidUUID } from '@/utils/uuid';
import { touchLastSeen } from '../../services/touchLastSeen';
import type { ConversationWithMessages } from './types';

const log = getLogger('ConversationActions');

type CommitFn = (
  updater:
    ConversationWithMessages[] | ((prev: ConversationWithMessages[]) => ConversationWithMessages[])
) => void;

interface UseConversationActionsOptions {
  commitConversations: CommitFn;
}

/** Provides sendMessage and markAsRead actions that write through to Supabase and optimistically update the local conversation list. */
export function useConversationActions({ commitConversations }: UseConversationActionsOptions) {
  const sendMessage = async (
    contactId: string,
    content: string,
    messageType: string = 'text',
    mediaUrl?: string,
    mediaPayload?: string
  ) => {
    if (!isValidUUID(contactId)) {
      log.warn('[sendMessage] contactId is not a valid UUID — skipping', { contactId });
      return null;
    }

    const response = await sendMessageToContact(
      contactId,
      content,
      messageType,
      mediaUrl,
      mediaPayload
    );

    try {
      const { data: conv } = await dbFrom('team_conversations')
        .select('id, routing_status')
        .eq('id', contactId)
        .maybeSingle();

      if (conv && conv.routing_status === 'pending') {
        await dbFrom('team_conversations')
          .update({ routing_status: 'assigned' })
          .eq('id', contactId);
      }
    } catch (err) {
      log.error('Error checking routing status on send:', err);
    }

    return response;
  };

  const markAsRead = async (contactId: string) => {
    if (!isValidUUID(contactId)) {
      log.warn(
        '[markAsRead] contactId is not a valid UUID — skipping to prevent 400 (likely a WhatsApp JID)',
        { contactId }
      );
      return;
    }

    const { error } = await dbFrom('messages')
      .update({ is_read: true })
      .eq('contact_id', contactId)
      .eq('sender', 'contact')
      .eq('is_read', false);
    if (error) log.error('Error marking messages as read:', error);

    // Touch last_seen throttled global (máx. 1 PATCH a cada 2min, deduplicado entre instâncias)
    touchLastSeen();

    commitConversations((prev) =>
      prev.map((c) =>
        c.contact.id === contactId
          ? { ...c, messages: c.messages.map((m) => ({ ...m, is_read: true })), unreadCount: 0 }
          : c
      )
    );
  };

  return { sendMessage, markAsRead };
}
