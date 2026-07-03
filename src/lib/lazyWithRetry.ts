import { lazy } from 'react';

export const CHUNK_RELOAD_SESSION_KEY = '__zapp_chunk_reload_at';
const CHUNK_RELOAD_COOLDOWN_MS = 30_000;

/**
 * Detects chunk-not-found errors from failed dynamic imports.
 *
 * BUG FIX A: previous version called String(err) unconditionally, which throws
 * TypeError for prototype-less objects (Object.create(null)). We now check for
 * a .message property first before falling back to String().
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
    // String() can throw for Object.create(null) without Symbol.toPrimitive.
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
 * BUG FIX B: a corrupted sessionStorage value (NaN, negative) caused permanent
 * lockout: Date.now() - NaN = NaN, NaN > 30000 = false always. We now treat
 * NaN and negative values as 0 ("never reloaded") so the guard stays functional.
 */
export function triggerChunkReload(): boolean {
  try {
    const rawLast = sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY);
    const parsed = Number(rawLast ?? '0');
    const last = isNaN(parsed) || parsed < 0 ? 0 : parsed;
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
