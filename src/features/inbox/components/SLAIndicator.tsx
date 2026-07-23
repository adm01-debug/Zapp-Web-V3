import { cn } from '@/lib/utils';
import { Clock, AlertTriangle, CheckCircle, Timer } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useSLACalculation, formatTimeRemaining, SLAStatus } from '@/features/sla';

interface SLAIndicatorProps {
  firstMessageAt: Date;
  firstResponseAt?: Date | null;
  resolvedAt?: Date | null;
  firstResponseMinutes: number;
  resolutionMinutes: number;
  className?: string;
  compact?: boolean;
}

const statusStyles: Record<SLAStatus, { bg: string; text: string; border: string; icon: React.ElementType; ring: string }> = {
  ok: { bg: 'bg-primary/5', text: 'text-primary', border: 'border-primary/10', icon: CheckCircle, ring: 'stroke-emerald-500' },
  warning: { bg: 'bg-warning/5', text: 'text-warning-foreground', border: 'border-warning/10', icon: Clock, ring: 'stroke-amber-500' },
  breached: { bg: 'bg-destructive/5', text: 'text-destructive', border: 'border-destructive/10', icon: AlertTriangle, ring: 'stroke-rose-500' },
};

function SLAProgressRing({ status, percent, size = 28 }: { status: SLAStatus; percent: number; size?: number }) {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, percent)) / 100) * circumference;

  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" strokeWidth={strokeWidth}
        className="stroke-muted/30"
      />
      <motion.circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" strokeWidth={strokeWidth} strokeLinecap="round"
        className={statusStyles[status].ring}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        strokeDasharray={circumference}
      />
    </svg>
  );
}

function getPercent(remainingMs: number, totalMs: number, breached: boolean): number {
  if (breached) return 0;
  return Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
}

/** SLAIndicator component. */
export function SLAIndicator({
  firstMessageAt,
  firstResponseAt,
  resolvedAt,
  firstResponseMinutes,
  resolutionMinutes,
  className,
  compact = false,
}: SLAIndicatorProps) {
  const sla = useSLACalculation({ firstMessageAt, firstResponseAt, resolvedAt, firstResponseMinutes, resolutionMinutes });

  if (resolvedAt && sla.worstStatus === 'ok') return null;

  const style = statusStyles[sla.worstStatus];

  const frTotalMs = firstResponseMinutes * 60_000;
  const resTotalMs = resolutionMinutes * 60_000;

  if (compact) {
    const activeStatus = !firstResponseAt ? sla.firstResponse : sla.resolution;
    const activeTotalMs = !firstResponseAt ? frTotalMs : resTotalMs;
    const activePercent = getPercent(activeStatus.remainingMs, activeTotalMs, activeStatus.breached);

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.div
              role="status"
              aria-label={`SLA ${sla.worstStatus === 'breached' ? 'violado' : sla.worstStatus === 'warning' ? 'em alerta' : 'dentro do prazo'}`}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn(
                'flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-tight border shadow-sm transition-all duration-300',
                style.bg, style.text, style.border,
                sla.worstStatus === 'breached' && 'animate-pulse shadow-[0_0_8px_rgba(244,63,94,0.2)]',
                className
              )}
            >
              <SLAProgressRing status={activeStatus.status} percent={activePercent} size={16} />
              {!firstResponseAt && sla.firstResponse.remainingMs > 0 && (
                <span>{formatTimeRemaining(sla.firstResponse.remainingMs)}</span>
              )}
              {firstResponseAt && !resolvedAt && sla.resolution.remainingMs > 0 && (
                <span>{formatTimeRemaining(sla.resolution.remainingMs)}</span>
              )}
              {(sla.firstResponse.breached || sla.resolution.breached) && <span>SLA</span>}
            </motion.div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <Timer className="w-3 h-3" />
                <span className="font-medium">Primeira Resposta:</span>
                {firstResponseAt ? (
                  <span className={sla.firstResponse.breached ? 'text-destructive' : 'text-success'}>
                    {sla.firstResponse.breached ? 'Violado' : 'OK'}
                  </span>
                ) : (
                  <span className={statusStyles[sla.firstResponse.status].text}>
                    {sla.firstResponse.status === 'breached' ? 'Violado' : formatTimeRemaining(sla.firstResponse.remainingMs)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-3 h-3" />
                <span className="font-medium">Resolução:</span>
                {resolvedAt ? (
                  <span className={sla.resolution.breached ? 'text-destructive' : 'text-success'}>
                    {sla.resolution.breached ? 'Violado' : 'OK'}
                  </span>
                ) : (
                  <span className={statusStyles[sla.resolution.status].text}>
                    {sla.resolution.status === 'breached' ? 'Violado' : formatTimeRemaining(sla.resolution.remainingMs)}
                  </span>
                )}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div role="status" aria-label="Indicadores de SLA" className={cn('flex items-center gap-2', className)}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border',
          statusStyles[sla.firstResponse.status].bg,
          statusStyles[sla.firstResponse.status].text,
          statusStyles[sla.firstResponse.status].border,
          sla.firstResponse.status === 'breached' && 'animate-pulse'
        )}
      >
        <SLAProgressRing
          status={sla.firstResponse.status}
          percent={!firstResponseAt ? getPercent(sla.firstResponse.remainingMs, frTotalMs, sla.firstResponse.breached) : 100}
          size={22}
        />
        <span>1ª Resp:</span>
        <span className="font-bold">
          {firstResponseAt 
            ? (sla.firstResponse.breached ? 'Violado' : formatTimeRemaining(sla.firstResponse.timeTakenMs || 0)) 
            : (sla.firstResponse.status === 'breached' ? 'Violado' : formatTimeRemaining(sla.firstResponse.remainingMs))}
        </span>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border',
          statusStyles[sla.resolution.status].bg,
          statusStyles[sla.resolution.status].text,
          statusStyles[sla.resolution.status].border,
          sla.resolution.status === 'breached' && 'animate-pulse'
        )}
      >
        <SLAProgressRing
          status={sla.resolution.status}
          percent={!resolvedAt ? getPercent(sla.resolution.remainingMs, resTotalMs, sla.resolution.breached) : 100}
          size={22}
        />
        <span>Resolução:</span>
        <span className="font-bold">
          {resolvedAt 
            ? (sla.resolution.breached ? 'Violado' : formatTimeRemaining(sla.resolution.timeTakenMs || 0))
            : (sla.resolution.status === 'breached' ? 'Violado' : formatTimeRemaining(sla.resolution.remainingMs))}
        </span>
      </motion.div>
    </div>
  );
}