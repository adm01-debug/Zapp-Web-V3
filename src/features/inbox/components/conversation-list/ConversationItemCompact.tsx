import { memo } from 'react';
import { Pin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { motion } from '@/components/ui/motion';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SLAIndicatorForContact } from '../SLAIndicatorForContact';
import { SentimentEmoji } from '../SentimentIndicator';
import { TypingIndicatorCompact } from '../TypingIndicator';
import { RetryFailureBadge } from './RetryFailureBadge';
import {
  ChannelBadge,
  statusColors,
  shortRelativeTime,
  type ConversationItemProps,
} from './conversationItemShared';
import { TruncatedTooltip } from './TruncatedTooltip';
import { useConversationDisplay } from './useConversationDisplay';

export const ConversationItemCompact = memo(function ConversationItemCompact({
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
    lastMessage,
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

  return (
    <TooltipProvider delayDuration={300}>
      <motion.div
        ref={rootRef}
        data-testid="conversation-item"
        data-density="compact"
        onClick={() => onSelect(conversation)}
        whileHover={{ scale: 1.02, x: 4 }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        aria-selected={isSelected}
        role="option"
        className={cn(
          'group relative mx-2.5 my-2 flex cursor-pointer items-center gap-3 rounded-2xl border p-3.5 shadow-sm outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
          isSelected
            ? 'border-primary/30 bg-primary text-primary-foreground shadow-lg shadow-primary/25'
            : 'border-border/60 bg-card hover:border-border/80 hover:bg-muted/50 hover:shadow-md',
          isMultiSelected && 'shadow-inner ring-2 ring-primary ring-offset-2'
        )}
      >
        {isSelected && (
          <motion.div
            layoutId="conversationActiveCompact"
            className="absolute left-1 top-1/2 z-20 h-6 w-1 -translate-y-1/2 rounded-full bg-primary-foreground"
          />
        )}

        {selectionMode && (
          <div
            className="mr-0.5 flex flex-shrink-0 items-center"
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
              className={cn(
                'h-4 w-4 rounded border-border focus:ring-primary/20',
                isSelected ? 'accent-white' : 'text-primary'
              )}
            />
          </div>
        )}

        <div className="relative z-10 flex min-w-0 flex-1 items-start gap-2">
          <div className="relative mt-0.5 flex-shrink-0">
            <ChannelBadge type={contact?.contact_type} />
            <Avatar className="h-[38px] w-[38px]">
              <AvatarImage src={avatarUrl} alt={contact?.name || 'Contato'} />
              <AvatarFallback className="bg-primary text-xs font-medium text-primary-foreground">
                {(contact?.name && contact.name !== 'Você' ? contact.name : 'C')
                  .split(' ')
                  .map((n: string) => n[0])
                  .join('')
                  .slice(0, 2)}
              </AvatarFallback>
            </Avatar>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(conversation.assignedTo as any)?.name ? (
              <Avatar className="absolute -bottom-0.5 -right-0.5 h-4 w-4 ring-1 ring-sidebar">
                <AvatarImage
                  src={(conversation.assignedTo as any)?.avatar}
                  alt={(conversation.assignedTo as any)?.name}
                />
                <AvatarFallback className="bg-secondary text-[7px] font-bold text-secondary-foreground">
                  {(conversation.assignedTo as any)?.name[0]}
                </AvatarFallback>
              </Avatar>
            ) : (
              <span
                className={cn(
                  'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-1 ring-sidebar',
                  statusColors[status as keyof typeof statusColors] || 'bg-muted'
                )}
              />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
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
                      'h-4.5 flex min-w-[18px] animate-bounce-in items-center justify-center rounded-full px-1 text-[10px] font-black tabular-nums shadow-md',
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
                    'text-[10px] font-semibold tabular-nums tracking-tight',
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
                  'block min-w-0 truncate text-[11px] font-medium',
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
                  'text-[12px] font-bold',
                  isSelected ? 'text-primary-foreground' : 'text-success'
                )}
              />
            ) : (
              <p
                data-testid="conversation-preview"
                className={cn(
                  'mt-0.5 min-w-0 truncate text-[12px] leading-normal transition-colors duration-200',
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
                      'h-4.5 px-1.5 text-[9px] font-black uppercase tracking-wider transition-colors',
                      isSelected
                        ? 'border-primary-foreground/20 bg-primary-foreground/20 text-primary-foreground'
                        : 'text-warning-accessible border-warning/30 bg-warning/10'
                    )}
                  >
                    {tag}
                  </Badge>
                ))}
            </div>
            {lastMessage && (
              <div className="mt-1 flex flex-col gap-1">
                <SLAIndicatorForContact
                  conversation={conversation}
                  compact={true}
                  className="w-full justify-start"
                />
                <RetryFailureBadge message={lastMessage} compact />
              </div>
            )}
          </div>
          {conversation.priority === 'high' && (
            <div className="h-5 w-0.5 flex-shrink-0 rounded-full bg-destructive" />
          )}
        </div>
      </motion.div>
    </TooltipProvider>
  );
});

ConversationItemCompact.displayName = 'ConversationItemCompact';
