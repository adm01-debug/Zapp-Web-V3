import { useState, useEffect } from 'react';
import { getLogger } from '@/lib/logger';
import { safeClient } from '@/integrations/supabase/safeClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

const log = getLogger('AdminSecurityLogsPage');

interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  ip_address: string | null;
  metadata: unknown;
  created_at: string;
}

export default function AdminSecurityLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      const { data, error } = await safeClient.from<AuditLog>('security_audit_logs', (q: any) =>
        q.select(`*, profiles:user_id (name, email)`)
         .order('created_at', { ascending: false })
         .limit(50)
      );
      if (error) {
        log.error('Failed to load security logs', error);
      } else {
        setLogs(data ?? []);
      }
      setLoading(false);
    };

    fetchLogs();
  }, []);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Logs de Segurança</h1>
        <p className="text-muted-foreground">Auditoria de ações do sistema</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Eventos Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="p-4 text-center">Carregando...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Recurso</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((logEntry) => (
                  <TableRow key={logEntry.id}>
                    <TableCell className="text-sm">
                      {new Date(logEntry.created_at).toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{logEntry.action}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {logEntry.resource_type}
                      {logEntry.resource_id && ` (${logEntry.resource_id.slice(0, 8)}...)`}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {logEntry.ip_address ?? '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">Auditado</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
