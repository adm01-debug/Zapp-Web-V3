import { useRef, useState, useEffect, useCallback, ReactNode, memo } from 'react';
import { cn } from '@/lib/utils';
import { useDensity } from '@/hooks/useDensity';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { motion } from '@/components/ui/motion';
import { SLAIndicatorForContact } from '@/features/inbox/components/SLAIndicatorForContact';
import { SentimentEmoji, getSentimentFromScore, type SentimentLevel } from '@/features/inbox/components/SentimentIndicator';
import { QuickPeek } from '@/components/ui/quick-peek';
import { TypingIndicatorCompact } from '@/features/inbox/components/TypingIndicator';
import { useContactTyping } from '@/hooks/useContactTyping';
import { useInViewport } from '@/hooks/useInViewport';
import {
  Clock, CheckCircle2, AlertCircle, Loader2,
  MessageCircle, Instagram, Mail, Phone, Pin
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { RetryFailureBadge } from './RetryFailureBadge';
import { toValidDate } from '@/utils/date/normalize';

export function ChannelBadge({ type }: { type?: string | null }) {
  const iconClass = 'w-2.5 h-2.5 text-primary-foreground';
  let Icon = MessageCircle;
  let bgColor = 'bg-[hsl(142,70%,45%)]';
  if (type === 'instagram') { Icon = Instagram; bgColor = 'bg-[hsl(330,80%,55%)]'; }
  else if (type === 'email') { Icon = Mail; bgColor = 'bg-[hsl(220,70%,55%)]'; }
  else if (type === 'phone' || type === 'call') { Icon = Phone; bgColor = 'bg-[hsl(200,70%,50%)]'; }
  return (
    <span className={cn('absolute -top-0.5 -left-0.5 w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-sidebar z-10', bgColor)}>
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
  conversation: any;
  isSelected: boolean;
  onSelect: (conversation: any) => void;
  compact?: boolean;
  selectionMode?: boolean;
  isMultiSelected?: boolean;
  onToggleSelection?: (id: string) => void;
  isPinned?: boolean;
}

function buildPrimaryLabel(conversation: any): string {
  const name = (conversation.contact?.name || conversation.contact?.pushName || conversation.contact?.phone || '').trim();
  const safeName = (name === 'Você' ? '' : name) || 'Contato';
  
  const parts = safeName.split(' ').filter(p => p.length > 0);
  if (parts.length > 1) {
    return `${parts[0]} ${parts[parts.length - 1]}`;
  }
  return safeName;
}

function buildFullPrimaryLabel(conversation: any): string {
  return buildPrimaryLabel(conversation);
}

function buildSecondaryLabel(conversation: any): string | null {
  const jobTitle = conversation.contact?.job_title?.trim() || conversation.contact?.jobTitle?.trim() || conversation.contact?.role?.trim();
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
  isPinned = false
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
  const sentiment: SentimentLevel | null = conversation.sentiment ||
    (conversation.sentimentScore !== undefined ? getSentimentFromScore(conversation.sentimentScore) : 
     (contact?.ai_sentiment ? contact.ai_sentiment : null));

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
            'relative p-3.5 rounded-2xl cursor-pointer transition-all duration-300 mx-2.5 my-2 flex items-center gap-3 group outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 border shadow-sm',
            isSelected
              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 border-primary/30'
              : 'hover:bg-muted/50 hover:border-border/80 hover:shadow-md bg-card border-border/60',
            isMultiSelected && 'ring-2 ring-primary ring-offset-2 shadow-inner'
          )}
        >
          {isSelected && <motion.div layoutId="conversationActiveCompact" className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-6 rounded-full bg-white z-20" />}
          
          {selectionMode && (
            <div
              className="flex-shrink-0 flex items-center mr-0.5"
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
                  "w-4 h-4 rounded border-border focus:ring-primary/20",
                  isSelected ? "accent-white" : "text-primary"
                )} 
              />
            </div>
          )}

          <div className="flex items-start gap-2 relative z-10 flex-1 min-w-0">
            <div className="relative flex-shrink-0 mt-0.5">
              <ChannelBadge type={contact?.contact_type} />
              <Avatar className="w-[38px] h-[38px]">
                <AvatarImage src={avatarUrl} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                  {(contact?.name && contact.name !== 'Você' ? contact.name : 'C').split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              {conversation.assignedTo ? (
                <Avatar className="absolute -bottom-0.5 -right-0.5 w-4 h-4 ring-1 ring-sidebar">
                  <AvatarImage src={conversation.assignedTo.avatar} />
                  <AvatarFallback className="bg-secondary text-secondary-foreground text-[7px] font-bold">{conversation.assignedTo.name[0]}</AvatarFallback>
                </Avatar>
              ) : (
                <span className={cn('absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-1 ring-sidebar', statusColors[status as keyof typeof statusColors] || 'bg-muted')} />
              )}
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  {isPinned && <Pin className="w-3.5 h-3.5 text-primary flex-shrink-0 fill-primary" />}
                  <TruncatedTooltip fullText={fullPrimaryLabel}>
                    {(ref) => (
                      <span
                        ref={ref}
                        data-testid="conversation-primary"
                        className={cn(
                          'truncate block min-w-0 tracking-wide transition-colors duration-200 font-sans text-left font-normal border-0 rounded-none text-[15px] mx-0',
                          isSelected ? 'text-primary-foreground' : 'text-foreground'
                        )}
                      >
                        {primaryLabel}
                        {companyName && (
                          <span className={cn(
                            "ml-1.5 text-[12px] font-normal tracking-normal opacity-70",
                            isSelected ? "text-primary-foreground" : "text-muted-foreground"
                          )}>
                            • {companyName}
                          </span>
                        )}
                      </span>
                    )}
                  </TruncatedTooltip>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {sentiment && <SentimentEmoji sentiment={sentiment} animated={!isSelected} />}
                  {unreadCount > 0 && (
                    <span className={cn(
                      "min-w-[18px] h-4.5 px-1 rounded-full flex items-center justify-center text-[10px] font-black tabular-nums shadow-md animate-bounce-in",
                      isSelected ? "bg-white text-primary" : "bg-primary text-primary-foreground"
                    )}>
                      {unreadCount}
                    </span>
                  )}
                  <span className={cn(
                    "text-[10px] font-semibold tabular-nums tracking-tight",
                    isSelected ? "text-primary-foreground/80" : "text-muted-foreground/80"
                  )}>
                    {shortRelativeTime(displayDate)}
                  </span>
                </div>
              </div>

              {secondaryLabel && (
                <span
                  className={cn(
                    'text-[11px] font-medium truncate block min-w-0',
                    isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground/80'
                  )}
                >
                  {secondaryLabel}
                </span>
              )}
              {isTyping ? (
                <TypingIndicatorCompact isVisible={true} className={cn("text-[12px] font-bold", isSelected ? "text-primary-foreground" : "text-success")} />
              ) : (
                <p
                  data-testid="conversation-preview"
                  className={cn(
                    ' text-[12px] truncate leading-normal min-w-0 mt-0.5 transition-colors duration-200',
                    isSelected 
                      ? 'text-primary-foreground/90 font-medium'
                      : unreadCount > 0
                        ? 'text-foreground font-light'
                        : 'text-muted-foreground font-light'
                  )}
                >
                  {previewText}
                </p>
              )}
              <div data-testid="conversation-tags" className="flex flex-wrap items-center gap-1.5 mt-2">
                {hasTags && visibleTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className={cn(
                      "text-[9px] h-4.5 px-1.5 font-black uppercase tracking-wider transition-colors",
                      isSelected 
                        ? "bg-white/20 text-white border-white/20" 
                        : "bg-warning/10 text-warning border-warning/30"
                    )}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
              {lastMessage && (
                <div className="mt-1 flex flex-col gap-1">
                  <SLAIndicatorForContact conversation={conversation} compact={isCompactMode} className="w-full justify-start" />
                  <RetryFailureBadge message={lastMessage} compact />
                </div>
               )}
            </div>
            {conversation.priority === 'high' && <div className="w-0.5 h-5 rounded-full bg-destructive flex-shrink-0" />}
          </div>
        </motion.div>
      </TooltipProvider>
    );
  }








  const quickPeekPreview = (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-foreground">{conversation.contact.name}</p>
      {conversation.lastMessage?.content && <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">{conversation.lastMessage.content}</p>}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 pt-1 border-t border-border/30">
        <span>{conversation.unreadCount > 0 ? `${conversation.unreadCount} não lidas` : 'Sem novas'}</span>
        {conversation.status && <span>• {conversation.status === 'resolved' ? 'Resolvido' : 'Aberto'}</span>}
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
            'relative p-4 cursor-pointer transition-all duration-300 min-h-[88px] mx-2 my-1 rounded-2xl border border-transparent group flex items-start gap-4 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-[-2px]',
            'hover:shadow-lg hover:z-10',
            isSelected
              ? 'bg-primary text-primary-foreground shadow-xl shadow-primary/20 scale-[1.02] border-primary/20'
              : 'hover:bg-muted/40 bg-card border-border/40',
            isMultiSelected && 'ring-2 ring-primary ring-offset-2 shadow-inner',
            isPinned && !isSelected && 'bg-muted/30 border-dashed border-primary/20'
          )}
        >
          {isSelected && (
            <motion.div
              layoutId="activeIndicator"
              className="absolute left-0 top-3 bottom-3 w-1 bg-primary rounded-r-full z-20"
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          )}

          {selectionMode && (
            <div
              className="flex-shrink-0 flex items-center pt-3"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelection?.(contactId);
              }}
            >
              <input 
                type="checkbox" 
                checked={isMultiSelected} 
                onChange={() => {}} 
                className="w-4 h-4 rounded border-border text-primary focus:ring-primary/20" 
              />
            </div>
          )}

          <div className="flex items-start gap-3.5 relative z-10 flex-1 min-w-0">
            <div className="relative flex-shrink-0">
              <ChannelBadge type={contact?.contact_type} />
              <Avatar className={cn(
                'w-[49px] h-[49px] ring-0 transition-transform duration-300',
                isSelected ? 'scale-105' : 'group-hover:scale-105'
              )}>
                <AvatarImage src={avatarUrl} className="object-cover" />
                <AvatarFallback className={cn(
                  'text-sm font-semibold tracking-tighter transition-colors duration-200',
                  isSelected ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'
                )}>
                  {(contact?.name && contact.name !== 'Você' ? contact.name : 'C').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {conversation.assignedTo ? (
                <Avatar className="absolute -bottom-1 -right-1 w-5 h-5 ring-2 ring-background shadow-sm">
                  <AvatarImage src={conversation.assignedTo.avatar} />
                  <AvatarFallback className="bg-secondary text-secondary-foreground text-[8px] font-bold">{conversation.assignedTo.name[0]}</AvatarFallback>
                </Avatar>
              ) : (
                <span className={cn(
                  'absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-background shadow-sm',
                  statusColors[status as keyof typeof statusColors] || 'bg-muted'
                )}>
                  <StatusIcon className="w-2 h-2 text-foreground" />
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  {isPinned && <Pin className="w-3.5 h-3.5 text-primary flex-shrink-0 fill-primary" />}
                  <TruncatedTooltip fullText={fullPrimaryLabel}>
                    {(ref) => (
                      <span
                        ref={ref}
                        data-testid="conversation-primary"
                        className={cn(
                          'truncate block min-w-0 tracking-wide transition-colors duration-200 font-sans text-left font-normal border-0 rounded-none text-[15px] mx-0',
                          isSelected ? 'text-primary-foreground' : 'text-foreground'
                        )}
                      >
                        {primaryLabel}
                        {companyName && (
                          <span className={cn(
                            "ml-1.5 text-[12px] font-normal tracking-normal opacity-70",
                            isSelected ? "text-primary-foreground" : "text-muted-foreground"
                          )}>
                            • {companyName}
                          </span>
                        )}
                      </span>
                    )}
                  </TruncatedTooltip>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  {sentiment && <SentimentEmoji sentiment={sentiment} animated={!isSelected} />}
                  {unreadCount > 0 && (
                    <span className={cn(
                      "min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center text-[11px] font-black tabular-nums shadow-lg animate-bounce-in",
                      isSelected ? "bg-white text-primary" : "bg-primary text-primary-foreground"
                    )}>
                      {unreadCount}
                    </span>
                  )}
                  <span className={cn(
                    "text-[11px] font-semibold tabular-nums tracking-tight",
                    isSelected ? "text-primary-foreground/80" : "text-muted-foreground/80"
                  )}>
                    {shortRelativeTime(displayDate)}
                  </span>
                </div>

              </div>
              {secondaryLabel && (
                <span
                  className={cn(
                    'text-[12px] font-medium truncate block min-w-0',
                    isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground/80'
                  )}
                >
                  {secondaryLabel}
                </span>
              )}
              
              {isTyping ? (
                <TypingIndicatorCompact isVisible={true} className={cn("text-[13px] font-bold", isSelected ? "text-primary-foreground" : "text-success")} />
              ) : (
                <p
                  data-testid="conversation-preview"
                  className={cn(
                    ' text-[13px] truncate leading-normal min-w-0 mt-0.5',
                    isSelected 
                      ? 'text-primary-foreground/90 font-medium'
                      : unreadCount > 0
                        ? 'text-foreground font-light'
                        : 'text-muted-foreground font-light'
                  )}
                >
                  {previewText}
                </p>
              )}
              
              <div data-testid="conversation-tags" className="flex flex-wrap items-center gap-1.5 mt-2">
                {hasTags && visibleTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className={cn(
                      "text-[10px] h-5 px-2 font-black uppercase tracking-wider transition-colors",
                      isSelected 
                        ? "bg-white/20 text-white border-white/20" 
                        : "bg-warning/10 text-warning border-warning/30"
                    )}
                  >
                    {tag}
                  </Badge>
                ))}
                
              </div>
            </div>
            {conversation.priority === 'high' && <div className="w-1 h-8 rounded-full bg-destructive flex-shrink-0" />}
          </div>
        </div>
      </QuickPeek>
    </TooltipProvider>
  );
});

ConversationItem.displayName = 'ConversationItem';

