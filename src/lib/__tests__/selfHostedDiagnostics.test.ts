/**
 * Tests for runSelfHostedDiagnostics() in selfHostedDiagnostics.ts.
 *
 * Five probes run in parallel: pingAuth, pingRest, pingRlsRead,
 * pingMcpHandshake, pingMcpToolsList.
 * - pingAuth / pingRest / pingMcpHandshake / pingMcpToolsList → mock global fetch
 * - pingRlsRead → mock supabase.from().select().limit()
 *
 * Each test sets up happy-path defaults for all 5 probes and overrides
 * the specific response under test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const mockFrom = vi.hoisted(() => vi.fn());
const mockGlobalFetch = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  SUPABASE_RESOLVED_URL: 'http://localhost:54321',
  SUPABASE_RESOLVED_ANON_KEY: 'test-anon-key',
  supabase: { from: mockFrom },
}));

// ── Import SUT AFTER mocks ────────────────────────────────────────────────────
import { runSelfHostedDiagnostics } from '../selfHostedDiagnostics';

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeResponse(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeDbChain(result: { data: unknown; error: unknown; status?: number }) {
  const chain = {
    select: () => chain,
    limit: () => Promise.resolve({ data: result.data, error: result.error, status: result.status ?? 200 }),
  };
  return chain;
}

// Default happy-path JSON-RPC bodies
const INIT_OK = JSON.stringify({
  jsonrpc: '2.0', id: 1,
  result: { serverInfo: { name: 'supabase-mcp', version: '1.0.0' }, capabilities: {} },
});
const TOOLS_OK = JSON.stringify({
  jsonrpc: '2.0', id: 2,
  result: { tools: [{ name: 'query' }, { name: 'insert' }, { name: 'update' }] },
});
const AUTH_OK = JSON.stringify({ external_email: false });
const REST_OK = JSON.stringify({ swagger: '2.0' });

// Configure all 5 probes to succeed by default
function setupAllOk() {
  mockGlobalFetch.mockImplementation((url: string, opts?: RequestInit) => {
    if (url.includes('/auth/v1/settings')) return Promise.resolve(makeResponse(200, AUTH_OK));
    if (url.includes('/rest/v1/')) return Promise.resolve(makeResponse(200, REST_OK));
    // MCP endpoint — route by method
    const body = JSON.parse((opts?.body as string) ?? '{}');
    if (body.method === 'initialize') return Promise.resolve(makeResponse(200, INIT_OK));
    if (body.method === 'tools/list') return Promise.resolve(makeResponse(200, TOOLS_OK));
    return Promise.resolve(makeResponse(404, 'not found'));
  });
  mockFrom.mockReturnValue(makeDbChain({ data: [{ id: 1 }], error: null }));
}

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mockGlobalFetch);
  setupAllOk();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── overall structure ─────────────────────────────────────────────────────────
describe('runSelfHostedDiagnostics — structure', () => {
  it('returns exactly 5 diagnostic results', async () => {
    const results = await runSelfHostedDiagnostics();
    expect(results).toHaveLength(5);
  });

  it('every result has step, status, message, and latencyMs fields', async () => {
    const results = await runSelfHostedDiagnostics();
    for (const r of results) {
      expect(typeof r.step).toBe('string');
      expect(['ok', 'fail', 'warn']).toContain(r.status);
      expect(typeof r.message).toBe('string');
      expect(typeof r.latencyMs).toBe('number');
      expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('includes Auth, REST, RLS, MCP-init, and MCP-tools steps', async () => {
    const results = await runSelfHostedDiagnostics();
    const steps = results.map(r => r.step);
    expect(steps.some(s => s.includes('GoTrue') || s.includes('Auth'))).toBe(true);
    expect(steps.some(s => s.includes('PostgREST') || s.includes('REST'))).toBe(true);
    expect(steps.some(s => s.includes('RLS') || s.includes('Supabase'))).toBe(true);
    expect(steps.some(s => s.includes('initialize') || s.includes('MCP'))).toBe(true);
    expect(steps.some(s => s.includes('tools/list') || s.includes('tools'))).toBe(true);
  });
});

// ── pingAuth ──────────────────────────────────────────────────────────────────
describe('runSelfHostedDiagnostics — pingAuth', () => {
  it('status "ok" on HTTP 200', async () => {
    const results = await runSelfHostedDiagnostics();
    const r = results.find(x => x.step.includes('GoTrue') || x.step.includes('Auth'));
    expect(r?.status).toBe('ok');
  });

  it('status "fail" on HTTP 401', async () => {
    mockGlobalFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes('/auth/v1/settings')) return Promise.resolve(makeResponse(401, 'Unauthorized'));
      // keep other probes ok
      const body = JSON.parse((opts?.body as string) ?? '{}');
      if (body.method === 'initialize') return Promise.resolve(makeResponse(200, INIT_OK));
      if (body.method === 'tools/list') return Promise.resolve(makeResponse(200, TOOLS_OK));
      return Promise.resolve(makeResponse(200, REST_OK));
    });
    const results = await runSelfHostedDiagnostics();
    const r = results.find(x => x.step.includes('GoTrue') || x.step.includes('Auth'));
    expect(r?.status).toBe('fail');
    expect(r?.message).toContain('401');
  });

  it('status "fail" when fetch throws for auth', async () => {
    mockGlobalFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes('/auth/v1/settings')) return Promise.reject(new Error('network error'));
      const body = JSON.parse((opts?.body as string) ?? '{}');
      if (body.method === 'initialize') return Promise.resolve(makeResponse(200, INIT_OK));
      if (body.method === 'tools/list') return Promise.resolve(makeResponse(200, TOOLS_OK));
      return Promise.resolve(makeResponse(200, REST_OK));
    });
    const results = await runSelfHostedDiagnostics();
    const r = results.find(x => x.step.includes('GoTrue') || x.step.includes('Auth'));
    expect(r?.status).toBe('fail');
    expect(r?.message).toContain('network error');
  });
});

// ── pingRest ──────────────────────────────────────────────────────────────────
describe('runSelfHostedDiagnostics — pingRest', () => {
  it('status "ok" on HTTP 200', async () => {
    const results = await runSelfHostedDiagnostics();
    const r = results.find(x => x.step.includes('PostgREST') || x.step.includes('REST'));
    expect(r?.status).toBe('ok');
  });

  it('status "fail" on HTTP 403', async () => {
    mockGlobalFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes('/rest/v1/')) return Promise.resolve(makeResponse(403, 'Forbidden'));
      if (url.includes('/auth/v1/')) return Promise.resolve(makeResponse(200, AUTH_OK));
      const body = JSON.parse((opts?.body as string) ?? '{}');
      if (body.method === 'initialize') return Promise.resolve(makeResponse(200, INIT_OK));
      if (body.method === 'tools/list') return Promise.resolve(makeResponse(200, TOOLS_OK));
      return Promise.resolve(makeResponse(404, ''));
    });
    const results = await runSelfHostedDiagnostics();
    const r = results.find(x => x.step.includes('PostgREST') || x.step.includes('REST'));
    expect(r?.status).toBe('fail');
    expect(r?.message).toContain('403');
  });
});

// ── pingRlsRead ───────────────────────────────────────────────────────────────
describe('runSelfHostedDiagnostics — pingRlsRead', () => {
  it('status "ok" when supabase query succeeds', async () => {
    mockFrom.mockReturnValue(makeDbChain({ data: [{ id: 1 }], error: null }));
    const results = await runSelfHostedDiagnostics();
    const r = results.find(x => x.step.includes('RLS') || x.step.includes('Supabase'));
    expect(r?.status).toBe('ok');
  });

  it('status "fail" when supabase query returns error', async () => {
    mockFrom.mockReturnValue(
      makeDbChain({ data: null, error: { message: 'permission denied' }, status: 403 })
    );
    const results = await runSelfHostedDiagnostics();
    const r = results.find(x => x.step.includes('RLS') || x.step.includes('Supabase'));
    expect(r?.status).toBe('fail');
    expect(r?.message).toContain('permission denied');
  });

  it('queries global_settings table', async () => {
    await runSelfHostedDiagnostics();
    expect(mockFrom).toHaveBeenCalledWith('global_settings');
  });
});

// ── pingMcpHandshake ──────────────────────────────────────────────────────────
describe('runSelfHostedDiagnostics — pingMcpHandshake', () => {
  it('status "ok" when JSON-RPC initialize returns result', async () => {
    const results = await runSelfHostedDiagnostics();
    const r = results.find(x => x.step.includes('initialize') || (x.step.includes('MCP') && !x.step.includes('tools')));
    expect(r?.status).toBe('ok');
  });

  it('includes serverInfo name in message on success', async () => {
    const results = await runSelfHostedDiagnostics();
    const r = results.find(x => x.step.includes('initialize') || (x.step.includes('MCP') && !x.step.includes('tools')));
    expect(r?.message).toContain('supabase-mcp');
  });

  it('status "fail" when JSON-RPC returns error', async () => {
    mockGlobalFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes('/auth/v1/')) return Promise.resolve(makeResponse(200, AUTH_OK));
      if (url.includes('/rest/v1/')) return Promise.resolve(makeResponse(200, REST_OK));
      const body = JSON.parse((opts?.body as string) ?? '{}');
      if (body.method === 'initialize') {
        return Promise.resolve(makeResponse(200, JSON.stringify({
          jsonrpc: '2.0', id: 1, error: { message: 'method not found' }
        })));
      }
      if (body.method === 'tools/list') return Promise.resolve(makeResponse(200, TOOLS_OK));
      return Promise.resolve(makeResponse(404, ''));
    });
    const results = await runSelfHostedDiagnostics();
    const r = results.find(x => x.step.includes('initialize') || (x.step.includes('MCP') && !x.step.includes('tools')));
    expect(r?.status).toBe('fail');
    expect(r?.message).toContain('method not found');
  });

  it('status "fail" when MCP fetch returns non-200', async () => {
    mockGlobalFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes('/auth/v1/')) return Promise.resolve(makeResponse(200, AUTH_OK));
      if (url.includes('/rest/v1/')) return Promise.resolve(makeResponse(200, REST_OK));
      const body = JSON.parse((opts?.body as string) ?? '{}');
      if (body.method === 'initialize') return Promise.resolve(makeResponse(500, 'server error'));
      if (body.method === 'tools/list') return Promise.resolve(makeResponse(200, TOOLS_OK));
      return Promise.resolve(makeResponse(404, ''));
    });
    const results = await runSelfHostedDiagnostics();
    const r = results.find(x => x.step.includes('initialize') || (x.step.includes('MCP') && !x.step.includes('tools')));
    expect(r?.status).toBe('fail');
    expect(r?.message).toContain('500');
  });

  it('status "fail" when response is non-JSON', async () => {
    mockGlobalFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes('/auth/v1/')) return Promise.resolve(makeResponse(200, AUTH_OK));
      if (url.includes('/rest/v1/')) return Promise.resolve(makeResponse(200, REST_OK));
      const body = JSON.parse((opts?.body as string) ?? '{}');
      if (body.method === 'initialize') return Promise.resolve(makeResponse(200, 'not-json'));
      if (body.method === 'tools/list') return Promise.resolve(makeResponse(200, TOOLS_OK));
      return Promise.resolve(makeResponse(404, ''));
    });
    const results = await runSelfHostedDiagnostics();
    const r = results.find(x => x.step.includes('initialize') || (x.step.includes('MCP') && !x.step.includes('tools')));
    expect(r?.status).toBe('fail');
  });
});

// ── pingMcpToolsList ──────────────────────────────────────────────────────────
describe('runSelfHostedDiagnostics — pingMcpToolsList', () => {
  it('status "ok" when tools/list returns tools array', async () => {
    const results = await runSelfHostedDiagnostics();
    const r = results.find(x => x.step.includes('tools/list') || (x.step.includes('MCP') && x.step.includes('tools')));
    expect(r?.status).toBe('ok');
  });

  it('message includes tool count', async () => {
    const results = await runSelfHostedDiagnostics();
    const r = results.find(x => x.step.includes('tools/list') || (x.step.includes('MCP') && x.step.includes('tools')));
    expect(r?.message).toMatch(/\d+\s+tools/i);
  });

  it('status "fail" when tools/list JSON-RPC returns error', async () => {
    mockGlobalFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (url.includes('/auth/v1/')) return Promise.resolve(makeResponse(200, AUTH_OK));
      if (url.includes('/rest/v1/')) return Promise.resolve(makeResponse(200, REST_OK));
      const body = JSON.parse((opts?.body as string) ?? '{}');
      if (body.method === 'initialize') return Promise.resolve(makeResponse(200, INIT_OK));
      if (body.method === 'tools/list') {
        return Promise.resolve(makeResponse(200, JSON.stringify({
          jsonrpc: '2.0', id: 2, error: { message: 'not implemented' }
        })));
      }
      return Promise.resolve(makeResponse(404, ''));
    });
    const results = await runSelfHostedDiagnostics();
    const r = results.find(x => x.step.includes('tools/list') || (x.step.includes('MCP') && x.step.includes('tools')));
    expect(r?.status).toBe('fail');
    expect(r?.message).toContain('not implemented');
  });
});
