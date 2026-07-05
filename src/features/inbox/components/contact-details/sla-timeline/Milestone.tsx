import { motion } from 'framer-motion';
import {
  MessageCircle, AlertTriangle, XCircle, User, Users, ExternalLink,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatTs, STATUS_STYLES, type SLAStatus } from './types';

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
  index, icon: Icon, label, timestamp, durationLabel, status, pulse, iconColor,
  agentName, queueName, attributionNote, attributionTone = 'info', onOpenConversation,
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
        status === 'breached' && 'rounded-md -mx-1 px-1 bg-destructive/5',
        status === 'warning' && 'rounded-md -mx-1 px-1 bg-warning/5',
      )}
    >
      <div
        className={cn(
          'relative z-10 mt-0.5 w-[22px] h-[22px] rounded-full bg-background border-2 border-border flex items-center justify-center shrink-0',
          pulse && 'animate-pulse border-warning/60',
          status === 'breached' && 'border-destructive/60',
          status === 'warning' && !pulse && 'border-warning/60',
        )}
      >
        <Icon className={cn('w-3 h-3', iconColor || 'text-muted-foreground')} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-medium text-foreground">{label}</span>
          {statusStyle && (
            <Badge
              variant="outline"
              className={cn(
                'text-[9px] h-4 px-1.5 font-medium border inline-flex items-center gap-1',
                statusStyle.className,
              )}
              aria-label={`SLA: ${statusStyle.label}`}
            >
              {status === 'breached' && <XCircle className="w-2.5 h-2.5" aria-hidden />}
              {status === 'warning' && <AlertTriangle className="w-2.5 h-2.5" aria-hidden />}
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
                'h-5 px-1.5 text-[10px] gap-1 ml-auto',
                status === 'breached'
                  ? 'border-destructive/40 text-destructive hover:bg-destructive/10'
                  : 'border-warning/40 text-warning hover:bg-warning/10',
              )}
            >
              <ExternalLink className="w-2.5 h-2.5" aria-hidden />
              Abrir conversa
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
          <span>{formatTs(timestamp)}</span>
          {durationLabel && <span className="text-foreground/60">· {durationLabel}</span>}
        </div>
        {(agentName || queueName) && (
          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground/90 flex-wrap">
            {agentName && (
              <span className="inline-flex items-center gap-1 bg-muted/40 rounded px-1.5 py-0.5">
                <User className="w-2.5 h-2.5" />
                <span className="text-foreground/80 font-medium">{agentName}</span>
              </span>
            )}
            {queueName && (
              <span className="inline-flex items-center gap-1 bg-muted/40 rounded px-1.5 py-0.5">
                <Users className="w-2.5 h-2.5" />
                <span className="text-foreground/80">{queueName}</span>
              </span>
            )}
          </div>
        )}
        {attributionNote && (
          <div
            className={cn(
              'mt-1 inline-flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5',
              attributionTone === 'fallback'
                ? 'bg-warning/10 text-warning border border-warning/30'
                : 'bg-muted/40 text-muted-foreground'
            )}
            role="note"
          >
            <AlertTriangle className="w-2.5 h-2.5" />
            <span>{attributionNote}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
