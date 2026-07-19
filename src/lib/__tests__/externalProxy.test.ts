import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { queryExternalProxy, __testing } from '../externalProxy';
import { recordQueryEvent, recordRetryOutcome } from '@/lib/clientTelemetry';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
}));

vi.mock('@/lib/clientTelemetry', () => ({
  recordQueryEvent: vi.fn(),
  recordRetryOutcome: vi.fn(),
  classifySeverity: vi.fn().mockReturnValue('ok'),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/lib/correlationId', () => ({
  generateCorrelationId: vi.fn().mockReturnValue('cid-test'),
  CORRELATION_HEADER: 'x-correlation-id',
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

type InvokeOverride = Parameters<NonNullable<typeof __testing>['setInvokeOverride']>[0];

function makeSuccessOverride(rows: unknown[] = [], count = 0): InvokeOverride {
  return async () => ({ data: { data: rows, count }, error: null });
}

function makeErrorOverride(
  name: string,
  message: string,
  status?: number,
): InvokeOverride {
  return async () => ({
    data: null,
    error: status !== undefined ? { name, message, status } : { name, message },
  });
}

function makeGhostPostOverride(): InvokeOverride {
  return async () => ({
    data: null,
    error: { name: 'FunctionsFetchError', message: 'fetch_failed' },
  });
}

// ── Global setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  __testing!.resetBreakerAndCoalesce();
  vi.mocked(recordQueryEvent).mockClear();
  vi.mocked(recordRetryOutcome).mockClear();
});

afterEach(() => {
  __testing!.clearInvokeOverride();
});

// ── __testing namespace ───────────────────────────────────────────────────────

describe('__testing namespace', () => {
  it('is defined in non-production builds', () => {
    expect(__testing).toBeDefined();
    expect(__testing).not.toBeNull();
  });

  it('exposes the four required helpers', () => {
    expect(typeof __testing!.resetBreakerAndCoalesce).toBe('function');
    expect(typeof __testing!.isBreakerOpen).toBe('function');
    expect(typeof __testing!.setInvokeOverride).toBe('function');
    expect(typeof __testing!.clearInvokeOverride).toBe('function');
  });

  it('isBreakerOpen returns {open: false, remainingMs: 0} for an unknown target', () => {
    const state = __testing!.isBreakerOpen('never-hit-target');
    expect(state.open).toBe(false);
    expect(state.remainingMs).toBe(0);
  });
});

// ── normalizeProxyBody ────────────────────────────────────────────────────────

describe('normalizeProxyBody — body normalization', () => {
  let captured: Record<string, unknown> | null = null;

  beforeEach(() => {
    captured = null;
    __testing!.setInvokeOverride(async (_fn, opts) => {
      captured = opts.body as Record<string, unknown>;
      return { data: { data: [], count: 0 }, error: null };
    });
  });

  it('adds action:"select" when table is present and action is absent', async () => {
    await queryExternalProxy({ table: 'contacts' });
    expect(captured?.action).toBe('select');
  });

  it('preserves existing action:"insert" unchanged', async () => {
    await queryExternalProxy({ action: 'insert', table: 'contacts', data: {} });
    expect(captured?.action).toBe('insert');
    expect(captured?.table).toBe('contacts');
  });

  it('preserves existing action:"rpc" unchanged', async () => {
    await queryExternalProxy({ action: 'rpc', rpc: 'get_contacts' });
    expect(captured?.action).toBe('rpc');
    expect(captured?.rpc).toBe('get_contacts');
  });

  it('includes __cid in the body sent to invoke', async () => {
    await queryExternalProxy({ table: 'contacts' });
    expect(typeof captured?.__cid).toBe('string');
    expect((captured!.__cid as string).length).toBeGreaterThan(0);
  });

  it('includes __attempt:1 on the first (and only) successful invocation', async () => {
    await queryExternalProxy({ table: 'contacts' });
    expect(captured?.__attempt).toBe(1);
  });
});

// ── happy path ────────────────────────────────────────────────────────────────

describe('queryExternalProxy — happy path', () => {
  beforeEach(() => {
    __testing!.setInvokeOverride(makeSuccessOverride([{ id: 1, name: 'Alice' }], 1));
  });

  it('resolves with the data array from the proxy response', async () => {
    const result = await queryExternalProxy({ table: 'contacts' });
    expect(result.data).toEqual([{ id: 1, name: 'Alice' }]);
  });

  it('resolves with count from the proxy response', async () => {
    const result = await queryExternalProxy({ table: 'contacts' });
    expect(result.count).toBe(1);
  });

  it('calls recordQueryEvent once with source and target', async () => {
    await queryExternalProxy({ table: 'contacts' });
    expect(recordQueryEvent).toHaveBeenCalledOnce();
    expect(recordQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'externalProxy', target: 'contacts' }),
    );
  });

  it('calls recordRetryOutcome once with recovered:false on first-attempt success', async () => {
    await queryExternalProxy({ table: 'contacts' });
    expect(recordRetryOutcome).toHaveBeenCalledOnce();
    expect(recordRetryOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'contacts', recovered: false }),
    );
  });

  it('returns empty data array when proxy returns no rows', async () => {
    __testing!.setInvokeOverride(makeSuccessOverride([], 0));
    const result = await queryExternalProxy({ table: 'contacts' });
    expect(result.data).toEqual([]);
    expect(result.count).toBe(0);
  });
});

