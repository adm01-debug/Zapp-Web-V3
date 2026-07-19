/**
 * Web Vitals monitoring utility
 * Tracks Core Web Vitals (LCP, FID, CLS, INP, TTFB), reports to console and backend observability.
 */

import { getLogger } from '@/lib/logger';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';

const log = getLogger('WebVitals');
const CLIENT_OBSERVABILITY_STORAGE_KEY = 'zapp_client_observability_disabled';

export interface WebVitalMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  id: string;
}

const thresholds = {
  LCP: { good: 2500, poor: 4000 },
  FID: { good: 100, poor: 300 },
  CLS: { good: 0.1, poor: 0.25 },
  INP: { good: 200, poor: 500 },
  TTFB: { good: 800, poor: 1800 },
};

function getRating(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const t = thresholds[name as keyof typeof thresholds];
  if (!t) return 'good';
  if (value <= t.good) return 'good';
  if (value <= t.poor) return 'needs-improvement';
  return 'poor';
}

const metricsBuffer: WebVitalMetric[] = [];
const uploadQueue: WebVitalMetric[] = [];
// Last value (per metric name) already sent to backend for this page session —
// used to avoid flooding `query_telemetry` with thousands of CLS/INP updates.
const lastSentByName = new Map<string, number>();
let uploadTimer: number | null = null;
const OBS_FUNCTION = 'client-observability';

function isClientObservabilityEnabled(): boolean {
  if (import.meta.env.VITE_ENABLE_CLIENT_OBSERVABILITY !== 'true') return false;
  if (typeof sessionStorage === 'undefined') return true;
  return sessionStorage.getItem(CLIENT_OBSERVABILITY_STORAGE_KEY) !== '1';
}

function disableClientObservabilityForSession(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(CLIENT_OBSERVABILITY_STORAGE_KEY, '1');
  } catch (error) {
    log.debug('Unable to persist client observability circuit state', error);
  }
}

// Simple circuit-breaker so a failing observability endpoint can't flood the
// console with 500s forever. After 3 consecutive failures, silence uploads
// for BREAKER_COOLDOWN_MS. Any success resets the counter.
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 60_000;
let obsFailures = 0;
let obsSilencedUntil = 0;

async function flushMetrics() {
  if (!uploadQueue.length) return;
  if (!isClientObservabilityEnabled()) {
    uploadQueue.length = 0;
    return;
  }
  // Raw env check missed the case where URL exists but the key is a placeholder.
  // Trust the hardened flag instead, and drop the queue so it can't grow forever.
  if (!isSupabaseConfigured) {
    uploadQueue.length = 0;
    return;
  }
  if (Date.now() < obsSilencedUntil) {
    uploadQueue.length = 0;
    return;
  }

  const batch = uploadQueue.splice(0, uploadQueue.length).map((metric) => ({
    ...metric,
    path: typeof window !== 'undefined' ? window.location.pathname : undefined,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    timestamp: new Date().toISOString(),
  }));

  try {
    const { error } = await supabase.functions.invoke(OBS_FUNCTION, {
      body: { metrics: batch },
    });
    if (error) throw error;
    obsFailures = 0;
  } catch (err) {
    obsFailures += 1;
    if (obsFailures >= BREAKER_THRESHOLD) {
      obsSilencedUntil = Date.now() + BREAKER_COOLDOWN_MS;
      obsFailures = 0;
      disableClientObservabilityForSession();
      log.warn(
        `Observability endpoint silenced for ${BREAKER_COOLDOWN_MS / 1000}s after repeated failures`,
      );
    } else {
      log.debug('Failed sending web-vitals to backend observability', err);
    }
  }
}

function scheduleFlush() {
  if (uploadTimer !== null) return;
  uploadTimer = window.setTimeout(() => {
    uploadTimer = null;
    void flushMetrics();
  }, 5000);
}

/**
 * Decide whether `metric` is worth shipping to the backend. We only ship
 * non-"good" ratings, and only when the value materially changed since the
 * last send for this metric (>= 10% jump for numeric metrics, any change for
 * CLS). This caps inserts at a handful per page-session instead of hundreds.
 */
