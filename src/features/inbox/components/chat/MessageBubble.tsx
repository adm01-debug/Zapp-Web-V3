import { useState, memo } from 'react';
import { useAuth } from '@/features/auth';
import { AnimatePresence } from '@/components/ui/motion';
import { cn } from '@/lib/utils';
import { Reply, Forward, Copy } from 'lucide-react';
import { SwipeableMessage } from '@/components/mobile/SwipeableMessage';
import { DeletedMessagePlaceholder } from '../DeletedMessagePlaceholder';
import { Message, InteractiveButton } from '@/types/chat';
import { MessageReactions, QuickReactionBar } from '../MessageReactions';
import { MessageHoverToolbar } from './MessageHoverToolbar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { extractMessageType } from '@/adapters/evolutionAdapter';
import { useContactAvatar } from '@/features/inbox';
import { formatMessageTime } from './messageUtils';
import { MessageBubbleBody, WhisperBadge } from './messageBubbleParts';

interface MessageBubbleProps {
  message: Message;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  contactAvatar?: string;
  instanceName?: string;
  contactJid?: string;
  ttsLoading: boolean;
  ttsPlaying: boolean;
  ttsMessageId: string | null;
  highlightedMessageIds?: Set<string>;
  activeHighlightId?: string | null;
  searchQuery?: string;
  onSpeak: (messageId: string, text: string) => void;
  onStop: () => void;
  onReply: (message: Message) => void;
  onForward: (message: Message) => void;
  onCopy: (content: string) => void;
  onScrollToMessage: (messageId: string) => void;
  onInteractiveButtonClick: (button: InteractiveButton) => void;
  onEditStart?: (message: Message) => void;
  onMessageDeleted: (messageId: string) => void;
  registerRef: (el: HTMLDivElement | null) => void;
  density?: 'comfortable' | 'compact' | 'dense';
  onAudioVoiceChange?: (messageId: string, newBlob: Blob) => void;
}

