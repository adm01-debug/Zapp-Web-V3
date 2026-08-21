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
  /** Se definido e a mensagem não for encontrada após ~5 tentativas, aciona paginação. */
  onLoadOlder?: () => void;
  /** Quando false (sem páginas anteriores), não aciona paginação. */
  hasMoreOlder?: boolean;
}

/**
 * Handles the deep-link "View in chat" flow:
 * finds the target message, scrolls to it, applies a temporary highlight (~3.5s),
 * and notifies caller when done. Retries up to ~5s if the message isn't in the DOM yet.
 * Se hasMoreOlder=true e a mensagem não for encontrada em ~5 tentativas, aciona
 * onLoadOlder() uma vez; o effect re-executa quando messages.length muda.
 */
export function useInitialHighlight({
  initialHighlightMessageId,
  messages,
  messagesAreaRef,
  setHighlightedMessageIds,
  setActiveHighlightId,
  onHighlightConsumed,
  onLoadOlder,
  hasMoreOlder,
}: Params) {
  useEffect(() => {
    if (!initialHighlightMessageId) return;

    const targetId = initialHighlightMessageId;
    const findInternal = () =>
      messages.find((m) => m.id === targetId)?.id ??
      messages.find((m) => m.external_id === targetId)?.id ??
      null;

    let cancelled = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let attempts = 0;
    let loadTriggered = false;

    const schedule = (fn: () => void, delay: number) => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, delay);
      timers.add(id);
    };

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
          if (!found && scrollAttempts < 10) schedule(tryScroll, 150);
        };
        tryScroll();

        schedule(() => {
          if (cancelled) return;
          setActiveHighlightId(null);
          setHighlightedMessageIds(new Set());
          onHighlightConsumed?.();
        }, 3500);
        return;
      }

      attempts++;

      // Após ~5 tentativas sem encontrar, tenta carregar página anterior uma vez.
      if (attempts === 5 && hasMoreOlder && onLoadOlder && !loadTriggered) {
        loadTriggered = true;
        onLoadOlder();
        // O effect re-executa quando messages.length mudar; para aqui para evitar
        // continuar o polling enquanto a paginação está em andamento.
        return;
      }

      if (attempts < 20) {
        schedule(tryFindAndScroll, 250);
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
      timers.forEach(clearTimeout);
      timers.clear();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    initialHighlightMessageId,
    messages.length,
    onHighlightConsumed,
    messagesAreaRef,
    setHighlightedMessageIds,
    setActiveHighlightId,
    onLoadOlder,
    hasMoreOlder,
  ]);
}
