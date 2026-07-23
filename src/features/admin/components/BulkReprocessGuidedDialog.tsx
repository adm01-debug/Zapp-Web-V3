/**
 * BulkReprocessGuidedDialog — fluxo guiado em 3 passos para reprocessar
 * itens selecionados na DLQ:
 *
 *  1. **Pré-visualização**: contagens agregadas por instância, status atual e
 *     causa raiz (sem chamar nada — puro client-side a partir das linhas
 *     selecionadas). Avisos para itens já em estado 'succeeded' (no-op
 *     esperado) e itens 'abandoned' (precisam reprocesso explícito).
 *  2. **Confirmação**: motivo opcional (registrado no audit log via
 *     bulkRetry → rpc_dlq_log_item_action), checkbox de ciência.
 *  3. **Resultado**: contadores finais (afetados / no-op) com link para o
 *     histórico.
 *
 * Não toca em business logic — apenas orquestra a chamada existente
 * `bulkRetry.mutate(ids)`.
 */
import { useMemo, useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  RotateCw, AlertTriangle, CheckCircle2, ChevronRight, ChevronLeft,
  Server, Activity, Sparkles, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  classifyRootCause, getRootCauseMeta, type RootCause,
} from '@/lib/failureRootCause';
import type { FailedMessageRow, FailedMessageStatus } from '@/features/admin';

interface BulkReprocessGuidedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Linhas (já carregadas) correspondentes aos IDs selecionados. */
  selectedRows: FailedMessageRow[];
  /** Mutation handler — recebe a lista de IDs e o motivo opcional, retorna o número afetado. */
  onConfirm: (ids: string[], reason: string) => Promise<number>;
  /** Sinaliza pendência da mutation externa. */
  isPending: boolean;
}

type Step = 'preview' | 'confirm' | 'result';

interface AggregateBucket<K extends string> {
  key: K;
  count: number;
  label: string;
}

const STATUS_LABEL: Record<FailedMessageStatus, string> = {
  pending: 'Pendentes',
  retrying: 'Reprocessando',
  succeeded: 'Já em sucesso',
  abandoned: 'Abandonadas',
  failed: 'Falhou',
};

