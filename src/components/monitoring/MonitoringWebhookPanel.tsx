import { useEffect, useState } from 'react';
import { useMountedRef } from '@/hooks/useMountedRef';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
  Shield,
  PlayCircle,
  Loader2,
  Radio,
  Copy,
  KeyRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { RetryMetricsPanel } from './RetryMetricsPanel';
import { CrossTabDedupePanel } from './CrossTabDedupePanel';
import { DLQPanel } from './DLQPanel';
import { DLQAuditHistory } from './DLQAuditHistory';
import { evolutionInstanceName } from '@/lib/evolutionInstance';
import {
  type SecretStatus,
  type MonitoringWebhookPanelProps,
  ALL_EXPECTED_EVENTS,
  EVENT_CATEGORIES,
} from './MonitoringWebhookPanelTypes';

export function MonitoringWebhookPanel({
  connections,
  webhookTest,
  webhookConfig,
  reconfiguring,
  onTest,
  onReconfigure,
  onCheckConfig,
}: MonitoringWebhookPanelProps) {
  const configuredEvents = webhookConfig?.events || [];
  const [secretStatus, setSecretStatus] = useState<SecretStatus | null>(null);
  const [loadingSecret, setLoadingSecret] = useState(false);
  const mountedRef = useMountedRef();

  const loadSecretStatus = async () => {
    setLoadingSecret(true);
    try {
      const { data, error } = await supabase.functions.invoke('webhook-secret-status');
      if (!mountedRef.current) return;
      if (error) throw error;
      setSecretStatus(data as SecretStatus); // ignore-audit: supabase.functions.invoke returns unknown
    } catch (e) {
      if (mountedRef.current)
        toast.error(
          `Falha ao verificar segredo do webhook: ${e instanceof Error ? e.message : 'erro'}`
        );
    } finally {
      if (mountedRef.current) setLoadingSecret(false);
    }
  };

  useEffect(() => {
    loadSecretStatus();
  }, []);

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('URL copiada!');
  };

  return (
    <div className="space-y-4">
      {/* Webhook Secret Status Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" />
            Segredo HMAC do Webhook
          </CardTitle>
          <CardDescription>
            Status do <code className="text-[10px]">WEBHOOK_SECRET</code> — apenas hash parcial é
            exibido (nunca o valor).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            {secretStatus ? (
              <>
                {secretStatus.configured ? (
                  <Badge className="bg-primary/80 hover:bg-primary/70">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Strict mode ativo
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <AlertTriangle className="mr-1 h-3 w-3" />
                    Sem segredo — webhook aceito sem assinatura
                  </Badge>
                )}
                {secretStatus.configured && (
                  <>
                    <span className="text-xs text-muted-foreground">
                      Comprimento: <span className="">{secretStatus.length}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Hash SHA-256: <span className="">{secretStatus.hashPrefix}…</span>
                    </span>
                  </>
                )}
                <span className="ml-auto text-[10px] text-muted-foreground">
                  Verificado: {new Date(secretStatus.checkedAt).toLocaleTimeString()}
                </span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Carregando…</span>
            )}
            <Button variant="outline" size="sm" onClick={loadSecretStatus} disabled={loadingSecret}>
              {loadingSecret ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Shield className="mr-1 h-3 w-3" />
              )}
              Re-verificar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Retry Metrics Panel */}
      <RetryMetricsPanel />

      {/* Cross-tab dedupe activity (collapsed duplicate sends across tabs) */}
      <CrossTabDedupePanel />

      {/* Dead-Letter Queue Panel */}
      <DLQPanel />

      {/* DLQ audit trail — who reprocessed, when, which IDs, outcome */}
      <DLQAuditHistory />

      {/* Auto-load config for first connection if not loaded */}
      {!webhookConfig && connections.length > 0 && (
        <div className="flex gap-2">
          {connections.map((conn) => (
            <Button
              key={conn.id}
              variant="outline"
              size="sm"
              onClick={() => {
                const n = evolutionInstanceName(conn);
                if (!n) {
                  toast.error('Conexão sem nome de instância roteável. Reconecte via QR.');
                  return;
                }
                onCheckConfig(n);
              }}
            >
              <Shield className="mr-1.5 h-3.5 w-3.5" />
              Carregar config ({conn.instance_name || conn.instance_id})
            </Button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Test Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Send className="h-4 w-4" />
              Teste de Entrega E2E
            </CardTitle>
            <CardDescription>Envio → Webhook → Persistência → Verificação</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {connections.map((conn) => (
              <div
                key={conn.id}
                className="flex items-center justify-between rounded-lg bg-muted/50 p-3"
              >
                <div>
                  <span className="text-sm font-medium">
                    {conn.instance_name || conn.instance_id}
                  </span>
                  <p className="text-[10px] text-muted-foreground">Testa pipeline completo</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    const n = evolutionInstanceName(conn);
                    if (!n) {
                      toast.error('Conexão sem nome de instância roteável. Reconecte via QR.');
                      return;
                    }
                    onTest(n);
                  }}
                  disabled={webhookTest.status === 'testing'}
                >
                  {webhookTest.status === 'testing' ? (
                    <>
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      Testando...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="mr-1 h-3.5 w-3.5" />
                      Testar E2E
                    </>
                  )}
                </Button>
              </div>
            ))}
            {webhookTest.status !== 'idle' && webhookTest.status !== 'testing' && (
              <div
                className={cn(
                  'rounded-lg border p-4',
                  webhookTest.status === 'success'
                    ? 'border-primary/20 bg-primary/5'
                    : 'border-destructive/20 bg-destructive/5'
                )}
              >
                <div className="flex items-center gap-2">
                  {webhookTest.status === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  <span className="text-sm font-medium">
                    {webhookTest.status === 'success' ? 'Sucesso' : 'Falha'}
                  </span>
                  {webhookTest.latencyMs && (
                    <Badge variant="outline" className="text-xs">
                      {webhookTest.latencyMs}ms
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{webhookTest.message}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Config Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4" />
              Configuração do Webhook
            </CardTitle>
            <CardDescription>Diff visual: esperado vs. configurado</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {webhookConfig ? (
              <>
                <div className="flex items-center gap-2">
                  {webhookConfig.configured ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  <span className="text-sm font-medium">
                    {webhookConfig.configured ? 'Configurado' : 'NÃO Configurado'}
                  </span>
                  <Badge variant="outline" className="ml-auto text-[10px]">
                    {configuredEvents.length}/{ALL_EXPECTED_EVENTS.length} eventos
                  </Badge>
                </div>

                {webhookConfig.url && (
                  <div className="rounded-lg bg-muted/50 p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        URL
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0"
                        onClick={() => copyUrl(webhookConfig.url!)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="break-all text-xs">{webhookConfig.url}</p>
                  </div>
                )}

                {/* Event Diff by Category */}
                <div className="space-y-2">
                  {Object.entries(EVENT_CATEGORIES).map(([category, events]) => {
                    const configured = events.filter((e) => configuredEvents.includes(e));
                    const missing = events.filter((e) => !configuredEvents.includes(e));
                    const allOk = missing.length === 0;

                    return (
                      <div key={category} className="rounded-lg bg-muted/30 p-2.5">
                        <div className="mb-1.5 flex items-center gap-2">
                          {allOk ? (
                            <CheckCircle2 className="h-3 w-3 text-primary" />
                          ) : (
                            <AlertTriangle className="h-3 w-3 text-warning-foreground" />
                          )}
                          <span className="text-[11px] font-medium">{category}</span>
                          <span className="ml-auto text-[10px] text-muted-foreground">
                            {configured.length}/{events.length}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {events.map((e) => {
                            const isConfigured = configuredEvents.includes(e);
                            return (
                              <Badge
                                key={e}
                                variant={isConfigured ? 'default' : 'destructive'}
                                className={cn(
                                  'text-[9px]',
                                  isConfigured && 'bg-primary/80 hover:bg-primary/70'
                                )}
                              >
                                {isConfigured ? '✓' : '✗'} {e}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Carregue a configuração de uma conexão.
              </p>
            )}

            {connections.map((conn) => (
              <Button
                key={conn.id}
                className="w-full"
                onClick={() => {
                  const n = evolutionInstanceName(conn);
                  if (!n) {
                    toast.error('Conexão sem nome de instância roteável. Reconecte via QR.');
                    return;
                  }
                  onReconfigure(n);
                }}
                disabled={reconfiguring}
                variant="default"
              >
                {reconfiguring ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Reconfigurando...
                  </>
                ) : (
                  <>
                    <Radio className="mr-2 h-4 w-4" />
                    Reconfigurar ({conn.instance_name || conn.instance_id})
                  </>
                )}
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
