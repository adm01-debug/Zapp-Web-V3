/**
 * Visualização "Por Call" — agrupa eventos por call_id e mostra
 * timelines consolidadas por instância.
 */
import { useMemo, useState } from 'react';
import { PhoneCall, Phone, AlertTriangle, Clock, Activity } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EvolutionWebhookEvent } from '@/types/evolutionExternal';
import { formatDateTimeCompact } from '@/lib/formatters';
import {
  groupEventsByCall,
  formatDuration,
  type CallTimelineGroup,
  type CallTimelineEntry,
} from './callCorrelation';

interface Props {
  events: EvolutionWebhookEvent[];
}

function shortJid(jid: string | null): string {
  if (!jid) return '—';
  return jid.replace('@s.whatsapp.net', '').replace('@g.us', ' (grupo)');
}

function statusTone(status: string | null): string {
  if (!status) return 'text-muted-foreground';
  const s = status.toLowerCase();
  if (s.includes('terminate') || s.includes('reject') || s.includes('miss'))
    return 'text-destructive';
  if (s.includes('accept') || s.includes('answer')) return 'text-success';
  if (s.includes('offer') || s.includes('ring')) return 'text-warning';
  return 'text-primary';
}

export function CallCorrelationView({ events }: Props) {
  const groupsByInstance = useMemo(() => {
    const all = groupEventsByCall(events);
    const byInstance = new Map<string, CallTimelineGroup[]>();
    for (const g of all) {
      const list = byInstance.get(g.instance) ?? [];
      list.push(g);
      byInstance.set(g.instance, list);
    }
    return [...byInstance.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [events]);

  const totalCalls = useMemo(
    () => groupsByInstance.reduce((sum, [, list]) => sum + list.length, 0),
    [groupsByInstance]
  );

  if (totalCalls === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <PhoneCall className="mx-auto mb-2 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Nenhuma chamada com <code>call_id</code> identificável no período/filtros.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Eventos do tipo <code>CALL</code> ou que tragam <code>callId</code>/
            <code>sip.callId</code> no payload aparecerão aqui agrupados.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="text-xs text-muted-foreground">Chamadas correlacionadas</p>
            <p className="mt-1 text-2xl font-bold">{totalCalls}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              em {groupsByInstance.length} instância{groupsByInstance.length === 1 ? '' : 's'}
            </p>
          </div>
          <PhoneCall className="h-8 w-8 text-primary opacity-70" />
        </CardContent>
      </Card>

      {groupsByInstance.map(([instance, calls]) => (
        <InstanceCallsBlock key={instance} instance={instance} calls={calls} />
      ))}
    </div>
  );
}

function InstanceCallsBlock({ instance, calls }: { instance: string; calls: CallTimelineGroup[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Phone className="h-4 w-4 text-primary" />
          <span className="">{instance}</span>
          <Badge variant="outline" className="ml-2 text-xs">
            {calls.length} chamada{calls.length === 1 ? '' : 's'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-[500px]">
          <div className="divide-y">
            {calls.map((call) => (
              <CallTimelineRow key={`${call.instance}-${call.callId}`} call={call} />
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function CallTimelineRow({ call }: { call: CallTimelineGroup }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="max-w-[260px] truncate rounded bg-muted px-2 py-0.5 text-xs">
              {call.callId}
            </code>
            {call.finalStatus && (
              <Badge variant="outline" className={cn('text-xs', statusTone(call.finalStatus))}>
                {call.finalStatus}
              </Badge>
            )}
            {call.errorCount > 0 && (
              <Badge variant="destructive" className="gap-1 text-xs">
                <AlertTriangle className="h-3 w-3" />
                {call.errorCount} erro{call.errorCount === 1 ? '' : 's'}
              </Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="">{shortJid(call.remoteJid)}</span>
            {call.pushName && <span>· {call.pushName}</span>}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(call.durationMs)}
            </span>
            <span className="flex items-center gap-1">
              <Activity className="h-3 w-3" />
              {call.totalEvents} evento{call.totalEvents === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Ocultar timeline' : 'Ver timeline'}
        </Button>
      </div>

      {expanded && (
        <ol className="relative ml-2 space-y-2 border-l border-border pl-4">
          {call.events.map((entry) => (
            <TimelineNode key={entry.id} entry={entry} startedAt={call.firstAt} />
          ))}
        </ol>
      )}
    </div>
  );
}

function TimelineNode({ entry, startedAt }: { entry: CallTimelineEntry; startedAt: string }) {
  const offsetMs = new Date(entry.createdAt).getTime() - new Date(startedAt).getTime();
  const offset = offsetMs <= 0 ? 't0' : `+${formatDuration(offsetMs)}`;

  return (
    <li className="relative">
      <span
        aria-label={entry.errorMessage ? 'Erro' : entry.processed ? 'Processado' : 'Pendente'}
        className={cn(
          'absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background',
          entry.errorMessage
            ? 'bg-destructive'
            : entry.processed
              ? 'bg-success'
              : 'bg-muted-foreground'
        )}
      />
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline" className="text-[10px]">
          {entry.eventType}
        </Badge>
        {entry.status && (
          <span className={cn('font-medium', statusTone(entry.status))}>{entry.status}</span>
        )}
        <span className="text-muted-foreground">{formatDateTimeCompact(entry.createdAt)}</span>
        <span className="text-muted-foreground">· {offset}</span>
      </div>
      {entry.errorMessage && (
        <p className="mt-1 break-all text-[11px] text-destructive">{entry.errorMessage}</p>
      )}
    </li>
  );
}
