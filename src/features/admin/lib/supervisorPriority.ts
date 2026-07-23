/**
 * Regras de priorização do Copiloto do Supervisor.
 *
 * Ordem de avaliação (top-down). A primeira regra satisfeita define o nível.
 * A pontuação numérica é usada para ordenar a fila de forma estável.
 */

/** Priority Level type alias. */
export type PriorityLevel = 'critical' | 'high' | 'medium' | 'normal';

/** Supervisor Conversation Input interface. */
export interface SupervisorConversationInput {
  id: string;
  name: string;
  phone: string;
  assigned_to: string | null;
  queue_id: string | null;
  ai_priority: string | null;
  risk_score: number | null;
  updated_at: string;
}

/** Priority Info interface definition. */
export interface PriorityInfo {
  level: PriorityLevel;
  label: string;
  reason: string;
  score: number;
  waitingMinutes: number;
}

/** P R I O R I T Y_ M E T A constant. */
export const PRIORITY_META: Record<PriorityLevel, { label: string; badgeClass: string; order: number }> = {
  critical: { label: 'P1 · Crítica', badgeClass: 'bg-destructive text-destructive-foreground', order: 0 },
  high: { label: 'P2 · Alta', badgeClass: 'bg-warning text-warning-foreground', order: 1 },
  medium: { label: 'P3 · Média', badgeClass: 'bg-warning/70 text-warning-foreground', order: 2 },
  normal: { label: 'P4 · Normal', badgeClass: 'bg-muted text-muted-foreground', order: 3 },
};

/** P R I O R I T Y_ R U L E S_ T E X T constant. */
export const PRIORITY_RULES_TEXT = [
  'P1 Crítica → sem atendente há mais de 30 min, ou risco ≥ 80, ou marcação de urgência da IA.',
  'P2 Alta → aguardando há mais de 15 min, ou risco ≥ 60.',
  'P3 Média → aguardando há mais de 5 min, ou risco ≥ 40.',
  'P4 Normal → demais conversas em atendimento.',
] as const;

/** compute Priority function. */
export function computePriority(c: SupervisorConversationInput, now: Date = new Date()): PriorityInfo {
  const updated = new Date(c.updated_at).getTime();
  const waitingMinutes = Math.max(0, Math.floor((now.getTime() - updated) / 60000));
  const risk = c.risk_score ?? 0;
  const aiUrgent = (c.ai_priority ?? '').toLowerCase() === 'urgent' ||
                   (c.ai_priority ?? '').toLowerCase() === 'alta';
  const unassigned = !c.assigned_to;

  if ((unassigned && waitingMinutes >= 30) || risk >= 80 || aiUrgent) {
    return {
      level: 'critical',
      label: PRIORITY_META.critical.label,
      reason: aiUrgent
        ? 'IA classificou como urgente'
        : risk >= 80
          ? `Risco alto (${risk})`
          : `Sem atendente há ${waitingMinutes} min`,
      score: 1000 + waitingMinutes + risk,
      waitingMinutes,
    };
  }
  if (waitingMinutes >= 15 || risk >= 60) {
    return {
      level: 'high',
      label: PRIORITY_META.high.label,
      reason: risk >= 60 ? `Risco ${risk}` : `Aguardando há ${waitingMinutes} min`,
      score: 500 + waitingMinutes + risk,
      waitingMinutes,
    };
  }
  if (waitingMinutes >= 5 || risk >= 40) {
    return {
      level: 'medium',
      label: PRIORITY_META.medium.label,
      reason: risk >= 40 ? `Risco ${risk}` : `Aguardando há ${waitingMinutes} min`,
      score: 200 + waitingMinutes + risk,
      waitingMinutes,
    };
  }
  return {
    level: 'normal',
    label: PRIORITY_META.normal.label,
    reason: 'Em atendimento',
    score: waitingMinutes,
    waitingMinutes,
  };
}

/** sort By Priority function. */
export function sortByPriority<T extends { priority: PriorityInfo }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const oa = PRIORITY_META[a.priority.level].order;
    const ob = PRIORITY_META[b.priority.level].order;
    if (oa !== ob) return oa - ob;
    return b.priority.score - a.priority.score;
  });
}
