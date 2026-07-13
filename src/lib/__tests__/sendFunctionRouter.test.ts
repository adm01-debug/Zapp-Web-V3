import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Supabase mock ─────────────────────────────────────────────────────────────
// maybeSingle is the only async leaf; we control return values per-test.
const mockMaybySingle = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: mockMaybySingle }),
      }),
    }),
  },
}));

import { resolveSendFunction, clearSendFunctionCache } from '../sendFunctionRouter';

// ── helpers ───────────────────────────────────────────────────────────────────

function resolvedWith(data: unknown, error: unknown = null) {
  return Promise.resolve({ data, error });
}

// ── setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  mockMaybySingle.mockReset();
  clearSendFunctionCache();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── falsy instanceName — no DB call ──────────────────────────────────────────

describe('resolveSendFunction — falsy instanceName', () => {
  it('returns evolution-api for null', async () => {
    expect(await resolveSendFunction(null)).toBe('evolution-api');
    expect(mockMaybySingle).not.toHaveBeenCalled();
  });

  it('returns evolution-api for undefined', async () => {
    expect(await resolveSendFunction(undefined)).toBe('evolution-api');
    expect(mockMaybySingle).not.toHaveBeenCalled();
  });

  it('returns evolution-api for empty string', async () => {
    expect(await resolveSendFunction('')).toBe('evolution-api');
    expect(mockMaybySingle).not.toHaveBeenCalled();
  });
});

// ── api_type routing ─────────────────────────────────────────────────────────

describe('resolveSendFunction — api_type routing', () => {
  it('returns whatsapp-cloud-api when api_type is "official"', async () => {
    mockMaybySingle.mockReturnValueOnce(resolvedWith({ api_type: 'official', status: 'connected' }));
    expect(await resolveSendFunction('inst-1')).toBe('whatsapp-cloud-api');
  });

  it('returns evolution-api when api_type is "evolution"', async () => {
    mockMaybySingle.mockReturnValueOnce(resolvedWith({ api_type: 'evolution', status: 'connected' }));
    expect(await resolveSendFunction('inst-1')).toBe('evolution-api');
  });

  it('returns evolution-api when api_type is null', async () => {
    mockMaybySingle.mockReturnValueOnce(resolvedWith({ api_type: null, status: 'connected' }));
    expect(await resolveSendFunction('inst-1')).toBe('evolution-api');
  });

  it('returns evolution-api when data is null (row not found)', async () => {
    // both queries return null (no row, no error) → no match in either lookup
    mockMaybySingle
      .mockReturnValueOnce(resolvedWith(null))   // instance_name lookup
      .mockReturnValueOnce(resolvedWith(null));  // instance_id fallback
    expect(await resolveSendFunction('ghost-inst')).toBe('evolution-api');
  });
});

// ── second-query fallback (instance_id) ──────────────────────────────────────

describe('resolveSendFunction — instance_id fallback query', () => {
  it('falls through to instance_id query when instance_name returns null/null', async () => {
    mockMaybySingle
      .mockReturnValueOnce(resolvedWith(null))   // first query (instance_name) → miss
      .mockReturnValueOnce(resolvedWith({ api_type: 'official', status: 'connected' }));  // second query (instance_id) → hit
    expect(await resolveSendFunction('inst-by-id')).toBe('whatsapp-cloud-api');
    expect(mockMaybySingle).toHaveBeenCalledTimes(2);
  });

  it('only makes one DB call when instance_name resolves immediately', async () => {
    mockMaybySingle.mockReturnValueOnce(resolvedWith({ api_type: 'evolution', status: 'connected' }));
    await resolveSendFunction('inst-found-first');
    expect(mockMaybySingle).toHaveBeenCalledTimes(1);
  });
});

// ── error handling ────────────────────────────────────────────────────────────

