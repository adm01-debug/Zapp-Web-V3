/**
 * MessageStatusTimestamps — chip compacto que exibe HH:mm para
 * sent / delivered / read ao lado do ícone de status da mensagem.
 *
 * Convenções:
 *  - outbound (`sender === 'agent'`):
 *      sent      = message.timestamp
 *      delivered = status_updated_at quando status >= delivered
 *      read      = contact_read_at (preferido) ou status_updated_at quando status === read
 *  - inbound (`sender === 'contact'`):
 *      sent      = message.timestamp (quando o contato enviou)
 *      delivered = message.created_at (quando entrou no servidor)
 *      read      = contact_read_at (quando o agente leu)
 */
import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { Message } from '@/types/chat';
import { STAGE_LABEL_UNIFIED, STAGE_INITIAL_UNIFIED } from './messageStatusLanguage';

type Stage = 'sent' | 'delivered' | 'read';

interface Props {
  message: Pick<Message, 'sender' | 'status' | 'timestamp' | 'created_at'> & {
    status_updated_at?: string;
    contact_read_at?: string | null;
  };
  className?: string;
}

const READ_LIKE = new Set(['read', 'played']);
const DELIVERED_LIKE = new Set(['delivered', 'read', 'played']);
const SENT_LIKE = new Set(['sent', 'delivered', 'read', 'played']);

function fmt(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtFull(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString([], {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function resolveStages(message: Props['message']): Record<Stage, string | Date | null> {
  const isOutbound = message.sender === 'agent';
  const status = String(message.status ?? '').toLowerCase();

  if (isOutbound) {
    const reachedSent = SENT_LIKE.has(status);
    const reachedDelivered = DELIVERED_LIKE.has(status);
    const reachedRead = READ_LIKE.has(status) || !!message.contact_read_at;
    return {
      sent: reachedSent ? message.timestamp ?? null : null,
      delivered: reachedDelivered
        ? message.status_updated_at ?? message.timestamp ?? null
        : null,
      read: reachedRead
        ? message.contact_read_at ?? message.status_updated_at ?? null
        : null,
    };
  }

  // inbound
  return {
    sent: message.timestamp ?? null,
    delivered: message.created_at ?? message.timestamp ?? null,
    read: message.contact_read_at ?? null,
  };
}

const STAGE_LABEL = STAGE_LABEL_UNIFIED;
const STAGE_INITIAL = STAGE_INITIAL_UNIFIED;

const STAGE_TONE: Record<Stage, string> = {
  sent: 'text-muted-foreground/80',
  delivered: 'text-muted-foreground',
  read: 'text-info',
};

export const MessageStatusTimestamps = memo(function MessageStatusTimestamps({
  message,
  className,
}: Props) {
  const stages = resolveStages(message);
  const entries = (['sent', 'delivered', 'read'] as Stage[])
    .map((s) => ({ stage: s, value: stages[s], label: fmt(stages[s]) }))
    .filter((e) => !!e.label);

  if (entries.length === 0) return null;

  return (
    <span
      className={cn('inline-flex items-center gap-1 text-[9px] tabular-nums leading-none', className)}
      data-testid="message-status-timestamps"
      aria-label="Horários de envio, entrega e leitura"
    >
      {entries.map((e, idx) => (
        <span key={e.stage} className="inline-flex items-center gap-0.5">
          {idx > 0 && (
            <span className="text-muted-foreground/40" aria-hidden="true">·</span>
          )}
          <span
            className={cn('font-medium', STAGE_TONE[e.stage])}
            title={`${STAGE_LABEL[e.stage]}: ${fmtFull(e.value)}`}
          >
            <span className="opacity-70 mr-0.5">{STAGE_INITIAL[e.stage]}</span>
            {e.label}
          </span>
        </span>
      ))}
    </span>
  );
});
