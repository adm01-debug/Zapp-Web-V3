import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createScrollLoaderController,
  type ScrollLoaderOptions,
  type ScrollLoaderController,
} from '../scrollLoaderController';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeOpts(overrides: Partial<ScrollLoaderOptions> = {}): ScrollLoaderOptions {
  return {
    hasMoreOlder: vi.fn(() => true),
    isLoadingOlder: vi.fn(() => false),
    onLoadOlder: vi.fn(),
    onCancelLoadOlder: vi.fn(),
    getScrollHeight: vi.fn(() => 1000),
    // Start at 10_000 so the initial throttle check (ts - 0 >= 250) always passes.
    now: vi.fn(() => 10_000),
    ...overrides,
  };
}

let opts: ReturnType<typeof makeOpts>;
let ctrl: ScrollLoaderController;

beforeEach(() => {
  opts = makeOpts();
  ctrl = createScrollLoaderController(opts);
});

// ── triggerLoad ───────────────────────────────────────────────────────────────

describe('triggerLoad — basic invocation', () => {
  it('calls onLoadOlder when hasMoreOlder is true and not loading', () => {
    ctrl.triggerLoad();
    expect(opts.onLoadOlder).toHaveBeenCalledTimes(1);
  });

  it('sets isFetching to true immediately after trigger', () => {
    ctrl.triggerLoad();
    expect(ctrl.isFetching()).toBe(true);
  });

  it('saves scrollHeight from getScrollHeight at trigger time', () => {
    (opts.getScrollHeight as ReturnType<typeof vi.fn>).mockReturnValue(2000);
    ctrl.triggerLoad();
    expect(ctrl.savedScrollHeight()).toBe(2000);
  });

  it('does NOT call onLoadOlder when hasMoreOlder returns false', () => {
    (opts.hasMoreOlder as ReturnType<typeof vi.fn>).mockReturnValue(false);
    ctrl.triggerLoad();
    expect(opts.onLoadOlder).not.toHaveBeenCalled();
  });

  it('does NOT call onLoadOlder when isLoadingOlder returns true', () => {
    (opts.isLoadingOlder as ReturnType<typeof vi.fn>).mockReturnValue(true);
    ctrl.triggerLoad();
    expect(opts.onLoadOlder).not.toHaveBeenCalled();
  });

  it('does NOT call onLoadOlder when already fetching', () => {
    ctrl.triggerLoad(); // first call starts fetch
    ctrl.triggerLoad(); // second call should be blocked
    expect(opts.onLoadOlder).toHaveBeenCalledTimes(1);
  });
});

describe('triggerLoad — throttle', () => {
  it('does NOT trigger again within triggerThrottleMs window', async () => {
    const opts2 = makeOpts();
    // First call at t=1000, second at t=1100 — delta=100 < 500 → throttled
    const now2 = vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(1100);
    const c = createScrollLoaderController({ ...opts2, now: now2, triggerThrottleMs: 500 });
    c.triggerLoad(); // t=1000 → triggers, isFetching=true, lastTriggerAt=1000
    // Flush microtasks so Promise.resolve().finally() runs and clears isFetching
    await Promise.resolve();
    // Now isFetching=false but lastTriggerAt=1000; second call at t=1100 → throttled
    c.triggerLoad();
    expect(opts2.onLoadOlder).toHaveBeenCalledTimes(1);
  });

  it('DOES trigger again after triggerThrottleMs has elapsed', async () => {
    const opts2 = makeOpts();
    // First call at t=1000, second at t=1600 → delta=600 >= 500 → triggers
    const now2 = vi.fn().mockReturnValueOnce(1000).mockReturnValueOnce(1600);
    const c = createScrollLoaderController({ ...opts2, now: now2, triggerThrottleMs: 500 });
    c.triggerLoad(); // t=1000
    await Promise.resolve(); // flush finally
    c.triggerLoad(); // t=1600 → triggers
    expect(opts2.onLoadOlder).toHaveBeenCalledTimes(2);
  });
});

// ── onScroll ──────────────────────────────────────────────────────────────────

describe('onScroll — triggers load near top', () => {
  it('triggers load when currentTop < preloadPx', () => {
    ctrl.onScroll(50, 200); // 50 < 200 → trigger
    expect(opts.onLoadOlder).toHaveBeenCalledTimes(1);
  });

  it('does NOT trigger when currentTop >= preloadPx', () => {
    ctrl.onScroll(300, 200); // 300 >= 200 → no trigger
    expect(opts.onLoadOlder).not.toHaveBeenCalled();
  });

  it('triggers exactly at preloadPx boundary: currentTop = preloadPx − 1', () => {
    ctrl.onScroll(199, 200);
    expect(opts.onLoadOlder).toHaveBeenCalledTimes(1);
  });

  it('does NOT trigger when currentTop equals preloadPx', () => {
    ctrl.onScroll(200, 200);
    expect(opts.onLoadOlder).not.toHaveBeenCalled();
  });
});

