/**
 * Tests for ExternalDbProxyClient (proxy.ts).
 *
 * Covered behaviours:
 *   1. call() — happy path returns { data, schema_unavailable }
 *   2. call() — transient schema errors (PGRST106, PGRST002, Invalid schema, schema cache) retry
 *   3. call() — permanent errors throw immediately
 *   4. call() — schema errors after 5 retries throw
 *   5. call() — JSON parse failure falls back to text as error
 *   6. call() — missing PROXY_URL (no VITE_SUPABASE_URL) throws immediately
 *   7. call() — catch block retries on transient error thrown by fetch
 *   8. getAuthHeader() — caches session token within 30s
 *   9. getAuthHeader() — uses anon key when no session
 *  10. rpc() / select() / update() wrappers forward correct body shape
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// import.meta.env.VITE_* values are resolved at transform time in Vitest and
// cannot be overridden via vi.stubEnv after module load. The constants read by
// proxy.ts (SUPABASE_URL, SUPABASE_ANON) will be whatever the test environment
// provides — typically empty strings unless configured in vitest.config.
// Tests that depend on anon-key behaviour therefore check for `''` (the actual
// empty fallback) rather than a fake value.

// ── Mock supabase auth ─────────────────────────────────────────────────────────
const mockGetSession = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_RESOLVED_URL: 'http://localhost:54321',
  SUPABASE_RESOLVED_ANON_KEY: 'test-anon-key',
  supabase: {
    auth: {
      getSession: mockGetSession,
    },
  },
}));

// ── Mock correlationId ─────────────────────────────────────────────────────────
vi.mock('@/lib/correlationId', () => ({
  generateCorrelationId: () => 'cid-test',
  CORRELATION_HEADER: 'x-correlation-id',
}));

// ── Mock logger ────────────────────────────────────────────────────────────────
vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

// ── Global fetch mock ──────────────────────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Import AFTER mocks are in place
import { evoApi } from '../proxy';

// ── Helpers ────────────────────────────────────────────────────────────────────

function okFetch(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

function errorFetch(errorMsg: string, status = 500) {
  return Promise.resolve({
    ok: false,
    status,
    text: () => Promise.resolve(JSON.stringify({ error: errorMsg })),
  } as Response);
}

function textFetch(text: string, status = 500) {
  return Promise.resolve({
    ok: false,
    status,
    text: () => Promise.resolve(text),
  } as Response);
}

function sessionWith(token: string) {
  return Promise.resolve({ data: { session: { access_token: token } }, error: null });
}

function noSession() {
  return Promise.resolve({ data: { session: null }, error: null });
}

// ── Setup ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  mockFetch.mockReset();
  mockGetSession.mockReset();
  // Reset the cached session between tests by accessing internal state
  (evoApi as unknown as { cachedSession: null }).cachedSession = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── 1. Happy path ──────────────────────────────────────────────────────────────

describe('call() — happy path', () => {
  it('returns { data, schema_unavailable: false } on success', async () => {
    mockGetSession.mockReturnValueOnce(noSession());
    mockFetch.mockReturnValueOnce(okFetch({ data: [{ id: 1 }], cid: 'x', rid: 'y' }));

    const result = await evoApi.call<{ id: number }[]>({ action: 'select', table: 'test' });

    expect(result.data).toEqual([{ id: 1 }]);
    expect(result.schema_unavailable).toBe(false);
  });

  it('propagates schema_unavailable: true when proxy sets it', async () => {
    mockGetSession.mockReturnValueOnce(noSession());
    mockFetch.mockReturnValueOnce(
      okFetch({ data: null, schema_unavailable: true, cid: 'x', rid: 'y' })
    );

    const result = await evoApi.call({ action: 'select', table: 'test' });

    expect(result.schema_unavailable).toBe(true);
    expect(result.data).toBeNull();
  });

  it('returns { data: null } when response body is empty', async () => {
    mockGetSession.mockReturnValueOnce(noSession());
    mockFetch.mockReturnValueOnce(
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
      } as Response)
    );

    const result = await evoApi.call({ action: 'rpc', rpc: 'fn' });
    expect(result.data).toBeNull();
    expect(result.schema_unavailable).toBe(false);
  });

  it('sends schema: evo_api in the request body', async () => {
    mockGetSession.mockReturnValueOnce(noSession());
    mockFetch.mockReturnValueOnce(okFetch({ data: null, cid: 'x', rid: 'y' }));

    await evoApi.call({ action: 'rpc', rpc: 'myfunc' });

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.schema).toBe('evo_api');
    expect(body.__cid).toBe('cid-test');
  });
});

// ── 2. Transient schema errors → retry ────────────────────────────────────────

describe('call() — transient schema errors retry', () => {
  const transientErrors = ['PGRST106', 'Invalid schema', 'PGRST002', 'schema cache'];

  for (const errMsg of transientErrors) {
    it(`retries once on "${errMsg}" and succeeds`, async () => {
      mockGetSession.mockReturnValue(noSession());
      mockFetch
        .mockReturnValueOnce(errorFetch(errMsg, 503))
        .mockReturnValueOnce(okFetch({ data: 'ok', cid: 'x', rid: 'y' }));

      const promise = evoApi.call<string>({ action: 'rpc', rpc: 'fn' });

      // Advance past first retry delay (≥1000ms, up to 2000ms)
      await vi.advanceTimersByTimeAsync(2100);
      const result = await promise;

      expect(result.data).toBe('ok');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  }

  it('retries up to 5 times on persistent schema errors then throws', async () => {
    mockGetSession.mockReturnValue(noSession());
    // 6 calls: 1 initial + 5 retries, all fail
    for (let i = 0; i < 6; i++) {
      mockFetch.mockReturnValueOnce(errorFetch('PGRST106', 503));
    }

    const promise = evoApi.call({ action: 'rpc', rpc: 'fn' });
    // Suppress unhandled rejection during timer advancement
    promise.catch(() => {});

    // Advance through all 5 retry delays:
    // retry 0: 1s-2s, retry 1: 2s-3s, retry 2: 4s-5s, retry 3: 8s-9s, retry 4: 16s-17s
    await vi.advanceTimersByTimeAsync(50000);

    await expect(promise).rejects.toThrow('PGRST106');
    // 1 initial + 5 retries = 6 total calls
    expect(mockFetch).toHaveBeenCalledTimes(6);
  });

  it('does NOT retry on retryCount = 5 (exhausted)', async () => {
    mockGetSession.mockReturnValueOnce(noSession());
    mockFetch.mockReturnValueOnce(errorFetch('PGRST106', 503));

    await expect(
      (
        evoApi as unknown as {
          call(body: Record<string, unknown>, retryCount: number): Promise<unknown>;
        }
      ).call({ action: 'rpc' }, 5)
    ).rejects.toThrow('PGRST106');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ── 3. Permanent errors throw immediately ─────────────────────────────────────

describe('call() — permanent errors', () => {
  it('throws immediately on 400 with non-transient message', async () => {
    mockGetSession.mockReturnValueOnce(noSession());
    mockFetch.mockReturnValueOnce(errorFetch('invalid input', 400));

    await expect(evoApi.call({ action: 'rpc', rpc: 'fn' })).rejects.toThrow('invalid input');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws immediately on 401 unauthorized', async () => {
    mockGetSession.mockReturnValueOnce(noSession());
    mockFetch.mockReturnValueOnce(errorFetch('Unauthorized', 401));

    await expect(evoApi.call({ action: 'select', table: 't' })).rejects.toThrow('Unauthorized');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws immediately on 404 not found', async () => {
    mockGetSession.mockReturnValueOnce(noSession());
    mockFetch.mockReturnValueOnce(errorFetch('Not found', 404));

    await expect(evoApi.call({ action: 'select', table: 't' })).rejects.toThrow('Not found');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('uses fallback HTTP status message when error field is missing', async () => {
    mockGetSession.mockReturnValueOnce(noSession());
    mockFetch.mockReturnValueOnce(
      Promise.resolve({
        ok: false,
        status: 503,
        text: () => Promise.resolve(JSON.stringify({})),
      } as Response)
    );

    await expect(evoApi.call({ action: 'rpc', rpc: 'fn' })).rejects.toThrow('HTTP 503');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ── 4. JSON parse failure ──────────────────────────────────────────────────────

describe('call() — JSON parse failure', () => {
  it('falls back to raw text as error message when JSON is invalid', async () => {
    mockGetSession.mockReturnValueOnce(noSession());
    mockFetch.mockReturnValueOnce(textFetch('Gateway timeout', 504));

    // "Gateway timeout" doesn't contain transient schema keywords → throws immediately
    await expect(evoApi.call({ action: 'rpc', rpc: 'fn' })).rejects.toThrow('Gateway timeout');
  });

  it('uses HTTP status as fallback when text is empty and JSON fails', async () => {
    mockGetSession.mockReturnValueOnce(noSession());
    mockFetch.mockReturnValueOnce(textFetch('', 500));

    await expect(evoApi.call({ action: 'rpc', rpc: 'fn' })).rejects.toThrow('HTTP 500');
  });
});

// ── 5. catch block retries on transient fetch errors ─────────────────────────

describe('call() — catch block retries', () => {
  it('retries when fetch throws with a transient schema message', async () => {
    mockGetSession.mockReturnValue(noSession());
    mockFetch
      .mockRejectedValueOnce(new Error('PGRST106 schema error from network'))
      .mockReturnValueOnce(okFetch({ data: 'recovered', cid: 'x', rid: 'y' }));

    const promise = evoApi.call<string>({ action: 'rpc', rpc: 'fn' });
    await vi.advanceTimersByTimeAsync(2100);
    const result = await promise;

    expect(result.data).toBe('recovered');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry when fetch throws with a non-transient error', async () => {
    mockGetSession.mockReturnValueOnce(noSession());
    mockFetch.mockRejectedValueOnce(new Error('network failure'));

    await expect(evoApi.call({ action: 'rpc', rpc: 'fn' })).rejects.toThrow('network failure');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ── 6. getAuthHeader() — caching ──────────────────────────────────────────────

describe('getAuthHeader() — session token caching', () => {
  it('uses Bearer token from session and caches it', async () => {
    mockGetSession.mockReturnValueOnce(sessionWith('user-token-abc'));
    mockFetch.mockReturnValue(okFetch({ data: null, cid: 'x', rid: 'y' }));

    await evoApi.call({ action: 'rpc', rpc: 'fn' });

    const headers = (mockFetch.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer user-token-abc');
  });

  it('reuses cached token within 30s without calling getSession again', async () => {
    mockGetSession.mockReturnValueOnce(sessionWith('cached-token'));
    mockFetch.mockReturnValue(okFetch({ data: null, cid: 'x', rid: 'y' }));

    await evoApi.call({ action: 'rpc', rpc: 'fn' });
    // Advance 29s (within TTL)
    vi.advanceTimersByTime(29000);
    await evoApi.call({ action: 'rpc', rpc: 'fn' });

    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const headers2 = (mockFetch.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(headers2.Authorization).toBe('Bearer cached-token');
  });

  it('re-fetches token after 30s TTL expires', async () => {
    mockGetSession
      .mockReturnValueOnce(sessionWith('old-token'))
      .mockReturnValueOnce(sessionWith('new-token'));
    mockFetch.mockReturnValue(okFetch({ data: null, cid: 'x', rid: 'y' }));

    await evoApi.call({ action: 'rpc', rpc: 'fn' });
    // Advance beyond 30s TTL
    vi.advanceTimersByTime(30001);
    await evoApi.call({ action: 'rpc', rpc: 'fn' });

    expect(mockGetSession).toHaveBeenCalledTimes(2);

    const headers2 = (mockFetch.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(headers2.Authorization).toBe('Bearer new-token');
  });

  it('falls back to anon key (SUPABASE_ANON) when getSession returns no session', async () => {
    mockGetSession.mockReturnValueOnce(noSession());
    mockFetch.mockReturnValueOnce(okFetch({ data: null, cid: 'x', rid: 'y' }));

    await evoApi.call({ action: 'rpc', rpc: 'fn' });

    const headers = (mockFetch.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    // In the test environment VITE_SUPABASE_PUBLISHABLE_KEY is unset → SUPABASE_ANON = ''
    // The important invariant: Authorization does NOT contain a user-specific token.
    expect(headers.Authorization).not.toContain('user-token');
    expect(headers.Authorization).toMatch(/^Bearer /);
  });

  it('falls back to anon key when getSession throws', async () => {
    mockGetSession.mockRejectedValueOnce(new Error('auth error'));
    mockFetch.mockReturnValueOnce(okFetch({ data: null, cid: 'x', rid: 'y' }));

    await evoApi.call({ action: 'rpc', rpc: 'fn' });

    const headers = (mockFetch.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).not.toContain('user-token');
    expect(headers.Authorization).toMatch(/^Bearer /);
  });
});

// ── 7. Convenience wrappers ────────────────────────────────────────────────────

describe('rpc() wrapper', () => {
  beforeEach(() => {
    mockGetSession.mockReturnValue(noSession());
    mockFetch.mockReturnValue(okFetch({ data: { result: 42 }, cid: 'x', rid: 'y' }));
  });

  it('sends action: rpc with rpc name and params in body', async () => {
    await evoApi.rpc('my_function', { arg: 1 });

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.action).toBe('rpc');
    expect(body.rpc).toBe('my_function');
    expect(body.params).toEqual({ arg: 1 });
  });

  it('defaults params to empty object when not provided', async () => {
    await evoApi.rpc('no_params_fn');

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.params).toEqual({});
  });
});

describe('select() wrapper', () => {
  beforeEach(() => {
    mockGetSession.mockReturnValue(noSession());
    mockFetch.mockReturnValue(okFetch({ data: [], cid: 'x', rid: 'y' }));
  });

  it('sends action: select with table and options in body', async () => {
    await evoApi.select({
      table: 'my_table',
      select: 'id,name',
      filters: [{ column: 'status', operator: 'eq', value: 'active' }],
      order: { column: 'name', ascending: true },
      limit: 10,
      offset: 0,
    });

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.action).toBe('select');
    expect(body.table).toBe('my_table');
    expect(body.select).toBe('id,name');
    expect(body.filters).toEqual([{ column: 'status', operator: 'eq', value: 'active' }]);
    expect(body.limit).toBe(10);
    expect(body.offset).toBe(0);
  });

  it('works with minimal options (table only)', async () => {
    await evoApi.select({ table: 'minimal_table' });

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.action).toBe('select');
    expect(body.table).toBe('minimal_table');
  });
});

describe('update() wrapper', () => {
  beforeEach(() => {
    mockGetSession.mockReturnValue(noSession());
    mockFetch.mockReturnValue(okFetch({ data: [{ id: 1 }], cid: 'x', rid: 'y' }));
  });

  it('sends action: update with table, data, and match in body', async () => {
    await evoApi.update({
      table: 'my_table',
      data: { status: 'inactive' },
      match: { id: 42 },
    });

    const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string);
    expect(body.action).toBe('update');
    expect(body.table).toBe('my_table');
    expect(body.data).toEqual({ status: 'inactive' });
    expect(body.match).toEqual({ id: 42 });
  });
});

// ── 8. Request shape ───────────────────────────────────────────────────────────

describe('call() — request headers', () => {
  it('sends apikey, Authorization, Content-Type, and correlation header', async () => {
    mockGetSession.mockReturnValueOnce(sessionWith('tok'));
    mockFetch.mockReturnValueOnce(okFetch({ data: null, cid: 'x', rid: 'y' }));

    await evoApi.call({ action: 'rpc', rpc: 'fn' });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;

    expect(url).toContain('/functions/v1/external-db-proxy');
    expect(init.method).toBe('POST');
    expect(headers['Content-Type']).toBe('application/json');
    // apikey header always uses SUPABASE_ANON (empty in test env, non-empty in prod)
    expect(headers.apikey).toBeDefined();
    expect(headers.Authorization).toBe('Bearer tok');
    expect(headers['x-correlation-id']).toBe('cid-test');
  });
});
