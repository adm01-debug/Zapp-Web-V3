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
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { queryKeys } from '@/services/api/queryKeys';
import { supabase } from '@/integrations/supabase/client';
import { logChannelError } from '@/integrations/supabase/channelErrorLogging';
import { Loader2, Lock, ChevronDown, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getLogger } from '@/lib/logger';
import { useVirtualizer } from '@tanstack/react-virtual';
import { EmptyState } from '@/components/ui/empty-states';
import { ChatWatermark } from './ChatWatermark';
import { Message, InteractiveButton } from '@/types/chat';
import { motion, AnimatePresence } from '@/components/ui/motion';
import { TypingIndicator } from '../TypingIndicator';
import { MessageBubble } from './MessageBubble';
import { useConversationReactionsRealtime } from '../../hooks/reactions/useConversationReactionsRealtime';
import { ReactionsBatchProvider } from '../../hooks/reactions/usePreloadConversationReactions';

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

/** Chat Messages Area Ref interface definition. */
export interface ChatMessagesAreaRef {
  scrollToBottom: () => void;
  registerMessageRef: (messageId: string, el: HTMLDivElement | null) => void;
  scrollToMessage: (messageId: string) => boolean;
  /** Exposes the internal scroll container so parent hooks can attach passive listeners. */
  getScrollContainer: () => HTMLElement | null;
}

