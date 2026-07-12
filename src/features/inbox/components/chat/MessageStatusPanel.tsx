/**
 * MessageStatusPanel — Popover com a timeline de entrega/visualização
 * de uma mensagem.
 *
 * Outbound (enviadas pelo agente):
 *   ●  Enviada       14:02
 *   ●  Entregue      14:02
 *   ○  Lida          ainda não
 *
 * Inbound (recebidas do contato):
 *   ●  Recebida      14:01
 *   ●  Lida por você 14:05   (quando o agente abriu o chat)
 *
 * Falhas exibem `error_code`/`error_reason` em destaque destrutivo.
 *
 * Limite atual do banco: existe apenas `status_updated_at` (timestamp do
 * último estado) — usamos esse campo para "Lida"/"Entregue" e o
 * `created_at`/`timestamp` para "Enviada"/"Recebida".
 */
import { memo, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CheckCheck, Check, Clock, AlertCircle, Eye, TrendingUp, Users } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useDeliveryStats } from '@/hooks/useDeliveryStats';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { Message } from '@/types/chat';

interface MessageStatusPanelProps {
  /** O trigger (geralmente o ícone de status inline). */
  children: React.ReactNode;
  message: Pick<Message, 'id' | 'status' | 'sender' | 'timestamp' | 'created_at' | 'updated_at'> & {
    status_updated_at?: string;
    error_code?: string | null;
    error_reason?: string | null;
    /** Timestamp em que a conversa foi marcada como lida pelo agente. */
    contact_read_at?: string | null;
    remote_jid?: string | null;
    contact_id?: string | null;
  };
}

const TERMINAL_FAILURES = new Set(['failed', 'failed_auth', 'failed_retries'] as const);

function formatStamp(value?: string | Date | null): string {
  if (!value) return 'ainda não';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return 'ainda não';
  const time = format(d, 'HH:mm', { locale: ptBR });
  if (isToday(d)) return time;
  if (isYesterday(d)) return `ontem ${time}`;
  return format(d, "dd/MM 'às' HH:mm", { locale: ptBR });
}

function TimelineRow({
  reached,
  label,
  stamp,
  icon,
  destructive,
  highlight,
}: {
  reached: boolean;
  label: string;
  stamp: string;
  icon: React.ReactNode;
  destructive?: boolean;
  highlight?: boolean;
}) {
  return (
    <li className="flex items-center gap-3 py-1.5">
      <span
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
          destructive && 'border-destructive/50 bg-destructive/10 text-destructive',
          !destructive && reached && highlight && 'border-info/50 bg-info/10 text-info',
          !destructive && reached && !highlight && 'border-primary/40 bg-primary/10 text-primary',
          !destructive && !reached && 'border-border bg-muted text-muted-foreground'
        )}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
        <span
          className={cn(
            'text-sm font-medium',
            destructive ? 'text-destructive' : reached ? 'text-foreground' : 'text-muted-foreground'
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            'text-xs tabular-nums',
            reached ? 'text-muted-foreground' : 'italic text-muted-foreground/60'
          )}
        >
          {stamp}
        </span>
      </div>
    </li>
  );
}

