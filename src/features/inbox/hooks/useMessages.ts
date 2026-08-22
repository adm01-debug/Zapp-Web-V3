import { useState, useEffect, useCallback, useRef } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { getLogger } from '@/lib/logger';

const log = getLogger('useMessages');
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

/** Fetches and subscribes to the message list for a given contact; supports optimistic add/update/remove operations and Realtime INSERT/UPDATE/DELETE events. */
export function useMessages({ contactId, enabled = true }: UseMessagesOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const previousContactIdRef = useRef<string | null>(null);
  const mountedRef = useMountedRef();
  // RCA 2026-08-21: sem AbortController, trocar de contato rapidamente não
  // cancelava o fetch (potencialmente multi-página) do contato anterior —
  // ele continuava ocupando slot do semáforo Supabase até resolver/timeout.
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch messages for contact
  const fetchMessages = useCallback(async () => {
    abortControllerRef.current?.abort();
    if (!contactId || !mountedRef.current) {
      if (mountedRef.current) {
        setMessages([]);
        setLoading(false);
      }
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      setLoading(true);
      setError(null);

      const mappedMessages = await messageService.getAllMessagesForContact(
        contactId,
        controller.signal
      );

      if (mountedRef.current && !controller.signal.aborted) {
        setMessages(mappedMessages as Message[]);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      log.error('Error fetching messages:', err);
      if (mountedRef.current)
        setError(err instanceof Error ? err.message : 'Failed to fetch messages');
    } finally {
      if (mountedRef.current && !controller.signal.aborted) setLoading(false);
    }
  }, [contactId, mountedRef]);

  // Cancela o fetch em voo ao desmontar (troca de contato via key={id} no
  // pai, ou saída do inbox) — sem isso o request abandonado seguia
  // ocupando o semáforo até resolver ou estourar timeout.
  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  // Handle new message from realtime
  const handleNewMessage = useCallback(
    (payload: RealtimePostgresChangesPayload<RealtimeMessage>) => {
      const newMessage = messageService.mapMessage(payload.new);

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
      const updatedMessage = messageService.mapMessage(payload.new);

      if (updatedMessage.conversationId === contactId) {
        setMessages((prev) => prev.map((m) => (m.id === updatedMessage.id ? updatedMessage : m)));
      }
    },
    [contactId]
  );

  const handleMessageDelete = useCallback(
    (payload: RealtimePostgresChangesPayload<RealtimeMessage>) => {
      const deletedMessage = payload.old as Partial<RealtimeMessage> | undefined;

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

    if (!channel) return;

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
