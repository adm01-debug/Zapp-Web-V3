/**
 * Tests for runEvolutionDiagnostics() in evolutionDiagnostics.ts.
 *
 * Verifies:
 * - Step 1 (external config): ok when isExternalConfigured=true, fail otherwise
 * - Step 2 (proxy): ok when callEvolutionApi succeeds, fail when proxyError present,
 *   fail when callEvolutionApi throws
 * - Step 3 (API key): ok with instances array, warn with unexpected format
 * - Step 4 (direct DB): only runs when isExternalConfigured=true; ok/fail
 * - Step 4 catch: fail result when extSupabase.from() throws
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const mockCallEvolutionApi = vi.hoisted(() => vi.fn());
const mockGetExternal = vi.hoisted(() => vi.fn());
const mockIsExternal = vi.hoisted(() => ({ value: true }));

vi.mock('@/features/connections/data-access/whatsappConnectionRepository', () => ({
  whatsappConnectionRepository: { callEvolutionApi: mockCallEvolutionApi },
}));

vi.mock('@/integrations/supabase/externalClient', () => ({
  get isExternalConfigured() { return mockIsExternal.value; },
  getExternalSupabase: mockGetExternal,
}));

// ── Import SUT AFTER mocks ────────────────────────────────────────────────────
import { runEvolutionDiagnostics } from '../evolutionDiagnostics';

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeDbChain(result: { error: unknown }) {
  const chain = {
    select: () => chain,
    limit: () => Promise.resolve(result),
  };
  return { from: () => chain };
}

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  mockIsExternal.value = true;
  mockCallEvolutionApi.mockResolvedValue({ data: [], error: null });
  mockGetExternal.mockReturnValue(makeDbChain({ error: null }));
});

// ── Step 1: external config ───────────────────────────────────────────────────
describe('runEvolutionDiagnostics — step 1: external config', () => {
  it('has step 1 status "ok" when isExternalConfigured is true', async () => {
    mockIsExternal.value = true;
    const results = await runEvolutionDiagnostics();
    expect(results[0].status).toBe('ok');
  });

  it('has step 1 status "fail" when isExternalConfigured is false', async () => {
    mockIsExternal.value = false;
    const results = await runEvolutionDiagnostics();
    expect(results[0].status).toBe('fail');
  });

  it('step 1 name matches "Configuração do Banco Externo"', async () => {
    const results = await runEvolutionDiagnostics();
    expect(results[0].step).toContain('Banco Externo');
  });
});

// ── Step 2: proxy ─────────────────────────────────────────────────────────────
describe('runEvolutionDiagnostics — step 2: proxy connectivity', () => {
  it('has step 2 status "ok" when callEvolutionApi succeeds', async () => {
    mockCallEvolutionApi.mockResolvedValue({ data: [], error: null });
    const results = await runEvolutionDiagnostics();
    const step2 = results.find(r => r.step.includes('Evolution Proxy'));
    expect(step2?.status).toBe('ok');
  });

  it('has step 2 status "fail" when callEvolutionApi returns proxyError', async () => {
    mockCallEvolutionApi.mockResolvedValue({
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
    mockCallEvolutionApi.mockResolvedValue({ data: null, error: proxyError });
    const results = await runEvolutionDiagnostics();
    const step2 = results.find(r => r.step.includes('Evolution Proxy'));
    expect(step2?.details).toEqual(proxyError);
  });

  it('step 2 details contains proxy data on success', async () => {
    const data = [{ id: '1' }];
    mockCallEvolutionApi.mockResolvedValue({ data, error: null });
    const results = await runEvolutionDiagnostics();
    const step2 = results.find(r => r.step.includes('Evolution Proxy'));
    expect(step2?.details).toEqual(data);
  });

  it('uses action "list-instances" for the callEvolutionApi call', async () => {
    await runEvolutionDiagnostics();
    expect(mockCallEvolutionApi).toHaveBeenCalledWith({ action: 'list-instances' });
  });

  it('falls through to catch step when callEvolutionApi throws', async () => {
    mockCallEvolutionApi.mockRejectedValue(new Error('network down'));
    const results = await runEvolutionDiagnostics();
    const catchStep = results.find(r => r.step.includes('Conectividade'));
    expect(catchStep?.status).toBe('fail');
    expect(catchStep?.message).toContain('network down');
  });
});

// ── Step 3: API key / instances ───────────────────────────────────────────────
describe('runEvolutionDiagnostics — step 3: API key permissions', () => {
  it('status "ok" when data is a direct array of instances', async () => {
    mockCallEvolutionApi.mockResolvedValue({
      data: [{ id: '1' }, { id: '2' }],
      error: null,
    });
    const results = await runEvolutionDiagnostics();
    const step3 = results.find(r => r.step.includes('Global API Key'));
    expect(step3?.status).toBe('ok');
    expect(step3?.details).toEqual({ count: 2 });
  });

  it('status "ok" when data has .instances array', async () => {
    mockCallEvolutionApi.mockResolvedValue({
      data: { instances: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
      error: null,
    });
    const results = await runEvolutionDiagnostics();
    const step3 = results.find(r => r.step.includes('Global API Key'));
    expect(step3?.status).toBe('ok');
    expect(step3?.details).toEqual({ count: 3 });
  });

  it('status "warn" when response format is unexpected (object without instances)', async () => {
    mockCallEvolutionApi.mockResolvedValue({
      data: { unexpected: true },
      error: null,
    });
    const results = await runEvolutionDiagnostics();
    const step3 = results.find(r => r.step.includes('Global API Key'));
    expect(step3?.status).toBe('warn');
  });

  it('step 3 is absent when step 2 fails (proxyError)', async () => {
    mockCallEvolutionApi.mockResolvedValue({
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
  it('status "ok" when extSupabase query succeeds', async () => {
    mockIsExternal.value = true;
    mockGetExternal.mockReturnValue(makeDbChain({ error: null }));
    const results = await runEvolutionDiagnostics();
    const step4 = results.find(r => r.step.includes('Database Direct'));
    expect(step4?.status).toBe('ok');
  });

  it('status "fail" when extSupabase query returns error', async () => {
    mockIsExternal.value = true;
    mockGetExternal.mockReturnValue(makeDbChain({ error: { message: 'permission denied' } }));
    const results = await runEvolutionDiagnostics();
    const step4 = results.find(r => r.step.includes('Database Direct'));
    expect(step4?.status).toBe('fail');
    expect(step4?.message).toContain('permission denied');
  });

  it('step 4 is skipped when isExternalConfigured is false', async () => {
    mockIsExternal.value = false;
    const results = await runEvolutionDiagnostics();
    const step4 = results.find(r => r.step.includes('Database Direct'));
    expect(step4).toBeUndefined();
  });

  it('step 4 is skipped when getExternalSupabase returns null', async () => {
    mockIsExternal.value = true;
    mockGetExternal.mockReturnValue(null);
    const results = await runEvolutionDiagnostics();
    const step4 = results.find(r => r.step.includes('Database Direct'));
    expect(step4).toBeUndefined();
  });

  it('status "fail" when extSupabase.from() throws', async () => {
    mockIsExternal.value = true;
    mockGetExternal.mockReturnValue({
      from: () => { throw new Error('client crashed'); },
    });
    const results = await runEvolutionDiagnostics();
    const step4 = results.find(r => r.step.includes('Database Direct'));
    expect(step4?.status).toBe('fail');
    expect(step4?.message).toContain('client crashed');
  });
});

// ── overall structure ─────────────────────────────────────────────────────────
describe('runEvolutionDiagnostics — overall result structure', () => {
  it('returns at least 3 results on happy path (config + proxy + api-key + db)', async () => {
    mockCallEvolutionApi.mockResolvedValue({ data: [{ id: '1' }], error: null });
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
