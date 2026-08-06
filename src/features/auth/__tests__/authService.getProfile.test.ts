import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authService } from '../services/authService';
import {
  acquireSupabaseSlot,
  getSupabaseSemaphoreState,
} from '@/integrations/supabase/client';

/**
 * authService.getProfile — prioridade 'high' no semáforo (FIX 2026-08-06).
 *
 * Em produção, getProfile entrava na fila FIFO do semáforo atrás da rajada da
 * inbox (48+ RPCs) e demorava ~5600ms. O fix adquire slot 'high' antes do
 * select e libera em finally (try/finally obrigatório — slot órfão travaria
 * o semáforo).
 *
 * Este teste mocka APENAS o objeto `supabase` (cadeia from/select/eq/
 * abortSignal/maybeSingle) e mantém o semáforo REAL via importOriginal:
 * a fila, a prioridade e o release em finally são os de produção.
 */
const { maybeSingleMock, fromMock } = vi.hoisted(() => ({
  maybeSingleMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/integrations/supabase/client')>();
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    abortSignal: vi.fn(() => chain),
    maybeSingle: maybeSingleMock,
  };
  fromMock.mockReturnValue(chain);
  return {
    ...actual,
    supabase: {
      from: fromMock,
    } as unknown as typeof actual.supabase,
  };
});

describe('authService.getProfile — prioridade high no semáforo', () => {
  const releases: Array<() => void> = [];
  const profileRow = {
    id: 'profile-1',
    user_id: 'user-1',
    name: 'Teste',
    email: null,
    avatar_url: null,
    role: 'admin',
    max_chats: 10,
    department_id: null,
    department: null,
  };

  beforeEach(() => {
    releases.length = 0;
    maybeSingleMock.mockReset();
    maybeSingleMock.mockResolvedValue({ data: profileRow, error: null });
    expect(getSupabaseSemaphoreState().inFlight).toBe(0);
    expect(getSupabaseSemaphoreState().queueLength).toBe(0);
  });

  afterEach(async () => {
    vi.useRealTimers();
    // Drena o semáforo: cada release libera 1 slot e, se houver fila, resume
    // o próximo acquire (que registra seu próprio release após microtask).
    let guard = 0;
    while (
      (getSupabaseSemaphoreState().inFlight > 0 ||
        getSupabaseSemaphoreState().queueLength > 0) &&
      guard++ < 64
    ) {
      const release = releases.shift();
      if (release) release();
      await Promise.resolve();
    }
    expect(getSupabaseSemaphoreState().inFlight).toBe(0);
    expect(getSupabaseSemaphoreState().queueLength).toBe(0);
  });

  /** Adquire slot e registra o release para o cleanup do afterEach. */
  const acquireTracked = (priority?: 'normal' | 'high') =>
    acquireSupabaseSlot(priority).then((release) => {
      releases.push(release);
    });

  it('com fila cheia, getProfile com high não espera atrás de todos (fake timers)', async () => {
    vi.useFakeTimers();

    // Ocupa os 8 slots do semáforo (rajada da inbox).
    for (let i = 0; i < 8; i++) {
      await acquireTracked();
    }
    expect(getSupabaseSemaphoreState().inFlight).toBe(8);

    // 5 requests normais aguardando slot.
    for (let i = 0; i < 5; i++) {
      void acquireTracked('normal');
    }

    // getProfile dispara com a fila cheia — adquire slot HIGH (fura a fila).
    const profilePromise = authService.getProfile('user-1');
    await Promise.resolve();
    expect(getSupabaseSemaphoreState().queueLength).toBe(6); // 5 normais + high

    // Libera UM slot: o high do getProfile entra antes dos 5 normais.
    const firstRelease = releases.shift()!;
    firstRelease();

    const result = await profilePromise;
    expect(result.error).toBeNull();
    expect(result.data?.id).toBe('profile-1');

    // getProfile completou enquanto 4 normais AINDA esperam na fila —
    // não esperou atrás de todos.
    await Promise.resolve();
    expect(getSupabaseSemaphoreState().queueLength).toBe(4);
    expect(getSupabaseSemaphoreState().inFlight).toBe(8);
  });

  it('sem ocupação da fila, getProfile resolve e libera o slot (try/finally)', async () => {
    const result = await authService.getProfile('user-1');
    expect(result.data?.name).toBe('Teste');
    expect(getSupabaseSemaphoreState().inFlight).toBe(0);
    expect(getSupabaseSemaphoreState().queueLength).toBe(0);
  });
});
