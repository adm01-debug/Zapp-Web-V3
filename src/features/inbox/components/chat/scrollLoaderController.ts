/**
 * Pure scroll-trigger controller for "load older messages on scroll-to-top".
 *
 * Encapsulates the three guards used in ChatMessagesArea:
 *   1. Time-based throttle: ignore triggers that come within `triggerThrottleMs`.
 *   2. In-flight lock: only one onLoadOlder may be running at a time.
 *   3. Reverse-scroll cancel: if the user scrolls DOWN past `reverseCancelPx`
 *      while a fetch is in-flight, abort it via onCancelLoadOlder.
 *
 * Stateful but framework-agnostic — easy to unit test without a DOM.
 */

export interface ScrollLoaderOptions {
  triggerThrottleMs?: number;
  reverseCancelPx?: number;
  hasMoreOlder: () => boolean;
  isLoadingOlder: () => boolean;
  onLoadOlder: () => void | Promise<void>;
  onCancelLoadOlder?: () => void;
  /** Provides current scroll height (used to anchor scroll position after prepend). */
  getScrollHeight: () => number;
  now?: () => number;
}

export interface ScrollLoaderController {
  /** Call on every scroll event with the current scrollTop. */
  onScroll(currentTop: number, preloadPx: number): void;
  /** Call on wheel/touch when user is intending to scroll up near the top. */
  triggerLoad(): void;
  /** True if a fetch is currently in-flight. */
  isFetching(): boolean;
  /** True if last in-flight fetch was cancelled. */
  wasCancelled(): boolean;
  /** Last saved scrollHeight (or null if cancelled / never set). */
  savedScrollHeight(): number | null;
  /**
   * Clear ONLY the saved scrollHeight anchor (used after a successful prepend
   * has been re-anchored). Unlike `reset()`, this preserves throttle window,
   * lastScrollTop and the in-flight flag so subsequent triggers still respect
   * timing guards.
   */
  clearSavedHeight(): void;
  /** Reset internal state — for tests / unmount. */
  reset(): void;
}

/** Creates a stateful, framework-agnostic controller that throttles and guards scroll-triggered older-message loading. */
export function createScrollLoaderController(opts: ScrollLoaderOptions): ScrollLoaderController {
  const triggerThrottleMs = opts.triggerThrottleMs ?? 250;
  const reverseCancelPx = opts.reverseCancelPx ?? 50;
  const now = opts.now ?? (() => Date.now());

  let isFetching = false;
  let cancelled = false;
  let lastTriggerAt = 0;
  let lastScrollTop = 0;
  let savedScrollHeight: number | null = null;

  const triggerLoad = () => {
    if (!opts.hasMoreOlder() || opts.isLoadingOlder() || isFetching) return;
    const ts = now();
    if (ts - lastTriggerAt < triggerThrottleMs) return;
    lastTriggerAt = ts;
    isFetching = true;
    cancelled = false;
    savedScrollHeight = opts.getScrollHeight();
    Promise.resolve(opts.onLoadOlder()).finally(() => {
      // Mirror small grace window used in component.
      isFetching = false;
    });
  };

  // preloadPx is captured per onScroll call so cancel can use the same threshold
  // the consumer is currently applying to trigger loads.
  let lastPreloadPx = 0;

  const maybeCancel = (currentTop: number) => {
    // Cancel ONLY when the user has clearly left the top zone — i.e. they
    // scrolled past the preload threshold AND moved down by more than
    // reverseCancelPx. Prevents spurious cancellations from jitter near top.
    if (!isFetching || !opts.onCancelLoadOlder) return;
    const movedDownEnough = currentTop > lastScrollTop + reverseCancelPx;
    const leftTopZone = currentTop > lastPreloadPx;
    if (movedDownEnough && leftTopZone) {
      cancelled = true;
      opts.onCancelLoadOlder();
      savedScrollHeight = null;
      isFetching = false;
    }
  };

  return {
    onScroll(currentTop, preloadPx) {
      lastPreloadPx = preloadPx;
      maybeCancel(currentTop);
      if (currentTop < preloadPx) triggerLoad();
      lastScrollTop = currentTop;
    },
    triggerLoad,
    isFetching: () => isFetching,
    wasCancelled: () => cancelled,
    savedScrollHeight: () => savedScrollHeight,
    clearSavedHeight() {
      savedScrollHeight = null;
    },
    reset() {
      isFetching = false;
      cancelled = false;
      lastTriggerAt = 0;
      lastScrollTop = 0;
      lastPreloadPx = 0;
      savedScrollHeight = null;
    },
  };
}
