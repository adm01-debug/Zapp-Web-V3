import { useQuery } from '@tanstack/react-query';
import { safeClient } from '@/integrations/supabase/safeClient';
import { conversationEventRowSchema, safeParseEvent } from '@/shared/webhookEventSchemas';
import { getLogger } from '@/lib/logger';

const log = getLogger('ConversationTimeline');

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

interface TimelineEvent {
  id: string;
  event_type: string;
  from_agent_id: string | null;
  to_agent_id: string | null;
  from_queue_id: string | null;
  to_queue_id: string | null;
  metadata: Record<string, unknown> | null;
  performed_by: string | null;
  created_at: string;
  from_agent?: { name: string } | null;
  to_agent?: { name: string } | null;
  from_queue?: { name: string } | null;
  to_queue?: { name: string } | null;
}

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

export function ConversationTimeline({ contactId }: { contactId: string }) {
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['conversation-timeline', contactId],
    queryFn: async () => {
      const { data, error } = await safeClient.from<TimelineEvent>('conversation_events', (q) =>
        q
          .select(
            `
          id, event_type, from_agent_id, to_agent_id,
          from_queue_id, to_queue_id, metadata, performed_by, created_at,
          from_agent:profiles!conversation_events_from_agent_id_fkey(name),
          to_agent:profiles!conversation_events_to_agent_id_fkey(name),
          from_queue:queues!conversation_events_from_queue_id_fkey(name),
          to_queue:queues!conversation_events_to_queue_id_fkey(name)
        `
          )
          .eq('contact_id', contactId)
          .order('created_at', { ascending: false })
          .limit(50)
      );
      if (error) throw error;
      // Rejeição silenciosa de linhas malformadas (id/contact_id/event_type ausentes,
      // enums totalmente fora do vocabulário conhecido/aberto). Preserva joins via passthrough.
      const rows = Array.isArray(data) ? data : [];
      const valid: TimelineEvent[] = [];
      for (const row of rows) {
        const parsed = safeParseEvent(conversationEventRowSchema, row);
        if (!parsed.ok) {
          log.warn('conversation_events row rejeitada', parsed.error);
          continue;
        }
        valid.push(row as TimelineEvent);
      }
      return valid;
    },
  });

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
