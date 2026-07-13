// @ts-nocheck
import { useState, useEffect, useCallback, useRef } from 'react';
import { dbFrom, dbTable, dbChannel, dbRemoveChannel } from '@/integrations/datasource/db';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { getLogger } from '@/lib/logger';
import { sendMessageToContact as _sendMessageToContact } from './realtime/messageSender';
import {
  normalizeMessage,
  buildConversation,
  dedupeContacts,
  buildConversations,
  getUniqueMessageContactIds,
  chunkArray,
} from './realtime/realtimeUtils';
import { useRealtimeNotifications } from './realtime/useRealtimeNotifications';
import { useMessageUpdateBatcher } from './realtime/useMessageUpdateBatcher';
import { logMessagesSubscribe, wrapMessagesHandler } from '@/lib/devRealtimeLogger';
import { useConversationsFilter } from './realtime/useConversationsFilter';
import { useConversationActions } from './realtime/useConversationActions';
import { useConversationSendState } from './realtime/useConversationSendState';
import type {
  NewMessageNotification,
  RealtimeMessage,
  ConversationContact,
  ConversationWithMessages,
} from './realtime/types';

export type {
  NewMessageNotification,
  RealtimeMessage,
  ConversationContact,
  ConversationWithMessages,
} from './realtime/types';
export type { MessageBatcherStatus } from './realtime/useMessageUpdateBatcher';
export type { ConversationSendState } from './realtime/useConversationSendState';

const log = getLogger('RealtimeMessages');
const SEEDED_CONTACT_LIMIT = 500;
const RECENT_MESSAGES_LIMIT = 1000;
const CONTACT_FETCH_CHUNK_SIZE = 200;

