import { useMemo, useState } from 'react';
import { Play, ShieldAlert, RefreshCw, Trash2, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MIGRATE_ACTIONS, type MigrateAction } from '@/services/migration/migrateHelperClient';
import { useMigrationRunner } from '@/features/admin/hooks/useMigrationRunner';
import { cn } from '@/lib/utils';

const ACTION_LABELS: Record<MigrateAction, string> = {
  ping: 'Ping — verificar disponibilidade',
  status: 'Status — estado atual da migração',
  migrate: 'Migrate — executar migração',
  verify: 'Verify — validar pós-migração',
};

/** Painel administrativo para acionar a edge function migrate-helper e acompanhar o status. */
export default function MigrationStatusPanel() {
  const [action, setAction] = useState<MigrateAction>('ping');
  const [accessKey, setAccessKey] = useState('');
  const { runningAction, lastResult, history, run, cancel, clearHistory } = useMigrationRunner();

  const isRunning = runningAction !== null;
  const payloadText = useMemo(
    () => (lastResult ? JSON.stringify(lastResult.payload, null, 2) : ''),
    [lastResult],
  );

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">Migração de banco</h1>
        <p className="text-sm text-muted-foreground">
          Aciona a edge function <code className="font-mono">migrate-helper</code> com uma ação e exibe o status.
        </p>
      </header>

      <Alert>
        <ShieldAlert className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>Chave de acesso somente em memória</AlertTitle>
        <AlertDescription>
          A chave não é salva no navegador e a ação <code className="font-mono">credentials</code> está
          bloqueada, pois exporia a service role key ao cliente.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acionar migração</CardTitle>
          <CardDescription>Escolha a ação e informe a chave de acesso do operador.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="migrate-action">Ação</Label>
              <Select value={action} onValueChange={(v) => setAction(v as MigrateAction)}>
                <SelectTrigger id="migrate-action" className="min-h-11">
                  <SelectValue placeholder="Selecione a ação" />
                </SelectTrigger>
                <SelectContent>
                  {MIGRATE_ACTIONS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {ACTION_LABELS[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="migrate-key">Chave de acesso (x-access-key)</Label>
              <Input
                id="migrate-key"
                type="password"
                autoComplete="off"
                className="min-h-11"
                value={accessKey}
                onChange={(e) => setAccessKey(e.target.value)}
                placeholder="Cole a chave do operador"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-11"
              onClick={() => void run(action, accessKey)}
              disabled={isRunning || accessKey.trim().length === 0}
            >
              {isRunning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Play className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {isRunning ? `Executando ${runningAction}…` : 'Executar'}
            </Button>
            <Button variant="outline" className="min-h-11" onClick={cancel} disabled={!isRunning}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              Cancelar
            </Button>
            <Button
              variant="ghost"
              className="min-h-11"
              onClick={clearHistory}
              disabled={history.length === 0}
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Limpar histórico
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status da última execução</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!lastResult ? (
            <p className="text-sm text-muted-foreground">Nenhuma execução nesta sessão.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={lastResult.ok ? 'default' : 'destructive'}>
                  {lastResult.ok ? (
                    <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden="true" />
                  ) : (
                    <XCircle className="mr-1 h-3 w-3" aria-hidden="true" />
                  )}
                  {lastResult.ok ? 'Sucesso' : 'Falha'}
                </Badge>
                <Badge variant="outline">{lastResult.action}</Badge>
                <Badge variant="outline">HTTP {lastResult.status || '—'}</Badge>
                <Badge variant="outline">{lastResult.durationMs} ms</Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(lastResult.finishedAt).toLocaleString('pt-BR')}
                </span>
              </div>
              {lastResult.error && (
                <p className="text-sm text-destructive">{lastResult.error}</p>
              )}
              {payloadText && (
                <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
                  {payloadText}
                </pre>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico da sessão</CardTitle>
          <CardDescription>Até 20 execuções, mais recentes primeiro.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem execuções registradas.</p>
          ) : (
            <ul className="divide-y divide-border">
              {history.map((item, i) => (
                <li
                  key={`${item.finishedAt}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <span className="font-medium text-foreground">{item.action}</span>
                  <span className={cn('text-xs', item.ok ? 'text-muted-foreground' : 'text-destructive')}>
                    {item.ok ? 'OK' : item.error}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.finishedAt).toLocaleTimeString('pt-BR')} · {item.durationMs} ms
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