describe('resolveSendFunction — error handling', () => {
  it('returns evolution-api on DB error (no cache stored)', async () => {
    mockMaybySingle.mockReturnValueOnce(resolvedWith(null, { message: 'DB error', code: '500' }));
    const result = await resolveSendFunction('inst-err');
    expect(result).toBe('evolution-api');
  });

  it('retries DB on next call after a DB error (no cache)', async () => {
    mockMaybySingle
      .mockReturnValueOnce(resolvedWith(null, { message: 'DB error' }))
      .mockReturnValueOnce(resolvedWith({ api_type: 'official' }));

    await resolveSendFunction('inst-retry');  // error → no cache
    const result = await resolveSendFunction('inst-retry');  // should retry DB
    expect(result).toBe('whatsapp-cloud-api');
    expect(mockMaybySingle).toHaveBeenCalledTimes(2);
  });

  it('returns evolution-api when supabase.from throws', async () => {
    mockMaybySingle.mockRejectedValueOnce(new Error('network failure'));
    expect(await resolveSendFunction('inst-throws')).toBe('evolution-api');
  });
});

// ── caching behaviour ─────────────────────────────────────────────────────────

describe('resolveSendFunction — in-memory cache', () => {
  it('caches result and skips DB on second call', async () => {
    mockMaybySingle.mockReturnValueOnce(resolvedWith({ api_type: 'official' }));
    await resolveSendFunction('inst-cached');
    const result = await resolveSendFunction('inst-cached');
    expect(result).toBe('whatsapp-cloud-api');
    expect(mockMaybySingle).toHaveBeenCalledTimes(1);
  });

  it('caches per instanceName (different names do not share cache)', async () => {
    mockMaybySingle
      .mockReturnValueOnce(resolvedWith({ api_type: 'official' }))
      .mockReturnValueOnce(resolvedWith({ api_type: 'evolution' }));

    const a = await resolveSendFunction('inst-A');
    const b = await resolveSendFunction('inst-B');
    expect(a).toBe('whatsapp-cloud-api');
    expect(b).toBe('evolution-api');
    expect(mockMaybySingle).toHaveBeenCalledTimes(2);
  });

  it('returns cached value within 60s TTL window', async () => {
    mockMaybySingle.mockReturnValueOnce(resolvedWith({ api_type: 'official' }));
    await resolveSendFunction('inst-ttl');

    // advance 59 seconds — still within TTL
    vi.advanceTimersByTime(59_000);
    const result = await resolveSendFunction('inst-ttl');
    expect(result).toBe('whatsapp-cloud-api');
    expect(mockMaybySingle).toHaveBeenCalledTimes(1);
  });

  it('re-fetches from DB after 60s TTL expires', async () => {
    mockMaybySingle
      .mockReturnValueOnce(resolvedWith({ api_type: 'official' }))
      .mockReturnValueOnce(resolvedWith({ api_type: 'evolution' }));

    await resolveSendFunction('inst-expire');

    // advance exactly beyond the 60s TTL
    vi.advanceTimersByTime(60_001);
    const result = await resolveSendFunction('inst-expire');
    expect(result).toBe('evolution-api');
    expect(mockMaybySingle).toHaveBeenCalledTimes(2);
  });
});

// ── clearSendFunctionCache ────────────────────────────────────────────────────

describe('clearSendFunctionCache', () => {
  it('forces a DB re-fetch after cache is cleared', async () => {
    mockMaybySingle
      .mockReturnValueOnce(resolvedWith({ api_type: 'official' }))
      .mockReturnValueOnce(resolvedWith({ api_type: 'evolution' }));

    await resolveSendFunction('inst-clear');  // populates cache
    clearSendFunctionCache();
    const result = await resolveSendFunction('inst-clear');  // should re-fetch
    expect(result).toBe('evolution-api');
    expect(mockMaybySingle).toHaveBeenCalledTimes(2);
  });

  it('clears all entries, not just one', async () => {
    mockMaybySingle
      .mockReturnValue(resolvedWith({ api_type: 'evolution' }));

    await resolveSendFunction('inst-x');
    await resolveSendFunction('inst-y');
    clearSendFunctionCache();
    await resolveSendFunction('inst-x');
    await resolveSendFunction('inst-y');
    // 2 initial fetches + 2 after clear = 4 total
    expect(mockMaybySingle).toHaveBeenCalledTimes(4);
  });
});
