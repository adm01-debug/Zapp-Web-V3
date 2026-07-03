import { lazy } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Stale chunk reload guard
//
// After a Vercel/CDN redeploy, old bundles reference chunk filenames that no
// longer exist on the CDN (404). React's lazy() throws:
//   "TypeError: Failed to fetch dynamically imported module: .../assets/Foo-ABC.js"
//
// The correct recovery is a hard page reload so the browser fetches the new
// index.html → new main bundle → new chunk hashes.
//
// Guard: we write the reload timestamp to sessionStorage so a truly broken
// deploy (where ALL chunks are missing) does not cause an infinite reload loop.
// After 30 s without a successful load, the user sees the ErrorBoundary UI.
// ─────────────────────────────────────────────────────────────────────────────

export const CHUNK_RELOAD_SESSION_KEY = '__zapp_chunk_reload_at';
const CHUNK_RELOAD_COOLDOWN_MS = 30_000; // 30 seconds between auto-reloads

/**
 * Returns true when the thrown value looks like a "chunk not found" error
 * (hash mismatch after deploy, CDN purge, network split-brain, etc.).
 */
export function isChunkLoadError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('loading chunk') ||
    msg.includes('importing a module script failed') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('unable to preload css for')
  );
}

/**
 * Triggers a hard page reload if the cooldown window has elapsed.
 * Returns true if a reload was triggered; false if the cooldown is still
 * active (caller should fall through to ErrorBoundary).
 */
export function triggerChunkReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY) ?? '0');
    const now = Date.now();
    if (now - last > CHUNK_RELOAD_COOLDOWN_MS) {
      sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, String(now));
      window.location.reload();
      return true;
    }
    // Cooldown active: let ErrorBoundary show the error UI.
    return false;
  } catch {
    // sessionStorage unavailable (e.g. private browsing) — reload unconditionally.
    window.location.reload();
    return true;
  }
}

/**
 * Retry wrapper for lazy imports.
 *
 * Behaviour:
 *  - Stale chunk hash mismatch after deploy → hard page reload (once per 30 s)
 *  - Other network errors (503, timeout) → exponential-backoff retry
 *    (1 s × attempt, up to `retries` total attempts)
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 3
): React.LazyExoticComponent<T> {
  return lazy(() => {
    let attempt = 0;
    const load = (): Promise<{ default: T }> =>
      factory().catch((err: unknown) => {
        // Stale chunk → hard reload; retrying the same URL is pointless.
        if (isChunkLoadError(err)) {
          triggerChunkReload();
          throw err; // Let ErrorBoundary handle if reload is on cooldown.
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
