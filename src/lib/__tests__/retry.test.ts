import { describe, it, expect, vi } from 'vitest';
import { withRetry, withNetworkRetry } from '@/lib/retry';

// Use tiny delays (0 ms) so tests don't stall.
const FAST: Parameters<typeof withRetry>[1] = {
  baseDelayMs: 0,
  maxDelayMs: 0,
};

// Explicit retry-all policy for tests that need the old default behavior.
const RETRY_ALL = { shouldRetry: () => true } as const;

// ── withRetry — success on first attempt ──────────────────────────────────────

describe('withRetry — success on first attempt', () => {
  it('returns the operation result when it succeeds immediately', async () => {
    const result = await withRetry(async () => 42);
    expect(result).toBe(42);
  });

  it('calls the operation exactly once when it succeeds on the first try', async () => {
    const op = vi.fn(async () => 'ok');
    await withRetry(op);
    expect(op).toHaveBeenCalledTimes(1);
  });
});

// ── withRetry — success after retries ────────────────────────────────────────

describe('withRetry — success after retries', () => {
  it('succeeds after one transient failure', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts === 1) throw new Error('transient');
        return 'success';
      },
      { ...FAST, ...RETRY_ALL, maxRetries: 3 }
    );
    expect(result).toBe('success');
    expect(attempts).toBe(2);
  });

  it('succeeds after two transient failures', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('transient');
        return 'done';
      },
      { ...FAST, ...RETRY_ALL, maxRetries: 3 }
    );
    expect(result).toBe('done');
    expect(attempts).toBe(3);
  });

  it('calls onRetry for each retry attempt', async () => {
    const onRetry = vi.fn();
    let attempts = 0;
    await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('transient');
        return 'ok';
      },
      { ...FAST, ...RETRY_ALL, maxRetries: 5, onRetry }
    );
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('passes the attempt number (1-indexed) to onRetry', async () => {
    const attemptNums: number[] = [];
    let attempts = 0;
    await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('transient');
        return 'ok';
      },
      {
        ...FAST,
        ...RETRY_ALL,
        maxRetries: 5,
        onRetry: (_err, attempt) => attemptNums.push(attempt),
      }
    );
    expect(attemptNums).toEqual([1, 2]);
  });
});

// ── withRetry — exhausting retries ────────────────────────────────────────────

