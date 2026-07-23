/**
 * Tests for invokeEvolutionWithRetry() in evolutionSendRetry.ts.
 *
 * All external dependencies (supabase, retry, circuit breaker, dedupe, DLQ,
 * sendFunctionRouter, retryConfig, requestDedupeKey) are mocked.
 *
 * crossTabDedupe is set up to call its callback directly so the retry loop
 * runs synchronously in tests.
 *
 * withRetry is set up to call the operation once (happy path) or throw when
 * the operation throws (pass-through), without real exponential delay.
 *
 * Covered:
 *   1. Happy path — invokes correct edge function, returns result
 *   2. evolution-api routing — path = evolution-api/<action>
 *   3. whatsapp-cloud-api routing — path differs, action goes into body
 *   4. Idempotency-Key header injected when idempotencyKey is provided
 *   5. Existing Idempotency-Key header not overwritten
 *   6. Transient failure → DLQ enqueued, error re-thrown
 *   7. Non-transient failure → DLQ NOT enqueued, error re-thrown
 *   8. CircuitOpenError → DLQ enqueued, error re-thrown
 *   9. Instance name absent → DLQ NOT enqueued (no safe remote_jid)
 *  10. DLQ payload includes __idemKey when idempotencyKey set
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const mockInvoke = vi.hoisted(() => vi.fn());
const mockWithRetry = vi.hoisted(() => vi.fn());
const mockEnqueueClientFailedMessage = vi.hoisted(() => vi.fn());
const mockLoadRetryConfig = vi.hoisted(() => vi.fn());
const mockCrossTabDedupe = vi.hoisted(() => vi.fn());
const mockBuildRequestDedupeKey = vi.hoisted(() => vi.fn());
const mockResolveSendFunction = vi.hoisted(() => vi.fn());
const mockCanCall = vi.hoisted(() => vi.fn());
const mockRecordFailure = vi.hoisted(() => vi.fn());
const mockRecordSuccess = vi.hoisted(() => vi.fn());

const MockCircuitOpenError = vi.hoisted(() => {
  class CircuitOpenError extends Error {
    retryAfterMs: number;
    constructor(instanceName: string, retryAfterMs: number) {
      super(`Circuit open: ${instanceName}`);
      this.name = 'CircuitOpenError';
      this.retryAfterMs = retryAfterMs;
    }
  }
  return CircuitOpenError;
});

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_RESOLVED_URL: 'http://localhost:54321',
  SUPABASE_RESOLVED_ANON_KEY: 'test-anon-key',
  supabase: { functions: { invoke: mockInvoke } },
}));

vi.mock('@/lib/retry', () => ({ withRetry: mockWithRetry }));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

vi.mock('@/lib/failedMessagesEnqueue', () => ({
  enqueueClientFailedMessage: mockEnqueueClientFailedMessage,
}));

vi.mock('@/lib/retryConfig', () => ({
  loadRetryConfig: mockLoadRetryConfig,
}));

vi.mock('@/lib/crossTabSendDedupe', () => ({
  crossTabDedupe: mockCrossTabDedupe,
}));

vi.mock('@/lib/requestDedupeKey', () => ({
  buildRequestDedupeKey: mockBuildRequestDedupeKey,
}));

vi.mock('@/lib/sendFunctionRouter', () => ({
  resolveSendFunction: mockResolveSendFunction,
}));

vi.mock('@/lib/evolutionCircuitBreaker', () => ({
  canCall: mockCanCall,
  recordFailure: mockRecordFailure,
  recordSuccess: mockRecordSuccess,
  CircuitOpenError: MockCircuitOpenError,
}));

// ── Import SUT AFTER mocks ────────────────────────────────────────────────────
import { invokeEvolutionWithRetry } from '../evolutionSendRetry';

// ── Helpers ───────────────────────────────────────────────────────────────────
const DEFAULT_CONFIG = { maxRetries: 3, baseBackoffMs: 1000, maxBackoffMs: 10000 };

/**
 * Sets up withRetry to call the operation fn exactly once (no retry delay).
 * If the fn throws, withRetry re-throws (pass-through).
 */
function setupWithRetryPassThrough() {
  mockWithRetry.mockImplementation(async (fn: () => Promise<unknown>) => fn());
}

/**
 * Sets up crossTabDedupe to call its callback directly (no broadcast channel).
 */
function setupCrossTabDedupePassThrough() {
  mockCrossTabDedupe.mockImplementation((_key: string, fn: () => Promise<unknown>) => fn());
}

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  mockLoadRetryConfig.mockResolvedValue(DEFAULT_CONFIG);
  mockResolveSendFunction.mockResolvedValue('evolution-api');
  mockBuildRequestDedupeKey.mockResolvedValue('dedupe-key-123');
  mockCanCall.mockReturnValue({ allowed: true });
  mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
  setupWithRetryPassThrough();
  setupCrossTabDedupePassThrough();
});

