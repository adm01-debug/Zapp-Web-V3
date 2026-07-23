import { History, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface AuditLog {
  id: string;
  action: string;
  created_at: string;
  details: { profile_name?: string };
}

interface Props {
  auditLogs: AuditLog[];
  departmentName: string;
}

/** Department Audit View component for the team chat section. */
export function DepartmentAuditView({ auditLogs, departmentName }: Props) {
  const exportCsv = () => {
    if (auditLogs.length === 0) return;
    const headers = ['Data', 'Ação', 'Usuário', 'ID'];
    const rows = auditLogs.map((l) => [
      format(new Date(l.created_at), 'dd/MM/yyyy HH:mm'),
      l.action,
      l.details.profile_name || 'Desconhecido',
      l.id,
    ]);
    const csvContent = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `audit_${departmentName}_${format(new Date(), 'yyyyMMdd')}.csv`;
    link.click();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex justify-end px-6 py-2">
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={auditLogs.length === 0}>
          <Download className="mr-2 h-4 w-4" /> Exportar CSV
        </Button>
      </div>
      <ScrollArea className="flex-1 px-6 pb-6">
        <div className="space-y-4 pt-4">
          {auditLogs.map((log) => (
            <div key={log.id} className="flex gap-4 rounded-lg border bg-card p-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <History className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center justify-between">
                  <Badge
                    variant={log.action === 'ADD_MEMBER' ? 'default' : 'secondary'}
                    className="h-5 text-[10px]"
                  >
                    {log.action === 'ADD_MEMBER' ? 'Inclusão' : 'Remoção'}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                  </span>
                </div>
                <p className="text-sm">
                  <span className="font-semibold">{log.details.profile_name}</span> foi{' '}
                  {log.action === 'ADD_MEMBER' ? 'adicionado ao' : 'removido do'} departamento.
                </p>
              </div>
            </div>
          ))}
          {auditLogs.length === 0 && (
            <div className="py-10 text-center text-muted-foreground">
              Nenhum registro encontrado.
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
