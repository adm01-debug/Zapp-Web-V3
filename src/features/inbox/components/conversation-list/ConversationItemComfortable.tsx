import { memo } from 'react';
import { Pin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { motion } from '@/components/ui/motion';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QuickPeek } from '@/components/ui/quick-peek';
import { SentimentEmoji } from '../SentimentIndicator';
import { TypingIndicatorCompact } from '../TypingIndicator';
import {
  ChannelBadge,
  statusColors,
  statusIcons,
  shortRelativeTime,
  type ConversationItemProps,
} from './conversationItemShared';
import { TruncatedTooltip } from './TruncatedTooltip';
import { useConversationDisplay } from './useConversationDisplay';
import { AlertCircle } from 'lucide-react';

export const ConversationItemComfortable = memo(function ConversationItemComfortable({
  conversation,
  isSelected,
  onSelect,
  selectionMode = false,
  isMultiSelected = false,
  onToggleSelection,
  isPinned = false,
}: ConversationItemProps) {
  const {
    contact,
    contactId,
    status,
    unreadCount,
    avatarUrl,
    companyName,
    displayDate,
    sentiment,
    primaryLabel,
    secondaryLabel,
    hasTags,
    visibleTags,
    previewText,
    isTyping,
    rootRef,
  } = useConversationDisplay(conversation);

  const StatusIcon = statusIcons[status as keyof typeof statusIcons] || AlertCircle;

  const quickPeekPreview = (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-foreground">{contact?.name}</p>
      {conversation.lastMessage?.content && (
        <p className="line-clamp-4 text-xs leading-relaxed text-muted-foreground">
          {conversation.lastMessage.content}
        </p>
      )}
      <div className="flex items-center gap-2 border-t border-border/30 pt-1 text-[10px] text-muted-foreground/60">
        <span>
          {(conversation.unreadCount ?? 0) > 0
            ? `${conversation.unreadCount} não lidas`
            : 'Sem novas'}
        </span>
        {conversation.status && (
          <span>• {conversation.status === 'resolved' ? 'Resolvido' : 'Aberto'}</span>
        )}
      </div>
    </div>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <QuickPeek preview={quickPeekPreview} enabled={!isSelected} delay={500}>
        <div
          ref={rootRef}
          data-testid="conversation-item"
          data-density="comfortable"
          onClick={() => onSelect(conversation)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(conversation)}
          tabIndex={0}
          aria-selected={isSelected}
          role="option"
          className={cn(
            'group relative mx-2 my-1 flex min-h-[88px] cursor-pointer items-start gap-4 rounded-2xl border border-transparent p-4 outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-[-2px]',
            'hover:z-10 hover:shadow-lg',
            isSelected
              ? 'scale-[1.02] border-primary/20 bg-primary text-primary-foreground shadow-xl shadow-primary/20'
              : 'border-border/40 bg-card hover:bg-muted/40',
            isMultiSelected && 'shadow-inner ring-2 ring-primary ring-offset-2',
            isPinned && !isSelected && 'border-dashed border-primary/20 bg-muted/30'
          )}
        >
          {isSelected && (
            <motion.div
              layoutId="activeIndicator"
              className="absolute bottom-3 left-0 top-3 z-20 w-1 rounded-r-full bg-primary"
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          )}

          {selectionMode && (
            <div
              className="flex flex-shrink-0 items-center pt-3"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelection?.(contactId);
              }}
            >
              <input
                type="checkbox"
                checked={isMultiSelected}
                onChange={() => {}}
                aria-label={`Selecionar conversa de ${contact?.name || 'Contato'}`}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
              />
            </div>
          )}

          <div className="relative z-10 flex min-w-0 flex-1 items-start gap-3.5">
            <div className="relative flex-shrink-0">
              <ChannelBadge type={contact?.contact_type} />
              <Avatar
                className={cn(
                  'h-[49px] w-[49px] ring-0 transition-transform duration-300',
                  isSelected ? 'scale-105' : 'group-hover:scale-105'
                )}
              >
                <AvatarImage
                  src={avatarUrl ?? undefined}
                  alt={contact?.name || 'Contato'}
                  className="object-cover"
                />
                <AvatarFallback
                  className={cn(
                    'text-sm font-semibold tracking-tighter transition-colors duration-200',
                    isSelected ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'
                  )}
                >
                  {(contact?.name && contact.name !== 'Você' ? contact.name : 'C')
                    .split(' ')
                    .map((n: string) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {typeof conversation.assignedTo === 'object' && conversation.assignedTo?.name ? (
                <Avatar className="absolute -bottom-1 -right-1 h-5 w-5 shadow-sm ring-2 ring-background">
                  <AvatarImage
                    src={conversation.assignedTo.avatar ?? undefined}
                    alt={conversation.assignedTo.name}
                  />
                  <AvatarFallback className="bg-secondary text-[8px] font-bold text-secondary-foreground">
                    {conversation.assignedTo.name[0]}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <span
                  className={cn(
                    'absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full shadow-sm ring-2 ring-background',
                    statusColors[status as keyof typeof statusColors] || 'bg-muted'
                  )}
                >
                  <StatusIcon className="h-2 w-2 text-foreground" />
                </span>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  {isPinned && (
                    <Pin className="h-3.5 w-3.5 flex-shrink-0 fill-primary text-primary" />
                  )}
                  <TruncatedTooltip fullText={primaryLabel}>
                    {(ref) => (
                      <span
                        ref={ref}
                        data-testid="conversation-primary"
                        className={cn(
                          'mx-0 block min-w-0 truncate rounded-none border-0 text-left text-[15px] font-normal tracking-wide transition-colors duration-200',
                          isSelected ? 'text-primary-foreground' : 'text-foreground'
                        )}
                      >
                        {primaryLabel}
                        {companyName && (
                          <span
                            className={cn(
                              'ml-1.5 text-[12px] font-normal tracking-normal',
                              isSelected ? 'text-primary-foreground' : 'text-muted-foreground'
                            )}
                          >
                            • {companyName}
                          </span>
                        )}
                      </span>
                    )}
                  </TruncatedTooltip>
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-1">
                  {sentiment && <SentimentEmoji sentiment={sentiment} animated={!isSelected} />}
                  {unreadCount > 0 && (
                    <span
                      className={cn(
                        'flex h-5 min-w-[20px] animate-bounce-in items-center justify-center rounded-full px-1.5 text-[11px] font-black tabular-nums shadow-lg',
                        isSelected
                          ? 'bg-primary-foreground text-primary'
                          : 'bg-primary text-primary-foreground'
                      )}
                    >
                      {unreadCount}
                    </span>
                  )}
                  <span
                    className={cn(
                      'text-[11px] font-semibold tabular-nums tracking-tight',
                      isSelected ? 'text-primary-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {shortRelativeTime(displayDate)}
                  </span>
                </div>
              </div>
              {secondaryLabel && (
                <span
                  className={cn(
                    'block min-w-0 truncate text-[12px] font-medium',
                    isSelected ? 'text-primary-foreground' : 'text-muted-foreground'
                  )}
                >
                  {secondaryLabel}
                </span>
              )}

              {isTyping ? (
                <TypingIndicatorCompact
                  isVisible={true}
                  className={cn(
                    'text-[13px] font-bold',
                    isSelected ? 'text-primary-foreground' : 'text-success'
                  )}
                />
              ) : (
                <p
                  data-testid="conversation-preview"
                  className={cn(
                    'mt-0.5 min-w-0 truncate text-[13px] leading-normal',
                    isSelected
                      ? 'font-medium text-primary-foreground/90'
                      : unreadCount > 0
                        ? 'font-light text-foreground'
                        : 'font-light text-muted-foreground'
                  )}
                >
                  {previewText}
                </p>
              )}

              <div
                data-testid="conversation-tags"
                className="mt-2 flex flex-wrap items-center gap-1.5"
              >
                {hasTags &&
                  visibleTags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className={cn(
                        'h-5 px-2 text-[10px] font-black uppercase tracking-wider transition-colors',
                        isSelected
                          ? 'border-primary-foreground/20 bg-primary-foreground/20 text-primary-foreground'
                          : 'text-warning-accessible border-warning/30 bg-warning/10'
                      )}
                    >
                      {tag}
                    </Badge>
                  ))}
              </div>
            </div>
            {conversation.priority === 'high' && (
              <div className="h-8 w-1 flex-shrink-0 rounded-full bg-destructive" />
            )}
          </div>
        </div>
      </QuickPeek>
    </TooltipProvider>
  );
});

ConversationItemComfortable.displayName = 'ConversationItemComfortable';