// ── 1. Happy path ─────────────────────────────────────────────────────────────
describe('invokeEvolutionWithRetry — happy path', () => {
  it('invokes supabase.functions.invoke and returns the result', async () => {
    const fakeResult = { data: { status: 'sent' }, error: null };
    mockInvoke.mockResolvedValue(fakeResult);

    const result = await invokeEvolutionWithRetry(
      'sendText',
      { body: { instance_name: 'inst-1', number: '+5511999' } }
    );

    expect(result).toEqual(fakeResult);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('records circuit breaker success after a successful call', async () => {
    await invokeEvolutionWithRetry(
      'sendText',
      { body: { instance_name: 'inst-1', number: '+5511999' } }
    );
    expect(mockRecordSuccess).toHaveBeenCalledWith('inst-1');
  });

  it('does not enqueue to DLQ on success', async () => {
    await invokeEvolutionWithRetry(
      'sendText',
      { body: { instance_name: 'inst-1', number: '+5511999' } }
    );
    expect(mockEnqueueClientFailedMessage).not.toHaveBeenCalled();
  });
});

// ── 2. evolution-api routing ──────────────────────────────────────────────────
describe('invokeEvolutionWithRetry — evolution-api routing', () => {
  it('calls evolution-api/<action> path when resolver returns evolution-api', async () => {
    mockResolveSendFunction.mockResolvedValue('evolution-api');

    await invokeEvolutionWithRetry('sendText', { body: { instance_name: 'i1' } });

    expect(mockInvoke).toHaveBeenCalledWith(
      'evolution-api/sendText',
      expect.any(Object)
    );
  });

  it('passes body as-is for evolution-api', async () => {
    const body = { instance_name: 'i1', message: 'hello' };
    await invokeEvolutionWithRetry('sendText', { body });

    const [, opts] = mockInvoke.mock.calls[0] as [string, { body: unknown }];
    expect(opts.body).toEqual(body);
  });
});

// ── 3. whatsapp-cloud-api routing ─────────────────────────────────────────────
describe('invokeEvolutionWithRetry — whatsapp-cloud-api routing', () => {
  it('calls whatsapp-cloud-api path when resolver returns whatsapp-cloud-api', async () => {
    mockResolveSendFunction.mockResolvedValue('whatsapp-cloud-api');

    await invokeEvolutionWithRetry('sendText', { body: { instance_name: 'i1', text: 'hi' } });

    expect(mockInvoke).toHaveBeenCalledWith('whatsapp-cloud-api', expect.any(Object));
  });

  it('merges action into the body for whatsapp-cloud-api', async () => {
    mockResolveSendFunction.mockResolvedValue('whatsapp-cloud-api');
    const body = { instance_name: 'i1', text: 'hi' };

    await invokeEvolutionWithRetry('sendText', { body });

    const [, opts] = mockInvoke.mock.calls[0] as [string, { body: unknown }];
    expect((opts.body as Record<string, unknown>).action).toBe('sendText');
  });
});

// ── 4. Idempotency-Key header injection ───────────────────────────────────────
describe('invokeEvolutionWithRetry — idempotency key header', () => {
  it('injects Idempotency-Key header when idempotencyKey is provided', async () => {
    await invokeEvolutionWithRetry(
      'sendText',
      { body: { instance_name: 'i1' } },
      { idempotencyKey: 'idem-abc' }
    );

    const [, opts] = mockInvoke.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(opts.headers?.['Idempotency-Key']).toBe('idem-abc');
  });

  it('does not inject Idempotency-Key header when not provided', async () => {
    await invokeEvolutionWithRetry('sendText', { body: { instance_name: 'i1' } });

    const [, opts] = mockInvoke.mock.calls[0] as [string, { headers?: Record<string, string> }];
    expect(opts.headers?.['Idempotency-Key']).toBeUndefined();
  });

  it('does not overwrite existing Idempotency-Key header from caller', async () => {
    await invokeEvolutionWithRetry(
      'sendText',
      {
        body: { instance_name: 'i1' },
        headers: { 'Idempotency-Key': 'caller-key' },
      },
      { idempotencyKey: 'new-key' }
    );

    const [, opts] = mockInvoke.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(opts.headers?.['Idempotency-Key']).toBe('caller-key');
  });
});

// ── 5. Transient failure → DLQ ────────────────────────────────────────────────
describe('invokeEvolutionWithRetry — transient failure → DLQ', () => {
  it('enqueues to DLQ when crossTabDedupe throws a transient network error', async () => {
    const err = Object.assign(new Error('fetch failed'), { status: 503 });
    mockCrossTabDedupe.mockRejectedValue(err);

    await expect(
      invokeEvolutionWithRetry('sendText', { body: { instance_name: 'inst-1', number: '+5511' } })
    ).rejects.toThrow('fetch failed');

    expect(mockEnqueueClientFailedMessage).toHaveBeenCalledTimes(1);
    expect(mockEnqueueClientFailedMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        instance_name: 'inst-1',
        path: '/message/sendText',
        http_status: 503,
      })
    );
  });

  it('re-throws the error after enqueuing to DLQ', async () => {
    const err = Object.assign(new Error('timeout'), { });
    mockCrossTabDedupe.mockRejectedValue(err);

    await expect(
      invokeEvolutionWithRetry('sendText', { body: { instance_name: 'i1' } })
    ).rejects.toBe(err);
  });
});

