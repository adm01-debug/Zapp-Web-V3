import { memo, useMemo } from 'react';
import { getLogger } from '@/lib/logger';
import { motion } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { useDensity } from '@/hooks/useDensity';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MessageSquare,
  CheckCircle2,
  Users,
  Headphones,
  Clock,
  MessageCircle,
  User,
} from 'lucide-react';
import { useAuth, useUserRole, usePermissions } from '@/features/auth';
import { useQueues } from '@/hooks/useQueues';
import { useAgents } from '@/features/admin';
import { useAllTicketStates, ConversationWithMessages } from '@/features/inbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const log = getLogger('TicketTabs');

export type MainTab = 'open' | 'resolved' | 'search' | 'unread';
export type SubTab = 'attending' | 'waiting';

export type InboxScope = 'mine' | 'department' | 'all';

interface TicketTabsProps {
  conversations: ConversationWithMessages[];
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

export const TicketTabs = memo(function TicketTabs({
  conversations,
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
  const { isSupervisor, roles } = useUserRole();
  const { hasPermission } = usePermissions();
  const { queues } = useQueues();
  const { agents } = useAgents();
  const { density } = useDensity();
  const isCompact = density === 'compact' || density === 'dense';
  const ticketStates = useAllTicketStates();
  const isMobile = useIsMobile();

  const canSeeDepartment = hasPermission('inbox.view_department');
  const canSeeAllDepartments = hasPermission('inbox.view_all');
  const canShowAll = canSeeAllDepartments || isSupervisor;

  const counts = useMemo(() => {
    const userId = user?.id;
    let openCount = 0;
    let attending = 0;
    let waiting = 0;
    let resolved = 0;
    for (const c of conversations) {
      const t = ticketStates[c.contact.id];
      const status = t?.status ?? 'open';
      const assigned = t?.assignedTo ?? c.contact.assigned_to ?? null;
      if (status === 'resolved') {
        resolved += 1;
      } else {
        openCount += 1;
        if (assigned && assigned === userId) attending += 1;
        if (!assigned) waiting += 1;
      }
    }
    return { open: openCount, attending, waiting, resolved };
  }, [conversations, ticketStates, user?.id]);

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
        count: conversations.filter((c) => c.unreadCount > 0).length,
        activeColor: 'bg-warning text-foreground',
      },
    ],
    [counts, conversations]
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
            <button
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
              <button
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

      {mainTab === 'open' && subTab === 'attending' && onContactTypeChange && (
        <div className="flex items-center gap-1.5 rounded-lg border border-border/10 bg-muted/20 px-2 py-1.5">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Users className="h-3 w-3 text-primary" />
          </div>
          <div
            className="flex flex-1 items-center gap-1"
            role="tablist"
            aria-label="Categoria de contato"
          >
            {(
              [
                { id: 'cliente', label: 'Clientes' },
                { id: 'colaborador', label: isMobile ? 'Colab.' : 'Colaboradores' },
                { id: 'fornecedor', label: isMobile ? 'Fornec.' : 'Fornecedores' },
                { id: 'transportadora', label: isMobile ? 'Transp.' : 'Transportadoras' },
                { id: 'outros', label: 'Outros' },
              ] as const
            ).map((opt) => {
              const isActive = (contactType || '') === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onContactTypeChange?.(isActive ? null : opt.id)}
                  className={cn(
                    'flex-1 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-tight transition-all',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {mainTab === 'open' &&
        subTab === 'attending' &&
        (canSeeDepartment || canSeeAllDepartments) && (
          <div className="flex items-center gap-1.5 rounded-lg border border-border/10 bg-muted/20 px-2 py-1.5">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Headphones className="h-3 w-3 text-primary" />
            </div>
            <div
              className="flex flex-1 items-center gap-1"
              role="tablist"
              aria-label="Escopo de visualização"
            >
              {(
                [
                  { id: 'mine' as InboxScope, label: 'Meus', show: true },
                  {
                    id: 'department' as InboxScope,
                    label: isMobile ? 'Depto' : 'Departamento',
                    show: canSeeDepartment || canSeeAllDepartments,
                  },
                  {
                    id: 'all' as InboxScope,
                    label: isMobile ? 'Todos' : 'Todos depts.',
                    show: canSeeAllDepartments,
                  },
                ] as const
              )
                .filter((o) => o.show)
                .map((opt) => {
                  const isActive = (showAll && opt.id === 'all') || (!showAll && scope === opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => {
                        const req =
                          opt.id === 'all'
                            ? 'inbox.view_all'
                            : opt.id === 'department'
                              ? 'inbox.view_department'
                              : 'inbox.view_mine';
                        if (!hasPermission(req) && opt.id !== 'mine') {
                          log.warn('Unauthorized inbox scope access attempt', {
                            scope: opt.id,
                            userId: user?.id,
                          });
                          void supabase.from('audit_logs').insert({
                            user_id: user?.id,
                            action: 'UNAUTHORIZED_INBOX_SCOPE_ACCESS',
                            entity_type: 'inbox_scope',
                            details: {
                              attempted_scope: opt.id,
                              user_roles: roles,
                              timestamp: new Date().toISOString(),
                            },
                          });
                          toast.error('Você não tem permissão para visualizar este escopo.');
                          return;
                        }
                        onScopeChange?.(opt.id);
                        onShowAllChange(opt.id === 'all');
                      }}
                      className={cn(
                        'flex-1 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-tight transition-all',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
            </div>
          </div>
        )}

      {mainTab === 'open' &&
        subTab === 'attending' &&
        (scope === 'department' || scope === 'all') &&
        (canSeeDepartment || canSeeAllDepartments) && (
          <div className="flex items-center gap-1.5 rounded-lg border border-border/10 bg-muted/20 px-2 py-1.5">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <User className="h-3 w-3 text-primary" />
            </div>
            <div className="flex-1">
              <Select
                value={selectedAgentId || 'all'}
                onValueChange={(v) => onAgentChange?.(v === 'all' ? null : v)}
              >
                <SelectTrigger className="h-7 w-full gap-2 rounded-md border-none bg-transparent px-2 text-[10px] font-bold transition-all hover:bg-muted/40">
                  <SelectValue placeholder="Filtrar por Colaborador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">
                    Todos os Colaboradores
                  </SelectItem>
                  {(scope === 'department'
                    ? agents.filter((a) => departmentAgentIds.includes(a.id))
                    : agents
                  ).map((agent) => (
                    <SelectItem key={agent.id} value={agent.id} className="text-xs">
                      <div className="flex items-center gap-1.5">
                        <div
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            agent.status === 'online'
                              ? 'bg-success'
                              : agent.status === 'away'
                                ? 'bg-warning'
                                : 'bg-muted-foreground/40'
                          )}
                        />
                        {agent.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

      {canShowAll && !canSeeDepartment && !canSeeAllDepartments && mainTab === 'open' && (
        <div className="flex items-center gap-2 rounded-lg border border-border/10 bg-muted/20 px-2 py-1.5">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-3 w-3 text-primary" />
            </div>
            <Label
              htmlFor="show-all"
              className="cursor-pointer text-[11px] font-semibold uppercase tracking-tight text-muted-foreground"
            >
              Todos Atendentes
            </Label>
          </div>
          <Switch
            id="show-all"
            checked={showAll}
            onCheckedChange={onShowAllChange}
            className="h-4 w-7 data-[state=checked]:bg-primary"
          />
        </div>
      )}
    </div>
  );
});
