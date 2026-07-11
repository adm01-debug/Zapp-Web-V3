import { lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { Message, MessageReaction, InteractiveButton } from '@/types/chat';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { useIsMobile } from '@/hooks/use-mobile';
import { motion } from '@/components/ui/motion';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MessageReactions } from '../MessageReactions';
import { MessageImage } from '../ImagePreview';
import { DocumentPreview, VideoPreview, StickerPreview } from '../MediaPreview';
import { AudioMessagePlayer } from '../AudioMessagePlayer';
import { InteractiveMessageDisplay, ButtonResponseBadge } from '../InteractiveMessage';
import { QuotedMessage } from '../ReplyQuote';
import { TextToSpeechButton } from '../TextToSpeechButton';
import { TextWithLinks } from '../LinkPreview';

// Lazy-load mapbox-heavy LocationMessage component
const LocationMessageDisplay = lazy(() =>
  import('../LocationMessage').then((m) => ({ default: m.LocationMessageDisplay }))
);
import { Reply, Forward, Copy, Lock } from 'lucide-react';
import { format } from 'date-fns';
import { MessageStatusIcon } from './messageUtils';

interface ChatMessageBubbleProps {
  message: Message;
  reactions: MessageReaction[];
  ttsLoading: boolean;
  ttsPlaying: boolean;
  ttsMessageId: string | null;
  onSpeak: (messageId: string, text: string) => void;
  onStop: () => void;
  onReply: (message: Message) => void;
  onForward: (message: Message) => void;
  onCopy: (content: string) => void;
  onScrollToMessage: (messageId: string) => void;
  onInteractiveButtonClick: (button: InteractiveButton) => void;
  registerRef: (messageId: string, el: HTMLDivElement | null) => void;
  instanceName?: string;
  contactJid?: string;
  density?: 'comfortable' | 'compact' | 'dense';
}