// ── 6. Non-transient failure → no DLQ ────────────────────────────────────────
describe('invokeEvolutionWithRetry — non-transient failure → no DLQ', () => {
  it('does NOT enqueue when error is non-transient (4xx client error)', async () => {
    const err = Object.assign(new Error('Not Found'), { status: 404 });
    mockCrossTabDedupe.mockRejectedValue(err);

    await expect(
      invokeEvolutionWithRetry('sendText', { body: { instance_name: 'i1' } })
    ).rejects.toThrow('Not Found');

    expect(mockEnqueueClientFailedMessage).not.toHaveBeenCalled();
  });

  it('does NOT enqueue when error is a permanent auth error (401)', async () => {
    const err = Object.assign(new Error('Unauthorized'), { status: 401 });
    mockCrossTabDedupe.mockRejectedValue(err);

    await expect(
      invokeEvolutionWithRetry('sendText', { body: { instance_name: 'i1' } })
    ).rejects.toThrow('Unauthorized');

    expect(mockEnqueueClientFailedMessage).not.toHaveBeenCalled();
  });
});

// ── 7. CircuitOpenError → DLQ ─────────────────────────────────────────────────
describe('invokeEvolutionWithRetry — CircuitOpenError → DLQ', () => {
  it('enqueues to DLQ with error_code circuit_open when circuit is open', async () => {
    const circuitErr = new MockCircuitOpenError('inst-1', 5000);
    mockCrossTabDedupe.mockRejectedValue(circuitErr);

    await expect(
      invokeEvolutionWithRetry('sendText', { body: { instance_name: 'inst-1' } })
    ).rejects.toThrow('Circuit open');

    expect(mockEnqueueClientFailedMessage).toHaveBeenCalledWith(
      expect.objectContaining({ error_code: 'circuit_open', instance_name: 'inst-1' })
    );
  });
});

// ── 8. No instance_name → no DLQ ─────────────────────────────────────────────
describe('invokeEvolutionWithRetry — missing instance_name', () => {
  it('does NOT enqueue when instance_name is absent even on transient error', async () => {
    const err = Object.assign(new Error('fetch failed'), {});
    mockCrossTabDedupe.mockRejectedValue(err);

    await expect(
      invokeEvolutionWithRetry('sendText', { body: { number: '+5511' } })
    ).rejects.toThrow('fetch failed');

    expect(mockEnqueueClientFailedMessage).not.toHaveBeenCalled();
  });
});

// ── 9. DLQ payload includes __idemKey ─────────────────────────────────────────
describe('invokeEvolutionWithRetry — DLQ payload', () => {
  it('includes __idemKey in DLQ payload when idempotencyKey is set', async () => {
    const err = Object.assign(new Error('timeout'), {});
    mockCrossTabDedupe.mockRejectedValue(err);

    await expect(
      invokeEvolutionWithRetry(
        'sendText',
        { body: { instance_name: 'i1', text: 'hi' } },
        { idempotencyKey: 'my-key' }
      )
    ).rejects.toThrow();

    const dlqCall = mockEnqueueClientFailedMessage.mock.calls[0][0];
    expect(dlqCall.payload.__idemKey).toBe('my-key');
  });

  it('does NOT include __idemKey in DLQ payload when idempotencyKey is absent', async () => {
    const err = Object.assign(new Error('timeout'), {});
    mockCrossTabDedupe.mockRejectedValue(err);

    await expect(
      invokeEvolutionWithRetry('sendText', { body: { instance_name: 'i1' } })
    ).rejects.toThrow();

    const dlqCall = mockEnqueueClientFailedMessage.mock.calls[0][0];
    expect(dlqCall.payload.__idemKey).toBeUndefined();
  });
});
