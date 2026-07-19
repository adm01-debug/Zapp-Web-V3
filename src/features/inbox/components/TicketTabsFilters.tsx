import { useMemo } from 'react';
import { getLogger } from '@/lib/logger';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Users, Headphones, User } from 'lucide-react';
import { useAuth, useUserRole, usePermissions } from '@/features/auth';
import { useAgents } from '@/features/admin';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { MainTab, SubTab, InboxScope } from './TicketTabs';

const log = getLogger('TicketTabsFilters');

interface TicketTabsFiltersProps {
  mainTab: MainTab;
  subTab: SubTab;
  contactType: string | null;
  onContactTypeChange?: (value: string | null) => void;
  scope: InboxScope;
  onScopeChange?: (scope: InboxScope) => void;
  showAll: boolean;
  onShowAllChange: (value: boolean) => void;
  selectedAgentId: string | null;
  onAgentChange?: (agentId: string | null) => void;
  departmentAgentIds: string[];
}

/** Ticket Tabs Filters component. */
export function TicketTabsFilters({
  mainTab,
  subTab,
  contactType,
  onContactTypeChange,
  scope,
  onScopeChange,
  showAll,
  onShowAllChange,
  selectedAgentId,
  onAgentChange,
  departmentAgentIds,
}: TicketTabsFiltersProps) {
  const { user } = useAuth();
  const { isSupervisor, roles } = useUserRole();
  const { hasPermission } = usePermissions();
  const { agents } = useAgents();
  const isMobile = useIsMobile();

  const canSeeDepartment = hasPermission('inbox.view_department');
  const canSeeAllDepartments = hasPermission('inbox.view_all');
  const canShowAll = canSeeAllDepartments || isSupervisor;

  const departmentAgentIdSet = useMemo(
    () => new Set(departmentAgentIds),
    [departmentAgentIds]
  );
  const departmentAgents = useMemo(
    () =>
      scope === 'department'
        ? agents.filter((a) => departmentAgentIdSet.has(a.id))
        : agents,
    [agents, scope, departmentAgentIdSet]
  );

  return (
    <>
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
                  {departmentAgents.map((agent) => (
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
    </>
  );
}