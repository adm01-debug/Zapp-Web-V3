/* eslint-disable react-refresh/only-export-components */
import { useRef, useState, useEffect, useCallback, ReactNode, memo } from 'react';
import { cn } from '@/lib/utils';
import { useDensity } from '@/hooks/useDensity';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { motion } from '@/components/ui/motion';
import { SLAIndicatorForContact } from '../SLAIndicatorForContact';
import { SentimentEmoji, getSentimentFromScore, type SentimentLevel } from '../SentimentIndicator';
import { QuickPeek } from '@/components/ui/quick-peek';
import { TypingIndicatorCompact } from '../TypingIndicator';
import { useContactTyping } from '@/hooks/useContactTyping';
import { useInViewport } from '@/hooks/useInViewport';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  MessageCircle,
  Instagram,
  Mail,
  Phone,
  Pin,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { RetryFailureBadge } from './RetryFailureBadge';
import { toValidDate } from '@/utils/date/normalize';

export function ChannelBadge({ type }: { type?: string | null }) {
  const iconClass = 'w-2.5 h-2.5 text-primary-foreground';
  let Icon = MessageCircle;
  let bgColor = 'bg-[hsl(142,70%,45%)]';
  if (type === 'instagram') {
    Icon = Instagram;
    bgColor = 'bg-[hsl(330,80%,55%)]';
  } else if (type === 'email') {
    Icon = Mail;
    bgColor = 'bg-[hsl(220,70%,55%)]';
  } else if (type === 'phone' || type === 'call') {
    Icon = Phone;
    bgColor = 'bg-[hsl(200,70%,50%)]';
  }
  return (
    <span
      className={cn(
        'absolute -left-0.5 -top-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-sidebar',
        bgColor
      )}
    >
      <Icon className={iconClass} />
    </span>
  );
}

export const statusIcons = {
  open: AlertCircle,
  pending: Clock,
  resolved: CheckCircle2,
  waiting: Loader2,
};

export const statusColors = {
  open: 'bg-status-open',
  pending: 'bg-status-pending',
  resolved: 'bg-status-resolved',
  waiting: 'bg-status-waiting',
};

function TruncatedTooltip({
  fullText,
  children,
  className,
  side = 'top',
}: {
  fullText: string;
  children: (ref: React.RefObject<HTMLSpanElement>) => ReactNode;
  className?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  const check = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setIsTruncated(el.scrollWidth > el.clientWidth + 1);
  }, []);

  useEffect(() => {
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [check, fullText]);

  if (!isTruncated) return <>{children(ref)}</>;
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>{children(ref)}</TooltipTrigger>
      <TooltipContent side={side} className={cn('max-w-xs text-xs', className)}>
        {fullText}
      </TooltipContent>
    </Tooltip>
  );
}

interface ConversationItemProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conversation: any;
  isSelected: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSelect: (conversation: any) => void;
  compact?: boolean;
  selectionMode?: boolean;
  isMultiSelected?: boolean;
  onToggleSelection?: (id: string) => void;
  isPinned?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildPrimaryLabel(conversation: any): string {
  const name = (
    conversation.contact?.name ||
    conversation.contact?.pushName ||
    conversation.contact?.phone ||
    ''
  ).trim();
  const safeName = (name === 'Você' ? '' : name) || 'Contato';

  const parts = safeName.split(' ').filter((p) => p.length > 0);
  if (parts.length > 1) {
    return `${parts[0]} ${parts[parts.length - 1]}`;
  }
  return safeName;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildFullPrimaryLabel(conversation: any): string {
  return buildPrimaryLabel(conversation);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSecondaryLabel(conversation: any): string | null {
  const jobTitle =
    conversation.contact?.job_title?.trim() ||
    conversation.contact?.jobTitle?.trim() ||
    conversation.contact?.role?.trim();
  return jobTitle || 'Cargo não informado';
}

function shortRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 4) return `${w}sem`;
  const mo = Math.floor(d / 30);
  return `${mo}mês`;
}

