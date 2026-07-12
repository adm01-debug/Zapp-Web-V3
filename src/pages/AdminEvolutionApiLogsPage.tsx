/**
 * Admin: Evolution API call logs.
 * Reads from `evolution_retry_metrics` (Lovable Cloud) — captures every
 * outbound call to the Evolution API made by the `evolution-api` edge function:
 * action, method, instance, attempt count, http status, retry reasons, duration.
 *
 * NO sensitive payloads are stored or shown — only operational metadata.
 * Useful for diagnosing connection/disconnection failures, polling timeouts,
 * 401 auth issues and rate-limit spikes.
 */
import { useMemo, useState } from 'react';
import { DEFAULT_WHATSAPP_INSTANCE } from '@/lib/constants/whatsappInstances';
import { useQuery } from '@tanstack/react-query';
import { format, subHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Activity, RefreshCw, CheckCircle2, XCircle, Clock, Filter, Eye,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface RetryMetric {
  id: string;
  action: string;
  method: string;
  instance_name: string | null;
  attempt_count: number;
  final_status: 'success' | 'failed' | 'exhausted';
  final_http_status: number | null;
  retry_reasons: Array<{ attempt: number; reason: string; status?: number }>;
  total_duration_ms: number | null;
  created_at: string;
}

const RANGE_OPTIONS = [
  { value: '1', label: 'Última hora' },
  { value: '6', label: 'Últimas 6h' },
  { value: '24', label: 'Últimas 24h' },
  { value: '72', label: 'Últimos 3 dias' },
  { value: '168', label: 'Últimos 7 dias' },
] as const;

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'success', label: 'Sucesso' },
  { value: 'failed', label: 'Falhou' },
  { value: 'exhausted', label: 'Esgotou retries' },
] as const;

function formatDate(iso: string) {
  try { return format(new Date(iso), 'dd/MM HH:mm:ss', { locale: ptBR }); } catch { return iso; }
}

