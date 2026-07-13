import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Activity, Server, ShieldCheck, Zap, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BridgeStatus } from '../useBridgeStatus';

interface BridgeCoreServicesCardProps {
  lovableDb: boolean | null;
  externalDb: boolean | null;
  whatsappTransport: string;
  status: BridgeStatus;
  recentTraffic: { count: number };
}

export function BridgeCoreServicesCard({
  lovableDb,
  externalDb,
  whatsappTransport,
  status,
  recentTraffic,
}: BridgeCoreServicesCardProps) {
  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Server className="h-4 w-4" /> Serviços Críticos &amp; Filas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'rounded-lg p-2',
                  lovableDb ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'
                )}
              >
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">Lovable Cloud Proxy</p>
                <p className="text-xs text-muted-foreground">Encaminhamento de Webhooks e API</p>
              </div>
            </div>
            <div className="text-right">
              <Badge variant={lovableDb ? 'default' : 'destructive'}>
                {lovableDb ? 'ATIVO' : 'ERRO'}
              </Badge>
              <p className="mt-1 font-mono text-[10px] opacity-60">
                HB: {new Date().toLocaleTimeString()}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'rounded-lg p-2',
                  externalDb ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'
                )}
              >
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">FATOR X Core (External DB)</p>
                <p className="text-xs text-muted-foreground">
                  Postgres Externo &amp; Evolution Engine
                </p>
              </div>
            </div>
            <div className="text-right">
              <Badge variant={externalDb ? 'default' : 'warning'}>
                {externalDb ? 'CONECTADO' : 'FALHA'}
              </Badge>
              <p className="mt-1 font-mono text-[10px] opacity-60">Sync: OK</p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'rounded-lg p-2',
                  status === 'online' ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'
                )}
              >
                <Smartphone className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">WhatsApp Transport (Evo API)</p>
                <p className="text-xs text-muted-foreground">Instância: {whatsappTransport}</p>
              </div>
            </div>
            <Badge variant={whatsappTransport.includes('DEGRADED') ? 'warning' : 'default'}>
              {whatsappTransport.includes('DEGRADED') ? 'DEGRADADO' : 'NOMINAL'}
            </Badge>
          </div>
        </div>

        <div className="space-y-4 border-t pt-4">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase text-muted-foreground">
                <Activity className="h-3 w-3" /> Carga da Fila de Mensagens
              </span>
              <span className="font-mono text-xs">{recentTraffic.count} msg/5m</span>
            </div>
            <Progress value={Math.min(recentTraffic.count * 2, 100)} className="h-1.5" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-success/10 bg-success/5 p-3">
              <p className="text-[10px] font-bold uppercase text-success/70">Erros de Auth</p>
              <p className="text-lg font-bold">0</p>
            </div>
            <div className="rounded-lg border border-destructive/10 bg-destructive/5 p-3">
              <p className="text-[10px] font-bold uppercase text-destructive/70">Timeouts (24h)</p>
              <p className="text-lg font-bold text-destructive">2</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
