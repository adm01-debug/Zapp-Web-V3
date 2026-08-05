import { describe, it, expect, vi } from 'vitest';
import { withRetry, withNetworkRetry, isIntentionalAbort } from '@/lib/retry';

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
      withRetry(
        async () => {
          throw new Error('permanent');
        },
        { ...FAST, ...RETRY_ALL, maxRetries: 2 }
      )
    ).rejects.toThrow('permanent');
  });

  it('calls the operation maxRetries+1 times when all fail', async () => {
    const op = vi.fn(async () => {
      throw new Error('fail');
    });
    await expect(withRetry(op, { ...FAST, ...RETRY_ALL, maxRetries: 2 })).rejects.toThrow();
    expect(op).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('calls onRetry maxRetries times when all attempts fail', async () => {
    const onRetry = vi.fn();
    await expect(
      withRetry(
        async () => {
          throw new Error('fail');
        },
        { ...FAST, ...RETRY_ALL, maxRetries: 3, onRetry }
      )
    ).rejects.toThrow();
    expect(onRetry).toHaveBeenCalledTimes(3);
  });
});

// ── withRetry — backoff timing (fake timers) ─────────────────────────────────

describe('withRetry — backoff timing (fake timers)', () => {
  it('waits baseDelayMs * 2^(attempt-1) between retries (exponential backoff)', async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0); // remove jitter
    try {
      let attempts = 0;
      const promise = withRetry(
        async () => {
          attempts++;
          if (attempts < 3) throw new Error('transient');
          return 'ok';
        },
        { baseDelayMs: 100, maxDelayMs: 10_000, maxRetries: 5, ...RETRY_ALL }
      );

      await vi.advanceTimersByTimeAsync(0); // flush microtasks: attempt 1 fails, backoff timer scheduled
      expect(attempts).toBe(1);

      // 1st backoff: 100 * 2^0 = 100ms
      await vi.advanceTimersByTimeAsync(99);
      expect(attempts).toBe(1); // timer not fired yet
      await vi.advanceTimersByTimeAsync(1);
      expect(attempts).toBe(2); // retry fired exactly at 100ms

      // 2nd backoff: 100 * 2^1 = 200ms
      await vi.advanceTimersByTimeAsync(199);
      expect(attempts).toBe(2); // timer not fired yet
      await vi.advanceTimersByTimeAsync(1);
      expect(attempts).toBe(3); // retry fired exactly at 200ms

      await expect(promise).resolves.toBe('ok');
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('caps the backoff delay at maxDelayMs', async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      let attempts = 0;
      const promise = withRetry(
        async () => {
          attempts++;
          if (attempts < 3) throw new Error('transient');
          return 'ok';
        },
        { baseDelayMs: 100, maxDelayMs: 150, maxRetries: 5, ...RETRY_ALL }
      );

      await vi.advanceTimersByTimeAsync(0);
      expect(attempts).toBe(1);

      // 1st backoff: 100 * 2^0 = 100ms (below cap)
      await vi.advanceTimersByTimeAsync(100);
      expect(attempts).toBe(2);

      // 2nd backoff would be 200ms but is capped at 150ms
      await vi.advanceTimersByTimeAsync(149);
      expect(attempts).toBe(2); // still waiting
      await vi.advanceTimersByTimeAsync(1);
      expect(attempts).toBe(3);

      await expect(promise).resolves.toBe('ok');
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});

// ── withRetry — shouldRetry guard ─────────────────────────────────────────────

describe('withRetry — shouldRetry guard', () => {
  it('does not retry when shouldRetry returns false', async () => {
    const op = vi.fn(async () => {
      throw new Error('permanent');
    });
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
        shouldRetry: (err) => err instanceof Error && err.message.includes('ECONNRESET'),
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
        shouldRetry: (err) => err instanceof Error && err.message === 'transient',
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
    const op = vi.fn(async () => {
      throw err;
    });
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
    const op = vi.fn(async () => {
      throw 'string-error';
    });
    await expect(withNetworkRetry(op, 3)).rejects.toBe('string-error');
    expect(op).toHaveBeenCalledTimes(1);
  });
});

// ── Regression: new safe defaults (2026-08-03) ───────────────────────────────

describe('withRetry — safe default (no retry without explicit policy)', () => {
  it('does NOT retry when shouldRetry is not provided (safe default)', async () => {
    const op = vi.fn(async () => {
      throw new Error('any-error');
    });
    await expect(withRetry(op, { ...FAST, maxRetries: 5 })).rejects.toThrow();
    expect(op).toHaveBeenCalledTimes(1); // safe default: no retry
  });
});

describe('withNetworkRetry — AbortError guard', () => {
  it('does NOT retry on AbortError (page unload / navigation)', async () => {
    const abortErr = new DOMException('Page unload', 'AbortError');
    const op = vi.fn(async () => {
      throw abortErr;
    });
    await expect(withNetworkRetry(op, 5)).rejects.toThrow();
    expect(op).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on AbortError with generic name', async () => {
    const err = new Error('The operation was aborted.');
    err.name = 'AbortError';
    const op = vi.fn(async () => {
      throw err;
    });
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

// ── Regression: no false ERROR on intentional abort (2026-08-05) ─────────────
// Bug #5: production showed "[RetryUtil] All 2 retries exhausted AbortError:
// Page unload" even when ZERO retries happened (attempt=0, shouldRetry=false).
// Intentional aborts must be debug-level only; log.error is reserved for
// genuinely exhausted retries.

describe('withRetry — intentional abort (no false ERROR)', () => {
  it('AbortError with default shouldRetry → operation called 1x, console.error NOT called', async () => {
    const abortErr = new DOMException('Page unload', 'AbortError');
    const op = vi.fn(async () => {
      throw abortErr;
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    try {
      await expect(withRetry(op, { ...FAST, maxRetries: 3 })).rejects.toBe(abortErr);
      expect(op).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();
      // debug-level log is emitted instead of ERROR
      expect(debugSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
      debugSpy.mockRestore();
    }
  });

  it('AbortError with shouldRetry: () => true → still 1x (abort guard has precedence)', async () => {
    const abortErr = new DOMException('Page unload', 'AbortError');
    const op = vi.fn(async () => {
      throw abortErr;
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(withRetry(op, { ...FAST, ...RETRY_ALL, maxRetries: 3 })).rejects.toBe(abortErr);
      expect(op).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('TypeError("Failed to fetch") via withNetworkRetry → 3 calls, resolves on 3rd', async () => {
    const op = vi.fn(async () => {
      if (op.mock.calls.length < 3) throw new TypeError('Failed to fetch');
      return 'recovered';
    });
    const result = await withNetworkRetry(op, 3);
    expect(result).toBe('recovered');
    expect(op).toHaveBeenCalledTimes(3);
  });

  it('real non-retryable error → log.warn, NOT log.error', async () => {
    const err = new Error('permanent failure');
    const op = vi.fn(async () => {
      throw err;
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(
        withRetry(op, { ...FAST, maxRetries: 5, shouldRetry: () => false })
      ).rejects.toBe(err);
      expect(op).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      const warnMsg = String(warnSpy.mock.calls[0]?.[0] ?? '');
      expect(warnMsg).toContain('Not retryable');
      expect(warnMsg).toContain('aborting after 1 attempt');
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('retries genuinely exhausted → log.error emitted', async () => {
    const op = vi.fn(async () => {
      throw new Error('fail');
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(withRetry(op, { ...FAST, ...RETRY_ALL, maxRetries: 2 })).rejects.toThrow('fail');
      expect(op).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
      expect(errorSpy).toHaveBeenCalled();
      const errorMsg = String(errorSpy.mock.calls[0]?.[0] ?? '');
      expect(errorMsg).toContain('All 2 retries exhausted');
    } finally {
      errorSpy.mockRestore();
    }
  });
});

// ── isIntentionalAbort (unit) ────────────────────────────────────────────────

describe('isIntentionalAbort', () => {
  it('returns true for DOMException with name AbortError (page unload)', () => {
    expect(isIntentionalAbort(new DOMException('Page unload', 'AbortError'))).toBe(true);
  });

  it('returns true for Error with name AbortError', () => {
    const err = new Error('The operation was aborted.');
    err.name = 'AbortError';
    expect(isIntentionalAbort(err)).toBe(true);
  });

  it('returns false for regular errors and other DOMExceptions', () => {
    expect(isIntentionalAbort(new Error('network down'))).toBe(false);
    expect(isIntentionalAbort(new TypeError('Failed to fetch'))).toBe(false);
    expect(isIntentionalAbort(new DOMException('timeout', 'TimeoutError'))).toBe(false);
  });

  it('returns false for non-Error throws', () => {
    expect(isIntentionalAbort('string-error')).toBe(false);
    expect(isIntentionalAbort(null)).toBe(false);
    expect(isIntentionalAbort(undefined)).toBe(false);
    // Duck-typing is not enough: must be a real Error/DOMException instance
    expect(isIntentionalAbort({ name: 'AbortError' })).toBe(false);
  });
});
