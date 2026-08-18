/**
 * E33 — useMessageQueue (fila de retry): concorrência, dedupe, DLQ e cleanup.
 *
 * Contrato sob teste (spec: fases-para-repo/fase-04-inbox-nucleo-hooks-servicos.md, Etapa 33):
 *  1. CONCORRÊNCIA: no máximo MAX_CONCURRENT_SENDS=5 envios em voo simultâneo
 *     (10 mensagens enfileiradas → 5 em voo; ao liberar, os demais entram).
 *  2. DEDUPE (idempotência): `addToQueue(contactId, content, attachments?, type?,
 *     onProgress?, idempotencyKey?)` — a MESMA mensagem enfileirada 2× antes de
 *     processar (mesmo `idempotencyKey`, status pending/sending) gera UM envio.
 *     Chaves diferentes → envios independentes (sem over-dedupe).
 *  3. RETRY: falha retryable (5xx/408/429/rede) → exatamente `maxRetries` (3)
 *     tentativas com backoff exponencial (baseDelay=1s → 1s, 2s; jitter opcional),
 *     depois status terminal `failed` + persistência na DLQ (zapp.failed_messages).
 *  4. NÃO-RETRYABLE (4xx): 1 única tentativa → `failed` + DLQ (retry_count=0).
 *  5. CLEANUP ao desmontar: nenhuma nova tentativa/envio após unmount (timers
 *     cancelados; envio em voo que falha pós-unmount NÃO reenfileira).
 *
 * Estado RED esperado (2026-08-18, antes do GREEN):
 *  - dedupe: addToQueue não aceita idempotencyKey (TS2554 no tsc) e duplica → RED.
 *  - retry: hook faz 1 envio inicial + 3 retries = 4 tentativas (rc < maxRetries)
 *    → RED no assert de 3 tentativas.
 *  - cleanup: finally agenda t3 (500ms) mesmo após unmount → RED.
 *  - concorrência: contrato atual (guard fora do updater) deve manter 5 em voo
 *    (eager updaters) → pode nascer verde; é contrato, não gap.
 *
 * Erros de tipo TS2554 na chamada com 6 args (idempotencyKey) são SINAL RED
 * válido e somem com o GREEN — não "corrigir" o teste.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMessageQueue, MAX_CONCURRENT_SENDS, type QueueItem } from '../useMessageQueue';

// ── Mocks (padrão dos testes vizinhos) ───────────────────────────────────────

const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  toast: (payload: unknown) => mockToast(payload),
}));

const insertedFailedMessages: Array<Record<string, unknown>> = [];
const mockDbFrom = vi.fn();
vi.mock('@/integrations/datasource/db', () => ({
  dbFrom: (...args: unknown[]) => mockDbFrom(...args),
}));

function installDbFromMock() {
  mockDbFrom.mockImplementation((table: string) => ({
    insert: (payload: unknown) => {
      if (table === 'failed_messages') {
        insertedFailedMessages.push(payload as Record<string, unknown>);
      }
      const select = vi.fn(() => Promise.resolve({ error: null }));
      return { select };
    },
  }));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeControlledSender() {
  const resolvers: Array<() => void> = [];
  let inflight = 0;
  let maxInflight = 0;
  const sender = vi.fn((_item: QueueItem) => {
    inflight += 1;
    maxInflight = Math.max(maxInflight, inflight);
    return new Promise<void>((resolve) => {
      resolvers.push(() => {
        inflight -= 1;
        resolve();
      });
    });
  });
  return { sender, resolvers, getMaxInflight: () => maxInflight, getInflight: () => inflight };
}

const RETRYABLE_ERROR = new Error('network error: ECONNRESET');

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  mockToast.mockReset();
  mockDbFrom.mockReset();
  insertedFailedMessages.length = 0;
  installDbFromMock();
});

afterEach(() => {
  vi.useRealTimers();
});

// ── 1. Concorrência ──────────────────────────────────────────────────────────

describe(`useMessageQueue — concorrência (MAX_CONCURRENT_SENDS=${MAX_CONCURRENT_SENDS})`, () => {
  it('10 mensagens em 10 conversas → no máx. 5 em voo; todas processadas ao liberar', async () => {
    const { sender, resolvers, getMaxInflight } = makeControlledSender();
    const { result, unmount } = renderHook(() => useMessageQueue(sender));

    act(() => {
      for (let i = 0; i < MAX_CONCURRENT_SENDS * 2; i++) {
        result.current.addToQueue(`c${i}`, `msg ${i}`);
      }
    });
    await act(async () => {});

    // Primeira onda: só MAX_CONCURRENT_SENDS podem estar em voo.
    expect(sender).toHaveBeenCalledTimes(MAX_CONCURRENT_SENDS);
    expect(getMaxInflight()).toBeLessThanOrEqual(MAX_CONCURRENT_SENDS);

    // Libera a primeira onda → a segunda entra (nunca > cap em voo).
    await act(async () => {
      resolvers.splice(0, MAX_CONCURRENT_SENDS).forEach((r) => r());
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(sender).toHaveBeenCalledTimes(MAX_CONCURRENT_SENDS * 2);
    expect(getMaxInflight()).toBeLessThanOrEqual(MAX_CONCURRENT_SENDS);

    // Higiene: libera o restante e desmonta.
    await act(async () => {
      resolvers.splice(0).forEach((r) => r());
      await vi.advanceTimersByTimeAsync(600);
    });
    unmount();
  });
});

// ── 2. Dedupe / idempotência ─────────────────────────────────────────────────

describe('useMessageQueue — dedupe por idempotencyKey', () => {
  it('mesma mensagem enfileirada 2× no mesmo tick → 1 item e 1 envio', async () => {
    const sender = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useMessageQueue(sender));

    act(() => {
      result.current.addToQueue('c1', 'mesma mensagem', undefined, 'text', undefined, 'key-1');
      result.current.addToQueue('c1', 'mesma mensagem', undefined, 'text', undefined, 'key-1');
    });
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current.queue).toHaveLength(1); // RED hoje: 2 itens
    expect(sender).toHaveBeenCalledTimes(1); // RED hoje: 2 envios
    unmount();
  });

  it('chaves diferentes → envios independentes (sem over-dedupe)', async () => {
    const sender = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useMessageQueue(sender));

    act(() => {
      result.current.addToQueue('c1', 'msg A', undefined, 'text', undefined, 'key-A');
      result.current.addToQueue('c1', 'msg B', undefined, 'text', undefined, 'key-B');
    });
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current.queue).toHaveLength(2);
    expect(sender).toHaveBeenCalledTimes(2);
    unmount();
  });
});

// ── 3/4. Retry com backoff + DLQ ─────────────────────────────────────────────

describe('useMessageQueue — retry, backoff e DLQ', () => {
  it('falha retryable → exatamente 3 tentativas (backoff 1s/2s) → failed + DLQ', async () => {
    const attemptTimes: number[] = [];
    const sender = vi.fn(async (_item: QueueItem) => {
      attemptTimes.push(Date.now());
      throw RETRYABLE_ERROR;
    });
    const { result, unmount } = renderHook(() =>
      useMessageQueue(sender, { c1: { jitter: false } })
    );

    act(() => {
      result.current.addToQueue('c1', 'hello');
    });
    await act(async () => {}); // tentativa 1 (t0) → falha retryable

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100); // tentativa 2 (~t0+1s)
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100); // tentativa 3 (~t0+3s)
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000); // esgota tudo
    });

    expect(sender).toHaveBeenCalledTimes(3); // RED hoje: 4
    expect(attemptTimes).toHaveLength(3);

    // Backoff exponencial sem jitter: 1º gap ≈1s, 2º gap ≈2s.
    const gap1 = attemptTimes[1] - attemptTimes[0];
    const gap2 = attemptTimes[2] - attemptTimes[1];
    expect(gap1).toBeGreaterThanOrEqual(900);
    expect(gap1).toBeLessThanOrEqual(1500);
    expect(gap2).toBeGreaterThanOrEqual(1900);
    expect(gap2).toBeLessThanOrEqual(3000);

    const item = result.current.queue[0];
    expect(item.status).toBe('failed');
    expect(item.attempts).toHaveLength(3);
    expect(item.retryCount).toBe(2);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Falha definitiva' }));

    // DLQ: persistiu em failed_messages com contagem e payload corretos.
    expect(insertedFailedMessages).toHaveLength(1);
    expect(insertedFailedMessages[0]).toMatchObject({
      instance_name: 'client-queue',
      remote_jid: 'c1',
      status: 'abandoned',
      max_retries: 3,
      retry_count: 2,
      payload: { content: 'hello', type: 'text' },
    });
    expect(String(insertedFailedMessages[0].error_message)).toContain('network');
    unmount();
  });

  it('falha não-retryable (HTTP 404) → 1 tentativa → failed + DLQ (retry_count=0)', async () => {
    const sender = vi.fn(async () => {
      throw Object.assign(new Error('forbidden'), { status: 404 });
    });
    const { result, unmount } = renderHook(() => useMessageQueue(sender));

    act(() => {
      result.current.addToQueue('c1', 'hello');
    });
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000); // nenhum retry deve ocorrer
    });

    expect(sender).toHaveBeenCalledTimes(1);
    expect(result.current.queue[0].status).toBe('failed');
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Falha permanente' }));
    expect(insertedFailedMessages).toHaveLength(1);
    expect(insertedFailedMessages[0]).toMatchObject({
      status: 'abandoned',
      max_retries: 3,
      retry_count: 0,
    });
    unmount();
  });
});

// ── 5. Cleanup ao desmontar ──────────────────────────────────────────────────

describe('useMessageQueue — limpeza ao desmontar', () => {
  it('envio em voo que falha APÓS unmount → nenhuma nova tentativa', async () => {
    const rejecters: Array<(e: Error) => void> = [];
    const sender = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejecters.push(reject);
        })
    );
    const { result, unmount } = renderHook(() => useMessageQueue(sender));

    act(() => {
      result.current.addToQueue('c1', 'x');
    });
    await act(async () => {});
    expect(sender).toHaveBeenCalledTimes(1); // em voo

    unmount();

    // Falha pós-unmount: sem o guard, o finally agenda novo processamento.
    await act(async () => {
      rejecters[0](RETRYABLE_ERROR);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(sender).toHaveBeenCalledTimes(1); // RED hoje: 2+ (retry pós-unmount)
  });
});