/** Bulk Reprocess Guided Dialog function. */
export function BulkReprocessGuidedDialog({
  open, onOpenChange, selectedRows, onConfirm, isPending,
}: BulkReprocessGuidedDialogProps) {
  const [step, setStep] = useState<Step>('preview');
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [resultAffected, setResultAffected] = useState<number | null>(null);

  // Reset wizard when dialog closes
  useEffect(() => {
    if (!open) {
      // small defer so close animation isn't jarring
      const t = setTimeout(() => {
        setStep('preview');
        setReason('');
        setAcknowledged(false);
        setResultAffected(null);
      }, 180);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  const total = selectedRows.length;

  const byInstance = useMemo<AggregateBucket<string>[]>(() => {
    const m = new Map<string, number>();
    for (const r of selectedRows) m.set(r.instance_name, (m.get(r.instance_name) ?? 0) + 1);
    return Array.from(m.entries())
      .map(([key, count]) => ({ key, count, label: key }))
      .sort((a, b) => b.count - a.count);
  }, [selectedRows]);

  const byStatus = useMemo<AggregateBucket<FailedMessageStatus>[]>(() => {
    const m = new Map<FailedMessageStatus, number>();
    for (const r of selectedRows) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    return Array.from(m.entries())
      .map(([key, count]) => ({ key, count, label: STATUS_LABEL[key] }))
      .sort((a, b) => b.count - a.count);
  }, [selectedRows]);

  const byRootCause = useMemo<AggregateBucket<RootCause>[]>(() => {
    const m = new Map<RootCause, number>();
    for (const r of selectedRows) {
      const c = classifyRootCause(r);
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([key, count]) => ({ key, count, label: getRootCauseMeta(key).label }))
      .sort((a, b) => b.count - a.count);
  }, [selectedRows]);

  const succeededCount = byStatus.find((s) => s.key === 'succeeded')?.count ?? 0;
  const abandonedCount = byStatus.find((s) => s.key === 'abandoned')?.count ?? 0;
  const actionableCount = total - succeededCount;

  const handleConfirm = async () => {
    try {
      const ids = selectedRows.map((r) => r.id);
      const n = await onConfirm(ids, reason);
      setResultAffected(n);
      setStep('result');
    } catch {
      // Toast já é disparado pelo hook; mantemos no passo de confirmação.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCw className="h-5 w-5 text-primary" />
            Reprocessar selecionados — {total} item{total === 1 ? '' : 's'}
          </DialogTitle>
          <DialogDescription>
            {step === 'preview' && 'Revise o impacto antes de confirmar.'}
            {step === 'confirm' && 'Confirme a operação. O motivo (opcional) será registrado na auditoria.'}
            {step === 'result' && 'Operação concluída.'}
          </DialogDescription>
        </DialogHeader>

        <StepIndicator current={step} />

        {step === 'preview' && (
          <ScrollArea className="max-h-[55vh] pr-3">
            <div className="space-y-4">
              <ImpactSection
                icon={Server}
                title="Por instância"
                buckets={byInstance}
                tone="primary"
              />
              <ImpactSection
                icon={Activity}
                title="Por status atual"
                buckets={byStatus}
                tone="muted"
              />
              <ImpactSection
                icon={Sparkles}
                title="Por causa raiz"
                buckets={byRootCause}
                tone="warning"
              />

              {(succeededCount > 0 || abandonedCount > 0) && (
                <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground space-y-1">
                  <div className="flex items-center gap-1.5 font-medium">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Atenção à seleção
                  </div>
                  {succeededCount > 0 && (
                    <p>
                      <strong>{succeededCount}</strong> item{succeededCount === 1 ? '' : 's'} já está em
                      <code className="mx-1 px-1 rounded bg-background/60">succeeded</code>
                      e não será afetado pelo reprocesso.
                    </p>
                  )}
                  {abandonedCount > 0 && (
                    <p>
                      <strong>{abandonedCount}</strong> item{abandonedCount === 1 ? '' : 's'}
                      {' '}em <code className="mx-1 px-1 rounded bg-background/60">abandoned</code>
                      será reativado para nova tentativa imediata.
                    </p>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        )}

        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Itens com ação:</span>
                <strong className="tabular-nums">{actionableCount}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Itens ignorados (no-op):</span>
                <span className="tabular-nums">{succeededCount}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="bulk-retry-reason">
                Motivo (opcional — fica no histórico)
              </label>
              <Textarea
                id="bulk-retry-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="ex.: instância wpp2 voltou ao ar, retentativa pós-correção do upstream..."
                rows={3}
                maxLength={500}
              />
              <div className="text-[10px] text-muted-foreground text-right">{reason.length}/500</div>
            </div>

            <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
              <Checkbox
                checked={acknowledged}
                onCheckedChange={(v) => setAcknowledged(v === true)}
                aria-label="Confirmar ciência"
                className="mt-0.5"
              />
              <span>
                Estou ciente que <strong>{actionableCount}</strong> item(s) será{actionableCount === 1 ? '' : 'ão'}
                {' '}enfileirado(s) para reprocesso imediato e que falhas residuais voltam à fila com backoff.
              </span>
            </label>
          </div>
        )}

        {step === 'result' && (
          <div className="py-6 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 mx-auto text-success" />
            <div>
              <p className="text-lg font-semibold">
                {resultAffected ?? 0} item{(resultAffected ?? 0) === 1 ? '' : 's'} reprocessado{(resultAffected ?? 0) === 1 ? '' : 's'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                O resultado está registrado no histórico de auditoria, abaixo da tabela.
              </p>
            </div>
            {(resultAffected ?? 0) < actionableCount && (
              <p className="text-xs text-warning">
                {actionableCount - (resultAffected ?? 0)} item(s) não puderam ser alterados (já em estado
                final). Verifique a tabela.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="flex sm:justify-between gap-2">
          {step === 'preview' && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button
                onClick={() => setStep('confirm')}
                disabled={total === 0 || actionableCount === 0}
              >
                Continuar
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <Button variant="ghost" onClick={() => setStep('preview')} disabled={isPending}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Voltar
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!acknowledged || isPending || actionableCount === 0}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RotateCw className="h-4 w-4 mr-2" />
                )}
                Confirmar reprocesso
              </Button>
            </>
          )}
          {step === 'result' && (
            <>
              <span />
              <Button onClick={() => onOpenChange(false)}>Fechar</Button>
            </>
          )}
        </DialogFooter>

        {/* Best-effort progress while pending */}
        {step === 'confirm' && isPending && (
          <Progress value={undefined} className="h-1 mt-2" />
        )}

      </DialogContent>
    </Dialog>
  );
}

/* ─────────────── helpers ─────────────── */

function StepIndicator({ current }: { current: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: 'preview', label: 'Pré-visualização' },
    { id: 'confirm', label: 'Confirmação' },
    { id: 'result', label: 'Resultado' },
  ];
  const idx = steps.findIndex((s) => s.id === current);
  return (
    <div className="flex items-center gap-2 text-xs" aria-label="Progresso">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          <div
            className={cn(
              'h-6 w-6 rounded-full grid place-items-center font-semibold text-[10px]',
              i < idx && 'bg-success/20 text-success',
              i === idx && 'bg-primary text-primary-foreground',
              i > idx && 'bg-muted text-muted-foreground',
            )}
          >
            {i + 1}
          </div>
          <span
            className={cn(
              i === idx ? 'text-foreground font-medium' : 'text-muted-foreground',
            )}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="text-muted-foreground">›</span>}
        </div>
      ))}
    </div>
  );
}

function ImpactSection<K extends string>({
  icon: Icon, title, buckets, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  buckets: AggregateBucket<K>[];
  tone: 'primary' | 'warning' | 'muted';
}) {
  if (buckets.length === 0) return null;
  const max = buckets[0]?.count ?? 1;
  const barTone =
    tone === 'primary' ? 'bg-primary' :
    tone === 'warning' ? 'bg-warning/70' :
    'bg-muted-foreground/40';
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      <div className="space-y-1">
        {buckets.map((b) => {
          const pct = Math.round((b.count / max) * 100);
          return (
            <div key={b.key} className="flex items-center gap-2 text-xs">
              <Badge variant="outline" className="w-36 justify-center shrink-0 truncate text-[11px]">
                {b.label}
              </Badge>
              <div className="flex-1 h-4 bg-muted/40 rounded overflow-hidden">
                <div className={cn('h-full transition-all', barTone)} style={{ width: `${pct}%` }} />
              </div>
              <span className="tabular-nums w-10 text-right shrink-0">{b.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Default export. */
export default BulkReprocessGuidedDialog;
