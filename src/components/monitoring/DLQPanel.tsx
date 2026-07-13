import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Inbox, RefreshCw, RotateCw, Ban, ChevronDown, ChevronRight, AlertOctagon, Clock, Loader2, ListChecks } from 'lucide-react';
import { GenericEmptyState } from '@/components/ui/GenericEmptyState';
import { useFailedMessages, type FailedMessageStatus } from '@/features/admin';
import { cn } from '@/lib/utils';

const HOUR_OPTIONS = [
  { value: 1, label: '1h' },
  { value: 24, label: '24h' },
  { value: 168, label: '7d' },
];

const STATUS_OPTIONS: Array<{ value: FailedMessageStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'retrying', label: 'Em retry' },
  { value: 'succeeded', label: 'Sucesso' },
  { value: 'abandoned', label: 'Abandonadas' },
];

function statusBadge(status: FailedMessageStatus) {
  switch (status) {
    case 'pending': return <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">pending</Badge>;
    case 'retrying': return <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">retrying</Badge>;
    case 'succeeded': return <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">succeeded</Badge>;
    case 'abandoned': return <Badge variant="destructive" className="text-[10px]">abandoned</Badge>;
  }
}

function deriveType(payload: Record<string, unknown>): string {
  const path = payload.__path;
  if (typeof path === 'string') {
    const parts = path.split('/').filter(Boolean);
    return parts[parts.length - 1] || 'message';
  }
  return 'message';
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function DLQPanel() {
  const [hours, setHours] = useState<number>(24);
  const [statusFilter, setStatusFilter] = useState<FailedMessageStatus | 'all'>('all');
  const [errorCodeFilter, setErrorCodeFilter] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const {
    rows,
    isLoading,
    refetch,
    aggregates,
    retryNow,
    abandon,
    triggerReprocess,
  } = useFailedMessages({
    hours,
    status: statusFilter === 'all' ? null : statusFilter,
    errorCode: errorCodeFilter,
  });

  const topReasons = aggregates.byErrorCode.slice(0, 3);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Inbox className="w-4 h-4" />Dead-Letter Queue (envios)
            </CardTitle>
            <CardDescription>
              Mensagens cuja entrega à Evolution falhou em erros transitórios — reprocessadas automaticamente.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => triggerReprocess.mutate()}
              disabled={triggerReprocess.isPending}
            >
              {triggerReprocess.isPending
                ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                : <ListChecks className="w-3.5 h-3.5 mr-1" />}
              Reprocessar agora
            </Button>
            <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Pendentes" value={aggregates.pending} icon={<Clock className="w-3.5 h-3.5 text-warning" />} />
          <KpiCard label="Em retry" value={aggregates.retrying} icon={<RotateCw className="w-3.5 h-3.5 text-primary" />} />
          <KpiCard label="Abandonadas" value={aggregates.abandoned24h} icon={<AlertOctagon className="w-3.5 h-3.5 text-destructive" />} />
          <KpiCard label="Sucesso pós-retry" value={`${aggregates.successAfterRetryRate}%`} icon={<ListChecks className="w-3.5 h-3.5 text-primary" />} />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Janela</span>
          {HOUR_OPTIONS.map(opt => (
            <Button
              key={opt.value}
              variant={hours === opt.value ? 'default' : 'outline'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setHours(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider ml-2">Status</span>
          {STATUS_OPTIONS.map(opt => (
            <Button
              key={opt.value}
              variant={statusFilter === opt.value ? 'default' : 'outline'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setStatusFilter(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>

        {/* Top reasons (clickable badges) */}
        {topReasons.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Top motivos</span>
            {topReasons.map((r) => {
              const isActive = errorCodeFilter === r.code;
              return (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => setErrorCodeFilter(isActive ? null : r.code)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]  transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/40 hover:bg-muted border-border',
                  )}
                  title={isActive ? 'Limpar filtro' : `Filtrar por ${r.code}`}
                >
                  {r.code}
                  <span className="opacity-70">·{r.count}</span>
                </button>
              );
            })}
            {errorCodeFilter && (
              <Button
                variant="ghost" size="sm" className="h-6 px-2 text-[10px]"
                onClick={() => setErrorCodeFilter(null)}
              >
                Limpar
              </Button>
            )}
          </div>
        )}

        {/* Table */}
        {rows.length === 0 ? (
          <GenericEmptyState
            icon={Inbox}
            title="Sem mensagens na fila"
            description="Nenhum envio entrou na DLQ no período selecionado. Tudo certo por aqui."
          />
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Instância</TableHead>
                  <TableHead>Destinatário</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-center">Tentativas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">HTTP</TableHead>
                  <TableHead>Erro</TableHead>
                  <TableHead>Última</TableHead>
                  <TableHead>Próxima</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => {
                  const isOpen = expandedId === row.id;
                  const canAct = row.status === 'pending' || row.status === 'retrying' || row.status === 'abandoned';
                  return (
                    <Collapsible key={row.id} open={isOpen} onOpenChange={(o) => setExpandedId(o ? row.id : null)} asChild>
                      <>
                        <TableRow>
                          <TableCell className="w-8 p-2">
                            <CollapsibleTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              </Button>
                            </CollapsibleTrigger>
                          </TableCell>
                          <TableCell className=" text-xs">{row.instance_name}</TableCell>
                          <TableCell className=" text-xs truncate max-w-[140px]" title={row.remote_jid ?? ''}>
                            {row.remote_jid ?? '—'}
                          </TableCell>
                          <TableCell className="text-xs">{deriveType(row.payload)}</TableCell>
                          <TableCell className="text-center text-xs">
                            {row.retry_count}/{row.max_retries}
                          </TableCell>
                          <TableCell>{statusBadge(row.status)}</TableCell>
                          <TableCell className="text-center text-xs ">
                            {row.http_status ?? '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-[180px]" title={row.error_message ?? ''}>
                            {row.error_code ? <Badge variant="outline" className="text-[10px] mr-1">{row.error_code}</Badge> : null}
                            {row.error_message ?? '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(row.last_attempt_at)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(row.next_attempt_at)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost" size="sm" className="h-7 px-2 text-xs"
                                disabled={!canAct || row.status === 'succeeded' || retryNow.isPending}
                                onClick={() => retryNow.mutate(row.id)}
                                title="Forçar reprocessamento agora"
                              >
                                <RotateCw className="w-3 h-3 mr-1" />Retry
                              </Button>
                              <Button
                                variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                                disabled={row.status === 'abandoned' || row.status === 'succeeded' || abandon.isPending}
                                onClick={() => abandon.mutate(row.id)}
                                title="Abandonar definitivamente"
                              >
                                <Ban className="w-3 h-3 mr-1" />Abandonar
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        <CollapsibleContent asChild>
                          <TableRow>
                            <TableCell colSpan={11} className="bg-muted/30 p-3">
                              <div className="grid md:grid-cols-2 gap-3">
                                <div>
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Payload</p>
                                  <pre className="text-[10px]  bg-background border rounded p-2 max-h-48 overflow-auto">
                                    {JSON.stringify(row.payload, null, 2)}
                                  </pre>
                                </div>
                                <div>
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Erro completo</p>
                                  <pre className="text-[10px]  bg-background border rounded p-2 max-h-48 overflow-auto whitespace-pre-wrap">
                                    {row.error_message ?? '—'}
                                  </pre>
                                  <p className="text-[10px] text-muted-foreground mt-2">
                                    Criado em {fmtDate(row.created_at)} · ID <span className="">{row.id}</span>
                                  </p>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
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

function KpiCard({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}
