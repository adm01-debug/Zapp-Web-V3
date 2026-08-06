import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Calendar,
  Loader2,
  History,
  Filter,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useConversationMessagesData } from '@/features/inbox/hooks/useConversationMessagesData';
import type { ConversationMessageLite } from '@/features/inbox/hooks/useConversationMessagesData';

interface ConversationHistoryItem {
  id: string;
  date: Date;
  messageCount: number;
  lastMessage: string;
  status: 'resolved' | 'pending' | 'open';
  duration: string;
}

interface ConversationHistoryProps {
  contactId: string;
  contactPhone: string;
  onSelectConversation?: (conversationId: string) => void;
}

type PeriodFilter = '7d' | '30d' | '90d' | 'all';

const periodOptions: { value: PeriodFilter; label: string; days: number | null }[] = [
  { value: '7d', label: 'Últimos 7 dias', days: 7 },
  { value: '30d', label: 'Últimos 30 dias', days: 30 },
  { value: '90d', label: 'Últimos 90 dias', days: 90 },
  { value: 'all', label: 'Todo o histórico', days: null },
];

const statusConfig = {
  resolved: {
    label: 'Resolvido',
    icon: CheckCircle2,
    className: 'bg-success/10 text-success border-success/30',
  },
  pending: {
    label: 'Pendente',
    icon: AlertCircle,
    className: 'bg-warning/10 text-warning border-warning/30',
  },
  open: {
    label: 'Aberto',
    icon: MessageSquare,
    className: 'bg-info/10 text-info border-info/30',
  },
};

/** Conversation History component. */
export function ConversationHistory({
  contactId,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  contactPhone,
  onSelectConversation,
}: ConversationHistoryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('30d');

  // BUG-2026-08-06: histórico deriva do CACHE COMPARTILHADO de mensagens do
  // contato (useConversationMessagesData) — antes era um fetch próprio
  // (`messages?limit=100&gte 30d`) duplicando a tabela a cada abertura.
  // Trocar o filtro de período agora é puro cálculo client-side (sem refetch).
  const { data: messages = [], isLoading } = useConversationMessagesData(contactId);

  const conversations = useMemo<ConversationHistoryItem[]>(() => {
    const selectedPeriod = periodOptions.find((p) => p.value === periodFilter);
    const fromMs = selectedPeriod?.days
      ? subDays(new Date(), selectedPeriod.days).getTime()
      : null;

    // Mensagens vêm em ordem DESC (1000 mais recentes) → as 100 mais recentes
    // dentro do período; inverte para ASC (agrupamento por dia é cronológico).
    const rows = messages
      .filter((m) => fromMs === null || new Date(m.created_at).getTime() >= fromMs)
      .slice(0, 100)
      .reverse();

    // Agrupa por dia para simular sessões de conversa (ordem ASC dentro do dia).
    const groupedByDay: Record<string, ConversationMessageLite[]> = {};
    rows.forEach((msg) => {
      const dayKey = format(new Date(msg.created_at), 'yyyy-MM-dd');
      (groupedByDay[dayKey] ??= []).push(msg);
    });

    return Object.entries(groupedByDay)
      .filter(([, dayMessages]) => dayMessages.length > 0)
      .map(([dayKey, dayMessages]) => {
        const firstMsg = dayMessages[0];
        const lastMsg = dayMessages[dayMessages.length - 1];
        if (!firstMsg || !lastMsg) return null;
        const startTime = new Date(firstMsg.created_at).getTime();
        const endTime = new Date(lastMsg.created_at).getTime();
        const durationMinutes = Math.max(1, Math.round((endTime - startTime) / 60000));

        // Determine status based on last message sender
        let status: 'resolved' | 'pending' | 'open' = 'resolved';
        if (lastMsg.sender === 'contact') {
          status = 'pending';
        } else if (durationMinutes < 5) {
          status = 'open';
        }

        const safeContent = typeof lastMsg.content === 'string' ? lastMsg.content : '';
        return {
          id: dayKey,
          date: new Date(dayKey),
          messageCount: dayMessages.length,
          lastMessage:
            safeContent.length > 50
              ? `${safeContent.substring(0, 50)}...`
              : safeContent,
          status,
          duration:
            durationMinutes > 60
              ? `${Math.round(durationMinutes / 60)}h ${durationMinutes % 60}min`
              : `${durationMinutes}min`,
        };
      })
      .filter((item): item is ConversationHistoryItem => item !== null)
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [messages, periodFilter]);

  const displayedConversations = isExpanded ? conversations : conversations.slice(0, 3);

  return (
    <div className="space-y-3">
      {/* Period Filter */}
      <Select
        value={periodFilter}
        onValueChange={(v) =>
          setPeriodFilter(
            v as PeriodFilter /* ignore-audit: Select/Tabs value string narrowed to union; developer controls option values */
          )
        }
      >
        <SelectTrigger className="h-8 w-full border-border/30 bg-muted/20 text-xs hover:border-primary/30">
          <div className="flex items-center gap-2">
            <Filter className="h-3 w-3 text-muted-foreground" />
            <SelectValue placeholder="Filtrar período" />
          </div>
        </SelectTrigger>
        <SelectContent className="border-border/30 bg-card">
          {periodOptions.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="text-xs hover:bg-primary/10"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : conversations.length === 0 ? (
        <div className="py-6 text-center text-muted-foreground">
          <History className="mx-auto mb-2 h-8 w-8 opacity-50" />
          <p className="text-sm">Nenhuma conversa anterior</p>
          <p className="text-xs">Esta é a primeira interação</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {displayedConversations.map((conv, index) => {
              const StatusIcon = statusConfig[conv.status].icon;

              return (
                <motion.button
                  key={conv.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => onSelectConversation?.(conv.id)}
                  className="group w-full rounded-lg border border-border/20 bg-muted/20 p-3 text-left transition-all hover:border-primary/30 hover:bg-muted/30"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium">
                        {format(conv.date, "d 'de' MMM, yyyy", { locale: ptBR })}
                      </span>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${statusConfig[conv.status].className}`}
                    >
                      <StatusIcon className="mr-1 h-3 w-3" />
                      {statusConfig[conv.status].label}
                    </Badge>
                  </div>

                  <p className="mb-2 line-clamp-1 text-sm text-foreground">{conv.lastMessage}</p>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {conv.messageCount} msg
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {conv.duration}
                      </span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>

          {conversations.length > 3 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full text-xs text-muted-foreground hover:text-primary"
            >
              {isExpanded ? 'Ver menos' : `Ver mais ${conversations.length - 3} conversas`}
              <ChevronRight
                className={`ml-1 h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
