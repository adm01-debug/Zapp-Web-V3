import { useRef, useEffect, useCallback } from 'react';
import type { ChatMessagesAreaRef } from '../components/chat/ChatMessagesArea';

interface UseChatAutoScrollOptions {
  messages: { id: string }[];
  isContactTyping: boolean;
  messagesAreaRef: React.RefObject<ChatMessagesAreaRef>;
}

/**
 * Smart auto-scroll that respects the agent's scroll position.
 *
 * Previously, ChatPanel forced `scrollToBottom()` on every new message
 * or typing event, which interrupted agents reading message history in
 * active conversations. This hook tracks whether the user is near the
 * bottom and only auto-scrolls when they are, preserving the reading
 * position otherwise.
 *
 * The threshold is set to 150px — close enough to the bottom that the
 * user likely expects to see new messages.
 */
export function useChatAutoScroll({
  messages,
  isContactTyping,
  messagesAreaRef,
}: UseChatAutoScrollOptions) {
  const lastMsgIdRef = useRef<string | null>(null);
  const isAtBottomRef = useRef(true);

  // Track scroll position via the ChatMessagesArea container
  const bindScrollListener = useCallback((containerEl: HTMLElement | null) => {
    if (!containerEl) return;
    const handler = () => {
      const threshold = 150;
      isAtBottomRef.current =
        containerEl.scrollHeight - containerEl.scrollTop - containerEl.clientHeight < threshold;
    };
    // E40.3: compute the initial position immediately at bind. Without this the
    // ref keeps its previous value (or `true` from mount) until the FIRST user
    // scroll event — e.g. opening a new conversation while scrolled up in the
    // previous one (bind re-runs per conversation) leaves auto-scroll wrong.
    handler();
    containerEl.addEventListener('scroll', handler, { passive: true });
    return () => containerEl.removeEventListener('scroll', handler);
  }, []);

  // Auto-scroll only when at bottom
  useEffect(() => {
    const lastId = messages[messages.length - 1]?.id ?? null;

    if (lastId !== lastMsgIdRef.current) {
      lastMsgIdRef.current = lastId;
      // New message appended — scroll only if agent is near bottom
      if (isAtBottomRef.current) {
        messagesAreaRef.current?.scrollToBottom();
      }
    } else if (isContactTyping && isAtBottomRef.current) {
      messagesAreaRef.current?.scrollToBottom();
    }
  }, [messages, isContactTyping, messagesAreaRef]);

  return {
    /** Whether the user is currently near the bottom of the messages list */
    isAtBottom: isAtBottomRef,
    /** Call with the scroll container element to start tracking position */
    bindScrollListener,
    /** Imperatively scroll to bottom (e.g. after the user sends a message) */
    scrollToBottom: useCallback(() => {
      messagesAreaRef.current?.scrollToBottom();
      isAtBottomRef.current = true;
    }, [messagesAreaRef]),
  };
}
