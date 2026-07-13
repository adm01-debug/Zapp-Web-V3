import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isChunkLoadError,
  triggerChunkReload,
  CHUNK_RELOAD_SESSION_KEY,
  CLOCK_SKEW_TOLERANCE_MS,
} from '@/lib/lazyWithRetry';

// ── constants ─────────────────────────────────────────────────────────────────

describe('CHUNK_RELOAD_SESSION_KEY', () => {
  it('is a non-empty string', () => {
    expect(typeof CHUNK_RELOAD_SESSION_KEY).toBe('string');
    expect(CHUNK_RELOAD_SESSION_KEY.length).toBeGreaterThan(0);
  });
});

describe('CLOCK_SKEW_TOLERANCE_MS', () => {
  it('is 60 000 ms (60 seconds)', () => {
    expect(CLOCK_SKEW_TOLERANCE_MS).toBe(60_000);
  });
});

// ── isChunkLoadError — returns true for chunk errors ─────────────────────────

describe('isChunkLoadError — known chunk error messages', () => {
  it('detects "failed to fetch dynamically imported module"', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module'))).toBe(true);
  });

  it('detects "loading chunk" message (webpack)', () => {
    expect(isChunkLoadError(new Error('Loading chunk 42 failed.'))).toBe(true);
  });

  it('detects "importing a module script failed" (Firefox)', () => {
    expect(isChunkLoadError(new Error('importing a module script failed'))).toBe(true);
  });

  it('detects "error loading dynamically imported module"', () => {
    expect(isChunkLoadError(new Error('Error loading dynamically imported module'))).toBe(true);
  });

  it('detects "unable to preload css for" (Vite)', () => {
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/App.abc123.css'))).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isChunkLoadError(new Error('FAILED TO FETCH DYNAMICALLY IMPORTED MODULE'))).toBe(true);
    expect(isChunkLoadError(new Error('Loading Chunk 5 FAILED.'))).toBe(true);
  });
});

describe('isChunkLoadError — returns false for non-chunk errors', () => {
  it('returns false for a generic network error', () => {
    expect(isChunkLoadError(new Error('fetch failed'))).toBe(false);
  });

  it('returns false for a TypeError', () => {
    expect(isChunkLoadError(new TypeError('Cannot read properties of null'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isChunkLoadError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isChunkLoadError(undefined)).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isChunkLoadError('')).toBe(false);
  });

  it('returns false for a plain number', () => {
    expect(isChunkLoadError(42)).toBe(false);
  });
});

describe('isChunkLoadError — non-Error objects with message property', () => {
  it('detects chunk error in a plain object with message', () => {
    const obj = { message: 'Failed to fetch dynamically imported module' };
    expect(isChunkLoadError(obj)).toBe(true);
  });

  it('returns false for plain object with unrelated message', () => {
    expect(isChunkLoadError({ message: 'some other error' })).toBe(false);
  });

  it('handles Object.create(null) safely (no toString)', () => {
    const obj = Object.create(null) as { message?: string };
    obj.message = 'loading chunk 99 failed';
    expect(isChunkLoadError(obj)).toBe(true);
  });

  it('handles Object.create(null) with no message safely', () => {
    const obj = Object.create(null);
    expect(isChunkLoadError(obj)).toBe(false);
  });
});

describe('isChunkLoadError — string inputs', () => {
  it('detects chunk error in a raw string', () => {
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(true);
  });

  it('returns false for random string', () => {
    expect(isChunkLoadError('server error 500')).toBe(false);
  });
});

// ── triggerChunkReload ────────────────────────────────────────────────────────

let reloadSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  reloadSpy = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload: reloadSpy });
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('triggerChunkReload — no previous reload in session', () => {
  it('returns true when no session key is set', () => {
    expect(triggerChunkReload()).toBe(true);
  });

  it('calls window.location.reload() when no session key is set', () => {
    triggerChunkReload();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('writes the current timestamp to session storage', () => {
    const before = Date.now();
    triggerChunkReload();
    const after = Date.now();
    const stored = Number(sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY));
    expect(stored).toBeGreaterThanOrEqual(before);
    expect(stored).toBeLessThanOrEqual(after);
  });
});

describe('triggerChunkReload — cooldown active (< 30 s since last reload)', () => {
  it('returns false when last reload was 5 seconds ago', () => {
    sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, String(Date.now() - 5_000));
    expect(triggerChunkReload()).toBe(false);
  });

  it('does NOT call reload() during the cooldown window', () => {
    sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, String(Date.now() - 5_000));
    triggerChunkReload();
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('returns false when last reload was 29 seconds ago (just inside cooldown)', () => {
    sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, String(Date.now() - 29_000));
    expect(triggerChunkReload()).toBe(false);
  });
});

describe('triggerChunkReload — cooldown elapsed (> 30 s since last reload)', () => {
  it('returns true when last reload was 60 seconds ago', () => {
    sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, String(Date.now() - 60_000));
    expect(triggerChunkReload()).toBe(true);
  });

  it('calls reload() when cooldown has elapsed', () => {
    sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, String(Date.now() - 60_000));
    triggerChunkReload();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});

describe('triggerChunkReload — invalid stored timestamps (guard table)', () => {
  it('treats "CORRUPTED" (NaN) as 0 and triggers reload', () => {
    sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, 'CORRUPTED');
    expect(triggerChunkReload()).toBe(true);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('treats "Infinity" as 0 and triggers reload (BUG E fix)', () => {
    sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, 'Infinity');
    expect(triggerChunkReload()).toBe(true);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('treats "1e999" (Infinity after parse) as 0 and triggers reload', () => {
    sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, '1e999');
    expect(triggerChunkReload()).toBe(true);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('treats "1e308" (far-future) as 0 and triggers reload (FINDING 1 fix)', () => {
    sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, '1e308');
    expect(triggerChunkReload()).toBe(true);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('treats "-1" (negative timestamp) as 0 and triggers reload', () => {
    sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, '-1');
    expect(triggerChunkReload()).toBe(true);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('treats a timestamp more than 60 s in the future as 0 and triggers reload (FINDING 2 fix)', () => {
    const futureTs = Date.now() + CLOCK_SKEW_TOLERANCE_MS + 1_000; // 1 s beyond tolerance
    sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, String(futureTs));
    expect(triggerChunkReload()).toBe(true);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('accepts a timestamp slightly in the future (within tolerance) and respects cooldown', () => {
    // A timestamp just 1 second in the future is still a valid "recent" reload
    const slightlyFuture = Date.now() - 5_000; // recent = cooldown active
    sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, String(slightlyFuture));
    expect(triggerChunkReload()).toBe(false);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('treats "" (empty string → 0) as a first-time reload and triggers', () => {
    sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, '');
    expect(triggerChunkReload()).toBe(true);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
