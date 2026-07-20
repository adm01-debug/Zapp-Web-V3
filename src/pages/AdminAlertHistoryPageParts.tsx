import { AlertCircle, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/** Alert Row. */
export interface AlertRow {
  id: string;
  alert_type: string;
  title: string;
  message: string;
  source: string | null;
  is_read: boolean | null;
  resolved_at: string | null;
  resolved_reason: string | null;
  created_at: string;
}

/** RANGES. */
export const RANGES = [
  { value: '6', label: 'Últimas 6h' },
  { value: '24', label: 'Últimas 24h' },
  { value: '72', label: 'Últimos 3 dias' },
  { value: '168', label: 'Últimos 7 dias' },
  { value: '720', label: 'Últimos 30 dias' },
] as const;

/** STATUS. */
export const STATUS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'resolved', label: 'Resolvidos' },
] as const;

/** Type Badge. */
export function TypeBadge({ type }: { type: string }) {
  const lower = type.toLowerCase();
  const isCritical = lower.includes('critical') || lower === 'error';
  const isWarning = lower.includes('warn');
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 text-[10px]',
        isCritical && 'border-destructive/30 bg-destructive/10 text-destructive',
        isWarning && 'border-warning/30 bg-warning/10 text-warning',
        !isCritical && !isWarning && 'bg-muted text-muted-foreground'
      )}
    >
      {isCritical ? <AlertCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {type}
    </Badge>
  );
}
