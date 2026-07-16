import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Shield,
  Activity,
  Ban,
  Globe,
  AlertTriangle,
  Clock,
  RefreshCw,
  BarChart3,
  ShieldAlert,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  X,
} from 'lucide-react';
import { useRateLimitLogs } from '@/features/admin';
import type { RateLimitSortKey } from '@/features/admin/hooks/useRateLimitLogs';
import { useUserRole } from '@/features/auth';
import { BlockedIPsPanel } from '@/components/security/BlockedIPsPanel';
import { IPWhitelistPanel } from '@/components/security/IPWhitelistPanel';
import { RateLimitAlertsPanel } from '@/features/admin/components/RateLimitAlertsPanel';
import { RateLimitLogDetails } from '@/features/admin/components/RateLimitLogDetails';
import type { RateLimitLog } from '@/features/admin/hooks/useRateLimitLogs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const SORT_LABEL: Record<RateLimitSortKey, string> = {
  created_at: 'Quando',
  ip_address: 'IP',
  endpoint: 'Endpoint',
  request_count: 'Requisições',
  blocked: 'Status',
};

export default function RateLimitDashboard() {
  const { isAdmin } = useUserRole();
  const { logs, stats, total, totalPages, loading, filters, setFilters, resetFilters, refetch } =
    useRateLimitLogs();
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedLog, setSelectedLog] = useState<RateLimitLog | null>(null);

  // Área técnica — visualização restrita a admin+ (hierarquia inclui dev).
  if (!isAdmin) {
    return (
      <div className="flex h-full items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Shield className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h2 className="mb-2 text-lg font-semibold">Acesso Restrito</h2>
            <p className="text-muted-foreground">
              Você não tem permissão para acessar esta página.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const blockedPercentage = stats
    ? Math.round((stats.blockedRequests / Math.max(stats.totalRequests, 1)) * 100)
    : 0;

  const toggleSort = (key: RateLimitSortKey) => {
    if (filters.sortBy === key) {
      setFilters({ sortDir: filters.sortDir === 'asc' ? 'desc' : 'asc' });
    } else {
      setFilters({ sortBy: key, sortDir: 'desc' });
    }
  };

  const sortIcon = (key: RateLimitSortKey) => {
    if (filters.sortBy !== key) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-50" />;
    return filters.sortDir === 'asc' ? (
      <ArrowUp className="ml-1 inline h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 inline h-3 w-3" />
    );
  };

  const hasActiveFilters = Boolean(
    filters.ip?.trim() || filters.endpoint?.trim() || filters.blockedOnly
  );
  const rangeFrom = total === 0 ? 0 : (filters.page - 1) * filters.pageSize + 1;
  const rangeTo = Math.min(filters.page * filters.pageSize, total);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Shield className="h-7 w-7 text-primary" />
            Rate Limiting & Segurança
          </h1>
          <p className="text-muted-foreground">Monitore e gerencie a segurança do sistema</p>
        </div>
        <Button variant="outline" onClick={() => refetch()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total de Requests</p>
                  <p className="text-2xl font-bold">{stats?.totalRequests || 0}</p>
                </div>
                <div className="dark:bg-info/20/30 flex h-10 w-10 items-center justify-center rounded-full bg-info/10">
                  <Activity className="h-5 w-5 text-info dark:text-info" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Bloqueados</p>
                  <p className="text-2xl font-bold text-destructive">
                    {stats?.blockedRequests || 0}
                  </p>
                </div>
                <div className="dark:bg-destructive/20/30 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                  <Ban className="h-5 w-5 text-destructive dark:text-destructive" />
                </div>
              </div>
              <Progress value={blockedPercentage} className="mt-2 h-1" />
              <p className="mt-1 text-xs text-muted-foreground">{blockedPercentage}% do total</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">IPs Únicos</p>
                  <p className="text-2xl font-bold">{stats?.uniqueIPs || 0}</p>
                </div>
                <div className="dark:bg-success/20/30 flex h-10 w-10 items-center justify-center rounded-full bg-success/10">
                  <Globe className="h-5 w-5 text-success dark:text-success" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Alertas Ativos</p>
                  <p className="text-2xl font-bold text-warning">
                    {logs.filter((l) => l.blocked).length}
                  </p>
                </div>
                <div className="dark:bg-warning/20/30 flex h-10 w-10 items-center justify-center rounded-full bg-warning/10">
                  <AlertTriangle className="h-5 w-5 text-warning dark:text-warning" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">
            <BarChart3 className="mr-2 h-4 w-4" />
            Visão Geral
          </TabsTrigger>
          <TabsTrigger value="alerts">
            <ShieldAlert className="mr-2 h-4 w-4" />
            Alertas
          </TabsTrigger>
          <TabsTrigger value="blocked">
            <Ban className="mr-2 h-4 w-4" />
            IPs Bloqueados
          </TabsTrigger>
          <TabsTrigger value="whitelist">
            <Globe className="mr-2 h-4 w-4" />
            Whitelist
          </TabsTrigger>
          <TabsTrigger value="logs">
            <Clock className="mr-2 h-4 w-4" />
            Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Top Endpoints */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Endpoints</CardTitle>
                <CardDescription>Endpoints mais acessados</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats?.topEndpoints.map((endpoint, i) => (
                    <div key={endpoint.endpoint} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">{i + 1}.</span>
                        <code className="text-sm">{endpoint.endpoint}</code>
                      </div>
                      <Badge variant="secondary">{endpoint.count}</Badge>
                    </div>
                  ))}
                  {(!stats?.topEndpoints || stats.topEndpoints.length === 0) && (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      Nenhum dado disponível
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Top IPs */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top IPs</CardTitle>
                <CardDescription>IPs com mais requisições</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats?.topIPs.slice(0, 5).map((ip, i) => (
                    <div key={ip.ip} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">{i + 1}.</span>
                        <code className="text-sm">{ip.ip}</code>
                        {ip.blocked && (
                          <Badge variant="destructive" className="text-xs">
                            Bloqueado
                          </Badge>
                        )}
                      </div>
                      <Badge variant="secondary">{ip.count}</Badge>
                    </div>
                  ))}
                  {(!stats?.topIPs || stats.topIPs.length === 0) && (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      Nenhum dado disponível
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
          <RateLimitAlertsPanel />
        </TabsContent>

        <TabsContent value="blocked" className="mt-4">
          <BlockedIPsPanel />
        </TabsContent>

        <TabsContent value="whitelist" className="mt-4">
          <IPWhitelistPanel />
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Logs de Rate Limiting</CardTitle>
              <CardDescription>
                Investigue picos filtrando por IP, endpoint e status. Clique nos cabeçalhos para
                ordenar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters */}
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto_auto] md:items-end">
                <div className="space-y-1">
                  <Label htmlFor="filter-ip" className="text-xs">
                    Filtrar por IP
                  </Label>
                  <Input
                    id="filter-ip"
                    placeholder="Ex: 192.168 ou 10.0.0.1"
                    value={filters.ip ?? ''}
                    onChange={(e) => setFilters({ ip: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="filter-endpoint" className="text-xs">
                    Filtrar por endpoint
                  </Label>
                  <Input
                    id="filter-endpoint"
                    placeholder="Ex: /api/messages"
                    value={filters.endpoint ?? ''}
                    onChange={(e) => setFilters({ endpoint: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2 pb-2 md:pb-0">
                  <Switch
                    id="filter-blocked"
                    checked={!!filters.blockedOnly}
                    onCheckedChange={(v) => setFilters({ blockedOnly: v })}
                  />
                  <Label htmlFor="filter-blocked" className="text-xs">
                    Somente bloqueados
                  </Label>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="page-size" className="text-xs">
                    Por página
                  </Label>
                  <Select
                    value={String(filters.pageSize)}
                    onValueChange={(v) => setFilters({ pageSize: Number(v) })}
                  >
                    <SelectTrigger id="page-size" className="w-[90px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[10, 25, 50, 100].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  disabled={!hasActiveFilters}
                  className="h-9"
                >
                  <X className="mr-1 h-3.5 w-3.5" /> Limpar
                </Button>
              </div>

              {hasActiveFilters && (
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {filters.ip?.trim() && <Badge variant="outline">IP: {filters.ip}</Badge>}
                  {filters.endpoint?.trim() && (
                    <Badge variant="outline">Endpoint: {filters.endpoint}</Badge>
                  )}
                  {filters.blockedOnly && <Badge variant="outline">Somente bloqueados</Badge>}
                </div>
              )}

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {(
                        [
                          'ip_address',
                          'endpoint',
                          'request_count',
                          'blocked',
                          'created_at',
                        ] as RateLimitSortKey[]
                      ).map((key) => (
                        <TableHead
                          key={key}
                          onClick={() => toggleSort(key)}
                          className="cursor-pointer select-none hover:text-foreground"
                          aria-sort={
                            filters.sortBy === key
                              ? filters.sortDir === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                        >
                          {SORT_LABEL[key]}
                          {sortIcon(key)}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow
                        key={log.id}
                        onClick={() => setSelectedLog(log)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedLog(log);
                          }
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`Ver detalhes do log ${log.ip_address} · ${log.endpoint}`}
                        className="cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none"
                      >
                        <TableCell>
                          <code className="text-sm">{log.ip_address}</code>
                        </TableCell>
                        <TableCell>
                          <code className="text-sm">{log.endpoint}</code>
                        </TableCell>
                        <TableCell>{log.request_count}</TableCell>
                        <TableCell>
                          {log.blocked ? (
                            <Badge variant="destructive">Bloqueado</Badge>
                          ) : (
                            <Badge variant="secondary">OK</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(log.created_at), {
                            addSuffix: true,
                            locale: ptBR,
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                    {logs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                          {loading ? 'Carregando…' : 'Nenhum log encontrado com esses filtros.'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
                <p className="text-xs text-muted-foreground">
                  {total === 0
                    ? 'Sem resultados'
                    : `Mostrando ${rangeFrom}–${rangeTo} de ${total} registro${total === 1 ? '' : 's'}`}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFilters({ page: 1 })}
                    disabled={filters.page <= 1 || loading}
                  >
                    Primeira
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFilters({ page: Math.max(1, filters.page - 1) })}
                    disabled={filters.page <= 1 || loading}
                  >
                    Anterior
                  </Button>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    Página {filters.page} de {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFilters({ page: Math.min(totalPages, filters.page + 1) })}
                    disabled={filters.page >= totalPages || loading}
                  >
                    Próxima
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFilters({ page: totalPages })}
                    disabled={filters.page >= totalPages || loading}
                  >
                    Última
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <RateLimitLogDetails
        log={selectedLog}
        open={!!selectedLog}
        onOpenChange={(o) => {
          if (!o) setSelectedLog(null);
        }}
        onFilterByIp={(ip) => {
          setActiveTab('logs');
          setFilters({ ip, page: 1 });
        }}
        onFilterByEndpoint={(endpoint) => {
          setActiveTab('logs');
          setFilters({ endpoint, page: 1 });
        }}
      />
    </div>
  );
}
