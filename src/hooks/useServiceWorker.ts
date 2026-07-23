import { useEffect, useRef } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('useServiceWorker');

const CACHE_RESET_FLAG = 'sw-cache-reset-done';

/**
 * Purge ALL caches on load. The current sw.js is push-only and never caches anything,
 * so any cache present comes from an older build and produces the "two frontends"
 * symptom (different browsers serving different bundle hashes). One-shot per session.
 */
async function cleanupLegacyServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || typeof caches === 'undefined') return false;

  const cacheKeys = await caches.keys();
  if (cacheKeys.length === 0) {
    sessionStorage.removeItem(CACHE_RESET_FLAG);
    return false;
  }

  log.info('[ServiceWorker] Purging stale caches that can restore old UI bundles', cacheKeys);

  const registrations = navigator.serviceWorker.getRegistrations
    ? await navigator.serviceWorker.getRegistrations()
    : [];

  await Promise.all(registrations.map((registration) => registration.unregister()));
  await Promise.all(cacheKeys.map((key) => caches.delete(key)));

  if (sessionStorage.getItem(CACHE_RESET_FLAG) !== '1') {
    sessionStorage.setItem(CACHE_RESET_FLAG, '1');
    window.location.reload();
    return true;
  }

  return false;
}

/**
 * Contextos onde o SW NUNCA deve registrar (skill PWA):
 * - dev / iframe / preview do Lovable / beta / kill-switch (?sw=off)
 * Nesses casos, também desregistra qualquer SW herdado para eliminar
 * bundles antigos que possam estar em cache.
 */
function shouldSkipServiceWorker(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    if (import.meta.env?.DEV) return true;
    if (window.self !== window.top) return true; // dentro de iframe (preview Lovable)
    const host = window.location.hostname;
    if (
      host.startsWith('id-preview--') ||
      host.startsWith('preview--') ||
      host === 'lovableproject.com' || host.endsWith('.lovableproject.com') ||
      host === 'lovableproject-dev.com' || host.endsWith('.lovableproject-dev.com') ||
      host === 'beta.lovable.dev' || host.endsWith('.beta.lovable.dev')
    ) return true;
    if (new URL(window.location.href).searchParams.get('sw') === 'off') return true;
  } catch {
    /* noop */
  }
  return false;
}

async function unregisterAllServiceWorkers(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations?.();
    if (regs && regs.length) {
      log.info('[ServiceWorker] Unregistering existing workers', regs.map((r) => r.scope));
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
    }
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
    }
    // Limpa flags para permitir que uma futura mudanca de versao volte a
    // funcionar sem ficar presa em "ja purguei nesta sessao".
    try {
      sessionStorage.removeItem('zapp_sw_purged_v3');
      sessionStorage.removeItem('zapp-build-reload-once');
      sessionStorage.removeItem('zapp-workbox-purged-once');
      sessionStorage.removeItem('sw-cache-reset-done');
    } catch { /* noop */ }
  } catch {
    /* noop */
  }
}

/** use Service Worker function. */
export function useServiceWorker() {
  const registeredRef = useRef(false);

  useEffect(() => {
    if (registeredRef.current) return;
    registeredRef.current = true;

    if (!('serviceWorker' in navigator)) return;

    if (shouldSkipServiceWorker()) {
      // Preview/dev/iframe: garante que nenhum SW antigo continue interceptando
      void unregisterAllServiceWorkers();
      return;
    }



    let cleanup: (() => void) | undefined;
    let disposed = false;
    const timeoutIds: NodeJS.Timeout[] = [];

    const registerServiceWorker = async (retryCount = 0) => {
      // Capture disposed state at entry to prevent race conditions
      const wasDisposed = disposed;
      if (wasDisposed) return;

      try {
        const reloadedForLegacyCleanup = await cleanupLegacyServiceWorker();
        if (reloadedForLegacyCleanup) return;
        // Re-check disposed flag after async operation
        if (disposed) return;

        let registration;
        try {
          registration = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
            updateViaCache: 'none',
          });
        } catch (err) {
          const error = err as Error;
          if (error.message.includes('404') && retryCount < 3) {
            log.warn(`[ServiceWorker] 404 on registration attempt ${retryCount + 1}, retrying...`);
            const jitter = Math.random() * 1000;
            const delay = (2000 * Math.pow(2, retryCount)) + jitter;
            const timeoutId = setTimeout(() => {
              if (!disposed) {
                registerServiceWorker(retryCount + 1);
              }
            }, delay);
            timeoutIds.push(timeoutId);
            return;
          }
          throw err;
        }

        // Final disposed check before setting up event listeners
        if (disposed) return;

        log.debug('[ServiceWorker] Registration successful:', registration.scope);

        // Check for updates every 5 minutes (was 1 min — too frequent)
        let updateFailureCount = 0;
        const intervalId = setInterval(() => {
          registration
            .update()
            .then(() => {
              updateFailureCount = 0;
            })
            .catch((err) => {
              updateFailureCount++;
              if (updateFailureCount >= 3) {
                log.error('[ServiceWorker] Update check failed 3 times consecutively:', err);
                updateFailureCount = 0;
              } else {
                log.debug(
                  `[ServiceWorker] Update check failed (${updateFailureCount}/3), will retry:`,
                  err
                );
              }
            });
        }, 300_000);

        // Handle service worker updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                log.debug('[ServiceWorker] New content available');
                document.dispatchEvent(new CustomEvent('sw-update-available'));
              }
            });
          }
        });

        // Listen for messages from service worker
        const onMessage = (event: MessageEvent) => {
          log.debug('[ServiceWorker] Message received:', event.data);
          if (event.data?.type === 'NOTIFICATION_CLICK') {
            document.dispatchEvent(new CustomEvent('notification-click', {
              detail: event.data.data,
            }));
          }
          if (event.data?.type === 'SW_UPDATED') {
            // New sw.js activated (publish pipeline stamped a fresh build id).
            // Reuse the build-version watcher's hard-refresh path: purges
            // caches, unregisters SWs and reloads exactly once.
            void import('@/lib/buildVersion').then(({ forceBundleRefresh }) =>
              forceBundleRefresh(`sw-updated:${event.data.buildId ?? 'unknown'}`),
            );
          }
        };
        navigator.serviceWorker.addEventListener('message', onMessage);


        // Cleanup on unmount (interval was leaking before)
        cleanup = () => {
          clearInterval(intervalId);
          timeoutIds.forEach(id => clearTimeout(id));
          navigator.serviceWorker.removeEventListener('message', onMessage);
        };
      } catch (error) {
        log.error('[ServiceWorker] Registration failed:', error);
      }
    };

    void registerServiceWorker();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);
}
