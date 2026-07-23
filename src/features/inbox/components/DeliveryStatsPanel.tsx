import { useDeliveryStats } from '@/hooks/useDeliveryStats';
import { Loader2, Check, CheckCheck, Send, Users } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Props {
  remoteJid: string;
  instance?: string;
}

function relTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
  } catch {
    return '—';
  }
}

function KpiCard({ icon, label, value, lastAt, tone }: {
  icon: React.ReactNode;
  label: string;
  value: number;
  lastAt: string | null;
  tone: 'muted' | 'info' | 'success';
}) {
  const toneClass =
    tone === 'success' ? 'text-success border-success/30 bg-success/5'
    : tone === 'info' ? 'text-info border-info/30 bg-info/5'
    : 'text-muted-foreground border-border/40 bg-muted/20';
  return (
    <div className={`rounded-lg border p-2.5 ${toneClass}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide opacity-80">
        {icon}<span>{label}</span>
      </div>
      <div className="text-lg font-semibold leading-tight mt-0.5 text-foreground">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{relTime(lastAt)}</div>
    </div>
  );
}

/** Delivery Stats Panel component. */
export function DeliveryStatsPanel({ remoteJid, instance = 'wpp2' }: Props) {
  const { data, isLoading, error } = useDeliveryStats(remoteJid, instance);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6 text-muted-foreground text-xs gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Carregando entregas…
      </div>
    );
  }
  if (error || !data) {
    return <div role="alert" className="text-xs text-destructive py-2">Falha ao carregar estatísticas de entrega.</div>;
  }
  if (data.totalMessages === 0) {
    return <div className="text-xs text-muted-foreground py-2">Sem mensagens para agregar.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <KpiCard icon={<Send className="w-3 h-3" />} label="Enviadas" value={data.totals.sent} lastAt={data.totals.lastSentAt} tone="muted" />
        <KpiCard icon={<Check className="w-3 h-3" />} label="Entregues" value={data.totals.delivered} lastAt={data.totals.lastDeliveredAt} tone="info" />
        <KpiCard icon={<CheckCheck className="w-3 h-3" />} label="Lidas" value={data.totals.read} lastAt={data.totals.lastReadAt} tone="success" />
      </div>

      {data.isGroup && (
        <div className="rounded-lg border border-border/40">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border/40 bg-muted/20">
            <Users className="w-3 h-3 text-primary" />
            <span className="text-[11px] font-medium text-foreground">Por participante</span>
            <span className="ml-auto text-[10px] text-muted-foreground">{data.participants.length}</span>
          </div>
          <ScrollArea className="max-h-64">
            <ul className="divide-y divide-border/30">
              {data.participants.map((p) => (
                <li key={p.participantJid} className="px-2.5 py-2 flex items-center gap-2">
                  <Avatar className="w-6 h-6 shrink-0">
                    <AvatarFallback className="text-[9px]">
                      {p.displayName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium text-foreground truncate" title={p.participantJid}>
                      {p.displayName}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Última leitura: {relTime(p.lastReadAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] tabular-nums">
                    <span className="flex items-center gap-0.5 text-muted-foreground" title="Enviadas">
                      <Send className="w-2.5 h-2.5" />{p.sent}
                    </span>
                    <span className="flex items-center gap-0.5 text-info" title="Entregues">
                      <Check className="w-2.5 h-2.5" />{p.delivered}
                    </span>
                    <span className="flex items-center gap-0.5 text-success" title="Lidas">
                      <CheckCheck className="w-2.5 h-2.5" />{p.read}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </div>
      )}

      {!data.isGroup && data.participants.length > 0 && (
        <div className="rounded-lg border border-border/40 px-2.5 py-2 text-[11px] text-muted-foreground">
          Conversa individual — totais refletem o status do contato.
        </div>
      )}
    </div>
  );
}
