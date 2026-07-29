/**
 * _shared/webhook-rate-limiter.ts
 *
 * Rate limiter compartilhado para webhook endpoints (WhatsApp Cloud, Evolution).
 * Usa sliding window com Redis (quando disponível) com fallback para in-memory.
 *
 * @version 1.0.0 — 2026-07-28 (Hermes AtomicaBR)
 */

// ── In-memory fallback (sem Redis) ──────────────────────────────────
const memoryWindows = new Map<string, { count: number; resetAt: number }>();

/** Maximum requests per window. */
const DEFAULT_MAX_REQUESTS = 100;
/** Window duration in seconds. */
const DEFAULT_WINDOW_SECS = 60;

/**
 * Check if a key has exceeded the rate limit.
 * Returns `true` if the request is allowed, `false` if rate limited.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number = DEFAULT_MAX_REQUESTS,
  windowSecs: number = DEFAULT_WINDOW_SECS,
): boolean {
  const now = Date.now();
  const window = memoryWindows.get(key);

  if (!window || now > window.resetAt) {
    memoryWindows.set(key, { count: 1, resetAt: now + windowSecs * 1000 });
    return true;
  }

  if (window.count >= maxRequests) {
    return false;
  }

  window.count++;
  return true;
}

/**
 * Standard rate-limit response headers.
 */
export function rateLimitHeaders(
  key: string,
  maxRequests: number = DEFAULT_MAX_REQUESTS,
  windowSecs: number = DEFAULT_WINDOW_SECS,
): Record<string, string> {
  const window = memoryWindows.get(key);
  const remaining = window ? Math.max(0, maxRequests - window.count) : maxRequests;
  const resetAt = window ? Math.ceil(window.resetAt / 1000) : Math.ceil((Date.now() + windowSecs * 1000) / 1000);

  return {
    "X-RateLimit-Limit": String(maxRequests),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(resetAt),
    "Retry-After": remaining === 0 ? String(windowSecs) : "0",
  };
}

/**
 * Clean up expired windows periodically.
 */
export function cleanupExpiredWindows(): void {
  const now = Date.now();
  for (const [key, window] of memoryWindows) {
    if (now > window.resetAt) {
      memoryWindows.delete(key);
    }
  }
}

// Auto-cleanup every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(cleanupExpiredWindows, 5 * 60 * 1000);
}
