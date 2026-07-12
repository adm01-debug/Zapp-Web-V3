// @ts-nocheck
import { useState, useEffect } from 'react';
import { getLogger } from '@/lib/logger';

import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
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
  details: Record<string, unknown> | null;
}

interface ConnectionAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string;
  connectionName: string;
}

export function ConnectionAuditDialog({ open, onOpenChange, instanceId, connectionName }: ConnectionAuditDialogProps) {
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
      setLogs(data || []);
    } catch (err) {
      log.error('Failed to fetch connection audit logs', err);
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (action: string) => {
    if (action.includes('failure') || action.includes('degraded') || action.includes('disconnected') || action === 'device_removed' || action === 'session_conflict') {
      return <AlertCircle className="w-4 h-4 text-destructive" />;
    }
    if (action.includes('success') || action.includes('healthy') || action.includes('completed') || action === 'instance_reconnected') {
      return <CheckCircle2 className="w-4 h-4 text-primary" />;
    }
    if (action.includes('attempt') || action.includes('restart')) {
      return <RefreshCw className="w-4 h-4 text-warning-foreground" />;
    }
    return <Info className="w-4 h-4 text-muted-foreground" />;
  };

  const formatActionName = (action: string) => {
    const labels: Record<string, string> = {
      device_removed: 'Dispositivo Removido',
      session_conflict: 'Conflito de Sessão',
      instance_reconnected: 'Instância Reconectada',
      instance_disconnected: 'Instância Desconectada',
      instance_restart_attempt: 'Tentativa de Reinício',
      instance_restart_success: 'Reinício com Sucesso',
      session_expired: 'Sessão Expirada'
    };
    
    return labels[action] || action
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Histórico de Auditoria — {connectionName}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4 py-4">
            {loading ? (
              <div className="flex justify-center p-8">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum log de auditoria encontrado para esta instância.
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex gap-3 p-3 rounded-lg border bg-muted/30">
                  <div className="mt-1">{getActionIcon(log.action)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm">
                        {formatActionName(log.action)}
                      </span>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {format(new Date(log.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </div>
                    
                    {log.details && (
                      <div className="mt-2 text-xs text-muted-foreground bg-card p-2 rounded border">
                        {log.details.cause && (
                          <p className="font-medium text-destructive mb-1">
                            Motivo: {log.details.cause}
                          </p>
                        )}
                        <pre className="font-mono overflow-x-auto whitespace-pre-wrap">
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