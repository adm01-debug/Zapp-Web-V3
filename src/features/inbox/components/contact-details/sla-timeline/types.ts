import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type SLAStatus = 'ok' | 'warning' | 'breached' | 'na';
export type PeriodFilter = '24h' | '7d' | '30d' | 'all';
export type SLAScope = 'current' | 'queue' | 'agent' | 'none';

export const FILTER_STORAGE_KEY = 'sla-timeline-filters';
export const ALL_STATUSES: SLAStatus[] = ['ok', 'warning', 'breached', 'na'];

export const PERIOD_MS: Record<PeriodFilter, number> = {
  '24h': 86_400_000,
  '7d': 604_800_000,
  '30d': 2_592_000_000,
  all: Infinity,
};

export const STATUS_STYLES: Record<SLAStatus, { label: string; className: string }> = {
  ok: { label: 'Dentro do SLA', className: 'bg-success/15 text-success border-success/30' },
  warning: { label: 'Em risco', className: 'bg-warning/15 text-warning border-warning/30' },
  breached: { label: 'Violado', className: 'bg-destructive/15 text-destructive border-destructive/30' },
  na: { label: '—', className: 'bg-muted/40 text-muted-foreground border-border/40' },
};

export const SCOPE_LABELS: Record<SLAScope, string> = {
  current: 'Atual (fila + agente)',
  queue: 'Por fila',
  agent: 'Por agente',
  none: 'Sem SLA',
};

export function getSLAStatus(durationMs: number | null, limitMinutes: number): SLAStatus {
  if (durationMs === null) return 'na';
  const limitMs = limitMinutes * 60_000;
  if (durationMs > limitMs) return 'breached';
  if (durationMs > limitMs * 0.7) return 'warning';
  return 'ok';
}

export function isWithinPeriod(date: Date | null, period: PeriodFilter): boolean {
  if (period === 'all') return true;
  if (!date) return false;
  return Date.now() - date.getTime() <= PERIOD_MS[period];
}

export function formatDurationMs(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}min`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

export function formatTs(d: Date | null): string {
  return d ? format(d, 'dd/MM HH:mm', { locale: ptBR }) : '—';
}

export function loadFilters(): { status: SLAStatus[]; period: PeriodFilter; scope: SLAScope } {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const status = Array.isArray(parsed.status)
        ? parsed.status.filter((s: string): s is SLAStatus => ALL_STATUSES.includes(s as SLAStatus))
        : ALL_STATUSES;
      const period: PeriodFilter = ['24h', '7d', '30d', 'all'].includes(parsed.period) ? parsed.period : 'all';
      const scope: SLAScope = ['current', 'queue', 'agent', 'none'].includes(parsed.scope) ? parsed.scope : 'current';
      return { status: status.length ? status : ALL_STATUSES, period, scope };
    }
  } catch { /* storage unavailable */ }
  return { status: ALL_STATUSES, period: 'all', scope: 'current' };
}
