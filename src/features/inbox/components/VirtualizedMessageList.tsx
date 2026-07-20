import { useRef, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('VirtualizedMessageList');
import { EmptyState } from '@/components/ui/empty-states';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Message, InteractiveButton } from '@/types/chat';
import { MessageBubble } from './VirtualMessageBubble';
import { Clock } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useConversationReactionsRealtime } from '../hooks/reactions/useConversationReactionsRealtime';

interface VirtualizedMessageListProps {
  messages: Message[];
  onReply: (message: Message) => void;
  onForward: (message: Message) => void;
  onCopy: (content: string) => void;
  onInteractiveButtonClick: (button: InteractiveButton) => void;
  ttsLoading: boolean;
  ttsPlaying: boolean;
  ttsMessageId: string | null;
  onSpeak: (messageId: string, text: string) => void;
  onStopSpeak: () => void;
  isContactTyping?: boolean;
  contactAvatar?: string;
}

/** Virtualized Message List Ref interface definition. */
export interface VirtualizedMessageListRef {
  scrollToBottom: () => void;
  /**
   * Scrolls the virtualized list to the message with the given internal id.
   * Returns `true` when the id was found in the current list (the scroll
   * may still be a 2-step process — see implementation), `false` when the
   * caller should keep polling because the message hasn't been loaded yet.
   */
  scrollToMessage: (messageId: string) => boolean;
}

function formatDateSeparator(date: Date): string {
  if (isToday(date)) return 'Hoje';
  if (isYesterday(date)) return 'Ontem';
  return format(date, "d 'de' MMMM", { locale: ptBR });
}

type ListItem =
  | { type: 'date-separator'; date: Date; key: string }
  | { type: 'message'; message: Message; key: string };

/** Virtualized Message List constant. */
export const VirtualizedMessageList = forwardRef<VirtualizedMessageListRef, VirtualizedMessageListProps>(({
  messages, onReply, onForward, onCopy, onInteractiveButtonClick,
  ttsLoading, ttsPlaying, ttsMessageId, onSpeak, onStopSpeak, isContactTyping = false,
  contactAvatar,
}, ref) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const conversationId = messages[0]?.conversationId;
  const messageIds = useMemo(() => messages.map((m) => m.id), [messages]);
  useConversationReactionsRealtime(conversationId, messageIds);

  const listItems = useMemo((): ListItem[] => {
    const items: ListItem[] = [];
    let currentDate = '';
    messages.forEach((message) => {
      const dateKey = format(message.timestamp, 'yyyy-MM-dd');
      if (dateKey !== currentDate) { currentDate = dateKey; items.push({ type: 'date-separator', date: new Date(dateKey), key: `date-${dateKey}` }); }
      items.push({ type: 'message', message, key: message.id });
    });
    return items;
  }, [messages]);

  const getItemSize = useCallback((index: number) => {
    const item = listItems[index];
    if (item.type === 'date-separator') return 50;
    const message = item.message;
    if (message.type === 'image' || message.type === 'video') return 280;
    if (message.type === 'audio') return 120;
    if (message.type === 'document') return 100;
    if (message.type === 'location') return 200;
    const lines = Math.ceil(message.content.length / 50);
    return Math.max(80, 60 + lines * 20);
  }, [listItems]);

  const virtualizer = useVirtualizer({ count: listItems.length, getScrollElement: () => parentRef.current, estimateSize: getItemSize, overscan: 10 });

  const scrollToBottom = useCallback(() => { if (listItems.length > 0) virtualizer.scrollToIndex(listItems.length - 1, { align: 'end' }); }, [listItems.length, virtualizer]);
  // Marca quando o último scroll foi disparado por `scrollToMessage`.
  // Enquanto a marca estiver ativa, o auto-scroll-to-bottom (que dispara
  // a cada mudança em `messages.length`) é suprimido por um ciclo para
  // não competir com o destaque do deep-link "Ver no chat".
  const suppressAutoBottomRef = useRef(false);

  const scrollToMessage = useCallback((messageId: string): boolean => {
    const index = listItems.findIndex(
      (item) => item.type === 'message' && item.message.id === messageId,
    );
    if (index === -1) return false;

    suppressAutoBottomRef.current = true;
    // Pass 1 — virtualizer scrolls approximately based on estimated sizes.
    virtualizer.scrollToIndex(index, { align: 'center' });

    // Pass 2 — após o item ser montado / medido, refinamos via DOM
    // `scrollIntoView` para garantir que a bolha fique realmente
    // centralizada (importante quando `getItemSize` subestima a altura
    // de bolhas com mídia ou texto longo).
    requestAnimationFrame(() => {
      virtualizer.scrollToIndex(index, { align: 'center' });
      requestAnimationFrame(() => {
        const node = parentRef.current?.querySelector<HTMLElement>(
          `[data-message-id="${CSS.escape(messageId)}"]`,
        );
        node?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        // Libera o auto-bottom no próximo ciclo.
        setTimeout(() => { suppressAutoBottomRef.current = false; }, 400);
      });
    });
    return true;
  }, [listItems, virtualizer]);

  useImperativeHandle(ref, () => ({ scrollToBottom, scrollToMessage }), [scrollToBottom, scrollToMessage]);
  useEffect(() => {
    if (suppressAutoBottomRef.current) return;
    scrollToBottom();
  }, [messages.length, isContactTyping, scrollToBottom]);

  useEffect(() => {
    if (!contactAvatar) {
      log.warn('contactAvatar is empty or null', {
        messageCount: messages.length,
        firstMessageId: messages[0]?.id,
        contactId: messages[0]?.conversationId
      });
    }
  }, [contactAvatar, messages]);

  if (messages.length === 0) {
    return <div className="flex items-center justify-center h-full"><EmptyState icon={Clock} title="Nenhuma mensagem ainda" description="As mensagens aparecerão aqui quando a conversa começar" illustration="messages" size="sm" /></div>;
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-auto scrollbar-thin bg-muted/5">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = listItems[virtualRow.index];
          return (
            <div key={virtualRow.key} style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${virtualRow.start}px)` }}>
              {item.type === 'date-separator' ? (
                <div className="flex justify-center py-2 px-4">
                  <span className="text-xs text-muted-foreground bg-muted/50 px-4 py-1.5 rounded-full font-medium border border-border/20">{formatDateSeparator(item.date)}</span>
                </div>
              ) : (
                <MessageBubble
                  message={item.message} onReply={onReply} onForward={onForward} onCopy={onCopy}
                  onInteractiveButtonClick={onInteractiveButtonClick}
                  ttsLoading={ttsLoading} ttsPlaying={ttsPlaying} ttsMessageId={ttsMessageId}
                  onSpeak={onSpeak} onStopSpeak={onStopSpeak} scrollToMessage={scrollToMessage}
                  contactAvatar={contactAvatar}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

VirtualizedMessageList.displayName = 'VirtualizedMessageList';
