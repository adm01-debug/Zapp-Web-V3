import { useRef, forwardRef, useImperativeHandle, useCallback, useMemo, memo, useEffect, useState, useId, useLayoutEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Ban, RotateCw, Navigation2, Info, Lock, ChevronDown, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getLogger } from '@/lib/logger';
import { useVirtualizer } from '@tanstack/react-virtual';
import { EmptyState } from '@/components/ui/empty-state';

const log = getLogger('ChatMessagesArea');
import { supabase } from '@/integrations/supabase/client';
import { ChatWatermark } from './ChatWatermark';
import { cn } from '@/lib/utils';
import { Message, InteractiveButton } from '@/types/chat';
import { motion, AnimatePresence, StaggeredList, StaggeredItem } from '@/components/ui/motion';
import { TypingIndicator } from '@/features/inbox/components/TypingIndicator';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatDateSeparator } from './messageUtils';
import { MessageBubble } from './MessageBubble';
import { ConversationDeliverySummary } from './ConversationDeliverySummary';
import { MessageStatusFilterBar, filterMessagesByStatus, type MessageStatusFilter } from './MessageStatusFilterBar';
import {
  recordLoadOlderStarted,
  recordLoadOlderCancelled,
  recordLoadOlderCompleted,
} from './loadOlderMetrics';

import type { LoadOlderProps } from './loadOlderTypes';
import { dbFrom } from '@/integrations/datasource/db';
import { useDensity } from '@/hooks/useDensity';

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
  /**
   * Duração em ms do badge "Carregamento cancelado". Default: 2500ms.
   * Ignorado em modo local (sem `onLoadOlder`), pois o badge nunca aparece.
   */
  loadOlderCancelBadgeMs?: number;
}

export type LoadOlderCancelReason = 'reverse-scroll' | 'navigation';

export interface ChatMessagesAreaRef {
  scrollToBottom: () => void;
  registerMessageRef: (messageId: string, el: HTMLDivElement | null) => void;
  /**
   * Centraliza a mensagem com `messageId` (id interno) e aplica o ring
   * de destaque temporário. Retorna `true` quando o nó já estava
   * registrado e o scroll foi disparado, `false` quando o caller deve
   * tentar novamente (mensagem ainda não montada / fora do viewport).
   */
  scrollToMessage: (messageId: string) => boolean;
}

