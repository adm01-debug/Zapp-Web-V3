import { motion } from 'framer-motion';
import { MessageCircle, AlertTriangle, XCircle, User, Users, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatTs, STATUS_STYLES, type SLAStatus } from './types';

/** Milestone Props interface definition. */
export interface MilestoneProps {
  index: number;
  icon: typeof MessageCircle;
  label: string;
  timestamp: Date | null;
  durationLabel?: string | null;
  status?: SLAStatus;
  pulse?: boolean;
  iconColor?: string;
  agentName?: string | null;
  queueName?: string | null;
  /** Optional disclaimer shown below the chips (e.g. "atribuição parcial"). */
  attributionNote?: string | null;
  /** Style of the note: 'fallback' = warning tone, 'info' = neutral. */
  attributionTone?: 'fallback' | 'info';
  /** Show "Abrir conversa" CTA — only meaningful when status is warning/breached. */
  onOpenConversation?: () => void;
}

export function Milestone({
  index,
  icon: Icon,
  label,
  timestamp,
  durationLabel,
  status,
  pulse,
  iconColor,
  agentName,
  queueName,
  attributionNote,
  attributionTone = 'info',
  onOpenConversation,
}: MilestoneProps) {
  const statusStyle = status ? STATUS_STYLES[status] : null;
  const showOpenCta = onOpenConversation && (status === 'warning' || status === 'breached');
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      role="listitem"
      className={cn(
        'relative flex gap-3 py-2',
        status === 'breached' && '-mx-1 rounded-md bg-destructive/5 px-1',
        status === 'warning' && '-mx-1 rounded-md bg-warning/5 px-1'
      )}
    >
      <div
        className={cn(
          'relative z-10 mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 border-border bg-background',
          pulse && 'animate-pulse border-warning/60',
          status === 'breached' && 'border-destructive/60',
          status === 'warning' && !pulse && 'border-warning/60'
        )}
      >
        <Icon className={cn('h-3 w-3', iconColor || 'text-muted-foreground')} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-medium text-foreground">{label}</span>
          {statusStyle && (
            <Badge
              variant="outline"
              className={cn(
                'inline-flex h-4 items-center gap-1 border px-1.5 text-[9px] font-medium',
                statusStyle.className
              )}
              aria-label={`SLA: ${statusStyle.label}`}
            >
              {status === 'breached' && <XCircle className="h-2.5 w-2.5" aria-hidden />}
              {status === 'warning' && <AlertTriangle className="h-2.5 w-2.5" aria-hidden />}
              {statusStyle.label}
            </Badge>
          )}
          {showOpenCta && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenConversation}
              className={cn(
                'ml-auto h-5 gap-1 px-1.5 text-[10px]',
                status === 'breached'
                  ? 'border-destructive/40 text-destructive hover:bg-destructive/10'
                  : 'border-warning/40 text-warning hover:bg-warning/10'
              )}
            >
              <ExternalLink className="h-2.5 w-2.5" aria-hidden />
              Abrir conversa
            </Button>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>{formatTs(timestamp)}</span>
          {durationLabel && <span className="text-foreground/60">· {durationLabel}</span>}
        </div>
        {(agentName || queueName) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground/90">
            {agentName && (
              <span className="inline-flex items-center gap-1 rounded bg-muted/40 px-1.5 py-0.5">
                <User className="h-2.5 w-2.5" />
                <span className="font-medium text-foreground/80">{agentName}</span>
              </span>
            )}
            {queueName && (
              <span className="inline-flex items-center gap-1 rounded bg-muted/40 px-1.5 py-0.5">
                <Users className="h-2.5 w-2.5" />
                <span className="text-foreground/80">{queueName}</span>
              </span>
            )}
          </div>
        )}
        {attributionNote && (
          <div
            className={cn(
              'mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]',
              attributionTone === 'fallback'
                ? 'border border-warning/30 bg-warning/10 text-warning'
                : 'bg-muted/40 text-muted-foreground'
            )}
            role="note"
          >
            <AlertTriangle className="h-2.5 w-2.5" />
            <span>{attributionNote}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
