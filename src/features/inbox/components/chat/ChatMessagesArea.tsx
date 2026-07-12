import {
  useRef,
  forwardRef,
  useImperativeHandle,
  useCallback,
  useMemo,
  memo,
  useEffect,
  useState,
  useLayoutEffect,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Lock, ChevronDown, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getLogger } from '@/lib/logger';
import { useVirtualizer } from '@tanstack/react-virtual';
import { EmptyState } from '@/components/ui/empty-state';
import { supabase } from '@/integrations/supabase/client';
import { ChatWatermark } from './ChatWatermark';
import { Message, InteractiveButton } from '@/types/chat';
import { motion, AnimatePresence } from '@/components/ui/motion';
import { TypingIndicator } from '../TypingIndicator';
import { MessageBubble } from './MessageBubble';
import { useConversationReactionsRealtime } from '../../hooks/reactions/useConversationReactionsRealtime';

import type { LoadOlderProps } from './loadOlderTypes';

const log = getLogger('ChatMessagesArea');

interface ChatMessagesAreaProps extends LoadOlderProps {
  messages: Message[];
  isContactTyping: boolean;
  typingUserName: string;
  ttsLoading: boolean;
  ttsPlaying: boolean;
  ttsMessageId: string | null;
  instanceName?: string;
  contactJid?: string;
  contactAvatar?: string;
  onSpeak: (messageId: string, text: string) => void;
  onStop: () => void;
  onReply: (message: Message) => void;
  onForward: (message: Message) => void;
  onCopy: (content: string) => void;
  onScrollToMessage: (messageId: string) => void;
  onInteractiveButtonClick: (button: InteractiveButton) => void;
  onEditStart?: (message: Message) => void;
  highlightedMessageIds?: Set<string>;
  activeHighlightId?: string | null;
  onAudioVoiceChange?: (messageId: string, newBlob: Blob) => void;
  searchQuery?: string;
  isLoading?: boolean;
}

export interface ChatMessagesAreaRef {
  scrollToBottom: () => void;
  registerMessageRef: (messageId: string, el: HTMLDivElement | null) => void;
  scrollToMessage: (messageId: string) => boolean;
  /** Exposes the internal scroll container so parent hooks can attach passive listeners. */
  getScrollContainer: () => HTMLElement | null;
}

