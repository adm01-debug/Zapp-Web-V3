/**
 * ConversationDeliverySummary — linha agregada com contadores de status
 * para o conjunto de mensagens da conversa atual, separando direção.
 *
 *   Enviadas:  [ 24 ✓ enviadas · 22 ✓✓ entregues · 19 👁 lidas · 1 ⚠ falha ]
 *   Recebidas: [ 30 ✓ enviadas · 28 ✓✓ entregues · 25 👁 lidas ]
 *
 * - Outbound = `sender === 'agent'`. Inbound = `sender === 'contact'`.
 * - Renderiza compacto (chips) no topo da área de mensagens.
 * - Esconde-se quando não há mensagens (estado vazio).
 * - Sem chamadas extras: agrega o array de mensagens já em memória.
 */
import { memo, useMemo } from 'react';
import { Check, CheckCheck, AlertCircle, Eye, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '@/types/chat';

interface Props {
  messages: Message[];
  className?: string;
}

interface Counts {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  total: number;
}

const READ_LIKE = new Set(['read', 'played']);
const DELIVERED_LIKE = new Set(['delivered', 'read', 'played']);
const SENT_LIKE = new Set(['sent', 'delivered', 'read', 'played']);
const FAILED_LIKE = new Set(['failed', 'failed_auth', 'failed_retries']);

function aggregate(messages: Message[]): { outbound: Counts; inbound: Counts } {
  const outbound: Counts = { sent: 0, delivered: 0, read: 0, failed: 0, total: 0 };
  const inbound: Counts = { sent: 0, delivered: 0, read: 0, failed: 0, total: 0 };
  for (const m of messages) {
    if (m.is_deleted) continue;
    const bucket = m.sender === 'agent' ? outbound : m.sender === 'contact' ? inbound : null;
    if (!bucket) continue;
    bucket.total += 1;
    if (SENT_LIKE.has(m.status)) bucket.sent += 1;
    if (DELIVERED_LIKE.has(m.status)) bucket.delivered += 1;
    if (READ_LIKE.has(m.status)) bucket.read += 1;
    if (FAILED_LIKE.has(m.status)) bucket.failed += 1;
  }
  return { outbound, inbound };
}

function Chip({
  icon,
  value,
  label,
  tone,
  ariaLabel,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  tone: 'muted' | 'info' | 'destructive' | 'primary';
  ariaLabel: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-medium tabular-nums',
        tone === 'muted' && 'text-muted-foreground',
        tone === 'primary' && 'text-foreground',
        tone === 'info' && 'text-info',
        tone === 'destructive' && 'text-destructive',
      )}
      aria-label={ariaLabel}
    >
      {icon}
      <span>{value}</span>
      <span className="text-muted-foreground/80 font-normal">{label}</span>
    </span>
  );
}

function DirectionRow({
  direction,
  counts,
}: {
  direction: 'outbound' | 'inbound';
  counts: Counts;
}) {
  if (counts.total === 0) return null;
  const isOut = direction === 'outbound';
  const Arrow = isOut ? ArrowUp : ArrowDown;
  const label = isOut ? 'Enviadas' : 'Recebidas';

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span
        className={cn(
          'inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md',
          isOut ? 'text-primary bg-primary/10' : 'text-info bg-info/10',
        )}
      >
        <Arrow className="h-2.5 w-2.5" aria-hidden="true" />
        {label}
      </span>
      <Chip
        icon={<Check className="h-3 w-3" aria-hidden="true" />}
        value={counts.sent}
        label="enviadas"
        tone="muted"
        ariaLabel={`${label}: ${counts.sent} enviadas`}
      />
      <span className="h-3 w-px bg-border/60" aria-hidden="true" />
      <Chip
        icon={<CheckCheck className="h-3 w-3" aria-hidden="true" />}
        value={counts.delivered}
        label="entregues"
        tone="muted"
        ariaLabel={`${label}: ${counts.delivered} entregues`}
      />
      <span className="h-3 w-px bg-border/60" aria-hidden="true" />
      <Chip
        icon={<Eye className="h-3 w-3" aria-hidden="true" />}
        value={counts.read}
        label="lidas"
        tone="info"
        ariaLabel={`${label}: ${counts.read} lidas`}
      />
      {counts.failed > 0 && (
        <>
          <span className="h-3 w-px bg-border/60" aria-hidden="true" />
          <Chip
            icon={<AlertCircle className="h-3 w-3" aria-hidden="true" />}
            value={counts.failed}
            label="com falha"
            tone="destructive"
            ariaLabel={`${label}: ${counts.failed} com falha`}
          />
        </>
      )}
    </div>
  );
}

/** Conversation Delivery Summary constant. */
export const ConversationDeliverySummary = memo(function ConversationDeliverySummary({
  messages,
  className,
}: Props) {
  const { outbound, inbound } = useMemo(() => aggregate(messages), [messages]);

  if (outbound.total === 0 && inbound.total === 0) return null;

  return (
    <div
      data-testid="conversation-delivery-summary"
      className={cn(
        'flex flex-col gap-1.5 px-3 py-2 rounded-2xl border border-border/40 bg-card/60 backdrop-blur-sm',
        'text-xs shadow-sm select-none',
        className,
      )}
      role="status"
      aria-label="Resumo de entrega da conversa por direção"
    >
      <DirectionRow direction="outbound" counts={outbound} />
      {outbound.total > 0 && inbound.total > 0 && (
        <div className="h-px bg-border/40" aria-hidden="true" />
      )}
      <DirectionRow direction="inbound" counts={inbound} />
    </div>
  );
});