export const MessageStatusPanel = memo(function MessageStatusPanel({
  children,
  message,
}: MessageStatusPanelProps) {
  const { data: stats } = useDeliveryStats(
    message.sender === 'agent'
      ? (message.remote_jid ?? undefined)
      : (message.contact_id ?? undefined)
  );
  const isSent = message.sender === 'agent';
  const isFailed = (TERMINAL_FAILURES as Set<string>).has(message.status);

  const lastUpdate = message.status_updated_at ?? message.updated_at ?? null;
  const sentStamp = message.created_at ?? message.timestamp ?? null;

  const rows = useMemo(() => {
    if (isSent) {
      const reachedDelivered =
        message.status === 'delivered' || message.status === 'read' || message.status === 'played';
      const reachedRead = message.status === 'read' || message.status === 'played';
      return [
        {
          reached: true,
          label: 'Enviada',
          stamp: formatStamp(sentStamp),
          icon: <Check className="h-3 w-3" />,
        },
        {
          reached: reachedDelivered,
          label: 'Entregue',
          stamp: reachedDelivered ? formatStamp(lastUpdate) : 'ainda não',
          icon: <CheckCheck className="h-3 w-3" />,
        },
        {
          reached: reachedRead,
          label: message.status === 'played' ? 'Reproduzida' : 'Visualizada',
          stamp: reachedRead ? formatStamp(lastUpdate) : 'ainda não',
          icon: <Eye className="h-3 w-3" />,
          highlight: true,
        },
      ];
    }
    // Inbound
    const reachedRead = !!message.contact_read_at;
    return [
      {
        reached: true,
        label: 'Enviada',
        stamp: formatStamp(sentStamp),
        icon: <Check className="h-3 w-3" />,
      },
      {
        reached: true,
        label: 'Entregue',
        stamp: formatStamp(message.created_at ?? sentStamp),
        icon: <CheckCheck className="h-3 w-3" />,
      },
      {
        reached: reachedRead,
        label: 'Visualizada',
        stamp: reachedRead ? formatStamp(message.contact_read_at) : 'ainda não',
        icon: <Eye className="h-3 w-3" />,
        highlight: true,
      },
    ];
  }, [isSent, message.status, message.contact_read_at, lastUpdate, sentStamp]);

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="top"
        align={isSent ? 'end' : 'start'}
        className="w-72 p-3"
        role="dialog"
        aria-label="Detalhes de entrega da mensagem"
      >
        <header className="mb-2 flex items-center justify-between border-b border-border/50 pb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {isSent ? 'Status de envio' : 'Status de recebimento'}
          </h3>
          {isFailed ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-destructive">
              <AlertCircle className="h-3 w-3" />
              Falhou
            </span>
          ) : message.status === 'sending' || message.status === 'retrying' ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-warning">
              <Clock className="h-3 w-3" />
              Em andamento
            </span>
          ) : null}
        </header>

        <ol className="space-y-0">
          {rows.map((r) => (
            <TimelineRow key={r.label} {...r} />
          ))}
        </ol>

        {stats?.isGroup && stats.participants.length > 0 && (
          <div className="mt-4 border-t border-border/40 pt-3">
            <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <Users className="h-3 w-3" />
              Status por participante
            </h4>
            <div className="scrollbar-thin max-h-48 space-y-3 overflow-y-auto pr-1">
              {stats.participants.map((p) => (
                <div key={p.participantJid} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span
                      className="max-w-[120px] truncate text-[11px] font-medium"
                      title={p.displayName}
                    >
                      {p.displayName}
                    </span>
                    <div className="flex gap-2 text-[10px] text-muted-foreground">
                      <span title="Enviadas">↑{p.sent}</span>
                      <span title="Entregues">✓{p.delivered}</span>
                      <span title="Lidas" className="text-info">
                        ✓✓{p.read}
                      </span>
                    </div>
                  </div>
                  {p.timeline.length > 1 && (
                    <div className="h-10 w-full opacity-60 transition-opacity hover:opacity-100">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={p.timeline}>
                          <Line
                            type="monotone"
                            dataKey="read"
                            stroke="hsl(var(--info))"
                            strokeWidth={1.5}
                            dot={false}
                            isAnimationActive={false}
                          />
                          <XAxis dataKey="time" hide />
                          <YAxis hide />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {isFailed && (message.error_code || message.error_reason) && (
          <div
            className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive"
            role="alert"
          >
            {message.error_code && <p className="text-[11px] opacity-80">{message.error_code}</p>}
            {message.error_reason && <p className="mt-0.5">{message.error_reason}</p>}
          </div>
        )}

        {stats?.timeline && stats.timeline.length > 1 && (
          <div className="mt-4 border-t border-border/40 pt-3">
            <h4 className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              Evolução da entrega
            </h4>
            <div className="h-28 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.timeline}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="hsl(var(--border))"
                  />
                  <XAxis dataKey="time" hide />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      borderColor: 'hsl(var(--border))',
                      fontSize: '0.75rem',
                      borderRadius: '6px',
                    }}
                    itemStyle={{ padding: '0px' }}
                    labelFormatter={(label: string | number) => format(new Date(label), 'HH:mm')}
                  />
                  <Line
                    type="monotone"
                    dataKey="sent"
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={2}
                    dot={false}
                    name="Enviadas"
                  />
                  <Line
                    type="monotone"
                    dataKey="delivered"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                    name="Entregues"
                  />
                  <Line
                    type="monotone"
                    dataKey="read"
                    stroke="hsl(var(--info))"
                    strokeWidth={2}
                    dot={false}
                    name="Lidas"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
});