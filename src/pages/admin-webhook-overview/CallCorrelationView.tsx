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
  if (s.includes('terminate') || s.includes('reject') || s.includes('miss')) return 'text-destructive';
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
    [groupsByInstance],
  );

  if (totalCalls === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <PhoneCall className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Nenhuma chamada com <code>call_id</code> identificável no período/filtros.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Eventos do tipo <code>CALL</code> ou que tragam <code>callId</code>/<code>sip.callId</code>{' '}
            no payload aparecerão aqui agrupados.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Chamadas correlacionadas</p>
            <p className="text-2xl font-bold mt-1">{totalCalls}</p>
            <p className="text-xs text-muted-foreground mt-1">
              em {groupsByInstance.length} instância{groupsByInstance.length === 1 ? '' : 's'}
            </p>
          </div>
          <PhoneCall className="h-8 w-8 opacity-70 text-primary" />
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
        <CardTitle className="text-sm font-medium flex items-center gap-2">
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
    <div className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-xs  bg-muted px-2 py-0.5 rounded truncate max-w-[260px]">
              {call.callId}
            </code>
            {call.finalStatus && (
              <Badge variant="outline" className={cn('text-xs', statusTone(call.finalStatus))}>
                {call.finalStatus}
              </Badge>
            )}
            {call.errorCount > 0 && (
              <Badge variant="destructive" className="text-xs gap-1">
                <AlertTriangle className="h-3 w-3" />
                {call.errorCount} erro{call.errorCount === 1 ? '' : 's'}
              </Badge>
            )}
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Ocultar timeline' : 'Ver timeline'}
        </Button>
      </div>

      {expanded && (
        <ol className="relative border-l border-border ml-2 pl-4 space-y-2">
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
              : 'bg-muted-foreground',
        )}
      />
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <Badge variant="outline" className=" text-[10px]">
          {entry.eventType}
        </Badge>
        {entry.status && (
          <span className={cn('font-medium', statusTone(entry.status))}>{entry.status}</span>
        )}
        <span className="text-muted-foreground">{formatDateTimeCompact(entry.createdAt)}</span>
        <span className="text-muted-foreground">· {offset}</span>
      </div>
      {entry.errorMessage && (
        <p className="mt-1 text-[11px] text-destructive break-all">{entry.errorMessage}</p>
      )}
    </li>
  );
}
