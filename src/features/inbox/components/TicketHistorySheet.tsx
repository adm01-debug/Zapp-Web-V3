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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, Circle, UserCheck, UserMinus, UserPlus, Wand2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTicketStatus } from '@/features/inbox';
import type { TicketEvent } from '@/lib/inbox/ticketStore';
import { conversationEventRowSchema, safeParseEvent } from '@/shared/webhookEventSchemas';
import { getLogger } from '@/lib/logger';

const log = getLogger('TicketHistorySheet');

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
  else if (e.event_type === 'transfer')
    label = `Transferido: ${fromName ?? '—'} → ${toName ?? '—'}`;
  else if (e.event_type === 'queue_transfer') label = `Mudança de fila`;
  else if (e.event_type === 'sla_acknowledged') {
    label = `SLA reconhecido`;
    detail = `por ${performer}`;
  }
  return { id: e.id, source: 'remote', type: e.event_type, at: e.created_at, label, detail };
}

interface AuditLogRow {
  id: string;
  created_at: string;
  details?: Record<string, unknown> | null;
  action?: string | null;
  event_type?: string | null;
  status?: string | null;
  error_message?: string | null;
  attempt_number?: number | null;
}

function describeAudit(e: AuditLogRow): UnifiedEvent {
  // Após migração: linhas de `audit_logs` (entity_type='conversation')
  // guardam o antigo `event_type/status/error_message/attempt_number` dentro
  // de `details`. Retrocompatível com o shape antigo `conversation_audit_logs`.
  const details = (e.details ?? {}) as Record<string, unknown>;
  const action: string = e.action ?? e.event_type ?? 'audit';
  const status: string | undefined =
    (typeof details.status === 'string' ? details.status : undefined) ?? e.status ?? undefined;
  const errorMessage: string | undefined =
    (typeof details.error_message === 'string' ? details.error_message : undefined) ??
    e.error_message ??
    undefined;
  const attemptNumber: number | undefined =
    (typeof details.attempt_number === 'number' ? details.attempt_number : undefined) ??
    e.attempt_number ??
    undefined;

  let label = 'Evento de Outbound';
  let detail = status;

  if (action === 'send_attempt') {
    label = 'Tentativa de Envio';
    detail = `Tentativa #${attemptNumber || 1}`;
  } else if (action === 'delivered') {
    label = 'Entregue com Sucesso';
    detail = 'Mensagem recebida pelo WhatsApp';
  } else if (action === 'failed') {
    label = 'Falha no Envio';
    detail = errorMessage || 'Erro desconhecido';
  }

  return {
    id: e.id,
    source: 'audit',
    type: action,
    at: e.created_at,
    label,
    detail,
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
      const rows = Array.isArray(data) ? data : [];
      const valid: RemoteEvent[] = [];
      for (const row of rows) {
        const parsed = safeParseEvent(conversationEventRowSchema, row);
        if (!parsed.ok) {
          log.warn('conversation_events row rejeitada', parsed.error);
          continue;
        }
        valid.push(row as RemoteEvent);
      }
      return valid;
    },
  });

  const { data: auditLogs = [] } = useQuery({
    queryKey: ['conversation-audit-logs', contactId],
    enabled: open && !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('entity_type', 'conversation')
        .eq('entity_id', contactId!)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return [];
      return data ?? [];
    },
  });

  type TeamProfile = { id: string; name: string };
  const { data: profiles = [] } = useQuery<TeamProfile[]>({
    queryKey: ['team-profiles-names'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_team_profiles');
      if (error) throw error;
      return (data ?? []).map((p: TeamProfile) => ({ id: p.id, name: p.name }));
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
        <ScrollArea className="-mx-6 mt-4 h-[calc(100vh-8rem)] px-6">
          {unified.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhum evento registrado ainda.
            </div>
          )}
          <ol className="space-y-3 py-2">
            {unified.map((e) => {
              const Icon = ICONS[e.type] ?? Circle;
              return (
                <li key={`${e.source}-${e.id}`} className="flex gap-3">
                  <div className="mt-0.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{e.label}</span>
                      <Badge variant="outline" className="text-[9px] uppercase">
                        {e.source === 'local'
                          ? 'sessão'
                          : e.source === 'remote'
                            ? 'persistido'
                            : 'auditoria'}
                      </Badge>
                    </div>
                    {e.detail && <p className="text-xs text-muted-foreground">{e.detail}</p>}
                    <p className="mt-0.5 text-[11px] text-muted-foreground/70">
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
