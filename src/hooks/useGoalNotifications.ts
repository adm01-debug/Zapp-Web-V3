import { useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('useGoalNotifications');

const CHECK_INTERVAL_MS = 300000; // 5 minutes
// % do limite por band. Checks normais: alerta ao CRUZAR para cima
// (value >= limit*t/100, t ∈ {50,75,100}). Checks invertidos (min_assignment_rate):
// alerta ao CAIR — t ∈ {25,50,75} → limit*(1-t/100), ex.: limite 80 → 60/40/20
// (desenho sim3 c.2: "alerta ao cair ≤ 60/40/20").
const NOTIFY_THRESHOLDS = [50, 75, 100];
const INVERTED_THRESHOLDS = [25, 50, 75];

interface GoalRow {
  id: string;
  queue_id: string;
  alerts_enabled: boolean | null;
  max_waiting_contacts: number | null;
  max_avg_wait_minutes: number | null;
  min_assignment_rate: number | null;
  max_messages_pending: number | null;
}

// Cache curto de nomes de fila (mesmo TTL do check) — a RPC expõe só queue_id
// e o toast usa o nome real da fila. Sem cache persistente entre sessões.
let queueNamesCache: { byId: Map<string, string>; fetchedAt: number } | null = null;

async function fetchQueueNames(): Promise<Map<string, string>> {
  if (queueNamesCache && Date.now() - queueNamesCache.fetchedAt < CHECK_INTERVAL_MS) {
    return queueNamesCache.byId;
  }
  try {
    const { data } = await supabase.from('queues').select('id, name');
    queueNamesCache = {
      byId: new Map((data ?? []).map((q) => [q.id, q.name ?? ''])),
      fetchedAt: Date.now(),
    };
  } catch {
    queueNamesCache = { byId: new Map(), fetchedAt: Date.now() };
  }
  return queueNamesCache.byId;
}

/**
 * Polls queue goals every 5 minutes and fires a toast the first time each goal
 * crosses a 50/75/100 % threshold of its limit, using REAL metrics from
 * zapp.rpc_queue_goal_metrics() (1 chamada agregada, não 4×N queries).
 *
 * Guards honestos (desenho sim3 c.2): sem base de dados → NULL → sem toast + log;
 * nunca disparar com valor inventado. 0 é dado legítimo — só NULL significa
 * "não medido". Transitions are deduplicated in-memory via a per-goal ref so
 * the same band never alerts twice per session.
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
      if (!goals || goals.length === 0) return; // sem metas configuradas → nada a medir

      const enabledGoals = (goals as GoalRow[]).filter((g) => g.alerts_enabled);
      if (enabledGoals.length === 0) return; // sem metas com alerta → nada a medir

      const { data: metricsRows, error: metricsError } = await supabase.rpc('rpc_queue_goal_metrics');
      if (metricsError) { log.error('Error fetching queue goal metrics:', metricsError); return; }

      const metricsByQueue = new Map((metricsRows ?? []).map((m) => [m.queue_id, m]));
      const queueNames = await fetchQueueNames();

      for (const goal of enabledGoals) {
        const metrics = metricsByQueue.get(goal.queue_id);
        if (!metrics) {
          log.warn(`Meta ${goal.id}: fila ${goal.queue_id} sem métricas na RPC — sem toast`);
          continue;
        }

        // Check each configured threshold against the REAL metric; fire a toast
        // when a new band is crossed. `null` = sem base de dados → nunca disparar.
        const checks: Array<{ label: string; value: number | null; limit: number | null; invert: boolean }> = [
          { label: 'Espera (contatos)', value: metrics.waiting_contacts, limit: goal.max_waiting_contacts, invert: false },
          { label: 'Espera (min)', value: metrics.coverage === 'sem_posicoes' ? null : metrics.avg_wait_minutes, limit: goal.max_avg_wait_minutes, invert: false },
          { label: 'Taxa de atribuição', value: metrics.assignment_rate, limit: goal.min_assignment_rate, invert: true },
          { label: 'Msgs pendentes', value: metrics.messages_pending, limit: goal.max_messages_pending, invert: false },
        ];

        for (const check of checks) {
          const limit = check.limit;
          const value = check.value;
          if (limit == null) continue;
          if (value == null) {
            // Guard honesto: sem base → sem toast (0 é dado; NULL é "não medido").
            log.warn(`Meta ${goal.id}: ${check.label} sem base de dados — sem toast`);
            continue;
          }

          const thresholds = check.invert ? INVERTED_THRESHOLDS : NOTIFY_THRESHOLDS;
          const crossed = thresholds.filter((t) =>
            check.invert
              ? value <= limit * (1 - t / 100)
              : value >= limit * (t / 100)
          );
          if (crossed.length === 0) continue;
          const band = crossed[crossed.length - 1]; // só o band mais alto cruzado
          const key = `${goal.id}:${check.label}`;
          const prev = lastNotifiedRef.current.get(key) ?? -1;
          if (prev >= band) continue; // band já notificado nesta sessão
          lastNotifiedRef.current.set(key, band);

          const queueName = queueNames.get(goal.queue_id) ?? goal.queue_id.slice(0, 8);
          const pct = Math.round((value / limit) * 100);
          toast.info(`Meta da fila ${queueName}: ${check.label} ${value}/${limit} (${pct}%)`);
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
