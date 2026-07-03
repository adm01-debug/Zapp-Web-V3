import { lazy } from 'react';

export const CHUNK_RELOAD_SESSION_KEY = '__zapp_chunk_reload_at';
const CHUNK_RELOAD_COOLDOWN_MS = 30_000;

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
 * Guard table (exhaustive):
 *   'CORRUPTED'   -> NaN       -> !isFinite -> last=0 -> reload
 *   '1e999'       -> Infinity  -> !isFinite -> last=0 -> reload (BUG E fix)
 *   'Infinity'    -> Infinity  -> !isFinite -> last=0 -> reload
 *   '-1'          -> -1        -> <0        -> last=0 -> reload
 *   ''            -> 0         -> isFinite  -> last=0 -> reload
 *   '1750000000'  -> timestamp -> isFinite  -> cooldown logic applies
 */
export function triggerChunkReload(): boolean {
  try {
    const rawLast = sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY);
    const parsed = Number(rawLast ?? '0');
    const last = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    const now = Date.now();
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

export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 3
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
        if (attempt >= retries) throw err;
        return new Promise<{ default: T }>((resolve) =>
          setTimeout(() => resolve(load()), 1000 * attempt)
        );
      });
    return load();
  });
}