// Message status icon — wrapped in tooltip for failure states so the user
// gets actionable guidance (re-authenticate / retry).
function MessageStatusIconWithTooltip({ status }: { status: Message['status'] }) {
  const tooltip =
    status === 'failed_auth'
      ? 'Falha de autenticação na conexão do WhatsApp. Reconecte a instância em Canais para reenviar.'
      : status === 'failed_retries'
        ? 'A mensagem falhou após várias tentativas automáticas. Toque para tentar reenviar manualmente.'
        : status === 'failed'
          ? 'Falha ao enviar a mensagem. Verifique a conexão e tente novamente.'
          : null;

  if (!tooltip) return <MessageStatusIcon status={status} />;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="button" tabIndex={0} aria-label={tooltip} className="inline-flex cursor-help">
          <MessageStatusIcon status={status} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

function formatMessageTime(date: Date): string {
  return format(date, 'HH:mm');
}

export function ChatMessageBubble({
  message,
  reactions: _reactions,
  ttsLoading,
  ttsPlaying,
  ttsMessageId,
  onSpeak,
  onStop,
  onReply,
  onForward,
  onCopy,
  onScrollToMessage,
  onInteractiveButtonClick,
  registerRef,
  instanceName,
  contactJid,
  density = 'comfortable',
}: ChatMessageBubbleProps) {
  const isSent = message.sender === 'agent';
  const mediaRefreshKey =
    instanceName && contactJid && message.external_id
      ? { instanceName, remoteJid: contactJid, fromMe: isSent, id: message.external_id }
      : undefined;

  const isMobile = useIsMobile();

  // Swipe gestures (mobile): right = reply, left = forward
  const { swipeState, handlers: swipeHandlers } = useSwipeGesture({
    onSwipeRight: () => onReply(message),
    onSwipeLeft: () => onForward(message),
    enabled: isMobile,
    threshold: 60,
  });

  return (
    <div
      ref={(el) => registerRef(message.id, el)}
      className={cn(
        'group flex gap-2.5',
        isSent ? 'justify-end' : 'justify-start',
        density === 'comfortable' ? 'mb-3' : density === 'compact' ? 'mb-2' : 'mb-1.5'
      )}
      {...swipeHandlers}
    >
      <motion.div
        initial={{ opacity: 0, x: isSent ? 20 : -20, scale: 0.95 }}
        animate={{
          opacity: 1,
          x: swipeState.isSwiping ? swipeState.offsetX : 0,
          scale: 1,
        }}
        transition={
          swipeState.isSwiping ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 25 }
        }
        className={cn(
          'relative max-w-[85%] space-y-1 sm:max-w-[70%]',
          density === 'dense' && 'max-w-[90%] sm:max-w-[80%]'
        )}
      >
        {/* Message Actions (visible on hover/focus) */}
        <div
          className={cn(
            'absolute top-0 z-10 flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100',
            isSent ? 'right-full mr-2' : 'left-full ml-2',
            density !== 'comfortable' && 'scale-90'
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => onReply(message)}
                className="rounded-full border border-border/50 bg-card/60 p-1.5 text-muted-foreground shadow-sm backdrop-blur-md hover:bg-primary/10 hover:text-primary"
                aria-label="Responder"
              >
                <Reply className="h-3.5 w-3.5" />
              </motion.button>
            </TooltipTrigger>
            <TooltipContent>Responder</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => onForward(message)}
                className="rounded-full border border-border/50 bg-card p-1.5 text-muted-foreground shadow-sm hover:bg-primary/10 hover:text-primary"
                aria-label="Encaminhar"
              >
                <Forward className="h-3.5 w-3.5" />
              </motion.button>
            </TooltipTrigger>
            <TooltipContent>Encaminhar</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => onCopy(message.content)}
                className="rounded-full border border-border/50 bg-card p-1.5 text-muted-foreground shadow-sm hover:bg-primary/10 hover:text-primary"
                aria-label="Copiar"
              >
                <Copy className="h-3.5 w-3.5" />
              </motion.button>
            </TooltipTrigger>
            <TooltipContent>Copiar</TooltipContent>
          </Tooltip>

          {message.type === 'text' && (
            <TextToSpeechButton
              messageId={message.id}
              text={message.content}
              isLoading={ttsLoading}
              isPlaying={ttsPlaying}
              currentMessageId={ttsMessageId}
              onSpeak={onSpeak}
              onStop={onStop}
              className="rounded-full border border-border/50 bg-card p-1.5 shadow-sm"
            />
          )}
        </div>

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
            message.isWhisper
              ? 'rounded-2xl border border-warning/40 bg-warning/10 text-warning-foreground shadow-inner'
              : isSent
                ? 'rounded-2xl rounded-br-md bg-primary text-primary-foreground shadow-md shadow-primary/20'
                : 'rounded-2xl rounded-bl-md border border-border/70 bg-card text-card-foreground shadow-sm'
          )}
        >
          {/* Quoted message (reply) */}
          {message.replyTo && (
            <QuotedMessage
              replyTo={message.replyTo}
              isSent={isSent}
              onClick={() => onScrollToMessage(message.replyTo!.messageId)}
            />
          )}

          {/* Button response badge */}
          {message.buttonResponse && (
            <ButtonResponseBadge buttonTitle={message.buttonResponse.buttonTitle} isSent={isSent} />
          )}

          {/* Interactive message */}
          {message.type === 'interactive' && message.interactive && (
            <InteractiveMessageDisplay
              interactive={message.interactive}
              isSent={isSent}
              onButtonClick={onInteractiveButtonClick}
            />
          )}

          {/* Image message */}
          {message.type === 'image' && (
            <div className="mb-2 overflow-hidden rounded-lg">
              <MessageImage src={message.mediaUrl ?? null} refreshKey={mediaRefreshKey} />
            </div>
          )}

          {/* Video message */}
          {message.type === 'video' && (
            <div className="mb-2">
              <VideoPreview
                url={message.mediaUrl ?? null}
                caption={message.content}
                isSent={isSent}
                refreshKey={mediaRefreshKey}
                isPtv={
                  message.message_type === 'ptvMessage' ||
                  (message.media_meta as any)?.ptt === true ||
                  (message.media_meta as any)?.isPtv === true ||
                  message.content?.includes('[Vídeo-nota]')
                }
              />
            </div>
          )}

          {/* Audio message */}
          {message.type === 'audio' && message.mediaUrl && (
            <div className="mb-2">
              <AudioMessagePlayer
                audioUrl={message.mediaUrl}
                messageId={message.id}
                isSent={isSent}
                existingTranscription={message.transcription}
                transcriptionStatus={message.transcriptionStatus}
                refreshKey={mediaRefreshKey}
              />
            </div>
          )}

          {/* Document message */}
          {message.type === 'document' && (
            <div className="mb-2">
              <DocumentPreview
                url={message.mediaUrl ?? ''}
                fileName={message.content || 'documento'}
                isSent={isSent}
              />
            </div>
          )}

          {/* Location message - lazy loaded (mapbox is heavy) */}
          {message.type === 'location' && message.location && (
            <Suspense fallback={<div className="h-32 w-full animate-pulse rounded-lg bg-muted" />}>
              <LocationMessageDisplay location={message.location} isSent={isSent} />
            </Suspense>
          )}

          {/* Sticker message */}
          {message.type === 'sticker' && (
            <div className="mb-1">
              <StickerPreview url={message.mediaUrl ?? ''} isSent={isSent} />
            </div>
          )}

          {/* Text content */}
          {message.content &&
            message.type !== 'audio' &&
            message.type !== 'location' &&
            message.type !== 'video' &&
            message.type !== 'document' &&
            message.type !== 'sticker' && (
              <div className="flex flex-col gap-1">
                {message.isWhisper && (
                  <div className="mb-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider opacity-70">
                    <Lock className="h-2.5 w-2.5" />
                    Sussurro Interno
                  </div>
                )}
                <TextWithLinks
                  text={message.content}
                  className={cn(
                    'whitespace-pre-wrap text-[15px] leading-[1.6] tracking-tight',
                    message.isWhisper && 'italic'
                  )}
                  maxPreviews={2}
                />
              </div>
            )}

          {/* Timestamp and status */}
          <div
            className={cn(
              '-mb-0.5 mt-1.5 flex items-center justify-end gap-1.5',
              isSent ? 'text-primary-foreground/75' : 'text-muted-foreground'
            )}
          >
            <span className="text-[11px] font-normal leading-none">
              {formatMessageTime(message.timestamp)}
            </span>
            {isSent && <MessageStatusIconWithTooltip status={message.status} />}
          </div>
        </motion.div>

        {/* Reactions */}
        <MessageReactions messageId={message.id} isSent={isSent} />
      </motion.div>
    </div>
  );
}
