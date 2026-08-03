/**
 * TEMPORARY smoke test — verifies ExternalDbProxyClient direct-Supabase
 * dispatch at runtime. Created for verification, deleted afterwards.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockRpc = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn());

function makeBuilder() {
  const calls: string[] = [];
  const chain: Record<string, unknown> = {
    select: vi.fn((cols?: string) => {
      calls.push(`select:${cols ?? '*'}`);
      return chain;
    }),
    eq: vi.fn((c: string) => {
      calls.push(`eq:${c}`);
      return chain;
    }),
    order: vi.fn((c: string) => {
      calls.push(`order:${c}`);
      return chain;
    }),
    limit: vi.fn((n: number) => {
      calls.push(`limit:${n}`);
      return chain;
    }),
    offset: vi.fn((n: number) => {
      calls.push(`offset:${n}`);
      return chain;
    }),
    update: vi.fn(() => {
      calls.push('update');
      return chain;
    }),
    match: vi.fn(() => {
      calls.push('match');
      return chain;
    }),
    then: (resolve: (v: unknown) => void) => resolve({ data: [{ id: 1 }], error: null }),
  };
  return { chain, calls };
}

vi.mock('@/integrations/supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: { rpc: mockRpc, from: mockFrom },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

import { evoApi } from '../proxy';

beforeEach(() => {
  mockRpc.mockReset();
  mockFrom.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('smoke — direct supabase dispatch', () => {
  it('rpc() calls supabase.rpc and returns { data, schema_unavailable }', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true }, error: null });
    const res = await evoApi.rpc<{ ok: boolean }>('rpc_pipeline_dashboard', { p: 1 });
    expect(mockRpc).toHaveBeenCalledWith('rpc_pipeline_dashboard', { p: 1 });
    expect(res).toEqual({ data: { ok: true }, schema_unavailable: false });
  });

  it('select() builds from→select→filters→order→limit→offset', async () => {
    const { chain, calls } = makeBuilder();
    mockFrom.mockReturnValue(chain);
    await evoApi.select({
      table: 'v_alerts_active',
      select: '*',
      filters: [{ column: 'acknowledged', operator: 'eq', value: false }],
      order: { column: 'created_at', ascending: false },
      limit: 100,
      offset: 10,
    });
    expect(mockFrom).toHaveBeenCalledWith('v_alerts_active');
    expect(calls).toEqual(['select:*', 'eq:acknowledged', 'order:created_at', 'limit:100', 'offset:10']);
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('update() builds from→update→match→select', async () => {
    const { calls } = makeBuilder();
    mockFrom.mockReturnValue(makeBuilder().chain);
    await evoApi.update({ table: 'alert_log', data: { acknowledged: true }, match: { id: 1 } });
    expect(calls).toEqual(['update', 'match', 'select:*']);
  });

  it('throws supabase error message', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'PGRST205 table not found' } });
    await expect(evoApi.rpc('fn_test_alert_channel', {})).rejects.toThrow('PGRST205 table not found');
  });

  it('retries once on transient PGRST106 then succeeds', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: null, error: { message: 'PGRST106 Invalid schema' } })
      .mockResolvedValueOnce({ data: 'recovered', error: null });
    const promise = evoApi.rpc<string>('fn');
    await vi.advanceTimersByTimeAsync(2100);
    await expect(promise).resolves.toEqual({ data: 'recovered', schema_unavailable: false });
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it('throws when supabase is not configured', async () => {
    vi.resetModules();
    vi.doMock('@/integrations/supabase/client', () => ({
      isSupabaseConfigured: false,
      supabase: { rpc: mockRpc, from: mockFrom },
    }));
    vi.doMock('@/lib/logger', () => ({
      getLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }),
    }));
    const { evoApi: unconfiguredApi } = await import('../proxy');
    await expect(unconfiguredApi.rpc('fn')).rejects.toThrow('Supabase not configured');
  });
});
