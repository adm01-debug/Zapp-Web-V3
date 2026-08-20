/**
 * E70 — XP de gamificação com escrita TRANSACIONAL (fim da race condition).
 *
 * Contrato (implementado pela migration 20260818190002_etapa70_gamification_xp_transactions.sql):
 *   - `zapp.rpc_grant_xp(p_profile_id, p_amount, p_reason)` — ledger
 *     `xp_transactions` + UPDATE atômico `xp = xp + amount` com FOR UPDATE
 *     (serializa escritas concorrentes no mesmo perfil); nível recalculado no
 *     RPC (FLOOR(SQRT(xp/50))+1, espelhado em levelUtils.ts).
 *   - `zapp.rpc_unlock_achievement(p_profile_id, p_type, p_name, p_description, p_xp_reward)` —
 *     INSERT com `ON CONFLICT (profile_id, achievement_type) DO NOTHING`
 *     (dedupe transacional via índice único `agent_achievements_unique`) +
 *     XP creditado via rpc_grant_xp e `achievements_count` incrementado.
 *
 * O mock abaixo ESPELHA a semântica SQL linha a linha (é o "banco transacional"
 * em memória). O código antigo (read-modify-write client-side, `mutations.ts`
 * pré-E59) computa `newXp = (currentStats.xp || 0) + delta` a partir do CACHE e
 * grava o valor ABSOLUTO via `.from('agent_stats').update(...)` — o mock aplica
 * isso como escrita absoluta (last-write-wins). 2 eventos simultâneos com cache
 * stale (100 no banco, 0 no cache) provam a diferença:
 *
 *   - antigo: 2× addXp(+10) → final 10 (1 incremento perdido — race);
 *   - novo:   2× addXp(+10) → final 120 (cada delta soma exatamente 1×).
 *
 * Quarentena do vitest.config.ts: nenhum nome aqui está na lista exclude.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => {
  type Stats = {
    profile_id: string;
    xp: number;
    level: number;
    achievements_count: number;
  };
  type Achievement = {
    id: string;
    profile_id: string;
    achievement_type: string;
    achievement_name: string;
    xp_earned: number;
  };

  const levelOf = (xp: number): number => Math.max(1, Math.floor(Math.sqrt(xp / 50.0)) + 1);

  const stats = new Map<string, Stats>();
  const achievements: Achievement[] = [];
  const calls: { rpc: { name: string; args: Record<string, unknown> }[]; absoluteUpdates: number } = {
    rpc: [],
    absoluteUpdates: 0,
  };
  let achievementSeq = 0;

  const getOrCreateStats = (profileId: string): Stats => {
    let s = stats.get(profileId);
    if (!s) {
      s = { profile_id: profileId, xp: 0, level: 1, achievements_count: 0 };
      stats.set(profileId, s);
    }
    return s;
  };

  /** Espelho de zapp.rpc_grant_xp (E70): ledger + UPDATE atômico xp = xp + amount. */
  const rpcGrantXp = (args: { p_profile_id: string; p_amount: number }) => {
    const s = getOrCreateStats(args.p_profile_id);
    const previousLevel = s.level;
    s.xp += args.p_amount; // atômico: xp = xp + $1
    s.level = levelOf(s.xp); // FLOOR(SQRT(xp/50))+1 no RPC (E70)
    return {
      data: {
        new_xp: s.xp,
        new_level: s.level,
        leveled_up: s.level > previousLevel,
        previous_level: previousLevel,
      },
      error: null,
    };
  };

  /** Espelho de zapp.rpc_unlock_achievement (E70): dedupe ON CONFLICT + xp/count atômicos. */
  const rpcUnlockAchievement = (args: {
    p_profile_id: string;
    p_type: string;
    p_name: string;
    p_xp_reward: number;
  }) => {
    const dup = achievements.some(
      (a) => a.profile_id === args.p_profile_id && a.achievement_type === args.p_type
    );
    if (dup)
      return {
        data: {
          already_unlocked: true,
          new_xp: null,
          new_level: null,
          leveled_up: false,
          previous_level: null,
        },
        error: null,
      }; // ON CONFLICT DO NOTHING
    achievements.push({
      id: `ach-${++achievementSeq}`,
      profile_id: args.p_profile_id,
      achievement_type: args.p_type,
      achievement_name: args.p_name,
      xp_earned: args.p_xp_reward,
    });
    const s = getOrCreateStats(args.p_profile_id);
    const previousLevel = s.level;
    s.xp += args.p_xp_reward; // XP via rpc_grant_xp('achievement:<type>')
    s.achievements_count += 1; // achievements_count = count + 1 (mesmo UPDATE)
    s.level = levelOf(s.xp);
    return {
      data: {
        already_unlocked: false,
        new_xp: s.xp,
        new_level: s.level,
        leveled_up: s.level > previousLevel,
        previous_level: previousLevel,
      },
      error: null,
    };
  };

  /** Cadeia `.from()` emulando o caminho LEGADO (read-modify-write absoluto). */
  const makeFrom = (table: string) => {
    const chain: Record<string, unknown> = {};
    const filters: { col: string; val: unknown }[] = [];
    chain.select = () => chain;
    chain.eq = (col: string, val: unknown) => {
      filters.push({ col, val });
      return chain;
    };
    chain.maybeSingle = async () => {
      if (table === 'agent_achievements') {
        const row = achievements.find((a) =>
          filters.every((f) => (a as unknown as Record<string, unknown>)[f.col] === f.val)
        );
        return { data: row ? { id: row.id } : null, error: null };
      }
      return { data: null, error: null };
    };
    chain.insert = async (row: Record<string, unknown>) => {
      if (table === 'agent_achievements') {
        const exists = achievements.some(
          (a) =>
            a.profile_id === row.profile_id && a.achievement_type === row.achievement_type
        );
        if (exists) return { data: null, error: { code: '23505' } }; // índice único real
        achievements.push({
          id: `ach-${++achievementSeq}`,
          profile_id: row.profile_id as string,
          achievement_type: row.achievement_type as string,
          achievement_name: (row.achievement_name as string) ?? '',
          xp_earned: (row.xp_earned as number) ?? 0,
        });
        return { data: [row], error: null };
      }
      return { data: [row], error: null };
    };
    chain.update = (payload: Record<string, unknown>) => ({
      eq: async (_col: string, val: unknown) => {
        // PostgREST UPDATE real: escrita ABSOLUTA (last-write-wins) — é a race.
        if (table === 'agent_stats') {
          const s = getOrCreateStats(val as string);
          if (typeof payload.xp === 'number') s.xp = payload.xp;
          if (typeof payload.level === 'number') s.level = payload.level;
          if (typeof payload.achievements_count === 'number')
            s.achievements_count = payload.achievements_count;
          calls.absoluteUpdates += 1;
        }
        return { data: null, error: null };
      },
    });
    return chain;
  };

  const client = {
    rpc: vi.fn((name: string, args: Record<string, unknown>) => {
      calls.rpc.push({ name, args });
      if (name === 'rpc_grant_xp') return Promise.resolve(rpcGrantXp(args as never));
      if (name === 'rpc_unlock_achievement') return Promise.resolve(rpcUnlockAchievement(args as never));
      return Promise.resolve({ data: null, error: { message: `unknown rpc: ${name}` } });
    }),
    from: vi.fn((table: string) => makeFrom(table)),
  };

  const seedStats = (profileId: string, xp: number, level: number) => {
    stats.set(profileId, { profile_id: profileId, xp, level, achievements_count: 0 });
  };
  const reset = () => {
    stats.clear();
    achievements.length = 0;
    calls.rpc = [];
    calls.absoluteUpdates = 0;
    achievementSeq = 0;
  };
  const xpOf = (profileId: string): number | undefined => stats.get(profileId)?.xp;
  const achievementCount = (): number => achievements.length;

  return { client, seedStats, reset, xpOf, achievementCount, calls, levelOf };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: h.client }));

