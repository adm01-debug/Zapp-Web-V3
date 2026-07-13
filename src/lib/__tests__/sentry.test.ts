/**
 * Tests for sentry.ts — initSentry() is guarded by VITE_SENTRY_DSN.
 *
 * Strategy: each test that needs a fresh DSN value or a reset `initialized`
 * state calls vi.resetModules() (in beforeEach) and then dynamically imports
 * sentry.ts. vi.stubEnv() patches import.meta.env before the dynamic import
 * so the module-level `const DSN` picks up the stub.
 *
 * The @sentry/react mock uses vi.hoisted() so it survives module resets.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const mockSentryInit = vi.hoisted(() => vi.fn());
const mockBrowserTracing = vi.hoisted(() => vi.fn(() => ({ name: 'BrowserTracing' })));
const mockReplay = vi.hoisted(() => vi.fn(() => ({ name: 'Replay' })));
const mockErrorBoundary = vi.hoisted(() => ({}));

vi.mock('@sentry/react', () => ({
  init: mockSentryInit,
  browserTracingIntegration: mockBrowserTracing,
  replayIntegration: mockReplay,
  ErrorBoundary: mockErrorBoundary,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
const VALID_DSN = 'https://abc123@o123456.ingest.sentry.io/789';

async function loadSentry(dsn: string) {
  vi.stubEnv('VITE_SENTRY_DSN', dsn);
  const mod = await import('../sentry');
  return mod;
}

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ── DSN guards ────────────────────────────────────────────────────────────────
describe('initSentry — DSN guards (no initialization)', () => {
  it('returns false and does not call sentryInit when DSN is empty string', async () => {
    const { initSentry } = await loadSentry('');
    expect(initSentry()).toBe(false);
    expect(mockSentryInit).not.toHaveBeenCalled();
  });

  it('returns false when DSN is whitespace only', async () => {
    const { initSentry } = await loadSentry('   ');
    expect(initSentry()).toBe(false);
    expect(mockSentryInit).not.toHaveBeenCalled();
  });

  it('returns false when DSN is PLACEHOLDER', async () => {
    const { initSentry } = await loadSentry('PLACEHOLDER');
    expect(initSentry()).toBe(false);
    expect(mockSentryInit).not.toHaveBeenCalled();
  });
});

// ── successful init ───────────────────────────────────────────────────────────
describe('initSentry — successful initialization', () => {
  it('returns true when DSN is valid', async () => {
    const { initSentry } = await loadSentry(VALID_DSN);
    expect(initSentry()).toBe(true);
  });

  it('calls sentryInit exactly once on first call', async () => {
    const { initSentry } = await loadSentry(VALID_DSN);
    initSentry();
    expect(mockSentryInit).toHaveBeenCalledOnce();
  });

  it('passes dsn to sentryInit', async () => {
    const { initSentry } = await loadSentry(VALID_DSN);
    initSentry();
    expect(mockSentryInit).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: VALID_DSN })
    );
  });

  it('passes tracesSampleRate to sentryInit', async () => {
    const { initSentry } = await loadSentry(VALID_DSN);
    initSentry();
    const cfg = mockSentryInit.mock.calls[0][0];
    expect(typeof cfg.tracesSampleRate).toBe('number');
  });

  it('passes replaysSessionSampleRate and replaysOnErrorSampleRate', async () => {
    const { initSentry } = await loadSentry(VALID_DSN);
    initSentry();
    const cfg = mockSentryInit.mock.calls[0][0];
    expect(cfg.replaysSessionSampleRate).toBe(0.01);
    expect(cfg.replaysOnErrorSampleRate).toBe(1.0);
  });

  it('includes browserTracingIntegration in integrations', async () => {
    const { initSentry } = await loadSentry(VALID_DSN);
    initSentry();
    const cfg = mockSentryInit.mock.calls[0][0];
    expect(mockBrowserTracing).toHaveBeenCalled();
    expect(cfg.integrations).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'BrowserTracing' })])
    );
  });

  it('includes replayIntegration with maskAllText and blockAllMedia', async () => {
    const { initSentry } = await loadSentry(VALID_DSN);
    initSentry();
    expect(mockReplay).toHaveBeenCalledWith(
      expect.objectContaining({ maskAllText: true, blockAllMedia: true })
    );
  });

  it('passes tracePropagationTargets as an array', async () => {
    const { initSentry } = await loadSentry(VALID_DSN);
    initSentry();
    const cfg = mockSentryInit.mock.calls[0][0];
    expect(Array.isArray(cfg.tracePropagationTargets)).toBe(true);
    expect(cfg.tracePropagationTargets.length).toBeGreaterThan(0);
  });
});

// ── idempotency ───────────────────────────────────────────────────────────────
describe('initSentry — idempotency (initialized guard)', () => {
  it('returns true on second call without re-initializing', async () => {
    const { initSentry } = await loadSentry(VALID_DSN);
    initSentry();
    expect(initSentry()).toBe(true);
  });

  it('does not call sentryInit a second time', async () => {
    const { initSentry } = await loadSentry(VALID_DSN);
    initSentry();
    initSentry();
    expect(mockSentryInit).toHaveBeenCalledOnce();
  });
});

// ── catch block ───────────────────────────────────────────────────────────────
describe('initSentry — catch block', () => {
  it('returns false when sentryInit throws', async () => {
    mockSentryInit.mockImplementation(() => {
      throw new Error('init failure');
    });
    const { initSentry } = await loadSentry(VALID_DSN);
    expect(initSentry()).toBe(false);
  });
});

// ── beforeSend filter ─────────────────────────────────────────────────────────
describe('initSentry — beforeSend filter', () => {
  function getBeforeSend() {
    return mockSentryInit.mock.calls[0][0].beforeSend as (
      event: Record<string, unknown>
    ) => unknown;
  }

  function makeEvent(msg: string) {
    return {
      exception: { values: [{ value: msg }] },
      message: msg,
    };
  }

  beforeEach(async () => {
    const { initSentry } = await loadSentry(VALID_DSN);
    initSentry();
  });

  it('returns null for ResizeObserver loop errors', () => {
    const bs = getBeforeSend();
    expect(bs(makeEvent('ResizeObserver loop limit exceeded'))).toBeNull();
  });

  it('returns null for chrome-extension errors', () => {
    const bs = getBeforeSend();
    expect(bs(makeEvent('Script error from chrome-extension://abc'))).toBeNull();
  });

  it('returns null for moz-extension errors', () => {
    const bs = getBeforeSend();
    expect(bs(makeEvent('moz-extension://script failed'))).toBeNull();
  });

  it('returns null for Non-Error promise rejection', () => {
    const bs = getBeforeSend();
    expect(bs(makeEvent('Non-Error promise rejection captured'))).toBeNull();
  });

  it('passes through normal application errors', () => {
    const bs = getBeforeSend();
    const event = makeEvent('TypeError: Cannot read property');
    expect(bs(event)).toBe(event);
  });

  it('passes through network errors', () => {
    const bs = getBeforeSend();
    const event = makeEvent('Failed to fetch');
    expect(bs(event)).toBe(event);
  });
});

// ── exports ───────────────────────────────────────────────────────────────────
describe('sentry module — exports', () => {
  it('exports SentryErrorBoundary', async () => {
    const mod = await loadSentry('');
    expect(mod.SentryErrorBoundary).toBeDefined();
  });

  it('exports Sentry namespace', async () => {
    const mod = await loadSentry('');
    expect(mod.Sentry).toBeDefined();
  });
});
