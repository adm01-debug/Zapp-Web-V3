import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Sidebar } from '@/components/layout/Sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { Bug, Search, RefreshCw, Trash2, Activity, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getAllSendStatusHistory,
  subscribeSendStatusHistory,
  clearSendStatusHistory,
  type SendStatusHistoryEntry,
  type SendUIStatus,
} from '@/features/inbox';

interface MessageGroup {
  messageId: string;
  contactId: string | null;
  entries: SendStatusHistoryEntry[];
  lastUpdatedAt: number;
}

interface ConversationGroup {
  contactId: string;
  messages: MessageGroup[];
  lastUpdatedAt: number;
  totalEvents: number;
}

const STATUS_STYLES: Record<SendUIStatus, { label: string; className: string }> = {
  sending:        { label: 'Enviando',          className: 'bg-primary/15 text-primary border-primary/30' },
  retrying:       { label: 'Tentando reenviar', className: 'bg-warning/15 text-warning border-warning/30' },
  sent:           { label: 'Enviado',           className: 'bg-success/15 text-success border-success/30' },
  failed:         { label: 'Falha',             className: 'bg-destructive/15 text-destructive border-destructive/30' },
  failed_auth:    { label: 'Falha (auth)',      className: 'bg-destructive/15 text-destructive border-destructive/30' },
  failed_retries: { label: 'Falha (retries)',   className: 'bg-destructive/15 text-destructive border-destructive/30' },
};

const NO_CONTACT = '__no-contact__';

function formatDelta(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `+${ms}ms`;
  if (ms < 60_000) return `+${(ms / 1000).toFixed(1)}s`;
  return `+${(ms / 60_000).toFixed(1)}min`;
}

function buildGroups(snapshot: Record<string, SendStatusHistoryEntry[]>): ConversationGroup[] {
  const byContact = new Map<string, MessageGroup[]>();

  for (const [messageId, entries] of Object.entries(snapshot)) {
    if (!entries.length) continue;
    const contactId = entries[entries.length - 1]?.contactId ?? NO_CONTACT;
    const lastUpdatedAt = entries[entries.length - 1].updatedAt;
    const group: MessageGroup = { messageId, contactId, entries, lastUpdatedAt };
    const bucket = byContact.get(contactId) ?? [];
    bucket.push(group);
    byContact.set(contactId, bucket);
  }

  return Array.from(byContact.entries())
    .map(([contactId, messages]) => {
      const sortedMessages = messages.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
      const totalEvents = sortedMessages.reduce((sum, m) => sum + m.entries.length, 0);
      return {
        contactId,
        messages: sortedMessages,
        lastUpdatedAt: sortedMessages[0]?.lastUpdatedAt ?? 0,
        totalEvents,
      };
    })
    .sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
}

function HistoryEntryRow({ entry }: { entry: SendStatusHistoryEntry }) {
  const style = STATUS_STYLES[entry.status];
  return (
    <li className="flex items-start gap-3 py-1.5 text-xs">
      <span className=" text-[10px] text-muted-foreground w-[88px] shrink-0 mt-0.5">
        {format(new Date(entry.updatedAt), 'HH:mm:ss.SSS', { locale: ptBR })}
      </span>
      <Badge
        variant="outline"
        className={cn('text-[10px] h-5 px-1.5 font-medium border shrink-0', style.className)}
      >
        {style.label}
      </Badge>
      <span className="text-[10px] text-muted-foreground shrink-0 w-14">
        {formatDelta(entry.deltaMs)}
      </span>
      <div className="flex-1 min-w-0 text-[11px] text-muted-foreground">
        {typeof entry.attempt === 'number' && (
          <span className="text-foreground/80">
            tentativa {entry.attempt}
            {typeof entry.totalRetries === 'number' && `/${entry.totalRetries}`}
          </span>
        )}
        {entry.errorCode !== undefined && (
          <span className="ml-2">
            código: <code className="text-destructive">{String(entry.errorCode)}</code>
          </span>
        )}
        {entry.errorReason && (
          <span className="ml-2 truncate inline-block max-w-full align-bottom">
            · {entry.errorReason}
          </span>
        )}
        {entry.source && (
          <span className="ml-2 text-foreground/40">[{entry.source}]</span>
        )}
      </div>
    </li>
  );
}