import { useGamificationMutations } from '../mutations';
import type { AgentStats } from '../types';

const PROFILE_ID = '00000000-0000-4000-8000-00000000e59';
const XP_DB = 100; // valor real no banco
const XP_CACHE = 0; // cache stale — a raiz da race (2ª aba/evento leu antes do 1º gravar)

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { gcTime: 60_000 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function makeStaleStats(): AgentStats {
  return {
    id: 'stats-1',
    profile_id: PROFILE_ID,
    xp: XP_CACHE,
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
}

beforeEach(() => {
  h.reset();
  h.seedStats(PROFILE_ID, XP_DB, h.levelOf(XP_DB));
});

describe('E59 — escrita transacional de XP (fim da race read-modify-write)', () => {
  it('addXp: 2 eventos simultâneos somam os 2 deltas (XP final 120, não 10/110)', async () => {
    const { result } = renderHook(() => useGamificationMutations(PROFILE_ID, makeStaleStats()), {
      wrapper: makeWrapper(),
    });

    let results: { newXp: number | null }[] = [];
    await act(async () => {
      results = await Promise.all([
        result.current.addXp({ xp: 10, reason: 'fast_response' }),
        result.current.addXp({ xp: 10, reason: 'message_milestone' }),
      ]);
    });

    // cada evento carrega o próprio DELTA (contrato: nunca valor absoluto do cache)
    const addXpCalls = h.calls.rpc.filter((c) => c.name === 'rpc_grant_xp');
    expect(addXpCalls).toHaveLength(2);
    for (const c of addXpCalls) {
      expect(c.args.p_profile_id).toBe(PROFILE_ID);
      expect(c.args.p_amount).toBe(10);
    }

    // zero escritas absolutas via .from().update() — o cliente não calcula mais
    // newXp a partir do cache stale
    expect(h.calls.absoluteUpdates).toBe(0);

    // banco transacional: 100 + 10 + 10 = 120 (cada incremento conta 1×)
    expect(h.xpOf(PROFILE_ID)).toBe(120);
    expect(results.map((r) => r.newXp)).toEqual([110, 120]);
  });

  it('addXp: retorno é server-authoritative (banco 100 + delta, não cache stale 0 + delta)', async () => {
    const { result } = renderHook(() => useGamificationMutations(PROFILE_ID, makeStaleStats()), {
      wrapper: makeWrapper(),
    });

    let res: { newXp: number | null; newLevel: number | null } | undefined;
    await act(async () => {
      res = await result.current.addXp({ xp: 10, reason: 'fast_response' });
    });

    expect(res?.newXp).toBe(110); // 100 do banco + 10 (cache stale de 0 NÃO é usado)
    expect(res?.newLevel).toBe(h.levelOf(110));
    expect(h.xpOf(PROFILE_ID)).toBe(110);
  });

  it('grantAchievement: 2 simultâneos do MESMO tipo → dedupe atômico (XP soma 1×, 1 row, um alreadyHad)', async () => {
    const { result } = renderHook(() => useGamificationMutations(PROFILE_ID, makeStaleStats()), {
      wrapper: makeWrapper(),
    });

    let results: { alreadyHad: boolean; newXp: number | null; newLevel: number | null; leveledUp: boolean; previousLevel: number | null }[] = [];
    await act(async () => {
      results = await Promise.all([
        result.current.grantAchievement({
          type: 'resolution',
          name: 'Problema Resolvido',
          description: 'Cliente satisfeito!',
          xpReward: 40,
        }),
        result.current.grantAchievement({
          type: 'resolution',
          name: 'Problema Resolvido',
          description: 'Cliente satisfeito!',
          xpReward: 40,
        }),
      ]);
    });

    expect(h.achievementCount()).toBe(1); // índice único: 1 row só
    expect(h.xpOf(PROFILE_ID)).toBe(140); // 100 + 40 (o 2º NÃO soma de novo)
    expect(results.filter((r) => r.alreadyHad)).toHaveLength(1);
    expect(results.filter((r) => !r.alreadyHad)).toHaveLength(1);
  });

  it('grantAchievement: 2 simultâneos de tipos DIFERENTES → ambos somam (XP 215)', async () => {
    const { result } = renderHook(() => useGamificationMutations(PROFILE_ID, makeStaleStats()), {
      wrapper: makeWrapper(),
    });

    let results: { alreadyHad: boolean }[] = [];
    await act(async () => {
      results = await Promise.all([
        result.current.grantAchievement({
          type: 'resolution',
          name: 'Problema Resolvido',
          description: 'Cliente satisfeito!',
          xpReward: 40,
        }),
        result.current.grantAchievement({
          type: 'perfect_rating',
          name: 'Avaliação Perfeita',
          description: 'Nota máxima!',
          xpReward: 75,
        }),
      ]);
    });

    // antigo: last-write-wins a partir do cache stale → 75; transacional: 100+40+75 = 215
    expect(h.xpOf(PROFILE_ID)).toBe(215);
    expect(h.achievementCount()).toBe(2);
    expect(results.every((r) => !r.alreadyHad)).toBe(true);
  });

  it('grantAchievement: duplicado sequencial → alreadyHad=true e XP não muda', async () => {
    const { result } = renderHook(() => useGamificationMutations(PROFILE_ID, makeStaleStats()), {
      wrapper: makeWrapper(),
    });

    let first: { alreadyHad: boolean } | undefined;
    let second: { alreadyHad: boolean } | undefined;
    await act(async () => {
      first = await result.current.grantAchievement({
        type: 'speed_demon',
        name: 'Speed Demon',
        description: 'Respondeu em 10s!',
        xpReward: 50,
      });
      second = await result.current.grantAchievement({
        type: 'speed_demon',
        name: 'Speed Demon',
        description: 'Respondeu em 10s!',
        xpReward: 50,
      });
    });

    expect(first?.alreadyHad).toBe(false);
    expect(second?.alreadyHad).toBe(true);
    expect(h.xpOf(PROFILE_ID)).toBe(150); // 100 + 50, uma única vez
    expect(h.achievementCount()).toBe(1);
  });
});
