import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  acquireSupabaseSlot,
  getSupabaseSemaphoreState,
  retryFetch,
  withSupabaseHighPriority,
} from '../client';

/**
 * Semáforo de concorrência — prioridade 'high' (FIX 2026-08-06).
 *
 * O getProfile do authService adquire slot 'high' para não esperar atrás da
 * rajada da inbox na fila FIFO. Este teste prova que, com os 8 slots ocupados
 * e normais enfileirados, um acquire high entra ANTES dos normais.
 *
 * O semáforo usa apenas microtasks (sem setTimeout), então fake timers são
 * usados apenas para determinismo — nenhum timer real é necessário.
 */
describe('acquireSupabaseSlot — prioridade high', () => {
  const releases: Array<() => void> = [];

  beforeEach(() => {
    releases.length = 0;
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
      return 'acquired';
    });

  it('com 8 slots ocupados + fila de normais, um acquire high entra antes dos normais', async () => {
    vi.useFakeTimers();

    // Ocupa os 8 slots (rajada da inbox).
    for (let i = 0; i < 8; i++) {
      await acquireTracked();
    }
    expect(getSupabaseSemaphoreState().inFlight).toBe(8);

    // 5 normais aguardando slot (FIFO).
    const normals = Array.from({ length: 5 }, (_, i) =>
      acquireTracked('normal').then(() => `normal-${i}`)
    );

    // Acquire high chega DEPOIS dos normais, mas fura a fila.
    const high = acquireTracked('high').then(() => 'high');
    await Promise.resolve();
    expect(getSupabaseSemaphoreState().queueLength).toBe(6); // 5 normais + 1 high

    // Libera UM slot: o high (topo da fila) entra antes de qualquer normal.
    const firstRelease = releases.shift()!;
    firstRelease();
    await expect(high).resolves.toBe('high');

    // Os 5 normais continuam aguardando — o high entrou antes de todos.
    let anyNormalResolved = false;
    normals[0].then(() => {
      anyNormalResolved = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(anyNormalResolved).toBe(false);
    expect(getSupabaseSemaphoreState().queueLength).toBe(5);
    expect(getSupabaseSemaphoreState().inFlight).toBe(8);
  });

  it('sem prioridade, acquire normal respeita FIFO na ordem de chegada', async () => {
    vi.useFakeTimers();

    for (let i = 0; i < 8; i++) {
      await acquireTracked();
    }

    const order: string[] = [];
    const first = acquireTracked('normal').then(() => {
      order.push('first');
      return 'first';
    });
    const second = acquireTracked('normal').then(() => {
      order.push('second');
      return 'second';
    });
    expect(getSupabaseSemaphoreState().queueLength).toBe(2);

    // Libera UM slot: o PRIMEIRO normal (FIFO) entra.
    const firstRelease = releases.shift()!;
    firstRelease();
    await expect(first).resolves.toBe('first');
    expect(order).toEqual(['first']);
    expect(getSupabaseSemaphoreState().queueLength).toBe(1);
    expect(second).not.toBe('second');
  });

  it('withSupabaseHighPriority: retryFetch adquire UM slot high e fura a fila de normais', async () => {
    vi.useFakeTimers();

    for (let i = 0; i < 8; i++) {
      await acquireTracked();
    }

    const order: string[] = [];
    // Normal entra na fila PRIMEIRO.
    const normal = acquireTracked('normal').then(() => {
      order.push('normal');
      return 'normal';
    });

    // Fetch via retryFetch dentro do contexto high (como o getProfile faz).
    const origFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => {
      order.push('high-fetch');
      return new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const high = withSupabaseHighPriority(async () => {
        await retryFetch('https://supabase.atomicabr.com.br/rest/v1/health', {
          method: 'GET',
          headers: {},
        } as RequestInit);
        order.push('high');
      });

      // Libera UM slot: o retryFetch high (que furou a fila) entra antes do normal.
      const firstRelease = releases.shift()!;
      firstRelease();
      await high;

      // High entrou primeiro (fetch + pós-fetch). O normal pode ter entrado
      // em microtask posterior (slot liberado pelo finally do retryFetch).
      expect(order.slice(0, 2)).toEqual(['high-fetch', 'high']);
      await expect(normal).resolves.toBe('normal');
      expect(order[2]).toBe('normal');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('release duplicado é no-op (guarda de idempotência — não corrompe o contador)', async () => {
    const release = await acquireSupabaseSlot('normal');
    expect(getSupabaseSemaphoreState().inFlight).toBe(1);

    release();
    expect(getSupabaseSemaphoreState().inFlight).toBe(0);

    // Segunda chamada ao release: deve ser no-op (sem decrementar abaixo de 0).
    release();
    release();
    expect(getSupabaseSemaphoreState().inFlight).toBe(0);
    expect(getSupabaseSemaphoreState().queueLength).toBe(0);
  });

  it('withSupabaseHighPriority concorrentes: A termina antes de B — B continua high (sem clobber)', async () => {
    vi.useFakeTimers();

    for (let i = 0; i < 8; i++) {
      await acquireTracked();
    }

    const order: string[] = [];
    // Normal entra na fila PRIMEIRO (baseline para medir quem fura).
    void acquireTracked('normal').then(() => {
      order.push('normal');
    });

    // A e B começam juntas; A termina RÁPIDO, B continua depois (gateB).
    let releaseB!: () => void;
    const gateB = new Promise<void>((r) => {
      releaseB = r;
    });

    const origFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => {
      order.push('b-fetch');
      return new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    try {
      const a = withSupabaseHighPriority(async () => {
        order.push('a-start');
      });
      const b = withSupabaseHighPriority(async () => {
        order.push('b-start');
        await gateB; // A termina antes de B prosseguir
        await retryFetch('https://supabase.atomicabr.com.br/rest/v1/health', {
          method: 'GET',
          headers: {},
        } as RequestInit);
      });

      await a; // A termina — o high de B NÃO pode cair (depth counter)
      releaseB();
      // Deixa a continuação de B rodar até o acquire (microtasks puras —
      // fake timers não afetam promises).
      await Promise.resolve();
      await Promise.resolve();

      // Libera UM slot: o fetch de B (ainda high) fura a fila antes do normal.
      const firstRelease = releases.shift()!;
      firstRelease();
      await b;

      expect(order.indexOf('b-fetch')).toBeGreaterThan(-1);
      expect(order.indexOf('b-fetch')).toBeLessThan(order.indexOf('normal'));
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
