import { describe, it, expect, beforeEach, vi } from 'vitest';
import { crossTabDedupe, __resetCrossTabDedupeForTests } from '@/lib/crossTabSendDedupe';

// Use unique keys per test to avoid localStorage cross-test interference.
let uid = 0;
function nextKey(base = 'dedupe-key'): string {
  return `${base}-${++uid}`;
}

beforeEach(() => {
  localStorage.clear();
  __resetCrossTabDedupeForTests();
});

// ── single-tab leader path ────────────────────────────────────────────────────

describe('crossTabDedupe — single-tab leader path', () => {
  it('returns the work result', async () => {
    const result = await crossTabDedupe(nextKey(), async () => 42);
    expect(result).toBe(42);
  });

  it('calls work exactly once', async () => {
    const work = vi.fn(async () => 'ok');
    await crossTabDedupe(nextKey(), work);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('returns string results', async () => {
    const result = await crossTabDedupe(nextKey(), async () => 'hello');
    expect(result).toBe('hello');
  });

  it('returns object results', async () => {
    const obj = { id: 1, status: 'sent' };
    const result = await crossTabDedupe(nextKey(), async () => obj);
    expect(result).toEqual(obj);
  });

  it('returns null', async () => {
    const result = await crossTabDedupe(nextKey(), async () => null);
    expect(result).toBeNull();
  });

  it('propagates errors from work', async () => {
    await expect(
      crossTabDedupe(nextKey(), async () => { throw new Error('work-failed'); })
    ).rejects.toThrow('work-failed');
  });

  it('propagates non-Error throws from work', async () => {
    await expect(
      crossTabDedupe(nextKey(), async () => { throw 'string-error'; })
    ).rejects.toBe('string-error');
  });
});

// ── __resetCrossTabDedupeForTests ─────────────────────────────────────────────

describe('__resetCrossTabDedupeForTests', () => {
  it('does not throw', () => {
    expect(() => __resetCrossTabDedupeForTests()).not.toThrow();
  });

  it('allows a fresh channel to be acquired on next call', async () => {
    __resetCrossTabDedupeForTests();
    // Next dedupe call should still work normally (channel re-created)
    const result = await crossTabDedupe(nextKey(), async () => 'fresh');
    expect(result).toBe('fresh');
  });
});

// ── re-entry (same tab, same key) ────────────────────────────────────────────

describe('crossTabDedupe — same-tab re-entry', () => {
  it('both calls succeed when the same tab calls with the same key', async () => {
    const key = nextKey();
    const work = vi.fn(async () => 'same-tab');
    // First call claims leadership and completes
    await crossTabDedupe(key, work, { ttlMs: 100 });
    // After the first call, the claim is released by a setTimeout(ttlMs).
    // Within ttlMs, re-entry returns isLeader=true for same tabId,
    // so both are leaders (each runs work). Just verify no throw.
    const result2 = await crossTabDedupe(key, work, { ttlMs: 100 });
    expect(result2).toBe('same-tab');
  });
});

// ── two-tab simulation via __tabIdForTests ────────────────────────────────────

describe('crossTabDedupe — two-tab simulation', () => {
  it('leader runs work; follower receives the replayed value', async () => {
    const key = nextKey();
    const work = vi.fn(async () => 'shared-result');

    // tab-a runs synchronously to the first await → claims leadership.
    // tab-b checks localStorage AFTER tab-a has written its claim → becomes follower.
    const [r1, r2] = await Promise.all([
      crossTabDedupe(key, work, { __tabIdForTests: 'tab-a', ttlMs: 2_000 }),
      crossTabDedupe(key, work, { __tabIdForTests: 'tab-b', ttlMs: 2_000 }),
    ]);

    expect(r1).toBe('shared-result');
    expect(r2).toBe('shared-result');
    // Leader ran work; follower received the broadcast and did NOT re-run work.
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('follower skips work when replayResponse is false', async () => {
    const key = nextKey();
    const work = vi.fn(async () => 'leader-only');

    const [r1, r2] = await Promise.all([
      crossTabDedupe(key, work, { __tabIdForTests: 'tab-a', ttlMs: 2_000 }),
      crossTabDedupe(key, work, { __tabIdForTests: 'tab-b', ttlMs: 2_000, replayResponse: false }),
    ]);

    expect(r1).toBe('leader-only');
    // replayResponse: false → follower returns undefined without waiting for broadcast
    expect(r2).toBeUndefined();
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('follower falls back to running locally when leader throws', async () => {
    const key = nextKey();
    // Leader throws → broadcasts ok:false → follower receives the error broadcast
    // and falls back to running its own work locally (design: "better duplicate than stuck UI").
    const [p1, p2] = [
      crossTabDedupe(key, async () => { throw new Error('leader-err'); }, {
        __tabIdForTests: 'tab-a', ttlMs: 2_000,
      }),
      crossTabDedupe(key, async () => 'fallback-value', {
        __tabIdForTests: 'tab-b', ttlMs: 2_000,
      }),
    ];

    await expect(p1).rejects.toThrow('leader-err');
    // Follower ran its own work after receiving the error broadcast
    expect(await p2).toBe('fallback-value');
  });
});
