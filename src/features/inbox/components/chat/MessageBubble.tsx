import { useState, memo, lazy, Suspense } from 'react';
import { useAuth } from '@/features/auth';
import { motion, AnimatePresence } from '@/components/ui/motion';
import { cn } from '@/lib/utils';
import { Reply, Forward, Copy } from 'lucide-react';
import { SwipeableMessage } from '@/components/mobile/SwipeableMessage';
import { DeletedMessagePlaceholder } from '../DeletedMessagePlaceholder';
import { Message, InteractiveButton } from '@/types/chat';
import { MessageReactions, QuickReactionBar } from '../MessageReactions';
import { MessageHoverToolbar } from './MessageHoverToolbar';
import { MessageImage } from '../ImagePreview';
import { DocumentPreview, VideoPreview } from '../MediaPreview';
import { AudioMessagePlayer } from '../AudioMessagePlayer';
import { InteractiveMessageDisplay, ButtonResponseBadge } from '../InteractiveMessage';
import { TextWithLinks } from '../LinkPreview';
import { QuotedMessage } from '../ReplyQuote';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatMessageTime } from './messageUtils';
import { MessageStatusInline } from './MessageStatusInline';
import { MessageReadStatus } from './MessageReadStatus';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { extractMessageType } from '@/adapters/evolutionAdapter';
import { MessageBubbleUnsupported } from './MessageBubbleUnsupported';
import { useContactAvatar } from '@/features/inbox';