function shouldUpload(metric: WebVitalMetric): boolean {
  if (metric.rating === 'good') return false;
  const prev = lastSentByName.get(metric.name);
  if (prev === undefined) return true;
  if (metric.name === 'CLS') return Math.abs(metric.value - prev) >= 0.01;
  return Math.abs(metric.value - prev) / Math.max(prev, 1) >= 0.1;
}

const lastLoggedByName = new Map<string, { value: number; at: number }>();
const LOG_DEDUP_WINDOW_MS = 2000;

function onMetric(metric: WebVitalMetric) {
  metricsBuffer.push(metric);

  // Deduplicate console spam: skip logging if same metric+value fired within the window,
  // or if the value change is below a meaningful threshold.
  const prev = lastLoggedByName.get(metric.name);
  const changed =
    !prev ||
    (metric.name === 'CLS'
      ? Math.abs(metric.value - prev.value) >= 0.01
      : Math.abs(metric.value - prev.value) >= (metric.name === 'INP' ? 20 : 100));
  const fresh = !prev || Date.now() - prev.at > LOG_DEDUP_WINDOW_MS;
  if (changed && fresh) {
    lastLoggedByName.set(metric.name, { value: metric.value, at: Date.now() });
    const emoji =
      metric.rating === 'good' ? '🟢' : metric.rating === 'needs-improvement' ? '🟡' : '🔴';
    const unit = metric.name === 'CLS' ? '' : 'ms';
    log.info(
      `${emoji} ${metric.name}: ${metric.value.toFixed(metric.name === 'CLS' ? 3 : 0)}${unit} (${metric.rating})`
    );
  }

  if (typeof window !== 'undefined' && shouldUpload(metric)) {
    lastSentByName.set(metric.name, metric.value);
    uploadQueue.push(metric);
    scheduleFlush();
  }
}

let __initialized = false;
export function initWebVitals() {
  if (typeof window === 'undefined') return;
  if (__initialized) return;
  __initialized = true;

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushMetrics();
    }
  });

  // LCP - Largest Contentful Paint
  try {
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1] as PerformanceEntry;
      if (lastEntry) {
        onMetric({
          name: 'LCP',
          value: lastEntry.startTime,
          rating: getRating('LCP', lastEntry.startTime),
          delta: lastEntry.startTime,
          id: `lcp-${Date.now()}`,
        });
      }
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    /* not supported */
  }

  // FID - First Input Delay
  try {
    const fidObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const fid = (entry as PerformanceEventTiming).processingStart - entry.startTime;
        onMetric({
          name: 'FID',
          value: fid,
          rating: getRating('FID', fid),
          delta: fid,
          id: `fid-${Date.now()}`,
        });
      }
    });
    fidObserver.observe({ type: 'first-input', buffered: true });
  } catch {
    /* not supported */
  }

  // CLS - Cumulative Layout Shift
  try {
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!(entry as PerformanceEntry & { hadRecentInput?: boolean }).hadRecentInput) {
          clsValue += (entry as PerformanceEntry & { value: number }).value;
        }
      }
      onMetric({
        name: 'CLS',
        value: clsValue,
        rating: getRating('CLS', clsValue),
        delta: clsValue,
        id: `cls-${Date.now()}`,
      });
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });
  } catch {
    /* not supported */
  }

  // INP - Interaction to Next Paint
  try {
    const inpObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const duration = entry.duration;
        onMetric({
          name: 'INP',
          value: duration,
          rating: getRating('INP', duration),
          delta: duration,
          id: `inp-${Date.now()}`,
        });
      }
    });
    inpObserver.observe({
      type: 'event',
      buffered: true,
      durationThreshold: 40,
    } as PerformanceObserverInit);
  } catch {
    /* not supported */
  }

  // TTFB - Time to First Byte
  try {
    const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (navEntry) {
      const ttfb = navEntry.responseStart - navEntry.requestStart;
      onMetric({
        name: 'TTFB',
        value: ttfb,
        rating: getRating('TTFB', ttfb),
        delta: ttfb,
        id: `ttfb-${Date.now()}`,
      });
    }
  } catch (e) {
    log.debug('Navigation Timing API not supported', e);
  }
}

export function getWebVitalsReport(): WebVitalMetric[] {
  return [...metricsBuffer];
}
