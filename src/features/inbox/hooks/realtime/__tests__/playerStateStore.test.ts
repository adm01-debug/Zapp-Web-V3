import { describe, it, expect, beforeEach, vi } from 'vitest';
import { playerStateStore, type PlayerState } from '../playerStateStore';

beforeEach(() => {
  playerStateStore._clear();
  vi.useRealTimers();
});

// ── get ───────────────────────────────────────────────────────────────────────

describe('playerStateStore.get', () => {
  it('returns undefined for an unknown id', () => {
    expect(playerStateStore.get('missing')).toBeUndefined();
  });

  it('returns the state after set', () => {
    playerStateStore.set('msg-1', { currentTime: 5, paused: false, playbackRate: 1.5 });
    const state = playerStateStore.get('msg-1');
    expect(state).toBeDefined();
    expect(state!.currentTime).toBe(5);
    expect(state!.paused).toBe(false);
    expect(state!.playbackRate).toBe(1.5);
  });
});

// ── set ───────────────────────────────────────────────────────────────────────

describe('playerStateStore.set — defaults', () => {
  it('applies default currentTime=0 when not provided', () => {
    playerStateStore.set('msg-1', {});
    expect(playerStateStore.get('msg-1')!.currentTime).toBe(0);
  });

  it('applies default paused=true when not provided', () => {
    playerStateStore.set('msg-1', {});
    expect(playerStateStore.get('msg-1')!.paused).toBe(true);
  });

  it('applies default playbackRate=1 when not provided', () => {
    playerStateStore.set('msg-1', {});
    expect(playerStateStore.get('msg-1')!.playbackRate).toBe(1);
  });

  it('sets a recent updatedAt timestamp', () => {
    const before = Date.now();
    playerStateStore.set('msg-1', {});
    const after = Date.now();
    const { updatedAt } = playerStateStore.get('msg-1')!;
    expect(updatedAt).toBeGreaterThanOrEqual(before);
    expect(updatedAt).toBeLessThanOrEqual(after);
  });
});

describe('playerStateStore.set — partial updates', () => {
  it('merges partial updates preserving existing fields', () => {
    playerStateStore.set('msg-1', { currentTime: 10, paused: false, playbackRate: 1.5 });
    playerStateStore.set('msg-1', { currentTime: 20 });
    const state = playerStateStore.get('msg-1')!;
    expect(state.currentTime).toBe(20);
    expect(state.paused).toBe(false);
    expect(state.playbackRate).toBe(1.5);
  });

  it('overrides paused independently', () => {
    playerStateStore.set('msg-1', { paused: false });
    playerStateStore.set('msg-1', { paused: true });
    expect(playerStateStore.get('msg-1')!.paused).toBe(true);
  });

  it('stores distinct states for distinct ids', () => {
    playerStateStore.set('msg-a', { currentTime: 1 });
    playerStateStore.set('msg-b', { currentTime: 2 });
    expect(playerStateStore.get('msg-a')!.currentTime).toBe(1);
    expect(playerStateStore.get('msg-b')!.currentTime).toBe(2);
  });
});

// ── _size ─────────────────────────────────────────────────────────────────────

describe('playerStateStore._size', () => {
  it('starts at 0 after _clear', () => {
    expect(playerStateStore._size()).toBe(0);
  });

  it('increments on set', () => {
    playerStateStore.set('a', {});
    expect(playerStateStore._size()).toBe(1);
    playerStateStore.set('b', {});
    expect(playerStateStore._size()).toBe(2);
  });

  it('does not increment when updating an existing id', () => {
    playerStateStore.set('a', { currentTime: 1 });
    playerStateStore.set('a', { currentTime: 2 });
    expect(playerStateStore._size()).toBe(1);
  });
});

// ── delete ────────────────────────────────────────────────────────────────────

describe('playerStateStore.delete', () => {
  it('removes the entry', () => {
    playerStateStore.set('msg-1', {});
    playerStateStore.delete('msg-1');
    expect(playerStateStore.get('msg-1')).toBeUndefined();
  });

  it('is a no-op for an id that does not exist', () => {
    expect(() => playerStateStore.delete('nope')).not.toThrow();
  });

  it('reduces size by 1', () => {
    playerStateStore.set('msg-1', {});
    playerStateStore.set('msg-2', {});
    playerStateStore.delete('msg-1');
    expect(playerStateStore._size()).toBe(1);
  });
});

// ── migrate ───────────────────────────────────────────────────────────────────

describe('playerStateStore.migrate — basic move', () => {
  it('returns true when state is moved', () => {
    playerStateStore.set('opt:123', { currentTime: 8 });
    expect(playerStateStore.migrate('opt:123', 'uuid-456')).toBe(true);
  });

  it('the canonical id carries the original state', () => {
    playerStateStore.set('opt:123', { currentTime: 8, paused: false, playbackRate: 2 });
    playerStateStore.migrate('opt:123', 'uuid-456');
    const state = playerStateStore.get('uuid-456')!;
    expect(state.currentTime).toBe(8);
    expect(state.paused).toBe(false);
    expect(state.playbackRate).toBe(2);
  });

  it('removes the optimistic id after migration', () => {
    playerStateStore.set('opt:123', { currentTime: 8 });
    playerStateStore.migrate('opt:123', 'uuid-456');
    expect(playerStateStore.get('opt:123')).toBeUndefined();
  });
});

