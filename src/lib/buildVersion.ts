/**
 * Build-version watcher.
 *
 * Compares the build id embedded at compile time (`__APP_BUILD_ID__`, injected
 * via vite `define`) against `/version.json` served alongside the deployed
 * bundle. When they diverge — i.e. a new deploy is live but the tab is still
 * running old JS — we purge Cache Storage, unregister every service worker
 * scoped to the origin and force a hard reload so the next paint uses the new
 * bundle.
 *
 * This is a defensive complement to `useServiceWorker` (which only handles the
 * push-only SW lifecycle): even without a controlling SW, browsers and CDNs
 * can serve stale HTML/JS after a deploy — this watcher closes that gap.
 */
import { getLogger } from '@/lib/logger';

const log = getLogger('buildVersion');

// Injected by vite (see vite.config.ts → define). Falls back to 'dev' when the
// bundle is served directly from the Vite dev server without the define pass.
declare const __APP_BUILD_ID__: string;
const CURRENT_BUILD_ID: string =
  typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev';

const VERSION_URL = '/version.json';
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 min
const RELOAD_FLAG = 'zapp-build-reload-once';
const SW_PURGE_FLAG = 'zapp-workbox-purged-once';

let started = false;
let intervalId: ReturnType<typeof setInterval> | undefined;
let workboxChecked = false;

/**
 * Detect Workbox precache entries in CacheStorage (fonte confiavel — nao depende
 * do conteudo servido de /sw.js, que pode vir de cache de CDN). Se detectado,
 * purga tudo e forca reload uma unica vez.
 */
async function detectAndPurgeStaleWorkboxSW(): Promise<void> {
  if (workboxChecked) return;
  workboxChecked = true;
  try {
    if (typeof caches === 'undefined') return;
    const keys = await caches.keys();
    const hasWorkbox = keys.some((k) => /^workbox-(precache|runtime)/i.test(k));
    if (!hasWorkbox) return;
    log.warn('[buildVersion] Workbox cache entries detected — purging.', keys);
    const already = sessionStorage.getItem(SW_PURGE_FLAG) === '1';
    if (already) return;
    try { sessionStorage.setItem(SW_PURGE_FLAG, '1'); } catch { /* noop */ }
    await forceBundleRefresh('stale-workbox-cache');
  } catch {
    workboxChecked = false;
  }
}

async function purgeClientCaches(): Promise<void> {
  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {
    /* noop */
  }
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
  } catch {
    /* noop */
  }
}

/**
 * Wipe caches + SW and force a hard reload. Guarded so a broken deploy cannot
 * pin the tab in an infinite reload loop (a second mismatch within the same
 * session bails out and just logs).
 */
export async function forceBundleRefresh(reason: string): Promise<void> {
  log.warn('[buildVersion] Forcing bundle refresh:', reason);
  const alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG) === '1';
  await purgeClientCaches();
  if (alreadyReloaded) {
    log.error(
      '[buildVersion] Version mismatch persists after reload — aborting to avoid loop.',
    );
    return;
  }
  try {
    sessionStorage.setItem(RELOAD_FLAG, '1');
  } catch {
    /* storage full / disabled — reload anyway */
  }
  // Bypass query param — CDNs that respeitam query invalidam o cache-edge.
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_bv', String(Date.now()));
    window.location.replace(url.toString());
    return;
  } catch {
    window.location.reload();
  }
}

async function checkVersion(): Promise<void> {
  try {
    const res = await fetch(`${VERSION_URL}?ts=${Date.now()}`, {
      cache: 'no-store',
      credentials: 'omit',
      headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
    });
    if (!res.ok) return;
    const payload = (await res.json()) as { buildId?: string } | null;
    const remote = payload?.buildId;
    if (!remote || remote === CURRENT_BUILD_ID) {
      if (remote === CURRENT_BUILD_ID) {
        // Build atual bate com o servidor — limpa TODAS as flags de guarda para
        // evitar que uma sessao antiga fique presa em estado de "purga".
        try {
          sessionStorage.removeItem(RELOAD_FLAG);
          sessionStorage.removeItem(SW_PURGE_FLAG);
        } catch { /* noop */ }
      }
      return;
    }
    await forceBundleRefresh(
      `client=${CURRENT_BUILD_ID} server=${remote}`,
    );
  } catch {
    /* offline / network hiccup — retry next tick */
  }
}

function isSkippableEnv(): boolean {
  try {
    if (import.meta.env?.DEV) return true;
    if (typeof window === 'undefined') return true;
    if (window.self !== window.top) return true;
    const host = window.location.hostname;
    if (
      host.startsWith('id-preview--') ||
      host.startsWith('preview--') ||
      host === 'lovableproject.com' || host.endsWith('.lovableproject.com') ||
      host === 'lovableproject-dev.com' || host.endsWith('.lovableproject-dev.com') ||
      host === 'beta.lovable.dev' || host.endsWith('.beta.lovable.dev')
    ) return true;
    if (new URL(window.location.href).searchParams.get('sw') === 'off') return true;
  } catch { /* noop */ }
  return false;
}

/**
 * Idempotent. Safe to call from React effects; a second call is a no-op.
 * Should NOT run in Lovable preview/iframe/dev — the caller is responsible for
 * that check (same policy as useServiceWorker).
 */
export function startBuildVersionWatcher(): () => void {
  if (started || typeof window === 'undefined') return () => undefined;
  if (isSkippableEnv()) return () => undefined;
  started = true;

  // Kick off first check after the tab is idle so we don't fight first paint.
  const kickoff = window.setTimeout(() => {
    void detectAndPurgeStaleWorkboxSW();
    void checkVersion();
  }, 10_000);

  intervalId = setInterval(() => { void checkVersion(); }, POLL_INTERVAL_MS);

  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      void detectAndPurgeStaleWorkboxSW();
      void checkVersion();
    }
  };
  document.addEventListener('visibilitychange', onVisible);

  const onFocus = () => {
    void detectAndPurgeStaleWorkboxSW();
    void checkVersion();
  };
  window.addEventListener('focus', onFocus);

  return () => {
    clearTimeout(kickoff);
    if (intervalId) clearInterval(intervalId);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onFocus);
    started = false;
  };
}

/**
 * Build id this tab is currently running (compile-time constant injected by
 * vite). Consumers compare against it to decide whether a freshly-activated
 * service worker — or a version.json entry — is genuinely newer than the bundle
 * this tab loaded, preventing spurious reloads when the ids already match.
 */
export function getCurrentBuildId(): string {
  return CURRENT_BUILD_ID;
}

export const __TEST__ = { CURRENT_BUILD_ID };
