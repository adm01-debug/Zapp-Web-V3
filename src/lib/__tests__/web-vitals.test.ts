// @ts-nocheck
/**
 * Tests for web-vitals.ts.
 *
 * Module-level state (__initialized, metricsBuffer, uploadQueue, lastSentByName)
 * is reset between tests via vi.resetModules() in beforeEach + dynamic imports.
 *
 * Tested:
 *  - getRating() thresholds (indirect via PerformanceObserver callbacks)
 *  - getWebVitalsReport() snapshot behaviour
 *  - initWebVitals() idempotency and observer registration
 *  - flushMetrics() via scheduleFlush + fake timers
 *  - shouldUpload() dedup logic
 *  - visibilitychange → flush
 *  - onMetric() logging dedup (info calls)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const mockInfo = vi.hoisted(() => vi.fn());
const mockWarn = vi.hoisted(() => vi.fn());
const mockDebug = vi.hoisted(() => vi.fn());

const mockGetLogger = vi.hoisted(() =>
  vi.fn(() => ({ info: mockInfo, warn: mockWarn, debug: mockDebug, error: vi.fn() }))
);

const mockInvoke = vi.hoisted(() => vi.fn());
const mockIsConfigured = vi.hoisted(() => ({ value: true }));

vi.mock('@/lib/logger', () => ({ getLogger: mockGetLogger }));

vi.mock('@/integrations/supabase/client', () => ({
  get isSupabaseConfigured() {
    return mockIsConfigured.value;
  },
  supabase: { functions: { invoke: mockInvoke } },
}));

// ── PerformanceObserver stub ──────────────────────────────────────────────────
type POCallback = (
  list: PerformanceObserverList,
  observer: PerformanceObserver
) => void;

const observerRegistry = new Map<string, POCallback>();

class MockPerfObserver {
  constructor(private cb: POCallback) {}
  observe(opts: { type: string; buffered?: boolean; durationThreshold?: number }) {
    observerRegistry.set(opts.type, this.cb);
  }
  disconnect() {}
}

function fireObserver(type: string, entries: Partial<PerformanceEntry>[]) {
  const cb = observerRegistry.get(type);
  if (!cb) return;
  cb(
    { getEntries: () => entries } as unknown as PerformanceObserverList,
    {} as PerformanceObserver
  );
}

// ── Helper: dynamic import of SUT ─────────────────────────────────────────────
async function loadModule() {
  const mod = await import('../webVitals');
  return mod as {
    initWebVitals: () => void;
    getWebVitalsReport: () => import('../webVitals').WebVitalMetric[];
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.stubEnv('VITE_ENABLE_CLIENT_OBSERVABILITY', 'true');
  sessionStorage.clear();
  observerRegistry.clear();
  mockIsConfigured.value = true;
  mockInvoke.mockResolvedValue({ data: null, error: null });

  vi.stubGlobal('PerformanceObserver', MockPerfObserver);
  vi.stubGlobal('performance', {
    now: vi.fn().mockReturnValue(0),
    getEntriesByType: vi.fn().mockReturnValue([]),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ── getWebVitalsReport — initial state ────────────────────────────────────────
describe('getWebVitalsReport — initial state', () => {
  it('returns empty array before any metrics are recorded', async () => {
    const { getWebVitalsReport } = await loadModule();
    expect(getWebVitalsReport()).toEqual([]);
  });

  it('returns a copy — mutations do not affect internal buffer', async () => {
    const { getWebVitalsReport } = await loadModule();
    const report = getWebVitalsReport();
    report.push({ name: 'X', value: 0, rating: 'good', delta: 0, id: 'x' });
    expect(getWebVitalsReport()).toHaveLength(0);
  });
});

// ── getRating — via LCP observer ──────────────────────────────────────────────
describe('getRating — LCP thresholds', () => {
  it('rates LCP ≤ 2500 as "good"', async () => {
    const { initWebVitals, getWebVitalsReport } = await loadModule();
    initWebVitals();
    fireObserver('largest-contentful-paint', [{ startTime: 1000 } as PerformanceEntry]);
    expect(getWebVitalsReport()[0].rating).toBe('good');
  });

  it('rates LCP between 2500–4000 as "needs-improvement"', async () => {
    const { initWebVitals, getWebVitalsReport } = await loadModule();
    initWebVitals();
    fireObserver('largest-contentful-paint', [{ startTime: 3000 } as PerformanceEntry]);
    expect(getWebVitalsReport()[0].rating).toBe('needs-improvement');
  });

  it('rates LCP > 4000 as "poor"', async () => {
    const { initWebVitals, getWebVitalsReport } = await loadModule();
    initWebVitals();
    fireObserver('largest-contentful-paint', [{ startTime: 5000 } as PerformanceEntry]);
    expect(getWebVitalsReport()[0].rating).toBe('poor');
  });
});

// ── getRating — CLS thresholds ────────────────────────────────────────────────
describe('getRating — CLS thresholds', () => {
  it('rates CLS ≤ 0.1 as "good"', async () => {
    const { initWebVitals, getWebVitalsReport } = await loadModule();
    initWebVitals();
    fireObserver('layout-shift', [
      { value: 0.05, hadRecentInput: false } as unknown as PerformanceEntry,
    ]);
    const metric = getWebVitalsReport().find(m => m.name === 'CLS');
    expect(metric?.rating).toBe('good');
  });

  it('rates CLS between 0.1–0.25 as "needs-improvement"', async () => {
    const { initWebVitals, getWebVitalsReport } = await loadModule();
    initWebVitals();
    fireObserver('layout-shift', [
      { value: 0.15, hadRecentInput: false } as unknown as PerformanceEntry,
    ]);
    const metric = getWebVitalsReport().find(m => m.name === 'CLS');
    expect(metric?.rating).toBe('needs-improvement');
  });

  it('rates CLS > 0.25 as "poor"', async () => {
    const { initWebVitals, getWebVitalsReport } = await loadModule();
    initWebVitals();
    fireObserver('layout-shift', [
      { value: 0.3, hadRecentInput: false } as unknown as PerformanceEntry,
    ]);
    const metric = getWebVitalsReport().find(m => m.name === 'CLS');
    expect(metric?.rating).toBe('poor');
  });
});

// ── LCP metric fields ─────────────────────────────────────────────────────────
describe('LCP metric — field values', () => {
  it('metric has correct name, value, delta, and id prefix', async () => {
    const { initWebVitals, getWebVitalsReport } = await loadModule();
    initWebVitals();
    fireObserver('largest-contentful-paint', [{ startTime: 1200 } as PerformanceEntry]);
    const [m] = getWebVitalsReport();
    expect(m.name).toBe('LCP');
    expect(m.value).toBe(1200);
    expect(m.delta).toBe(1200);
    expect(m.id).toMatch(/^lcp-/);
  });

  it('picks the last entry when multiple LCP entries fire', async () => {
    const { initWebVitals, getWebVitalsReport } = await loadModule();
    initWebVitals();
    fireObserver('largest-contentful-paint', [
      { startTime: 800 } as PerformanceEntry,
      { startTime: 1500 } as PerformanceEntry,
    ]);
    const [m] = getWebVitalsReport();
    expect(m.value).toBe(1500);
  });
});

// ── CLS accumulation ──────────────────────────────────────────────────────────
describe('CLS — accumulation and hadRecentInput filter', () => {
  it('accumulates layout-shift values without hadRecentInput', async () => {
    const { initWebVitals, getWebVitalsReport } = await loadModule();
    initWebVitals();
    fireObserver('layout-shift', [
      { value: 0.04, hadRecentInput: false } as unknown as PerformanceEntry,
      { value: 0.03, hadRecentInput: false } as unknown as PerformanceEntry,
    ]);
    const last = getWebVitalsReport().filter(m => m.name === 'CLS').pop();
    expect(last?.value).toBeCloseTo(0.07);
  });

  it('ignores entries with hadRecentInput=true', async () => {
    const { initWebVitals, getWebVitalsReport } = await loadModule();
    initWebVitals();
    fireObserver('layout-shift', [
      { value: 0.5, hadRecentInput: true } as unknown as PerformanceEntry,
    ]);
    const last = getWebVitalsReport().filter(m => m.name === 'CLS').pop();
    expect(last?.value).toBeCloseTo(0);
  });
});

// ── initWebVitals — idempotency ───────────────────────────────────────────────
describe('initWebVitals — idempotency', () => {
  it('calls PerformanceObserver.observe exactly once per metric type on repeated init', async () => {
    const observeSpy = vi.spyOn(MockPerfObserver.prototype, 'observe');
    const { initWebVitals } = await loadModule();
    initWebVitals();
    initWebVitals();
    initWebVitals();
    // 4 observer types: lcp, fid, layout-shift, event (INP); TTFB uses getEntriesByType
    expect(observeSpy).toHaveBeenCalledTimes(4);
  });

  it('registers largest-contentful-paint observer', async () => {
    const { initWebVitals } = await loadModule();
    initWebVitals();
    expect(observerRegistry.has('largest-contentful-paint')).toBe(true);
  });

  it('registers first-input observer', async () => {
    const { initWebVitals } = await loadModule();
    initWebVitals();
    expect(observerRegistry.has('first-input')).toBe(true);
  });

  it('registers layout-shift observer', async () => {
    const { initWebVitals } = await loadModule();
    initWebVitals();
    expect(observerRegistry.has('layout-shift')).toBe(true);
  });

  it('registers event observer for INP', async () => {
    const { initWebVitals } = await loadModule();
    initWebVitals();
    expect(observerRegistry.has('event')).toBe(true);
  });
});

// ── TTFB via navigation timing ────────────────────────────────────────────────
describe('initWebVitals — TTFB from navigation timing', () => {
  it('emits TTFB metric when navEntry is available', async () => {
    vi.stubGlobal('performance', {
      now: vi.fn().mockReturnValue(0),
      getEntriesByType: vi.fn().mockReturnValue([
        { responseStart: 400, requestStart: 100 } as Partial<PerformanceNavigationTiming>,
      ]),
    });
    const { initWebVitals, getWebVitalsReport } = await loadModule();
    initWebVitals();
    const ttfb = getWebVitalsReport().find(m => m.name === 'TTFB');
    expect(ttfb).toBeDefined();
    expect(ttfb?.value).toBe(300);
  });

  it('TTFB ≤ 800 rates as "good"', async () => {
    vi.stubGlobal('performance', {
      now: vi.fn().mockReturnValue(0),
      getEntriesByType: vi.fn().mockReturnValue([
        { responseStart: 500, requestStart: 100 } as Partial<PerformanceNavigationTiming>,
      ]),
    });
    const { initWebVitals, getWebVitalsReport } = await loadModule();
    initWebVitals();
    const ttfb = getWebVitalsReport().find(m => m.name === 'TTFB');
    expect(ttfb?.rating).toBe('good');
  });

  it('does not emit TTFB when no navEntry exists', async () => {
    vi.stubGlobal('performance', {
      now: vi.fn().mockReturnValue(0),
      getEntriesByType: vi.fn().mockReturnValue([]),
    });
    const { initWebVitals, getWebVitalsReport } = await loadModule();
    initWebVitals();
    expect(getWebVitalsReport().find(m => m.name === 'TTFB')).toBeUndefined();
  });
});

// ── flushMetrics via fake timers ──────────────────────────────────────────────
describe('flushMetrics — via scheduleFlush timeout', () => {
  it('calls supabase.functions.invoke after 5s when non-good metric is recorded', async () => {
    vi.useFakeTimers();
    const { initWebVitals } = await loadModule();
    initWebVitals();
    fireObserver('largest-contentful-paint', [{ startTime: 5000 } as PerformanceEntry]);
    await vi.runAllTimersAsync();
    expect(mockInvoke).toHaveBeenCalledWith('client-observability', expect.objectContaining({
      body: expect.objectContaining({ metrics: expect.arrayContaining([
        expect.objectContaining({ name: 'LCP' }),
      ]) }),
    }));
  });

  it('drops upload queue when isSupabaseConfigured is false', async () => {
    vi.useFakeTimers();
    mockIsConfigured.value = false;
    const { initWebVitals } = await loadModule();
    initWebVitals();
    fireObserver('largest-contentful-paint', [{ startTime: 5000 } as PerformanceEntry]);
    await vi.runAllTimersAsync();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('does not invoke when all metrics are "good" (shouldUpload returns false)', async () => {
    vi.useFakeTimers();
    const { initWebVitals } = await loadModule();
    initWebVitals();
    fireObserver('largest-contentful-paint', [{ startTime: 100 } as PerformanceEntry]);
    await vi.runAllTimersAsync();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('logs debug when invoke throws before opening the circuit breaker', async () => {
    vi.useFakeTimers();
    mockInvoke.mockRejectedValue(new Error('network error'));
    const { initWebVitals } = await loadModule();
    initWebVitals();
    fireObserver('largest-contentful-paint', [{ startTime: 5000 } as PerformanceEntry]);
    await vi.runAllTimersAsync();
    expect(mockDebug).toHaveBeenCalledWith(
      expect.stringContaining('Failed sending web-vitals'),
      expect.any(Error)
    );
  });
});

// ── shouldUpload dedup ────────────────────────────────────────────────────────
describe('shouldUpload — dedup logic', () => {
  it('queues a non-good metric for upload on first occurrence', async () => {
    vi.useFakeTimers();
    const { initWebVitals } = await loadModule();
    initWebVitals();
    fireObserver('largest-contentful-paint', [{ startTime: 5000 } as PerformanceEntry]);
    await vi.runAllTimersAsync();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('does not re-queue when value changes < 10% (numeric dedup)', async () => {
    vi.useFakeTimers();
    const { initWebVitals } = await loadModule();
    initWebVitals();
    // First LCP (poor, queued)
    fireObserver('largest-contentful-paint', [{ startTime: 5000 } as PerformanceEntry]);
    await vi.runAllTimersAsync();
    mockInvoke.mockClear();

    // Second LCP only 5% higher — below 10% threshold, should not re-queue
    fireObserver('largest-contentful-paint', [{ startTime: 5250 } as PerformanceEntry]);
    await vi.runAllTimersAsync();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('re-queues when CLS changes by ≥ 0.01', async () => {
    vi.useFakeTimers();
    const { initWebVitals } = await loadModule();
    initWebVitals();
    // First CLS (needs-improvement)
    fireObserver('layout-shift', [
      { value: 0.15, hadRecentInput: false } as unknown as PerformanceEntry,
    ]);
    await vi.runAllTimersAsync();
    mockInvoke.mockClear();

    // Second CLS fires with accumulated value > 0.01 increase
    fireObserver('layout-shift', [
      { value: 0.02, hadRecentInput: false } as unknown as PerformanceEntry,
    ]);
    await vi.runAllTimersAsync();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
});

// ── visibilitychange → flush ──────────────────────────────────────────────────
describe('visibilitychange → flushMetrics', () => {
  it('flushes upload queue when page is hidden', async () => {
    const { initWebVitals } = await loadModule();
    initWebVitals();

    // Queue a non-good metric without triggering the timer
    fireObserver('largest-contentful-paint', [{ startTime: 5000 } as PerformanceEntry]);

    // Simulate page hidden
    vi.stubGlobal('document', { visibilityState: 'hidden' });
    window.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve(); // allow microtasks

    expect(mockInvoke).toHaveBeenCalled();
  });
});

// ── onMetric logging ──────────────────────────────────────────────────────────
describe('onMetric — console logging', () => {
  it('logs info with 🟢 for a good metric', async () => {
    const { initWebVitals } = await loadModule();
    initWebVitals();
    fireObserver('largest-contentful-paint', [{ startTime: 500 } as PerformanceEntry]);
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('🟢'));
  });

  it('logs info with 🔴 for a poor metric', async () => {
    const { initWebVitals } = await loadModule();
    initWebVitals();
    fireObserver('largest-contentful-paint', [{ startTime: 6000 } as PerformanceEntry]);
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('🔴'));
  });

  it('logs info with 🟡 for needs-improvement metric', async () => {
    const { initWebVitals } = await loadModule();
    initWebVitals();
    fireObserver('largest-contentful-paint', [{ startTime: 3000 } as PerformanceEntry]);
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('🟡'));
  });
});