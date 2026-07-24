import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { useDensity } from '@/hooks/useDensity';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MessageSquare, CheckCircle2, Headphones, Clock, MessageCircle } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { useQueues } from '@/hooks/useQueues';
import { useAllTicketStates, ConversationWithMessages } from '@/features/inbox';
import { TicketTabsFilters } from './TicketTabsFilters';

/** Main Tab component. */
export type MainTab = 'open' | 'resolved' | 'search' | 'unread';
/** Sub Tab component. */
export type SubTab = 'attending' | 'waiting';

/** Inbox Scope component. */
export type InboxScope = 'mine' | 'department' | 'all';

interface TicketTabsProps {
  conversations: ConversationWithMessages[];
  counts?: {
    open: number;
    attending: number;
    waiting: number;
    resolved: number;
    unread: number;
  };
  mainTab: MainTab;
  subTab: SubTab;
  onMainTabChange: (tab: MainTab) => void;
  onSubTabChange: (tab: SubTab) => void;
  showAll: boolean;
  onShowAllChange: (value: boolean) => void;
  scope?: InboxScope;
  onScopeChange?: (scope: InboxScope) => void;
  selectedQueueId: string | null;
  onQueueChange: (queueId: string | null) => void;
  contactType?: string | null;
  onContactTypeChange?: (value: string | null) => void;
  selectedAgentId?: string | null;
  onAgentChange?: (agentId: string | null) => void;
  departmentAgentIds?: string[];
}

