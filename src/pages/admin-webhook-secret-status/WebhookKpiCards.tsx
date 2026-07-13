import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  KeyRound,
  Activity,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SecretInfo {
  configured: boolean;
  length: number;
  hashPrefix: string | null;
  strictMode: boolean;
  checkedAt: string;
}

interface LastEvent {
  created_at: string;
  event_type: string;
  instance_name?: string | null;
}

interface WebhookKpiCardsProps {
  secret: SecretInfo | null | undefined;
  enabled: boolean;
  total24h: number;
  scopeLabel: string;
  lastEvent: LastEvent | null | undefined;
  validationRate: number;
  validSigned: number;
  invalidSigned: number;
  unsigned: number;
  secretLoading: boolean;
  eventsLoading: boolean;
}

export function WebhookKpiCards({
  secret,
  enabled,
  total24h,
  scopeLabel,
  lastEvent,
  validationRate,
  validSigned,
  invalidSigned,
  unsigned,
  secretLoading,
  eventsLoading,
}: WebhookKpiCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <KeyRound className="h-4 w-4" />
            WEBHOOK_SECRET
          </CardTitle>
        </CardHeader>
        <CardContent>
          {secretLoading ? (
            <Skeleton className="h-8 w-24" />
          ) : secret?.configured ? (
            <>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-success" />
                <Badge variant="success">Configurado</Badge>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {secret.length} chars · #{secret.hashPrefix}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-destructive" />
                <Badge variant="destructive">Ausente</Badge>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">Modo não-strict ativo</div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Activity className="h-4 w-4" />
            Webhook
          </CardTitle>
        </CardHeader>
        <CardContent>
          {eventsLoading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <>
              <div className="flex items-center gap-2">
                {enabled ? (
                  <CheckCircle2 className="h-5 w-5 text-success" />
                ) : (
                  <XCircle className="h-5 w-5 text-muted-foreground" />
                )}
                <Badge variant={enabled ? 'success' : 'subtle'}>
                  {enabled ? 'Habilitado' : 'Inativo'}
                </Badge>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {total24h} eventos / 24h ({scopeLabel})
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4" />
            Último recebimento
          </CardTitle>
        </CardHeader>
        <CardContent>
          {eventsLoading ? (
            <Skeleton className="h-8 w-32" />
          ) : lastEvent ? (
            <>
              <div className="text-lg font-semibold">
                {formatDistanceToNow(new Date(lastEvent.created_at), {
                  addSuffix: true,
                  locale: ptBR,
                })}
              </div>
              <div className="mt-1 truncate text-xs text-muted-foreground">
                {lastEvent.event_type}
                {lastEvent.instance_name ? ` · ${lastEvent.instance_name}` : ''}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">Nenhum evento</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="h-4 w-4" />
            Assinatura validada — {scopeLabel}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {eventsLoading ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <>
              <div className="text-2xl font-bold">
                {validationRate}
                <span className="text-base text-muted-foreground">%</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {validSigned} válidas · {invalidSigned} inválidas · {unsigned} sem
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
