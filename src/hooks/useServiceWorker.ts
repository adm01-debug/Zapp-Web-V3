import { useEffect, useRef } from 'react';
import { log } from '@/lib/logger';

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

export function useServiceWorker() {
  const registeredRef = useRef(false);

  useEffect(() => {
    if (registeredRef.current) return;
    registeredRef.current = true;

    if (!('serviceWorker' in navigator)) return;

    let cleanup: (() => void) | undefined;
    let disposed = false;
    const timeoutIds: NodeJS.Timeout[] = [];

    const registerServiceWorker = async (retryCount = 0) => {
      try {
        const reloadedForLegacyCleanup = await cleanupLegacyServiceWorker();
        if (reloadedForLegacyCleanup || disposed) return;

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
          if (event.data.type === 'NOTIFICATION_CLICK') {
            document.dispatchEvent(new CustomEvent('notification-click', {
              detail: event.data.data,
            }));
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
