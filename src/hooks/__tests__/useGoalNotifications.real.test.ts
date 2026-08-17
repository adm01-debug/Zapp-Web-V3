/**
 * CONTRATO REAL — useGoalNotifications (Etapa 66.6 / findings-09: `check.value` sempre null).
 *
 * Wire esperado (spec: docs/audit-2026-08-16/insumo + sim3/sim-metricas.md §c):
 *  1. `supabase.from('queue_goals').select(...)`  → limites configurados por fila:
 *     { id, queue_id, alerts_enabled, max_waiting_contacts, max_avg_wait_minutes,
 *       min_assignment_rate, max_messages_pending }   (mesmo shape já usado pelo hook)
 *  2. `supabase.rpc('rpc_queue_goal_metrics')`     → métricas REAIS medidas por fila:
 *     { queue_id, waiting_contacts, avg_wait_minutes, assignment_rate,
 *       messages_pending, coverage }[]              (coverage: 'sem_posicoes' => sem base)
 *  3. Toast SÓ quando valor real ultrapassa o limite; valor null ou limite null => NUNCA toast
 *     (guard "sem base => sem toast" — nunca fabricar valor).
 *  4. Dedupe por sessão: mesma ultrapassagem não re-dispara toast.
 *
 * Formato do toast: `toast.info` (ou warning/success/error) com a mensagem contendo o
 * valor real medido (ex.: `... Espera (contatos) 12/10 (120%)`).
 *
 * Estado em 2026-08-17 10:30: executor ainda NÃO wirou a RPC (hook lê só queue_goals com
 * value hardcoded null) — testes de wiring devem falhar RED até a implementação.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ---- mocks hoisted (disponíveis dentro do factory do vi.mock) ----
const rpcMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());
const authGetUserMock = vi.hoisted(() => vi.fn());

// Estado mutável por teste (shape do contrato acima)
const state = vi.hoisted(() => ({
  goals: [] as unknown[],
  metrics: [] as unknown[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (...args: unknown[]) => fromMock(...args),
    auth: { getUser: (...args: unknown[]) => authGetUserMock(...args) },
  },
}));

const toastMock = vi.hoisted(() => ({
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('@/lib/logger');

import { useGoalNotifications } from '@/hooks/useGoalNotifications';

/** Todas as chamadas de toast (qualquer variante) — o contrato é "disparou toast". */
const toastCalls = () =>
  (Object.values(toastMock) as ReturnType<typeof vi.fn>[]).flatMap((fn) => fn.mock.calls);

const GOAL_OVER_LIMIT = {
  id: 'goal-1',
  queue_id: 'queue-1',
  alerts_enabled: true,
  max_waiting_contacts: 10,
  max_avg_wait_minutes: 5,
  min_assignment_rate: 80,
  max_messages_pending: 20,
};

/** Métricas reais: espera 12 > limite 10 (ultrapassou); demais dentro do limite. */
const METRICS_OVER_LIMIT = [
  {
    queue_id: 'queue-1',
    waiting_contacts: 12,
    avg_wait_minutes: 3,
    assignment_rate: 90,
    messages_pending: 5,
    coverage: 'ok',
  },
];

function setupFrom(goals: unknown[]) {
  fromMock.mockImplementation((table: string) => {
    if (table === 'queue_goals') {
      return { select: vi.fn().mockResolvedValue({ data: goals, error: null }) };
    }
    return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
  });
}

function setupRpc(metrics: unknown[]) {
  rpcMock.mockImplementation((name: string) =>
    name === 'rpc_queue_goal_metrics'
      ? Promise.resolve({ data: metrics, error: null })
      : Promise.resolve({ data: null, error: null }),
  );
}

