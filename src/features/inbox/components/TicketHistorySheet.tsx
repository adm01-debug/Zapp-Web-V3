// @ts-nocheck — strict-mode retrofit pendente (ver docs/STRICT_MODE_BACKLOG.md)
/**
 * Drawer com histórico do atendimento.
 *
 * Funde duas fontes de verdade:
 *  1. Eventos locais do `ticketStore` (status_change, assign, transfer,
 *     unassign, auto_routed) — refletem mudanças feitas pela UI nova.
 *  2. `public.conversation_events` (Lovable Cloud) — eventos persistidos
 *     pelos triggers (`log_assignment_change`, `fn_log_sla_ack_event` etc).
 *
 * Quando a RPC FATOR X estiver disponível, a fonte (1) será substituída
 * pelo `evolution_audit_log` filtrado por `entity_type='conversation'`.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, Circle, UserCheck, UserMinus, UserPlus, Wand2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTicketStatus } from '@/features/inbox';
import type { TicketEvent } from '@/lib/inbox/ticketStore';

interface TicketHistorySheetProps {
  contactId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RemoteEvent {
  id: string;
  event_type: string;
  from_agent_id?: string | null;
  to_agent_id?: string | null;
  from_queue_id?: string | null;
  to_queue_id?: string | null;
  performed_by?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  // Fator X audit logs
  status?: string;
  error_message?: string;
}

interface UnifiedEvent {
  id: string;
  source: 'local' | 'remote' | 'audit';
  type: string;
  at: string;
  label: string;
  detail?: string;
}

const ICONS: Record<string, typeof Circle> = {
  status_change: Clock,
  assign: UserCheck,
  unassign: UserMinus,
  transfer: UserPlus,
  auto_routed: Wand2,
  resolved: CheckCircle2,
};

function describeLocal(e: TicketEvent, nameMap: Record<string, string>): UnifiedEvent {
  const fromName = e.fromAgentId ? (nameMap[e.fromAgentId] ?? 'agente') : null;
  const toName = e.toAgentId ? (nameMap[e.toAgentId] ?? 'agente') : null;
  const performer = e.performedBy ? (nameMap[e.performedBy] ?? 'sistema') : 'sistema';
  let label: string = e.type;
  let detail: string | undefined;
  if (e.type === 'status_change') {
    label = `Status: ${e.fromStatus ?? '—'} → ${e.toStatus ?? '—'}`;
    detail = `por ${performer}`;
  } else if (e.type === 'assign') {
    label = `Atendimento assumido por ${toName ?? '—'}`;
  } else if (e.type === 'unassign') {
    label = 'Devolvido à fila';
    detail = `por ${performer}`;
  } else if (e.type === 'transfer') {
    label = `Transferido: ${fromName ?? '—'} → ${toName ?? '—'}`;
    detail = `por ${performer}`;
  } else if (e.type === 'auto_routed') {
    label = `Atribuído automaticamente a ${toName ?? '—'}`;
    detail = 'via ticket-router';
  }
  return { id: e.id, source: 'local', type: e.type, at: e.at, label, detail };
}

function describeRemote(e: RemoteEvent, nameMap: Record<string, string>): UnifiedEvent {
  const fromName = e.from_agent_id ? (nameMap[e.from_agent_id] ?? 'agente') : null;
  const toName = e.to_agent_id ? (nameMap[e.to_agent_id] ?? 'agente') : null;
  const performer = e.performed_by ? (nameMap[e.performed_by] ?? 'sistema') : 'sistema';
  let label = e.event_type;
  let detail: string | undefined = `por ${performer}`;
  if (e.event_type === 'assign') label = `Atribuído a ${toName ?? '—'}`;
  else if (e.event_type === 'unassign') label = `Devolvido à fila`;
  else if (e.event_type === 'transfer') label = `Transferido: ${fromName ?? '—'} → ${toName ?? '—'}`;
  else if (e.event_type === 'queue_transfer') label = `Mudança de fila`;
  else if (e.event_type === 'sla_acknowledged') { label = `SLA reconhecido`; detail = `por ${performer}`; }
  return { id: e.id, source: 'remote', type: e.event_type, at: e.created_at, label, detail };
}

function describeAudit(e: any): UnifiedEvent {
  let label = 'Evento de Outbound';
  let detail = e.status;
  
  if (e.event_type === 'send_attempt') {
    label = 'Tentativa de Envio';
    detail = `Tentativa #${e.attempt_number || 1}`;
  } else if (e.event_type === 'delivered') {
    label = 'Entregue com Sucesso';
    detail = 'Mensagem recebida pelo WhatsApp';
  } else if (e.event_type === 'failed') {
    label = 'Falha no Envio';
    detail = e.error_message || 'Erro desconhecido';
  }

  return { 
    id: e.id, 
    source: 'audit', 
    type: e.event_type, 
    at: e.created_at, 
    label, 
    detail 
  };
}

export function TicketHistorySheet({ contactId, open, onOpenChange }: TicketHistorySheetProps) {
  const { events: localEvents } = useTicketStatus(contactId);

  const { data: remote = [] } = useQuery<RemoteEvent[]>({
    queryKey: ['conversation-events', contactId],
    enabled: open && !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversation_events')
        .select('*')
        .eq('contact_id', contactId!)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as RemoteEvent[];
    },
  });

  const { data: auditLogs = [] } = useQuery({
    queryKey: ['conversation-audit-logs', contactId],
    enabled: open && !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversation_audit_logs')
        .select('*')
        .eq('conversation_id', contactId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return [];
      return data ?? [];
    },
  });

  const { data: profiles = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['team-profiles-names'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_team_profiles');
      if (error) throw error;
      return (data ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }));
    },
    staleTime: 60_000,
  });

  const nameMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of profiles) m[p.id] = p.name;
    return m;
  }, [profiles]);

  const unified = useMemo(() => {
    const all = [
      ...localEvents.map((e) => describeLocal(e, nameMap)),
      ...remote.map((e) => describeRemote(e, nameMap)),
      ...auditLogs.map((e) => describeAudit(e)),
    ];
    return all.sort((a, b) => +new Date(b.at) - +new Date(a.at));
  }, [localEvents, remote, auditLogs, nameMap]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Histórico do atendimento</SheetTitle>
          <SheetDescription>
            Mudanças de status, transferências e atribuições deste contato.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-8rem)] mt-4 -mx-6 px-6">
          {unified.length === 0 && (
            <div className="text-sm text-muted-foreground py-12 text-center">
              Nenhum evento registrado ainda.
            </div>
          )}
          <ol className="space-y-3 py-2">
            {unified.map((e) => {
              const Icon = ICONS[e.type] ?? Circle;
              return (
                <li key={`${e.source}-${e.id}`} className="flex gap-3">
                  <div className="mt-0.5">
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{e.label}</span>
                      <Badge variant="outline" className="text-[9px] uppercase">
                        {e.source === 'local' ? 'sessão' : e.source === 'remote' ? 'persistido' : 'auditoria'}
                      </Badge>
                    </div>
                    {e.detail && <p className="text-xs text-muted-foreground">{e.detail}</p>}
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                      {format(new Date(e.at), "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
