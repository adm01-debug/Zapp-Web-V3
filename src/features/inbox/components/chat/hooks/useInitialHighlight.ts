import { useEffect } from 'react';
import type { Message } from '@/types/chat';
import type { ChatMessagesAreaRef } from '../ChatMessagesArea';
import { toast } from '@/hooks/use-toast';

interface Params {
  initialHighlightMessageId?: string | null;
  messages: Message[];
  messagesAreaRef: React.RefObject<ChatMessagesAreaRef>;
  setHighlightedMessageIds: (ids: Set<string>) => void;
  setActiveHighlightId: (id: string | null) => void;
  onHighlightConsumed?: () => void;
}

/**
 * Handles the deep-link "View in chat" flow:
 * finds the target message, scrolls to it, applies a temporary highlight (~3.5s),
 * and notifies caller when done. Retries up to ~5s if the message isn't in the DOM yet.
 */
export function useInitialHighlight({
  initialHighlightMessageId,
  messages,
  messagesAreaRef,
  setHighlightedMessageIds,
  setActiveHighlightId,
  onHighlightConsumed,
}: Params) {
  useEffect(() => {
    if (!initialHighlightMessageId) return;

    const targetId = initialHighlightMessageId;
    const findInternal = () =>
      messages.find((m) => m.id === targetId)?.id ??
      messages.find((m) => m.external_id === targetId)?.id ??
      null;

    let cancelled = false;
    let highlightTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const tryFindAndScroll = () => {
      if (cancelled) return;
      const internalId = findInternal();
      if (internalId) {
        setHighlightedMessageIds(new Set([internalId]));
        setActiveHighlightId(internalId);

        let scrollAttempts = 0;
        const tryScroll = () => {
          if (cancelled) return;
          scrollAttempts++;
          const found = messagesAreaRef.current?.scrollToMessage(internalId) ?? false;
          if (!found && scrollAttempts < 10) setTimeout(tryScroll, 150);
        };
        tryScroll();

        highlightTimer = setTimeout(() => {
          if (cancelled) return;
          setActiveHighlightId(null);
          setHighlightedMessageIds(new Set());
          onHighlightConsumed?.();
        }, 3500);
        return;
      }

      attempts++;
      if (attempts < 20) {
        setTimeout(tryFindAndScroll, 250);
      } else {
        toast({
          title: 'Mensagem não encontrada',
          description: 'A mensagem original pode ter sido removida ou ainda não foi carregada.',
          variant: 'destructive',
        });
        onHighlightConsumed?.();
      }
    };

    tryFindAndScroll();

    return () => {
      cancelled = true;
      if (highlightTimer) clearTimeout(highlightTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialHighlightMessageId, messages, onHighlightConsumed]);
}
