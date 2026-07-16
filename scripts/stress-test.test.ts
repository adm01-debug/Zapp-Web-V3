import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

async function simulateConcurrentRequests(url: string, concurrency: number) {
  const start = Date.now();
  const requests = Array.from({ length: concurrency }).map(() =>
    fetch(url).catch(e => ({ status: 'error', message: (e as Error).message }))
  );

  const results = await Promise.all(requests);
  const end = Date.now();

  const success = results.filter(r => (r as { status: string | number }).status !== 'error').length;
  const failure = concurrency - success;

  return {
    totalTime: end - start,
    avgTime: (end - start) / concurrency,
    success,
    failure,
  };
}

describe('Load & Stress Simulation', () => {
  beforeEach(() => {
    // Mock fetch so tests run offline and never hit external domains in CI.
    // Concurrency orchestration logic is what we test here — real network
    // behaviour belongs in integration/e2e tests against a live environment.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('ok', { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should measure response time under simulated load', async () => {
    const CONCURRENCY = 10;
    const stats = await simulateConcurrentRequests('http://localhost/api/health', CONCURRENCY);
    expect(stats.success).toBe(CONCURRENCY);
    expect(stats.failure).toBe(0);
    expect(stats.avgTime).toBeLessThan(10_000);
  });

  it('should report failures when fetch rejects', async () => {
    const TOTAL = 5;
    const FAIL_COUNT = 2;
    let callCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= FAIL_COUNT) return Promise.reject(new Error('network error'));
        return Promise.resolve(new Response('ok', { status: 200 }));
      }),
    );
    const stats = await simulateConcurrentRequests('http://localhost/api/health', TOTAL);
    expect(stats.failure).toBe(FAIL_COUNT);
    expect(stats.success).toBe(TOTAL - FAIL_COUNT);
  });
});
