import { useCallback, useRef, useState } from 'react';
import { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { normalizeMessage, buildConversation } from './realtimeUtils';
import type { ConversationWithMessages, RealtimeMessage } from '../useRealtimeMessages';

export interface MessageBatcherStatus {
  /** True while there are pending updates waiting for the debounce window to flush. */
  isBatching: boolean;
  /** Number of distinct messages currently queued for the next flush. */
  pendingCount: number;
  /** Total number of flushes performed since the batcher mounted (useful for debugging). */
  flushedBatches: number;
}

/**
 * Batches rapid message UPDATE events (e.g. status changes) to reduce renders.
 *
 * Also exposes an observable `status` so the UI can show when updates are being
 * aggregated and how many are pending.
 */
export function useMessageUpdateBatcher(
  conversationsRef: React.MutableRefObject<ConversationWithMessages[]>,
  commitConversations: (
    updater: (prev: ConversationWithMessages[]) => ConversationWithMessages[]
  ) => void,
  hydrateConversationForMessage: (message: RealtimeMessage) => Promise<void>
) {
  const pendingUpdatesRef = useRef<Map<string, RealtimeMessage>>(new Map());
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<MessageBatcherStatus>({
    isBatching: false,
    pendingCount: 0,
    flushedBatches: 0,
  });

  const publishStatus = useCallback((isBatching: boolean, didFlush = false) => {
    const pendingCount = pendingUpdatesRef.current.size;
    setStatus((prev) => {
      const flushedBatches = didFlush ? prev.flushedBatches + 1 : prev.flushedBatches;
      if (
        prev.isBatching === isBatching &&
        prev.pendingCount === pendingCount &&
        prev.flushedBatches === flushedBatches
      ) {
        return prev;
      }
      return { isBatching, pendingCount, flushedBatches };
    });
  }, []);

  const flushPendingUpdates = useCallback(() => {
    const pending = pendingUpdatesRef.current;
    if (pending.size === 0) {
      publishStatus(false);
      return;
    }

    const updates = Array.from(pending.values());
    pendingUpdatesRef.current = new Map();

    commitConversations((prev) => {
      let next = prev;
      let changed = false;

      for (const updatedMessage of updates) {
        if (!updatedMessage.contact_id) continue;
        const convIdx = next.findIndex((c) => c.contact.id === updatedMessage.contact_id);
        if (convIdx < 0) continue;
        const conv = next[convIdx];
        const msgIdx = conv.messages.findIndex((m) => m.id === updatedMessage.id);
        if (msgIdx < 0) continue;
        if (!changed) {
          next = [...next];
          changed = true;
        }
        const updatedMessages = [...conv.messages];
        // Preserva o contactAvatar já cacheado na mensagem antiga ao aplicar o update
        const existingMessage = conv.messages[msgIdx];
        updatedMessages[msgIdx] = {
          ...updatedMessage,
          contactAvatar:
            updatedMessage.contactAvatar ||
            existingMessage.contactAvatar ||
            conv.contact.avatar_url,
        };
        next[convIdx] = buildConversation(conv.contact, updatedMessages);
      }

      return changed ? next : prev;
    });

    publishStatus(false, true);
  }, [commitConversations, publishStatus]);

  const handleMessageUpdate = useCallback(
    (payload: RealtimePostgresChangesPayload<RealtimeMessage>) => {
      const updatedMessage = normalizeMessage(payload.new);
      if (!updatedMessage.contact_id) return;

      const existingConversation = conversationsRef.current.find(
        (c) => c.contact.id === updatedMessage.contact_id
      );

      if (!existingConversation) {
        void hydrateConversationForMessage(updatedMessage);
        return;
      }

      const messageWithAvatar = {
        ...updatedMessage,
        contactAvatar: updatedMessage.contactAvatar || existingConversation.contact.avatar_url,
      };
      pendingUpdatesRef.current.set(updatedMessage.id, messageWithAvatar);

      // Fast-path: transições para 'played' (áudio reproduzido) precisam refletir
      // imediatamente na conversa aberta — o usuário acaba de ouvir o áudio e
      // espera ver o duplo-check azul (CheckCheck text-info) sem o delay do
      // debounce padrão de 100ms. Detectamos a mudança comparando o status
      // antigo (snapshot em memória) com o novo recebido.
      const previousMessage = existingConversation.messages.find((m) => m.id === updatedMessage.id);
      const isPlayedTransition =
        updatedMessage.status === 'played' && previousMessage?.status !== 'played';

      if (isPlayedTransition) {
        if (updateTimerRef.current) {
          clearTimeout(updateTimerRef.current);
          updateTimerRef.current = null;
        }
        flushPendingUpdates();
        return;
      }

      if (updateTimerRef.current) clearTimeout(updateTimerRef.current);
      // Increased debounce window during high traffic to batch more updates together
      updateTimerRef.current = setTimeout(flushPendingUpdates, 150);
      publishStatus(true);
    },
    [flushPendingUpdates, hydrateConversationForMessage, conversationsRef, publishStatus]
  );

  return { handleMessageUpdate, batcherStatus: status };
}
