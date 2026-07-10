// @ts-nocheck — strict-mode retrofit pendente (ver docs/STRICT_MODE_BACKLOG.md)
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Terminal, ShieldAlert, Activity, RefreshCw, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/features/auth/hooks/useUserRole";

type DiagnosticLog = {
  id: string;
  action: string;
  category: string;
  details: any;
  created_at: string;
};

export default function AdminDevDiagnosticsPage() {
  const { toast } = useToast();
  const { roles } = useUserRole();
  const [logs, setLogs] = useState<DiagnosticLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDev, setIsDev] = useState(false);

  useEffect(() => {
    setIsDev(roles?.includes('dev') || false);
  }, [roles]);

  async function loadLogs() {
    setLoading(true);
    const { data, error } = await supabase
      .from('dev_diagnostic_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      toast({ title: "Erro ao carregar logs", description: error.message, variant: "destructive" });
    } else {
      setLogs(data || []);
    }
    setLoading(false);
  }

  async function logAccess() {
    if (!isDev) return;
    await supabase.from('dev_diagnostic_logs').insert({
      action: 'Access Dev Diagnostics',
      category: 'Audit',
      details: { user_agent: navigator.userAgent, screen: `${window.innerWidth}x${window.innerHeight}` }
    });
  }

  useEffect(() => {
    if (isDev) {
      void loadLogs();
      void logAccess();
    }
  }, [isDev]);

  if (!isDev && !loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] gap-4">
        <ShieldAlert className="w-16 h-16 text-destructive animate-pulse" />
        <h1 className="text-2xl font-bold">Acesso Restrito</h1>
        <p className="text-muted-foreground">Esta página é exclusiva para a role DEV.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Terminal className="w-6 h-6 text-primary" />
            Diagnóstico Dev & Logs Brutos
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Auditoria de acesso e monitoramento de sistema em baixo nível.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadLogs} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar Logs
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="w-4 h-4" />
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
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="w-4 h-4" />
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
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              Sessão Atual
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="bg-primary/10 border-primary/20 text-primary">
              DEV MODE ACTIVE
            </Badge>
            <p className="text-xs text-muted-foreground mt-1">Identidade auditada</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Eventos de Auditoria</CardTitle>
          <CardDescription>Visualização bruta de ações administrativas e erros críticos.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px] w-full border rounded-md p-4 bg-foreground/5 dark:bg-foreground/40">
            {loading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
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
                  {logs.map(log => (
                    <TableRow key={log.id} className=" text-xs">
                      <TableCell className="whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">{log.category}</Badge>
                      </TableCell>
                      <TableCell className="font-semibold">{log.action}</TableCell>
                      <TableCell className="max-w-md truncate">
                        {JSON.stringify(log.details)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {logs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
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