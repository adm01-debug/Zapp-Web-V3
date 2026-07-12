import { useState, useEffect, useCallback } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { getLogger } from '@/lib/logger';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/components/ui/select';
import { 
  History as HistoryIcon, User, ChevronLeft, ChevronRight, RefreshCcw, Search, X
} from 'lucide-react';
import { toast } from 'sonner';
import { emailApi, type EmailRevalidationJob } from '@/services/email/emailApi';

const log = getLogger('AdminEmailAuditPage');

export default function AdminEmailAuditPage() {
  const [logs, setLogs] = useState<EmailRevalidationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 10;

  // Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const mountedRef = useMountedRef();

  const loadAuditLogs = useCallback(async () => {
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, count, error } = await emailApi.getAuditLogs(from, to, {
        status: statusFilter,
        dateFrom,
        dateTo
      });

      if (error) throw error;
      if (!mountedRef.current) return;
      setLogs(data || []);
      setTotal(count || 0);
    } catch (error) {
      log.error('Error loading audit logs', error);
      toast.error('Erro ao carregar histórico de auditoria');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [page, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    void loadAuditLogs();
  }, [loadAuditLogs]);

  const handleRetry = async (jobId: string) => {
    try {
      const { error } = await emailApi.retryJob(jobId);
      if (error) throw error;
      toast.success('Novo job de revalidação agendado');
      void loadAuditLogs();
    } catch (error) {
      log.error('Error retrying job', error);
      toast.error('Erro ao agendar nova tentativa');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed': return <Badge variant="default" className="bg-primary text-primary-foreground">Concluído</Badge>;
      case 'pending': return <Badge variant="secondary">Pendente</Badge>;
      case 'processing': return <Badge variant="secondary" className="bg-blue-500 text-white hover:bg-blue-600">Processando</Badge>;
      case 'failed': return <Badge variant="destructive">Falhou</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const resetFilters = () => {
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Auditoria do Email</h1>
        <p className="text-muted-foreground">Histórico de solicitações de revalidação e integridade.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <CardTitle className="text-lg flex items-center gap-2 font-semibold">
            <HistoryIcon className="w-5 h-5 text-primary" />
            Logs de Revalidação
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono">Total: {total}</Badge>
            {(statusFilter !== 'all' || dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 px-2">
                <X className="w-4 h-4 mr-1" />
                Limpar
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-muted/30 p-3 rounded-lg border">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground ml-1">Status</label>
              <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setPage(1); }}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="processing">Processando</SelectItem>
                  <SelectItem value="completed">Concluído</SelectItem>
                  <SelectItem value="failed">Falhou</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground ml-1">De (Data)</label>
              <Input 
                type="date" 
                value={dateFrom} 
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="bg-background"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground ml-1">Até (Data)</label>
              <Input 
                type="date" 
                value={dateTo} 
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="bg-background"
              />
            </div>
          </div>

          <div className="rounded-md border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left font-medium">Job ID</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">Status</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">Solicitado em</th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">Usuário</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <RefreshCcw className="w-6 h-6 animate-spin" />
                          <span>Carregando logs...</span>
                        </div>
                      </td>
                    </tr>
                  ) : logs.length > 0 ? logs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-4 py-3">
                        <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono text-muted-foreground">{log.id.split('-')[0]}...</code>
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(log.status)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span>{new Date(log.requested_at).toLocaleDateString()}</span>
                          <span className="text-[10px] text-muted-foreground">{new Date(log.requested_at).toLocaleTimeString()}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <User className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs">{log.requested_by ? 'Admin' : 'Sistema'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleRetry(log.id)}
                          title="Repetir Job"
                        >
                          <RefreshCcw className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <Search className="w-6 h-6 opacity-20" />
                          <p>Nenhum log encontrado para os filtros selecionados.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-2">
            <p className="text-xs text-muted-foreground">
              Mostrando página <span className="font-semibold">{page}</span> de <span className="font-semibold">{Math.ceil(total / pageSize) || 1}</span>
            </p>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="h-8"
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                disabled={page * pageSize >= total}
                onClick={() => setPage(p => p + 1)}
                className="h-8"
              >
                Próxima <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