// ── data.error in response body ───────────────────────────────────────────────

describe('queryExternalProxy — data.error field', () => {
  it('throws the error string embedded in the proxy response body', async () => {
    __testing!.setInvokeOverride(async () => ({
      data: { data: [], error: 'RLS policy denied', count: 0 },
      error: null,
    }));
    await expect(queryExternalProxy({ table: 'contacts' })).rejects.toThrow('RLS policy denied');
  });

  it('records a query event with the data.error message', async () => {
    __testing!.setInvokeOverride(async () => ({
      data: { data: [], error: 'permission denied for table contacts', count: 0 },
      error: null,
    }));
    await expect(queryExternalProxy({ table: 'contacts' })).rejects.toThrow();
    expect(recordQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ errorMessage: 'permission denied for table contacts' }),
    );
  });
});

// ── non-transient invoke error ────────────────────────────────────────────────

describe('queryExternalProxy — non-transient invoke errors', () => {
  it('throws immediately on 400 Bad Request (no retry)', async () => {
    let invokeCount = 0;
    __testing!.setInvokeOverride(async () => {
      invokeCount++;
      return { data: null, error: { name: 'FunctionsHttpError', message: 'Bad Request', status: 400 } };
    });
    await expect(queryExternalProxy({ table: 'contacts' })).rejects.toThrow();
    expect(invokeCount).toBe(1);
  });

  it('throws immediately on 404 Not Found (no retry)', async () => {
    let invokeCount = 0;
    __testing!.setInvokeOverride(async () => {
      invokeCount++;
      return { data: null, error: { name: 'FunctionsHttpError', message: 'Not Found', status: 404 } };
    });
    await expect(queryExternalProxy({ table: 'contacts' })).rejects.toThrow();
    expect(invokeCount).toBe(1);
  });

  it('wraps error message with correlation id prefix', async () => {
    __testing!.setInvokeOverride(makeErrorOverride('FunctionsHttpError', 'Not Found', 404));
    const err = await queryExternalProxy({ table: 'contacts' }).catch((e: Error) => e);
    expect(err.message).toContain('cid=');
    expect(err.message).toContain('Not Found');
  });

  it('calls recordQueryEvent with the error message', async () => {
    __testing!.setInvokeOverride(makeErrorOverride('FunctionsHttpError', 'Forbidden', 403));
    await expect(queryExternalProxy({ table: 'contacts' })).rejects.toThrow();
    expect(recordQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ errorMessage: 'Forbidden' }),
    );
  });
});

// ── AbortError propagation ────────────────────────────────────────────────────

describe('queryExternalProxy — AbortError', () => {
  it('re-throws as an error with name:"AbortError"', async () => {
    __testing!.setInvokeOverride(makeErrorOverride('AbortError', 'signal aborted'));
    const err = await queryExternalProxy({ table: 'contacts' }).catch((e: Error) => e);
    expect(err.name).toBe('AbortError');
  });

  it('does not retry on AbortError (invoke called exactly once)', async () => {
    let invokeCount = 0;
    __testing!.setInvokeOverride(async () => {
      invokeCount++;
      return { data: null, error: { name: 'AbortError', message: 'aborted' } };
    });
    await queryExternalProxy({ table: 'contacts' }).catch(() => {});
    expect(invokeCount).toBe(1);
  });
});

// ── inflight coalescing ───────────────────────────────────────────────────────

