import { useState } from 'react';
import { Clock, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { type SLAStatus } from '@/hooks/useEmailManagement';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface EmailSLABadgeProps {
  status: SLAStatus | null;
  receivedAt?: string;
  frtMinutes?: number | null;
  thresholdMinutes?: number;
  compact?: boolean;
  className?: string;
}

const CONFIG: Record<SLAStatus, {
  label: string;
  icon: typeof Clock;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  className: string;
}> = {
  ok: {
    label: 'No prazo',
    icon: CheckCircle,
    variant: 'outline',
    className: 'border-primary/50 text-primary dark:text-primary',
  },
  warning: {
    label: 'Atenção',
    icon: AlertTriangle,
    variant: 'outline',
    className: 'border-warning/50 text-warning-foreground dark:text-warning-foreground animate-pulse',
  },
  breached: {
    label: 'SLA violado',
    icon: XCircle,
    variant: 'destructive',
    className: 'bg-destructive/10 border-destructive/50 text-destructive',
  },
  met: {
    label: 'Respondido',
    icon: CheckCircle,
    variant: 'secondary',
    className: 'bg-primary text-primary dark:bg-primary/30 dark:text-primary',
  },
};

export function EmailSLABadge({
  status,
  receivedAt,
  frtMinutes,
  thresholdMinutes = 480,
  compact = false,
  className,
}: EmailSLABadgeProps) {
  if (!status) return null;

  const { label, icon: Icon, className: statusClass } = CONFIG[status];

  const tooltipText = frtMinutes != null
    ? `Respondido em ${formatMinutes(frtMinutes)}`
    : receivedAt
    ? `Recebido ${formatDistanceToNow(new Date(receivedAt), { locale: ptBR, addSuffix: true })}`
    : '';

  const badge = (
    <Badge
      variant="outline"
      className={cn('gap-1 text-[10px] h-5 px-1.5 font-medium', statusClass, className)}
    >
      <Icon className="h-3 w-3" />
      {!compact && <span>{label}</span>}
    </Badge>
  );

  if (!tooltipText) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <p>{tooltipText}</p>
        <p className="text-muted-foreground">SLA: {formatMinutes(thresholdMinutes)}</p>
      </TooltipContent>
    </Tooltip>
  );
}

// Indicador de SLA compacto para lista de threads
interface SLADotProps {
  status: SLAStatus | null;
  className?: string;
}

export function SLADot({ status, className }: SLADotProps) {
  if (!status || status === 'ok') return null;

  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full',
        status === 'warning' && 'bg-warning',
        status === 'breached' && 'bg-destructive animate-pulse',
        className
      )}
    />
  );
}

// Barra de progresso de SLA
interface SLAProgressBarProps {
  receivedAt: string;
  thresholdMinutes: number;
  repliedAt?: string | null;
  className?: string;
}

export function SLAProgressBar({ receivedAt, thresholdMinutes, repliedAt, className }: SLAProgressBarProps) {
  const [_now] = useState(Date.now);
  const elapsed = Math.floor((Date.now() - new Date(receivedAt).getTime()) / 60_000);
  const target   = repliedAt
    ? Math.floor((new Date(repliedAt).getTime() - new Date(receivedAt).getTime()) / 60_000)
    : elapsed;
  const pct      = Math.min(100, Math.round((target / thresholdMinutes) * 100));

  const color =
    pct >= 100 ? 'bg-destructive' :
    pct >= 80  ? 'bg-warning' :
    'bg-primary';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-300', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
        {formatMinutes(target)}/{formatMinutes(thresholdMinutes)}
      </span>
    </div>
  );
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h${m}min` : `${h}h`;
}
