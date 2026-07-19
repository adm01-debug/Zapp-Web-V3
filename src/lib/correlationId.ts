/**
 * Correlation ID utility for tracing client → edge → DB calls.
 *
 * Each external call (externalProxy or externalSupabase RPC) is tagged with
 * a short, unique ID that is:
 *   - included in the structured log line
 *   - attached to the recorded telemetry event (visible in the panel)
 *   - forwarded to the edge function via the `x-correlation-id` header
 *     (and echoed in body params under `__cid`) so server logs can be
 *     joined back to the client trace.
 *
 * Format: `<8 hex chars>` — short enough to scan visually, unique enough
 * for in-memory dedup over a session.
 */

/** Generates a short 8-char hex correlation ID for tracing client → edge → DB calls. */
export function generateCorrelationId(): string {
  // Prefer crypto.randomUUID when available, take first segment.
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().slice(0, 8);
    }
  } catch {
    // ignore — fall through to Math.random
  }
  // Fallback: 8 hex chars from Math.random.
  return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
}

/** C O R R E L A T I O N_ H E A D E R constant. */
export const CORRELATION_HEADER = 'x-correlation-id';
