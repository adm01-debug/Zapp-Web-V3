import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Database, RefreshCw, Webhook } from 'lucide-react';
import { isExternalConfigured } from '@/integrations/supabase/externalClient';
import { useBridgeHealth } from '@/hooks/connections/useBridgeHealth';
import { BridgeStatusBadge } from './bridge/BridgeStatusBadge';
import { BridgeInfoRow } from './bridge/BridgeInfoRow';
import { BridgeStatCard } from './bridge/BridgeStatCard';

/**
 * Painel da ponte Supabase ↔ Evolution API (FATOR X).
 * Refatorado: lógica extraída para useBridgeHealth, subcomponentes modularizados.
 */
export function BridgeSupabaseView() {
  const { status, health, checkedAt, error, runCheck } = useBridgeHealth();
  const externalUrl = import.meta.env.VITE_EXTERNAL_SUPABASE_URL as string | undefined;

  return (
    <div className="p-6 space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Database className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Ponte Supabase ↔ Evolution API</CardTitle>
                <CardDescription>
                  Backend externo (FATOR X) que recebe webhooks da Evolution API e
                  persiste todas as mensagens, contatos e conversas.
                </CardDescription>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={runCheck}
              disabled={status === 'checking'}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${status === 'checking' ? 'animate-spin' : ''}`} />
              Testar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <BridgeStatusBadge status={status} isConfigured={isExternalConfigured} />
            {checkedAt && (
              <span className="text-xs text-muted-foreground">
                Última verificação: {checkedAt.toLocaleTimeString()}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <BridgeInfoRow label="Endpoint" value={externalUrl ?? '—'} mono />
            <BridgeInfoRow
              label="Webhook Evolution"
              value={externalUrl ? `${externalUrl}/functions/v1/evolution-webhook` : '—'}
              mono
            />
            <BridgeInfoRow label="Instância" value="wpp2" />
            <BridgeInfoRow
              label="Auth"
              value={isExternalConfigured ? 'Anon key configurada' : 'Faltando'}
            />
          </div>

          {error && (
            <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {health && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Webhook className="w-4 h-4" />
              Saúde do Webhook
            </CardTitle>
            <CardDescription>
              Métricas em tempo real de eventos recebidos da Evolution API.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <BridgeStatCard label="Janela" value={health.window_label ?? '—'} />
              <BridgeStatCard label="Total" value={fmt(health.events_total)} />
              <BridgeStatCard label="OK" value={fmt(health.events_ok)} tone="success" />
              <BridgeStatCard label="Falhas" value={fmt(health.events_failed)} tone="error" />
              <BridgeStatCard
                label="Latência média"
                value={health.avg_latency_ms != null ? `${Math.round(health.avg_latency_ms)} ms` : '—'}
              />
              <BridgeStatCard
                label="Último evento"
                value={health.last_event_at ? new Date(health.last_event_at).toLocaleString() : '—'}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return new Intl.NumberFormat('pt-BR').format(n);
}
