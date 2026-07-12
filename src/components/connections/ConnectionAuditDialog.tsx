import type { Json } from '@/integrations/supabase/types';
import { useState, useEffect } from 'react';
import { getLogger } from '@/lib/logger';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCircle, CheckCircle2, Info, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const log = getLogger('ConnectionAuditDialog');

interface AuditLog {
  id: string;
  action: string;
  created_at: string;
  details: Record<string, unknown>;
}

interface ConnectionAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string;
  connectionName: string;
}

export function ConnectionAuditDialog({
  open,
  onOpenChange,
  instanceId,
  connectionName,
}: ConnectionAuditDialogProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && instanceId) {
      fetchLogs();
    }
  }, [open, instanceId]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .contains('details', { instance_id: instanceId })
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      const normalized: AuditLog[] = (data ?? []).map((row) => ({
        id: row.id,
        action: row.action,
        created_at: row.created_at,
        details:
          row.details && typeof row.details === 'object' && !Array.isArray(row.details)
            ? (row.details as Record<string, unknown>)
            : {},
      }));
      setLogs(normalized);
    } catch (err) {
      log.error('Failed to fetch connection audit logs', err);
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (action: string) => {
    if (
      action.includes('failure') ||
      action.includes('degraded') ||
      action.includes('disconnected') ||
      action === 'device_removed' ||
      action === 'session_conflict'
    ) {
      return <AlertCircle className="h-4 w-4 text-destructive" />;
    }
    if (
      action.includes('success') ||
      action.includes('healthy') ||
      action.includes('completed') ||
      action === 'instance_reconnected'
    ) {
      return <CheckCircle2 className="h-4 w-4 text-primary" />;
    }
    if (action.includes('attempt') || action.includes('restart')) {
      return <RefreshCw className="h-4 w-4 text-warning-foreground" />;
    }
    return <Info className="h-4 w-4 text-muted-foreground" />;
  };

  const formatActionName = (action: string) => {
    const labels: Record<string, string> = {
      device_removed: 'Dispositivo Removido',
      session_conflict: 'Conflito de Sessão',
      instance_reconnected: 'Instância Reconectada',
      instance_disconnected: 'Instância Desconectada',
      instance_restart_attempt: 'Tentativa de Reinício',
      instance_restart_success: 'Reinício com Sucesso',
      session_expired: 'Sessão Expirada',
    };

    return labels[action] || action.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Histórico de Auditoria — {connectionName}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4 py-4">
            {loading ? (
              <div className="flex justify-center p-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : logs.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                Nenhum log de auditoria encontrado para esta instância.
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex gap-3 rounded-lg border bg-muted/30 p-3">
                  <div className="mt-1">{getActionIcon(log.action)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{formatActionName(log.action)}</span>
                      <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                        {format(new Date(log.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </div>

                    {log.details && (
                      <div className="mt-2 rounded border bg-card p-2 text-xs text-muted-foreground">
                        {log.details.cause ? (
                          <p className="mb-1 font-medium text-destructive">
                            Motivo: {String(log.details.cause)}
                          </p>
                        ) : null}
                        <pre className="overflow-x-auto whitespace-pre-wrap font-mono">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}