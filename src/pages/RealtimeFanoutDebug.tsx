import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Trash2, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import {
  subscribeFanoutBus,
  getFanoutSubscriptions,
  getFanoutLastEvents,
  getFanoutRecentEvents,
  clearFanoutHistory,
} from '@/lib/devRealtimeLogger';

/**
 * The 8 known consumers of postgres_changes on `messages`.
 * Source of truth: TRILHA_MENSAGENS_NAVEGAVEL.mmd (subgraph "Realtime e Batching"
 * + AudioMessagePlayer in "Render"). Kept here so the panel always shows the
 * full fan-out, even before any of them mounts in the current session.
 */
const KNOWN_CONSUMERS: { name: string; description: string; events: string[] }[] = [
  {
    name: 'useRealtimeMessages',
    description: 'Feed global do inbox',
    events: ['INSERT', 'UPDATE'],
  },
  {
    name: 'useMessages',
    description: 'Lista por contato aberto',
    events: ['INSERT', 'UPDATE', 'DELETE'],
  },
  { name: 'useMessageStatus', description: 'Status sent/delivered/read', events: ['UPDATE'] },
  {
    name: 'useTranscriptionNotifications',
    description: 'Alerta quando transcrição conclui',
    events: ['UPDATE'],
  },
  { name: 'useRealtimeDashboard', description: 'KPIs em tempo real', events: ['INSERT', 'UPDATE'] },
  { name: 'useEvolutionMonitoring', description: 'Saúde do webhook/instância', events: ['INSERT'] },
  { name: 'AudioMessagePlayer', description: 'Refresh de media_url assinada', events: ['UPDATE'] },
  {
    name: 'useMessageUpdateBatcher',
    description: 'Batching upstream de useRealtimeMessages',
    events: ['batched'],
  },
];

function relativeTime(ts: number | undefined | null): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 1000) return 'agora';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s atrás`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}min atrás`;
  return `${Math.floor(diff / 3_600_000)}h atrás`;
}

function eventBadgeVariant(evt: string): { className: string; label: string } {
  const upper = evt.toUpperCase();
  if (upper.startsWith('INSERT'))
    return { className: 'bg-primary/15 text-primary dark:text-primary', label: 'INSERT' };
  if (upper.startsWith('UPDATE'))
    return {
      className: 'bg-warning/15 text-warning-foreground dark:text-warning-foreground',
      label: 'UPDATE',
    };
  if (upper.startsWith('DELETE'))
    return { className: 'bg-destructive/15 text-destructive', label: 'DELETE' };
  return { className: 'bg-muted text-muted-foreground', label: upper };
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return (
    d.toLocaleTimeString('pt-BR', { hour12: false }) +
    '.' +
    String(d.getMilliseconds()).padStart(3, '0')
  );
}

export default function RealtimeFanoutDebug() {
  const [, force] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Re-render whenever the bus notifies
  useEffect(() => {
    const unsub = subscribeFanoutBus(() => force((n) => n + 1));
    return unsub;
  }, []);

  // Tick every 1s so "X s atrás" stays fresh
  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [autoRefresh]);

  // Re-derive on every render (bus mutations are by reference, but we want fresh snapshots)
  const liveSubs = getFanoutSubscriptions();
  const liveLast = getFanoutLastEvents();
  const liveRecent = getFanoutRecentEvents();

  const consumers = KNOWN_CONSUMERS.map((c) => {
    const sub = liveSubs.find((s) => s.hookName === c.name);
    const last = liveLast.get(c.name);
    return { ...c, sub, last };
  });

  const totalSubs = liveSubs.length;
  const totalEvents = liveRecent.length;
  const activeConsumers = consumers.filter((c) => c.sub).length;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card">
        <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-4">
          <div className="flex items-center gap-3">
            <Link to="/" aria-label="Voltar">
              <Button aria-label="Voltar" variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="flex items-center gap-2 text-lg font-semibold">
                <Radio className="h-4 w-4 text-primary" /> Realtime Fan-out — debug
              </h1>
              <p className="text-xs text-muted-foreground">
                {activeConsumers}/{KNOWN_CONSUMERS.length} consumidores ativos · {totalSubs}{' '}
                subscriptions · {totalEvents} eventos recentes
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={autoRefresh ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setAutoRefresh((v) => !v)}
            >
              <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', autoRefresh && 'animate-spin')} />
              Auto-refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => clearFanoutHistory()}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Limpar
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto grid gap-6 px-4 py-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Consumidores de postgres_changes (messages)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {consumers.map((c) => {
              const isActive = !!c.sub;
              const last = c.last;
              return (
                <div
                  key={c.name}
                  className={cn(
                    'flex items-start justify-between gap-3 rounded-lg border p-3 transition-colors',
                    isActive ? 'border-border' : 'border-dashed border-border/60 bg-muted/20'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'text-sm font-semibold',
                          !isActive && 'text-muted-foreground'
                        )}
                      >
                        {c.name}
                      </span>
                      {c.events.map((e) => {
                        const v = eventBadgeVariant(e);
                        return (
                          <Badge
                            key={e}
                            variant="outline"
                            className={cn('h-4 px-1.5 py-0 text-[10px]', v.className)}
                          >
                            {v.label}
                          </Badge>
                        );
                      })}
                      {isActive ? (
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                          subscrito
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="h-4 px-1.5 text-[10px] text-muted-foreground"
                        >
                          não montado
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{c.description}</p>
                    {c.sub?.bind.filter && (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
                        filter: {c.sub.bind.filter}
                      </p>
                    )}
                  </div>
                  <div className="whitespace-nowrap text-right text-xs">
                    {last ? (
                      <>
                        <div className="flex items-center justify-end gap-1.5">
                          <Badge
                            variant="outline"
                            className={cn(
                              'h-4 px-1.5 text-[10px]',
                              eventBadgeVariant(last.eventType).className
                            )}
                          >
                            {eventBadgeVariant(last.eventType).label}
                          </Badge>
                          <span className="text-muted-foreground">
                            {relativeTime(last.receivedAt)}
                          </span>
                        </div>
                        <div className="mt-0.5 max-w-[180px] truncate text-[10px] text-muted-foreground/80">
                          id={last.rowId ?? '—'}
                        </div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">sem eventos</span>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Eventos recentes (50 últimos)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[600px]">
              <div className="divide-y divide-border">
                {liveRecent.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Nenhum evento recebido ainda. Interaja com o inbox para gerar tráfego.
                  </div>
                ) : (
                  liveRecent.map((ev, i) => {
                    const v = eventBadgeVariant(ev.eventType);
                    return (
                      <div
                        key={`${ev.receivedAt}-${i}`}
                        className="flex items-center gap-2 px-3 py-2 text-xs"
                      >
                        <span className="tabular-nums text-muted-foreground">
                          {formatTime(ev.receivedAt)}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn('h-4 px-1.5 text-[10px]', v.className)}
                        >
                          {v.label}
                        </Badge>
                        <span className="flex-1 truncate font-semibold text-primary">
                          {ev.hookName}
                        </span>
                        <span className="max-w-[120px] truncate text-muted-foreground/80">
                          id={ev.rowId ?? '—'}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
