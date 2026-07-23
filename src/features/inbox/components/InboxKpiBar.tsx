/**
 * KPIs leves no topo da Inbox: distribuição de tickets por status,
 * abertos atribuídos a mim, e tempo médio em aberto. Tudo computado a
 * partir do overlay local (`ticketStore`) + lista de conversas
 * carregada — sem chamadas extras.
 */
import { useMemo } from 'react';
import { Activity, CheckCircle2, Clock, Inbox } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useAllTicketStates } from '@/features/inbox';
import { useAuth } from '@/features/auth';
import { cn } from '@/lib/utils';
import type { ConversationWithMessages } from '@/features/inbox';

interface InboxKpiBarProps {
  conversations: ConversationWithMessages[];
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest === 0 ? `${h}h` : `${h}h ${rest}min`;
}

/** Inbox Kpi Bar function. */
export function InboxKpiBar({ conversations }: InboxKpiBarProps) {
  const all = useAllTicketStates();
  const { profile } = useAuth();

  const stats = useMemo(() => {
    const visibleIds = new Set(conversations.map((c) => c.contact.id));
    let open = 0;
    let inProgress = 0;
    let resolved = 0;
    let mine = 0;
    let openMs = 0;
    let openCount = 0;
    const now = Date.now();

    for (const c of conversations) {
      const t = all[c.contact.id];
      const status = t?.status ?? 'open';
      if (status === 'open') open += 1;
      else if (status === 'in_progress') inProgress += 1;
      else if (status === 'resolved') resolved += 1;

      const assigned = t?.assignedTo ?? c.contact.assigned_to ?? null;
      if (assigned && profile?.id && assigned === profile.id && status !== 'resolved') {
        mine += 1;
      }

      if (status !== 'resolved') {
        const opened = t?.openedAt ? new Date(t.openedAt).getTime() : new Date(c.contact.created_at).getTime();
        if (Number.isFinite(opened)) {
          openMs += now - opened;
          openCount += 1;
        }
      }
    }

    // Eventos de overlay para contatos que não estão mais na lista visível
    // não inflam os KPIs — restringimos a `visibleIds` acima.
    void visibleIds;

    return {
      open,
      inProgress,
      resolved,
      mine,
      avgOpen: openCount > 0 ? openMs / openCount : 0,
    };
  }, [conversations, all, profile?.id]);

  const cards = [
    { icon: Inbox, label: 'Abertos', value: stats.open, tone: 'warning' as const },
    { icon: Activity, label: 'Em atendimento', value: stats.inProgress, tone: 'primary' as const },
    { icon: CheckCircle2, label: 'Resolvidos', value: stats.resolved, tone: 'success' as const },
    { icon: Clock, label: 'Meus abertos', value: stats.mine, tone: 'info' as const },
    { icon: Clock, label: 'Tempo médio em aberto', value: formatDuration(stats.avgOpen), tone: 'muted' as const },
  ];

  const TONE: Record<string, string> = {
    warning: 'text-warning',
    primary: 'text-primary',
    success: 'text-[hsl(var(--success))]',
    info: 'text-primary',
    muted: 'text-muted-foreground',
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 px-3 py-2 border-b border-border/50 bg-muted/20">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card key={c.label} className="px-3 py-2 flex items-center gap-2 bg-background/60 border-border/40">
            <Icon className={cn('w-4 h-4 shrink-0', TONE[c.tone])} />
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{c.label}</div>
              <div className="text-[13px] font-semibold tabular-nums truncate">{c.value}</div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
