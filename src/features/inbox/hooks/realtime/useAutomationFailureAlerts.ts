/**
 * useAutomationFailureAlerts
 *
 * Ouve em realtime a tabela `automation_executions` (Lovable Cloud) e dispara
 * um toast de alerta quando uma execução de regra de automação termina em
 * `status='failed'`. O motivo da falha (timeout, ausência de intenção/sugestão,
 * erro em apply_tags/escalate_sla, falha na invocação da edge function) já é
 * gravado pela RPC `rpc_record_automation_error` em `trigger_payload.error` /
 * `trigger_payload.error_context.stage`.
 *
 * Por que existe:
 *  - Hoje a falha só é visível abrindo `/admin/automations/logs`.
 *  - Admins precisam de feedback imediato para revisar e ajustar a regra
 *    (timeout do modelo, prompt sem intenção, condição mal configurada).
 *
 * O hook é montado uma única vez no AppShell, junto dos outros mounts de
 * alerta global. Não persiste — apenas notifica via toast com link para o
 * painel de logs. A persistência/auditoria já vive em `automation_executions`.
 *
 * Deduplicação: mantemos um `Set` de IDs já notificados para evitar repetir
 * o toast em re-entregas do realtime.
 */
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';

const log = getLogger('AutomationFailureAlerts');

interface AutomationExecutionRowMinimal {
  id: string;
  status: string | null;
  rule_id: string | null;
  remote_jid: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trigger_payload: Record<string, any> | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rule_snapshot: Record<string, any> | null;
}

function describeStage(stage: string | null | undefined): string {
  if (!stage) return 'execução';
  switch (stage) {
    case 'apply_tags_or_escalate':
      return 'aplicar tags / escalar SLA';
    case 'suggest_reply_or_autosend':
      return 'sugerir resposta (IA)';
    case 'evaluate_conditions':
      return 'avaliar condições';
    case 'timeout':
      return 'timeout';
    default:
      return stage;
  }
}

function shortError(msg: string | null | undefined, max = 120): string {
  if (!msg) return 'erro desconhecido';
  const clean = String(msg).replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function useAutomationFailureAlerts(enabled = true): void {
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;

    const handle = (row: AutomationExecutionRowMinimal | null, prevStatus?: string | null) => {
      if (!row || row.status !== 'failed') return;
      if (seenRef.current.has(row.id)) return;
      // Só notifica na transição → failed (evita re-syncs)
      if (prevStatus === 'failed') {
        seenRef.current.add(row.id);
        return;
      }
      seenRef.current.add(row.id);

      const payload = row.trigger_payload ?? {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ctx = (payload.error_context ?? {}) as Record<string, any>;
      const ruleName =
        row.rule_snapshot?.name ?? (payload.rule_name as string | undefined) ?? 'Regra sem nome';
      const stage = describeStage(ctx.stage);
      const errMsg = shortError(payload.error as string | undefined);
      const tail = row.remote_jid ? ` em ${row.remote_jid.split('@')[0]}` : '';

      toast.error(`Automação falhou: ${ruleName}${tail}`, {
        description: `Etapa: ${stage}. ${errMsg}`,
        duration: 14_000,
        action: {
          label: 'Ver logs',
          onClick: () => {
            window.location.href = '/admin/automations/logs';
          },
        },
      });

      log.warn('[automation-alert] failed', {
        executionId: row.id,
        ruleId: row.rule_id,
        stage: ctx.stage ?? null,
      });
    };

    const channel = supabase
      .channel('automation_executions_failure_alerts')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'zapp', table: 'automation_executions' },
        (payload) => {
          const next = payload.new as AutomationExecutionRowMinimal | null;
          const prev = payload.old as AutomationExecutionRowMinimal | null;
          handle(next, prev?.status ?? null);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'zapp', table: 'automation_executions' },
        (payload) => {
          // Cobre o caso (raro) onde a execução já nasce 'failed'.
          const next = payload.new as AutomationExecutionRowMinimal | null;
          handle(next, null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled]);
}
