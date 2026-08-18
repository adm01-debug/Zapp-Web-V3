/**
 * E37 — Heartbeat mantém a sessão online (useInboxHeartbeat).
 *
 * Contrato verificado:
 *   - Sessão longa com aba VISÍVEL (10min+) nunca cai para offline: o interval
 *     de 180s tenta manter 'online', o throttle global de 240s engole os ticks
 *     (1 write do mount), e NENHUM write 'offline' ocorre enquanto visível.
 *   - O intervalo de heartbeat não fura o throttle (180s < 240s): avançar 1 tick
 *     não produz write extra.
 *   - Após o keep-alive longo, uma saída REAL ainda é detectada imediatamente
 *     (evento `offline` → forceWrite offline; pagehide → forceWrite offline).
 *   - Estado exposto (isOnline/onlineStatus) reflete 'online' durante a sessão.
 *
 * TDD: RED se o heartbeat derrubar a sessão com a aba visível (write offline
 * espúrio) ou parar de responder à saída real; GREEN com a implementação atual.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInboxHeartbeat } from '../useInboxHeartbeat';

// ===== Assinaturas reais da cadeia mockada =====
type OnlineStatus = 'online' | 'offline' | 'busy';
type ProfileUpdatePayload = { online_status: OnlineStatus; last_seen: string };
type EqResult = { data: null; error: null };
type EqFn = (column: string, value: string) => Promise<EqResult>;
type UpdateFn = (payload: ProfileUpdatePayload) => { eq: EqFn };
type FromFn = (table: string) => { update: UpdateFn };

const { mockFrom, mockUpdate, mockEq } = vi.hoisted(() => {
  const mockEq = vi.fn<EqFn>().mockResolvedValue({ data: null, error: null });
  const mockUpdate = vi.fn<UpdateFn>(() => ({ eq: mockEq }));
  const mockFrom = vi.fn<FromFn>(() => ({ update: mockUpdate }));
  return { mockFrom, mockUpdate, mockEq };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mockFrom,
  },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const BASE_TIME = new Date('2026-08-01T08:00:00.000Z');
const PROFILE_ID = 'profile-e37';

function setVisibilityState(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BASE_TIME);
  mockFrom.mockClear();
  mockUpdate.mockClear();
  mockEq.mockClear();
  setVisibilityState('visible'); // montagem determinística com aba visível
});

afterEach(() => {
  vi.useRealTimers();
});

async function flush(): Promise<void> {
  await act(async () => {});
}

function fireWindowEvent(name: 'online' | 'offline'): void {
  act(() => {
    window.dispatchEvent(new Event(name));
  });
}

describe('E37 — heartbeat mantém a sessão (useInboxHeartbeat)', () => {
  it('1. sessão visível de 10min → nunca cai para offline (zero writes offline, status online)', async () => {
    const { result } = renderHook(() => useInboxHeartbeat(PROFILE_ID));
    await flush();
    expect(mockUpdate).toHaveBeenCalledTimes(1); // write do mount ('online')

    // 10 minutos com a aba visível: ticks de heartbeat (180s) mantêm o status
    // online. O throttle de 240s limita a 1 write por janela — com 600s
    // decorridos, exatamente 1 keep-alive adicional passa (tick de 360s;
    // 180s e 540s caem dentro da janela do write anterior).
    for (let t = 0; t < 10; t++) {
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
    }

    // Nenhum write 'offline' em momento algum — a sessão permanece viva.
    const statuses = mockUpdate.mock.calls.map((c) => c[0]?.online_status);
    expect(statuses.every((s) => s === 'online')).toBe(true);
    expect(mockUpdate).toHaveBeenCalledTimes(2);

    // Estado exposto: sessão viva.
    expect(result.current.isOnline).toBe(true);
    expect(result.current.onlineStatus).toBe('online');
  });

  it('2. 1 tick de heartbeat (180s) não fura o throttle de 240s', async () => {
    renderHook(() => useInboxHeartbeat(PROFILE_ID));
    await flush();
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(180_000); // exatamente 1 intervalo de heartbeat
    });

    // 180s < 240s → o tick de keep-alive é descartado pelo throttle.
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('3. após 10min de keep-alive, saída real (evento offline) ainda é detectada imediatamente', async () => {
    const { result } = renderHook(() => useInboxHeartbeat(PROFILE_ID));
    await flush();
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    for (let t = 0; t < 10; t++) {
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
    }
    expect(mockUpdate).toHaveBeenCalledTimes(2); // mount + 1 keep-alive (throttle)

    fireWindowEvent('offline');

    expect(mockUpdate).toHaveBeenCalledTimes(3);
    expect(mockUpdate.mock.calls[2][0]).toEqual(
      expect.objectContaining({ online_status: 'offline' })
    );
    expect(result.current.isOnline).toBe(false);
    expect(result.current.onlineStatus).toBe('offline');
  });

  it('4. pagehide no fim da sessão → forceWrite offline imediato, mesmo após keep-alive longo', async () => {
    const { result } = renderHook(() => useInboxHeartbeat(PROFILE_ID));
    await flush();

    for (let t = 0; t < 10; t++) {
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
    }

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(mockUpdate).toHaveBeenCalledTimes(3);
    expect(mockUpdate.mock.calls[2][0]).toEqual(
      expect.objectContaining({ online_status: 'offline' })
    );
    expect(result.current.onlineStatus).toBe('offline');
  });

  it('5. alternâncias curtas hidden→visible (5s, dentro do debounce de 30s) não derrubam a sessão', async () => {
    const { result } = renderHook(() => useInboxHeartbeat(PROFILE_ID));
    await flush();
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 10; i++) {
      act(() => {
        setVisibilityState('hidden');
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await act(async () => {
        vi.advanceTimersByTime(5_000);
      });
      act(() => {
        setVisibilityState('visible');
        document.dispatchEvent(new Event('visibilitychange'));
      });
    }

    // Nenhum offline escrito: o debounce de 30s nunca completou.
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(result.current.isOnline).toBe(true);
    expect(result.current.onlineStatus).toBe('online');
  });
});