function MessageBlock({ message }: { message: MessageGroup }) {
  const lastStatus = message.entries[message.entries.length - 1].status;
  const firstAt = message.entries[0].updatedAt;
  const totalMs = message.lastUpdatedAt - firstAt;
  const style = STATUS_STYLES[lastStatus];
  return (
    <div className="rounded-md border border-border/60 bg-card p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <MessageSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <code className="text-[11px] text-foreground/80 truncate">{message.messageId}</code>
        <Badge variant="outline" className={cn('text-[10px] h-5 px-1.5 ml-auto', style.className)}>
          {style.label}
        </Badge>
        <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
          {message.entries.length} {message.entries.length === 1 ? 'evento' : 'eventos'}
        </Badge>
        {totalMs > 0 && (
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
            duração total: {formatDelta(totalMs)}
          </Badge>
        )}
      </div>
      <ul className="space-y-0.5">
        {message.entries.map((entry, i) => (
          <HistoryEntryRow key={`${entry.updatedAt}-${i}`} entry={entry} />
        ))}
      </ul>
    </div>
  );
}

/** Send Status Bus Debug. */
export default function SendStatusBusDebug() {
  const [snapshot, setSnapshot] = useState<Record<string, SendStatusHistoryEntry[]>>(
    () => getAllSendStatusHistory(),
  );
  const [search, setSearch] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [tick, setTick] = useState(0);
  const [currentView, setCurrentView] = useState('debug-send-status');

  // Live subscribe to new entries.
  useEffect(() => {
    if (!autoRefresh) return;
    const unsub = subscribeSendStatusHistory(() => {
      setSnapshot(getAllSendStatusHistory());
    });
    return unsub;
  }, [autoRefresh]);

  // Periodic refresh as a safety net (in case of dropped subscriptions).
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => setSnapshot(getAllSendStatusHistory()), 2000);
    return () => clearInterval(id);
  }, [autoRefresh, tick]);

  const groups = useMemo(() => {
    const all = buildGroups(snapshot);
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all
      .map((g) => ({
        ...g,
        messages: g.messages.filter((m) => {
          if (m.messageId.toLowerCase().includes(q)) return true;
          if ((m.contactId ?? '').toLowerCase().includes(q)) return true;
          return m.entries.some(
            (e) =>
              e.status.toLowerCase().includes(q) ||
              (e.errorReason ?? '').toLowerCase().includes(q) ||
              String(e.errorCode ?? '').toLowerCase().includes(q),
          );
        }),
      }))
      .filter((g) => g.messages.length > 0);
  }, [snapshot, search]);

  const totalMessages = Object.keys(snapshot).length;
  const totalEvents = Object.values(snapshot).reduce((sum, e) => sum + e.length, 0);

  const handleClear = () => {
    clearSendStatusHistory();
    setSnapshot({});
  };

  const handleManualRefresh = () => {
    setSnapshot(getAllSendStatusHistory());
    setTick((t) => t + 1);
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6 space-y-6">
          <header className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Bug className="w-6 h-6 text-primary" />
                Debug · sendStatusBus
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Histórico em memória das transições de status emitidas pelo bus de envio.
                Agrupado por conversa e mensagem, com deltas de tempo entre eventos.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="auto-refresh"
                  checked={autoRefresh}
                  onCheckedChange={setAutoRefresh}
                />
                <Label htmlFor="auto-refresh" className="text-xs">Auto-atualizar</Label>
              </div>
              <Button variant="outline" size="sm" onClick={handleManualRefresh} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Atualizar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClear}
                className="gap-2 text-destructive hover:text-destructive"
                disabled={totalMessages === 0}
              >
                <Trash2 className="w-4 h-4" />
                Limpar
              </Button>
            </div>
          </header>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  Filtros
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {totalMessages} {totalMessages === 1 ? 'mensagem' : 'mensagens'}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {totalEvents} {totalEvents === 1 ? 'evento' : 'eventos'}
                  </Badge>
                </div>
              </CardTitle>
              <CardDescription>
                Busque por ID da mensagem, ID do contato, status ou texto do erro.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar..."
                  className="pl-9"
                  aria-label="Buscar no histórico do bus"
                />
              </div>
            </CardContent>
          </Card>

          {groups.length === 0 ? (
            <GenericEmptyState
              icon={Bug}
              title={search ? 'Nenhum evento corresponde à busca' : 'Nenhum evento capturado ainda'}
              description={
                search
                  ? 'Ajuste a busca ou limpe o campo para ver todos os eventos.'
                  : 'Quando uma mensagem for enviada, suas transições de status aparecerão aqui.'
              }
              className="py-10"
            />
          ) : (
            <div className="space-y-4">
              {groups.map((group) => (
                <Card key={group.contactId}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
                      <span className="text-foreground">
                        Conversa:{' '}
                        <code className="text-xs">
                          {group.contactId === NO_CONTACT ? 'sem contactId' : group.contactId}
                        </code>
                      </span>
                      <Badge variant="secondary" className="text-[10px] ml-auto">
                        {group.messages.length} {group.messages.length === 1 ? 'mensagem' : 'mensagens'}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {group.totalEvents} eventos
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {group.messages.map((msg) => (
                      <MessageBlock key={msg.messageId} message={msg} />
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
