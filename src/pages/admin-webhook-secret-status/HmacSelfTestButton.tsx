/**
 * HmacSelfTestButton
 * Aciona a edge function `webhook-hmac-selftest` e mostra a resposta detalhada
 * em um Dialog para confirmar se o secret configurado valida assinaturas.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, ShieldAlert, FlaskConical, Loader2, ChevronDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';

const log = getLogger('HmacSelfTest');

type Phase =
  | 'config'
  | 'parse-body'
  | 'build-payload'
  | 'sign'
  | 'mutate'
  | 'request'
  | 'validate'
  | 'signature-presence'
  | 'temporal'
  | 'response';

interface ScenarioReport {
  name: string;
  description: string;
  expected: 'accept' | 'reject';
  outcome: 'accept' | 'reject';
  passed: boolean;
  reason: string | null;
  failed_phase?: Phase | null;
  phases?: Array<{ phase: Phase; status: 'ok' | 'fail' | 'skip'; duration_ms: number }>;
  issuedAt: string;
  ageSeconds: number;
  nonce: string;
}

interface SelfTestResult {
  ok: boolean;
  configured: boolean;
  request_id?: string;
  failed_phase?: Phase | null;
  secret_length?: number;
  duration_ms?: number;
  tolerance_seconds?: number;
  scenarios?: ScenarioReport[];
  payload_preview?: Record<string, unknown>;
  payload_bytes?: number;
  computed_signature_prefix?: string;
  good?: { accepted: boolean; signatureFound: boolean; error: string | null };
  tampered?: { accepted: boolean; signatureFound: boolean; error: string | null };
  message?: string;
  error?: string;
}

export function HmacSelfTestButton({ instance }: { instance: string | null }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SelfTestResult | null>(null);
  const [includeNegative, setIncludeNegative] = useState(true);

  async function logAudit(
    instanceName: string | null,
    payload: SelfTestResult,
    fallbackDurationMs: number
  ) {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;
      await safeClient.from('hmac_selftest_audit', (q) =>
        q.insert({
          instance: instanceName,
          ok: !!payload.ok,
          duration_ms: payload.duration_ms ?? fallbackDurationMs,
          error: payload.error ?? null,
          message: payload.message ?? null,
          good_accepted: payload.good?.accepted ?? null,
          tampered_rejected: payload.tampered ? !payload.tampered.accepted : null,
          executed_by: uid,
        })
      );
    } catch (err) {
      log.warn('Failed to write audit record', err);
    }
  }

  /**
   * Vincula o resultado ao sistema de alertas (warroom_alerts):
   *  - FALHA → cria alerta ativo (se não houver outro aberto para o mesmo source)
   *  - OK    → resolve todos os alertas ativos do mesmo source
   * Usa source = `hmac-selftest:<instance>` para isolar por instância.
   * É best-effort: erros de RLS/permissão não bloqueiam o fluxo.
   */
  async function syncAlert(instanceName: string | null, payload: SelfTestResult) {
    const source = `hmac-selftest:${instanceName ?? 'selftest'}`;
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;

      // Busca alerta ativo (não resolvido) para este source
      const { data: existingRows } = await safeClient.from('warroom_alerts', (q) =>
        q
          .select('id')
          .eq('source', source)
          .is('resolved_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
      );
      const existing = existingRows;

      const activeAlertId = existing?.[0]?.id ?? null;

      if (!payload.ok) {
        // Falha: cria alerta se ainda não houver um aberto
        if (!activeAlertId) {
          const failedScenarios = payload.scenarios?.filter((s) => !s.passed) ?? [];
          const phasePrefix = payload.failed_phase ? `[fase: ${payload.failed_phase}] ` : '';
          const reqSuffix = payload.request_id ? ` (req=${payload.request_id.slice(0, 8)})` : '';
          const detail =
            failedScenarios.length > 0
              ? failedScenarios
                  .map(
                    (s) =>
                      `${s.name}${s.failed_phase ? `@${s.failed_phase}` : ''}: ${s.reason ?? 'sem detalhe'}`
                  )
                  .join(' | ')
              : (payload.error ?? payload.message ?? 'Falha no self-test HMAC');
          const summary = `${phasePrefix}${detail}${reqSuffix}`;
          await safeClient.from('warroom_alerts', (q) =>
            q.insert({
              alert_type: 'error',
              title: `HMAC self-test falhou (${instanceName ?? 'selftest'})`,
              message: summary.slice(0, 500),
              source,
            })
          );
          toast.warning('Alerta ativo registrado para esta falha de HMAC');
        }
      } else {
        // OK: resolve alertas ativos deste source
        if (activeAlertId) {
          await safeClient.from('warroom_alerts', (q) =>
            q
              .update({
                resolved_at: new Date().toISOString(),
                resolved_reason: 'Auto-resolvido: HMAC self-test voltou a OK',
                dismissed_by: uid,
                is_read: true,
              })
              .eq('source', source)
              .is('resolved_at', null)
          );
          toast.success('Alertas anteriores de HMAC resolvidos automaticamente');
        }
      }
    } catch (err) {
      log.warn('Failed to sync alert', err);
    }
  }

  async function run(opts?: { includeNegative?: boolean }) {
    const useNegative = opts?.includeNegative ?? includeNegative;
    setLoading(true);
    setResult(null);
    setOpen(true);
    const startedAt = performance.now();
    try {
      const { data, error } = await supabase.functions.invoke('webhook-hmac-selftest', {
        body: {
          instance: instance ?? 'selftest',
          include_negative: useNegative,
        },
      });
      if (error) throw error;
      const r = data as SelfTestResult;
      setResult(r);
      if (r.ok) toast.success('HMAC OK — secret válido');
      else toast.error(r.error ?? 'Falha no auto-teste HMAC');
      await logAudit(instance, r, Math.round(performance.now() - startedAt));
      await syncAlert(instance, r);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro inesperado';
      const failure: SelfTestResult = { ok: false, configured: false, error: msg };
      setResult(failure);
      toast.error(msg);
      await logAudit(instance, failure, Math.round(performance.now() - startedAt));
      await syncAlert(instance, failure);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="inline-flex rounded-md shadow-sm" role="group">
        <Button
          variant="outline"
          size="sm"
          onClick={() => run()}
          disabled={loading}
          className="rounded-r-none border-r-0"
          data-testid="hmac-selftest-run"
        >
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FlaskConical className="mr-2 h-4 w-4" />
          )}
          Testar HMAC
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              className="rounded-l-none px-2"
              aria-label="Opções de teste HMAC"
              data-testid="hmac-selftest-options"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuLabel>Cenários de teste</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={includeNegative}
              onCheckedChange={(v) => setIncludeNegative(!!v)}
              data-testid="hmac-selftest-toggle-negative"
            >
              Incluir cenários negativos
              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                wrong-secret, payload-mutated, missing-signature
              </span>
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => run({ includeNegative: true })}
              data-testid="hmac-selftest-run-full"
            >
              Rodar com todos os negativos
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => run({ includeNegative: false })}
              data-testid="hmac-selftest-run-base"
            >
              Rodar apenas cenários base
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {result?.ok ? (
                <ShieldCheck className="h-5 w-5 text-success" />
              ) : (
                <ShieldAlert className="h-5 w-5 text-destructive" />
              )}
              Teste de validação HMAC
            </DialogTitle>
            <DialogDescription>
              Gera um payload sintético, assina com o secret do servidor e valida pelo mesmo
              pipeline do <code>evolution-webhook</code>. O secret nunca é exposto.
            </DialogDescription>
          </DialogHeader>

          {loading && (
            <div role="status" aria-live="polite" className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Executando…
            </div>
          )}

          {!loading && result && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant={result.ok ? 'default' : 'destructive'}>
                  {result.ok ? 'OK' : 'FALHOU'}
                </Badge>
                {typeof result.duration_ms === 'number' && (
                  <span className="text-xs text-muted-foreground">{result.duration_ms}ms</span>
                )}
                {typeof result.secret_length === 'number' && (
                  <span className="text-xs text-muted-foreground">
                    secret: {result.secret_length} bytes
                  </span>
                )}
              </div>

              {result.message && <p className="text-sm text-muted-foreground">{result.message}</p>}
              {result.error && <p className="text-sm text-destructive">{result.error}</p>}

              {result.good && result.tampered && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border p-3">
                    <div className="mb-1 text-xs uppercase text-muted-foreground">
                      Assinatura correta
                    </div>
                    <Badge
                      variant={result.good.accepted ? 'default' : 'destructive'}
                      className="text-[10px]"
                    >
                      {result.good.accepted ? 'aceita' : 'rejeitada'}
                    </Badge>
                    {result.good.error && (
                      <p className="mt-1 text-xs text-destructive">{result.good.error}</p>
                    )}
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="mb-1 text-xs uppercase text-muted-foreground">
                      Assinatura adulterada
                    </div>
                    <Badge
                      variant={!result.tampered.accepted ? 'default' : 'destructive'}
                      className="text-[10px]"
                    >
                      {result.tampered.accepted ? 'aceita (RUIM)' : 'rejeitada (esperado)'}
                    </Badge>
                    {result.tampered.error && (
                      <p className="mt-1 text-xs text-muted-foreground">{result.tampered.error}</p>
                    )}
                  </div>
                </div>
              )}

              {typeof result.tolerance_seconds === 'number' && (
                <div
                  className="text-xs text-muted-foreground"
                  data-testid="hmac-selftest-tolerance"
                >
                  Janela de tolerância: <code>{result.tolerance_seconds}s</code> (issuedAt ± janela;
                  nonce único)
                </div>
              )}

              {(result.failed_phase || result.request_id) && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {result.failed_phase && (
                    <Badge
                      variant="destructive"
                      className="text-[10px]"
                      data-testid="hmac-selftest-failed-phase"
                    >
                      Falha em fase: {result.failed_phase}
                    </Badge>
                  )}
                  {result.request_id && (
                    <span
                      className="text-[10px] text-muted-foreground"
                      data-testid="hmac-selftest-request-id"
                    >
                      req: {result.request_id.slice(0, 8)}…
                    </span>
                  )}
                </div>
              )}

              {result.scenarios && result.scenarios.length > 0 && (
                <div
                  className="overflow-hidden rounded-lg border"
                  data-testid="hmac-selftest-scenarios"
                >
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-2 py-1.5 text-left font-medium">Cenário</th>
                        <th scope="col" className="px-2 py-1.5 text-left font-medium">Esperado</th>
                        <th scope="col" className="px-2 py-1.5 text-left font-medium">Resultado</th>
                        <th scope="col" className="px-2 py-1.5 text-left font-medium">Fase</th>
                        <th scope="col" className="px-2 py-1.5 text-left font-medium">Idade</th>
                        <th scope="col" className="px-2 py-1.5 text-left font-medium">Detalhe</th>
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
                          <td className="px-2 py-1.5">
                            <div className="font-medium">{s.name}</div>
                            <div className="text-[10px] text-muted-foreground">{s.description}</div>
                          </td>
                          <td className="px-2 py-1.5">
                            <Badge variant="outline" className="text-[10px]">
                              {s.expected === 'accept' ? 'aceitar' : 'rejeitar'}
                            </Badge>
                          </td>
                          <td className="px-2 py-1.5">
                            <Badge
                              variant={s.passed ? 'default' : 'destructive'}
                              className="text-[10px]"
                            >
                              {s.outcome === 'accept' ? 'aceito' : 'rejeitado'}
                            </Badge>
                          </td>
                          <td className="px-2 py-1.5">
                            {s.failed_phase ? (
                              <Badge
                                variant="destructive"
                                className="text-[10px]"
                                title={s.reason ?? ''}
                              >
                                {s.failed_phase}
                              </Badge>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-muted-foreground">
                            {s.ageSeconds >= 0 ? `+${s.ageSeconds}s` : `${s.ageSeconds}s`}
                          </td>
                          <td className="px-2 py-1.5 text-muted-foreground">{s.reason ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {result.payload_preview && (
                <div>
                  <div className="mb-1 text-xs uppercase text-muted-foreground">
                    Payload de teste (modelo)
                  </div>
                  <pre className="overflow-x-auto rounded bg-muted/40 p-2 text-[11px]">
                    {JSON.stringify(result.payload_preview, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
