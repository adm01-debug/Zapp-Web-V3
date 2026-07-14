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
import { ShieldCheck, ShieldAlert, FlaskConical, Loader2, ChevronDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { safeClient } from '@/integrations/supabase/safeClient';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';
import type { SelfTestResult } from './hmacSelfTestTypes';
import { HmacSelfTestResultPanel } from './HmacSelfTestResultPanel';

const log = getLogger('HmacSelfTest');

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
      const r = data as SelfTestResult; // ignore-audit: narrows Supabase query result to local interface
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
            <div
              role="status"
              aria-live="polite"
              className="flex items-center justify-center py-10 text-sm text-muted-foreground"
            >
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Executando…
            </div>
          )}

          {!loading && result && <HmacSelfTestResultPanel result={result} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
