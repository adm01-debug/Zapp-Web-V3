import { useState, useRef, useEffect } from 'react';
import { Mail, Star, RefreshCw, Filter, Loader2, AlertTriangle, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { type EmailThread } from '@/types/gmail';
import { SLADot } from './EmailSLABadge';
import { useEmailSLA } from '@/hooks/useEmailManagement';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type FilterValue = 'all' | 'unread' | 'starred' | 'sent';

interface EmailThreadListProps {
  threads: EmailThread[];
  selectedThreadId?: string | null;
  accountId: string | null;
  isLoading?: boolean;
  hasMore?: boolean;
  onSelectThread: (thread: EmailThread) => void;
  onLoadMore?: () => void;
  onRefresh?: () => void;
  className?: string;
}

function ThreadListItem({
  thread,
  selected,
  slaStatus,
  onClick,
}: {
  thread: EmailThread;
  selected: boolean;
  slaStatus: ReturnType<ReturnType<typeof useEmailSLA>['getStatus']>;
  onClick: () => void;
}) {
  const isUnread = thread.unread_count > 0;
  const isStarred = thread.label_ids.includes('STARRED');
  const lastActivity = thread.last_message_at ? new Date(thread.last_message_at) : null;

  return (
    <button type="button"
      className={cn(
        'group relative w-full border-b border-border/10 px-4 py-4 text-left transition-all duration-200 hover:bg-muted/40',
        selected && 'border-l-[3px] border-l-primary bg-primary/10 shadow-sm',
        !selected && 'border-l-[3px] border-l-transparent'
      )}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {/* Unread indicator */}
        <div className="mt-1.5 flex shrink-0 flex-col items-center gap-1">
          <div className={cn('h-2 w-2 rounded-full', isUnread ? 'bg-primary' : 'bg-transparent')} />
          <SLADot status={slaStatus} />
        </div>

        <div className="min-w-0 flex-1 py-0.5">
          {/* From + date */}
          <div className="mb-1 flex items-center justify-between gap-2">
            <span
              className={cn(
                'truncate text-[13px] tracking-tight transition-colors',
                isUnread
                  ? 'font-bold text-foreground'
                  : 'font-medium text-muted-foreground group-hover:text-foreground/80'
              )}
            >
              {thread.participant_emails?.[0] ?? '—'}
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              {isStarred && <Star className="h-3 w-3 fill-amber-400 text-warning-foreground" />}
              {lastActivity && (
                <span className="text-[10px] font-bold uppercase tabular-nums tracking-tighter text-muted-foreground/60">
                  {formatDistanceToNow(lastActivity, { locale: ptBR, addSuffix: false })}
                </span>
              )}
            </div>
          </div>

          {/* Subject */}
          <p
            className={cn(
              'mb-1 truncate text-xs transition-colors',
              isUnread
                ? 'font-bold text-foreground'
                : 'text-muted-foreground/80 group-hover:text-foreground/70'
            )}
          >
            {thread.subject || '(sem assunto)'}
          </p>

          {/* Snippet + badges */}
          <div className="flex items-center gap-2">
            <p className="flex-1 truncate text-[11px] leading-relaxed text-muted-foreground/60">
              {thread.snippet}
            </p>
            <div className="flex shrink-0 items-center gap-1">
              {thread.message_count > 1 && (
                <Badge
                  variant="secondary"
                  className="h-4 border-none bg-muted/50 px-1.5 text-[9px] font-black text-muted-foreground/70"
                >
                  {thread.message_count}
                </Badge>
              )}
              {thread.unread_count > 0 && (
                <Badge className="h-4 border-none bg-primary px-1.5 text-[9px] font-black text-primary-foreground">
                  {thread.unread_count}
                </Badge>
              )}
            </div>
          </div>

          {/* Labels */}
          {thread.label_ids.filter((l) => !['INBOX', 'UNREAD', 'STARRED', 'SENT'].includes(l))
            .length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {thread.label_ids
                .filter((l) => !['INBOX', 'UNREAD', 'STARRED', 'SENT'].includes(l))
                .slice(0, 2)
                .map((l) => (
                  <Badge
                    key={l}
                    variant="outline"
                    className="h-4.5 border-0 bg-primary/10 px-2 text-[9px] font-black uppercase tracking-widest text-primary shadow-sm"
                  >
                    {l}
                  </Badge>
                ))}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

export function EmailThreadList({
  threads,
  selectedThreadId,
  accountId,
  isLoading = false,
  hasMore = false,
  onSelectThread,
  onLoadMore,
  onRefresh,
  className,
}: EmailThreadListProps) {
  const [filter, setFilter] = useState<FilterValue>('all');
  const { getStatus } = useEmailSLA(accountId);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (!onLoadMore || !hasMore) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) onLoadMore();
      },
      { threshold: 0.5 }
    );

    if (loadMoreRef.current) observerRef.current.observe(loadMoreRef.current);
    return () => observerRef.current?.disconnect();
  }, [onLoadMore, hasMore]);

  const filtered = threads.filter((t) => {
    if (filter === 'unread') return t.unread_count > 0;
    if (filter === 'starred') return t.label_ids.includes('STARRED');
    if (filter === 'sent') return t.label_ids.includes('SENT');
    return true;
  });

  const unreadTotal = threads.filter((t) => t.unread_count > 0).length;
  const breachedCount = threads.filter((t) => getStatus(t.thread_id ?? t.email_thread_id) === 'breached').length;

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Header */}
      <div className="shadow-sm/50 sticky top-0 z-20 flex items-center justify-between gap-2 border-b bg-background/80 px-4 py-3 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-2">
          <Inbox className="h-4 w-4 shrink-0 text-primary" />
          <span className="font-display text-sm font-bold tracking-tight">Inbox</span>
          {unreadTotal > 0 && <Badge className="h-4 px-1.5 text-[10px]">{unreadTotal}</Badge>}
          {breachedCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="destructive" className="h-4 gap-1 px-1.5 text-[10px]">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {breachedCount}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>SLA violado em {breachedCount} thread(s)</TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Select
            value={filter}
            onValueChange={(v) =>
              setFilter(
                v as FilterValue /* ignore-audit: Select/Tabs value string narrowed to union; developer controls option values */
              )
            }
          >
            <SelectTrigger className="h-7 w-28 border-0 bg-muted/50 text-xs">
              <Filter className="mr-1.5 h-3.5 w-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="unread">Não lidos</SelectItem>
              <SelectItem value="starred">Com estrela</SelectItem>
              <SelectItem value="sent">Enviados</SelectItem>
            </SelectContent>
          </Select>

          {onRefresh && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Atualizar lista"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onRefresh}
                  disabled={isLoading}
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Atualizar</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && threads.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3 text-muted-foreground">
            <Mail className="h-10 w-10 opacity-30" />
            <div className="text-center">
              <p className="text-sm font-medium">Nenhum email</p>
              <p className="mt-1 text-xs">
                {filter !== 'all' ? 'Tente mudar o filtro' : 'A caixa de entrada está vazia'}
              </p>
            </div>
          </div>
        ) : (
          <>
            {filtered.map((thread) => (
              <ThreadListItem
                key={thread.id}
                thread={thread}
                selected={selectedThreadId === thread.id}
                slaStatus={getStatus(thread.email_thread_id)}
                onClick={() => onSelectThread(thread)}
              />
            ))}

            {/* Load more sentinel */}
            {hasMore && (
              <div ref={loadMoreRef} className="flex items-center justify-center py-4">
                {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
