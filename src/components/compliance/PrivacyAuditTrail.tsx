import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollText, RefreshCw, Inbox } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useLGPDAuditLogs } from '@/hooks/useLGPDAuditLogs';
import { useAuth } from '@/features/auth';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const ACTION_LABELS: Record<string, string> = {
  gdpr_deletion_request: 'Solicitação de exclusão (esquecimento)',
  gdpr_export_request: 'Solicitação de exportação',
  gdpr_export_blocked: 'Exportação bloqueada por política',
  consent_granted: 'Consentimento concedido',
  consent_revoked: 'Consentimento revogado',
  data_export: 'Exportação de dados',
  data_deletion: 'Eliminação de dados',
  privacy_policy_viewed: 'Política de privacidade visualizada',
};

function describeAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/** Privacy Audit Trail component for the compliance section. */
export function PrivacyAuditTrail() {
  const { user } = useAuth();
  const { logs, loading, error, refetch } = useLGPDAuditLogs(user?.id, 50);

  return (
    <Card className="border-secondary/30">
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <ScrollText className="w-4 h-4" /> Histórico de Auditoria — Privacidade
          </CardTitle>
          <CardDescription>Registros imutáveis das ações relacionadas aos seus dados</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={refetch} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Atualizar
        </Button>
      </CardHeader>
      <CardContent>
        {loading && logs.length === 0 && (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        )}

        {error && !loading && (
          <p className="text-sm text-destructive" role="alert">
            Não foi possível carregar o histórico: {error}
          </p>
        )}

        {!loading && !error && logs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <Inbox className="w-8 h-8 mb-2 opacity-60" aria-hidden="true" />
            <p className="text-sm">Nenhuma ação de privacidade registrada ainda.</p>
            <p className="text-xs mt-1">
              Solicitações de exportação, exclusão e mudanças de consentimento aparecerão aqui.
            </p>
          </div>
        )}

        {logs.length > 0 && (
          <ul className="divide-y divide-border">
            {logs.map((entry) => (
              <li key={entry.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{describeAction(entry.action)}</p>
                  {entry.entity_type && (
                    <p className="text-xs text-muted-foreground">
                      Entidade: <span className="">{entry.entity_type}</span>
                      {entry.entity_id ? ` · ${entry.entity_id.slice(0, 8)}…` : ''}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true, locale: ptBR })}
                    {' · '}
                    {new Date(entry.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] whitespace-nowrap">{entry.action}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