/** Ticket Tabs component. */
export const TicketTabs = memo(function TicketTabs({
  conversations,
  counts: externalCounts,
  mainTab,
  subTab,
  onMainTabChange,
  onSubTabChange,
  showAll,
  onShowAllChange,
  scope = 'mine',
  onScopeChange,
  selectedQueueId,
  onQueueChange,
  contactType = null,
  onContactTypeChange,
  selectedAgentId = null,
  onAgentChange,
  departmentAgentIds = [],
}: TicketTabsProps) {
  const { user } = useAuth();
  const { queues } = useQueues();
  const { density } = useDensity();
  const isCompact = density === 'compact' || density === 'dense';
  const ticketStates = useAllTicketStates();
  const isMobile = useIsMobile();

  const fallbackCounts = useMemo(() => {
    const userId = user?.id;
    let openCount = 0;
    let attending = 0;
    let waiting = 0;
    let resolved = 0;
    let unread = 0;
    for (const c of conversations) {
      const t = ticketStates[c.contact.id];
      const status = t?.status ?? 'open';
      const assigned = t?.assignedTo ?? c.contact.assigned_to ?? null;
      if (c.unreadCount > 0 && status !== 'resolved') unread += 1;
      if (status === 'resolved') {
        resolved += 1;
      } else {
        openCount += 1;
        if (assigned && assigned === userId) attending += 1;
        if (!assigned) waiting += 1;
      }
    }
    return { open: openCount, attending, waiting, resolved, unread };
  }, [conversations, ticketStates, user?.id]);

  const counts = externalCounts ?? fallbackCounts;

  const mainTabs = useMemo(
    () => [
      {
        id: 'open' as MainTab,
        label: 'Abertos',
        icon: MessageSquare,
        count: counts.open,
        activeColor: 'bg-primary text-primary-foreground',
      },
      {
        id: 'resolved' as MainTab,
        label: 'Resolvidos',
        icon: CheckCircle2,
        count: counts.resolved,
        activeColor: 'bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]',
      },
      {
        id: 'unread' as MainTab,
        label: 'Não lidas',
        icon: MessageCircle,
        count: counts.unread,
        activeColor: 'bg-warning text-foreground',
      },
    ],
    [counts]
  );

  const subTabs = useMemo(
    () => [
      {
        id: 'attending' as SubTab,
        label: 'Atendendo',
        icon: Headphones,
        count: counts.attending,
      },
      {
        id: 'waiting' as SubTab,
        label: 'Aguardando',
        icon: Clock,
        count: counts.waiting,
      },
    ],
    [counts]
  );

  return (
    <div className={cn('transition-all duration-300', isCompact ? 'space-y-1' : 'space-y-2')}>
      <div
        className={cn(
          'flex items-center gap-1 rounded-2xl border border-border/20 bg-muted/30 shadow-sm transition-all dark:bg-muted/10',
          isCompact ? 'p-0.5' : 'p-1'
        )}
      >
        {mainTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = mainTab === tab.id;
          return (
            <button type="button"
              key={tab.id}
              onClick={() => onMainTabChange(tab.id)}
              className={cn(
                'relative flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-xl font-bold transition-all duration-500 ease-out',
                isCompact ? 'px-2 py-1.5 text-[11px] font-semibold' : 'px-3 py-2.5 text-[12px]',
                isActive
                  ? tab.activeColor + ' scale-[1.02] shadow-lg ring-1 ring-white/10'
                  : 'text-muted-foreground/70 hover:bg-muted/60 hover:text-foreground'
              )}
            >
              <Icon
                className={cn(
                  'transition-transform duration-500',
                  isCompact ? 'h-3 w-3' : 'h-4 w-4',
                  isActive && 'scale-110'
                )}
              />
              <span className="tracking-tight">{tab.label}</span>
              {tab.count !== null && (
                <Badge
                  variant="outline"
                  className={cn(
                    'h-4 min-w-[16px] border-0 px-1 text-[10px] font-medium leading-none shadow-sm transition-all duration-500',
                    isActive
                      ? 'bg-background/20 text-foreground'
                      : 'bg-muted/60 text-muted-foreground/60'
                  )}
                >
                  {tab.count}
                </Badge>
              )}
              {isActive && (
                <motion.div
                  layoutId="activeTabGlow"
                  className="pointer-events-none absolute inset-0 bg-background/5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.6 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {mainTab === 'open' && (
        <div
          className={cn(
            'flex flex-wrap items-center gap-1 border-t border-border/10 px-0.5 transition-all duration-500 animate-in fade-in slide-in-from-top-1',
            isCompact ? 'mt-0.5 pt-1.5' : 'mt-1 pt-3'
          )}
        >
          {subTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = subTab === tab.id;
            return (
              <button type="button"
                key={tab.id}
                onClick={() => onSubTabChange(tab.id)}
                className={cn(
                  'relative flex items-center gap-2 overflow-hidden border font-bold shadow-sm transition-all duration-300',
                  isCompact
                    ? 'rounded-lg px-2.5 py-1 text-[10px]'
                    : 'rounded-full px-4 py-2 text-[11px]',
                  isActive
                    ? 'border-primary/20 bg-primary/5 text-primary shadow-primary/5'
                    : 'border-transparent bg-muted/20 text-muted-foreground/60 hover:bg-muted/40 hover:text-foreground'
                )}
              >
                <Icon
                  className={cn(
                    'transition-transform',
                    isCompact ? 'h-3 w-3' : 'h-3.5 w-3.5',
                    isActive && 'rotate-[10deg]'
                  )}
                />
                {tab.label}
                <span
                  className={cn(
                    'ml-1 rounded-md bg-muted/40 px-1.5 py-0.5 text-[10px] font-black tabular-nums',
                    isActive ? 'text-primary' : 'text-muted-foreground/40'
                  )}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}

          <div className="flex-1" />
          {queues.length > 0 && (
            <Select
              value={selectedQueueId || 'all'}
              onValueChange={(v) => onQueueChange(v === 'all' ? null : v)}
            >
              <SelectTrigger
                className={cn(
                  'h-7 w-auto gap-2 rounded-full border-border/20 bg-accent/10 px-3 text-[10px] font-bold transition-all hover:bg-accent/20',
                  isMobile ? 'min-w-[70px] max-w-[100px]' : 'min-w-[90px] max-w-[140px]'
                )}
              >
                <SelectValue placeholder="Fila" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  {isMobile ? 'Todas' : 'Todas filas'}
                </SelectItem>
                {queues.map((q) => (
                  <SelectItem key={q.id} value={q.id} className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: q.color || 'hsl(var(--primary))' }}
                      />
                      {q.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      <TicketTabsFilters
        mainTab={mainTab}
        subTab={subTab}
        contactType={contactType}
        onContactTypeChange={onContactTypeChange}
        scope={scope}
        onScopeChange={onScopeChange}
        showAll={showAll}
        onShowAllChange={onShowAllChange}
        selectedAgentId={selectedAgentId}
        onAgentChange={onAgentChange}
        departmentAgentIds={departmentAgentIds}
      />
    </div>
  );
});
