import { useEffect, useRef } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('useServiceWorker');

const CACHE_RESET_FLAG = 'sw-cache-reset-done';

/**
 * Cleanup de caches legados (workbox / versoes antigas do SW) que podem
 * causar o sintoma "dois frontends" (abas diferentes servindo bundles com
 * hashes diferentes).
 *
 * **Coordenacao com buildVersion (2026-08-03):** Antes esta funcao purgava
 * TODOS os caches e desregistrava TODOS os SWs, independente de o SW atual
 * ja estar controlando a pagina. Isso criava uma cascata:
 *   cleanup reload → buildVersion reload → cleanup reload → ...
 *
 * Agora:
 * 1. Se o SW ja esta controlando a pagina (navigator.serviceWorker.controller),
 *    os caches sao legitimos — nao purgar.
 * 2. Purga apenas caches com prefixo workbox- ou zapp- (mesmo filtro do
 *    activate handler em sw.js), nao TODOS os caches.
 * 3. O reload one-shot usa localStorage (nao sessionStorage) para nao
 *    repetir em abas diferentes da mesma sessao.
 * 4. Respeita a flag SW_PURGE_FLAG do buildVersion — se buildVersion ja
 *    fez purge, nao repetir.
 *
 * One-shot por browser (localStorage), nao por aba.
 */
async function cleanupLegacyServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || typeof caches === 'undefined') return false;

  // Se o SW atual ja esta controlando a pagina, os caches sao legitimos.
  // Nao purgar — o activate handler do SW ja cuida de limpar caches stale
  // com prefixo workbox-/zapp-.
  if (navigator.serviceWorker.controller) {
    // Garante que nao ha flag residual que cause reload surpresa.
    try { localStorage.removeItem(CACHE_RESET_FLAG); } catch { /* noop */ }
    return false;
  }

  const cacheKeys = await caches.keys();
  // Filtra apenas caches legados (workbox-/zapp-), mesmo criterio do
  // activate handler em sw.js. NUNCA purgar o HTTP cache do browser.
  const staleKeys = cacheKeys.filter((k) =>
    /^(workbox-|zapp-)/i.test(k)
  );

  if (staleKeys.length === 0) {
    try { localStorage.removeItem(CACHE_RESET_FLAG); } catch { /* noop */ }
    return false;
  }

  log.info('[ServiceWorker] Purging legacy caches (not controlled by current SW)', staleKeys);

  await Promise.all(staleKeys.map((key) => caches.delete(key)));

  // So desregistra SWs se nao ha um controller ativo (seguranca extra).
  try {
    const registrations = navigator.serviceWorker.getRegistrations
      ? await navigator.serviceWorker.getRegistrations()
      : [];
    if (registrations.length > 0) {
      await Promise.all(registrations.map((r) => r.unregister().catch(() => false)));
    }
  } catch {
    /* noop */
  }

  // One-shot: localStorage (persiste entre sessoes) para nao repetir
  // o reload em cada nova aba. Respeita flag do buildVersion tambem.
  try {
    if (localStorage.getItem(CACHE_RESET_FLAG) !== '1') {
      // Coordenacao: se buildVersion ja fez purge, nao recarregar.
      const buildPurged = sessionStorage.getItem('zapp-workbox-purged-once') === '1';
      if (!buildPurged) {
        localStorage.setItem(CACHE_RESET_FLAG, '1');
        window.location.reload();
        return true;
      }
    }
  } catch {
    /* storage full/disabled — recarregar mesmo assim para limpar caches */
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
    // Purga apenas caches com prefixo workbox-/zapp- (mesmo criterio do
    // activate handler em sw.js), nao o HTTP cache do browser.
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      const staleKeys = keys.filter((k) => /^(workbox-|zapp-)/i.test(k));
      await Promise.all(staleKeys.map((k) => caches.delete(k).catch(() => false)));
    }
    // Limpa flags para permitir que uma futura mudanca de versao volte a
    // funcionar sem ficar presa em "ja purguei nesta sessao".
    try {
      sessionStorage.removeItem('zapp_sw_purged_v3');
      sessionStorage.removeItem('zapp-build-reload-state');
      sessionStorage.removeItem('zapp-build-reload-once'); // legado
      sessionStorage.removeItem('zapp-workbox-purged-once');
      sessionStorage.removeItem('sw-cache-reset-done');
      localStorage.removeItem('sw-cache-reset-done');
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
            // A sw.js just activated. The stamped SW posts SW_UPDATED on EVERY
            // activate — including the first install on a normal load, where the
            // SW and this tab's JS come from the SAME deploy. Reloading in that
            // case creates a purge -> reload -> re-register -> re-activate loop
            // (the RELOAD_FLAG guard only masks it, at the cost of one wasted
            // reload per page load). Only hard-refresh when the activated SW is
            // genuinely NEWER than the bundle this tab is running.
            //
            // FIX: usa requestGracefulRefresh (janela de cortesia de 60s) em vez
            // de forceBundleRefresh imediato. O SW_UPDATED chega logo após o
            // activate do novo SW — antes que o CDN propague todos os novos
            // chunks. O reload imediato servia a HTML antiga do cache com chunks
            // novos que ainda não existiam → "Failed to fetch dynamically imported
            // module". Com a janela de 60s o CDN tem tempo de propagar.
            void import('@/lib/buildVersion').then(
              ({ requestGracefulRefresh, getCurrentBuildId }) => {
                // Verifica disposed após import dinâmico assíncrono para evitar
                // chamar requestGracefulRefresh após o hook ter sido desmontado.
                if (disposed) return;
                const swBuildId =
                  typeof event.data.buildId === 'string' ? event.data.buildId : undefined;
                const currentBuildId = getCurrentBuildId();
                if (!swBuildId || swBuildId === 'unknown' || swBuildId === currentBuildId) {
                  log.debug(
                    '[ServiceWorker] SW_UPDATED for the running build — no reload needed',
                    { swBuildId, currentBuildId }
                  );
                  return;
                }
                log.info(
                  '[ServiceWorker] SW_UPDATED for a newer build — scheduling graceful refresh',
                  { swBuildId, currentBuildId }
                );
                requestGracefulRefresh(`sw-updated:${swBuildId}`, swBuildId);
              }
            ).catch((err: unknown) => {
              // import() dinâmico pode rejeitar (chunk removido em redeploy) —
              // sem handler vira unhandled rejection no handler do SW.
              log.warn('[ServiceWorker] Falha ao carregar buildVersion no SW_UPDATED:', err);
            });
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
