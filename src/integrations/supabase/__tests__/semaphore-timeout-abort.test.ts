import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  acquireSupabaseSlot,
  getSupabaseSemaphoreState,
  QUEUE_WAIT_TIMEOUT_MS,
} from '../client';

/**
 * Semáforo de concorrência — timeout de fila + abort (FIX incidente 18/08 22:09Z).
 *
 * O incidente mostrou 104 RPCs com durations 4→39s lineares: a cauda da fila
 * esperava dezenas de segundos por um slot (48+ RPCs na fila, 8 slots).
 * Este teste prova que:
 *   - timeout de 15s remove a entrada da fila e rejeita com
 *     'SupabaseQueueTimeoutError' (falha rápida, sem retry do withRetry);
 *   - abort do caller durante a espera remove a entrada e rejeita 'AbortError';
 *   - entradas mortas (timeout/abort) NUNCA consomem slot quando os slots
 *     liberam (inFlight íntegro);
 *   - resume limpa o timer (timeout não dispara depois de adquirido);
 *   - signal pré-abortado rejeita imediato sem consumir slot;
 *   - prioridade high permanece íntegra com mistura de timeouts.
 *
 * Usa vi.useFakeTimers() para controlar QUEUE_WAIT_TIMEOUT_MS deterministicamente.
 */
