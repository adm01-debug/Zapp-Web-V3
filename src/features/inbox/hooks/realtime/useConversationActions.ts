import { useCallback, useEffect, useRef } from 'react';
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
  // ── Batch markAsRead (2026-08-03) ────────────────────────────────────────
  // Mesmo padrão do useRealtimeMessages: chamadas individuais são coalescidas
  // e descarregadas em UM PATCH .in('contact_id', ids). O update otimista
  // (commitConversations) permanece imediato por chamada.
  const MARK_READ_FLUSH_MS = 250;
  const pendingMarkReadRef = useRef<Set<string>>(new Set());
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushMarkAsRead = useCallback(async () => {
    if (markReadTimerRef.current !== null) {
      clearTimeout(markReadTimerRef.current);
      markReadTimerRef.current = null;
    }
    const ids = Array.from(pendingMarkReadRef.current);
    pendingMarkReadRef.current = new Set();
    if (ids.length === 0) return;

    const { error } = await dbFrom('messages')
      .update({ is_read: true })
      .in('contact_id', ids)
      .eq('sender', 'contact')
      .eq('is_read', false);
    if (error) log.error('Error marking messages as read (batch):', error);

    // Touch last_seen throttled global (máx. 1 PATCH a cada 2min, deduplicado entre instâncias)
    touchLastSeen();
  }, []);

  const scheduleMarkAsReadFlush = useCallback(() => {
    if (markReadTimerRef.current !== null) clearTimeout(markReadTimerRef.current);
    markReadTimerRef.current = setTimeout(() => {
      markReadTimerRef.current = null;
      void flushMarkAsRead();
    }, MARK_READ_FLUSH_MS);
  }, [flushMarkAsRead]);

  const applyOptimisticRead = useCallback(
    (contactIds: string[]) => {
      const idSet = new Set(contactIds);
      commitConversations((prev) =>
        prev.map((c) =>
          idSet.has(c.contact.id)
            ? { ...c, messages: c.messages.map((m) => ({ ...m, is_read: true })), unreadCount: 0 }
            : c
        )
      );
    },
    [commitConversations]
  );

  const markAsRead = useCallback(
    async (contactId: string) => {
      if (!isValidUUID(contactId)) {
        log.warn(
          '[markAsRead] contactId is not a valid UUID — skipping to prevent 400 (likely a WhatsApp JID)',
          { contactId }
        );
        return;
      }

      // Otimista imediato (mesma UX de antes, sem esperar o PATCH)
      applyOptimisticRead([contactId]);
      // PATCH coalescido: rajadas de seleção viram 1 chamada .in()
      pendingMarkReadRef.current.add(contactId);
      scheduleMarkAsReadFlush();
    },
    [applyOptimisticRead, scheduleMarkAsReadFlush]
  );

  /** Marca várias conversas como lidas em UM PATCH batch (.in('contact_id', ids)). */
  const markManyAsRead = useCallback(
    (contactIds: string[]) => {
      const validIds = contactIds.filter(isValidUUID);
      if (validIds.length === 0) return;
      applyOptimisticRead(validIds);
      for (const id of validIds) pendingMarkReadRef.current.add(id);
      scheduleMarkAsReadFlush();
    },
    [applyOptimisticRead, scheduleMarkAsReadFlush]
  );

  // Flush pendente no unmount (fire-and-forget) — evita perder writes quando
  // o usuário navega antes do debounce disparar.
  useEffect(() => {
    return () => {
      if (markReadTimerRef.current !== null) {
        clearTimeout(markReadTimerRef.current);
        markReadTimerRef.current = null;
      }
      void flushMarkAsRead();
    };
  }, [flushMarkAsRead]);
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

  return { sendMessage, markAsRead, markManyAsRead };
}
