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
import { MessageSquare, CheckCircle2, Users, Headphones, Clock, MessageCircle, User } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { useUserRole, usePermissions } from '@/features/auth';
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

  // Controle de visibilidade baseado em permissões específicas
  const canSeeDepartment = hasPermission('inbox.view_department');
  const canSeeAllDepartments = hasPermission('inbox.view_all');
  
  // Operação ampla — legacy/fallback se permissões não estiverem populadas ainda
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

  const mainTabs = useMemo(() => [
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
      count: conversations.filter(c => c.unreadCount > 0).length,
      activeColor: 'bg-warning text-foreground',
    },
  ], [counts, conversations]);


  const subTabs = useMemo(() => [
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
  ], [counts]);

  return (
    <div className={cn("transition-all duration-300", isCompact ? "space-y-1" : "space-y-2")}>
      {/* Main Tabs */}
      <div className={cn(
        "flex items-center gap-1 bg-muted/30 dark:bg-muted/10 rounded-2xl border border-border/20 shadow-sm  transition-all",
        isCompact ? "p-0.5" : "p-1"
      )}>
        {mainTabs.map(tab => {
          const Icon = tab.icon;
          const isActive = mainTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onMainTabChange(tab.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 rounded-xl font-bold transition-all duration-500 ease-out relative overflow-hidden',
                isCompact ? 'px-2 py-1.5 text-[11px] font-semibold' : 'px-3 py-2.5 text-[12px]',
                isActive
                  ? tab.activeColor + ' shadow-lg scale-[1.02] ring-1 ring-white/10'
                  : 'text-muted-foreground/70 hover:text-foreground hover:bg-muted/60'
              )}
            >
              <Icon className={cn("transition-transform duration-500", isCompact ? "w-3 h-3" : "w-4 h-4", isActive && "scale-110")} />
              <span className="tracking-tight">{tab.label}</span>
              {tab.count !== null && (
                <Badge 
                  variant="outline"
                  className={cn(
                    'h-4 min-w-[16px] px-1 text-[10px] font-medium leading-none border-0 transition-all duration-500 shadow-sm',
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
                  className="absolute inset-0 bg-background/5 pointer-events-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.6 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Sub-tabs for "Abertos" — separated visually */}
      {mainTab === 'open' && (
        <div className={cn(
          "flex items-center gap-1 px-0.5 flex-wrap border-t border-border/10 animate-in fade-in slide-in-from-top-1 duration-500 transition-all",
          isCompact ? "pt-1.5 mt-0.5" : "pt-3 mt-1"
        )}>
          {subTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = subTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSubTabChange(tab.id)}
                className={cn(
                  'flex items-center gap-2 font-bold transition-all duration-300 border shadow-sm  relative overflow-hidden',
                  isCompact ? 'px-2.5 py-1 text-[10px] rounded-lg' : 'px-4 py-2 text-[11px] rounded-full',
                  isActive
                    ? 'bg-primary/5 text-primary border-primary/20 shadow-primary/5'
                    : 'bg-muted/20 text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 border-transparent'
                )}
              >
                <Icon className={cn("transition-transform", isCompact ? "w-3 h-3" : "w-3.5 h-3.5", isActive && "rotate-[10deg]")} />
                {tab.label}
                <span className={cn(
                  'text-[10px] font-black tabular-nums bg-muted/40 px-1.5 py-0.5 rounded-md ml-1',
                  isActive ? 'text-primary' : 'text-muted-foreground/40'
                )}>
                  {tab.count}
                </span>
              </button>
            );
          })}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Queue filter */}
          {queues.length > 0 && (
            <Select 
              value={selectedQueueId || 'all'} 
              onValueChange={(v) => onQueueChange(v === 'all' ? null : v)}
            >
              <SelectTrigger className={cn("h-7 w-auto text-[10px] font-bold border-border/20 bg-accent/10 px-3 gap-2 rounded-full hover:bg-accent/20 transition-all", isMobile ? "min-w-[70px] max-w-[100px]" : "min-w-[90px] max-w-[140px]")}>
                <SelectValue placeholder="Fila" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">{isMobile ? 'Todas' : 'Todas filas'}</SelectItem>
                {queues.map(q => (
                  <SelectItem key={q.id} value={q.id} className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <div 
                        className="w-2 h-2 rounded-full" 
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

      {/* Seletor de Categoria de Contato — visível para todos os usuários */}
      {mainTab === 'open' && subTab === 'attending' && onContactTypeChange && (
        <div className="flex items-center gap-1.5 bg-muted/20 px-2 py-1.5 rounded-lg border border-border/10">
          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Users className="w-3 h-3 text-primary" />
          </div>
          <div className="flex items-center gap-1 flex-1" role="tablist" aria-label="Categoria de contato">
            {([
              { id: 'cliente', label: 'Clientes' },
              { id: 'colaborador', label: isMobile ? 'Colab.' : 'Colaboradores' },
              { id: 'fornecedor', label: isMobile ? 'Fornec.' : 'Fornecedores' },
              { id: 'transportadora', label: isMobile ? 'Transp.' : 'Transportadoras' },
              { id: 'outros', label: 'Outros' },
            ] as const).map(opt => {
              const isActive = (contactType || '') === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onContactTypeChange?.(isActive ? null : opt.id)}
                  className={cn(
                    'flex-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-tight transition-all',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Seletor de Escopo (Meus/Depto/Todos) — visível para Coordenadores/Supervisores */}
      {mainTab === 'open' && subTab === 'attending' && (canSeeDepartment || canSeeAllDepartments) && (
        <div className="flex items-center gap-1.5 bg-muted/20 px-2 py-1.5 rounded-lg border border-border/10">
          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Headphones className="w-3 h-3 text-primary" />
          </div>
          <div className="flex items-center gap-1 flex-1" role="tablist" aria-label="Escopo de visualização">
            {([
              { id: 'mine' as InboxScope, label: 'Meus', show: true },
              { id: 'department' as InboxScope, label: isMobile ? 'Depto' : 'Departamento', show: canSeeDepartment || canSeeAllDepartments },
              { id: 'all' as InboxScope, label: isMobile ? 'Todos' : 'Todos depts.', show: canSeeAllDepartments },
            ] as const).filter(o => o.show).map(opt => {
              const isActive = (showAll && opt.id === 'all') || (!showAll && scope === opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={async () => {
                    const requiredPermission =
                      opt.id === 'all' ? 'inbox.view_all' :
                      opt.id === 'department' ? 'inbox.view_department' :
                      'inbox.view_mine';

                    if (!hasPermission(requiredPermission) && opt.id !== 'mine') {
                      log.warn('Unauthorized inbox scope access attempt', { scope: opt.id, userId: user?.id });
                      try {
                        await supabase.from('audit_logs').insert({
                          user_id: user?.id,
                          action: 'UNAUTHORIZED_INBOX_SCOPE_ACCESS',
                          entity_type: 'inbox_scope',
                          details: {
                            attempted_scope: opt.id,
                            user_roles: roles,
                            timestamp: new Date().toISOString()
                          }
                        });
                      } catch { /* fire-and-forget audit log */ }
                      toast.error("Você não tem permissão para visualizar este escopo.");
                      return;
                    }

                    onScopeChange?.(opt.id);
                    onShowAllChange(opt.id === 'all');
                  }}
                  className={cn(
                    'flex-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-tight transition-all',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Seletor de Agente Específico — visível para Coordenadores/Supervisores quando em escopo Depto ou Todos */}
      {mainTab === 'open' && subTab === 'attending' && (scope === 'department' || scope === 'all') && (canSeeDepartment || canSeeAllDepartments) && (
        <div className="flex items-center gap-1.5 bg-muted/20 px-2 py-1.5 rounded-lg border border-border/10">
          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <User className="w-3 h-3 text-primary" />
          </div>
          <div className="flex-1">
            <Select 
              value={selectedAgentId || 'all'} 
              onValueChange={(v) => onAgentChange?.(v === 'all' ? null : v)}
            >
              <SelectTrigger className="h-7 w-full text-[10px] font-bold border-none bg-transparent hover:bg-muted/40 px-2 gap-2 rounded-md transition-all">
                <SelectValue placeholder="Filtrar por Colaborador" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">Todos os Colaboradores</SelectItem>
                {(scope === 'department' 
                  ? agents.filter(a => departmentAgentIds.includes(a.id))
                  : agents
                ).map(agent => (
                  <SelectItem key={agent.id} value={agent.id} className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className={cn(
                        'w-1.5 h-1.5 rounded-full',
                        agent.status === 'online' ? 'bg-success' :
                        agent.status === 'away' ? 'bg-warning' : 'bg-muted-foreground/40'
                      )} />
                      {agent.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Fallback legado: papéis sem departamento mas com permissão ampla */}
      {canShowAll && !canSeeDepartment && !canSeeAllDepartments && mainTab === 'open' && (
        <div className="flex items-center gap-2 bg-muted/20 px-2 py-1.5 rounded-lg border border-border/10">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="w-3 h-3 text-primary" />
            </div>
            <Label htmlFor="show-all" className="text-[11px] font-semibold text-muted-foreground cursor-pointer uppercase tracking-tight">
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
