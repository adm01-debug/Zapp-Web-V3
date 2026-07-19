/**
 * MessageStatusTimeline — vertical timeline of the four delivery milestones
 * (queued → sent → delivered → read) for a single outbound message.
 *
 * Data model note: FATOR X stores only ONE `status_at` (the timestamp of the
 * latest transition). We infer the timeline as follows:
 *   • Queued  → always known (`created_at`)
 *   • Sent    → completed if status ≥ sent. Timestamp shown only if it's
 *               the current status (otherwise "—" with "registrado" badge).
 *   • Delivered / Read → same rule, anchored to `status_at`.
 *
 * Inbound messages (sender === 'contact') and failed messages render an
 * adapted timeline so the agent still sees a coherent verification story.
 */
import { memo, useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Check, CheckCheck, Clock, Loader2, Send, AlertCircle, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMessageSendStatus } from '@/features/inbox';

type StepKey = 'queued' | 'sent' | 'delivered' | 'read';
type StepState = 'done' | 'current' | 'pending' | 'failed';

interface TimelineStep {
  key: StepKey;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  state: StepState;
  timestamp?: string | null;
  approximate?: boolean;
}

interface MessageStatusTimelineProps {
  messageId: string;
  status: string;
  createdAt: string;
  statusAt?: string | null;
  direction?: 'inbound' | 'outbound' | string;
  fromMe?: boolean;
  className?: string;
}

const STATUS_ORDER: Record<string, number> = {
  queued: 0,
  sending: 0,
  retrying: 0,
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  played: 3,
};

const FAILURE_STATUSES = new Set(['failed', 'failed_auth', 'failed_retries']);

function fmt(ts?: string | null): string {
  if (!ts) return '—';
  try {
    return format(new Date(ts), "dd/MM/yyyy HH:mm:ss", { locale: ptBR });
  } catch {
    return '—';
  }
}

/** Message Status Timeline constant. */
export const MessageStatusTimeline = memo(function MessageStatusTimeline({
  messageId,
  status,
  createdAt,
  statusAt,
  direction,
  fromMe,
  className,
}: MessageStatusTimelineProps) {
  const bus = useMessageSendStatus(messageId);

  const effectiveStatus = bus?.status ?? status;
  const isInbound = direction === 'inbound' || fromMe === false;
  const isFailed = FAILURE_STATUSES.has(effectiveStatus);

  const steps: TimelineStep[] = useMemo(() => {
    const currentRank = STATUS_ORDER[effectiveStatus] ?? -1;

    const buildOutbound = (): TimelineStep[] => {
      const isCurrent = (rank: number) => currentRank === rank && !isFailed;
      const stateFor = (rank: number): StepState => {
        if (isFailed && rank > 0) return rank === 1 ? 'failed' : 'pending';
        if (currentRank > rank) return 'done';
        if (currentRank === rank) return 'current';
        return 'pending';
      };
      return [
        {
          key: 'queued',
          label: 'Na fila',
          description: 'Mensagem aceita pelo backend e aguardando envio.',
          icon: Clock,
          state: currentRank >= 0 ? 'done' : 'current',
          timestamp: createdAt,
        },
        {
          key: 'sent',
          label: 'Enviada',
          description: 'Saiu do servidor em direção ao WhatsApp.',
          icon: Send,
          state: stateFor(1),
          timestamp: isCurrent(1) ? statusAt ?? null : currentRank > 1 ? null : null,
          approximate: currentRank > 1,
        },
        {
          key: 'delivered',
          label: 'Entregue',
          description: 'Recebida no aparelho do destinatário.',
          icon: Check,
          state: stateFor(2),
          timestamp: isCurrent(2) ? statusAt ?? null : null,
          approximate: currentRank > 2,
        },
        {
          key: 'read',
          label: effectiveStatus === 'played' ? 'Reproduzida' : 'Visualizada',
          description: effectiveStatus === 'played'
            ? 'Áudio reproduzido pelo destinatário.'
            : 'Visualizada pelo destinatário.',
          icon: effectiveStatus === 'played' ? Eye : CheckCheck,
          state: stateFor(3),
          timestamp: isCurrent(3) ? statusAt ?? null : null,
        },
      ];
    };

    const buildInbound = (): TimelineStep[] => [
      {
        key: 'sent',
        label: 'Enviada pelo contato',
        description: 'Mensagem saiu do aparelho do contato.',
        icon: Send,
        state: 'done',
        timestamp: createdAt,
      },
      {
        key: 'delivered',
        label: 'Entregue',
        description: 'Mensagem entregue ao seu inbox.',
        icon: Check,
        state: 'done',
        timestamp: createdAt,
      },
      {
        key: 'read',
        label: status === 'read' ? 'Visualizada' : 'Não visualizada',
        description: status === 'read'
          ? 'Você abriu e marcou como visualizada.'
          : 'A mensagem ainda não foi visualizada.',
        icon: CheckCheck,
        state: status === 'read' ? 'done' : 'pending',
        timestamp: status === 'read' ? statusAt ?? null : null,
      },
    ];

    return isInbound ? buildInbound() : buildOutbound();
  }, [effectiveStatus, status, createdAt, statusAt, isFailed, isInbound]);

  return (
    <ol
      className={cn('relative space-y-4 pl-2', className)}
      data-testid="message-status-timeline"
      aria-label="Linha do tempo de status da mensagem"
    >
      {steps.map((step, idx) => {
        const Icon = step.icon;
        const isLast = idx === steps.length - 1;
        const isCurrent = step.state === 'current';
        const isDone = step.state === 'done';
        const isFailedStep = step.state === 'failed';

        return (
          <li key={step.key} className="relative flex gap-3" data-state={step.state}>
            {/* Connector line */}
            {!isLast && (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute left-[15px] top-8 bottom-[-1rem] w-px',
                  isDone ? 'bg-primary/60' : 'bg-border',
                )}
              />
            )}

            {/* Icon bubble */}
            <span
              className={cn(
                'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors',
                isDone && 'bg-primary text-primary-foreground border-primary',
                isCurrent && 'bg-primary/15 text-primary border-primary animate-pulse',
                isFailedStep && 'bg-destructive/15 text-destructive border-destructive',
                step.state === 'pending' && 'bg-muted text-muted-foreground border-border',
              )}
            >
              {isCurrent && !isFailedStep ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isFailedStep ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
            </span>

            {/* Body */}
            <div className="flex-1 pb-1">
              <div className="flex items-baseline justify-between gap-2">
                <p
                  className={cn(
                    'text-sm font-medium leading-tight',
                    isFailedStep && 'text-destructive',
                  )}
                >
                  {step.label}
                </p>
                <time className="text-xs tabular-nums text-muted-foreground shrink-0">
                  {step.timestamp ? fmt(step.timestamp) : step.approximate ? 'registrado' : '—'}
                </time>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isFailedStep ? 'Falha no envio. Use a opção "Reenviar" no balão da mensagem.' : step.description}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
});