describe('acquireSupabaseSlot — timeout e abort de fila', () => {
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
  const acquireTracked = (priority?: 'normal' | 'high', signal?: AbortSignal | null) =>
    acquireSupabaseSlot(priority, signal).then((release) => {
      releases.push(release);
      return 'acquired';
    });

  it('timeout remove da fila e rejeita com SupabaseQueueTimeoutError (sem liberar slot)', async () => {
    vi.useFakeTimers();

    // Ocupa os 8 slots.
    for (let i = 0; i < 8; i++) {
      await acquireTracked();
    }
    expect(getSupabaseSemaphoreState().inFlight).toBe(8);

    // Um normal aguardando slot.
    const waiting = acquireTracked('normal');
    await Promise.resolve();
    expect(getSupabaseSemaphoreState().queueLength).toBe(1);

    // Passa o timeout de fila: rejeita com o name correto e SAI da fila.
    // (handler anexado ANTES de avançar os timers — evita unhandled rejection)
    const assertion = expect(waiting).rejects.toMatchObject({
      name: 'SupabaseQueueTimeoutError',
    });
    await vi.advanceTimersByTimeAsync(QUEUE_WAIT_TIMEOUT_MS);
    await assertion;

    expect(getSupabaseSemaphoreState().queueLength).toBe(0);
    // Timeout NÃO libera slot: a entrada nunca teve slot (inFlight segue 8).
    expect(getSupabaseSemaphoreState().inFlight).toBe(8);

    // Drena os 8 slots: nenhuma entrada morta consome — inFlight volta a 0.
    while (getSupabaseSemaphoreState().inFlight > 0) {
      releases.shift()!();
      await Promise.resolve();
    }
    expect(getSupabaseSemaphoreState().inFlight).toBe(0);
    expect(getSupabaseSemaphoreState().queueLength).toBe(0);
  });

  it('abort remove da fila e rejeita com AbortError', async () => {
    vi.useFakeTimers();

    for (let i = 0; i < 8; i++) {
      await acquireTracked();
    }

    const ctrl = new AbortController();
    const waiting = acquireTracked('normal', ctrl.signal);
    await Promise.resolve();
    expect(getSupabaseSemaphoreState().queueLength).toBe(1);

    ctrl.abort();
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });

    expect(getSupabaseSemaphoreState().queueLength).toBe(0);
    expect(getSupabaseSemaphoreState().inFlight).toBe(8);
  });

  it('entrada abortada não consome slot quando os slots liberam (inFlight volta a 0)', async () => {
    vi.useFakeTimers();

    for (let i = 0; i < 8; i++) {
      await acquireTracked();
    }

    // Fila: [aborted, healthy] — o aborted é o primeiro da fila.
    const ctrl = new AbortController();
    const aborted = acquireTracked('normal', ctrl.signal);
    const healthy = acquireTracked('normal');
    await Promise.resolve();
    expect(getSupabaseSemaphoreState().queueLength).toBe(2);

    ctrl.abort();
    await expect(aborted).rejects.toMatchObject({ name: 'AbortError' });
    expect(getSupabaseSemaphoreState().queueLength).toBe(1);

    // Drena os 8 slots: o healthy entra; o aborted NUNCA resumirá.
    for (let i = 0; i < 8; i++) {
      releases.shift()!();
      await Promise.resolve();
    }
    await expect(healthy).resolves.toBe('acquired');
    expect(getSupabaseSemaphoreState().queueLength).toBe(0);
    // 8 originais - 8 releases + 1 healthy = 1 slot ocupado pelo healthy.
    expect(getSupabaseSemaphoreState().inFlight).toBe(1);

    // Libera o slot do healthy: inFlight volta a 0 (sem corrupção).
    releases.shift()!();
    await Promise.resolve();
    expect(getSupabaseSemaphoreState().inFlight).toBe(0);
  });

  it('timeout não dispara após resume (resume limpa o timer)', async () => {
    vi.useFakeTimers();

    for (let i = 0; i < 8; i++) {
      await acquireTracked();
    }

    const waiting = acquireTracked('normal');
    await Promise.resolve();
    expect(getSupabaseSemaphoreState().queueLength).toBe(1);

    // Libera UM slot ANTES do timeout: a entrada entra e o timer é limpo.
    releases.shift()!();
    await expect(waiting).resolves.toBe('acquired');
    expect(getSupabaseSemaphoreState().inFlight).toBe(8);
    expect(getSupabaseSemaphoreState().queueLength).toBe(0);

    // Avança MUITO além do timeout: nada dispara (nem reject nem duplo-resume).
    await vi.advanceTimersByTimeAsync(QUEUE_WAIT_TIMEOUT_MS * 10);
    expect(getSupabaseSemaphoreState().inFlight).toBe(8);
    expect(getSupabaseSemaphoreState().queueLength).toBe(0);
  });

  it('signal já abortado antes do acquire rejeita imediato e não consome slot', async () => {
    vi.useFakeTimers();

    const ctrl = new AbortController();
    ctrl.abort();

    // Mesmo com slot livre, o acquire abortado NÃO consome capacidade.
    await expect(
      acquireTracked('normal', ctrl.signal)
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(getSupabaseSemaphoreState().inFlight).toBe(0);
    expect(getSupabaseSemaphoreState().queueLength).toBe(0);

    // Com os 8 slots ocupados, também não entra na fila.
    for (let i = 0; i < 8; i++) {
      await acquireTracked();
    }
    const preAborted = acquireTracked('high', ctrl.signal);
    await expect(preAborted).rejects.toMatchObject({ name: 'AbortError' });
    expect(getSupabaseSemaphoreState().queueLength).toBe(0);
    expect(getSupabaseSemaphoreState().inFlight).toBe(8);
  });

  it('prioridade high preservada com mistura de timeouts (remoção não corrompe a fila)', async () => {
    vi.useFakeTimers();

    for (let i = 0; i < 8; i++) {
      await acquireTracked();
    }

    // t=0: normal e high entram na fila (high fura → [high, normal]).
    const n1 = acquireTracked('normal');
    const h1 = acquireTracked('high');
    await Promise.resolve();
    expect(getSupabaseSemaphoreState().queueLength).toBe(2);

    // t=10s: um normal entra DEPOIS — seu timeout (t=25s) vence após os demais.
    await vi.advanceTimersByTimeAsync(10_000);
    const n2 = acquireTracked('normal');
    await Promise.resolve();
    expect(getSupabaseSemaphoreState().queueLength).toBe(3);

    // Libera 1 slot: o high entra ANTES do n1 (prioridade intacta).
    releases.shift()!();
    await expect(h1).resolves.toBe('acquired');
    expect(getSupabaseSemaphoreState().queueLength).toBe(2);

    // Libera mais 1: n1 entra (FIFO entre os restantes).
    releases.shift()!();
    await expect(n1).resolves.toBe('acquired');
    expect(getSupabaseSemaphoreState().queueLength).toBe(1);

    // Avança além do timeout do n2 (t=10s + 15s): rejeita e sai da fila.
    // (handler anexado ANTES de avançar os timers — evita unhandled rejection)
    const n2Assertion = expect(n2).rejects.toMatchObject({
      name: 'SupabaseQueueTimeoutError',
    });
    await vi.advanceTimersByTimeAsync(QUEUE_WAIT_TIMEOUT_MS);
    await n2Assertion;
    expect(getSupabaseSemaphoreState().queueLength).toBe(0);

    // inFlight íntegro: 8 (7 originais + h1 + n1 − 2 releases).
    expect(getSupabaseSemaphoreState().inFlight).toBe(8);
  });
});
