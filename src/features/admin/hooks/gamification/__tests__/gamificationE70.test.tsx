/**
 * E70 — Gamificação real: XP transacional via RPC (nível sobe ao acumular XP;
 * achievement desbloqueia 1x).
 *
 * Contrato (Etapa 70 do PLANO-100-ETAPAS):
 *   - `addXp` persiste via RPC `rpc_grant_xp` (SECURITY DEFINER, transacional)
 *     — o nível sobe ao cruzar o threshold (50 XP → nível 2, fórmula espelhada
 *     em levelUtils.ts) e o RPC devolve `leveled_up`.
 *   - `grantAchievement` persiste via RPC `rpc_unlock_achievement` — dedupe
 *     transacional: um achievement NÃO-repetível desbloqueia 1x (segunda
 *     tentativa → `alreadyHad: true`, sem XP duplo, sem erro).
 *   - Erro 23505 (race de unique) → tratado como `alreadyHad`, nunca throw.
 *   - Tipos repetíveis (`daily_goal`, `streak`, `message_milestone`)
 *     continuam permitindo múltiplas entradas (semântica pré-existente).
 *
 * RED esperado ANTES da implementação: `supabase.rpc` nunca é chamado pela
 * implementação atual (escrevia direto em agent_stats/agent_achievements via
 * `.from().update()/insert()`), então `toHaveBeenCalledWith('rpc_grant_xp')`
 * falha.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGamificationMutations } from '../mutations';
import type { AgentStats } from '../types';

const rpcMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: rpcMock, from: fromMock },
}));

const STATS: AgentStats = {
  id: 's1',
  profile_id: 'p1',
  xp: 40,
  level: 1,
  current_streak: 0,
  best_streak: 0,
  messages_sent: 0,
  messages_received: 0,
  conversations_resolved: 0,
  achievements_count: 0,
  avg_response_time_seconds: null,
  customer_satisfaction_score: null,
};

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { gcTime: 60000, retry: false } },
    mutationCache: undefined,
  });
  return {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
    qc,
  };
}

describe('useGamificationMutations — XP transacional (E70)', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
  });

  it('addXp chama rpc_grant_xp com perfil/amount/reason', async () => {
    rpcMock.mockResolvedValue({
      data: { new_xp: 60, new_level: 2, leveled_up: true, previous_level: 1 },
      error: null,
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useGamificationMutations('p1', STATS), { wrapper });

    await result.current.addXp({ xp: 20, reason: 'etapa70-test' });

    expect(rpcMock).toHaveBeenCalledWith('rpc_grant_xp', {
      p_profile_id: 'p1',
      p_amount: 20,
      p_reason: 'etapa70-test',
    });
  });

  it('nível sobe ao acumular XP: 40 XP + 20 = 60 XP cruza o threshold do nível 2 (leveled_up)', async () => {
    rpcMock.mockResolvedValue({
      data: { new_xp: 60, new_level: 2, leveled_up: true, previous_level: 1 },
      error: null,
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useGamificationMutations('p1', STATS), { wrapper });

    const out = await result.current.addXp({ xp: 20, reason: 'etapa70-test' });

    expect(out).toEqual({ newXp: 60, newLevel: 2, leveledUp: true, previousLevel: 1 });
  });

  it('abaixo do threshold: 40 XP + 5 = 45 XP mantém nível 1 (leveled_up=false)', async () => {
    rpcMock.mockResolvedValue({
      data: { new_xp: 45, new_level: 1, leveled_up: false, previous_level: 1 },
      error: null,
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useGamificationMutations('p1', STATS), { wrapper });

    const out = await result.current.addXp({ xp: 5, reason: 'etapa70-test' });

    expect(out.leveledUp).toBe(false);
    expect(out.newLevel).toBe(1);
  });

  it('addXp sem profileId lança "No profile ID" e NÃO chama RPC', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useGamificationMutations(undefined, STATS), { wrapper });

    await expect(result.current.addXp({ xp: 10, reason: 'x' })).rejects.toThrow('No profile ID');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('grantAchievement novo: chama rpc_unlock_achievement e mapeia alreadyHad=false', async () => {
    rpcMock.mockResolvedValue({
      data: {
        already_unlocked: false,
        new_xp: 90,
        new_level: 2,
        previous_level: 1,
        leveled_up: true,
      },
      error: null,
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useGamificationMutations('p1', STATS), { wrapper });

    const out = await result.current.grantAchievement({
      type: 'speed_demon',
      name: 'Speed Demon',
      description: 'Respondeu em 15s',
      xpReward: 50,
    });

    expect(rpcMock).toHaveBeenCalledWith('rpc_unlock_achievement', {
      p_profile_id: 'p1',
      p_type: 'speed_demon',
      p_name: 'Speed Demon',
      p_description: 'Respondeu em 15s',
      p_xp_reward: 50,
    });
    expect(out.alreadyHad).toBe(false);
    expect(out.newXp).toBe(90);
    expect(out.newLevel).toBe(2);
    expect(out.leveledUp).toBe(true);
  });

  it('achievement desbloqueia 1x: segunda tentativa devolve alreadyHad=true (sem XP duplo)', async () => {
    rpcMock.mockResolvedValue({
      data: { already_unlocked: true, new_xp: 0, new_level: 1, leveled_up: false, previous_level: 1 },
      error: null,
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useGamificationMutations('p1', STATS), { wrapper });

    const out = await result.current.grantAchievement({
      type: 'speed_demon',
      name: 'Speed Demon',
      description: 'Respondeu em 15s',
      xpReward: 50,
    });

    expect(out.alreadyHad).toBe(true);
    expect(out.leveledUp).toBe(false);
    // Nenhum XP novo é creditado na tentativa repetida
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it('race 23505 (unique violation) é tratada como alreadyHad — nunca throw', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useGamificationMutations('p1', STATS), { wrapper });

    const out = await result.current.grantAchievement({
      type: 'resolution',
      name: 'Problema Resolvido',
      description: 'x',
      xpReward: 40,
    });

    expect(out.alreadyHad).toBe(true);
  });

  it('erro de RPC não-23505 é propagado (throw)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useGamificationMutations('p1', STATS), { wrapper });

    await expect(
      result.current.grantAchievement({ type: 'resolution', name: 'x', description: 'x', xpReward: 40 })
    ).rejects.toThrow('not found');
  });

  it('tipos repetíveis continuam permitidos: rpc_unlock_achievement recebe o tipo (dedupe é do RPC)', async () => {
    rpcMock.mockResolvedValue({
      data: { already_unlocked: false, new_xp: 65, new_level: 2, previous_level: 1, leveled_up: true },
      error: null,
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useGamificationMutations('p1', STATS), { wrapper });

    await result.current.grantAchievement({
      type: 'streak',
      name: 'Mini Streak',
      description: '3 respostas seguidas',
      xpReward: 25,
    });

    expect(rpcMock).toHaveBeenCalledWith(
      'rpc_unlock_achievement',
      expect.objectContaining({ p_type: 'streak', p_xp_reward: 25 })
    );
  });

  it('grantAchievement sem profileId lança "No profile ID" e NÃO chama RPC', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useGamificationMutations(undefined, STATS), { wrapper });

    await expect(
      result.current.grantAchievement({ type: 'resolution', name: 'x', description: 'x', xpReward: 40 })
    ).rejects.toThrow('No profile ID');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  // ---- updateStreak/incrementMessages/incrementResolutions continuam via from() ----
  it('incrementMessages permanece via .from(agent_stats).update() (contadores não-XP)', async () => {
    const chain = { eq: vi.fn().mockResolvedValue({ error: null }) };
    const update = vi.fn().mockReturnValue(chain);
    fromMock.mockReturnValue({ update });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useGamificationMutations('p1', STATS), { wrapper });

    await result.current.incrementMessages('sent');

    expect(fromMock).toHaveBeenCalledWith('agent_stats');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ messages_sent: 1, messages_received: 0 })
    );
  });
});
