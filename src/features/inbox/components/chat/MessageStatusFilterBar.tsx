/* eslint-disable react-refresh/only-export-components */
/**
 * MessageStatusFilterBar — chips toggláveis para filtrar a lista
 * de mensagens da conversa por status (sent / delivered / read).
 *
 * Comportamento:
 *  - Multi-seleção: o usuário pode ativar 1, 2 ou 3 chips.
 *  - Quando NENHUM chip está ativo, o filtro é considerado "off"
 *    (mostra tudo). Isso evita esconder a conversa inteira por
 *    engano.
 *  - Hierarquia inclusiva: ao filtrar por "Visualizada" entram
 *    também os status superiores (`played`); ao filtrar por
 *    "Entregue" entram `delivered`/`read`/`played`; ao filtrar
 *    por "Enviada" entram todos os terminais positivos.
 *  - Linguagem unificada (Enviada / Entregue / Visualizada) com
 *    `messageStatusLanguage.ts`.
 */
import { memo, useMemo } from 'react';
import { Check, CheckCheck, Eye, Filter, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '@/types/chat';
import { STAGE_LABEL_UNIFIED } from './messageStatusLanguage';

export type MessageStatusFilter = 'sent' | 'delivered' | 'read';

interface Props {
  active: Set<MessageStatusFilter>;
  onChange: (next: Set<MessageStatusFilter>) => void;
  visibleCount: number;
  totalCount: number;
  className?: string;
}

const SENT_LIKE = new Set(['sent', 'delivered', 'read', 'played']);
const DELIVERED_LIKE = new Set(['delivered', 'read', 'played']);
const READ_LIKE = new Set(['read', 'played']);

export function matchesStatusFilter(
  status: string | undefined | null,
  active: Set<MessageStatusFilter>,
): boolean {
  if (active.size === 0) return true;
  const s = String(status ?? '').toLowerCase();
  if (active.has('read') && READ_LIKE.has(s)) return true;
  if (active.has('delivered') && DELIVERED_LIKE.has(s)) return true;
  if (active.has('sent') && SENT_LIKE.has(s)) return true;
  return false;
}

export function filterMessagesByStatus(
  messages: Message[],
  active: Set<MessageStatusFilter>,
): Message[] {
  if (active.size === 0) return messages;
  return messages.filter((m) => matchesStatusFilter(m.status, active));
}

const CHIP_META: Record<MessageStatusFilter, { icon: React.ComponentType<{ className?: string }>; label: string; tone: string }> = {
  sent:      { icon: Check,      label: STAGE_LABEL_UNIFIED.sent,      tone: 'text-muted-foreground border-border/50 data-[on=true]:bg-muted data-[on=true]:text-foreground' },
  delivered: { icon: CheckCheck, label: STAGE_LABEL_UNIFIED.delivered, tone: 'text-muted-foreground border-border/50 data-[on=true]:bg-muted data-[on=true]:text-foreground' },
  read:      { icon: Eye,        label: STAGE_LABEL_UNIFIED.read,      tone: 'text-info border-info/40 data-[on=true]:bg-info/15 data-[on=true]:text-info' },
};

export const MessageStatusFilterBar = memo(function MessageStatusFilterBar({
  active, onChange, visibleCount, totalCount, className,
}: Props) {
  const isFiltering = active.size > 0;
  const order: MessageStatusFilter[] = useMemo(() => ['sent', 'delivered', 'read'], []);

  const toggle = (key: MessageStatusFilter) => {
    const next = new Set(active);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 rounded-full border border-border/40 bg-card/70 backdrop-blur-sm shadow-sm',
        className,
      )}
      role="toolbar"
      aria-label="Filtrar mensagens por status"
    >
      <Filter className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
      {order.map((key) => {
        const { icon: Icon, label, tone } = CHIP_META[key];
        const on = active.has(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            data-on={on}
            data-testid={`message-status-filter-${key}`}
            aria-pressed={on}
            aria-label={`Filtrar por ${label}`}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium transition-colors',
              'hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60',
              tone,
            )}
          >
            <Icon className="h-3 w-3" aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
      {isFiltering && (
        <>
          <span className="h-3 w-px bg-border/60 mx-0.5" aria-hidden="true" />
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {visibleCount}/{totalCount}
          </span>
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="inline-flex items-center justify-center h-4 w-4 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            aria-label="Limpar filtros de status"
            title="Limpar filtros"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </>
      )}
    </div>
  );
});
