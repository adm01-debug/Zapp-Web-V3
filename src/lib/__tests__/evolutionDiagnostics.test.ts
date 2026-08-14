/**
 * Tests for runEvolutionDiagnostics() in evolutionDiagnostics.ts.
 *
 * Verifies:
 * - Step 1 (external config): always ok (consolidated single-DB client)
 * - Step 2 (proxy): ok when callEvolutionApi succeeds, fail when proxyError present,
 *   fail when callEvolutionApi throws
 * - Step 3 (API key): ok with instances array, warn with unexpected format
 * - Step 4 (direct DB): always runs against the main supabase client; ok/fail
 * - Step 4 catch: fail result when supabase.from() throws
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const mockListInstances = vi.hoisted(() => vi.fn());
const mockSupabaseFrom = vi.hoisted(() => vi.fn());

// F3/F5 (2026-08-13/14): evolutionDiagnostics usa o whatsappAdapter (gateway).
vi.mock('@/lib/whatsappAdapter', () => ({
  listInstances: mockListInstances,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: mockSupabaseFrom },
}));

// ── Import SUT AFTER mocks ────────────────────────────────────────────────────
import { runEvolutionDiagnostics } from '../evolutionDiagnostics';

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeDbChain(result: { error: unknown }) {
  const chain = {
    select: () => chain,
    limit: () => Promise.resolve(result),
  };
  return chain;
}

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  mockListInstances.mockResolvedValue({ data: [], error: null });
  mockSupabaseFrom.mockReturnValue(makeDbChain({ error: null }));
});

// ── Step 1: external config ───────────────────────────────────────────────────
describe('runEvolutionDiagnostics — step 1: external config', () => {
  it('has step 1 status "ok" (cliente único consolidado)', async () => {
    const results = await runEvolutionDiagnostics();
    expect(results[0].status).toBe('ok');
  });

  it('step 1 name matches "Configuração do Banco Self-Hosted"', async () => {
    const results = await runEvolutionDiagnostics();
    expect(results[0].step).toContain('Self-Hosted');
  });
});

// ── Step 2: proxy ─────────────────────────────────────────────────────────────
describe('runEvolutionDiagnostics — step 2: proxy connectivity', () => {
  it('has step 2 status "ok" when callEvolutionApi succeeds', async () => {
    mockListInstances.mockResolvedValue({ data: [], error: null });
    const results = await runEvolutionDiagnostics();
    const step2 = results.find(r => r.step.includes('Evolution Proxy'));
    expect(step2?.status).toBe('ok');
  });

  it('has step 2 status "fail" when callEvolutionApi returns proxyError', async () => {
    mockListInstances.mockResolvedValue({
      data: null,
      error: { message: 'connection refused' },
    });
    const results = await runEvolutionDiagnostics();
    const step2 = results.find(r => r.step.includes('Evolution Proxy'));
    expect(step2?.status).toBe('fail');
    expect(step2?.message).toContain('connection refused');
  });

  it('includes proxyError object in details on failure', async () => {
    const proxyError = { message: 'timeout' };
    mockListInstances.mockResolvedValue({ data: null, error: proxyError });
    const results = await runEvolutionDiagnostics();
    const step2 = results.find(r => r.step.includes('Evolution Proxy'));
    expect(step2?.details).toEqual(proxyError);
  });

  it('step 2 details contains proxy data on success', async () => {
    const data = [{ id: '1' }];
    mockListInstances.mockResolvedValue({ data, error: null });
    const results = await runEvolutionDiagnostics();
    const step2 = results.find(r => r.step.includes('Evolution Proxy'));
    expect(step2?.details).toEqual(data);
  });

  it('uses action "list-instances" for the callEvolutionApi call', async () => {
    await runEvolutionDiagnostics();
    expect(mockListInstances).toHaveBeenCalledWith({ action: 'list-instances' });
  });

  it('falls through to catch step when callEvolutionApi throws', async () => {
    mockListInstances.mockRejectedValue(new Error('network down'));
    const results = await runEvolutionDiagnostics();
    const catchStep = results.find(r => r.step.includes('Conectividade'));
    expect(catchStep?.status).toBe('fail');
    expect(catchStep?.message).toContain('network down');
  });
});

// ── Step 3: API key / instances ───────────────────────────────────────────────
describe('runEvolutionDiagnostics — step 3: API key permissions', () => {
  it('status "ok" when data is a direct array of instances', async () => {
    mockListInstances.mockResolvedValue({
      data: [{ id: '1' }, { id: '2' }],
      error: null,
    });
    const results = await runEvolutionDiagnostics();
    const step3 = results.find(r => r.step.includes('Global API Key'));
    expect(step3?.status).toBe('ok');
    expect(step3?.details).toEqual({ count: 2 });
  });

  it('status "ok" when data has .instances array', async () => {
    mockListInstances.mockResolvedValue({
      data: { instances: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
      error: null,
    });
    const results = await runEvolutionDiagnostics();
    const step3 = results.find(r => r.step.includes('Global API Key'));
    expect(step3?.status).toBe('ok');
    expect(step3?.details).toEqual({ count: 3 });
  });

  it('status "warn" when response format is unexpected (object without instances)', async () => {
    mockListInstances.mockResolvedValue({
      data: { unexpected: true },
      error: null,
    });
    const results = await runEvolutionDiagnostics();
    const step3 = results.find(r => r.step.includes('Global API Key'));
    expect(step3?.status).toBe('warn');
  });

  it('step 3 is absent when step 2 fails (proxyError)', async () => {
    mockListInstances.mockResolvedValue({
      data: null,
      error: { message: 'fail' },
    });
    const results = await runEvolutionDiagnostics();
    const step3 = results.find(r => r.step.includes('Global API Key'));
    expect(step3).toBeUndefined();
  });
});

// ── Step 4: direct DB ─────────────────────────────────────────────────────────
describe('runEvolutionDiagnostics — step 4: direct database connection', () => {
  it('status "ok" when supabase query succeeds', async () => {
    mockSupabaseFrom.mockReturnValue(makeDbChain({ error: null }));
    const results = await runEvolutionDiagnostics();
    const step4 = results.find(r => r.step.includes('Database Direct'));
    expect(step4?.status).toBe('ok');
  });

  it('status "fail" when supabase query returns error', async () => {
    mockSupabaseFrom.mockReturnValue(makeDbChain({ error: { message: 'permission denied' } }));
    const results = await runEvolutionDiagnostics();
    const step4 = results.find(r => r.step.includes('Database Direct'));
    expect(step4?.status).toBe('fail');
    expect(step4?.message).toContain('permission denied');
  });

  it('queries the consolidated supabase client (schema zapp)', async () => {
    mockSupabaseFrom.mockReturnValue(makeDbChain({ error: null }));
    await runEvolutionDiagnostics();
    expect(mockSupabaseFrom).toHaveBeenCalledWith('contacts');
  });

  it('status "fail" when supabase.from() throws', async () => {
    mockSupabaseFrom.mockImplementation(() => { throw new Error('client crashed'); });
    const results = await runEvolutionDiagnostics();
    const step4 = results.find(r => r.step.includes('Database Direct'));
    expect(step4?.status).toBe('fail');
    expect(step4?.message).toContain('client crashed');
  });
});

// ── overall structure ─────────────────────────────────────────────────────────
describe('runEvolutionDiagnostics — overall result structure', () => {
  it('returns at least 3 results on happy path (config + proxy + api-key + db)', async () => {
    mockListInstances.mockResolvedValue({ data: [{ id: '1' }], error: null });
    const results = await runEvolutionDiagnostics();
    expect(results.length).toBeGreaterThanOrEqual(3);
  });

  it('every result has step, status, and message fields', async () => {
    const results = await runEvolutionDiagnostics();
    for (const r of results) {
      expect(typeof r.step).toBe('string');
      expect(['ok', 'fail', 'warn']).toContain(r.status);
      expect(typeof r.message).toBe('string');
    }
  });
});