/** Chat Messages Area constant. */
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

      const messageRefsRef = useRef<Map<string, HTMLDivElement>>(new Map());
      const messageIndexRef = useRef<Map<string, number>>(new Map());

      // ── scrollMargin ──────────────────────────────────────────────────────────
      // Distancia do topo do scroll container ate o inicio do bloco virtual.
      // Necessario porque conteudo estatico (ChatWatermark + banner de
      // criptografia) precede o bloco, deslocando os offsets em ~150-220px.
      // Sem isso, o virtualizer renderiza items errados na viewport e o
      // translateY posiciona items com offset incorreto.
      const listStartRef = useRef<HTMLDivElement>(null);
      const [scrollMargin, setScrollMargin] = useState(0);

      const hasMessages = messages.length > 0;
      useLayoutEffect(() => {
        const el = listStartRef.current;
        const container = scrollContainerRef.current;
        if (!el || !container) return;

        const measure = () => {
          setScrollMargin(el.offsetTop);
        };
        measure();

        // Re-mede quando o container redimensiona (resize de janela ou painel)
        const ro = new ResizeObserver(measure);
        ro.observe(container);
        return () => ro.disconnect();
      }, [hasMessages]); // re-executa quando banner aparece/some

      // Rebuild index map when messages change (cheap: O(n) once per render batch)
      useEffect(() => {
        const map = new Map<string, number>();
        messages.forEach((m, i) => {
          if (m.id) map.set(m.id, i);
          if (m.external_id) map.set(m.external_id, i);
        });
        messageIndexRef.current = map;
      }, [messages]);

      useImperativeHandle(ref, () => ({
        scrollToBottom: () => {
          const container = scrollContainerRef.current;
          if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        },
        registerMessageRef: (messageId: string, el: HTMLDivElement | null) => {
          const map = messageRefsRef.current;
          if (el) map.set(messageId, el);
          else map.delete(messageId);
        },
        scrollToMessage: (messageId: string): boolean => {
          const index = messageIndexRef.current.get(messageId);
          if (index === undefined) return false;
          virtualizer.scrollToIndex(index, { align: 'center', behavior: 'smooth' });
          return true;
        },
        getScrollContainer: () => scrollContainerRef.current,
      }));

      const conversationId = messages[0]?.conversationId;

      // Realtime de reacoes: 1 canal por conversa, invalida apenas IDs visiveis
      const messageIds = useMemo(() => messages.map((m) => m.id), [messages]);
      useConversationReactionsRealtime(conversationId, messageIds);
      // FIX N+1 (onda bugs-console v1): o provider abaixo faz 1-2 GETs batch
      // (RPC rpc_get_reactions_batch → fallback .in() chunkado) e os hooks
      // por-mensagem ficam com enabled=false enquanto o batch cobre a mensagem.

      // Realtime de mensagens: UPDATE e DELETE no schema 'evo' (tabela física particionada)
      useEffect(() => {
        if (!contactJid) return;
        // Última conexão bem-sucedida do canal — classifica CHANNEL_ERROR transiente vs real.
        let lastConnectedAtMs: number | null = null;
        const channel = supabase
          .channel(`chat-updates:${contactJid}:${Math.random().toString(36).slice(2, 10)}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'evo', table: 'evolution_messages' },
            () => {
              void queryClient.invalidateQueries({ queryKey: queryKeys.messages.all() });
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'DELETE',
              schema: 'evo',
              table: 'evolution_messages',
              filter: `remote_jid=eq.${contactJid}`,
            },
            (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
              const id =
                payload.old && typeof payload.old === 'object'
                  ? (payload.old as Record<string, unknown>).id
                  : undefined;
              if (id) {
                void queryClient.invalidateQueries({ queryKey: queryKeys.messages.all() });
              }
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
          lastConnectedAtMs = Date.now();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          void logChannelError(log, '[ChatMessagesArea] channel subscription status:', lastConnectedAtMs, status);
        }
      });

        return () => {
          channel.unsubscribe();
          supabase.removeChannel(channel);
        };
      }, [contactJid, queryClient]);

      const SAME_GROUP_MS = 5 * 60 * 1000;
      const groupInfo = useMemo(
        () =>
          messages.map((msg, i) => {
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const ts = new Date(msg.timestamp ?? 0).getTime();
            const isFirstInGroup =
              !prev ||
              prev.sender !== msg.sender ||
              ts - new Date(prev.timestamp ?? 0).getTime() > SAME_GROUP_MS;
            const isLastInGroup =
              !next ||
              next.sender !== msg.sender ||
              new Date(next.timestamp ?? 0).getTime() - ts > SAME_GROUP_MS;
            return { isFirstInGroup, isLastInGroup };
          }),
        [messages] // eslint-disable-line react-hooks/exhaustive-deps
      );

      const getItemSize = useCallback(
        (index: number) => {
          const item = messages[index];
          if (!item) return 80;
          // Altura base por tipo de mensagem
          let h: number;
          if (item.type === 'image' || item.type === 'video') h = 300;
          else if (item.type === 'audio') h = 120;
          else if (item.type === 'document') h = 100;
          else {
            const content = item.content || '';
            const lines = Math.ceil(content.length / 60);
            h = Math.max(80, 70 + lines * 22);
          }
          // BUG-21: incrementos para recursos que aumentam a altura do bubble
          if (item.replyTo) h += 56; // citação (reply) no topo do bubble
          if (Array.isArray(item.reactions) && item.reactions.length > 0) {
            h += 24; // linha de reações
          }
          if (
            item.interactive &&
            Array.isArray(item.interactive.buttons) &&
            item.interactive.buttons.length > 0
          ) {
            h += 40 * item.interactive.buttons.length; // botões interativos
          }
          return h;
        },
        [messages]
      );

      const virtualizer = useVirtualizer({
        count: messages.length,
        getScrollElement: () => scrollContainerRef.current,
        estimateSize: getItemSize,
        overscan: 12,
        measureElement: (el) => el.getBoundingClientRect().height,
        // scrollMargin informa ao tanstack-virtual o offset entre o topo do
        // scroll container e o inicio do bloco virtual, ajustando o calculo de
        // quais items estao na viewport e o valor de virtualRow.start.
        scrollMargin,
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
            void Promise.resolve(onLoadOlder())
              .finally(() => {
                setTimeout(() => {
                  isFetchingOlderRef.current = false;
                }, 100);
              })
              .catch((err) => {
                log.error('[ChatMessagesArea] onLoadOlder failed:', err);
                isFetchingOlderRef.current = false;
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

      const handleMessageDeleted = useCallback(
        (id: string) => {
          log.info('Message deleted:', id);
          void queryClient.invalidateQueries({ queryKey: queryKeys.messages.all() });
        },
        [queryClient]
      );

      const registerRef = useCallback((el: HTMLDivElement | null) => {
        if (!el) return;
        const messageId = el.getAttribute('data-message-id');
        if (!messageId) return;
        const map = messageRefsRef.current;
        map.set(messageId, el);
        // Auto-cleanup when element is removed from DOM (virtualizer unmount).
        // Disconnect is mandatory — without it observers accumulate across navigation.
        const observer = new MutationObserver(() => {
          if (!document.contains(el)) {
            map.delete(messageId);
            observer.disconnect();
          }
        });
        const parent = el.parentElement;
        if (parent) observer.observe(parent, { childList: true });
        el.setAttribute('data-observer-id', messageId);
      }, []);

      return (
        <ReactionsBatchProvider messageIds={messageIds}>
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

          {/* Marcador: offsetTop deste elemento = scrollMargin do virtualizer.
              Deve ficar imediatamente ANTES do container virtual. */}
          <div ref={listStartRef} />

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
              const group = groupInfo[virtualRow.index] ?? {
                isFirstInGroup: true,
                isLastInGroup: true,
              };
              return (
                <div
                  key={message.id ?? virtualRow.index}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    // virtualRow.start e em coordenadas do scroll container;
                    // subtraimos scrollMargin para obter a posicao relativa
                    // ao container virtual (que comeca em scrollMargin px do topo).
                    transform: `translateY(${virtualRow.start - scrollMargin}px)`,
                    paddingBottom: '1rem',
                  }}
                >
                  <MessageBubble
                    message={message}
                    isFirstInGroup={group.isFirstInGroup}
                    isLastInGroup={group.isLastInGroup}
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
                    registerRef={registerRef}
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
                key="scroll-to-bottom"
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
        </ReactionsBatchProvider>
      );
    }
  )
);

ChatMessagesArea.displayName = 'ChatMessagesArea';
