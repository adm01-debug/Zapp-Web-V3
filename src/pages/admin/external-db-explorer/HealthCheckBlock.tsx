import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Activity, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { queryExternalProxy } from '@/lib/externalProxy';
import { getLogger } from '@/lib/logger';

const log = getLogger('AdminExternalDbExplorer.Health');

interface PingResult {
  ok: boolean;
  ms: number;
  error?: string;
}

interface HealthState {
  loading: boolean;
  pings: PingResult[];
  lastPayload: unknown;
}

/** Health Check Block. */
export function HealthCheckBlock() {
  const [state, setState] = useState<HealthState>({ loading: false, pings: [], lastPayload: null });

  const runPings = async () => {
    setState({ loading: true, pings: [], lastPayload: null });
    const tasks = Array.from({ length: 3 }, async (): Promise<PingResult> => {
      const t0 = performance.now();
      try {
        const res = await queryExternalProxy({
          action: 'rpc',
          rpc: 'rpc_dashboard_home',
          params: { p_instance: 'wpp2', p_assigned_to: null },
        });
        return { ok: !res.error, ms: Math.round(performance.now() - t0), error: res.error };
      } catch (e) {
        return { ok: false, ms: Math.round(performance.now() - t0), error: (e as Error).message };
      }
    });
    const pings = await Promise.all(tasks);
    let lastPayload: unknown = null;
    try {
      const res = await queryExternalProxy({
        action: 'rpc',
        rpc: 'rpc_dashboard_home',
        params: { p_instance: 'wpp2', p_assigned_to: null },
      });
      lastPayload = res.data;
    } catch (e) {
      log.warn('payload sample failed', { err: (e as Error).message });
    }
    setState({ loading: false, pings, lastPayload });
  };

  const okCount = state.pings.filter((p) => p.ok).length;
  const allOk = state.pings.length > 0 && okCount === state.pings.length;
  const anyOk = okCount > 0;
  const latencies = state.pings.filter((p) => p.ok).map((p) => p.ms);
  const min = latencies.length ? Math.min(...latencies) : null;
  const max = latencies.length ? Math.max(...latencies) : null;
  const avg = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4" /> Health check (FATOR X via proxy)
        </CardTitle>
        <Button onClick={runPings} disabled={state.loading} size="sm">
          {state.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Testar conexão'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {state.pings.length === 0 && !state.loading && (
          <p className="text-sm text-muted-foreground">
            Dispara 3 chamadas em paralelo para <code>rpc_dashboard_home</code>.
          </p>
        )}

        {state.pings.length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {allOk ? (
                <Badge className="bg-success text-success-foreground">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Saudável
                </Badge>
              ) : anyOk ? (
                <Badge variant="secondary">
                  <AlertTriangle className="h-3 w-3 mr-1" /> Instável ({okCount}/{state.pings.length})
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <AlertTriangle className="h-3 w-3 mr-1" /> Falha ({okCount}/{state.pings.length})
                </Badge>
              )}
              {avg !== null && (
                <span className="text-sm text-muted-foreground">
                  latência min/avg/max: <strong>{min}/{avg}/{max} ms</strong>
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {state.pings.map((p, i) => (
                <div key={`ping-${i}`} className="rounded-md border p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Ping {i + 1}</span>
                    {p.ok ? (
                      <Badge variant="outline" className="text-success border-success/30">{p.ms} ms</Badge>
                    ) : (
                      <Badge variant="destructive">{p.ms} ms</Badge>
                    )}
                  </div>
                  {p.error && <p className="mt-1 text-destructive truncate" title={p.error}>{p.error}</p>}
                </div>
              ))}
            </div>

            {!allOk && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Conexão com instabilidade</AlertTitle>
                <AlertDescription>
                  Verifique <code>EXTERNAL_SUPABASE_URL</code>/<code>EXTERNAL_SUPABASE_ANON_KEY</code> nos secrets
                  e os logs da edge function <code>external-db-proxy</code>.
                </AlertDescription>
              </Alert>
            )}

            {state.lastPayload != null && (
              <details className="rounded-md border bg-muted/30 p-2 text-xs">
                <summary className="cursor-pointer text-muted-foreground">Ver payload de exemplo</summary>
                <pre className="mt-2 overflow-auto max-h-72">{JSON.stringify(state.lastPayload, null, 2)}</pre>
              </details>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
