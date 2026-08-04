import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Shield, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { useACLAlerts, type ACLAlert } from '@/hooks/useACLAlerts';
import { cn } from '@/lib/utils';

/** Rótulos amigáveis para os alert_type emitidos pela auditoria de ACL. */
const ALERT_TYPE_LABELS: Record<string, string> = {
  ANON_EXECUTE_GRANTED: 'EXECUTE concedido a anon',
  ANON_SELECT_VIEW: 'SELECT anon em view',
  VIEW_MISSING_SECURITY_INVOKER: 'View sem security_invoker',
};

const getAlertTypeLabel = (type: string): string => ALERT_TYPE_LABELS[type] ?? type;

function SeverityBadge({ severity }: { severity: string }) {
  const normalized = severity?.toUpperCase() ?? '';
  const classes =
    normalized === 'CRITICAL'
      ? 'bg-destructive/15 text-destructive border-destructive/30'
      : normalized === 'HIGH'
        ? 'bg-warning/15 text-warning border-warning/30'
        : 'bg-secondary/30 text-muted-foreground border-secondary/40';
  return (
    <Badge variant="outline" className={cn('gap-1 border', classes)}>
      {normalized === 'CRITICAL' ? (
        <AlertTriangle className="h-3 w-3" />
      ) : (
        <Shield className="h-3 w-3" />
      )}
      {severity ?? 'N/A'}
    </Badge>
  );
}

function StatusBadge({ resolved }: { resolved: boolean }) {
  return resolved ? (
    <Badge variant="outline" className="gap-1 border-success/40 bg-success/10 text-success">
      <CheckCircle2 className="h-3 w-3" /> Resolvido
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 border-destructive/40 bg-destructive/10 text-destructive">
      <AlertTriangle className="h-3 w-3" /> Aberto
    </Badge>
  );
}

/**
 * SEGURANCA-09: painel admin de alertas de ACL (zapp.security_acl_alerts).
 * Antes: cron gerava ~2189 alertas sem nenhuma tela consumindo.
 */
export default function AdminACLAlertsPage() {
  const { alerts, loading } = useACLAlerts();

  const openCount = alerts.filter((a) => !a.resolved_at).length;
  const criticalCount = alerts.filter(
    (a) => !a.resolved_at && a.severity?.toUpperCase() === 'CRITICAL'
  ).length;

  const renderDetails = (alert: ACLAlert) => {
    if (!alert.details) return null;
    try {
      const details =
        typeof alert.details === 'string' ? JSON.parse(alert.details) : alert.details;
      return <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{JSON.stringify(details, null, 2)}</pre>;
    } catch {
      return <span className="text-xs text-muted-foreground">{String(alert.details)}</span>;
    }
  };

  return (
    <div className="container mx-auto space-y-8 py-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Shield className="h-8 w-8 text-primary" />
            Alertas de ACL
          </h1>
          <p className="text-muted-foreground">
            Permissões e exposições de privilégios detectadas pela auditoria de segurança.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Alertas</CardTitle>
            <Shield className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{alerts.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Abertos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{openCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Críticos Abertos</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{criticalCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Alertas Recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Detectado</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Severidade</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Objeto</TableHead>
                  <TableHead>Privilégio</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      Nenhum alerta de ACL encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  alerts.map((alert) => (
                    <TableRow key={alert.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(alert.detected_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <div className="truncate" title={alert.alert_type}>
                          {getAlertTypeLabel(alert.alert_type)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <SeverityBadge severity={alert.severity} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {alert.role_name}
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate" title={alert.object_name}>
                        {alert.object_name}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{alert.privilege}</TableCell>
                      <TableCell>
                        <StatusBadge resolved={!!alert.resolved_at} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
          {alerts.length > 0 && (
            <div className="mt-4 space-y-2">
              {alerts.map((alert) =>
                alert.details ? (
                  <details key={`details-${alert.id}`} className="rounded-lg border bg-muted/20 p-2">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                      Detalhes — alerta #{alert.id}
                    </summary>
                    <div className="mt-2">{renderDetails(alert)}</div>
                  </details>
                ) : null
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