describe('queryExternalProxy — inflight coalescing', () => {
  it('coalesces two identical concurrent reads into one invoke call', async () => {
    let invokeCount = 0;
    __testing!.setInvokeOverride(async () => {
      invokeCount++;
      return { data: { data: [{ id: 1 }], count: 1 }, error: null };
    });

    const [r1, r2] = await Promise.all([
      queryExternalProxy({ table: 'contacts' }),
      queryExternalProxy({ table: 'contacts' }),
    ]);

    expect(invokeCount).toBe(1);
    expect(r1.data).toEqual(r2.data);
  });

  it('does NOT coalesce insert mutations — each gets its own invoke', async () => {
    let invokeCount = 0;
    __testing!.setInvokeOverride(async () => {
      invokeCount++;
      return { data: { data: [], count: 0 }, error: null };
    });

    await Promise.all([
      queryExternalProxy({ action: 'insert', table: 'contacts', data: { name: 'A' } }),
      queryExternalProxy({ action: 'insert', table: 'contacts', data: { name: 'A' } }),
    ]);

    expect(invokeCount).toBe(2);
  });

  it('does NOT coalesce reads for different tables', async () => {
    let invokeCount = 0;
    __testing!.setInvokeOverride(async () => {
      invokeCount++;
      return { data: { data: [], count: 0 }, error: null };
    });

    await Promise.all([
      queryExternalProxy({ table: 'contacts' }),
      queryExternalProxy({ table: 'messages' }),
    ]);

    expect(invokeCount).toBe(2);
  });

  it('does NOT coalesce update mutations', async () => {
    let invokeCount = 0;
    __testing!.setInvokeOverride(async () => {
      invokeCount++;
      return { data: { data: [], count: 0 }, error: null };
    });

    await Promise.all([
      queryExternalProxy({ action: 'update', table: 'contacts', data: { name: 'B' } }),
      queryExternalProxy({ action: 'update', table: 'contacts', data: { name: 'B' } }),
    ]);

    expect(invokeCount).toBe(2);
  });
});

// ── circuit breaker ───────────────────────────────────────────────────────────

describe('circuit breaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __testing!.setInvokeOverride(makeGhostPostOverride());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function drainGhostCalls(table = 'test', n = 1): Promise<void> {
    for (let i = 0; i < n; i++) {
      const p = queryExternalProxy({ table });
      const suppressed = p.catch(() => {});
      await vi.advanceTimersByTimeAsync(2000);
      await suppressed;
    }
  }

  it('starts closed for every target', () => {
    expect(__testing!.isBreakerOpen('test').open).toBe(false);
    expect(__testing!.isBreakerOpen('other').open).toBe(false);
  });

  it('remains closed after one failing call (3 ghost attempts, threshold=4)', async () => {
    await drainGhostCalls('test', 1);
    expect(__testing!.isBreakerOpen('test').open).toBe(false);
  });

  it('opens after two failing calls (cumulative fails reaches threshold)', async () => {
    await drainGhostCalls('test', 2);
    expect(__testing!.isBreakerOpen('test').open).toBe(true);
  });

  it('short-circuits subsequent requests with "circuit open" error', async () => {
    await drainGhostCalls('test', 2);
    await expect(queryExternalProxy({ table: 'test' })).rejects.toThrow('circuit open');
  });

  it('reports a positive remainingMs <= 5000 while open', async () => {
    await drainGhostCalls('test', 2);
    const { open, remainingMs } = __testing!.isBreakerOpen('test');
    expect(open).toBe(true);
    expect(remainingMs).toBeGreaterThan(0);
    expect(remainingMs).toBeLessThanOrEqual(5000);
  });

  it('auto-closes after BREAKER_COOLDOWN_MS (5000ms) elapses', async () => {
    await drainGhostCalls('test', 2);
    expect(__testing!.isBreakerOpen('test').open).toBe(true);
    vi.advanceTimersByTime(5001);
    expect(__testing!.isBreakerOpen('test').open).toBe(false);
  });

  it('breaker is independent per target', async () => {
    await drainGhostCalls('contacts', 2);
    expect(__testing!.isBreakerOpen('contacts').open).toBe(true);
    expect(__testing!.isBreakerOpen('messages').open).toBe(false);
  });

  it('resetBreakerAndCoalesce reopens a tripped breaker', async () => {
    await drainGhostCalls('test', 2);
    expect(__testing!.isBreakerOpen('test').open).toBe(true);
    __testing!.resetBreakerAndCoalesce();
    expect(__testing!.isBreakerOpen('test').open).toBe(false);
  });
});

