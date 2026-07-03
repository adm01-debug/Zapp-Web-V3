import { useCallback } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('useViewTransition');

/**
 * Hook that wraps navigation actions in the View Transitions API
 * when supported, with graceful fallback for unsupported browsers.
 *
 * The three promise-based slots on a ViewTransition object
 * (finished / ready / updateCallbackDone) can all reject with
 * `DOMException: AbortError` or `TimeoutError` when a new transition
 * interrupts an in-flight one. This is normal and expected behaviour
 * during rapid navigation; we log at debug level so the signal isn't
 * completely lost in production without polluting the console.
 */
export function useViewTransition() {
  const startTransition = useCallback((callback: () => void) => {
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => {
        finished: Promise<void>;
        ready: Promise<void>;
        updateCallbackDone: Promise<void>;
      };
    };

    if (doc.startViewTransition) {
      const transition = doc.startViewTransition(callback);
      // Log at debug level — AbortError/TimeoutError here are harmless and
      // happen when rapid navigation starts a new transition before the
      // previous one finishes.
      transition.finished.catch((err: unknown) => {
        log.debug('ViewTransition.finished rejected (aborted by rapid navigation)', err);
      });
      transition.ready.catch((err: unknown) => {
        log.debug('ViewTransition.ready rejected', err);
      });
      transition.updateCallbackDone.catch((err: unknown) => {
        log.debug('ViewTransition.updateCallbackDone rejected', err);
      });
    } else {
      callback();
    }
  }, []);

  return { startTransition };
}
