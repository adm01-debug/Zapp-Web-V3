import { useQuery } from '@tanstack/react-query';
import { conversationEventsQueryOptions } from '@/features/inbox/hooks/useConversationEventsData';

import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ArrowRight,
  UserPlus,
  UserMinus,
  RotateCcw,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  GitBranch,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';

const EVENT_CONFIG: Record<string, { icon: typeof ArrowRight; label: string; color: string }> = {
  assign: { icon: UserPlus, label: 'Atribuído', color: 'text-success' },
  unassign: { icon: UserMinus, label: 'Desatribuído', color: 'text-warning' },
  transfer: { icon: ArrowRight, label: 'Transferido', color: 'text-primary' },
  queue_transfer: {
    icon: GitBranch,
    label: 'Transferido de fila',
    color: 'text-accent-foreground',
  },
  overload_reassign: {
    icon: AlertTriangle,
    label: 'Reatribuição por sobrecarga',
    color: 'text-warning',
  },
  absence_reassign: { icon: Clock, label: 'Reatribuição por ausência', color: 'text-destructive' },
  close: { icon: XCircle, label: 'Encerrado', color: 'text-muted-foreground' },
  reopen: { icon: RotateCcw, label: 'Reaberto', color: 'text-success' },
};

/** Conversation Timeline component. */
export function ConversationTimeline({ contactId }: { contactId: string }) {
  // Query canônica de conversation_events (BUG-2026-08-06): mesma queryKey do
  // stats de contato → 1 GET por contato; staleTime 30s evita refetch ao reabrir.
  const { data: rawEvents = [], isLoading } = useQuery(
    conversationEventsQueryOptions(contactId)
  );

  // Rejeição silenciosa de linhas malformadas (id/event_type ausentes) —
  // preserva joins via passthrough. Enums fora do vocabulário caem no fallback
  // de render (EVENT_CONFIG[event_type] || assign).
  const events = rawEvents.filter((e) => !!e.id && !!e.event_type);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="py-4 text-center text-xs text-muted-foreground">
        Nenhum evento registrado ainda
      </p>
    );
  }

  return (
    <div className="relative space-y-0">
      {/* Vertical line */}
      <div className="absolute bottom-3 left-[11px] top-3 w-px bg-border/50" />

      {events.map((event, idx) => {
        const config = EVENT_CONFIG[event.event_type] || EVENT_CONFIG.assign;
        const Icon = config.icon;

        return (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.04 }}
            className="relative flex gap-3 py-2"
          >
            {/* Dot */}
            <div
              className={`relative z-10 mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 border-border bg-background`}
            >
              <Icon className={`h-3 w-3 ${config.color}`} />
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-medium">
                  {config.label}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {format(new Date(event.created_at), 'dd/MM HH:mm', { locale: ptBR })}
                </span>
              </div>

              <p className="mt-0.5 text-[11px] leading-relaxed text-foreground/80">
                {event.event_type === 'transfer' && (
                  <>
                    De <strong>{event.from_agent?.name || '—'}</strong> para{' '}
                    <strong>{event.to_agent?.name || '—'}</strong>
                  </>
                )}
                {event.event_type === 'assign' && (
                  <>
                    Atribuído a <strong>{event.to_agent?.name || '—'}</strong>
                  </>
                )}
                {event.event_type === 'unassign' && (
                  <>
                    Removido de <strong>{event.from_agent?.name || '—'}</strong>
                  </>
                )}
                {event.event_type === 'queue_transfer' && (
                  <>
                    De <strong>{event.from_queue?.name || '—'}</strong> para{' '}
                    <strong>{event.to_queue?.name || '—'}</strong>
                  </>
                )}
                {(event.event_type === 'overload_reassign' ||
                  event.event_type === 'absence_reassign') && (
                  <>
                    De <strong>{event.from_agent?.name || '—'}</strong> para{' '}
                    <strong>{event.to_agent?.name || '—'}</strong>
                  </>
                )}
              </p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
