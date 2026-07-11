// @ts-nocheck
/**
 * Admin: Histórico de Alertas.
 * Reads `warroom_alerts` (Lovable Cloud) — already populated by the war-room
 * monitoring pipeline (response delays, SLA breaches, connection drops, etc.).
 * Admin/supervisor only via existing RLS.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, subHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Bell,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Filter,
  CheckCheck,
  Radio,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AlertInstanceDetailDialog } from '@/features/admin';
import { formatDateTimeCompact } from '@/lib/formatters';

interface AlertRow {
  id: string;
  alert_type: string;
  title: string;
  message: string;
  source: string | null;
  is_read: boolean | null;
  resolved_at: string | null;
  resolved_reason: string | null;
  created_at: string;
}

const RANGES = [
  { value: '6', label: 'Últimas 6h' },
  { value: '24', label: 'Últimas 24h' },
  { value: '72', label: 'Últimos 3 dias' },
  { value: '168', label: 'Últimos 7 dias' },
  { value: '720', label: 'Últimos 30 dias' },
] as const;

const STATUS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'resolved', label: 'Resolvidos' },
] as const;

function TypeBadge({ type }: { type: string }) {
  const lower = type.toLowerCase();
  const isCritical = lower.includes('critical') || lower === 'error';
  const isWarning = lower.includes('warn');
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 text-[10px]',
        isCritical && 'border-destructive/30 bg-destructive/10 text-destructive',
        isWarning && 'border-warning/30 bg-warning/10 text-warning',
        !isCritical && !isWarning && 'bg-muted text-muted-foreground'
      )}
    >
      {isCritical ? <AlertCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {type}
    </Badge>
  );
}

export default function AdminAlertHistoryPage() {
  const [hoursBack, setHoursBack] = useState<string>('24');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [instanceFilter, setInstanceFilter] = useState('');
  const [detailInstance, setDetailInstance] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'offline'>(
    'connecting'
  );
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);

  const since = useMemo(() => subHours(new Date(), Number(hoursBack)).toISOString(), [hoursBack]);
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-alert-history', hoursBack, statusFilter, typeFilter, instanceFilter],
    queryFn: async () => {
      const { data, error } = await safeClient.from<AlertRow>('warroom_alerts', (q) => {
        let query = q
          .select(
            'id, alert_type, title, message, source, is_read, resolved_at, resolved_reason, created_at'
          )
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(500);
        if (statusFilter === 'active') query = query.is('resolved_at', null);
        if (statusFilter === 'resolved') query = query.not('resolved_at', 'is', null);
        if (typeFilter !== 'all') query = query.eq('alert_type', typeFilter);
        if (instanceFilter.trim()) query = query.ilike('source', `%${instanceFilter.trim()}%`);
        return query;
      });
      if (error) throw error;
      return data ?? [];
    },
    // Realtime é a fonte primária; polling fica como fallback caso a subscription caia.
    refetchInterval: realtimeStatus === 'live' ? 60_000 : 15_000,
    staleTime: 5_000,
  });

  // Subscription Realtime — invalida a query (com debounce) sempre que
  // warroom_alerts é alterado. Reduz tempo de detecção de ~20s para <1s.
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    const channel = supabase
      .channel('admin-alert-history-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'warroom_alerts' }, () => {
        setLastEventAt(new Date());
        if (debounceRef.current) window.clearTimeout(debounceRef.current);
        // Debounce 250ms: várias mudanças em sequência viram 1 refetch.
        debounceRef.current = window.setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['admin-alert-history'] });
        }, 250);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtimeStatus('offline');
        } else {
          setRealtimeStatus('connecting');
        }
      });

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const types = useMemo(() => {
    const s = new Set<string>();
    (data ?? []).forEach((r) => s.add(r.alert_type));
    return ['all', ...Array.from(s).sort()];
  }, [data]);

  const summary = useMemo(() => {
    const rows = data ?? [];
    return {
      total: rows.length,
      active: rows.filter((r) => !r.resolved_at).length,
      resolved: rows.filter((r) => !!r.resolved_at).length,
      critical: rows.filter((r) => r.alert_type.toLowerCase().includes('critical')).length,
    };
  }, [data]);

  async function resolveAlert(id: string) {
    const { error } = await safeClient.from('warroom_alerts', (q) =>
      q
        .update({
          resolved_at: new Date().toISOString(),
          resolved_reason: 'Resolvido manualmente',
          is_read: true,
        })
        .eq('id', id)
    );
    if (error) {
      toast.error('Falha ao resolver alerta');
      return;
    }
    toast.success('Alerta marcado como resolvido');
    refetch();
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Bell className="h-6 w-6 text-primary" />
            Histórico de Alertas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Eventos disparados pelo monitoramento — filtre por instância, tipo e status.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              'gap-1.5 text-[11px]',
              realtimeStatus === 'live' && 'border-success/40 bg-success/10 text-success',
              realtimeStatus === 'offline' &&
                'border-destructive/40 bg-destructive/10 text-destructive',
              realtimeStatus === 'connecting' && 'border-muted-foreground/30 text-muted-foreground'
            )}
            data-testid="alert-history-realtime-status"
            title={
              lastEventAt
                ? `Último evento: ${format(lastEventAt, 'HH:mm:ss', { locale: ptBR })}`
                : 'Aguardando eventos'
            }
          >
            <Radio className={cn('h-3 w-3', realtimeStatus === 'live' && 'animate-pulse')} />
            {realtimeStatus === 'live' && 'Tempo real'}
            {realtimeStatus === 'connecting' && 'Conectando…'}
            {realtimeStatus === 'offline' && 'Polling (15s)'}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('mr-2 h-4 w-4', isFetching && 'animate-spin')} />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-2xl font-bold">{summary.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Ativos</div>
            <div className="text-2xl font-bold text-warning">{summary.active}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Resolvidos</div>
            <div className="text-2xl font-bold text-success">{summary.resolved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Críticos</div>
            <div className="text-2xl font-bold text-destructive">{summary.critical}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Filter className="h-4 w-4" /> Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Período</label>
            <Select value={hoursBack} onValueChange={setHoursBack}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Tipo</label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t === 'all' ? 'Todos' : t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Instância / fonte</label>
            <Input
              value={instanceFilter}
              onChange={(e) => setInstanceFilter(e.target.value)}
              placeholder="ex: wpp2"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Alertas {data ? `(${data.length})` : ''}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Horário</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Métrica / Título</TableHead>
                <TableHead>Mensagem</TableHead>
                <TableHead>Instância</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (data?.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    Nenhum alerta nesse intervalo.
                  </TableCell>
                </TableRow>
              )}
              {data?.map((row) => {
                const resolved = !!row.resolved_at;
                return (
                  <TableRow
                    key={row.id}
                    className={cn(!resolved && 'bg-warning/5', 'cursor-pointer hover:bg-muted/50')}
                    onClick={() => setDetailInstance(row.source ?? null)}
                  >
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatDateTimeCompact(row.created_at)}
                    </TableCell>
                    <TableCell>
                      <TypeBadge type={row.alert_type} />
                    </TableCell>
                    <TableCell className="text-sm font-medium">{row.title}</TableCell>
                    <TableCell
                      className="max-w-md truncate text-xs text-muted-foreground"
                      title={row.message}
                    >
                      {row.message}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.source ?? '—'}
                    </TableCell>
                    <TableCell>
                      {resolved ? (
                        <Badge
                          variant="outline"
                          className="gap-1 border-success/30 bg-success/10 text-[10px] text-success"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Resolvido · {formatDateTimeCompact(row.resolved_at)}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="gap-1 border-warning/30 bg-warning/10 text-[10px] text-warning"
                        >
                          <AlertTriangle className="h-3 w-3" /> Ativo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {!resolved && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Marcar como resolvido"
                          onClick={() => resolveAlert(row.id)}
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertInstanceDetailDialog
        open={!!detailInstance}
        onOpenChange={(v) => !v && setDetailInstance(null)}
        instance={detailInstance}
      />
    </div>
  );
}
