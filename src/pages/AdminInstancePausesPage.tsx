import { useState } from 'react';
import { DEFAULT_WHATSAPP_INSTANCE } from '@/lib/constants/whatsappInstances';
import { queryKeys } from '@/services/api/queryKeys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Pause, Play, ShieldAlert, RefreshCw, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { AuthEventTrendChart } from '@/features/admin/components/instance-pauses/AuthEventTrendChart';
import { IncidentDetailDialog, type IncidentPause } from '@/features/admin/components/instance-pauses/IncidentDetailDialog';
import { type WhatsAppInstance } from '@/lib/constants/whatsappInstances';
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';

type PauseRow = IncidentPause;

const REFRESH_INTERVAL = 15_000;

async function invoke<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('instance-pause-control', {
    body: { action, ...payload },
  });
  if (error) throw error;
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T; // ignore-audit: narrows Supabase query result to local interface
}

export default function AdminInstancePausesPage() {
  const qc = useQueryClient();
  const [instance, setInstance] = useState<WhatsAppInstance>(DEFAULT_WHATSAPP_INSTANCE);
  const [minutes, setMinutes] = useState(15);
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState<PauseRow | null>(null);

  const activeQuery = useQuery({
    queryKey: queryKeys.adminOps.instancePausesActive(),
    queryFn: () => invoke<{ items: PauseRow[] }>('list'),
    refetchInterval: REFRESH_INTERVAL,
  });

  const historyQuery = useQuery({
    queryKey: queryKeys.adminOps.instancePausesHistory(),
    queryFn: () => invoke<{ items: PauseRow[] }>('history', { limit: 50 }),
    refetchInterval: REFRESH_INTERVAL * 2,
  });

  const pauseMut = useMutation({
    mutationFn: () => invoke('pause', { instance: instance.trim(), minutes, reason: reason.trim() || 'manual_pause' }),
    onSuccess: () => {
      toast.success(`Instância "${instance}" pausada por ${minutes}min`);
      setReason('');
      qc.invalidateQueries({ queryKey: queryKeys.adminOps.instancePauses() });
    },
    onError: (e: Error) => toast.error(`Falha ao pausar: ${e.message}`),
  });

  const unpauseMut = useMutation({
    mutationFn: (inst: string) => invoke<{ cleared: number }>('unpause', { instance: inst }),
    onSuccess: (data, inst) => {
      toast.success(`Instância "${inst}" retomada (${data.cleared} pausas encerradas)`);
      qc.invalidateQueries({ queryKey: queryKeys.adminOps.instancePauses() });
    },
    onError: (e: Error) => toast.error(`Falha ao retomar: ${e.message}`),
  });

  const active = activeQuery.data?.items ?? [];
  const history = historyQuery.data?.items ?? [];
  const autoCount24h = history.filter(
    (h) => h.auto_paused && new Date(h.created_at).getTime() > Date.now() - 24 * 3600 * 1000,
  ).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Pause className="h-6 w-6 text-primary" />
            Pausas de Processamento por Instância
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Suspende temporariamente o webhook e o envio Evolution para uma instância
            quando há picos de <code>invalid_signature</code> ou <code>auth 401/403</code>.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: queryKeys.adminOps.instancePauses() })}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Pausas ativas</CardTitle></CardHeader>
          <CardContent>
            {activeQuery.isLoading ? <Skeleton className="h-8 w-12" /> : (
              <div className="text-3xl font-bold">{active.length}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Auto-pausas / 24h</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold flex items-center gap-2">
              {autoCount24h}
              {autoCount24h > 0 && <ShieldAlert className="h-5 w-5 text-warning" />}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Histórico (50 últimas)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{history.length}</div>
          </CardContent>
        </Card>
      </div>

      {autoCount24h > 0 && (
        <Alert variant="default" className="border-warning/40 bg-warning/5">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertTitle>Auto-pausas detectadas</AlertTitle>
          <AlertDescription>
            {autoCount24h} pausa(s) automática(s) nas últimas 24h por excesso de falhas
            de autenticação. Verifique a Webhook Secret e as credenciais da Evolution API.
          </AlertDescription>
        </Alert>
      )}

      <SectionErrorBoundary sectionName="Tendência de eventos de autenticação">
        <AuthEventTrendChart />
      </SectionErrorBoundary>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pausar manualmente</CardTitle>
          <CardDescription>Janela máxima: 1440 minutos (24h).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <Label htmlFor="instance">Instância</Label>
              <Input id="instance" value={instance} onChange={(e) => setInstance(e.target.value as WhatsAppInstance)} placeholder="wpp2" />
            </div>
            <div>
              <Label htmlFor="minutes">Minutos</Label>
              <Input
                id="minutes" type="number" min={1} max={1440}
                value={minutes} onChange={(e) => setMinutes(Math.max(1, Math.min(1440, Number(e.target.value) || 1)))}
              />
            </div>
            <div className="md:col-span-1">
              <Label htmlFor="reason">Motivo</Label>
              <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="manual_pause" />
            </div>
            <Button
              onClick={() => pauseMut.mutate()}
              disabled={pauseMut.isPending || !instance.trim()}
              variant="destructive"
            >
              <Pause className="h-4 w-4 mr-2" />
              Pausar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Pausas ativas agora</CardTitle></CardHeader>
        <CardContent>
          {activeQuery.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : active.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma instância pausada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th scope="col" className="py-2 pr-4">Instância</th>
                    <th scope="col" className="py-2 pr-4">Tipo</th>
                    <th scope="col" className="py-2 pr-4">Motivo</th>
                    <th scope="col" className="py-2 pr-4">Gatilhos</th>
                    <th scope="col" className="py-2 pr-4">Termina</th>
                    <th scope="col" className="py-2 pr-4">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                      tabIndex={0}
                      onClick={() => setSelected(p)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelected(p)}
                    >
                      <td className="py-2 pr-4  text-xs">{p.instance_name}</td>
                      <td className="py-2 pr-4">
                        {p.auto_paused
                          ? <Badge variant="destructive">auto</Badge>
                          : <Badge variant="subtle">manual</Badge>}
                        {p.investigated_at && <Badge variant="success" className="ml-1 text-[10px]">investigado</Badge>}
                      </td>
                      <td className="py-2 pr-4 text-xs">{p.reason}</td>
                      <td className="py-2 pr-4 text-xs ">{p.trigger_count}</td>
                      <td className="py-2 pr-4 text-xs">
                        {formatDistanceToNow(new Date(p.paused_until), { addSuffix: true, locale: ptBR })}
                      </td>
                      <td className="py-2 pr-4" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm" variant="outline"
                          onClick={() => unpauseMut.mutate(p.instance_name)}
                          disabled={unpauseMut.isPending}
                        >
                          <Play className="h-3.5 w-3.5 mr-1" />
                          Retomar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Histórico recente</CardTitle></CardHeader>
        <CardContent>
          {historyQuery.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Sem histórico.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th scope="col" className="py-2 pr-4">Quando</th>
                    <th scope="col" className="py-2 pr-4">Instância</th>
                    <th scope="col" className="py-2 pr-4">Tipo</th>
                    <th scope="col" className="py-2 pr-4">Motivo</th>
                    <th scope="col" className="py-2 pr-4">Gatilhos</th>
                    <th scope="col" className="py-2 pr-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((p) => {
                    const isActive = new Date(p.paused_until).getTime() > Date.now();
                    return (
                      <tr
                        key={p.id}
                        className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                        tabIndex={0}
                        onClick={() => setSelected(p)}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelected(p)}
                      >
                        <td className="py-2 pr-4 text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(p.created_at), { addSuffix: true, locale: ptBR })}
                        </td>
                        <td className="py-2 pr-4  text-xs">{p.instance_name}</td>
                        <td className="py-2 pr-4">
                          {p.auto_paused ? <Badge variant="destructive">auto</Badge> : <Badge variant="subtle">manual</Badge>}
                        </td>
                        <td className="py-2 pr-4 text-xs">{p.reason}</td>
                        <td className="py-2 pr-4 text-xs ">{p.trigger_count}</td>
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-1">
                            {isActive ? <Badge variant="warning">ativa</Badge> : <Badge variant="subtle">expirada</Badge>}
                            {p.investigated_at && <Badge variant="success" className="text-[10px]">investigado</Badge>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <IncidentDetailDialog pause={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
