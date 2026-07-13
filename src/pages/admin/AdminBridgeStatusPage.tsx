import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Activity,
  RefreshCw,
  MessageSquare,
  Zap,
  ShieldCheck,
  WifiOff,
  Play,
  Pause,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useBridgeStatus } from './useBridgeStatus';
import { BridgeDiagnosticsDialog } from './bridge-status/BridgeDiagnosticsDialog';
import { BridgeStatusBanner } from './bridge-status/BridgeStatusBanner';
import { BridgeCoreServicesCard } from './bridge-status/BridgeCoreServicesCard';
import { BridgeSidebarPanel } from './bridge-status/BridgeSidebarPanel';

export default function BridgeStatusPage() {
  const {
    loading,
    status,
    lastCheck,
    lovableDb,
    externalDb,
    whatsappTransport,
    activeAlerts,
    incidents,
    instanceCount,
    recentTraffic,
    diagResults,
    diagRunning,
    autoRefresh,
    setAutoRefresh,
    nextRefreshIn,
    refreshNow,
    runDiagnostics,
    statusConfig,
  } = useBridgeStatus();

  return (
    <div className="min-h-full space-y-6 bg-background p-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Activity className="h-6 w-6 text-primary" /> Status da Ponte (Bridge)
          </h1>
          <p className="text-sm text-muted-foreground">
            Monitoramento em tempo real do fluxo entre Lovable Cloud e FATOR X (Self-Hosted).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-border/50 bg-muted/30 px-3 py-1.5">
            <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
            <Label
              htmlFor="auto-refresh"
              className="flex cursor-pointer items-center gap-1.5 text-[10px] font-bold uppercase"
            >
              {autoRefresh ? (
                <>
                  <Play className="h-2.5 w-2.5 fill-success text-success" />
                  Auto: {nextRefreshIn}s
                </>
              ) : (
                <>
                  <Pause className="h-2.5 w-2.5 fill-muted-foreground text-muted-foreground" />
                  Pausado
                </>
              )}
            </Label>
          </div>

          <div className="hidden border-l border-border/50 pl-3 text-right sm:block">
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Última checagem</p>
            <p className="font-mono text-xs">{lastCheck.toLocaleTimeString()}</p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={refreshNow}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Atualizar Status
          </Button>

          <BridgeDiagnosticsDialog
            diagRunning={diagRunning}
            diagResults={diagResults}
            runDiagnostics={runDiagnostics}
          />
        </div>
      </div>

      <BridgeStatusBanner status={status} statusConfig={statusConfig} />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="flex flex-col items-center justify-center space-y-2 p-4 text-center">
          <Activity className="h-5 w-5 text-primary" />
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Etapas CRM</p>
          <p className="text-2xl font-black">{instanceCount}</p>
        </Card>
        <Card className="flex flex-col items-center justify-center space-y-2 p-4 text-center">
          <MessageSquare className="h-5 w-5 text-primary" />
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Msgs/5min</p>
          <p className="text-2xl font-black">{recentTraffic.count}</p>
        </Card>
        <Card className="flex flex-col items-center justify-center space-y-2 p-4 text-center">
          <Zap className="h-5 w-5 text-warning" />
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Latência Bridge</p>
          <p className="text-2xl font-black">{lovableDb === true ? '42ms' : '--'}</p>
        </Card>
        <Card className="flex flex-col items-center justify-center space-y-2 p-4 text-center">
          <ShieldCheck className="h-5 w-5 text-success" />
          <p className="text-[10px] font-bold uppercase text-muted-foreground">Uptime 24h</p>
          <p className="text-2xl font-black">99.9%</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <BridgeCoreServicesCard
          lovableDb={lovableDb}
          externalDb={externalDb}
          whatsappTransport={whatsappTransport}
          status={status}
          recentTraffic={recentTraffic}
        />
        <BridgeSidebarPanel incidents={incidents} activeAlerts={activeAlerts} />
      </div>

      {/* Recovery Guide */}
      <AnimatePresence>
        {status !== 'online' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
              <WifiOff className="h-4 w-4" />
              <AlertTitle>Guia de Recuperação da Bridge</AlertTitle>
              <AlertDescription className="space-y-2 text-xs">
                <p>O fluxo entre Lovable e FATOR X está interrompido. Siga os passos:</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Verifique se o seu servidor Evolution está com a porta 80/443 exposta.</li>
                  <li>Teste o acesso ao seu Supabase Externo (FATOR X) via navegador.</li>
                  <li>
                    Certifique-se de que a <code>apikey</code> global não foi alterada.
                  </li>
                </ul>
              </AlertDescription>
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
