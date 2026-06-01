import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  MessageSquare,
  Tag,
  UserPlus,
  Edit,
  ArrowRight,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface TimelineEvent {
  id: string;
  type:
    | 'message_sent'
    | 'message_received'
    | 'created'
    | 'updated'
    | 'tag_added'
    | 'assigned'
    | 'note';
  title: string;
  description?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

interface ContactActivityTimelineProps {
  contactId: string;
  contactCreatedAt: string;
  className?: string;
}

const EVENT_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  message_sent: { icon: MessageSquare, color: 'text-primary', bg: 'bg-primary/10' },
  message_received: { icon: MessageSquare, color: 'text-accent-foreground', bg: 'bg-accent/10' },
  created: { icon: UserPlus, color: 'text-success', bg: 'bg-success/10' },
  updated: { icon: Edit, color: 'text-warning', bg: 'bg-warning/10' },
  tag_added: { icon: Tag, color: 'text-secondary', bg: 'bg-secondary/10' },
  assigned: { icon: ArrowRight, color: 'text-info', bg: 'bg-info/10' },
  note: { icon: Edit, color: 'text-muted-foreground', bg: 'bg-muted/30' },
};

export function ContactActivityTimeline({
  contactId,
  contactCreatedAt,
  className,
}: ContactActivityTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    async function fetchTimeline() {
      setLoading(true);
      const timeline: TimelineEvent[] = [];

      // Add creation event
      timeline.push({
        id: 'created',
        type: 'created',
        title: 'Contato criado',
        description: 'Adicionado à base de contatos',
        timestamp: contactCreatedAt,
      });

      // Fetch messages
      const { data: messages, error: _error } = await supabase
        .from('messages')
        .select('id, content, sender, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (messages) {
        messages.forEach((msg) => {
          timeline.push({
            id: msg.id,
            type: msg.sender === 'agent' ? 'message_sent' : 'message_received',
            title: msg.sender === 'agent' ? 'Mensagem enviada' : 'Mensagem recebida',
            description:
              (msg.content || '').substring(0, 80) + ((msg.content?.length || 0) > 80 ? '...' : ''),
            timestamp: msg.created_at,
          });
        });
      }

      // Fetch notes
      const { data: notes, error: _notesErr } = await supabase
        .from('contact_notes')
        .select('id, content, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (notes) {
        notes.forEach((note) => {
          timeline.push({
            id: note.id,
            type: 'note',
            title: 'Nota adicionada',
            description:
              (note.content || '').substring(0, 80) +
              ((note.content?.length || 0) > 80 ? '...' : ''),
            timestamp: note.created_at,
          });
        });
      }

      // Fetch assignment events
      const { data: assignments, error: _assignmentsErr } = await supabase
        .from('conversation_events')
        .select('id, event_type, created_at, metadata')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (assignments) {
        assignments.forEach((evt) => {
          timeline.push({
            id: evt.id,
            type: 'assigned',
            title:
              evt.event_type === 'assign'
                ? 'Atribuído a agente'
                : evt.event_type === 'transfer'
                  ? 'Transferido'
                  : 'Evento',
            timestamp: evt.created_at,
          });
        });
      }

      // Sort by timestamp descending
      timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setEvents(timeline);
      setLoading(false);
    }

    fetchTimeline();
  }, [contactId, contactCreatedAt]);

  const displayedEvents = expanded ? events : events.slice(0, 5);

  if (loading) {
    return (
      <div className={cn('space-y-3', className)}>
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Clock className="h-3 w-3" />
          Linha do Tempo
        </h3>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex animate-pulse gap-3">
            <div className="h-8 w-8 rounded-lg bg-muted" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-24 rounded bg-muted" />
              <div className="h-2.5 w-32 rounded bg-muted/60" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Clock className="h-3 w-3" />
          Linha do Tempo
        </h3>
        <Badge variant="secondary" className="text-[10px]">
          {events.length} eventos
        </Badge>
      </div>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute bottom-4 left-[15px] top-4 w-px bg-border/50" />

        <AnimatePresence>
          {displayedEvents.map((event, index) => {
            const config = EVENT_CONFIG[event.type] || EVENT_CONFIG.note;
            const Icon = config.icon;
            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.04 }}
                className="relative flex gap-3 py-1.5"
              >
                <div
                  className={cn(
                    'z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    config.bg
                  )}
                >
                  <Icon className={cn('h-3.5 w-3.5', config.color)} />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-medium text-foreground">{event.title}</p>
                    <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(event.timestamp), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </span>
                  </div>
                  {event.description && (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {event.description}
                    </p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {events.length > 5 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-full gap-1 text-xs text-muted-foreground"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? 'Mostrar menos' : `Ver mais ${events.length - 5} eventos`}
        </Button>
      )}
    </div>
  );
}