export const ChatMessagesArea = memo(forwardRef<ChatMessagesAreaRef, ChatMessagesAreaProps>(({
  messages, isContactTyping, typingUserName, ttsLoading, ttsPlaying, ttsMessageId,
  instanceName, contactJid, contactAvatar, onSpeak, onStop, onReply, onForward, onCopy,
  onScrollToMessage, onInteractiveButtonClick, onEditStart, highlightedMessageIds, activeHighlightId, searchQuery,
  onLoadOlder, onCancelLoadOlder, loadingOlder = false, hasMoreOlder = false,
  loadOlderCancelBadgeMs = 2500,
  isLoading = false,
  onAudioVoiceChange,
}, ref) => {
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isFetchingOlderRef = useRef(false);
  const cancelledRef = useRef(false);
  const prevScrollHeightRef = useRef<number | null>(null);
  const prevFirstIdRef = useRef<string | null>(null);
  const prevLengthRef = useRef<number>(0);
  const lastScrollTopRef = useRef<number>(0);
  const lastTriggerAtRef = useRef<number>(0);
  const [loadCancelled, setLoadCancelled] = useState(false);
  const [cancelReason, setCancelReason] = useState<LoadOlderCancelReason>('reverse-scroll');
  const cancelBadgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevContactJidRef = useRef<string | undefined>(contactJid);
  const { density } = useDensity();
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const flagCancelled = useCallback((reason: LoadOlderCancelReason = 'reverse-scroll') => {
    setCancelReason(reason);
    setLoadCancelled(true);
    if (cancelBadgeTimerRef.current) clearTimeout(cancelBadgeTimerRef.current);
    cancelBadgeTimerRef.current = setTimeout(() => setLoadCancelled(false), loadOlderCancelBadgeMs);
  }, [loadOlderCancelBadgeMs]);

  // Detecta troca de contato com load em andamento → cancelamento por navegação.
  useEffect(() => {
    if (prevContactJidRef.current !== undefined && prevContactJidRef.current !== contactJid && isFetchingOlderRef.current) {
      flagCancelled('navigation');
    }
    prevContactJidRef.current = contactJid;
  }, [contactJid, flagCancelled]);

  useEffect(() => () => {
    if (cancelBadgeTimerRef.current) clearTimeout(cancelBadgeTimerRef.current);
  }, []);

  const handleMessageDeleted = useCallback(async (messageId: string) => {
    try {
      await dbFrom('messages').update({ is_deleted: true, content: '[Mensagem apagada]' }).eq('id', messageId);
      log.info(`[Delete] Msg ${messageId.slice(0, 8)} marked as deleted`);
    } catch {
      log.error('Failed to mark message as deleted in DB');
    }
  }, []);

  useImperativeHandle(ref, () => ({
    scrollToBottom: () => {
      const container = scrollContainerRef.current;
      if (container) container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    },
    registerMessageRef: (messageId: string, el: HTMLDivElement | null) => {
      messageRefs.current[messageId] = el;
    },
    scrollToMessage: (messageId: string): boolean => {
      const element = messageRefs.current[messageId];
      const container = scrollContainerRef.current;
      if (!element || !container) return false;
      const elementTop = element.offsetTop - container.offsetTop;
      container.scrollTo({
        top: elementTop - (container.clientHeight / 2) + (element.clientHeight / 2),
        behavior: 'smooth',
      });
      // Re-confirma na próxima frame: se imagens/áudio recém-montados
      // alteraram a altura entre o cálculo e o paint, `scrollIntoView`
      // corrige sem efeito visual perceptível.
      requestAnimationFrame(() => {
        try {
          element.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } catch { /* noop em ambientes sem scrollIntoView */ }
      });
      if (!element.dataset.searchHighlight) {
        element.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
        setTimeout(
          () => element.classList.remove('ring-2', 'ring-primary', 'ring-offset-2'),
          2000,
        );
      }
      return true;
    },
  }));

  const messageIds = useMemo(() => messages.map((message) => message.id).filter(Boolean), [messages]);
  const messageIdsSet = useMemo(() => new Set(messageIds), [messageIds]);
  const messageIdsKey = useMemo(() => messageIds.join(','), [messageIds]);

  useEffect(() => {
    if (messageIds.length === 0) return;

    // Listen for reactions, status updates, and voice conversion status
    const channel = supabase
      .channel(`chat-updates:${messageIds[0] ?? 'empty'}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'message_reactions',
      }, (payload) => {
        const nextMessageId = (payload.new as { message_id?: string } | null)?.message_id;
        const prevMessageId = (payload.old as { message_id?: string } | null)?.message_id;
        const reactionMessageId = nextMessageId ?? prevMessageId;
        if (!reactionMessageId || !messageIdsSet.has(reactionMessageId)) return;
        queryClient.invalidateQueries({ queryKey: ['message-reactions', reactionMessageId] });
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
      }, (payload) => {
        const updatedMsg = payload.new as { id: string, status?: string };
        if (updatedMsg.id && messageIdsSet.has(updatedMsg.id)) {
          queryClient.invalidateQueries({ queryKey: ['messages'] });
        }
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'voice_conversion_queue',
      }, (payload) => {
        const newData = (payload.new || payload.old) as { message_id?: string };
        if (newData.message_id && messageIdsSet.has(newData.message_id)) {
          // We don't invalidate everything, just let components like AudioMessagePlayer handle their own sub
          // but if we want to refresh the message object if the status was stored there:
          // queryClient.invalidateQueries({ queryKey: ['messages'] });
        }
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [messageIds.length, messageIdsKey, messageIdsSet, queryClient]);

  const [statusFilter, setStatusFilter] = useState<Set<MessageStatusFilter>>(new Set());

  const displayedMessages = useMemo(
    () => filterMessagesByStatus(messages, statusFilter),
    [messages, statusFilter],
  );

  const groupedMessages = useMemo(() => {
    return displayedMessages.reduce((groups, message) => {
      const dateKey = format(message.timestamp, 'yyyy-MM-dd', { locale: ptBR });
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(message);
      return groups;
    }, {} as Record<string, Message[]>);
  }, [displayedMessages]);

  // Scroll-to-top detector → loadOlder (with cancellation on reverse-scroll)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !onLoadOlder) return;

    // Preload threshold: ~1 viewport height OR 600px, whichever is larger.
    // Triggers loadOlder before user reaches scrollTop=0 to avoid visible "wait" gap.
    const PRELOAD_PX = Math.max(600, container.clientHeight);
    const TRIGGER_THROTTLE_MS = 250;
    const REVERSE_CANCEL_PX = 50;

    // Tracks the perf.now() timestamp of the in-flight load so we can compute
    // duration on completion or cancellation.
    let inFlightStartedAt: number | null = null;

    const triggerLoad = () => {
      if (!hasMoreOlder || loadingOlder || isFetchingOlderRef.current) return;
      const now = Date.now();
      if (now - lastTriggerAtRef.current < TRIGGER_THROTTLE_MS) return;
      lastTriggerAtRef.current = now;

      isFetchingOlderRef.current = true;
      cancelledRef.current = false;
      // New load attempt: clear any prior cancel badge.
      setLoadCancelled(false);
      if (cancelBadgeTimerRef.current) {
        clearTimeout(cancelBadgeTimerRef.current);
        cancelBadgeTimerRef.current = null;
      }
      prevScrollHeightRef.current = container.scrollHeight;
      inFlightStartedAt = recordLoadOlderStarted({ contactJid });
      const startedAtForThisRun = inFlightStartedAt;
      Promise.resolve(onLoadOlder()).finally(() => {
        // Only count as "completed" if no cancellation flipped the flag first.
        if (!cancelledRef.current && startedAtForThisRun != null) {
          recordLoadOlderCompleted(startedAtForThisRun, { contactJid });
        }
        if (inFlightStartedAt === startedAtForThisRun) inFlightStartedAt = null;
        setTimeout(() => { isFetchingOlderRef.current = false; }, 100);
      });
    };

    const maybeCancel = (currentTop: number) => {
      // Only cancel an in-flight loadOlder when the user has CLEARLY left the
      // top zone — i.e. they scrolled past the preload threshold AND moved down
      // by more than REVERSE_CANCEL_PX. This avoids spurious cancellations from
      // micro-jitter or rubber-band bounces near scrollTop=0, which were
      // aborting valid loads while the user was still effectively at the top.
      if (!isFetchingOlderRef.current || !onCancelLoadOlder) return;
      const movedDownEnough = currentTop > lastScrollTopRef.current + REVERSE_CANCEL_PX;
      const leftTopZone = currentTop > PRELOAD_PX;
      if (movedDownEnough && leftTopZone) {
        cancelledRef.current = true;
        onCancelLoadOlder();
        recordLoadOlderCancelled(inFlightStartedAt, {
          contactJid,
          reason: 'reverse-scroll',
          scrollTop: currentTop,
          preloadPx: PRELOAD_PX,
        });
        inFlightStartedAt = null;
        // Drop the saved height so the prepend-anchor effect skips reanchoring.
        prevScrollHeightRef.current = null;
        isFetchingOlderRef.current = false;
        flagCancelled();
      }
    };

    const handleScroll = () => {
      const top = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      
      // Mostrar botão se estiver a mais de 400px do fundo
      setShowScrollBottom(scrollHeight - top - clientHeight > 400);

      maybeCancel(top);
      if (top < PRELOAD_PX) triggerLoad();
      lastScrollTopRef.current = top;
    };

    // rAF-based throttle: coalesce rapid scroll events into at most 1 invocation per frame.
    // Cuts handler invocations from ~60-120/s on fast wheels/trackpads down to ~60/s,
    // and dedupes the inner triggerLoad/maybeCancel work without delaying user response.
    let rafId: number | null = null;
    const throttledScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        handleScroll();
      });
    };

    // Anticipate intent: if user is scrolling up via wheel/touch near the top, preload immediately
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY < 0 && container.scrollTop < PRELOAD_PX * 1.5) triggerLoad();
    };

    let lastTouchY = 0;
    const handleTouchStart = (e: TouchEvent) => { lastTouchY = e.touches[0]?.clientY ?? 0; };
    const handleTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? 0;
      if (y > lastTouchY && container.scrollTop < PRELOAD_PX * 1.5) triggerLoad();
      lastTouchY = y;
    };

    lastScrollTopRef.current = container.scrollTop;
    container.addEventListener('scroll', throttledScroll, { passive: true });
    container.addEventListener('wheel', handleWheel, { passive: true });
    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: true });
    return () => {
      container.removeEventListener('scroll', throttledScroll);
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      // On unmount (e.g. conversation switch), abort any in-flight loadOlder.
      if (isFetchingOlderRef.current && onCancelLoadOlder) {
        onCancelLoadOlder();
        cancelledRef.current = true;
        recordLoadOlderCancelled(inFlightStartedAt, { contactJid, reason: 'unmount' });
        inFlightStartedAt = null;
        isFetchingOlderRef.current = false;
      }
    };
  }, [onLoadOlder, onCancelLoadOlder, hasMoreOlder, loadingOlder, flagCancelled, contactJid]);

  // Preserve scroll position after older messages prepend
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const firstId = messages[0]?.id ?? null;
    const lengthIncreased = messages.length > prevLengthRef.current;
    const firstChanged = prevFirstIdRef.current !== null && firstId !== prevFirstIdRef.current;
    const wasPrepend = lengthIncreased && firstChanged;

    if (wasPrepend && prevScrollHeightRef.current !== null && !cancelledRef.current) {
      const prevHeight = prevScrollHeightRef.current;
      // Use synchronous scroll adjustment to prevent jump
      container.scrollTop = container.scrollHeight - prevHeight;
      prevScrollHeightRef.current = null;
    } else if (cancelledRef.current) {
      prevScrollHeightRef.current = null;
      cancelledRef.current = false;
    }

    prevFirstIdRef.current = firstId;
    prevLengthRef.current = messages.length;
  }, [messages]);

  return (
    <div ref={scrollContainerRef} role="log" aria-label="Mensagens da conversa" aria-live="polite" aria-relevant="additions" className="flex-1 min-h-0 min-w-0 overflow-y-auto px-4 py-6 md:px-24 space-y-4 scrollbar-none bg-background/20 relative transition-all duration-500 focus-visible:outline-none" tabIndex={0}>
  const getItemSize = useCallback((index: number) => {
    const item = displayedMessages[index];
    if (!item) return 80;
    if (item.type === 'image' || item.type === 'video') return 300;
    if (item.type === 'audio') return 120;
    if (item.type === 'document') return 100;
    const content = item.content || '';
    const lines = Math.ceil(content.length / 60);
    return Math.max(80, 70 + lines * 22);
  }, [displayedMessages]);

  const virtualizer = useVirtualizer({
    count: displayedMessages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: getItemSize,
    overscan: 12,
  });

  return (
    <div 
      ref={scrollContainerRef} 
      role="log" 
      aria-label="Mensagens da conversa" 
      aria-live="polite" 
      aria-relevant="additions" 
      className="flex-1 min-h-0 min-w-0 overflow-y-auto px-4 py-6 md:px-24 scrollbar-none bg-background/20 relative transition-all duration-500 focus-visible:outline-none" 
      tabIndex={0}
    >
      <ChatWatermark />
      
      {isLoading && (
        <div className="space-y-8 pt-10 animate-in fade-in duration-700">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={cn("flex flex-col gap-3", i % 2 === 0 ? "items-start" : "items-end")}>
              <div className="flex items-center gap-2">
                {i % 2 === 0 && <div className="w-8 h-8 rounded-full bg-muted/40 animate-pulse" />}
                <div className={cn(
                  "h-16 rounded-2xl relative overflow-hidden bg-muted/30", 
                  i % 2 === 0 ? "w-64 rounded-tl-none" : "w-56 rounded-tr-none bg-primary/5"
                )}>
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-background/10 to-transparent -translate-x-full animate-shimmer" />
                </div>
              </div>
              <div className="h-3 w-16 bg-muted/20 rounded animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {displayedMessages.length === 0 && !isLoading && (
        <div className="flex items-center justify-center h-full">
          <EmptyState 
            icon={Clock} 
            title="Nenhuma mensagem ainda" 
            description="As mensagens aparecerão aqui quando a conversa começar" 
            illustration="messages" 
            size="sm" 
          />
        </div>
      )}

      {displayedMessages.length > 0 && (
        <div className="flex flex-col items-center gap-4 mb-8 pt-4">
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card/50 backdrop-blur-sm border border-border/30 rounded-2xl p-6 max-w-sm text-center shadow-sm"
          >
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-[14px] font-bold mb-1">Criptografia de Ponta a Ponta</h3>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              As mensagens e chamadas são protegidas com criptografia. Ninguém fora desta conversa pode lê-las.
            </p>
          </motion.div>
        </div>
      )}

      <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const message = displayedMessages[virtualRow.index];
          if (!message) return null;
          
          return (
            <div
              key={message.id || virtualRow.index}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                paddingBottom: '1rem'
              }}
            >
              <MessageBubble
                message={message}
                isFirstInGroup={true}
                isLastInGroup={true}
                showAvatar={message.from_me ? false : true}
                contactAvatar={contactAvatar}
                onSpeak={onSpeak}
                onStop={onStop}
                onReply={onReply}
                onForward={onForward}
                onCopy={onCopy}
                onInteractiveButtonClick={onInteractiveButtonClick}
                onEditStart={onEditStart}
                ttsLoading={ttsLoading && ttsMessageId === message.id}
                ttsPlaying={ttsPlaying && ttsMessageId === message.id}
                highlighted={highlightedMessageIds?.has(message.id)}
                activeHighlight={activeHighlightId === message.id}
                searchQuery={searchQuery}
                onAudioVoiceChange={onAudioVoiceChange}
              />
            </div>
          );
        })}
      </div>

      <div className="flex justify-start pl-10">
        <TypingIndicator isVisible={isContactTyping} userName={typingUserName} />
      </div>

      <div ref={messagesEndRef} className="h-px w-full" />
      
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
              onClick={() => ref && 'current' in ref && ref.current?.scrollToBottom()}
            >
              <ChevronDown className="h-5 w-5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}));

ChatMessagesArea.displayName = 'ChatMessagesArea';
// Badge acessível de cancelamento. Anuncia via aria-live polite, move o foco
// para o botão de retry quando o foco anterior estava dentro da área de chat
// (evita roubar foco se o usuário está digitando ou em outro painel).
function LoadCancelledBadge({
  reason,
  onRetry,
  scrollContainerRef,
}: {
  reason: LoadOlderCancelReason;
  onRetry: () => void;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
}) {
  const isNav = reason === 'navigation';
  const Icon = isNav ? Navigation2 : Ban;
  const text = isNav
    ? 'Carregamento interrompido pela navegação'
    : 'Carregamento cancelado pela rolagem';
  const retryBtnRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();

  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    const insideChat = !!(active && scrollContainerRef.current?.contains(active));
    // Só move o foco se o usuário estava interagindo dentro do scroll do chat.
    // Caso contrário, o aria-live já anuncia sem interromper a tarefa atual.
    if (insideChat) {
      retryBtnRef.current?.focus({ preventScroll: true });
    }
  }, [scrollContainerRef]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="load-older-cancelled"
      data-cancel-reason={reason}
      className="flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/40 backdrop-blur-sm pl-3 pr-1 py-1 rounded-full border border-border/30"
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span id={labelId}>{text}</span>
      <button
        ref={retryBtnRef}
        type="button"
        data-testid="load-older-retry"
        onClick={onRetry}
        aria-describedby={labelId}
        aria-label="Tentar carregar mensagens anteriores novamente"
        className="inline-flex items-center gap-1 ml-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-foreground bg-background/80 hover:bg-background border border-border/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <RotateCw className="h-3 w-3" aria-hidden="true" />
        Tentar carregar de novo
      </button>
    </div>
  );
}