import { getLogger } from '@/lib/logger';
const LocationMessageDisplay = lazy(() =>
  import('@/features/inbox/components/LocationMessage').then((m) => ({
    default: m.LocationMessageDisplay,
  }))
);
const _log = getLogger('MessageBubble');

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
  const { toast: _toast } = useToast();
  const { profile } = useAuth();
  const [_historyOpen, _setHistoryOpen] = useState(false);
  const [isActionsActive, setIsActionsActive] = useState(false);

  const isSent = message.sender === 'agent';
  const senderName = isSent ? 'Você' : message.senderName || 'Contato';
  const { avatarUrl } = useContactAvatar(
    message.conversationId,
    message.contactAvatar || contactAvatar
  );

  const _agentInitials = profile?.name ? profile.name.slice(0, 2).toUpperCase() : 'EU';
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
          if (window.innerWidth < 768) {
            setIsActionsActive(!isActionsActive);
          }
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
            <span className="mb-0.5 ml-1 block text-[13px] font-bold tracking-tight text-primary/70">
              {senderName}
            </span>
          )}
          {message.isWhisper && (
            <div className="mb-1 ml-1 flex w-fit items-center gap-1.5 rounded-full border border-warning/20 bg-warning/10 px-2 py-0.5 shadow-xs dark:bg-warning/20">
              <ShieldAlert className="h-3 w-3 animate-pulse text-warning-foreground dark:text-warning-foreground" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-warning-foreground dark:text-warning-foreground">
                Equipe — Sussurro Interno
              </span>
            </div>
          )}

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
            <motion.div
              whileHover={{ scale: 1.005 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className={cn(
                'relative overflow-visible transition-all',
                (message.type === 'image' || message.type === 'video') && !message.content
                  ? 'p-1 pb-0'
                  : density === 'comfortable'
                    ? 'px-4 py-2.5'
                    : density === 'compact'
                      ? 'px-3.5 py-2'
                      : 'px-3 py-1.5',
                isSent
                  ? 'rounded-2xl rounded-br-md bg-primary text-primary-foreground shadow-md shadow-primary/20'
                  : 'rounded-2xl rounded-bl-md border border-border/70 bg-card text-card-foreground shadow-sm',
                message.isWhisper &&
                  'border-dashed border-warning/50 bg-warning font-bold text-warning-foreground ring-4 ring-warning/5',
                isFailedTerminal && 'border-destructive/40 ring-2 ring-destructive/50'
              )}
            >
              {/* Bubble Tail */}
              {/* Bubble Tail Removal for cleaner modern look - keeping only rounded corners */}

              {message.replyTo && (
                <QuotedMessage
                  replyTo={message.replyTo}
                  isSent={isSent}
                  onClick={() => onScrollToMessage(message.replyTo!.messageId)}
                />
              )}
              {message.buttonResponse && (
                <ButtonResponseBadge
                  buttonTitle={message.buttonResponse.buttonTitle}
                  isSent={isSent}
                />
              )}
              {message.type === 'interactive' && message.interactive && (
                <InteractiveMessageDisplay
                  interactive={message.interactive}
                  isSent={isSent}
                  onButtonClick={onInteractiveButtonClick}
                />
              )}
              {showUnsupportedFallback && (
                <MessageBubbleUnsupported
                  extracted={extracted}
                  rawContent={message.content}
                  isSent={isSent}
                />
              )}
              {message.type === 'image' && message.mediaUrl && (
                <div
                  className={cn(
                    'overflow-hidden',
                    message.content ? '-mx-1 -mt-0.5 mb-1.5 rounded-xl' : 'w-full'
                  )}
                >
                  <MessageImage src={message.mediaUrl} refreshKey={mediaRefreshKey} />
                </div>
              )}
              {message.type === 'video' && message.mediaUrl && (
                <div className="mb-1.5">
                  <VideoPreview
                    url={message.mediaUrl}
                    caption={message.content}
                    isSent={isSent}
                    refreshKey={mediaRefreshKey}
                  />
                </div>
              )}
              {message.type === 'audio' && message.mediaUrl && (
                <div className="mb-1">
                  <AudioMessagePlayer
                    audioUrl={message.mediaUrl}
                    messageId={message.id}
                    isSent={isSent}
                    existingTranscription={message.transcription}
                    transcriptionStatus={message.transcriptionStatus}
                    refreshKey={mediaRefreshKey}
                    onVoiceChange={onAudioVoiceChange}
                    conversationId={message.conversationId}
                  />
                </div>
              )}
              {message.type === 'document' && message.mediaUrl && (
                <div className="mb-1.5">
                  <DocumentPreview
                    url={message.mediaUrl}
                    fileName={message.content || 'documento'}
                    isSent={isSent}
                  />
                </div>
              )}
              {message.type === 'location' && message.location && (
                <Suspense
                  fallback={<div className="h-32 w-full animate-pulse rounded-lg bg-muted" />}
                >
                  <LocationMessageDisplay location={message.location} isSent={isSent} />
                </Suspense>
              )}
              {message.type === 'sticker' && message.mediaUrl && (
                <div className="group/sticker relative mb-1">
                  <img
                    src={message.mediaUrl}
                    alt="Figurinha"
                    className="max-h-[160px] max-w-[160px] object-contain drop-shadow-lg"
                    loading="lazy"
                  />
                </div>
              )}
              {!showUnsupportedFallback &&
                message.content &&
                !['audio', 'location', 'video', 'document', 'sticker'].includes(message.type) && (
                  <TextWithLinks
                    text={message.content}
                    className={cn(
                      'whitespace-pre-wrap text-[15px] leading-[1.6] tracking-tight',
                      searchQuery && highlightedMessageIds?.has(message.id) ? '' : ''
                    )}
                    showPreviews={!message.isWhisper}
                    maxPreviews={1}
                  />
                )}
              <div
                className={cn(
                  '-mb-0.5 mt-1.5 flex items-center justify-end gap-1.5',
                  (message.type === 'image' || message.type === 'video') && !message.content
                    ? 'absolute bottom-2 right-2 rounded-full bg-black/40 px-1.5 py-0.5 text-white drop-shadow-md backdrop-blur-sm'
                    : isSent
                      ? 'text-primary-foreground/75'
                      : 'text-muted-foreground'
                )}
              >
                {message.isEdited && <span className="mr-0.5 text-[9px] italic">editada</span>}
                <div className="flex items-center gap-1">
                  {(message.status === 'sending' ||
                    message.status === 'retrying' ||
                    message._optimistic) && (
                    <RefreshCw className="h-2.5 w-2.5 animate-spin text-muted-foreground/60" />
                  )}
                  <span className="text-[11px] font-normal leading-none">
                    {formatMessageTime(message.timestamp)}
                  </span>
                </div>
                <div className="flex min-w-[15px] items-center">
                  {isSent ? (
                    <MessageStatusInline message={message} className="origin-right scale-90" />
                  ) : (
                    <MessageReadStatus message={message} />
                  )}
                </div>
              </div>
            </motion.div>
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
