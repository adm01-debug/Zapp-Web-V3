// @ts-nocheck
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Database as DatabaseIcon,
  Search,
  RefreshCcw,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Filter,
  History as HistoryIcon,
} from 'lucide-react';
import { useEmailHealthStatus } from './email/useEmailHealthStatus';

const getStatusIcon = (status?: string) => {
  switch (status) {
    case 'healthy':
      return <CheckCircle2 className="h-5 w-5 text-primary" />;
    case 'degraded':
      return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    case 'error':
      return <AlertCircle className="h-5 w-5 text-destructive" />;
    default:
      return <Clock className="h-5 w-5 text-muted-foreground" />;
  }
};

const getStatusLabel = (status?: string) => {
  switch (status) {
    case 'healthy':
      return 'Operacional';
    case 'degraded':
      return 'Degradado';
    case 'error':
      return 'Crítico';
    default:
      return 'Desconhecido';
  }
};

export default function AdminEmailStatusPage() {
  const { accounts } = useEmail();
  const [health, setHealth] = useState<EmailHealthInfo | null>(null);
  const [_loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    requestId: '',
    resource: '',
    operation: '',
    page: 1,
  });
  const [failuresData, setFailuresData] = useState<{ items: EmailFailure[]; total: number }>({
    items: [],
    total: 0,
  });

  const mountedRef = useMountedRef();

  const loadHealth = async () => {
    setLoading(true);
    try {
      const projectUrl = import.meta.env.VITE_SUPABASE_URL;
      const functionUrl = `${projectUrl}/functions/v1/email-health?page=${filters.page}&pageSize=5${filters.requestId ? `&requestId=${filters.requestId}` : ''}${filters.resource ? `&resource=${filters.resource}` : ''}${filters.operation ? `&operation=${filters.operation}` : ''}`;

      const fetchResponse = await fetch(functionUrl, {
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      const dataFull = await fetchResponse.json();

      if (!fetchResponse.ok) throw new Error(dataFull.error || 'Erro na Edge Function');

      if (!mountedRef.current) return;
      setHealth({
        status: castStatus(dataFull.status),
        lastValidation: dataFull.last_validation ? new Date(dataFull.last_validation) : null,
        cacheExpiration: null,
        recentFailures: dataFull.failuresResult?.items || [],
        stats: {
          totalCalls: 0,
          failedCalls: dataFull.failure_count_window || 0,
          cacheHits: 0,
        },
      });
      setFailuresData(dataFull.failuresResult || { items: [], total: 0 });
    } catch (error) {
      log.error('Error loading email health', error);
      toast.error('O serviço de telemetria do Email está indisponível.');

      try {
        const { data: summary, error: summaryError } = await emailApi.getHealthSummary();
        if (summaryError) throw summaryError;

        if (summary) {
          if (!mountedRef.current) return;
          setHealth({
            status: castStatus(summary.status),
            lastValidation: summary.last_validation ? new Date(summary.last_validation) : null,
            cacheExpiration: null,
            recentFailures: [],
            stats: { totalCalls: 0, failedCalls: summary.failure_count_60m || 0, cacheHits: 0 },
          });
        }
      } catch (fallbackErr) {
        log.error('Email health fallback also failed', fallbackErr);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    void loadHealth();

    const channel = supabase
      .channel('email-admin-status')
      .on<EmailHealthSummary>(
        'postgres_changes',
        { event: '*', schema: 'zapp', table: 'email_health_summary' },
        (payload) => {
          if (payload.new) {
            setHealth((prev) =>
              prev
                ? {
                    ...prev,
                    status: castStatus(payload.new.status),
                    lastValidation: payload.new.last_validation
                      ? new Date(payload.new.last_validation)
                      : prev.lastValidation,
                    stats: {
                      ...prev.stats,
                      failedCalls: payload.new.failure_count_60m || 0,
                    },
                  }
                : null
            );
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'zapp', table: 'email_revalidation_jobs' },
        (payload) => {
          const job = (payload.new || payload.old) as EmailRevalidationJob;
          if (payload.eventType === 'INSERT') {
            toast.info(`Nova solicitação de revalidação agendada`);
          } else if (payload.eventType === 'UPDATE' && job.status === 'completed') {
            toast.success(`Job ${job.id.split('-')[0]} concluído com sucesso`);
          } else if (payload.eventType === 'UPDATE' && job.status === 'failed') {
            toast.error(`Job ${job.id.split('-')[0]} falhou`);
          }
          loadHealth();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [filters]);

  const [isRetrying, setIsRetrying] = useState<Record<string, boolean>>({});

  const handleRevalidate = async () => {
    const revalidatePromise = async () => {
      const projectUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${projectUrl}/functions/v1/email-health?action=revalidate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      await emailHealthService.forceRevalidation();
      return data;
    };

    toast.promise(revalidatePromise(), {
      loading: 'Agendando revalidação no backend...',
      success: 'Revalidação agendada com sucesso!',
      error: 'Erro ao solicitar revalidação',
    });
  };

  const handleAction = async (action: 'markRead' | 'rpc_test', id: string) => {
    setIsRetrying((prev) => ({ ...prev, [id]: true }));
    try {
      if (action === 'markRead') {
        const { error } = await emailApi.markThreadRead(id, true);
        if (error) throw error;
        toast.success('Thread marcada como lida no servidor.');
      } else if (action === 'rpc_test') {
        const { error } = await emailApi.getTokenStatus();
        if (error) throw error;
        toast.success('RPC de status de token validada com sucesso.');
      }
      await loadHealth();
    } catch (err: unknown) {
      toast.error(
        `Falha na etapa ${action}: ${err instanceof Error ? err.message : 'Erro desconhecido'}`
      );
    } finally {
      setIsRetrying((prev) => ({ ...prev, [id]: false }));
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle2 className="h-5 w-5 text-primary" />;
      case 'degraded':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-destructive" />;
      default:
        return <Clock className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'healthy':
        return 'Operacional';
      case 'degraded':
        return 'Degradado';
      case 'error':
        return 'Crítico';
      default:
        return 'Desconhecido';
    }
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Status do Email</h1>
          <p className="text-muted-foreground">
            Monitoramento de integridade do schema e conexões Email.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => (window.location.hash = '#admin/email-audit')}
            variant="outline"
            className="gap-2"
          >
            <HistoryIcon className="h-4 w-4" />
            Ver Auditoria
          </Button>
          <Button onClick={handleRevalidate} variant="outline" className="gap-2">
            <RefreshCcw className="h-4 w-4" />
            Forçar Revalidação
          </Button>
        </div>
      </div>

      {health?.status && health.status !== 'healthy' && (
        <Alert
          variant={health.status === 'error' ? 'destructive' : 'default'}
          className={
            health.status === 'degraded' ? 'border-yellow-200 bg-yellow-50 text-yellow-800' : ''
          }
        >
          {health.status === 'error' ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          <AlertTitle>Status do Email: {getStatusLabel(health.status)}</AlertTitle>
          <AlertDescription>
            Foram detectadas {health.recentFailures.length} falhas recentes. Verifique os logs
            abaixo usando o Request ID para depuração.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saúde Geral</CardTitle>
            {getStatusIcon(health?.status)}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{getStatusLabel(health?.status)}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {health && health.source === 'edge_shared_storage'
                ? 'Telemetria persistida via Cloud Edge.'
                : 'Telemetria em tempo real (client-side).'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Última Validação</CardTitle>
            <Clock className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {health?.lastValidation
                ? new Date(health.lastValidation).toLocaleTimeString()
                : '--:--'}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Próxima expiração cache:{' '}
              {health?.cacheExpiration
                ? new Date(health.cacheExpiration).toLocaleTimeString()
                : 'N/A'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Eficiência Cache</CardTitle>
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {health?.stats
                ? Math.round((health.stats.cacheHits / (health.stats.totalCalls || 1)) * 100)
                : 0}
              %
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {health?.stats?.cacheHits || 0} hits de {health?.stats?.totalCalls || 0} chamadas.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contas Ativas</CardTitle>
            <DatabaseIcon className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{accounts.length}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {accounts.filter((a) => a.is_active).length} operacionais.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertCircle className="h-5 w-5" />
            Histórico de Falhas Operacionais
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="">
              Total: {failuresData.total}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-muted/30 p-3 md:grid-cols-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Request ID..."
                  className="pl-9"
                  value={filters.requestId}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, requestId: e.target.value, page: 1 }))
                  }
                />
              </div>
              <div className="relative">
                <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Recurso (email_...)"
                  className="pl-9"
                  value={filters.resource}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, resource: e.target.value, page: 1 }))
                  }
                />
              </div>
              <div className="relative">
                <DatabaseIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Operação (from/rpc)"
                  className="pl-9"
                  value={filters.operation}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, operation: e.target.value, page: 1 }))
                  }
                />
              </div>
            </div>

            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-left font-medium">
                      Request ID
                    </th>
                    <th scope="col" className="px-4 py-2 text-left font-medium">
                      Recurso
                    </th>
                    <th scope="col" className="px-4 py-2 text-left font-medium">
                      Erro
                    </th>
                    <th scope="col" className="px-4 py-2 text-left font-medium">
                      Ações
                    </th>
                    <th scope="col" className="px-4 py-2 text-left font-medium">
                      Horário
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {failuresData.items.length > 0 ? (
                    failuresData.items.map((failure, idx) => (
                      <tr key={`${failure.requestId}-${idx}`} className="hover:bg-muted/30">
                        <td className="px-4 py-2">
                          <Badge variant="outline" className="">
                            {failure.requestId}
                          </Badge>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-col">
                            <span className="font-medium">{failure.resource}</span>
                            <span className="text-[10px] uppercase text-muted-foreground">
                              {failure.operation}
                            </span>
                          </div>
                        </td>
                        <td
                          className="max-w-[300px] truncate px-4 py-2 text-destructive"
                          title={failure.error}
                        >
                          {failure.error}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleAction('rpc_test', failure.requestId)}
                              disabled={isRetrying[failure.requestId]}
                              aria-label="Tentar RPC novamente"
                            >
                              <RefreshCcw
                                className={`h-3 w-3 ${isRetrying[failure.requestId] ? 'animate-spin' : ''}`}
                              />
                            </Button>
                            {failure.resource.includes('thread') && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() =>
                                  handleAction(
                                    'markRead',
                                    failure.resource.split(':')[1] || failure.requestId
                                  )
                                }
                                disabled={isRetrying[failure.requestId]}
                                aria-label="Marcar como lido"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {new Date(failure.timestamp).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center italic text-muted-foreground"
                      >
                        Nenhuma falha encontrada com os filtros atuais.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Mostrando {failuresData.items.length} de {failuresData.total} registros
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={filters.page === 1}
                  onClick={() => setFilters((prev) => ({ ...prev, page: prev.page - 1 }))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">Página {filters.page}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={filters.page * 5 >= failuresData.total}
                  onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
