import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { Calendar } from '@/components/ui/calendar';
import {
  Filter,
  Calendar as CalendarIcon,
  Users,
  Layers,
  X,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import {
  format,
  subDays,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useQueues } from '@/hooks/useQueues';
import { useAgents } from '@/features/admin';

export interface DashboardFiltersState {
  dateRange: {
    from: Date;
    to: Date;
  };
  period: 'today' | 'yesterday' | 'week' | 'month' | 'custom';
  queueId: string | null;
  agentId: string | null;
}

interface DashboardFiltersProps {
  filters: DashboardFiltersState;
  onFiltersChange: (filters: DashboardFiltersState) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Hoje' },
  { value: 'yesterday', label: 'Ontem' },
  { value: 'week', label: 'Esta Semana' },
  { value: 'month', label: 'Este Mês' },
  { value: 'custom', label: 'Personalizado' },
] as const;

export const getDefaultFilters = (): DashboardFiltersState => ({
  dateRange: {
    from: startOfDay(new Date()),
    to: endOfDay(new Date()),
  },
  period: 'today',
  queueId: null,
  agentId: null,
});

export function DashboardFilters({
  filters,
  onFiltersChange,
  onRefresh,
  isRefreshing,
}: DashboardFiltersProps) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const { queues } = useQueues();
  const { agents } = useAgents();

  const handlePeriodChange = (period: DashboardFiltersState['period']) => {
    const now = new Date();
    let from: Date;
    let to: Date;

    switch (period) {
      case 'today':
        from = startOfDay(now);
        to = endOfDay(now);
        break;
      case 'yesterday':
        from = startOfDay(subDays(now, 1));
        to = endOfDay(subDays(now, 1));
        break;
      case 'week':
        from = startOfWeek(now, { locale: ptBR });
        to = endOfWeek(now, { locale: ptBR });
        break;
      case 'month':
        from = startOfMonth(now);
        to = endOfMonth(now);
        break;
      case 'custom':
        return; // Don't change dates for custom
      default:
        from = startOfDay(now);
        to = endOfDay(now);
    }

    onFiltersChange({
      ...filters,
      period,
      dateRange: { from, to },
    });
  };

  const handleDateRangeChange = (range: { from?: Date; to?: Date }) => {
    if (range.from && range.to) {
      onFiltersChange({
        ...filters,
        period: 'custom',
        dateRange: {
          from: startOfDay(range.from),
          to: endOfDay(range.to),
        },
      });
      setIsCalendarOpen(false);
    } else if (range.from) {
      onFiltersChange({
        ...filters,
        period: 'custom',
        dateRange: {
          ...filters.dateRange,
          from: startOfDay(range.from),
        },
      });
    }
  };

  const handleQueueChange = (queueId: string) => {
    onFiltersChange({
      ...filters,
      queueId: queueId === 'all' ? null : queueId,
    });
  };

  const handleAgentChange = (agentId: string) => {
    onFiltersChange({
      ...filters,
      agentId: agentId === 'all' ? null : agentId,
    });
  };

  const clearFilters = () => {
    onFiltersChange(getDefaultFilters());
  };

  const activeFiltersCount = [
    filters.period !== 'today',
    filters.queueId !== null,
    filters.agentId !== null,
  ].filter(Boolean).length;

  const _selectedQueue = queues?.find((q) => q.id === filters.queueId);
  const _selectedAgent = agents?.find((a) => a.id === filters.agentId);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center gap-3 rounded-xl border border-border/50 bg-card/50 p-4 backdrop-blur-sm"
    >
      {/* Period Selector */}
      <div className="flex items-center gap-2">
        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
        <Select value={filters.period} onValueChange={handlePeriodChange}>
          <SelectTrigger className="h-9 w-[140px] bg-background/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Custom Date Range */}
      <AnimatePresence>
        {filters.period === 'custom' && (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            exit={{ opacity: 0, width: 0 }}
          >
            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-2 bg-background/50">
                  <span className="text-xs">
                    {format(filters.dateRange.from, 'dd/MM', { locale: ptBR })} -{' '}
                    {format(filters.dateRange.to, 'dd/MM', { locale: ptBR })}
                  </span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={{
                    from: filters.dateRange.from,
                    to: filters.dateRange.to,
                  }}
                  onSelect={(range) => handleDateRangeChange(range || {})}
                  numberOfMonths={2}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="h-6 w-px bg-border/50" />

      {/* Queue Filter */}
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <Select value={filters.queueId || 'all'} onValueChange={handleQueueChange}>
          <SelectTrigger className="h-9 w-[160px] bg-background/50">
            <SelectValue placeholder="Todas as filas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as filas</SelectItem>
            {queues?.map((queue) => (
              <SelectItem key={queue.id} value={queue.id}>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: queue.color }} />
                  {queue.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Agent Filter */}
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <Select value={filters.agentId || 'all'} onValueChange={handleAgentChange}>
          <SelectTrigger className="h-9 w-[160px] bg-background/50">
            <SelectValue placeholder="Todos os agentes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os agentes</SelectItem>
            {agents?.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1" />

      {/* Active Filters Badge */}
      <AnimatePresence>
        {activeFiltersCount > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
          >
            <Badge
              variant="secondary"
              className="cursor-pointer gap-1 hover:bg-secondary/80"
              onClick={clearFilters}
            >
              <Filter className="h-3 w-3" />
              {activeFiltersCount} filtro{activeFiltersCount > 1 ? 's' : ''}
              <X className="ml-1 h-3 w-3" />
            </Badge>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Refresh Button */}
      {onRefresh && (
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={onRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
        </Button>
      )}
    </motion.div>
  );
}
