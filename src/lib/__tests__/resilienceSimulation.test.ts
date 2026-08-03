/**
 * Resilience Simulation Tests — Fallback Mechanisms for Evolution, Traefik, and Functions Failure
 *
 * These tests simulate the three failure scenarios and verify that the fallback
 * mechanisms behave correctly WITHOUT making real HTTP requests.
 *
 * @deprecated — FATOR X / external-db-proxy removal wave
 * These suites exercise the failure modes of the obsolete `external-db-proxy`
 * client (`src/lib/externalProxy.ts`): circuit breaker, retry/backoff, ghost
 * posts, and auth locks. The FATOR X external DB was discontinued and the app
 * now talks to the self-hosted Supabase directly, so the proxy behavior these
 * tests simulate no longer exists in the target architecture. Kept for history;
 * delete together with `src/lib/externalProxy.ts` and its importers.
 */
/*
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Shared mocks ────────────────────────────────────────────
vi.mock('@/integrations/supabase/client', () => ({
  isSupabaseConfigured: true,
  SUPABASE_RESOLVED_URL: 'http://localhost:54321',
  SUPABASE_RESOLVED_ANON_KEY: 'test-anon-key',
  supabase: {
    auth: {
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null }),
    },
  },
}));

const mockRecordQueryEvent = vi.fn();
const mockRecordRetryOutcome = vi.fn();
const mockClassifySeverity = vi.fn().mockReturnValue('ok');

vi.mock('@/lib/clientTelemetry', () => ({
  recordQueryEvent: (...args: unknown[]) => mockRecordQueryEvent(...args),
  recordRetryOutcome: (...args: unknown[]) => mockRecordRetryOutcome(...args),
  classifySeverity: (...args: unknown[]) => mockClassifySeverity(...args),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/lib/correlationId', () => ({
  generateCorrelationId: vi.fn().mockReturnValue('cid-test-resilience'),
  CORRELATION_HEADER: 'x-correlation-id',
}));

// ── ──────────────────────────────────────────────────────────────────────────
// Scenario 1: Evolution API Down
// ── ──────────────────────────────────────────────────────────────────────────
//
// When Evolution API crashes, new messages stop flowing, but the database
// still holds 46,700+ existing messages. The frontend reads from the DB via
// external-db-proxy, so conversations and history remain visible.

describe('Scenario 1: Evolution API Down', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('continues serving sidebar conversations from DB cache when Evolution API is unreachable', async () => {
    const { queryExternalProxy, __testing } = await import('@/lib/externalProxy');
    __testing!.resetBreakerAndCoalesce();
    mockRecordQueryEvent.mockClear();
    mockRecordRetryOutcome.mockClear();

    // Simulate: Evolution API is down, but DB is up.
    __testing!.setInvokeOverride(async () => ({
      data: {
        data: [
          {
            id: '1',
            remote_jid: '5511999990001@s.whatsapp.net',
            content: 'Olá',
            created_at: '2026-07-30T10:00:00Z',
          },
          {
            id: '2',
            remote_jid: '5511999990002@s.whatsapp.net',
            content: 'Bom dia',
            created_at: '2026-07-30T10:01:00Z',
          },
        ],
        count: 2,
      },
      error: null,
    }));

    const promise = queryExternalProxy({
      table: 'evolution_messages',
      select: 'id,remote_jid,content,created_at',
      filters: [
        { column: 'instance_name', operator: 'eq', value: 'wpp2' },
        { column: 'created_at', operator: 'gte', value: '2026-07-23T00:00:00Z' },
      ],
      order: { column: 'created_at', ascending: false },
      limit: 200,
    });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result.data).toHaveLength(2);
    expect(result.data![0]).toHaveProperty('remote_jid', '5511999990001@s.whatsapp.net');
    expect(result.count).toBe(2);

    // Telemetry recorded for successful query
    expect(mockRecordQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'evolutionDB', target: 'evolution_messages' })
    );

    __testing!.clearInvokeOverride();
  });
});

// ── ──────────────────────────────────────────────────────────────────────────
// Scenario 2: Traefik (Reverse Proxy) Down — Simulates total gateway outage
// ── ──────────────────────────────────────────────────────────────────────────

describe('Scenario 2: Traefik (Reverse Proxy) Down', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function drainGhostCalls(table = 'test', n = 1): Promise<void> {
    const { queryExternalProxy, __testing } = await import('@/lib/externalProxy');
    for (let i = 0; i < n; i++) {
      const p = queryExternalProxy({ table });
      const suppressed = p.catch(() => {});
      await vi.advanceTimersByTimeAsync(2000);
      await suppressed;
    }
  }

  it('triggers circuit breaker after repeated ghost-post failures during proxy outage', async () => {
    const { __testing } = await import('@/lib/externalProxy');
    __testing!.resetBreakerAndCoalesce();

    let invokeCount = 0;
    __testing!.setInvokeOverride(async () => {
      invokeCount++;
      return {
        data: null,
        error: {
          name: 'FunctionsFetchError',
          message: 'Failed to send a request to the edge function',
        },
      };
    });

    // First call: 3 retry attempts, still below threshold (4)
    await drainGhostCalls('evolution_messages', 1);
    expect(invokeCount).toBe(3);

    // Second call: 3 more attempts, cumulative = 6 > threshold (4) → breaker opens
    await drainGhostCalls('evolution_messages', 1);
    expect(invokeCount).toBe(6);

    // Third call: circuit OPEN → short-circuits without calling invoke
    await drainGhostCalls('evolution_messages', 1);
    expect(invokeCount).toBe(6); // No additional invocations

    const breakerState = __testing!.isBreakerOpen('evolution_messages');
    expect(breakerState.open).toBe(true);
    expect(breakerState.remainingMs).toBeGreaterThan(0);

    __testing!.clearInvokeOverride();
  });

  it('auto-recovers after circuit breaker cooldown (5s) elapses', async () => {
    const { queryExternalProxy, __testing } = await import('@/lib/externalProxy');
    __testing!.resetBreakerAndCoalesce();

    // Open the circuit
    __testing!.setInvokeOverride(async () => ({
      data: null,
      error: { name: 'FunctionsFetchError', message: 'Failed to send a request' },
    }));

    // 2 calls × 3 attempts = 6 failures → threshold 4 exceeded
    await drainGhostCalls('evolution_messages', 2);
    expect(__testing!.isBreakerOpen('evolution_messages').open).toBe(true);

    // Advance past 5s cooldown
    vi.advanceTimersByTime(5001);
    expect(__testing!.isBreakerOpen('evolution_messages').open).toBe(false);

    // Now Traefik is back — request should succeed
    __testing!.setInvokeOverride(async () => ({
      data: { data: [{ id: '1', content: 'Post-recovery message' }], count: 1 },
      error: null,
    }));

    const p = queryExternalProxy({ table: 'evolution_messages' });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await p;
    expect(result.data).toHaveLength(1);

    __testing!.clearInvokeOverride();
  });

  it('does NOT affect other proxy targets when one is isolated', async () => {
    const { queryExternalProxy, __testing } = await import('@/lib/externalProxy');
    __testing!.resetBreakerAndCoalesce();

    __testing!.setInvokeOverride(async (fnName: string, opts: { body: unknown }) => {
      const body = (typeof opts.body === 'object' && opts.body !== null ? opts.body : {}) as Record<
        string,
        unknown
      >;
      const table = String(body.table ?? '');
      if (table === 'evolution_messages') {
        return {
          data: null,
          error: { name: 'FunctionsFetchError', message: 'Failed to send a request' },
        };
      }
      return { data: { data: [{ id: 'c1', name: 'Contact' }], count: 1 }, error: null };
    });

    // Open breaker for evolution_messages
    await drainGhostCalls('evolution_messages', 2);
    expect(__testing!.isBreakerOpen('evolution_messages').open).toBe(true);
    expect(__testing!.isBreakerOpen('evolution_contacts').open).toBe(false);

    // Other target should still work
    const p = queryExternalProxy({ table: 'evolution_contacts' });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await p;
    expect(result.data).toHaveLength(1);

    __testing!.clearInvokeOverride();
  });
});

// ── ──────────────────────────────────────────────────────────────────────────
// Scenario 3: Supabase Edge Functions Container Restart
// ── ──────────────────────────────────────────────────────────────────────────

describe('Scenario 3: Edge Functions Container Restart', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries and recovers after transient 503 (cold start)', async () => {
    const { queryExternalProxy, __testing } = await import('@/lib/externalProxy');
    __testing!.resetBreakerAndCoalesce();
    mockRecordRetryOutcome.mockClear();

    let callSeq = 0;
    __testing!.setInvokeOverride(async () => {
      callSeq++;
      if (callSeq <= 2) {
        return {
          data: null,
          error: {
            name: 'FunctionsHttpError',
            message: 'Service is temporarily unavailable',
            status: 503,
          },
        };
      }
      return { data: { data: [{ id: '1', content: 'Post-cold-start' }], count: 1 }, error: null };
    });

    const promise = queryExternalProxy({ table: 'evolution_messages' });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(result.data).toHaveLength(1);
    expect(callSeq).toBe(3); // 2 fails + 1 success

    expect(mockRecordRetryOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'evolution_messages', recovered: true, attempts: 3 })
    );

    __testing!.clearInvokeOverride();
  });

  it('retries and recovers after transient 502 (edge runtime error)', async () => {
    const { queryExternalProxy, __testing } = await import('@/lib/externalProxy');
    __testing!.resetBreakerAndCoalesce();

    let callSeq = 0;
    __testing!.setInvokeOverride(async () => {
      callSeq++;
      if (callSeq <= 1) {
        return {
          data: null,
          error: { name: 'FunctionsHttpError', message: 'non-2xx status code: 502', status: 502 },
        };
      }
      return {
        data: { data: [{ id: '1', content: 'Recovered from 502' }], count: 1 },
        error: null,
      };
    });

    const promise = queryExternalProxy({ table: 'evolution_messages' });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(result.data).toHaveLength(1);
    expect(callSeq).toBe(2);

    __testing!.clearInvokeOverride();
  });

  it('exhausts retries after 3 consecutive transient failures', async () => {
    const { queryExternalProxy, __testing } = await import('@/lib/externalProxy');
    __testing!.resetBreakerAndCoalesce();
    mockRecordRetryOutcome.mockClear();

    let callSeq = 0;
    __testing!.setInvokeOverride(async () => {
      callSeq++;
      return {
        data: null,
        error: {
          name: 'FunctionsHttpError',
          message: 'Service is temporarily unavailable',
          status: 503,
        },
      };
    });

    const promise = queryExternalProxy({ table: 'evolution_messages' }).catch(() => {});
    await vi.advanceTimersByTimeAsync(5000);
    await promise;
    expect(callSeq).toBe(3); // All 3 retries consumed

    expect(mockRecordRetryOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'evolution_messages', exhausted: true, transientCount: 3 })
    );

    __testing!.clearInvokeOverride();
  });

  it('does NOT retry non-transient errors (4xx client errors)', async () => {
    const { queryExternalProxy, __testing } = await import('@/lib/externalProxy');
    __testing!.resetBreakerAndCoalesce();

    let invokeCount = 0;
    __testing!.setInvokeOverride(async () => {
      invokeCount++;
      return {
        data: null,
        error: { name: 'FunctionsHttpError', message: 'Bad Request', status: 400 },
      };
    });

    await expect(queryExternalProxy({ table: 'evolution_messages' })).rejects.toThrow();
    expect(invokeCount).toBe(1); // Only 1 attempt — no retry

    __testing!.clearInvokeOverride();
  });

  it('trips config auth lock on 502 with service_role error', async () => {
    const { queryExternalProxy, __testing } = await import('@/lib/externalProxy');
    __testing!.resetBreakerAndCoalesce();

    __testing!.setInvokeOverride(async () => ({
      data: null,
      error: {
        name: 'FunctionsHttpError',
        message: 'service_role rejected — JWT_SECRET mismatch',
        status: 502,
      },
    }));

    // First call trips the lock (but error is thrown)
    const p1 = queryExternalProxy({ table: 'evolution_messages' }).catch(() => {});
    await vi.advanceTimersByTimeAsync(1000);
    await p1;
    __testing!.clearInvokeOverride();

    // Different table now — should be blocked session-wide
    __testing!.setInvokeOverride(async () => ({
      data: { data: [{ id: '1' }], count: 1 },
      error: null,
    }));

    await expect(queryExternalProxy({ table: 'evolution_contacts' })).rejects.toThrow(
      'config-auth locked'
    );

    __testing!.clearInvokeOverride();
  });

  it('trips per-target auth lock on 401 (session expired during restart)', async () => {
    const { queryExternalProxy, __testing } = await import('@/lib/externalProxy');
    __testing!.resetBreakerAndCoalesce();

    __testing!.setInvokeOverride(async () => ({
      data: null,
      error: { name: 'FunctionsHttpError', message: 'Unauthorized', status: 401 },
    }));

    const p = queryExternalProxy({ table: 'evolution_messages' }).catch(() => {});
    await vi.advanceTimersByTimeAsync(1000);
    await p;

    __testing!.clearInvokeOverride();

    // Same target should be auth-locked
    __testing!.setInvokeOverride(async () => ({
      data: { data: [{ id: '1' }], count: 1 },
      error: null,
    }));

    await expect(queryExternalProxy({ table: 'evolution_messages' })).rejects.toThrow(
      'auth locked'
    );

    // Different target should work
    const p2 = queryExternalProxy({ table: 'evolution_contacts' });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await p2;
    expect(result.data).toHaveLength(1);

    __testing!.clearInvokeOverride();
  });
});

// ── ──────────────────────────────────────────────────────────────────────────
// Combined: Full Pipeline Failure then Recovery
// ── ──────────────────────────────────────────────────────────────────────────

describe('Combined: Full Pipeline Failure then Recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function drainGhostCalls(table = 'test', n = 1): Promise<void> {
    const { queryExternalProxy, __testing } = await import('@/lib/externalProxy');
    for (let i = 0; i < n; i++) {
      const p = queryExternalProxy({ table });
      const suppressed = p.catch(() => {});
      await vi.advanceTimersByTimeAsync(2000);
      await suppressed;
    }
  }

  it('survives: Traefik outage while Evolution down, then full recovery', async () => {
    const { queryExternalProxy, __testing } = await import('@/lib/externalProxy');
    __testing!.resetBreakerAndCoalesce();

    // Phase 1: Traefik and Evolution both down — ghost posts
    __testing!.setInvokeOverride(async () => ({
      data: null,
      error: { name: 'FunctionsFetchError', message: 'Failed to send a request' },
    }));

    await drainGhostCalls('evolution_messages', 2);
    expect(__testing!.isBreakerOpen('evolution_messages').open).toBe(true);

    // Phase 2: Traefik recovers, but Evolution is still down.
    // Circuit breaker cooldown expires after 5s
    vi.advanceTimersByTime(5001);
    expect(__testing!.isBreakerOpen('evolution_messages').open).toBe(false);

    // Edge function is reachable — DB still serves old data
    __testing!.setInvokeOverride(async () => ({
      data: {
        data: [
          { id: 'existing-1', content: 'Old message from DB', created_at: '2026-07-29T10:00:00Z' },
        ],
        count: 1,
      },
      error: null,
    }));

    const p1 = queryExternalProxy({ table: 'evolution_messages' });
    await vi.advanceTimersByTimeAsync(1000);
    const result1 = await p1;
    expect(result1.data).toHaveLength(1);

    // Phase 3: Evolution also recovers — new messages available
    __testing!.setInvokeOverride(async () => ({
      data: {
        data: [
          { id: 'existing-1', content: 'Old message from DB', created_at: '2026-07-29T10:00:00Z' },
          {
            id: 'new-1',
            content: 'New message after Evolution recovery',
            created_at: '2026-07-30T11:00:00Z',
          },
        ],
        count: 2,
      },
      error: null,
    }));

    const p2 = queryExternalProxy({ table: 'evolution_messages' });
    await vi.advanceTimersByTimeAsync(1000);
    const result2 = await p2;
    expect(result2.data).toHaveLength(2);

    __testing!.clearInvokeOverride();
  });
});
*/

// ── Deprecated placeholder ───────────────────────────────────────────────────
// The original suites are preserved commented-out above (see @deprecated header).
// This placeholder keeps vitest from failing the file with "No test suite found".
describe.skip('resilience simulation — deprecated (FATOR X removal)', () => {
  it('original suites commented out; see header note', () => {});
});
