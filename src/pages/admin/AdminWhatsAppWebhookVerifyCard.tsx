import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, AlertTriangle, CheckCircle2, XCircle, RefreshCw, Activity } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { VerifyResult } from './adminWhatsAppModeTypes';

interface Props {
  verify: VerifyResult | null;
  verifyLoading: boolean;
  onRunVerify: () => void;
}

/** Admin Whats App Webhook Verify Card. */
export function AdminWhatsAppWebhookVerifyCard({ verify, verifyLoading, onRunVerify }: Props) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Verificação do Webhook
            </CardTitle>
            <CardDescription>
              Valida o Verify Token (handshake da Meta) e confirma se o webhook está recebendo
              eventos.
            </CardDescription>
          </div>
          <Button onClick={onRunVerify} disabled={verifyLoading} size="sm">
            {verifyLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Executar verificação
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!verify && !verifyLoading && (
          <p className="text-sm text-muted-foreground">
            Clique em "Executar verificação" para checar o handshake do Verify Token e a entrega de
            eventos das últimas 24h.
          </p>
        )}

        {verify && (
          <>
            {/* Handshake */}
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {verify.handshake.status === 'pass' && (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  )}
                  {verify.handshake.status === 'fail' && (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  {verify.handshake.status === 'skip' && (
                    <AlertTriangle className="h-4 w-4 text-warning-foreground" />
                  )}
                  <span className="text-sm font-medium">1. Handshake do Verify Token</span>
                </div>
                <Badge
                  variant={
                    verify.handshake.status === 'pass'
                      ? 'default'
                      : verify.handshake.status === 'skip'
                        ? 'secondary'
                        : 'destructive'
                  }
                >
                  {verify.handshake.status === 'pass'
                    ? 'OK'
                    : verify.handshake.status === 'skip'
                      ? 'Pulado'
                      : 'Falhou'}
                </Badge>
              </div>
              <div className="space-y-0.5 pl-6 text-xs text-muted-foreground">
                {verify.handshake.status === 'pass' && (
                  <p>
                    Echo do challenge confere e HTTP {verify.handshake.httpStatus} em{' '}
                    {verify.handshake.durationMs}ms. O token configurado nos secrets bate com o que
                    o webhook valida.
                  </p>
                )}
                {verify.handshake.status === 'fail' && (
                  <>
                    <p>
                      HTTP {verify.handshake.httpStatus ?? '—'} • echo confere:{' '}
                      {String(verify.handshake.echoMatches ?? false)}
                    </p>
                    {verify.handshake.error && (
                      <p className="text-destructive">{verify.handshake.error}</p>
                    )}
                    <p>
                      Verifique se o secret <code>WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN</code> está
                      igual ao colado no painel do Meta.
                    </p>
                  </>
                )}
                {verify.handshake.status === 'skip' && <p>{verify.handshake.error}</p>}
              </div>
            </div>

            {/* Delivery */}
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {verify.delivery.status === 'pass' ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-warning-foreground" />
                  )}
                  <span className="text-sm font-medium">
                    2. Recebimento de eventos (últimas 24h)
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    eventos: {verify.delivery.counts24h.event}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    handshakes: {verify.delivery.counts24h.handshake}
                  </Badge>
                  {verify.delivery.counts24h.invalid_signature > 0 && (
                    <Badge variant="destructive" className="text-[10px]">
                      assinatura inválida: {verify.delivery.counts24h.invalid_signature}
                    </Badge>
                  )}
                  {verify.delivery.counts24h.invalid_token > 0 && (
                    <Badge variant="destructive" className="text-[10px]">
                      token inválido: {verify.delivery.counts24h.invalid_token}
                    </Badge>
                  )}
                </div>
              </div>
              <p className="pl-6 text-xs text-muted-foreground">{verify.delivery.message}</p>
              {verify.delivery.lastEventAt && (
                <p className="pl-6 text-[11px] text-muted-foreground/80">
                  Último evento:{' '}
                  {formatDistanceToNow(new Date(verify.delivery.lastEventAt), {
                    addSuffix: true,
                    locale: ptBR,
                  })}
                </p>
              )}
            </div>

            {/* Recent activity */}
            {verify.delivery.recent.length > 0 && (
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-xs font-medium">
                  Atividade recente (últimos 10 pings)
                </summary>
                <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">
                  {verify.delivery.recent.map((p) => (
                    <li
                      key={`${p.kind}-${p.created_at}`}
                      className="flex items-center justify-between gap-2 text-[11px]"
                    >
                      <span className="flex items-center gap-2">
                        <Badge
                          variant={
                            p.kind === 'event'
                              ? 'default'
                              : p.kind.startsWith('invalid')
                                ? 'destructive'
                                : 'secondary'
                          }
                          className="text-[9px]"
                        >
                          {p.kind}
                        </Badge>
                        <span className="truncate text-muted-foreground">
                          {JSON.stringify(p.meta).slice(0, 80)}
                        </span>
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {formatDistanceToNow(new Date(p.created_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <p className="text-[11px] text-muted-foreground">
              Verificado em {new Date(verify.checkedAt).toLocaleTimeString('pt-BR')}.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