describe('useGoalNotifications — wiring de métricas reais (rpc_queue_goal_metrics)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authGetUserMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    state.goals = [];
    state.metrics = [];
  });

  it('busca limites em queue_goals e valores reais via RPC rpc_queue_goal_metrics', async () => {
    setupFrom([GOAL_OVER_LIMIT]);
    setupRpc(METRICS_OVER_LIMIT);

    renderHook(() => useGoalNotifications());

    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    expect(rpcMock.mock.calls[0][0]).toBe('rpc_queue_goal_metrics');
    expect(fromMock).toHaveBeenCalledWith('queue_goals');
  });

  it('dispara toast QUANDO o valor real ultrapassa o limite (12 > 10), com o valor na mensagem', async () => {
    setupFrom([GOAL_OVER_LIMIT]);
    setupRpc(METRICS_OVER_LIMIT);

    renderHook(() => useGoalNotifications());

    await waitFor(() => expect(toastCalls().length).toBeGreaterThan(0));

    const [msg] = toastCalls()[0];
    expect(String(msg)).toContain('Espera (contatos)');
    // valor real medido aparece na mensagem (anti-padrão: toast sem base real)
    expect(String(msg)).toContain('12');
  });

  it('NÃO dispara toast quando o valor real está abaixo do primeiro band (50% do limite)', async () => {
    setupFrom([GOAL_OVER_LIMIT]);
    setupRpc([
      {
        queue_id: 'queue-1',
        waiting_contacts: 4, // 40% de 10 — abaixo do band 50%
        avg_wait_minutes: 2, // 40% de 5 — abaixo do band 50%
        assignment_rate: null, // sem base (invertido não deve disparar sem valor)
        messages_pending: 9, // 45% de 20 — abaixo do band 50%
        coverage: 'ok',
      },
    ]);

    renderHook(() => useGoalNotifications());

    // garante que o check rodou de fato (RPC chamada) antes de afirmar ausência de toast
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    expect(toastCalls().length).toBe(0);
  });

  it('dispara toast a cada band NOVO cruzado (progressivo: 60% → 80% do limite)', async () => {
    setupFrom([GOAL_OVER_LIMIT]); // limite 10
    setupRpc([
      {
        queue_id: 'queue-1',
        waiting_contacts: 6, // 60% → cruza band 50
        avg_wait_minutes: 2, // 40% de 5 — abaixo do band 50% (senão cruza junto: 3/5=60%)
        assignment_rate: null,
        messages_pending: 5,
        coverage: 'ok',
      },
    ]);

    const { result } = renderHook(() => useGoalNotifications());

    // 6/10 cruza band 50; avg 2/5 (40%) e pending 5/20 (25%) ficam abaixo → exatamente 1 toast
    await waitFor(() => expect(toastCalls().length).toBe(1));
    expect(String(toastCalls()[0][0])).toContain('Espera (contatos)');
    expect(String(toastCalls()[0][0])).toContain('6/10');

    // sobe para 80% → cruza band 75 (novo band) → novo toast
    setupRpc([
      {
        queue_id: 'queue-1',
        waiting_contacts: 8,
        avg_wait_minutes: 2,
        assignment_rate: null,
        messages_pending: 5,
        coverage: 'ok',
      },
    ]);
    await act(async () => {
      await result.current.checkGoalProgress();
    });

    expect(toastCalls().length).toBe(2);
    expect(String(toastCalls()[1][0])).toContain('8/10');
  });

  it('NÃO dispara toast quando value é null (coverage sem_posicoes = sem base real)', async () => {
    setupFrom([GOAL_OVER_LIMIT]);
    setupRpc([
      {
        queue_id: 'queue-1',
        waiting_contacts: null,
        avg_wait_minutes: null,
        assignment_rate: null,
        messages_pending: null,
        coverage: 'sem_posicoes',
      },
    ]);

    renderHook(() => useGoalNotifications());

    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    expect(toastCalls().length).toBe(0);
  });

  it('NÃO dispara toast quando o limite é null (nenhuma meta configurada)', async () => {
    setupFrom([
      {
        id: 'goal-1',
        queue_id: 'queue-1',
        alerts_enabled: true,
        max_waiting_contacts: null,
        max_avg_wait_minutes: null,
        min_assignment_rate: null,
        max_messages_pending: null,
      },
    ]);
    setupRpc(METRICS_OVER_LIMIT);

    renderHook(() => useGoalNotifications());

    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    expect(toastCalls().length).toBe(0);
  });

  it('NÃO dispara toast quando alerts_enabled = false (nem chama a RPC — sem metas com alerta)', async () => {
    setupFrom([{ ...GOAL_OVER_LIMIT, alerts_enabled: false }]);
    setupRpc(METRICS_OVER_LIMIT);

    renderHook(() => useGoalNotifications());

    // o check roda (lê queue_goals) mas, sem metas com alerta habilitado, para antes da RPC
    await waitFor(() => expect(fromMock).toHaveBeenCalledWith('queue_goals'));
    await act(async () => {});
    expect(rpcMock).not.toHaveBeenCalled();
    expect(toastCalls().length).toBe(0);
  });

  it('não chama RPC nem tabela quando não há usuário autenticado', async () => {
    authGetUserMock.mockResolvedValue({ data: { user: null }, error: null });
    setupFrom([GOAL_OVER_LIMIT]);
    setupRpc(METRICS_OVER_LIMIT);

    renderHook(() => useGoalNotifications());

    await act(async () => {});
    expect(rpcMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
    expect(toastCalls().length).toBe(0);
  });

  it('deduplica por sessão: mesma ultrapassagem não re-dispara toast', async () => {
    setupFrom([GOAL_OVER_LIMIT]);
    setupRpc(METRICS_OVER_LIMIT);

    const { result } = renderHook(() => useGoalNotifications());

    await waitFor(() => expect(toastCalls().length).toBeGreaterThan(0));
    const countAfterMount = toastCalls().length;

    await act(async () => {
      await result.current.checkGoalProgress();
    });

    expect(toastCalls().length).toBe(countAfterMount);
  });
});