export function useRealtimeMessages() {
  const [conversations, setConversations] = useState<ConversationWithMessages[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const conversationsRef = useRef<ConversationWithMessages[]>([]);

  // Cache para evitar N+1 queries em contactos
  const contactsCacheRef = useRef<Map<string, ConversationContact>>(new Map());
  const contactBatchRef = useRef<Set<string>>(new Set());
  const contactBatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    newMessageNotification,
    notifyAboutIncomingMessage,
    dismissNotification,
    setSelectedContact,
    setSoundEnabled,
  } = useRealtimeNotifications();

  // Cleanup cache on unmount
  useEffect(() => {
    return () => {
      if (contactBatchTimerRef.current) {
        clearTimeout(contactBatchTimerRef.current);
      }
      contactsCacheRef.current.clear();
      contactBatchRef.current.clear();
    };
  }, []);

  const commitConversations = useCallback(
    (
      updater:
        | ConversationWithMessages[]
        | ((prev: ConversationWithMessages[]) => ConversationWithMessages[])
    ) => {
      setConversations((prev) => {
        const next =
          typeof updater === 'function'
            ? (updater as (prev: ConversationWithMessages[]) => ConversationWithMessages[])(prev)
            : updater;
        conversationsRef.current = next;
        return next;
      });
    },
    []
  );

  const fetchContactsByIds = useCallback(async (contactIds: string[]) => {
    const uniqueIds = Array.from(new Set(contactIds.filter(Boolean)));
    if (uniqueIds.length === 0) return [] as ConversationContact[];

    const missingIds = uniqueIds.filter((id) => !contactsCacheRef.current.has(id));
    if (missingIds.length === 0) {
      return uniqueIds.map((id) => contactsCacheRef.current.get(id)!);
    }

    const fetchedContacts: ConversationContact[] = [];

    for (const idsChunk of chunkArray(uniqueIds, CONTACT_FETCH_CHUNK_SIZE)) {
      const { data, error: contactsError } = await dbFrom('contacts')
        .select('*')
        .in('id', idsChunk);

      if (contactsError) throw contactsError;
      const contacts = (data ?? []) as ConversationContact[];
      contacts.forEach((c) => {
        contactsCacheRef.current.set(c.id, c);
      });
      fetchedContacts.push(...contacts);
    }

    const allContacts = [
      ...fetchedContacts,
      ...uniqueIds.map((id) => contactsCacheRef.current.get(id)!).filter(Boolean),
    ];
    return dedupeContacts(allContacts);
  }, []);

  const hydrateConversationForMessage = useCallback(
    async (message: RealtimeMessage) => {
      if (!message.contact_id) return;
      try {
        const [contact] = await fetchContactsByIds([message.contact_id]);
        if (!contact) {
          log.warn('Incoming message received for unknown contact', {
            contactId: message.contact_id,
          });
          return;
        }
        commitConversations((prev) => {
          const idx = prev.findIndex((c) => c.contact.id === contact.id);
          if (idx >= 0) {
            const existing = prev[idx];
            if (existing.messages.some((m) => m.id === message.id)) return prev;

            const messageWithAvatar = {
              ...message,
              contactAvatar: contact.avatar_url || message.contactAvatar,
            };

            const updated = [...prev];
            updated.splice(idx, 1);
            updated.unshift(buildConversation(contact, [...existing.messages, messageWithAvatar]));
            return updated;
          }

          const initialMessageWithAvatar = {
            ...message,
            contactAvatar: contact.avatar_url || message.contactAvatar,
          };
          return [buildConversation(contact, [initialMessageWithAvatar]), ...prev];
        });
        notifyAboutIncomingMessage(contact, message);
      } catch (err) {
        log.error('Error hydrating conversation for incoming message:', err);
      }
    },
    [commitConversations, fetchContactsByIds, notifyAboutIncomingMessage]
  );

  const { handleMessageUpdate, batcherStatus } = useMessageUpdateBatcher(
    conversationsRef,
    commitConversations,
    hydrateConversationForMessage
  );

  const handleNewMessage = useCallback(
    (payload: RealtimePostgresChangesPayload<RealtimeMessage>) => {
      const newMessage = normalizeMessage(payload.new);
      if (!newMessage.contact_id) return;

      const existingConversation = conversationsRef.current.find(
        (c) => c.contact.id === newMessage.contact_id
      );
      if (!existingConversation) {
        void hydrateConversationForMessage(newMessage);
        return;
      }

      commitConversations((prev) => {
        const idx = prev.findIndex((c) => c.contact.id === newMessage.contact_id);
        if (idx < 0) return prev;
        const conv = prev[idx];
        if (conv.messages.some((m) => m.id === newMessage.id)) return prev;

        const messageWithAvatar = {
          ...newMessage,
          contactAvatar: conv.contact.avatar_url || newMessage.contactAvatar,
        };

        const updated = [...prev];
        updated.splice(idx, 1);
        updated.unshift(buildConversation(conv.contact, [...conv.messages, messageWithAvatar]));
        return updated;
      });

      notifyAboutIncomingMessage(existingConversation.contact, newMessage);
    },
    [commitConversations, hydrateConversationForMessage, notifyAboutIncomingMessage]
  );

  const handleMessageDelete = useCallback(
    (payload: RealtimePostgresChangesPayload<RealtimeMessage>) => {
      const deletedMessage = payload.old;
      if (!deletedMessage?.id || !deletedMessage?.contact_id) return;

      commitConversations((prev) => {
        const idx = prev.findIndex((c) => c.contact.id === deletedMessage.contact_id);
        if (idx < 0) return prev;
        const conv = prev[idx];
        if (!conv.messages.some((m) => m.id === deletedMessage.id)) return prev;

        const remainingMessages = conv.messages.filter((m) => m.id !== deletedMessage.id);
        const updated = [...prev];
        updated[idx] = buildConversation(conv.contact, remainingMessages);
        return updated;
      });
    },
    [commitConversations]
  );

  const fetchConversations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: seededContacts, error: contactsError } = await dbFrom('contacts')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(SEEDED_CONTACT_LIMIT);

      if (contactsError) throw contactsError;

      const { data: recentMessages, error: messagesError } = await dbFrom('messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(RECENT_MESSAGES_LIMIT);

      if (messagesError) throw messagesError;

      const normalizedMessages = ((recentMessages ?? []) as RealtimeMessage[]).map(
        normalizeMessage
      );
      const seededContactRows = (seededContacts ?? []) as ConversationContact[];
      const seededContactIds = new Set(seededContactRows.map((c) => c.id));
      const missingContactIds = getUniqueMessageContactIds(normalizedMessages).filter(
        (id) => !seededContactIds.has(id)
      );
      const messageContacts = await fetchContactsByIds(missingContactIds);
      commitConversations(
        buildConversations([...seededContactRows, ...messageContacts], normalizedMessages)
      );
    } catch (err) {
      log.error('Error fetching conversations:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch conversations');
    } finally {
      setLoading(false);
    }
  }, [commitConversations, fetchContactsByIds]);

  useEffect(() => {
    let active = true;
    void fetchConversations();

    log.info('Subscribing to realtime', { source: dbTable('messages') });

    const channelName = `messages-realtime-${Math.random().toString(36).slice(2, 9)}`;
    logMessagesSubscribe('useRealtimeMessages', { event: 'INSERT', table: dbTable('messages') });
    logMessagesSubscribe('useRealtimeMessages', { event: 'UPDATE', table: dbTable('messages') });
    logMessagesSubscribe('useRealtimeMessages', { event: 'DELETE', table: dbTable('messages') });

    const adaptEvoPayload = (
      p: RealtimePostgresChangesPayload<Record<string, unknown>>
    ): RealtimePostgresChangesPayload<RealtimeMessage> => {
      const map = (r: Record<string, unknown> | undefined) =>
        r && {
          ...r,
          sender: (r as { from_me?: boolean }).from_me ? 'agent' : 'contact',
          is_deleted: (r as { deleted_at?: string | null }).deleted_at != null,
        };
      return {
        ...p,
        new: map(p.new as Record<string, unknown>),
        old: map(p.old as Record<string, unknown>),
      } as unknown as RealtimePostgresChangesPayload<RealtimeMessage>; // ignore-audit — evo.evolution_messages adapter; mapped shape is structurally RealtimeMessage at runtime
    };

    const channel = dbChannel('messages', channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'evo', table: 'evolution_messages' },
        (payload) => {
          if (active)
            wrapMessagesHandler(
              'useRealtimeMessages',
              handleNewMessage
            )(adaptEvoPayload(payload as RealtimePostgresChangesPayload<Record<string, unknown>>));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'evo', table: 'evolution_messages' },
        (payload) => {
          if (active)
            wrapMessagesHandler(
              'useRealtimeMessages',
              handleMessageUpdate
            )(adaptEvoPayload(payload as RealtimePostgresChangesPayload<Record<string, unknown>>));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'evo', table: 'evolution_messages' },
        (payload) => {
          if (active)
            wrapMessagesHandler(
              'useRealtimeMessages',
              handleMessageDelete
            )(adaptEvoPayload(payload as RealtimePostgresChangesPayload<Record<string, unknown>>));
        }
      )
      .subscribe((status) => {
        if (active) log.debug('Subscription status', { status });
      });

    return () => {
      active = false;
      void dbRemoveChannel('messages', channel);
    };
  }, [fetchConversations, handleNewMessage, handleMessageUpdate, handleMessageDelete]);

  const { sendMessage, markAsRead } = useConversationActions({ commitConversations });

  const { conversationSendState } = useConversationSendState(conversations);

  const {
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    sortBy,
    setSortBy,
    filteredConversations,
  } = useConversationsFilter(conversations);

  return {
    conversations: filteredConversations,
    allConversations: conversations,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    sortBy,
    setSortBy,
    loading,
    error,
    sendMessage,
    markAsRead,
    refetch: fetchConversations,
    newMessageNotification,
    dismissNotification,
    setSelectedContact,
    setSoundEnabled,
    conversationSendState,
    batcherStatus,
    /**
     * @deprecated Use the hook directly where needed
     */
    optimistic: {
      pendingCount: 0,
      mergeWithReal: <T>(m: T): T => m,
    },
  };
}
