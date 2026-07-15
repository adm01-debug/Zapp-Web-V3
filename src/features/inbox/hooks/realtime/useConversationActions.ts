// @ts-nocheck
import { useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { dbFrom } from '@/integrations/datasource/db';
import { getLogger } from '@/lib/logger';
import { sendMessageToContact } from './messageSender';
import { isValidUUID } from '@/utils/uuid';
import type { ConversationWithMessages } from './types';

const log = getLogger('ConversationActions');

type CommitFn = (
  updater:
    ConversationWithMessages[] | ((prev: ConversationWithMessages[]) => ConversationWithMessages[])
) => void;

interface UseConversationActionsOptions {
  commitConversations: CommitFn;
}

export function useConversationActions({ commitConversations }: UseConversationActionsOptions) {
  const lastSeenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendMessage = async (
    contactId: string,
    content: string,
    messageType: string = 'text',
    mediaUrl?: string,
    mediaPayload?: string
  ) => {
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

    if (lastSeenTimerRef.current) clearTimeout(lastSeenTimerRef.current);
    lastSeenTimerRef.current = setTimeout(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', user.id);
      }
    }, 5000);

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