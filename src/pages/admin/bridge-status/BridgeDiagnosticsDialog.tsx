import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Activity, Bug, Loader2, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { safeClient } from '@/integrations/supabase/safeClient';
import { cn } from '@/lib/utils';
import type { DiagnosticResult } from '@/lib/evolutionDiagnostics';

interface BridgeDiagnosticsDialogProps {
  diagRunning: boolean;
  diagResults: DiagnosticResult[] | null;
  runDiagnostics: () => void;
}

export function BridgeDiagnosticsDialog({
  diagRunning,
  diagResults,
  runDiagnostics,
}: BridgeDiagnosticsDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          onClick={runDiagnostics}
          disabled={diagRunning}
          className="gap-2"
        >
          {diagRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Bug className="h-3.5 w-3.5" />
          )}
          Teste de Conexão
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" /> Diagnóstico da Ponte Evolution
          </DialogTitle>
          <DialogDescription>
            Validação técnica de credenciais, rede e permissões.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {diagRunning && !diagResults && (
            <div className="flex flex-col items-center justify-center gap-3 py-8">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="animate-pulse text-sm text-muted-foreground">Varrendo serviços...</p>
            </div>
          )}

          {diagResults && (
            <div className="space-y-3">
              {diagResults.map((res) => (
                <div
                  key={res.step}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border p-3',
                    res.status === 'ok'
                      ? 'border-success/20 bg-success/5'
                      : res.status === 'warn'
                        ? 'border-warning/20 bg-warning/5'
                        : 'border-destructive/20 bg-destructive/5'
                  )}
                >
                  <div className="mt-0.5">
                    {res.status === 'ok' && <CheckCircle2 className="h-4 w-4 text-success" />}
                    {res.status === 'warn' && <AlertTriangle className="h-4 w-4 text-warning" />}
                    {res.status === 'fail' && <XCircle className="h-4 w-4 text-destructive" />}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold leading-none">{res.step}</p>
                    <p className="text-xs text-muted-foreground">{res.message}</p>
                    {res.details && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[10px] text-primary/70 hover:underline">
                          Ver detalhes técnicos
                        </summary>
                        <pre className="mt-2 max-h-32 overflow-x-auto rounded bg-muted/40 p-2 font-mono text-[10px]">
                          {JSON.stringify(safeClient.maskSensitiveData(res.details), null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between gap-2 border-t pt-4">
            <p className="max-w-[200px] text-[10px] text-muted-foreground">
              Este teste não afeta o tráfego real de mensagens.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={runDiagnostics} disabled={diagRunning}>
                Refazer Teste
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