describe('withRetry — exhausting retries', () => {
  it('throws the last error when all retries are exhausted', async () => {
    await expect(
      withRetry(async () => { throw new Error('permanent'); }, { ...FAST, ...RETRY_ALL, maxRetries: 2 })
    ).rejects.toThrow('permanent');
  });

  it('calls the operation maxRetries+1 times when all fail', async () => {
    const op = vi.fn(async () => { throw new Error('fail'); });
    await expect(withRetry(op, { ...FAST, ...RETRY_ALL, maxRetries: 2 })).rejects.toThrow();
    expect(op).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('calls onRetry maxRetries times when all attempts fail', async () => {
    const onRetry = vi.fn();
    await expect(
      withRetry(
        async () => { throw new Error('fail'); },
        { ...FAST, ...RETRY_ALL, maxRetries: 3, onRetry }
      )
    ).rejects.toThrow();
    expect(onRetry).toHaveBeenCalledTimes(3);
  });
});

// ── withRetry — shouldRetry guard ─────────────────────────────────────────────

describe('withRetry — shouldRetry guard', () => {
  it('does not retry when shouldRetry returns false', async () => {
    const op = vi.fn(async () => { throw new Error('permanent'); });
    await expect(
      withRetry(op, { ...FAST, maxRetries: 5, shouldRetry: () => false })
    ).rejects.toThrow('permanent');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('retries only on specific error types when shouldRetry inspects the error', async () => {
    let attempts = 0;
    const op = vi.fn(async () => {
      attempts++;
      const err = new Error('connect ECONNRESET') as Error & { code?: string };
      err.code = 'ECONNRESET';
      throw err;
    });
    await expect(
      withRetry(op, {
        ...FAST,
        maxRetries: 2,
        shouldRetry: (err) =>
          err instanceof Error && err.message.includes('ECONNRESET'),
      })
    ).rejects.toThrow();
    expect(attempts).toBe(3);
  });

  it('stops retrying as soon as shouldRetry returns false', async () => {
    let attempts = 0;
    const op = vi.fn(async () => {
      attempts++;
      // First two attempts: transient. Third: permanent.
      if (attempts <= 2) throw new Error('transient');
      throw new Error('permanent');
    });
    await expect(
      withRetry(op, {
        ...FAST,
        maxRetries: 10,
        shouldRetry: (err) =>
          err instanceof Error && err.message === 'transient',
      })
    ).rejects.toThrow('permanent');
    expect(attempts).toBe(3);
  });
});

// ── withNetworkRetry ──────────────────────────────────────────────────────────

describe('withNetworkRetry', () => {
  it('succeeds immediately when the operation succeeds', async () => {
    const result = await withNetworkRetry(async () => 'net-ok');
    expect(result).toBe('net-ok');
  });

  it('retries on 502-in-message errors', async () => {
    let attempts = 0;
    const result = await withNetworkRetry(async () => {
      attempts++;
      if (attempts === 1) {
        const err = new Error('502 Bad Gateway') as Error & { status?: number };
        throw err;
      }
      return 'recovered';
    }, 3);
    expect(result).toBe('recovered');
    expect(attempts).toBe(2);
  });

  it('retries on "fetch failed" errors', async () => {
    let attempts = 0;
    const result = await withNetworkRetry(async () => {
      attempts++;
      if (attempts === 1) throw new Error('fetch failed');
      return 'ok';
    }, 3);
    expect(result).toBe('ok');
  });

  it('retries on "network error" messages', async () => {
    let attempts = 0;
    const result = await withNetworkRetry(async () => {
      attempts++;
      if (attempts === 1) throw new Error('network error occurred');
      return 'ok';
    }, 3);
    expect(result).toBe('ok');
  });

  it('does NOT retry on a 404 error (status < 500)', async () => {
    const err = Object.assign(new Error('Not Found'), { status: 404 });
    const op = vi.fn(async () => { throw err; });
    await expect(withNetworkRetry(op, 3)).rejects.toThrow('Not Found');
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx status attached to the error', async () => {
    let attempts = 0;
    const result = await withNetworkRetry(async () => {
      attempts++;
      if (attempts === 1) {
        const err = Object.assign(new Error('Internal Server Error'), { status: 503 });
        throw err;
      }
      return 'ok';
    }, 3);
    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });

  it('does not retry non-Error throws', async () => {
    const op = vi.fn(async () => { throw 'string-error'; });
    await expect(withNetworkRetry(op, 3)).rejects.toBe('string-error');
    expect(op).toHaveBeenCalledTimes(1);
  });
});

// ── Regression: new safe defaults (2026-08-03) ───────────────────────────────

describe('withRetry — safe default (no retry without explicit policy)', () => {
  it('does NOT retry when shouldRetry is not provided (safe default)', async () => {
    const op = vi.fn(async () => { throw new Error('any-error'); });
    await expect(withRetry(op, { ...FAST, maxRetries: 5 })).rejects.toThrow();
    expect(op).toHaveBeenCalledTimes(1); // safe default: no retry
  });
});

describe('withNetworkRetry — AbortError guard', () => {
  it('does NOT retry on AbortError (page unload / navigation)', async () => {
    const abortErr = new DOMException('Page unload', 'AbortError');
    const op = vi.fn(async () => { throw abortErr; });
    await expect(withNetworkRetry(op, 5)).rejects.toThrow();
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on AbortError with generic name', async () => {
    const err = new Error('The operation was aborted.');
    err.name = 'AbortError';
    const op = vi.fn(async () => { throw err; });
    await expect(withNetworkRetry(op, 5)).rejects.toThrow();
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('still retries real network errors (TypeError, fetch failed)', async () => {
    let attempts = 0;
    const result = await withNetworkRetry(async () => {
      attempts++;
      if (attempts < 3) throw new TypeError('Failed to fetch');
      return 'recovered';
    }, 5);
    expect(result).toBe('recovered');
    expect(attempts).toBe(3);
  });
});
