/**
 * Simulações de throttle/heartbeat do useInboxHeartbeat.
 *
 * Contrato verificado (comportamento corrigido):
 *   - THROTTLE_MS = 240s > HEARTBEAT_MS = 180s: o interval nunca furar o throttle.
 *   - Throttle global via refs (lastWriteAtRef/lastWrittenStatusRef) — sobrevive
 *     re-renders/remounts.
 *   - pagehide registrado no WINDOW (não document) com forceWrite imediato.
 *   - handleOffline (evento `offline` do window) → write imediato com 'offline'.
 *   - Cleanup condicional: só grava 'offline' se lastWrittenStatus === 'online'
 *     E o throttle (240s) já expirou.
 *   - Sem profileId → effect retorna cedo, zero writes.
 *
 * Tempo é controlado com vi.useFakeTimers() + vi.setSystemTime() (base fixa
 * grande, para que o 1º write do mount nunca seja engolido pelo throttle:
 * lastWriteAtRef inicia em 0 e `now - 0` precisa ser >= THROTTLE_MS).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInboxHeartbeat } from '../useInboxHeartbeat';

// ===== Assinaturas reais da cadeia mockada (vi.fn<AssinaturaReal>()) =====
type OnlineStatus = 'online' | 'offline' | 'busy';
type ProfileUpdatePayload = { online_status: OnlineStatus; last_seen: string };
type EqResult = { data: null; error: null };
type EqFn = (column: string, value: string) => Promise<EqResult>;
type UpdateFn = (payload: ProfileUpdatePayload) => { eq: EqFn };
type FromFn = (table: string) => { update: UpdateFn };

const { mockFrom, mockUpdate, mockEq, mockLogError } = vi.hoisted(() => {
  const mockEq = vi.fn<EqFn>().mockResolvedValue({ data: null, error: null });
  const mockUpdate = vi.fn<UpdateFn>(() => ({ eq: mockEq }));
  const mockFrom = vi.fn<FromFn>(() => ({ update: mockUpdate }));
  const mockLogError = vi.fn<(message: string, ...args: unknown[]) => void>();
  return { mockFrom, mockUpdate, mockEq, mockLogError };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mockFrom,
  },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ error: mockLogError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const BASE_TIME = new Date('2026-07-31T12:00:00.000Z');
const PROFILE_ID = 'profile-1';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(BASE_TIME);
  mockFrom.mockClear();
  mockUpdate.mockClear();
  mockEq.mockClear();
  mockLogError.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

// ===== Helpers de simulação de eventos =====
function setVisibilityState(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
}

function fireVisibilityChange(state: DocumentVisibilityState): void {
  act(() => {
    setVisibilityState(state);
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

function firePageHide(): void {
  act(() => {
    if (typeof PageTransitionEvent !== 'undefined') {
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
    } else {
      window.dispatchEvent(new Event('pagehide'));
    }
  });
}

function fireWindowEvent(name: 'online' | 'offline'): void {
  act(() => {
    window.dispatchEvent(new Event(name));
  });
}

async function flush(): Promise<void> {
  await act(async () => {});
}

describe('useInboxHeartbeat — simulações de throttle/heartbeat', () => {
  it('1. 10 visibilitychange em 60s → no máximo 1 write (throttle global de 240s)', async () => {
    renderHook(() => useInboxHeartbeat(PROFILE_ID));
    await flush();
    expect(mockUpdate).toHaveBeenCalledTimes(1); // write do mount ('online')

    // 10 ciclos hidden→visible, 6s cada (dentro do debounce de saída de 30s,
    // então o hiddenTimeout é sempre limpo antes de disparar).
    for (let i = 0; i < 10; i++) {
      fireVisibilityChange('hidden');
      await act(async () => {
        vi.advanceTimersByTime(6_000);
      });
      fireVisibilityChange('visible');
    }

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockEq).toHaveBeenCalledWith('id', PROFILE_ID);
    expect(mockUpdate.mock.calls[0][0]).toEqual(
      expect.objectContaining({ online_status: 'online' }),
    );
  });

  it('2. mount grava online; repetidas "online" dentro de 240s → 0 writes extras', async () => {
    renderHook(() => useInboxHeartbeat(PROFILE_ID));
    await flush();
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 10; i++) fireWindowEvent('online');

    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('3. pagehide dispara forceWrite imediato mesmo dentro do throttle', async () => {
    renderHook(() => useInboxHeartbeat(PROFILE_ID));
    await flush();
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    firePageHide();

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate.mock.calls[1][0]).toEqual(
      expect.objectContaining({ online_status: 'offline' }),
    );
  });

  it('4. evento offline do window → write imediato com online_status offline', async () => {
    renderHook(() => useInboxHeartbeat(PROFILE_ID));
    await flush();
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    fireWindowEvent('offline');

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate.mock.calls[1][0]).toEqual(
      expect.objectContaining({ online_status: 'offline' }),
    );
  });

  it('5. cleanup com lastWrittenStatus online e dentro do throttle → sem write', async () => {
    const { unmount } = renderHook(() => useInboxHeartbeat(PROFILE_ID));
    await flush();
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    act(() => unmount());

    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('6. cleanup após throttle expirado e status online → 1 write offline', async () => {
    const { unmount } = renderHook(() => useInboxHeartbeat(PROFILE_ID));
    await flush();
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    // 241s: o heartbeat interval (180s) dispara 1x, mas é engolido pelo
    // throttle (180s < 240s) — zero writes extras durante a espera.
    await act(async () => {
      vi.advanceTimersByTime(241_000);
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    act(() => unmount());

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate.mock.calls[1][0]).toEqual(
      expect.objectContaining({ online_status: 'offline' }),
    );
  });

  it('7. sem profileId → nenhum write (effect retorna cedo)', async () => {
    renderHook(() => useInboxHeartbeat(undefined));
    await flush();

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('8. tab oculta por 30s+ → write offline forçado após o debounce de saída', async () => {
    renderHook(() => useInboxHeartbeat(PROFILE_ID));
    await flush();
    expect(mockUpdate).toHaveBeenCalledTimes(1);

    fireVisibilityChange('hidden');
    await act(async () => {
      vi.advanceTimersByTime(29_000);
    });
    expect(mockUpdate).toHaveBeenCalledTimes(1); // ainda dentro do debounce de 30s

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });

    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate.mock.calls[1][0]).toEqual(
      expect.objectContaining({ online_status: 'offline' }),
    );
  });

  it('9. expõe isOnline/onlineStatus refletindo o estado do heartbeat', async () => {
    const { result } = renderHook(() => useInboxHeartbeat(PROFILE_ID));
    await flush();

    expect(result.current.isOnline).toBe(true);
    expect(result.current.onlineStatus).toBe('online');

    fireWindowEvent('offline');

    expect(result.current.isOnline).toBe(false);
    expect(result.current.onlineStatus).toBe('offline');
  });
});
