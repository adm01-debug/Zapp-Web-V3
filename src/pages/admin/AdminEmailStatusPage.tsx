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
      return <AlertTriangle className="h-5 w-5 text-warning" />;
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
  const {
    accounts,
    health,
    filters,
    setFilters,
    failuresData,
    isRetrying,
    handleRevalidate,
    handleAction,
  } = useEmailHealthStatus();

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
            health.status === 'degraded' ? 'border-warning/30 bg-warning/10 text-warning' : ''
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
            <p className="mt-1 text-xs text-muted-foreground">Telemetria em tempo real.</p>
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
            <Badge variant="outline">Total: {failuresData.total}</Badge>
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
                    failuresData.items.map((failure) => (
                      <tr key={failure.requestId} className="hover:bg-muted/30">
                        <td className="px-4 py-2">
                          <Badge variant="outline">{failure.requestId}</Badge>
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
