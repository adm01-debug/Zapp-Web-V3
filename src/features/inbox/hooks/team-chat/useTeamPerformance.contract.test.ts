/**
 * Regressão — PR #1346 (quality-gate): data-layer ratchet.
 *
 * Valida que o hook `useTeamPerformance` existe, usa queryKey canônico de
 * teamChat.performance e expõe a janela de telemetria — o fix que movió
 * el acesso a team_messages desde UI pura (TeamPerformancePanel) a hook
 * de dominio con safeClient (destrava hard-fail de src/components).
 *
 * Rodar: bunx vitest run src/features/inbox/hooks/team-chat/useTeamPerformance.contract.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: Array<{ queryKey: string[]; queryFn: () => unknown }> = [];

vi.mock('@/services/api/queryKeys', () => ({
  queryKeys: {
    teamChat: { performance: (id: string) => ['team-performance', id] as const },
  },
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn((opts: { queryKey: string[]; queryFn: () => unknown }) => {
    calls.push(opts);
    return { data: null, isLoading: true, isError: false };
  }),
}));

// Importar depois dos mocks.
const { useTeamPerformance, TEAM_PERFORMANCE_WINDOW_MINUTES } = await import('./useTeamPerformance');

describe('useTeamPerformance — data-layer ratchet (PR #1346)', () => {
  beforeEach(() => calls.splice(0));

  it('usa queryKey canônico teamChat.performance(conversationId)', () => {
    useTeamPerformance('conv-1');
    expect(calls[0].queryKey).toEqual(['team-performance', 'conv-1']);
  });

  it('mantém a janela de telemetria em 30 minutos', () => {
    expect(TEAM_PERFORMANCE_WINDOW_MINUTES).toBe(30);
  });

  it('queryFn consulta team_messages limitado a 2000 linhas', () => {
    useTeamPerformance('conv-1');
    const fnSrc = calls[0].queryFn.toString();
    expect(fnSrc).toContain('team_messages');
    expect(fnSrc).toContain('.limit(2000)');
  });
});