/**
 * SelfHostedHealthPage — `/admin/self-hosted-health`
 *
 * Painel de diagnóstico que valida a anon key do Supabase self-hosted,
 * a leitura via cliente Supabase e a conectividade ao MCP self-hosted.
 */
import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Activity, CheckCircle2, AlertTriangle, Loader2, XCircle } from 'lucide-react';
import { runSelfHostedDiagnostics, type DiagnosticResult } from '@/lib/selfHostedDiagnostics';

/** Renders a colored Badge for a diagnostic step status: ok, warn, or fail. */
function statusBadge(status: DiagnosticResult['status']) {
  if (status === 'ok') {
    return (
      <Badge className="bg-success text-success-foreground">
        <CheckCircle2 className="mr-1 h-3 w-3" /> OK
      </Badge>
    );
  }
  if (status === 'warn') {
    return (
      <Badge variant="secondary">
        <AlertTriangle className="mr-1 h-3 w-3" /> Atenção
      </Badge>
    );
  }
  return (
    <Badge variant="destructive">
      <XCircle className="mr-1 h-3 w-3" /> Falha
    </Badge>
  );
}

/** Default export. */
export default function SelfHostedHealthPage() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const runIdRef = useRef(0);

  useEffect(() => {
    return () => {
      runIdRef.current += 1;
    };
  }, []);

  const run = async () => {
    const myRunId = ++runIdRef.current;
    setLoading(true);
    setResults([]);
    setRunError(null);
    try {
      const r = await runSelfHostedDiagnostics();
      if (runIdRef.current !== myRunId) return;
      setResults(r);
      setRanAt(new Date());
    } catch (err) {
      if (runIdRef.current !== myRunId) return;
      setRunError(err instanceof Error ? err.message : String(err));
    } finally {
      if (runIdRef.current === myRunId) setLoading(false);
    }
  };

  const okCount = results.filter((r) => r.status === 'ok').length;
  const allOk = results.length > 0 && okCount === results.length;

  return (
    <main className="container mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Diagnóstico Supabase Self-Hosted + MCP
        </h1>
        <p className="text-sm text-muted-foreground">
          Valida a anon key, a leitura via cliente Supabase e o handshake com o MCP self-hosted.
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" />
            Bateria de testes
          </CardTitle>
          <Button onClick={run} disabled={loading} size="sm">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Testando…
              </>
            ) : (
              'Testar agora'
            )}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {runError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Erro ao executar diagnóstico</AlertTitle>
              <AlertDescription>{runError}</AlertDescription>
            </Alert>
          )}

          {results.length === 0 && !loading && !runError && (
            <p className="text-sm text-muted-foreground">
              Clique em <strong>Testar agora</strong> para disparar 5 probes em paralelo.
            </p>
          )}

          {results.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {allOk ? (
                  <Badge className="bg-success text-success-foreground">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Tudo saudável ({okCount}/
                    {results.length})
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <AlertTriangle className="mr-1 h-3 w-3" /> {okCount}/{results.length} passaram
                  </Badge>
                )}
                {ranAt && (
                  <span className="text-muted-foreground">
                    Executado às {ranAt.toLocaleTimeString('pt-BR')}
                  </span>
                )}
              </div>

              <ul className="space-y-2">
                {results.map((r) => (
                  <li key={r.step} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.step}</p>
                        <p
                          className={`text-sm ${
                            r.status === 'fail' ? 'text-destructive' : 'text-muted-foreground'
                          }`}
                        >
                          {r.message}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {r.latencyMs} ms
                        </span>
                        {statusBadge(r.status)}
                      </div>
                    </div>
                    {r.details !== undefined && (
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-muted-foreground">
                          Ver detalhes
                        </summary>
                        <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted/40 p-2">
                          {JSON.stringify(r.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </li>
                ))}
              </ul>

              {!allOk && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Alguma probe falhou</AlertTitle>
                  <AlertDescription>
                    Verifique a URL e a anon key em <code>src/integrations/supabase/client.ts</code>{' '}
                    e o endpoint MCP em <code>.mcp.json</code>. Se o MCP retornar CORS, valide via{' '}
                    <code>curl</code> a partir de um terminal.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