export const ConversationItem = memo(function ConversationItem({
  conversation,
  isSelected,
  onSelect,
  compact: forceCompact = false,
  selectionMode = false,
  isMultiSelected = false,
  onToggleSelection,
  isPinned = false,
}: ConversationItemProps) {
  const { density } = useDensity();
  const isCompactMode = density === 'compact' || density === 'dense' || forceCompact;

  const contact = conversation.contact;
  const contactId = contact?.id || conversation.id;
  const status = conversation.status || 'open';
  const unreadCount = conversation.unreadCount || 0;
  const lastMessage = conversation.lastMessage;
  const tags = contact?.tags ?? [];
  const avatarUrl = contact?.avatar || contact?.avatar_url;

  const companyName = contact?.company_name || contact?.company || contact?.organization;

  const displayDate =
    toValidDate(conversation.updatedAt, null) ||
    toValidDate(lastMessage?.created_at, null) ||
    toValidDate(contact?.updated_at, null) ||
    new Date();

  const StatusIcon = statusIcons[status as keyof typeof statusIcons] || AlertCircle;
  const sentiment: SentimentLevel | null =
    conversation.sentiment ||
    (conversation.sentimentScore !== undefined
      ? getSentimentFromScore(conversation.sentimentScore)
      : contact?.ai_sentiment
        ? contact.ai_sentiment
        : null);

  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInViewport(rootRef, { rootMargin: '200px', keepVisibleMs: 1500 });
  const isTyping = useContactTyping(contactId, inView);

  const primaryLabel = buildPrimaryLabel(conversation);
  const fullPrimaryLabel = buildFullPrimaryLabel(conversation);
  const secondaryLabel = buildSecondaryLabel(conversation);
  const hasTags = tags.length > 0;
  const previewText = lastMessage?.content?.trim() || 'Sem mensagens ainda';
  const visibleTags = tags.slice(0, 2);

  if (isCompactMode) {
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
              className="absolute left-1 top-1/2 z-20 h-6 w-1 -translate-y-1/2 rounded-full bg-white"
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
                <AvatarImage src={avatarUrl} />
                <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                  {(contact?.name && contact.name !== 'Você' ? contact.name : 'C')
                    .split(' ')
                    .map((n: string) => n[0])
                    .join('')
                    .slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              {conversation.assignedTo ? (
                <Avatar className="absolute -bottom-0.5 -right-0.5 h-4 w-4 ring-1 ring-sidebar">
                  <AvatarImage src={conversation.assignedTo.avatar} />
                  <AvatarFallback className="bg-secondary text-[7px] font-bold text-secondary-foreground">
                    {conversation.assignedTo.name[0]}
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
                  <TruncatedTooltip fullText={fullPrimaryLabel}>
                    {(ref) => (
                      <span
                        ref={ref}
                        data-testid="conversation-primary"
                        className={cn(
                          'mx-0 block min-w-0 truncate rounded-none border-0 text-left font-sans text-[15px] font-normal tracking-wide transition-colors duration-200',
                          isSelected ? 'text-primary-foreground' : 'text-foreground'
                        )}
                      >
                        {primaryLabel}
                        {companyName && (
                          <span
                            className={cn(
                              'ml-1.5 text-[12px] font-normal tracking-normal opacity-70',
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
                        isSelected ? 'bg-white text-primary' : 'bg-primary text-primary-foreground'
                      )}
                    >
                      {unreadCount}
                    </span>
                  )}
                  <span
                    className={cn(
                      'text-[10px] font-semibold tabular-nums tracking-tight',
                      isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground/80'
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
                    isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground/80'
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
                          ? 'border-white/20 bg-white/20 text-white'
                          : 'border-warning/30 bg-warning/10 text-warning'
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
                    compact={isCompactMode}
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
  }

  const quickPeekPreview = (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-foreground">{conversation.contact.name}</p>
      {conversation.lastMessage?.content && (
        <p className="line-clamp-4 text-xs leading-relaxed text-muted-foreground">
          {conversation.lastMessage.content}
        </p>
      )}
      <div className="flex items-center gap-2 border-t border-border/30 pt-1 text-[10px] text-muted-foreground/60">
        <span>
          {conversation.unreadCount > 0 ? `${conversation.unreadCount} não lidas` : 'Sem novas'}
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
                <AvatarImage src={avatarUrl} className="object-cover" />
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
              {conversation.assignedTo ? (
                <Avatar className="absolute -bottom-1 -right-1 h-5 w-5 shadow-sm ring-2 ring-background">
                  <AvatarImage src={conversation.assignedTo.avatar} />
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
                  <TruncatedTooltip fullText={fullPrimaryLabel}>
                    {(ref) => (
                      <span
                        ref={ref}
                        data-testid="conversation-primary"
                        className={cn(
                          'mx-0 block min-w-0 truncate rounded-none border-0 text-left font-sans text-[15px] font-normal tracking-wide transition-colors duration-200',
                          isSelected ? 'text-primary-foreground' : 'text-foreground'
                        )}
                      >
                        {primaryLabel}
                        {companyName && (
                          <span
                            className={cn(
                              'ml-1.5 text-[12px] font-normal tracking-normal opacity-70',
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
                        isSelected ? 'bg-white text-primary' : 'bg-primary text-primary-foreground'
                      )}
                    >
                      {unreadCount}
                    </span>
                  )}
                  <span
                    className={cn(
                      'text-[11px] font-semibold tabular-nums tracking-tight',
                      isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground/80'
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
                    isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground/80'
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
                          ? 'border-white/20 bg-white/20 text-white'
                          : 'border-warning/30 bg-warning/10 text-warning'
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

ConversationItem.displayName = 'ConversationItem';