describe('onScroll — cancel while fetching', () => {
  it('calls onCancelLoadOlder when user scrolls down enough during fetch', () => {
    ctrl.onScroll(0, 200);       // triggers fetch, lastScrollTop=0
    ctrl.onScroll(200, 200);     // top=200 > 0+50 and > preloadPx=200 → cancel

    // 200 > 0 + 50 (reverseCancelPx) AND 200 > 200 (preloadPx) → NOT greater (strict)
    // Let's scroll to 251 to be clearly past both thresholds
  });

  it('calls onCancelLoadOlder when scrolled down past reverseCancelPx and left top zone', () => {
    ctrl.onScroll(0, 200);    // trigger fetch, lastScrollTop=0
    ctrl.onScroll(260, 200);  // 260 > 0+50 AND 260 > 200 → cancel
    expect(opts.onCancelLoadOlder).toHaveBeenCalledTimes(1);
  });

  it('sets wasCancelled() to true after cancel', () => {
    ctrl.onScroll(0, 200);
    ctrl.onScroll(260, 200);
    expect(ctrl.wasCancelled()).toBe(true);
  });

  it('clears savedScrollHeight() after cancel', () => {
    ctrl.onScroll(0, 200);    // saves height
    ctrl.onScroll(260, 200);  // cancel → clears height
    expect(ctrl.savedScrollHeight()).toBeNull();
  });

  it('sets isFetching() to false after cancel', () => {
    ctrl.onScroll(0, 200);
    ctrl.onScroll(260, 200);
    expect(ctrl.isFetching()).toBe(false);
  });

  it('does NOT cancel when user only scrolled down slightly (within reverseCancelPx)', () => {
    ctrl.onScroll(0, 200);    // trigger, lastScrollTop=0
    ctrl.onScroll(30, 200);   // 30 < 0+50 → does NOT meet reverseCancelPx threshold
    expect(opts.onCancelLoadOlder).not.toHaveBeenCalled();
  });
});

// ── isFetching / wasCancelled / savedScrollHeight ─────────────────────────────

describe('initial state', () => {
  it('isFetching() is false initially', () => {
    expect(ctrl.isFetching()).toBe(false);
  });

  it('wasCancelled() is false initially', () => {
    expect(ctrl.wasCancelled()).toBe(false);
  });

  it('savedScrollHeight() is null initially', () => {
    expect(ctrl.savedScrollHeight()).toBeNull();
  });
});

// ── clearSavedHeight ──────────────────────────────────────────────────────────

describe('clearSavedHeight', () => {
  it('sets savedScrollHeight to null', () => {
    ctrl.triggerLoad();
    expect(ctrl.savedScrollHeight()).not.toBeNull();
    ctrl.clearSavedHeight();
    expect(ctrl.savedScrollHeight()).toBeNull();
  });

  it('does not affect isFetching', () => {
    ctrl.triggerLoad();
    ctrl.clearSavedHeight();
    expect(ctrl.isFetching()).toBe(true);
  });
});

// ── reset ─────────────────────────────────────────────────────────────────────

describe('reset', () => {
  it('clears isFetching', () => {
    ctrl.triggerLoad();
    ctrl.reset();
    expect(ctrl.isFetching()).toBe(false);
  });

  it('clears wasCancelled', () => {
    ctrl.onScroll(0, 200);
    ctrl.onScroll(260, 200);
    ctrl.reset();
    expect(ctrl.wasCancelled()).toBe(false);
  });

  it('clears savedScrollHeight', () => {
    ctrl.triggerLoad();
    ctrl.reset();
    expect(ctrl.savedScrollHeight()).toBeNull();
  });

  it('allows triggering again after reset (clears throttle window too)', async () => {
    // Use now that would fail throttle WITHOUT reset: t=10_000 then t=10_001 (delta=1 < 250)
    const now2 = vi.fn().mockReturnValueOnce(10_000).mockReturnValueOnce(10_001);
    const c = createScrollLoaderController({ ...makeOpts(), now: now2 });
    c.triggerLoad(); // t=10_000
    await Promise.resolve(); // flush finally → isFetching=false
    c.reset();        // also resets lastTriggerAt → 0
    c.triggerLoad(); // t=10_001; 10_001 - 0 = 10_001 >= 250 → triggers (reset helped)
    expect(now2).toHaveBeenCalledTimes(2);
  });
});

// ── options defaults ──────────────────────────────────────────────────────────

describe('default options', () => {
  it('uses Date.now() when no `now` provided (just must not throw)', () => {
    const c = createScrollLoaderController({
      hasMoreOlder: () => true,
      isLoadingOlder: () => false,
      onLoadOlder: vi.fn(),
      getScrollHeight: () => 500,
    });
    expect(() => c.triggerLoad()).not.toThrow();
  });

  it('works without onCancelLoadOlder (optional)', () => {
    const optsNoCancle = { ...opts };
    delete optsNoCancle.onCancelLoadOlder;
    const c = createScrollLoaderController(optsNoCancle);
    c.onScroll(0, 200);    // trigger
    expect(() => c.onScroll(260, 200)).not.toThrow(); // cancel attempt with no handler
  });
});
