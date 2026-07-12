import { useState, useEffect, useCallback, useRef } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { log } from '@/lib/logger';
import { logMessagesSubscribe, wrapMessagesHandler } from '@/lib/devRealtimeLogger';
import { messageService } from '../services/messageService';
import { messageRepository } from '../data-access/messageRepository';
import type { Message } from '@/types/chat';
import type { RealtimeMessage } from './useRealtimeMessages';

import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface UseMessagesOptions {
  contactId: string | null;
  enabled?: boolean;
}

export function useMessages({ contactId, enabled = true }: UseMessagesOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const previousContactIdRef = useRef<string | null>(null);
  // Tracks the contactId of the most-recently-started fetch so stale in-flight
  // responses from a previous contact are discarded when the user switches fast.
  const latestFetchContactIdRef = useRef<string | null>(null);
  const mountedRef = useMountedRef();

  // Fetch messages for contact
  const fetchMessages = useCallback(async () => {
    if (!contactId || !mountedRef.current) {
      // Nullify so any in-flight response for a prior contact fails the stale check.
      latestFetchContactIdRef.current = null;
      if (mountedRef.current) {
        setMessages([]);
        setLoading(false);
      }
      setLoading(false);
      return;
    }

    const thisContactId = contactId;
    latestFetchContactIdRef.current = thisContactId;

    try {
      setLoading(true);
      setError(null);

      const mappedMessages = await messageService.getAllMessagesForContact(thisContactId);

      // Discard response if a newer fetch for a different contact has started.
      if (mountedRef.current && latestFetchContactIdRef.current === thisContactId)
        setMessages(mappedMessages as Message[]);
    } catch (err) {
      log.error('Error fetching messages:', err);
      if (mountedRef.current && latestFetchContactIdRef.current === thisContactId)
        setError(err instanceof Error ? err.message : 'Failed to fetch messages');
    } finally {
      if (mountedRef.current && latestFetchContactIdRef.current === thisContactId)
        setLoading(false);
    }
  }, [contactId]);

  // Handle new message from realtime
  const handleNewMessage = useCallback(
    (payload: RealtimePostgresChangesPayload<RealtimeMessage>) => {
      const newMessage = messageService.mapMessage(payload.new as RealtimeMessage);

      if (newMessage.conversationId === contactId) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMessage.id)) {
            return prev;
          }
          return [...prev, newMessage];
        });
      }
    },
    [contactId]
  );

  const handleMessageUpdate = useCallback(
    (payload: RealtimePostgresChangesPayload<RealtimeMessage>) => {
      const updatedMessage = messageService.mapMessage(payload.new as RealtimeMessage);

      if (updatedMessage.conversationId === contactId) {
        setMessages((prev) => prev.map((m) => (m.id === updatedMessage.id ? updatedMessage : m)));
      }
    },
    [contactId]
  );

  const handleMessageDelete = useCallback(
    (payload: RealtimePostgresChangesPayload<RealtimeMessage>) => {
      const deletedMessage = payload.old as RealtimeMessage;

      if (deletedMessage && (deletedMessage.contact_id === contactId || deletedMessage.id)) {
        setMessages((prev) => prev.filter((m) => m.id !== deletedMessage.id));
      }
    },
    [contactId]
  );

  // Fetch on contact change
  useEffect(() => {
    if (enabled && contactId !== previousContactIdRef.current) {
      previousContactIdRef.current = contactId;
      void fetchMessages();
    }
  }, [contactId, enabled, fetchMessages]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!enabled || !contactId) return;

    logMessagesSubscribe('useMessages', {
      event: 'INSERT',
      table: 'messages',
      filter: `contact_id=eq.${contactId}`,
    });
    logMessagesSubscribe('useMessages', {
      event: 'UPDATE',
      table: 'messages',
      filter: `contact_id=eq.${contactId}`,
    });
    logMessagesSubscribe('useMessages', {
      event: 'DELETE',
      table: 'messages',
      filter: `contact_id=eq.${contactId}`,
    });

    const channel = messageRepository.subscribeToMessages(contactId, {
      onInsert: wrapMessagesHandler('useMessages', handleNewMessage),
      onUpdate: wrapMessagesHandler('useMessages', handleMessageUpdate),
      onDelete: wrapMessagesHandler('useMessages', handleMessageDelete),
    });

    return () => {
      messageRepository.unsubscribe(channel);
    };
  }, [contactId, enabled, handleNewMessage, handleMessageUpdate, handleMessageDelete]);

  // Add a message optimistically
  const addMessage = useCallback((message: Message) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === message.id)) {
        return prev;
      }
      return [...prev, message];
    });
  }, []);

  // Update a message optimistically
  const updateMessage = useCallback((messageId: string, updates: Partial<Message>) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, ...updates } : m)));
  }, []);

  // Remove a message optimistically
  const removeMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  return {
    messages,
    loading,
    error,
    refetch: fetchMessages,
    addMessage,
    updateMessage,
    removeMessage,
  };
}
