import { lazy } from 'react';

/** C H U N K_ R E L O A D_ S E S S I O N_ K E Y constant. */
export const CHUNK_RELOAD_SESSION_KEY = '__zapp_chunk_reload_at';
const CHUNK_RELOAD_COOLDOWN_MS = 30_000;

/**
 * Maximum future-clock-skew tolerance when reading the cooldown timestamp.
 *
 * Exported so that any module that duplicates the cooldown guard (e.g.
 * ErrorBoundary.detectAndReloadOnChunkError) can import this value instead of
 * hard-coding it, preventing silent drift if the tolerance is ever adjusted.
 *
 * The guard accepts a stored value only when it is:
 *   1. Finite and non-negative (catches NaN, Infinity, negative)
 *   2. At most CLOCK_SKEW_TOLERANCE_MS in the future (catches 1e308, far-future
 *      timestamps written by browser extensions or DevTools)
 *
 * Without this upper bound, Number.isFinite(1e308)=true would allow an
 * astronomical value through, making Date.now()-1e308~=-1e308 which is NOT
 * greater than 30 000 ms, so the guard would never fire (permanent lockout).
 */
export const CLOCK_SKEW_TOLERANCE_MS = 60_000; // 60 s

/**
 * Detects chunk-not-found errors from failed dynamic imports.
 * BUG A FIX: defensive against Object.create(null) (no .toString()).
 */
export function isChunkLoadError(err: unknown): boolean {
  let msg = '';
  try {
    if (err instanceof Error) {
      msg = err.message;
    } else if (err != null && typeof (err as Record<string, unknown>).message === 'string') {
      msg = (err as Record<string, unknown>).message as string;
    } else {
      msg = String(err ?? '');
    }
    msg = msg.toLowerCase();
  } catch {
    return false;
  }
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('loading chunk') ||
    msg.includes('importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('unable to preload css for')
  );
}

/**
 * Triggers a hard page reload if the 30-second cooldown has elapsed.
 *
 * BUG B + E FIX: uses Number.isFinite() instead of isNaN().
 * isNaN() does NOT catch Infinity: Date.now()-Infinity=-Infinity, -Inf>30000=false.
 * Number.isFinite() catches NaN, Infinity, and -Infinity in one check.
 *
 * FINDING 1+2 FIX (v7 QA): adds upper bound parsed <= now + CLOCK_SKEW_TOLERANCE_MS.
 * Without this, values like '1e308' are accepted by Number.isFinite but produce
 * Date.now()-1e308~=-1e308 which never exceeds 30 000 ms => permanent lockout.
 * Same problem for timestamps set slightly in the future by a browser extension.
 *
 * Guard table (exhaustive):
 *   'CORRUPTED'   -> NaN       -> !isFinite            -> last=0 -> reload
 *   '1e999'       -> Infinity  -> !isFinite            -> last=0 -> reload (BUG E)
 *   'Infinity'    -> Infinity  -> !isFinite            -> last=0 -> reload
 *   '-1'          -> -1        -> <0                   -> last=0 -> reload
 *   ''            -> 0         -> isFinite,>=0,<=60+now -> last=0 -> reload
 *   '1e308'       -> 1e308     -> isFinite,>=0,>60+now -> last=0 -> reload (FINDING 1)
 *   'now+10min'   -> future ts -> isFinite,>=0,>60+now -> last=0 -> reload (FINDING 2)
 *   'now-5s'      -> recent    -> isFinite,>=0,<=60+now-> last=ts-> cooldown
 *   '1750000000'  -> timestamp -> isFinite,>=0,<=60+now-> last=ts-> cooldown logic
 */
export function triggerChunkReload(): boolean {
  try {
    const rawLast = sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY);
    const parsed = Number(rawLast ?? '0');
    const now = Date.now();
    // Accept only plausible timestamps: finite, non-negative, and not more than
    // CLOCK_SKEW_TOLERANCE_MS in the future. Anything outside this range is
    // treated as 0 (i.e., "never reloaded") and triggers a fresh reload.
    const last =
      Number.isFinite(parsed) && parsed >= 0 && parsed <= now + CLOCK_SKEW_TOLERANCE_MS
        ? parsed
        : 0;
    if (now - last > CHUNK_RELOAD_COOLDOWN_MS) {
      sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, String(now));
      window.location.reload();
      return true;
    }
    return false;
  } catch {
    window.location.reload();
    return true;
  }
}

/**
 * Wraps React.lazy() with retry logic for transient network failures.
 *
 * @param factory     Dynamic import factory: () => import('./Component').
 * @param maxAttempts Maximum total load attempts before throwing (default: 3).
 *                    That means up to maxAttempts - 1 retries with increasing
 *                    back-off: attempt 2 waits 1 s, attempt 3 waits 2 s, etc.
 *
 *                    Chunk-load errors (stale hash mismatch after a deploy) bypass
 *                    this retry loop entirely and call triggerChunkReload() for a
 *                    hard page reload instead.
 *
 * Guard guarantee: regardless of how many non-chunk failures occur,
 *   the function either succeeds or exhausts maxAttempts and throws;
 *   chunk errors always escalate to a page reload, never to a visible error
 *   boundary (unless the 30-second cooldown is active).
 */
/** Wraps React.lazy with automatic retry on chunk-load errors, escalating to a page reload when needed. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  maxAttempts = 3
): React.LazyExoticComponent<T> {
  return lazy(() => {
    let attempt = 0;
    const load = (): Promise<{ default: T }> =>
      factory().catch((err: unknown) => {
        if (isChunkLoadError(err)) {
          triggerChunkReload();
          throw err;
        }
        attempt++;
        if (attempt >= maxAttempts) throw err;
        return new Promise<{ default: T }>((resolve) =>
          setTimeout(() => resolve(load()), 1000 * attempt)
        );
      });
    return load();
  });
}
