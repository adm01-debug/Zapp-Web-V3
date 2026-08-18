/**
 * E70 — GamificationProvider: gamificação real sem duplicação.
 *
 * Contrato (Etapa 70):
 *   - Achievement desbloqueia 1x: quando o RPC devolve `alreadyHad: true`, o
 *     provider NÃO re-exibe o toast (antes exibia sempre — spammava o usuário
 *     com o mesmo achievement a cada trigger).
 *   - Nível sobe ao acumular XP: quando agent_stats.xp cruza o threshold, o
 *     provider dispara triggerLevelUp (grantAchievement LEVEL_UP + toast) —
 *     fim do XP fictício.
 *
 * RED esperado ANTES da implementação: o provider atual exibe o toast mesmo
 * com alreadyHad=true (assert de ausência falha) e o trigger de level-up já
 * existe (este teste fixa o contrato).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GamificationProvider, useGamification } from '@/components/gamification/GamificationProvider';

const gamMock = vi.hoisted(() => ({
  useAgentGamification: vi.fn(),
  ACHIEVEMENT_TYPES: {
    FAST_RESPONSE: 'fast_response',
    SPEED_DEMON: 'speed_demon',
    STREAK: 'streak',
    STREAK_MASTER: 'streak_master',
    RESOLUTION: 'resolution',
    PERFECT_RATING: 'perfect_rating',
    LEVEL_UP: 'level_up',
    DAILY_GOAL: 'daily_goal',
    FIRST_MESSAGE: 'first_message',
    FIRST_RESOLUTION: 'first_resolution',
    MESSAGE_MILESTONE: 'message_milestone',
    TEAM_PLAYER: 'team_player',
  },
  // Espelho byte-exato de levelUtils.calculateLevel (mock do barrel pesado)
  calculateLevel: (xp: number) => Math.max(1, Math.floor(Math.sqrt(xp / 50.0)) + 1),
}));

vi.mock('@/features/admin', () => gamMock);

function baseStats(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

function makeGamificationReturn(overrides: Record<string, unknown> = {}) {
  return {
    stats: baseStats(),
    achievements: [],
    isLoading: false,
    profileId: 'p1',
    grantAchievement: vi.fn().mockResolvedValue({ alreadyHad: false }),
    updateStreak: vi.fn().mockResolvedValue({ newStreak: 1, newBestStreak: 1 }),
    incrementMessages: vi.fn().mockResolvedValue({ newSent: 1, newReceived: 0 }),
    incrementResolutions: vi.fn().mockResolvedValue({ newResolutions: 1 }),
    addXp: vi.fn().mockResolvedValue({ newXp: 40, newLevel: 1, leveledUp: false, previousLevel: 1 }),
    isAddingXp: false,
    isGrantingAchievement: false,
    ...overrides,
  };
}

function FastResponseProbe() {
  const { triggerFastResponse } = useGamification();
  return (
    <button data-testid="fast" onClick={() => void triggerFastResponse(15)}>
      fast
    </button>
  );
}

function LevelUpProbe() {
  const { stats } = useGamification();
  return <span data-testid="stats-level">{stats?.level ?? 'null'}</span>;
}

describe('GamificationProvider — desbloqueio 1x e nível sobe (E70)', () => {
  beforeEach(() => {
    gamMock.useAgentGamification.mockReset();
  });

  it('já desbloqueado (alreadyHad=true): NÃO re-exibe o toast do achievement', async () => {
    gamMock.useAgentGamification.mockReturnValue(
      makeGamificationReturn({
        grantAchievement: vi.fn().mockResolvedValue({ alreadyHad: true }),
      })
    );

    render(
      <GamificationProvider>
        <FastResponseProbe />
      </GamificationProvider>
    );

    fireEvent.click(screen.getByTestId('fast'));

    await waitFor(() => {
      expect(gamMock.useAgentGamification().grantAchievement).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'speed_demon', xpReward: 50 })
      );
    });
    // Sem toast duplicado do mesmo achievement
    expect(screen.queryByText(/Incrível! Respondeu em 15s/)).toBeNull();
  });

  it('desbloqueio novo (alreadyHad=false): exibe o toast uma vez', async () => {
    gamMock.useAgentGamification.mockReturnValue(makeGamificationReturn());

    render(
      <GamificationProvider>
        <FastResponseProbe />
      </GamificationProvider>
    );

    fireEvent.click(screen.getByTestId('fast'));

    expect(await screen.findByText(/Incrível! Respondeu em 15s/)).toBeTruthy();
  });

  it('nível sobe ao acumular XP: stats com 60 XP (threshold nível 2) dispara triggerLevelUp', async () => {
    const grantAchievement = vi.fn().mockResolvedValue({ alreadyHad: false });
    gamMock.useAgentGamification.mockReturnValue(
      makeGamificationReturn({ stats: baseStats({ xp: 60, level: 1 }), grantAchievement })
    );

    render(
      <GamificationProvider>
        <LevelUpProbe />
      </GamificationProvider>
    );

    await waitFor(() => {
      expect(grantAchievement).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'level_up', name: 'Nível 2', xpReward: 100 })
      );
    });
    // Toast de level-up visível
    expect(await screen.findByText(/Você alcançou o Nível 2!/)).toBeTruthy();
  });

  it('sem cruzar threshold (40 XP → nível 1): NENHUM level_up é disparado', async () => {
    const grantAchievement = vi.fn().mockResolvedValue({ alreadyHad: false });
    gamMock.useAgentGamification.mockReturnValue(
      makeGamificationReturn({ stats: baseStats({ xp: 40, level: 1 }), grantAchievement })
    );

    render(
      <GamificationProvider>
        <LevelUpProbe />
      </GamificationProvider>
    );

    // Pequena janela para efeitos assíncronos não dispararem
    await new Promise((r) => setTimeout(r, 50));
    expect(grantAchievement).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'level_up' })
    );
  });
});
