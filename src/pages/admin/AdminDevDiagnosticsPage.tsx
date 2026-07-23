import { useEffect, useRef, useState } from 'react';
import { safeClient } from '@/integrations/supabase/safeClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Terminal, ShieldAlert, Activity, RefreshCw, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/features/auth/hooks/useUserRole';

type DiagnosticLog = {
  id: string;
  action: string;
  category: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

/** Admin Dev Diagnostics Page. */
export default function AdminDevDiagnosticsPage() {
  const { toast } = useToast();
  const { roles } = useUserRole();
  const [logs, setLogs] = useState<DiagnosticLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDev, setIsDev] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setIsDev(roles?.includes('dev') || false);
  }, [roles]);

  async function loadLogs() {
    setLoading(true);
    const { data, error } = await safeClient.from<DiagnosticLog>('dev_diagnostic_logs', (q) =>
      q.select('*').order('created_at', { ascending: false }).limit(50)
    );

    if (!isMountedRef.current) return;
    if (error) {
      toast({ title: 'Erro ao carregar logs', description: error.message, variant: 'destructive' });
    } else {
      setLogs(data || []);
    }
    setLoading(false);
  }

  async function logAccess() {
    if (!isDev) return;
    await safeClient.from('dev_diagnostic_logs', (q) =>
      q.insert({
        action: 'Access Dev Diagnostics',
        category: 'Audit',
        details: {
          user_agent: navigator.userAgent,
          screen: `${window.innerWidth}x${window.innerHeight}`,
        },
      })
    );
  }

  useEffect(() => {
    if (isDev) {
      void loadLogs();
      void logAccess();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDev]);

  if (!isDev && !loading) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-4">
        <ShieldAlert className="h-16 w-16 animate-pulse text-destructive" />
        <h1 className="text-2xl font-bold">Acesso Restrito</h1>
        <p className="text-muted-foreground">Esta página é exclusiva para a role DEV.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Terminal className="h-6 w-6 text-primary" />
            Diagnóstico Dev & Logs Brutos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Auditoria de acesso e monitoramento de sistema em baixo nível.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadLogs} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar Logs
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Activity className="h-4 w-4" />
              Status do Sistema
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success-foreground">OPERACIONAL</div>
            <p className="text-xs text-muted-foreground">Todos os serviços respondendo</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" />
              Logs Recentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{logs.length}</div>
            <p className="text-xs text-muted-foreground">Capturados nos últimos 50 eventos</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <ShieldAlert className="h-4 w-4" />
              Sessão Atual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">
              DEV MODE ACTIVE
            </Badge>
            <p className="mt-1 text-xs text-muted-foreground">Identidade auditada</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Eventos de Auditoria</CardTitle>
          <CardDescription>
            Visualização bruta de ações administrativas e erros críticos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px] w-full rounded-md border bg-foreground/5 p-4 dark:bg-foreground/40">
            {loading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id} className="text-xs">
                      <TableCell className="whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">
                          {log.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-semibold">{log.action}</TableCell>
                      <TableCell className="max-w-md truncate">
                        {JSON.stringify(log.details)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {logs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                        Nenhum log registrado ainda.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