function formatDuration(ms: number | null) {
  if (ms == null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${ms}ms`;
}

function StatusBadge({ status, http }: { status: string; http: number | null }) {
  const isOk = status === 'success';
  const isAuth = http === 401 || http === 403;
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] gap-1',
        isOk && 'bg-success/10 text-success border-success/30',
        !isOk && isAuth && 'bg-warning/10 text-warning border-warning/30',
        !isOk && !isAuth && 'bg-destructive/10 text-destructive border-destructive/30',
      )}
    >
      {isOk ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {status}{http ? ` · ${http}` : ''}
    </Badge>
  );
}

export default function AdminEvolutionApiLogsPage() {
  const [hoursBack, setHoursBack] = useState<string>('6');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actionSearch, setActionSearch] = useState('');
  const [instanceFilter, setInstanceFilter] = useState('');
  const [selected, setSelected] = useState<RetryMetric | null>(null);

  const since = useMemo(() => subHours(new Date(), Number(hoursBack)).toISOString(), [hoursBack]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-evolution-api-logs', hoursBack, statusFilter, actionSearch, instanceFilter],
    queryFn: async () => {
      let q = supabase
        .from('evolution_retry_metrics')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(500);

      if (statusFilter !== 'all') q = q.eq('final_status', statusFilter);
      if (actionSearch.trim()) q = q.ilike('action', `%${actionSearch.trim()}%`);
      if (instanceFilter.trim()) q = q.eq('instance_name', instanceFilter.trim());

      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as RetryMetric[]) ?? [];
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const summary = useMemo(() => {
    const rows = data ?? [];
    const total = rows.length;
    const ok = rows.filter(r => r.final_status === 'success').length;
    const failed = rows.filter(r => r.final_status !== 'success').length;
    const auth = rows.filter(r => r.final_http_status === 401 || r.final_http_status === 403).length;
    const slow = rows.filter(r => (r.total_duration_ms ?? 0) >= 3000).length;
    const avg = total ? Math.round(rows.reduce((a, r) => a + (r.total_duration_ms ?? 0), 0) / total) : 0;
    return { total, ok, failed, auth, slow, avg };
  }, [data]);

  return (
    <div className="space-y-4 p-4 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            Logs Evolution API
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Eventos de polling, conexão e desconexão. Sem dados sensíveis — apenas metadata operacional.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn('w-4 h-4 mr-2', isFetching && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Total</div>
          <div className="text-2xl font-bold">{summary.total}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Sucesso</div>
          <div className="text-2xl font-bold text-success">{summary.ok}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Falhas</div>
          <div className="text-2xl font-bold text-destructive">{summary.failed}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Auth (401/403)</div>
          <div className="text-2xl font-bold text-warning">{summary.auth}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Latência média</div>
          <div className="text-2xl font-bold">{formatDuration(summary.avg)}</div>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Filter className="w-4 h-4" /> Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Período</label>
            <Select value={hoursBack} onValueChange={setHoursBack}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Ação (ex: status, connect)</label>
            <Input value={actionSearch} onChange={e => setActionSearch(e.target.value)} placeholder="Buscar action…" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Instância</label>
            <Input value={instanceFilter} onChange={e => setInstanceFilter(e.target.value)} placeholder={`ex: ${DEFAULT_WHATSAPP_INSTANCE}`} />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            Últimas chamadas {data ? `(${data.length})` : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Instância</TableHead>
                <TableHead className="text-center">Tentativas</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Duração</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Carregando…</TableCell></TableRow>
              )}
              {!isLoading && (data?.length ?? 0) === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhuma chamada registrada nesse intervalo.</TableCell></TableRow>
              )}
              {data?.map(row => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-xs">{formatDate(row.created_at)}</TableCell>
                  <TableCell className=" text-xs">{row.action}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{row.method}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.instance_name ?? '—'}</TableCell>
                  <TableCell className="text-center">
                    {row.attempt_count > 1
                      ? <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30">{row.attempt_count}×</Badge>
                      : <span className="text-xs text-muted-foreground">{row.attempt_count}</span>}
                  </TableCell>
                  <TableCell><StatusBadge status={row.final_status} http={row.final_http_status} /></TableCell>
                  <TableCell className="text-right text-xs whitespace-nowrap">
                    <span className={cn((row.total_duration_ms ?? 0) >= 3000 && 'text-warning font-medium')}>
                      <Clock className="w-3 h-3 inline mr-1" />
                      {formatDuration(row.total_duration_ms)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button aria-label="Ver detalhes do log" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelected(row)}>
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className=" text-base">{selected?.action}</DialogTitle>
            <DialogDescription>
              {selected && `${selected.method} · ${formatDate(selected.created_at)} · ${selected.instance_name ?? 'sem instância'}`}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-muted/40 rounded p-2">
                    <div className="text-[10px] text-muted-foreground uppercase">Status final</div>
                    <div className="mt-1"><StatusBadge status={selected.final_status} http={selected.final_http_status} /></div>
                  </div>
                  <div className="bg-muted/40 rounded p-2">
                    <div className="text-[10px] text-muted-foreground uppercase">Tentativas</div>
                    <div className="font-bold mt-1">{selected.attempt_count}</div>
                  </div>
                  <div className="bg-muted/40 rounded p-2">
                    <div className="text-[10px] text-muted-foreground uppercase">Duração</div>
                    <div className="font-bold mt-1">{formatDuration(selected.total_duration_ms)}</div>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold mb-1.5">Razões dos retries</div>
                  {selected.retry_reasons?.length
                    ? (
                      <div className="space-y-1.5">
                        {selected.retry_reasons.map((r) => (
                          <div key={r.attempt} className="text-xs bg-muted/30 rounded p-2  flex justify-between">
                            <span>Tentativa {r.attempt}: <strong>{r.reason}</strong></span>
                            {r.status && <Badge variant="outline" className="text-[10px]">HTTP {r.status}</Badge>}
                          </div>
                        ))}
                      </div>
                    )
                    : <div className="text-xs text-muted-foreground italic">Nenhum retry necessário.</div>}
                </div>
                <div className="text-[10px] text-muted-foreground border-t pt-2">
                  ID: <span className="">{selected.id}</span>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