describe('playerStateStore.migrate — edge cases', () => {
  it('returns false when from === to', () => {
    playerStateStore.set('same', { currentTime: 3 });
    expect(playerStateStore.migrate('same', 'same')).toBe(false);
  });

  it('returns false when from has no state', () => {
    expect(playerStateStore.migrate('ghost', 'uuid-456')).toBe(false);
  });

  it('is idempotent — calling migrate twice is safe', () => {
    playerStateStore.set('opt:123', { currentTime: 5 });
    playerStateStore.migrate('opt:123', 'uuid-456');
    expect(() => playerStateStore.migrate('opt:123', 'uuid-456')).not.toThrow();
    expect(playerStateStore.get('uuid-456')!.currentTime).toBe(5);
  });

  it('preserves existing destination state when it has a newer updatedAt', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    playerStateStore.set('opt:old', { currentTime: 1 });

    vi.setSystemTime(5000); // 4 s later → 'to' is newer
    playerStateStore.set('uuid-new', { currentTime: 99 });

    playerStateStore.migrate('opt:old', 'uuid-new');

    expect(playerStateStore.get('uuid-new')!.currentTime).toBe(99);
  });
});

describe('playerStateStore.migrate — listeners', () => {
  it('notifies onMigrate listener with from and to ids', () => {
    const calls: [string, string][] = [];
    playerStateStore.onMigrate((from, to) => calls.push([from, to]));
    playerStateStore.set('opt:123', { currentTime: 1 });
    playerStateStore.migrate('opt:123', 'uuid-456');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(['opt:123', 'uuid-456']);
  });

  it('does not notify listener when from has no state', () => {
    const calls: [string, string][] = [];
    playerStateStore.onMigrate((from, to) => calls.push([from, to]));
    playerStateStore.migrate('ghost', 'uuid-456');
    expect(calls).toHaveLength(0);
  });

  it('does not notify listener when from === to', () => {
    const calls: [string, string][] = [];
    playerStateStore.set('same', {});
    playerStateStore.onMigrate((from, to) => calls.push([from, to]));
    playerStateStore.migrate('same', 'same');
    expect(calls).toHaveLength(0);
  });

  it('unsubscribe removes listener', () => {
    const calls: [string, string][] = [];
    const unsub = playerStateStore.onMigrate((from, to) => calls.push([from, to]));
    unsub();
    playerStateStore.set('opt:123', { currentTime: 1 });
    playerStateStore.migrate('opt:123', 'uuid-456');
    expect(calls).toHaveLength(0);
  });

  it('multiple listeners all receive the notification', () => {
    const a: string[] = [];
    const b: string[] = [];
    playerStateStore.onMigrate((from) => a.push(from));
    playerStateStore.onMigrate((from) => b.push(from));
    playerStateStore.set('opt:1', {});
    playerStateStore.migrate('opt:1', 'uuid-1');
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('a throwing listener does not prevent others from being notified', () => {
    const good: string[] = [];
    playerStateStore.onMigrate(() => { throw new Error('boom'); });
    playerStateStore.onMigrate((from) => good.push(from));
    playerStateStore.set('opt:1', {});
    expect(() => playerStateStore.migrate('opt:1', 'uuid-1')).not.toThrow();
    expect(good).toHaveLength(1);
  });
});

// ── TTL / GC ──────────────────────────────────────────────────────────────────

describe('playerStateStore — GC (TTL eviction)', () => {
  it('evicts entries older than 30 min when size exceeds 200', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    // Fill 200 entries at time 0
    for (let i = 0; i < 200; i++) {
      playerStateStore.set(`msg-${i}`, { currentTime: i });
    }
    expect(playerStateStore._size()).toBe(200);

    // Advance 31 minutes — entries are now stale
    vi.setSystemTime(31 * 60 * 1000);

    // Adding one more triggers gc (size > 200 after this set)
    playerStateStore.set('msg-trigger', { currentTime: 999 });

    // All 200 old entries should be evicted; only the new one remains
    expect(playerStateStore._size()).toBe(1);
    expect(playerStateStore.get('msg-trigger')!.currentTime).toBe(999);
  });

  it('does not evict entries that are still within the TTL window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    for (let i = 0; i < 200; i++) {
      playerStateStore.set(`msg-${i}`, {});
    }

    // Only 20 min elapsed — entries are still fresh
    vi.setSystemTime(20 * 60 * 1000);

    // Trigger the gc path
    playerStateStore.set('msg-trigger', {});

    // All 201 entries should still be present
    expect(playerStateStore._size()).toBe(201);
  });
});

// ── _clear ────────────────────────────────────────────────────────────────────

describe('playerStateStore._clear', () => {
  it('empties the store', () => {
    playerStateStore.set('a', {});
    playerStateStore.set('b', {});
    playerStateStore._clear();
    expect(playerStateStore._size()).toBe(0);
  });

  it('removes all listeners', () => {
    const calls: string[] = [];
    playerStateStore.onMigrate((from) => calls.push(from));
    playerStateStore._clear();
    playerStateStore.set('opt:1', {});
    playerStateStore.migrate('opt:1', 'uuid-1'); // should not notify
    expect(calls).toHaveLength(0);
  });
});
