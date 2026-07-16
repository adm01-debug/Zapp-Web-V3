import { useState, useCallback } from 'react';
import { Filter, X, Calendar, User, Tag, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/features/auth';
import { usePermissions } from '@/features/auth';
import { cn } from '@/lib/utils';
import { useDensity } from '@/hooks/useDensity';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAgents } from '@/features/admin';
import { useTags } from '@/hooks/useTags';

export interface InboxFiltersState {
  status: string[];
  tags: string[];
  agentId: string | null;
  dateRange: {
    from: Date | null;
    to: Date | null;
  };
}

interface InboxFiltersProps {
  filters: InboxFiltersState;
  onFiltersChange: (filters: InboxFiltersState) => void;
}

const STATUS_OPTIONS = [
  { value: 'unread', label: 'Não lidas', icon: '🔵' },
  { value: 'read', label: 'Lidas', icon: '✓' },
  { value: 'pending', label: 'Pendentes', icon: '⏳' },
  { value: 'resolved', label: 'Resolvidas', icon: '✅' },
];

const DATE_PRESETS = [
  { label: 'Hoje', getValue: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
  {
    label: '7 dias',
    getValue: () => ({ from: startOfDay(subDays(new Date(), 7)), to: endOfDay(new Date()) }),
  },
  {
    label: '30 dias',
    getValue: () => ({ from: startOfDay(subDays(new Date(), 30)), to: endOfDay(new Date()) }),
  },
  {
    label: 'Mês',
    getValue: () => ({
      from: startOfDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
      to: endOfDay(new Date()),
    }),
  },
];

export function InboxFilters({ filters, onFiltersChange }: InboxFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { profile } = useAuth();
  const { hasPermission } = usePermissions();
  const { agents } = useAgents();
  const { tags } = useTags();
  const { density } = useDensity();
  const isCompact = density === 'compact' || density === 'dense';

  const activeFiltersCount =
    filters.status.length +
    filters.tags.length +
    (filters.agentId ? 1 : 0) +
    (filters.dateRange.from ? 1 : 0);

  const toggleStatus = useCallback(
    (status: string) => {
      const newStatus = filters.status.includes(status)
        ? filters.status.filter((s) => s !== status)
        : [...filters.status, status];
      onFiltersChange({ ...filters, status: newStatus });
    },
    [filters, onFiltersChange]
  );

  const toggleTag = useCallback(
    (tagId: string) => {
      const newTags = filters.tags.includes(tagId)
        ? filters.tags.filter((t) => t !== tagId)
        : [...filters.tags, tagId];
      onFiltersChange({ ...filters, tags: newTags });
    },
    [filters, onFiltersChange]
  );

  const setAgent = useCallback(
    (agentId: string | null) => {
      onFiltersChange({ ...filters, agentId: agentId === 'all' ? null : agentId });
    },
    [filters, onFiltersChange]
  );

  const setDateRange = useCallback(
    (range: { from: Date | null; to: Date | null }) => {
      onFiltersChange({ ...filters, dateRange: range });
    },
    [filters, onFiltersChange]
  );

  const clearFilters = useCallback(() => {
    onFiltersChange({
      status: [],
      tags: [],
      agentId: null,
      dateRange: { from: null, to: null },
    });
  }, [onFiltersChange]);

  const removeFilter = useCallback(
    (type: 'status' | 'tag' | 'agent' | 'date', value?: string) => {
      switch (type) {
        case 'status':
          onFiltersChange({ ...filters, status: filters.status.filter((s) => s !== value) });
          break;
        case 'tag':
          onFiltersChange({ ...filters, tags: filters.tags.filter((t) => t !== value) });
          break;
        case 'agent':
          onFiltersChange({ ...filters, agentId: null });
          break;
        case 'date':
          onFiltersChange({ ...filters, dateRange: { from: null, to: null } });
          break;
      }
    },
    [filters, onFiltersChange]
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'gap-1 rounded-md transition-all duration-300',
              isCompact ? 'h-5 px-1.5 text-[10px]' : 'h-6 px-2 text-[11px]',
              activeFiltersCount > 0
                ? 'bg-primary/10 text-primary hover:bg-primary/15'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Filter className="h-3 w-3" />
            Filtros
            {activeFiltersCount > 0 && (
              <span className="ml-0.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                {activeFiltersCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-72 p-0"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
            <span className="text-xs font-semibold text-foreground">Filtros</span>
            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-[10px] text-muted-foreground transition-colors hover:text-destructive"
              >
                Limpar tudo
              </button>
            )}
          </div>

          <div className="max-h-[360px] space-y-4 overflow-y-auto p-3 pb-4">
            {/* Status */}
            <section className="space-y-2">
              <div className="flex items-center gap-1.5">
                <MessageCircle className="h-3 w-3 text-muted-foreground" />
                <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Status
                </Label>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {STATUS_OPTIONS.map((status) => (
                  <button
                    type="button"
                    key={status.value}
                    onClick={() => toggleStatus(status.value)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] transition-all',
                      filters.status.includes(status.value)
                        ? 'border-primary/40 bg-primary/10 font-medium text-primary'
                        : 'border-transparent bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <span className="text-[10px]">{status.icon}</span>
                    {status.label}
                  </button>
                ))}
              </div>
            </section>

            <Separator className="opacity-50" />

            {/* Tags */}
            <section className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Tag className="h-3 w-3 text-muted-foreground" />
                <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Etiquetas
                </Label>
              </div>
              {tags.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {tags.map((tag) => (
                    <button
                      type="button"
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-all',
                        filters.tags.includes(tag.id)
                          ? 'ring-1.5 shadow-sm ring-primary'
                          : 'hover:opacity-80'
                      )}
                      style={{
                        backgroundColor: `${tag.color}18`,
                        color: tag.color,
                      }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] italic text-muted-foreground/60">Nenhuma etiqueta</p>
              )}
            </section>

            <Separator className="opacity-50" />

            {/* Agent */}
            <section className="space-y-2">
              <div className="flex items-center gap-1.5">
                <User className="h-3 w-3 text-muted-foreground" />
                <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Atendente
                </Label>
              </div>
              <Select value={filters.agentId || 'all'} onValueChange={setAgent}>
                <SelectTrigger className="h-7 rounded-md border-0 bg-muted/40 text-[11px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os atendentes</SelectItem>
                  {agents
                    .filter((agent) => {
                      // Se o usuário tiver permissão apenas para ver o departamento, filtramos os agentes
                      const canSeeAll = hasPermission('inbox.view_all');
                      if (canSeeAll) return true;

                      const canSeeDept = hasPermission('inbox.view_department');
                      if (canSeeDept) {
                        // Idealmente usaríamos departmentAgentIds aqui, mas InboxFilters não o recebe.
                        // Como fallback, usamos o department do próprio perfil do usuário comparado ao do agente.
                        return agent.department === profile?.department;
                      }
                      return agent.id === profile?.id;
                    })
                    .map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        <span className="flex items-center gap-1.5">
                          <span
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
                        </span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </section>

            <Separator className="opacity-50" />

            {/* Date */}
            <section className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Período
                </Label>
              </div>
              <div className="flex flex-wrap gap-1">
                {DATE_PRESETS.map((preset) => (
                  <button
                    type="button"
                    key={preset.label}
                    onClick={() => setDateRange(preset.getValue())}
                    className="rounded-md bg-muted/50 px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              {filters.dateRange.from && (
                <div className="rounded bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground">
                  {format(filters.dateRange.from, 'dd/MM/yyyy', { locale: ptBR })}
                  {filters.dateRange.to &&
                    ` → ${format(filters.dateRange.to, 'dd/MM/yyyy', { locale: ptBR })}`}
                </div>
              )}
            </section>
          </div>
        </PopoverContent>
      </Popover>

      {/* Active filter chips — inline, compact */}
      {filters.status.map((status) => {
        const opt = STATUS_OPTIONS.find((s) => s.value === status);
        return (
          <Badge
            key={status}
            variant="secondary"
            className={cn(
              'cursor-pointer gap-0.5 transition-all duration-300 hover:bg-destructive/15 hover:text-destructive',
              isCompact ? 'h-4.5 px-1 text-[9px]' : 'h-5 px-1.5 text-[10px]'
            )}
            onClick={() => removeFilter('status', status)}
          >
            {opt?.label}
            <X className="ml-0.5 h-2.5 w-2.5" />
          </Badge>
        );
      })}

      {filters.tags.map((tagId) => {
        const tag = tags.find((t) => t.id === tagId);
        return tag ? (
          <Badge
            key={tagId}
            variant="secondary"
            className={cn(
              'cursor-pointer gap-0.5 transition-all duration-300 hover:bg-destructive/15',
              isCompact ? 'h-4.5 px-1 text-[9px]' : 'h-5 px-1.5 text-[10px]'
            )}
            style={{ backgroundColor: `${tag.color}15`, color: tag.color }}
            onClick={() => removeFilter('tag', tagId)}
          >
            {tag.name}
            <X className="ml-0.5 h-2.5 w-2.5" />
          </Badge>
        ) : null;
      })}

      {filters.agentId && (
        <Badge
          variant="secondary"
          className={cn(
            'cursor-pointer gap-0.5 transition-all duration-300 hover:bg-destructive/15 hover:text-destructive',
            isCompact ? 'h-4.5 px-1 text-[9px]' : 'h-5 px-1.5 text-[10px]'
          )}
          onClick={() => removeFilter('agent')}
        >
          {agents.find((a) => a.id === filters.agentId)?.name || 'Atendente'}
          <X className="ml-0.5 h-2.5 w-2.5" />
        </Badge>
      )}

      {filters.dateRange.from && (
        <Badge
          variant="secondary"
          className={cn(
            'cursor-pointer gap-0.5 transition-all duration-300 hover:bg-destructive/15 hover:text-destructive',
            isCompact ? 'h-4.5 px-1 text-[9px]' : 'h-5 px-1.5 text-[10px]'
          )}
          onClick={() => removeFilter('date')}
        >
          {format(filters.dateRange.from, 'dd/MM', { locale: ptBR })}
          {filters.dateRange.to && `–${format(filters.dateRange.to, 'dd/MM', { locale: ptBR })}`}
          <X className="ml-0.5 h-2.5 w-2.5" />
        </Badge>
      )}
    </div>
  );
}
