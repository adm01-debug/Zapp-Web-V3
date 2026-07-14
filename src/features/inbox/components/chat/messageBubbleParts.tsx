import { Suspense, lazy } from 'react';
import { motion } from '@/components/ui/motion';
import { cn } from '@/lib/utils';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import { type Message, type InteractiveButton } from '@/types/chat';
import { type extractMessageType } from '@/adapters/evolutionAdapter';
import { MessageImage } from '../ImagePreview';
import { DocumentPreview, VideoPreview } from '../MediaPreview';
import { AudioMessagePlayer } from '../AudioMessagePlayer';
import { InteractiveMessageDisplay, ButtonResponseBadge } from '../InteractiveMessage';
import { TextWithLinks } from '../LinkPreview';
import { QuotedMessage } from '../ReplyQuote';
import { formatMessageTime } from './messageUtils';
import { MessageStatusInline } from './MessageStatusInline';
import { MessageReadStatus } from './MessageReadStatus';
import { MessageBubbleUnsupported } from './MessageBubbleUnsupported';

const LocationMessageDisplay = lazy(() =>
  import('@/features/inbox/components/LocationMessage').then((m) => ({
    default: m.LocationMessageDisplay,
  }))
);

export interface MediaRefreshKey {
  instanceName: string;
  remoteJid: string;
  fromMe: boolean;
  id: string;
}

interface MessageBubbleBodyProps {
  message: Message;
  isSent: boolean;
  density: 'comfortable' | 'compact' | 'dense';
  isFailedTerminal: boolean;
  showUnsupportedFallback: boolean;
  extracted: ReturnType<typeof extractMessageType>;
  mediaRefreshKey: MediaRefreshKey | undefined;
  searchQuery?: string;
  highlightedMessageIds?: Set<string>;
  onScrollToMessage: (messageId: string) => void;
  onInteractiveButtonClick: (button: InteractiveButton) => void;
  onAudioVoiceChange?: (messageId: string, newBlob: Blob) => void;
}

export function MessageBubbleBody({
  message,
  isSent,
  density,
  isFailedTerminal,
  showUnsupportedFallback,
  extracted,
  mediaRefreshKey,
  searchQuery: _searchQuery,
  highlightedMessageIds,
  onScrollToMessage,
  onInteractiveButtonClick,
  onAudioVoiceChange,
}: MessageBubbleBodyProps) {
  return (
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
      {message.replyTo && (
        <QuotedMessage
          replyTo={message.replyTo}
          isSent={isSent}
          onClick={() => {
            if (message.replyTo) onScrollToMessage(message.replyTo.messageId);
          }}
        />
      )}
      {message.buttonResponse && (
        <ButtonResponseBadge buttonTitle={message.buttonResponse.buttonTitle} isSent={isSent} />
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
        <Suspense fallback={<div className="h-32 w-full animate-pulse rounded-lg bg-muted" />}>
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
              highlightedMessageIds?.has(message.id) ? '' : ''
            )}
            showPreviews={!message.isWhisper}
            maxPreviews={1}
          />
        )}

      {/* Timestamp + status row */}
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
  );
}

export function WhisperBadge() {
  return (
    <div className="mb-1 ml-1 flex w-fit items-center gap-1.5 rounded-full border border-warning/20 bg-warning/10 px-2 py-0.5 shadow-xs dark:bg-warning/20">
      <ShieldAlert className="h-3 w-3 animate-pulse text-warning-foreground dark:text-warning-foreground" />
      <span className="text-[9px] font-bold uppercase tracking-widest text-warning-foreground dark:text-warning-foreground">
        Equipe — Sussurro Interno
      </span>
    </div>
  );
}
