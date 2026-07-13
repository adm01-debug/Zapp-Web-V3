/**
 * Tests for runConnectionDiagnostics() in diagnostics.ts.
 *
 * Note: diagnostics.ts contains incomplete/broken code at lines 65-88
 * (references to `results`, `connError`, `connData`, `SystemConnectionForm`,
 * `systemConnectionSchema` that are undefined). The outer try/catch absorbs the
 * ReferenceError as a "Global Error" fail step. Tests cover the two reachable
 * observable paths.
 *
 * Paths:
 * - No session → Auth Check fail, early return (no DB calls)
 * - Session present → Auth Check pass → broken code → ReferenceError caught
 *   as "Global Error" fail
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
// diagLog is assigned at module load time via getLogger('diagnostics').
// The stable logger object must be returned by the very first mockGetLogger call,
// so we bake it into the vi.hoisted factory (not into beforeEach).
const mockDebug = vi.hoisted(() => vi.fn());
const mockWarn = vi.hoisted(() => vi.fn());
const mockError = vi.hoisted(() => vi.fn());

const mockGetLogger = vi.hoisted(() =>
  vi.fn(() => ({ debug: mockDebug, warn: mockWarn, error: mockError, info: vi.fn() }))
);
const mockGetSession = vi.hoisted(() => vi.fn());
const mockSafeClientFrom = vi.hoisted(() => vi.fn());

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { getSession: mockGetSession } },
}));

vi.mock('@/integrations/supabase/safeClient', () => ({
  safeClient: { from: mockSafeClientFrom },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: mockGetLogger,
}));

// ── Import SUT AFTER mocks ────────────────────────────────────────────────────
import { runConnectionDiagnostics } from '../diagnostics';

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
});

// ── return shape ──────────────────────────────────────────────────────────────
describe('runConnectionDiagnostics — return shape', () => {
  it('always returns an object with timestamp and steps', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const result = await runConnectionDiagnostics();
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('steps');
    expect(Array.isArray(result.steps)).toBe(true);
  });

  it('timestamp is a valid ISO string', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const result = await runConnectionDiagnostics();
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });
});

// ── auth check step ───────────────────────────────────────────────────────────
describe('runConnectionDiagnostics — auth check (step 1)', () => {
  it('step 1 status is "fail" when session is null', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const result = await runConnectionDiagnostics();
    const step = result.steps.find(s => s.step === 'Auth Check');
    expect(step?.status).toBe('fail');
  });

  it('returns early (only 1 step) when session is null', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const result = await runConnectionDiagnostics();
    expect(result.steps).toHaveLength(1);
  });

  it('does not call safeClient.from when session is null', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await runConnectionDiagnostics();
    expect(mockSafeClientFrom).not.toHaveBeenCalled();
  });

  it('step 1 status is "pass" when session is valid', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { email: 'u@test.com', id: 'uid-1' } } },
    });
    mockSafeClientFrom.mockResolvedValue({ data: null, error: null });
    const result = await runConnectionDiagnostics();
    const authStep = result.steps.find(s => s.step === 'Auth Check');
    expect(authStep?.status).toBe('pass');
  });
});

// ── global error catch ────────────────────────────────────────────────────────
describe('runConnectionDiagnostics — global catch (broken code path)', () => {
  it('adds a "Global Error" fail step when session exists (broken code throws)', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { email: 'u@test.com', id: 'uid-1' } } },
    });
    mockSafeClientFrom.mockResolvedValue({ data: null, error: null });
    const result = await runConnectionDiagnostics();
    const errorStep = result.steps.find(s => s.step === 'Global Error');
    expect(errorStep?.status).toBe('fail');
  });

  it('Global Error details includes the error message', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { email: 'u@test.com', id: 'uid-1' } } },
    });
    mockSafeClientFrom.mockResolvedValue({ data: null, error: null });
    const result = await runConnectionDiagnostics();
    const errorStep = result.steps.find(s => s.step === 'Global Error');
    const details = errorStep?.details as { message?: string } | undefined;
    expect(typeof details?.message).toBe('string');
  });

  it('resolves without unhandled rejection when session exists', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { email: 'u@test.com', id: 'uid-1' } } },
    });
    mockSafeClientFrom.mockResolvedValue({ data: null, error: null });
    const result = await runConnectionDiagnostics();
    expect(result).toBeDefined();
  });

  it('adds a "Global Error" fail step when getSession throws', async () => {
    mockGetSession.mockRejectedValue(new Error('network unavailable'));
    const result = await runConnectionDiagnostics();
    const errorStep = result.steps.find(s => s.step === 'Global Error');
    expect(errorStep?.status).toBe('fail');
  });
});

// ── logger integration ────────────────────────────────────────────────────────
describe('runConnectionDiagnostics — logger', () => {
  it('logs a warning for auth fail step', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await runConnectionDiagnostics();
    expect(mockWarn).toHaveBeenCalled();
  });

  it('logs a debug for auth pass step before broken code throws', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { user: { email: 'u@test.com', id: 'uid-1' } } },
    });
    mockSafeClientFrom.mockResolvedValue({ data: null, error: null });
    await runConnectionDiagnostics();
    expect(mockDebug).toHaveBeenCalled();
  });
});
