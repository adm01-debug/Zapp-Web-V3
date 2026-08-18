import { useState, memo, useMemo, useEffect, useRef } from 'react';
import { AnimatePresence } from '@/components/ui/motion';
import { cn } from '@/lib/utils';
import { Reply, Forward, Copy } from 'lucide-react';
import { SwipeableMessage } from '@/components/mobile/SwipeableMessage';
import { DeletedMessagePlaceholder } from '../DeletedMessagePlaceholder';
import { Message, InteractiveButton } from '@/types/chat';
import { MessageReactions, QuickReactionBar } from '../MessageReactions';
import { MessageHoverToolbar, type MessageHoverToolbarProps } from './MessageHoverToolbar';
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
  /** Etapa 41: adia a conversa (snooze) — repassado do ChatPanel. */
  onSnoozeConversation?: (duration: '1h' | '3h' | 'tomorrow' | 'nextweek') => void;
  /** Etapa 44: ações de mensagem (favoritar/fixar/reportar) — repassado do ChatPanel. */
  messageActions?: MessageHoverToolbarProps['messageActions'];
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
  onSnoozeConversation,
  messageActions,
  registerRef,
  density = 'comfortable',
  onAudioVoiceChange,
}: MessageBubbleProps) {
  const [isActionsActive, setIsActionsActive] = useState(false);

  const isSent = message.sender === 'agent';
  const senderName = isSent ? 'Você' : message.senderName || 'Contato';
  const { avatarUrl } = useContactAvatar(contactJid, message.contactAvatar || contactAvatar);

  // ─── A4: retry de avatar (1 tentativa após ~800ms, depois placeholder) ─────
  // Máquina de estados por URL: idle → backoff (AvatarImage desmontado →
  // fallback de iniciais visível) → retrying (remount com key nova força novo
  // preload) → failed (estado final = sem <img>, iniciais preservadas).
  // NOTA (radix-avatar 1.2.x): o AvatarImage pré-carrega via `new Image()` e só
  // renderiza o <img> quando `loaded` — o antigo onError inline nunca disparava
  // (era código morto). O gatilho real é onLoadingStatusChange('error') +
  // remount via key para re-disparar o preload. Re-render não re-dispara nada;
  // troca de URL/mensagem/conversa reseta via efeito.
  const [avatarPhase, setAvatarPhase] = useState<'idle' | 'backoff' | 'retrying' | 'failed'>('idle');
  const [avatarSrc, setAvatarSrc] = useState<string | undefined>(avatarUrl || undefined);
  const avatarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setAvatarPhase('idle');
    setAvatarSrc(avatarUrl || undefined);
    return () => {
      if (avatarTimerRef.current) {
        clearTimeout(avatarTimerRef.current);
        avatarTimerRef.current = null;
      }
    };
  }, [avatarUrl]);

  const handleAvatarStatus = (status: string) => {
    if (status !== 'error' || !avatarUrl) return;
    if (avatarPhase === 'failed' || avatarPhase === 'backoff') return;
    if (avatarPhase === 'retrying') {
      // 2º erro: placeholder explícito — AvatarImage desmontado, iniciais.
      setAvatarPhase('failed');
      setAvatarSrc(undefined);
      return;
    }
    // 1º erro: fallback imediato + 1 retry agendado (~800ms).
    setAvatarPhase('backoff');
    setAvatarSrc(undefined);
    if (avatarTimerRef.current) clearTimeout(avatarTimerRef.current);
    avatarTimerRef.current = setTimeout(() => {
      avatarTimerRef.current = null;
      setAvatarPhase('retrying');
      setAvatarSrc(avatarUrl || undefined);
    }, 800);
  };

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

  const mediaRefreshKey = useMemo(
    () =>
      instanceName && contactJid && message.external_id
        ? {
            instanceName,
            remoteJid: contactJid,
            fromMe: isSent,
            id: message.external_id,
            // FIX 2026-08-06 (GAP-01 auditoria mídia): propagar tipo para a
            // skip-list de mídia — mesmo fix já aplicado em ChatMessageBubble/
            // VirtualMessageBubble. Sem isso, ptv/ephemeral/vcard disparam
            // refresh get-media-base64 que sempre falha (WARN spam + toast
            // "Mídia indisponível" desnecessário) no caminho principal.
            messageType: message.message_type ?? message.type ?? null,
          }
        : undefined,
    [instanceName, contactJid, message.external_id, isSent, message.message_type, message.type]
  );

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
                {avatarPhase !== 'failed' && avatarPhase !== 'backoff' && (
                  <AvatarImage
                    key={avatarPhase === 'retrying' ? 'avatar-retry' : 'avatar-initial'}
                    src={avatarSrc}
                    alt={senderName}
                    referrerPolicy="no-referrer"
                    onError={() => handleAvatarStatus('error')}
                    onLoadingStatusChange={handleAvatarStatus}
                  />
                )}
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
            {isActionsActive && (
              <QuickReactionBar
                key="quick-reaction-bar"
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
            )}
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
            onSnoozeConversation={onSnoozeConversation}
            messageActions={messageActions}
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
        {message.content && (
          <ContextMenuItem onClick={() => onCopy(message.content || '')} className="gap-2">
            <Copy className="h-3.5 w-3.5" /> Copiar
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
});
