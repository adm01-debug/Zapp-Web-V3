import { useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Pencil,
  Trash2,
  X,
  Check,
  Reply,
  Copy,
  Volume2,
  VolumeX,
  Loader2,
  SmilePlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { MarkdownPreview } from '@/features/inbox';
import { MessageReactions, QUICK_EMOJIS, TeamQuickReactionBar } from './MessageReactions';
import { MessageStatus } from '@/features/inbox/components/MessageStatus';
import { formatTime, formatDateSep, MediaContent, MediaTypeIcon } from './teamChatParts';
import type { TeamMessage } from '@/hooks/useTeamChat';
import type { AggregatedReaction } from '@/features/inbox/hooks/team-chat/useTeamMessageReactions';

export interface TeamChatMessageRowProps {
  index: number;
  style: React.CSSProperties;
  ariaAttributes: Record<string, string>;
  onMeasure: (index: number, height: number) => void;
  msg: TeamMessage;
  showDate: boolean;
  isMine: boolean;
  isEditing: boolean;
  repliedMsg: TeamMessage | null;
  isThisTtsPlaying: boolean;
  isThisTtsLoading: boolean;
  cleanText: string;
  conversationType: string;
  editText: string;
  onEditTextChange: (text: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  onCopy: (text: string) => void;
  onReply: (msg: TeamMessage) => void;
  onStartEdit: (msg: TeamMessage) => void;
  onTtsSpeak: (content: string, id: string) => void;
  onTtsStop: () => void;
  reactions: AggregatedReaction[];
  isToggling: boolean;
  onToggleReaction: (params: { messageId: string; emoji: string }) => void;
}

export function TeamChatMessageRow({
  index,
  style,
  ariaAttributes,
  onMeasure,
  msg,
  showDate,
  isMine,
  isEditing,
  repliedMsg,
  isThisTtsPlaying,
  isThisTtsLoading,
  cleanText,
  conversationType,
  editText,
  onEditTextChange,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onCopy,
  onReply,
  onStartEdit,
  onTtsSpeak,
  onTtsStop,
  reactions,
  isToggling,
  onToggleReaction,
}: TeamChatMessageRowProps) {
  const measuredRef = useRef(false);
  const hasMedia = !!msg.media_url;

  return (
    <div
      style={style}
      {...ariaAttributes}
      ref={(el) => {
        if (el && !measuredRef.current) {
          const h = el.getBoundingClientRect().height;
          if (h > 0) {
            measuredRef.current = true;
            onMeasure(index, h);
          }
        }
      }}
    >
      <ContextMenu key={msg.id}>
        <ContextMenuTrigger asChild>
          <div data-testid={`message-container-${msg.id}`} className="group/msg relative px-4">
            {showDate && (
              <div className="flex justify-center py-2">
                <span className="rounded-full border border-border/10 bg-muted/20 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                  {formatDateSep(msg.created_at)}
                </span>
              </div>
            )}
            <div
              className={cn('relative flex gap-2 py-0.5', isMine ? 'justify-end' : 'justify-start')}
            >
              {!isMine && (
                <Avatar className="mt-1 h-7 w-7 shrink-0">
                  <AvatarImage
                    src={msg.sender?.avatar_url || undefined}
                    alt={msg.sender?.name || ''}
                  />
                  <AvatarFallback className="bg-muted text-[10px]">
                    {msg.sender?.name?.charAt(0) || '?'}
                  </AvatarFallback>
                </Avatar>
              )}

              <div className={cn('relative max-w-[70%] space-y-1')}>
                <TeamQuickReactionBar
                  messageId={msg.id}
                  isMine={isMine}
                  onToggle={(emoji) => onToggleReaction({ messageId: msg.id, emoji })}
                  reactions={reactions}
                />

                <div
                  className={cn(
                    'relative rounded-2xl px-3.5 py-2 shadow-none',
                    isMine
                      ? 'rounded-br-md bg-primary text-primary-foreground'
                      : 'rounded-bl-md border border-border/20 bg-muted/30 text-foreground'
                  )}
                >
                  {!isMine && conversationType === 'group' && (
                    <p className="mb-1 text-[11px] font-bold text-primary opacity-90">
                      {msg.sender?.name}
                    </p>
                  )}
                  {repliedMsg && (
                    <div
                      className={cn(
                        'mb-1.5 rounded border-l-2 px-2 py-1 text-[10px]',
                        isMine
                          ? 'border-primary-foreground/30 bg-primary-foreground/10'
                          : 'border-muted-foreground/30 bg-muted/50'
                      )}
                    >
                      <span className="font-medium">{repliedMsg.sender?.name}</span>
                      <p className="flex items-center gap-1 truncate opacity-80">
                        {repliedMsg.media_type && <MediaTypeIcon type={repliedMsg.media_type} />}
                        {repliedMsg.content || 'Mídia'}
                      </p>
                    </div>
                  )}
                  {isEditing ? (
                    <div className="space-y-1.5">
                      <Input
                        value={editText}
                        onChange={(e) => onEditTextChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') onSaveEdit();
                          if (e.key === 'Escape') onCancelEdit();
                        }}
                        className="h-7 bg-background text-sm text-foreground"
                        autoFocus
                      />
                      <div className="flex justify-end gap-1">
                        <Button
                          aria-label="Cancelar edição"
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5"
                          onClick={onCancelEdit}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                        <Button
                          aria-label="Salvar edição"
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5"
                          onClick={onSaveEdit}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {hasMedia && <MediaContent msg={msg} />}
                      {msg.content && (!hasMedia || msg.media_type === 'document') && (
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                          <MarkdownPreview text={msg.content} className="inline" />
                        </p>
                      )}
                      {msg.content &&
                        hasMedia &&
                        msg.media_type !== 'document' &&
                        ![
                          '🎨 Figurinha',
                          '🎵 Áudio meme',
                          '😀 Emoji',
                          '🎤 Mensagem de áudio',
                        ].includes(msg.content) && (
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">
                            {msg.content}
                          </p>
                        )}
                      <div
                        className={cn(
                          'mt-0.5 flex items-center gap-1',
                          isMine ? 'justify-end' : 'justify-between'
                        )}
                      >
                        {cleanText && (
                          <button
                            onClick={() =>
                              isThisTtsPlaying ? onTtsStop() : onTtsSpeak(msg.content, msg.id)
                            }
                            aria-label={isThisTtsPlaying ? 'Parar leitura' : 'Ouvir mensagem'}
                            className={cn(
                              'rounded-full p-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100',
                              isMine
                                ? 'text-primary-foreground/60 hover:text-primary-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                            )}
                          >
                            {isThisTtsLoading ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : isThisTtsPlaying ? (
                              <VolumeX className="h-3 w-3" />
                            ) : (
                              <Volume2 className="h-3 w-3" />
                            )}
                          </button>
                        )}
                        <div className="flex items-center gap-1">
                          <span
                            className={cn(
                              'text-[10px]',
                              isMine ? 'text-primary-foreground/60' : 'text-muted-foreground'
                            )}
                          >
                            {formatTime(msg.created_at)}
                            {msg.is_edited && ' · editado'}
                          </span>
                          {isMine && (
                            <MessageStatus
                              status={msg.status || 'sent'}
                              className={cn(
                                'origin-right scale-75',
                                msg.status === 'read' ? 'text-info' : 'text-primary-foreground/60'
                              )}
                            />
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            <MessageReactions
              messageId={msg.id}
              reactions={reactions}
              isMine={isMine}
              isToggling={isToggling}
              onToggle={(emoji) => onToggleReaction({ messageId: msg.id, emoji })}
            />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuSub>
            <ContextMenuSubTrigger className="gap-2">
              <SmilePlus className="h-3.5 w-3.5" /> Reagir
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <div className="grid grid-cols-4 gap-1 p-1">
                {QUICK_EMOJIS.map((e) => (
                  <Button
                    key={e}
                    size="icon"
                    variant="ghost"
                    onClick={() => onToggleReaction({ messageId: msg.id, emoji: e })}
                    className="h-9 w-9 text-xl transition-all hover:scale-125 focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`Reagir com ${e}`}
                  >
                    {e}
                  </Button>
                ))}
              </div>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem onClick={() => onReply(msg)} className="gap-2">
            <Reply className="h-3.5 w-3.5" /> Responder
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onCopy(msg.content || '')} className="gap-2">
            <Copy className="h-3.5 w-3.5" /> Copiar Texto
          </ContextMenuItem>
          {isMine && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => onStartEdit(msg)} className="gap-2">
                <Pencil className="h-3.5 w-3.5" /> Editar
              </ContextMenuItem>
              <ContextMenuItem onClick={() => onDelete(msg.id)} className="gap-2 text-destructive">
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    </div>
  );
}
