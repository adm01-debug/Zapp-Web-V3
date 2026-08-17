import { useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('useGoalNotifications');

const CHECK_INTERVAL_MS = 300000; // 5 minutes
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const NOTIFY_THRESHOLDS = [50, 75, 100];

interface GoalRow {
  id: string;
  queue_id: string;
  alerts_enabled: boolean | null;
  max_waiting_contacts: number | null;
  max_avg_wait_minutes: number | null;
  min_assignment_rate: number | null;
  max_messages_pending: number | null;
}

/**
 * Polls queue goals every 5 minutes and fires a toast the first time each goal
 * crosses a 50/75/100 % threshold. Transitions are deduplicated in-memory via
 * a per-goal ref so the same threshold never alerts twice per session.
 * Does not depend on useAuth — resolves the session via supabase.auth.getUser().
 */
export function useGoalNotifications() {
  // Track the last threshold notified per goal to avoid repeat toasts on the same band.
  const lastNotifiedRef = useRef<Map<string, number>>(new Map());

  const checkGoalProgress = useCallback(async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) return;
      const { data: goals, error: goalsError } = await supabase
        .from('queue_goals')
        .select('id, queue_id, alerts_enabled, max_waiting_contacts, max_avg_wait_minutes, min_assignment_rate, max_messages_pending');

      if (goalsError) { log.error('Error fetching goals:', goalsError); return; }
      if (!goals || goals.length === 0) return;

      for (const goal of goals as GoalRow[]) {
        if (!goal.alerts_enabled) continue;

        // Check each configured threshold; fire a toast if any limit is exceeded
        const checks: Array<{ label: string; value: number | null; limit: number | null; invert: boolean }> = [
          { label: 'Espera (contatos)', value: null, limit: goal.max_waiting_contacts, invert: false },
          { label: 'Espera (min)', value: null, limit: goal.max_avg_wait_minutes, invert: false },
          { label: 'Taxa de atribuição', value: null, limit: goal.min_assignment_rate, invert: true },
          { label: 'Msgs pendentes', value: null, limit: goal.max_messages_pending, invert: false },
        ];

        for (const check of checks) {
          if (check.limit == null) continue;
          // Etapa 66: value é sempre null hoje (medição de progresso não
          // implementada) — NÃO disparar toast de meta sem métrica real
          // (era falso-alerta ativo em produção).
          if (check.value == null) continue;
          const prev = lastNotifiedRef.current.get(`${goal.id}:${check.label}`) ?? -1;
          if (prev > 0) continue; // already notified this session
          lastNotifiedRef.current.set(`${goal.id}:${check.label}`, 1);
          toast.info(`Meta da fila: ${check.label} (limite: ${check.limit})`);
        }
      }
    } catch (err) {
      log.error('Error checking goal progress:', err);
    }
  }, []);

  useEffect(() => {
    checkGoalProgress();
    const interval = setInterval(checkGoalProgress, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkGoalProgress]);

  return { checkGoalProgress };
}