export const ChatMessagesArea = memo(
  forwardRef<ChatMessagesAreaRef, ChatMessagesAreaProps>(
    (
      {
        messages,
        isContactTyping,
        typingUserName,
        ttsLoading,
        ttsPlaying,
        ttsMessageId,
        instanceName,
        contactJid,
        contactAvatar,
        onSpeak,
        onStop,
        onReply,
        onForward,
        onCopy,
        onScrollToMessage,
        onInteractiveButtonClick,
        onEditStart,
        highlightedMessageIds,
        activeHighlightId,
        searchQuery,
        onLoadOlder,
        loadingOlder = false,
        hasMoreOlder = false,
        isLoading = false,
        onAudioVoiceChange,
      },
      ref
    ) => {
      const queryClient = useQueryClient();
      const scrollContainerRef = useRef<HTMLDivElement>(null);
      const isFetchingOlderRef = useRef(false);
      const prevLengthRef = useRef(messages.length);
      const prevScrollHeightRef = useRef<number | null>(null);
      const [showScrollBottom, setShowScrollBottom] = useState(false);

      useImperativeHandle(ref, () => ({
        scrollToBottom: () => {
          const container = scrollContainerRef.current;
          if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        },
        registerMessageRef: (_messageId: string, _el: HTMLDivElement | null) => {
          // Placeholder
        },
        scrollToMessage: (_messageId: string): boolean => {
          // Placeholder
          return true;
        },
        getScrollContainer: () => scrollContainerRef.current,
      }));

      // `messages` é um novo array a cada mensagem recebida; usar como dep direta
      // recriava (unsubscribe+subscribe) este canal a cada UPDATE realtime. O ref
      // mantém o `.some()` sempre atualizado sem forçar a resubscrição.
      const messagesRef = useRef(messages);
      messagesRef.current = messages;
      const conversationId = messages[0]?.conversationId;

      useEffect(() => {
        if (!conversationId) return;
        const channel = supabase
          .channel(`chat-updates-shared`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'evo', table: 'evolution_messages' },
            (payload) => {
              const updatedMsg = payload.new as { id: string };
              if (updatedMsg.id && messagesRef.current.some((m) => m.id === updatedMsg.id)) {
                void queryClient.invalidateQueries({ queryKey: ['messages'] });
              }
            }
          )
          .subscribe();
        return () => {
          void supabase.removeChannel(channel);
        };
      }, [conversationId, queryClient]);

      // Realtime de reações: 1 canal por conversa, invalida apenas IDs visíveis
      const messageIds = useMemo(() => messages.map((m) => m.id), [messages]);
      useConversationReactionsRealtime(conversationId, messageIds);

      const getItemSize = useCallback(
        (index: number) => {
          const item = messages[index];
          if (!item) return 80;
          if (item.type === 'image' || item.type === 'video') return 300;
          if (item.type === 'audio') return 120;
          if (item.type === 'document') return 100;
          const content = item.content || '';
          const lines = Math.ceil(content.length / 60);
          return Math.max(80, 70 + lines * 22);
        },
        [messages]
      );

      const virtualizer = useVirtualizer({
        count: messages.length,
        getScrollElement: () => scrollContainerRef.current,
        estimateSize: getItemSize,
        overscan: 12,
      });

      const handleScroll = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const top = container.scrollTop;
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;
        setShowScrollBottom(scrollHeight - top - clientHeight > 400);

        if (top < 600 && hasMoreOlder && !loadingOlder && !isFetchingOlderRef.current) {
          if (onLoadOlder) {
            isFetchingOlderRef.current = true;
            prevScrollHeightRef.current = container.scrollHeight;
            Promise.resolve(onLoadOlder()).finally(() => {
              setTimeout(() => {
                isFetchingOlderRef.current = false;
              }, 100);
            });
          }
        }
      }, [hasMoreOlder, loadingOlder, onLoadOlder]);

      useLayoutEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;
        if (prevScrollHeightRef.current !== null && messages.length > prevLengthRef.current) {
          container.scrollTop = container.scrollHeight - prevScrollHeightRef.current;
          prevScrollHeightRef.current = null;
        }
        prevLengthRef.current = messages.length;
      }, [messages.length]);

      const handleMessageDeleted = (id: string) => {
        log.info('Message deleted:', id);
      };

      return (
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="scrollbar-none relative min-h-0 min-w-0 flex-1 overflow-y-auto bg-background/20 px-4 py-6 md:px-24"
        >
          <ChatWatermark />

          {isLoading && (
            <div className="p-10 text-center">
              <Loader2 className="mx-auto animate-spin text-primary" />
            </div>
          )}

          {messages.length === 0 && !isLoading && (
            <div className="flex h-full items-center justify-center">
              <EmptyState
                icon={Clock}
                title="Nenhuma mensagem ainda"
                description="As mensagens aparecerão aqui quando a conversa começar"
                illustration="messages"
                size="sm"
              />
            </div>
          )}

          {messages.length > 0 && (
            <div className="mb-8 flex flex-col items-center gap-4 pt-4">
              <div className="max-w-sm rounded-2xl border border-border/30 bg-card/50 p-6 text-center shadow-sm backdrop-blur-sm">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Lock className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-1 text-[14px] font-bold">Criptografia de Ponta a Ponta</h3>
                <p className="text-[12px] text-muted-foreground">As mensagens são protegidas.</p>
              </div>
            </div>
          )}

          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const message = messages[virtualRow.index];
              if (!message) return null;
              return (
                <div
                  key={message.id || virtualRow.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    paddingBottom: '1rem',
                  }}
                >
                  <MessageBubble
                    message={message}
                    isFirstInGroup={true}
                    isLastInGroup={true}
                    contactAvatar={contactAvatar}
                    onSpeak={onSpeak}
                    onStop={onStop}
                    onReply={onReply}
                    onForward={onForward}
                    onCopy={onCopy}
                    onScrollToMessage={onScrollToMessage}
                    onInteractiveButtonClick={onInteractiveButtonClick}
                    onEditStart={onEditStart}
                    onMessageDeleted={handleMessageDeleted}
                    ttsLoading={ttsLoading && ttsMessageId === message.id}
                    ttsPlaying={ttsPlaying && ttsMessageId === message.id}
                    ttsMessageId={ttsMessageId}
                    highlightedMessageIds={highlightedMessageIds}
                    activeHighlightId={activeHighlightId}
                    searchQuery={searchQuery}
                    onAudioVoiceChange={onAudioVoiceChange}
                    registerRef={() => {}}
                    instanceName={instanceName}
                    contactJid={contactJid}
                  />
                </div>
              );
            })}
          </div>

          {isContactTyping && (
            <div className="mt-4">
              <TypingIndicator isVisible={true} userName={typingUserName} />
            </div>
          )}

          <AnimatePresence>
            {showScrollBottom && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="fixed bottom-24 right-8 z-50"
              >
                <Button
                  size="icon"
                  variant="secondary"
                  className="rounded-full shadow-lg"
                  onClick={() =>
                    scrollContainerRef.current?.scrollTo({
                      top: scrollContainerRef.current.scrollHeight,
                      behavior: 'smooth',
                    })
                  }
                  aria-label="Rolar para o final"
                >
                  <ChevronDown className="h-5 w-5" />
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    }
  )
);

ChatMessagesArea.displayName = 'ChatMessagesArea';