/** Message Bubble component for the chat section. */
export const MessageBubble = memo(function MessageBubble({
  message,
  isFirstInGroup,
  isLastInGroup,
  contactAvatar,
  instanceName,
  contactJid,
  ttsLoading,
  ttsPlaying,
  ttsMessageId,
  highlightedMessageIds,
  activeHighlightId,
  searchQuery,
  onSpeak,
  onStop,
  onReply,
  onForward,
  onCopy,
  onScrollToMessage,
  onInteractiveButtonClick,
  onEditStart,
  onMessageDeleted,
  registerRef,
  density = 'comfortable',
  onAudioVoiceChange,
}: MessageBubbleProps) {
  const { profile: _profile } = useAuth();
  const [isActionsActive, setIsActionsActive] = useState(false);

  const isSent = message.sender === 'agent';
  const senderName = isSent ? 'Você' : message.senderName || 'Contato';
  const { avatarUrl } = useContactAvatar(
    message.conversationId,
    message.contactAvatar || contactAvatar
  );

  const isFailedTerminal =
    isSent &&
    !message.is_deleted &&
    (message.status === 'failed' ||
      message.status === 'failed_auth' ||
      message.status === 'failed_retries');

  const extracted = extractMessageType(message.message_type ?? message.type);
  const showUnsupportedFallback =
    !message.is_deleted &&
    !extracted.supported &&
    !(
      message.mediaUrl &&
      (message.type === 'image' ||
        message.type === 'video' ||
        message.type === 'audio' ||
        message.type === 'document' ||
        message.type === 'sticker')
    ) &&
    !(message.type === 'location' && message.location) &&
    !(message.type === 'interactive' && message.interactive);

  const mediaRefreshKey =
    instanceName && contactJid && message.external_id
      ? { instanceName, remoteJid: contactJid, fromMe: isSent, id: message.external_id }
      : undefined;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) return;
    switch (e.key.toLowerCase()) {
      case 'r':
        e.preventDefault();
        onReply(message);
        break;
      case 'f':
        e.preventDefault();
        onForward(message);
        break;
      case 'c':
        e.preventDefault();
        if (message.content) onCopy(message.content);
        break;
    }
  };

  const bubbleContent = (
    <SwipeableMessage onSwipeRight={() => onReply(message)} onSwipeLeft={() => onForward(message)}>
      <div
        ref={registerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onClick={() => {
          if (window.innerWidth < 768) setIsActionsActive(!isActionsActive);
        }}
        role="listitem"
        aria-label={`Mensagem de ${senderName} às ${formatMessageTime(message.timestamp)}. Pressione R para responder, F para encaminhar, C para copiar.`}
        data-testid={`message-bubble-${message.id}`}
        data-message-id={message.id}
        className={cn(
          'group flex gap-2.5 rounded-2xl outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          isSent ? 'justify-end' : 'justify-start',
          density === 'comfortable' ? 'mb-3' : density === 'compact' ? 'mb-2' : 'mb-1.5',
          highlightedMessageIds?.has(message.id) && 'relative',
          activeHighlightId === message.id &&
            'animate-[pulse_1.5s_ease-in-out_1] rounded-2xl ring-2 ring-primary ring-offset-1',
          highlightedMessageIds?.has(message.id) &&
            activeHighlightId !== message.id &&
            'rounded-2xl bg-primary/10'
        )}
      >
        {!isSent && (
          <div className="w-[36px] shrink-0">
            {isLastInGroup && (
              <Avatar className="h-[36px] w-[36px] border border-border/10 shadow-sm ring-2 ring-background">
                <AvatarImage
                  src={avatarUrl || undefined}
                  alt={senderName}
                  referrerPolicy="no-referrer"
                  onError={(e) => (e.target as HTMLImageElement).removeAttribute('src')}
                />
                <AvatarFallback className="bg-gradient-to-br from-muted to-muted/60 text-[10px] font-bold uppercase text-muted-foreground">
                  {senderName.slice(0, 2)}
                </AvatarFallback>
              </Avatar>
            )}
          </div>
        )}

        <div
          className={cn('relative max-w-[85%] space-y-0.5 sm:max-w-[70%]', isSent && 'items-end')}
        >
          {!isSent && isFirstInGroup && (
            <span className="text-primary-accessible mb-0.5 ml-1 block text-[13px] font-bold tracking-tight">
              {senderName}
            </span>
          )}
          {message.isWhisper && <WhisperBadge />}

          <AnimatePresence>
            <QuickReactionBar
              messageId={message.id}
              isSent={isSent}
              instanceName={instanceName}
              contactJid={contactJid}
              externalId={message.external_id}
              senderType={message.sender}
              refreshKey={message.updated_at}
              disableRealtime
              forceShow={isActionsActive}
            />
          </AnimatePresence>

          {!message.is_deleted && (
            <div className="mt-1">
              <MessageReactions
                messageId={message.id}
                isSent={isSent}
                instanceName={instanceName}
                contactJid={contactJid}
                externalId={message.external_id}
                senderType={message.sender}
                refreshKey={message.updated_at}
                disableRealtime
              />
            </div>
          )}

          <MessageHoverToolbar
            message={message}
            isSent={isSent}
            instanceName={instanceName}
            contactJid={contactJid}
            ttsLoading={ttsLoading}
            ttsPlaying={ttsPlaying}
            ttsMessageId={ttsMessageId}
            onReply={onReply}
            onForward={onForward}
            onCopy={onCopy}
            onSpeak={onSpeak}
            onStop={onStop}
            onEditStart={onEditStart}
            onMessageDeleted={onMessageDeleted}
          />

          {message.is_deleted ? (
            <DeletedMessagePlaceholder
              isSent={isSent}
              content={message.content}
              deletedAt={message.deleted_at}
            />
          ) : (
            <MessageBubbleBody
              message={message}
              isSent={isSent}
              density={density}
              isFailedTerminal={isFailedTerminal}
              showUnsupportedFallback={showUnsupportedFallback}
              extracted={extracted}
              mediaRefreshKey={mediaRefreshKey}
              searchQuery={searchQuery}
              highlightedMessageIds={highlightedMessageIds}
              onScrollToMessage={onScrollToMessage}
              onInteractiveButtonClick={onInteractiveButtonClick}
              onAudioVoiceChange={onAudioVoiceChange}
            />
          )}
        </div>
      </div>
    </SwipeableMessage>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{bubbleContent}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onReply(message)} className="gap-2">
          <Reply className="h-3.5 w-3.5" /> Responder
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onForward(message)} className="gap-2">
          <Forward className="h-3.5 w-3.5" /> Encaminhar
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onCopy(message.content || '')} className="gap-2">
          <Copy className="h-3.5 w-3.5" /> Copiar
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
