import {
  Filter,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Target,
  Users,
  User,
  MinusCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { ALL_STATUSES, type PeriodFilter, type SLAScope, type SLAStatus } from './types';

interface SLATimelineFiltersProps {
  statusFilter: SLAStatus[];
  setStatusFilter: (v: SLAStatus[]) => void;
  periodFilter: PeriodFilter;
  setPeriodFilter: (v: PeriodFilter) => void;
  scope: SLAScope;
  setScope: (v: SLAScope) => void;
  filteredCount: number;
  totalCount: number;
}

export function SLATimelineFilters({
  statusFilter,
  setStatusFilter,
  periodFilter,
  setPeriodFilter,
  scope,
  setScope,
  filteredCount,
  totalCount,
}: SLATimelineFiltersProps) {
  const onlyAtRisk =
    statusFilter.length === 2 &&
    statusFilter.includes('warning') &&
    statusFilter.includes('breached');

  return (
    <div className="space-y-2 rounded-lg bg-muted/30 p-2">
      <div className="flex items-center gap-2">
        <Filter className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Filtros
        </span>
        <Button
          type="button"
          variant={onlyAtRisk ? 'default' : 'outline'}
          size="sm"
          onClick={() => setStatusFilter(onlyAtRisk ? ALL_STATUSES : ['warning', 'breached'])}
          aria-pressed={onlyAtRisk}
          className={cn(
            'h-5 gap-1 px-2 text-[10px]',
            onlyAtRisk
              ? 'border border-destructive/30 bg-destructive/15 text-destructive hover:bg-destructive/20'
              : 'border-border/60'
          )}
          title="Mostrar apenas marcos em risco ou violados para o escopo selecionado"
        >
          <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
          Só em risco/violado
        </Button>
        <Badge variant="outline" className="ml-auto h-4 px-1.5 text-[9px]">
          {filteredCount} de {totalCount}
        </Badge>
      </div>
      <ToggleGroup
        type="multiple"
        size="sm"
        variant="outline"
        value={statusFilter}
        onValueChange={(v) => setStatusFilter(v.length ? (v as SLAStatus[]) : ALL_STATUSES)}
        aria-label="Filtrar marcos por status"
        className="flex-wrap justify-start gap-1"
      >
        <ToggleGroupItem
          value="ok"
          className="h-6 px-2 text-[10px] data-[state=on]:bg-success/15 data-[state=on]:text-success"
        >
          <CheckCircle2 className="mr-1 h-3 w-3" />
          OK
        </ToggleGroupItem>
        <ToggleGroupItem
          value="warning"
          className="h-6 px-2 text-[10px] data-[state=on]:bg-warning/15 data-[state=on]:text-warning"
        >
          <AlertTriangle className="mr-1 h-3 w-3" />
          Em risco
        </ToggleGroupItem>
        <ToggleGroupItem
          value="breached"
          className="h-6 px-2 text-[10px] data-[state=on]:bg-destructive/15 data-[state=on]:text-destructive"
        >
          <XCircle className="mr-1 h-3 w-3" />
          Violado
        </ToggleGroupItem>
        <ToggleGroupItem value="na" className="h-6 px-2 text-[10px]">
          Outros
        </ToggleGroupItem>
      </ToggleGroup>
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        value={periodFilter}
        onValueChange={(v) => v && setPeriodFilter(v as PeriodFilter)}
        aria-label="Filtrar por período"
        className="flex-wrap justify-start gap-1"
      >
        <ToggleGroupItem value="24h" className="h-6 px-2 text-[10px]">
          24h
        </ToggleGroupItem>
        <ToggleGroupItem value="7d" className="h-6 px-2 text-[10px]">
          7d
        </ToggleGroupItem>
        <ToggleGroupItem value="30d" className="h-6 px-2 text-[10px]">
          30d
        </ToggleGroupItem>
        <ToggleGroupItem value="all" className="h-6 px-2 text-[10px]">
          Tudo
        </ToggleGroupItem>
      </ToggleGroup>
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        value={scope}
        onValueChange={(v) => v && setScope(v as SLAScope)}
        aria-label="Escopo da regra de SLA"
        className="flex-wrap justify-start gap-1"
      >
        <ToggleGroupItem
          value="current"
          className="h-6 px-2 text-[10px] data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
        >
          <Target className="mr-1 h-3 w-3" />
          Atual
        </ToggleGroupItem>
        <ToggleGroupItem
          value="queue"
          className="h-6 px-2 text-[10px] data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
        >
          <Users className="mr-1 h-3 w-3" />
          Fila
        </ToggleGroupItem>
        <ToggleGroupItem
          value="agent"
          className="h-6 px-2 text-[10px] data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
        >
          <User className="mr-1 h-3 w-3" />
          Agente
        </ToggleGroupItem>
        <ToggleGroupItem
          value="none"
          className="h-6 px-2 text-[10px] data-[state=on]:bg-muted data-[state=on]:text-muted-foreground"
        >
          <MinusCircle className="mr-1 h-3 w-3" />
          Sem SLA
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
