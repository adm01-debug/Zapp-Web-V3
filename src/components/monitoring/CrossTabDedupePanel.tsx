import { useEffect, useState, useSyncExternalStore } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { Layers, Crown, Users, AlertTriangle, RefreshCw } from 'lucide-react';
import {
  getDedupeSnapshot,
  subscribeDedupeEvents,
  type DedupeOutcome,
} from '@/lib/dedupeMetrics';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 1) return 'agora';
  if (s < 60) return `${s}s atrás`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m atrás`;
  const h = Math.floor(m / 60);
  return `${h}h atrás`;
}

function outcomeMeta(o: DedupeOutcome): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode } {
  switch (o) {
    case 'leader':
      return { label: 'Leader', variant: 'default', icon: <Crown className="w-3 h-3 mr-1" /> };
    case 'follower-replay':
      return { label: 'Follower (replay)', variant: 'secondary', icon: <Users className="w-3 h-3 mr-1" /> };
    case 'follower-fallback':
      return { label: 'Follower (fallback)', variant: 'destructive', icon: <AlertTriangle className="w-3 h-3 mr-1" /> };
  }
}

function shortKey(k: string): string {
  if (k.length <= 38) return k;
  return `${k.slice(0, 24)}…${k.slice(-10)}`;
}

/** Cross Tab Dedupe Panel component for the monitoring section. */
export function CrossTabDedupePanel() {
  // useSyncExternalStore keeps the panel reactive to the in-memory event bus.
  const snapshot = useSyncExternalStore(
    (cb) => subscribeDedupeEvents(cb),
    () => getDedupeSnapshot(),
    () => getDedupeSnapshot(),
  );

  // Re-render every 10s to refresh "X seconds ago" labels.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  const { events, counters } = snapshot;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="w-4 h-4" />
          Dedupe entre abas
          {counters.saved > 0 && (
            <Badge variant="secondary" className="ml-auto">
              {counters.saved} chamada{counters.saved === 1 ? '' : 's'} economizada{counters.saved === 1 ? '' : 's'}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Mostra quando uma requisição foi colapsada entre múltiplas abas do mesmo agente.
          Apenas a aba <span className="font-medium">leader</span> chama o backend; as outras
          replicam a resposta via BroadcastChannel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total" value={counters.total} />
          <StatCard label="Leader" value={counters.leader} accent="primary" />
          <StatCard label="Follower (replay)" value={counters.followerReplay} accent="secondary" />
          <StatCard label="Follower (fallback)" value={counters.followerFallback} accent="destructive" />
        </div>

        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">Eventos recentes</h4>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTick((n) => n + 1)}
            aria-label="Atualizar lista"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Atualizar
          </Button>
        </div>

        {events.length === 0 ? (
          <GenericEmptyState
            icon={Layers}
            title="Nenhum evento ainda"
            description="Ações deduplicadas entre abas aparecerão aqui em tempo real."
          />
        ) : (
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Quando</TableHead>
                  <TableHead className="w-[200px]">Outcome</TableHead>
                  <TableHead>Chave</TableHead>
                  <TableHead className="w-[80px] text-right">ms</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((ev) => {
                  const meta = outcomeMeta(ev.outcome);
                  return (
                    <TableRow key={ev.id} data-testid={`dedupe-event-${ev.outcome}`}>
                      <TableCell className="text-xs text-muted-foreground">
                        {timeAgo(ev.at)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={meta.variant} className="font-normal">
                          {meta.icon}
                          {meta.label}
                          {!ev.ok && <span className="ml-1">·err</span>}
                        </Badge>
                      </TableCell>
                      <TableCell className=" text-xs">{shortKey(ev.key)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">
                        {ev.durationMs}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: 'primary' | 'secondary' | 'destructive';
}) {
  const accentClass =
    accent === 'primary'
      ? 'text-primary'
      : accent === 'destructive'
        ? 'text-destructive'
        : accent === 'secondary'
          ? 'text-secondary-foreground'
          : 'text-foreground';
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums ${accentClass}`}>{value}</div>
    </div>
  );
}
