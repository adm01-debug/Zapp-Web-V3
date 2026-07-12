/**
 * HmacSelfTestPage
 * Rota dedicada (/admin/hmac-selftest) que executa o self-test HMAC ao carregar
 * e mostra o resultado em um layout amigável: KPIs, fase com falha, tabela de
 * cenários e histórico de auditoria. Reaproveita HmacAuditHistoryPanel e a
 * mesma edge function `webhook-hmac-selftest` consumida pelo botão da tela de
 * status.
 */
import { useEffect, useMemo, useState } from 'react';
import { useHmacSelfTest, type Phase } from '@/hooks/admin/useHmacSelfTest';
import { ACTIVE_WHATSAPP_INSTANCE } from '@/lib/constants/whatsappInstances';
import { useSearchParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  ShieldCheck,
  ShieldAlert,
  FlaskConical,
  Loader2,
  RotateCcw,
  ArrowLeft,
  Clock,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';
import { HmacAuditHistoryPanel } from '@/pages/admin-webhook-secret-status/HmacAuditHistoryPanel';

const log = getLogger('HmacSelfTestPage');

const PHASE_LABEL: Record<Phase, string> = {
  config: 'Configuração do secret',
  'parse-body': 'Parsing do body',
  'build-payload': 'Montagem do payload',
  sign: 'Assinatura HMAC',
  mutate: 'Mutação pós-assinatura',
  request: 'Construção do request',
  validate: 'Validação HMAC',
  'signature-presence': 'Presença do header',
  temporal: 'Janela temporal/replay',
  response: 'Resposta',
};

export default function HmacSelfTestPage() {
  const [params, setParams] = useSearchParams();
  const initialInstance = params.get('instance') ?? ACTIVE_WHATSAPP_INSTANCE;
  const initialNeg = params.get('include_negative') !== 'false';

  const [instance, setInstance] = useState(initialInstance);
  const [includeNegative, setIncludeNegative] = useState(initialNeg);
  const { loading, result, lastRunAt, run } = useHmacSelfTest(instance, includeNegative);

  // Roda automaticamente ao carregar e quando params mudam (via URL)
  useEffect(() => {
    document.title = 'HMAC Self-test — Status';
    void run();
  }, [run]);

  // Sincroniza filtros com a URL (deep-link compartilhável)
  useEffect(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('instance', instance);
        next.set('include_negative', includeNegative ? 'true' : 'false');
        return next;
      },
      { replace: true }
    );
  }, [instance, includeNegative, setParams]);

  const passedCount = useMemo(
    () => result?.scenarios?.filter((s) => s.passed).length ?? 0,
    [result]
  );
  const totalCount = result?.scenarios?.length ?? 0;
  const failedCount = totalCount - passedCount;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-6" data-testid="hmac-selftest-page">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/" aria-label="Voltar">
              <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
            </Link>
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <FlaskConical className="h-5 w-5 text-primary" />
              HMAC Self-test
            </h1>
            <p className="text-sm text-muted-foreground">
              Valida a assinatura, a janela temporal e a proteção contra replay do webhook.
            </p>
          </div>
        </div>
        <Button onClick={() => void run()} disabled={loading} data-testid="hmac-selftest-rerun">
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="mr-2 h-4 w-4" />
          )}
          Rodar novamente
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Configuração do teste</CardTitle>
          <CardDescription>
            Os parâmetros ficam na URL — compartilhe o link para reproduzir o cenário.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="instance">Instância</Label>
            <Input
              id="instance"
              value={instance}
              onChange={(e) => setInstance(e.target.value)}
              placeholder="wpp2"
              data-testid="hmac-selftest-instance-input"
            />
          </div>
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="negative">Cenários negativos extras</Label>
              <p className="text-xs text-muted-foreground">
                wrong-secret, payload-mutated, missing-signature
              </p>
            </div>
            <Switch
              id="negative"
              checked={includeNegative}
              onCheckedChange={setIncludeNegative}
              data-testid="hmac-selftest-toggle-negative"
            />
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void run()}
              disabled={loading}
              data-testid="hmac-selftest-apply"
            >
              Aplicar e rodar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Resultado principal */}
      {loading && !result && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mb-3 h-6 w-6 animate-spin" />
            Executando self-test…
          </CardContent>
        </Card>
      )}

      {result && (
        <Card data-testid="hmac-selftest-result-card">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl">
                  {result.ok ? (
                    <ShieldCheck className="h-6 w-6 text-success" />
                  ) : (
                    <ShieldAlert className="h-6 w-6 text-destructive" />
                  )}
                  {result.ok ? 'Self-test OK' : 'Self-test falhou'}
                </CardTitle>
                <CardDescription>
                  {result.message ??
                    (result.ok
                      ? 'Todos os cenários passaram.'
                      : 'Veja a fase e os cenários abaixo para diagnóstico.')}
                </CardDescription>
              </div>
              <Badge
                variant={result.ok ? 'default' : 'destructive'}
                className="text-sm"
                data-testid="hmac-selftest-overall-badge"
              >
                {result.ok ? 'OK' : 'FALHOU'}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KPI
                icon={<CheckCircle2 className="h-4 w-4 text-success" />}
                label="Cenários OK"
                value={`${passedCount}/${totalCount}`}
                testid="hmac-selftest-kpi-passed"
              />
              <KPI
                icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
                label="Falharam"
                value={String(failedCount)}
                testid="hmac-selftest-kpi-failed"
              />
              <KPI
                icon={<Clock className="h-4 w-4 text-muted-foreground" />}
                label="Duração total"
                value={typeof result.duration_ms === 'number' ? `${result.duration_ms} ms` : '—'}
                testid="hmac-selftest-kpi-duration"
              />
              <KPI
                icon={<FlaskConical className="h-4 w-4 text-muted-foreground" />}
                label="Janela tolerância"
                value={
                  typeof result.tolerance_seconds === 'number'
                    ? `${result.tolerance_seconds}s`
                    : '—'
                }
                testid="hmac-selftest-kpi-tolerance"
              />
            </div>

            {/* Faixa de fase com falha */}
            {result.failed_phase && (
              <div
                className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3"
                data-testid="hmac-selftest-failed-phase-banner"
                data-failed-phase={result.failed_phase}
              >
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div className="text-sm">
                  <div className="font-medium">
                    Falha detectada na fase: <code>{result.failed_phase}</code>
                  </div>
                  <div className="text-muted-foreground">
                    {PHASE_LABEL[result.failed_phase]}.
                    {result.request_id && (
                      <>
                        {' '}
                        Use <code className="">{`req=${result.request_id.slice(0, 8)}…`}</code> para
                        correlacionar nos logs.
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tabela de cenários */}
            {result.scenarios && result.scenarios.length > 0 && (
              <div>
                <Separator className="mb-3" />
                <div className="mb-2 text-sm font-medium">Cenários executados</div>
                <div
                  className="overflow-hidden rounded-lg border"
                  data-testid="hmac-selftest-scenarios"
                >
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-3 py-2 text-left font-medium">
                          Cenário
                        </th>
                        <th scope="col" className="px-3 py-2 text-left font-medium">
                          Esperado
                        </th>
                        <th scope="col" className="px-3 py-2 text-left font-medium">
                          Resultado
                        </th>
                        <th scope="col" className="px-3 py-2 text-left font-medium">
                          Fase
                        </th>
                        <th scope="col" className="px-3 py-2 text-left font-medium">
                          Detalhe
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.scenarios.map((s) => (
                        <tr
                          key={s.name}
                          className="border-t"
                          data-testid={`hmac-selftest-scenario-${s.name}`}
                          data-passed={s.passed ? 'true' : 'false'}
                          data-failed-phase={s.failed_phase ?? ''}
                        >
                          <td className="px-3 py-2">
                            <div className="font-medium">{s.name}</div>
                            <div className="text-xs text-muted-foreground">{s.description}</div>
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className="text-[10px]">
                              {s.expected === 'accept' ? 'aceitar' : 'rejeitar'}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant={s.passed ? 'default' : 'destructive'}
                              className="text-[10px]"
                            >
                              {s.outcome === 'accept' ? 'aceito' : 'rejeitado'}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            {s.failed_phase ? (
                              <Badge variant="destructive" className="text-[10px]">
                                {s.failed_phase}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {s.reason ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {lastRunAt && (
              <div className="text-xs text-muted-foreground" data-testid="hmac-selftest-last-run">
                Última execução: {lastRunAt.toLocaleString('pt-BR')}
                {result.request_id && (
                  <>
                    {' '}
                    · req <code className="">{result.request_id.slice(0, 8)}</code>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Histórico de auditoria reaproveitado */}
      <div data-testid="hmac-selftest-history-section">
        <HmacAuditHistoryPanel instance={instance} />
      </div>
    </div>
  );
}

function KPI({
  icon,
  label,
  value,
  testid,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  testid?: string;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5" data-testid={testid}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold">{value}</div>
    </div>
  );
}