// ── auth lock (per-target) ────────────────────────────────────────────────────

describe('auth lock', () => {
  it('trips per-target lock after 401 response', async () => {
    __testing!.setInvokeOverride(makeErrorOverride('FunctionsHttpError', 'Unauthorized', 401));
    await expect(queryExternalProxy({ table: 'contacts' })).rejects.toThrow();

    __testing!.clearInvokeOverride();
    await expect(queryExternalProxy({ table: 'contacts' })).rejects.toThrow('auth locked');
  });

  it('trips per-target lock after 403 response', async () => {
    __testing!.setInvokeOverride(makeErrorOverride('FunctionsHttpError', 'Forbidden', 403));
    await expect(queryExternalProxy({ table: 'contacts' })).rejects.toThrow();

    __testing!.clearInvokeOverride();
    await expect(queryExternalProxy({ table: 'contacts' })).rejects.toThrow('auth locked');
  });

  it('auth-locked error message includes target name and retry window', async () => {
    __testing!.setInvokeOverride(makeErrorOverride('FunctionsHttpError', 'Unauthorized', 401));
    await expect(queryExternalProxy({ table: 'contacts' })).rejects.toThrow();

    __testing!.clearInvokeOverride();
    const err = await queryExternalProxy({ table: 'contacts' }).catch((e: Error) => e);
    expect(err.message).toContain('contacts');
    expect(err.message).toContain('retry in');
  });

  it('does not lock other targets when one is auth-locked', async () => {
    __testing!.setInvokeOverride(makeErrorOverride('FunctionsHttpError', 'Unauthorized', 401));
    await expect(queryExternalProxy({ table: 'contacts' })).rejects.toThrow();

    __testing!.setInvokeOverride(makeSuccessOverride([{ id: 2 }], 1));
    const result = await queryExternalProxy({ table: 'messages' });
    expect(result.data).toEqual([{ id: 2 }]);
  });

  it('resetBreakerAndCoalesce clears the auth lock', async () => {
    __testing!.setInvokeOverride(makeErrorOverride('FunctionsHttpError', 'Unauthorized', 401));
    await expect(queryExternalProxy({ table: 'contacts' })).rejects.toThrow();

    __testing!.resetBreakerAndCoalesce();
    __testing!.setInvokeOverride(makeSuccessOverride([], 0));
    await expect(queryExternalProxy({ table: 'contacts' })).resolves.toBeDefined();
  });
});

// ── config auth lock (session-wide) ──────────────────────────────────────────

describe('config auth lock — session-wide', () => {
  it('trips on 502 with "service_role" in message', async () => {
    __testing!.setInvokeOverride(
      makeErrorOverride('FunctionsHttpError', 'service_role rejected — JWT_SECRET mismatch', 502),
    );
    await expect(queryExternalProxy({ table: 'contacts' })).rejects.toThrow();

    __testing!.clearInvokeOverride();
    await expect(queryExternalProxy({ table: 'messages' })).rejects.toThrow('config-auth locked');
  });

  it('trips on 502 with "JWT_SECRET" in message', async () => {
    __testing!.setInvokeOverride(
      makeErrorOverride('FunctionsHttpError', 'JWT_SECRET validation failed', 502),
    );
    await expect(queryExternalProxy({ table: 'contacts' })).rejects.toThrow();

    __testing!.clearInvokeOverride();
    await expect(queryExternalProxy({ table: 'any-table' })).rejects.toThrow('config-auth locked');
  });

  it('lock error message mentions session-wide scope', async () => {
    __testing!.setInvokeOverride(
      makeErrorOverride('FunctionsHttpError', 'service_role rejected', 502),
    );
    await expect(queryExternalProxy({ table: 'contacts' })).rejects.toThrow();

    __testing!.clearInvokeOverride();
    const err = await queryExternalProxy({ table: 'any' }).catch((e: Error) => e);
    expect(err.message).toContain('session-wide');
  });

  it('resetBreakerAndCoalesce clears the config auth lock', async () => {
    __testing!.setInvokeOverride(
      makeErrorOverride('FunctionsHttpError', 'service_role rejected', 502),
    );
    await expect(queryExternalProxy({ table: 'contacts' })).rejects.toThrow();

    __testing!.resetBreakerAndCoalesce();
    __testing!.setInvokeOverride(makeSuccessOverride([], 0));
    await expect(queryExternalProxy({ table: 'any' })).resolves.toBeDefined();
  });
});