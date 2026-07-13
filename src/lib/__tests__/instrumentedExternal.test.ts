/**
 * Tests for timedRpc() in instrumentedExternal.ts.
 *
 * Verifies:
 * - correlationId is plumbed into the return value and telemetry event
 * - data / error from client.rpc() are returned correctly
 * - recordQueryEvent is called with the right shape on both success and error
 * - classifySeverity is called with hasError=false on clean success and true when rpc returns error
 * - catch block classifies TimeoutError (by name or message) as 'timeout', others as 'error', then re-throws
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const mockGenerateCid = vi.hoisted(() => vi.fn(() => 'test-cid-1'));
const mockRecordQueryEvent = vi.hoisted(() => vi.fn());
const mockClassifySeverity = vi.hoisted(() => vi.fn(() => 'ok' as const));
const mockRpc = vi.hoisted(() => vi.fn());
const mockGetExternal = vi.hoisted(() => vi.fn(() => ({ rpc: mockRpc })));

vi.mock('@/integrations/supabase/externalClient', () => ({
  getExternalSupabase: mockGetExternal,
}));
vi.mock('@/lib/clientTelemetry', () => ({
  recordQueryEvent: mockRecordQueryEvent,
  classifySeverity: mockClassifySeverity,
}));
vi.mock('@/lib/correlationId', () => ({
  generateCorrelationId: mockGenerateCid,
}));

// ── Import SUT AFTER mocks ────────────────────────────────────────────────────
import { timedRpc } from '../instrumentedExternal';

// ── Helpers ───────────────────────────────────────────────────────────────────
function rpcOk(data: unknown) {
  return Promise.resolve({ data, error: null });
}

function rpcErr(message: string) {
  return Promise.resolve({ data: null, error: { message } });
}

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  mockGetExternal.mockReturnValue({ rpc: mockRpc });
  mockClassifySeverity.mockReturnValue('ok');
  mockGenerateCid.mockReturnValue('test-cid-1');
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── correlationId ─────────────────────────────────────────────────────────────
describe('timedRpc — correlationId', () => {
  it('includes the generated correlationId in the return value', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    const result = await timedRpc('my_rpc');
    expect(result.correlationId).toBe('test-cid-1');
  });

  it('forwards correlationId to recordQueryEvent', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await timedRpc('my_rpc');
    expect(mockRecordQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: 'test-cid-1' })
    );
  });
});

// ── data / error pass-through ─────────────────────────────────────────────────
describe('timedRpc — data and error pass-through', () => {
  it('returns data from rpc', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 1 }], error: null });
    const result = await timedRpc('fn');
    expect(result.data).toEqual([{ id: 1 }]);
  });

  it('returns error from rpc', async () => {
    const err = { message: 'constraint violation' };
    mockRpc.mockResolvedValue({ data: null, error: err });
    const result = await timedRpc('fn');
    expect(result.error).toEqual(err);
  });

  it('returns data: null when rpc data is null', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect((await timedRpc('fn')).data).toBeNull();
  });

  it('returns data: null when rpc data is undefined', async () => {
    mockRpc.mockResolvedValue({ data: undefined, error: null });
    expect((await timedRpc('fn')).data).toBeNull();
  });

  it('passes rpcName to client.rpc', async () => {
    mockRpc.mockResolvedValue(rpcOk(null));
    await timedRpc('my_special_rpc');
    expect(mockRpc).toHaveBeenCalledWith('my_special_rpc', expect.anything());
  });

  it('passes params to client.rpc', async () => {
    mockRpc.mockResolvedValue(rpcOk(null));
    const params = { p_user_id: 'u-1', p_limit: 10 };
    await timedRpc('fn', params);
    expect(mockRpc).toHaveBeenCalledWith('fn', params);
  });
});

// ── recordQueryEvent fields ───────────────────────────────────────────────────
describe('timedRpc — recordQueryEvent on success', () => {
  it('calls recordQueryEvent with operation="rpc" and source="externalSupabase"', async () => {
    mockRpc.mockResolvedValue(rpcOk(null));
    await timedRpc('my_rpc');
    expect(mockRecordQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'rpc', source: 'externalSupabase' })
    );
  });

  it('sets target to rpcName', async () => {
    mockRpc.mockResolvedValue(rpcOk(null));
    await timedRpc('some_rpc');
    expect(mockRecordQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'some_rpc' })
    );
  });

  it('sets durationMs to a non-negative number', async () => {
    mockRpc.mockResolvedValue(rpcOk(null));
    await timedRpc('fn');
    const call = mockRecordQueryEvent.mock.calls[0][0];
    expect(typeof call.durationMs).toBe('number');
    expect(call.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('extracts p_limit from params', async () => {
    mockRpc.mockResolvedValue(rpcOk(null));
    await timedRpc('fn', { p_limit: 25, p_offset: 50 });
    expect(mockRecordQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 25, offset: 50 })
    );
  });

  it('sets limit/offset to null when params lack them', async () => {
    mockRpc.mockResolvedValue(rpcOk(null));
    await timedRpc('fn', { some_other_param: 'x' });
    expect(mockRecordQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ limit: null, offset: null })
    );
  });

  it('sets limit/offset to null when values are not numbers', async () => {
    mockRpc.mockResolvedValue(rpcOk(null));
    await timedRpc('fn', { p_limit: '5', p_offset: null });
    expect(mockRecordQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ limit: null, offset: null })
    );
  });

  it('sets recordCount to array length when data is an array', async () => {
    mockRpc.mockResolvedValue(rpcOk([{ a: 1 }, { b: 2 }]));
    await timedRpc('fn');
    expect(mockRecordQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ recordCount: 2 })
    );
  });

  it('sets recordCount to null when data is not an array', async () => {
    mockRpc.mockResolvedValue(rpcOk({ scalar: true }));
    await timedRpc('fn');
    expect(mockRecordQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ recordCount: null })
    );
  });

  it('sets recordCount to null when data is null', async () => {
    mockRpc.mockResolvedValue(rpcOk(null));
    await timedRpc('fn');
    expect(mockRecordQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ recordCount: null })
    );
  });

  it('sets filters to the params object', async () => {
    mockRpc.mockResolvedValue(rpcOk(null));
    const params = { p_foo: 'bar' };
    await timedRpc('fn', params);
    expect(mockRecordQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ filters: params })
    );
  });

  it('sets errorMessage to undefined on clean success', async () => {
    mockRpc.mockResolvedValue(rpcOk(null));
    await timedRpc('fn');
    expect(mockRecordQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ errorMessage: undefined })
    );
  });

  it('sets errorMessage to rpc error message when error present', async () => {
    mockRpc.mockResolvedValue(rpcErr('constraint violation'));
    await timedRpc('fn');
    expect(mockRecordQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ errorMessage: 'constraint violation' })
    );
  });

  it('falls back to "rpc error" when rpc error has no message', async () => {
    mockRpc.mockResolvedValue(Promise.resolve({ data: null, error: {} }));
    await timedRpc('fn');
    expect(mockRecordQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ errorMessage: 'rpc error' })
    );
  });
});

// ── classifySeverity ──────────────────────────────────────────────────────────
describe('timedRpc — classifySeverity', () => {
  it('calls classifySeverity(duration, false, false) on clean success', async () => {
    mockRpc.mockResolvedValue(rpcOk([1, 2, 3]));
    await timedRpc('fn');
    expect(mockClassifySeverity).toHaveBeenCalledWith(
      expect.any(Number), false, false
    );
  });

  it('calls classifySeverity(duration, true, false) when rpc returns an error', async () => {
    mockRpc.mockResolvedValue(rpcErr('db error'));
    await timedRpc('fn');
    expect(mockClassifySeverity).toHaveBeenCalledWith(
      expect.any(Number), true, false
    );
  });

  it('passes classifySeverity return value as severity in the event', async () => {
    mockClassifySeverity.mockReturnValue('warn');
    mockRpc.mockResolvedValue(rpcOk(null));
    await timedRpc('fn');
    expect(mockRecordQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'warn' })
    );
  });
});

// ── catch block ───────────────────────────────────────────────────────────────
describe('timedRpc — catch block (rpc throws)', () => {
  it('re-throws the original error', async () => {
    const boom = new Error('connection refused');
    mockRpc.mockRejectedValue(boom);
    await expect(timedRpc('fn')).rejects.toThrow('connection refused');
  });

  it('records the event before re-throwing', async () => {
    mockRpc.mockRejectedValue(new Error('network error'));
    await expect(timedRpc('fn')).rejects.toThrow();
    expect(mockRecordQueryEvent).toHaveBeenCalledOnce();
  });

  it('sets severity to "timeout" for TimeoutError (by name)', async () => {
    const err = Object.assign(new Error('operation timed out'), { name: 'TimeoutError' });
    mockRpc.mockRejectedValue(err);
    await expect(timedRpc('fn')).rejects.toThrow();
    expect(mockRecordQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'timeout' })
    );
  });

  it('sets severity to "timeout" when message contains "timeout"', async () => {
    mockRpc.mockRejectedValue(new Error('Request timeout exceeded'));
    await expect(timedRpc('fn')).rejects.toThrow();
    expect(mockRecordQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'timeout' })
    );
  });

  it('sets severity to "timeout" for case-insensitive TIMEOUT in message', async () => {
    mockRpc.mockRejectedValue(new Error('TIMEOUT: 30000ms'));
    await expect(timedRpc('fn')).rejects.toThrow();
    expect(mockRecordQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'timeout' })
    );
  });

  it('sets severity to "error" for generic non-timeout errors', async () => {
    mockRpc.mockRejectedValue(new Error('unique constraint violation'));
    await expect(timedRpc('fn')).rejects.toThrow();
    expect(mockRecordQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'error' })
    );
  });

  it('includes correlationId in the catch event', async () => {
    mockRpc.mockRejectedValue(new Error('fail'));
    await expect(timedRpc('fn')).rejects.toThrow();
    expect(mockRecordQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId: 'test-cid-1' })
    );
  });

  it('sets recordCount to null in the catch event', async () => {
    mockRpc.mockRejectedValue(new Error('fail'));
    await expect(timedRpc('fn')).rejects.toThrow();
    expect(mockRecordQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ recordCount: null })
    );
  });

  it('sets errorMessage from the thrown error message', async () => {
    mockRpc.mockRejectedValue(new Error('auth denied'));
    await expect(timedRpc('fn')).rejects.toThrow();
    expect(mockRecordQueryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ errorMessage: 'auth denied' })
    );
  });

  it('does NOT call classifySeverity in the catch block', async () => {
    mockRpc.mockRejectedValue(new Error('fail'));
    await expect(timedRpc('fn')).rejects.toThrow();
    expect(mockClassifySeverity).not.toHaveBeenCalled();
  });

  it('sets durationMs to a non-negative number in the catch event', async () => {
    mockRpc.mockRejectedValue(new Error('fail'));
    await expect(timedRpc('fn')).rejects.toThrow();
    const call = mockRecordQueryEvent.mock.calls[0][0];
    expect(typeof call.durationMs).toBe('number');
    expect(call.durationMs).toBeGreaterThanOrEqual(0);
  });
});
