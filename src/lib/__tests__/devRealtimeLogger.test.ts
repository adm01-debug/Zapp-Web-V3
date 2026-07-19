import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  subscribeFanoutBus,
  getFanoutSubscriptions,
  getFanoutLastEvents,
  getFanoutRecentEvents,
  clearFanoutHistory,
  logMessagesSubscribe,
  wrapMessagesHandler,
} from '@/lib/devRealtimeLogger';
import type { FanoutEventRecord } from '@/lib/devRealtimeLogger';

// The module-level subscriptions Map is NOT cleared by clearFanoutHistory.
// Each test uses unique hookNames keyed with a test-local suffix to avoid
// cross-test interference.
let uid = 0;
function nextHook(base = 'hook'): string {
  return `${base}-${++uid}`;
}

beforeEach(() => {
  clearFanoutHistory();
});

// ── clearFanoutHistory ────────────────────────────────────────────────────────

describe('clearFanoutHistory', () => {
  it('empties recentEvents', () => {
    const h = nextHook();
    const wrapped = wrapMessagesHandler(h, () => {});
    wrapped({ eventType: 'INSERT', new: { id: 1 } });
    clearFanoutHistory();
    expect(getFanoutRecentEvents()).toHaveLength(0);
  });

  it('empties lastEventByHook', () => {
    const h = nextHook();
    const wrapped = wrapMessagesHandler(h, () => {});
    wrapped({ eventType: 'UPDATE', new: { id: 2 } });
    clearFanoutHistory();
    expect(getFanoutLastEvents().size).toBe(0);
  });

  it('notifies subscribed listeners', () => {
    const cb = vi.fn();
    const unsub = subscribeFanoutBus(cb);
    try {
      clearFanoutHistory();
      expect(cb).toHaveBeenCalled();
    } finally {
      unsub();
    }
  });
});

// ── subscribeFanoutBus ────────────────────────────────────────────────────────

describe('subscribeFanoutBus', () => {
  it('calls the listener when logMessagesSubscribe fires', () => {
    const cb = vi.fn();
    const unsub = subscribeFanoutBus(cb);
    try {
      logMessagesSubscribe(nextHook(), { event: 'INSERT' });
      expect(cb).toHaveBeenCalled();
    } finally {
      unsub();
    }
  });

  it('stops calling the listener after unsubscribing', () => {
    const cb = vi.fn();
    const unsub = subscribeFanoutBus(cb);
    unsub();
    logMessagesSubscribe(nextHook(), { event: 'INSERT' });
    expect(cb).not.toHaveBeenCalled();
  });

  it('supports multiple independent listeners', () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const u1 = subscribeFanoutBus(cb1);
    const u2 = subscribeFanoutBus(cb2);
    try {
      clearFanoutHistory();
      expect(cb1).toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
    } finally {
      u1();
      u2();
    }
  });

  it('does not throw when a listener throws', () => {
    const bad = vi.fn(() => { throw new Error('boom'); });
    const unsub = subscribeFanoutBus(bad);
    try {
      expect(() => clearFanoutHistory()).not.toThrow();
    } finally {
      unsub();
    }
  });
});

// ── logMessagesSubscribe ──────────────────────────────────────────────────────

describe('logMessagesSubscribe', () => {
  it('adds an entry to getFanoutSubscriptions()', () => {
    const h = nextHook('sub');
    const before = getFanoutSubscriptions().length;
    logMessagesSubscribe(h, { event: 'INSERT', table: 'messages' });
    expect(getFanoutSubscriptions().length).toBe(before + 1);
  });

  it('records the hookName in the subscription entry', () => {
    const h = nextHook('sub');
    logMessagesSubscribe(h, { event: 'UPDATE' });
    const found = getFanoutSubscriptions().find((s) => s.hookName === h);
    expect(found).toBeDefined();
    expect(found?.hookName).toBe(h);
  });

  it('records the bind details', () => {
    const h = nextHook('sub');
    const bind = { event: 'DELETE', schema: 'zapp', table: 'messages', filter: 'id=eq.1' };
    logMessagesSubscribe(h, bind);
    const found = getFanoutSubscriptions().find((s) => s.hookName === h);
    expect(found?.bind).toEqual(bind);
  });

  it('overwrites a previous entry with the same hookName+event+filter combo', () => {
    const h = nextHook('sub');
    const before = getFanoutSubscriptions().length;
    logMessagesSubscribe(h, { event: 'INSERT' });
    logMessagesSubscribe(h, { event: 'INSERT' }); // same key
    // Count should not have grown by 2
    expect(getFanoutSubscriptions().length).toBe(before + 1);
  });

  it('notifies bus listeners', () => {
    const cb = vi.fn();
    const unsub = subscribeFanoutBus(cb);
    try {
      logMessagesSubscribe(nextHook(), { event: 'INSERT' });
      expect(cb).toHaveBeenCalled();
    } finally {
      unsub();
    }
  });
});

// ── getFanoutSubscriptions / getFanoutLastEvents / getFanoutRecentEvents ──────

describe('getFanoutSubscriptions', () => {
  it('returns an array (copy) of recorded subscriptions', () => {
    const result = getFanoutSubscriptions();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('getFanoutLastEvents', () => {
  it('returns an empty Map before any events are recorded', () => {
    expect(getFanoutLastEvents().size).toBe(0);
  });

  it('returns a copy — mutations do not affect internal state', () => {
    const map = getFanoutLastEvents();
    map.set('ghost', { hookName: 'ghost', eventType: 'X', rowId: null, receivedAt: 0 });
    expect(getFanoutLastEvents().has('ghost')).toBe(false);
  });
});

describe('getFanoutRecentEvents', () => {
  it('returns an empty array before any events are recorded', () => {
    expect(getFanoutRecentEvents()).toHaveLength(0);
  });

  it('returns a copy — mutations do not affect internal state', () => {
    const arr = getFanoutRecentEvents();
    arr.push({ hookName: 'ghost', eventType: 'X', rowId: null, receivedAt: 0 });
    expect(getFanoutRecentEvents()).toHaveLength(0);
  });
});

// ── wrapMessagesHandler ───────────────────────────────────────────────────────

describe('wrapMessagesHandler — forwards to original handler', () => {
  it('calls the original handler with the payload', () => {
    const original = vi.fn();
    const wrapped = wrapMessagesHandler(nextHook(), original);
    const payload = { eventType: 'INSERT', new: { id: 99 } };
    wrapped(payload);
    expect(original).toHaveBeenCalledWith(payload);
  });

  it('calls the original handler even if recording throws (resilience)', () => {
    const original = vi.fn();
    const wrapped = wrapMessagesHandler(nextHook(), original);
    // Passing undefined-like payload to stress the try/catch path
    wrapped(null as unknown as object);
    expect(original).toHaveBeenCalled();
  });
});

describe('wrapMessagesHandler — records events in the bus', () => {
  it('adds an entry to recentEvents after invocation', () => {
    const h = nextHook();
    const wrapped = wrapMessagesHandler(h, () => {});
    wrapped({ eventType: 'INSERT', new: { id: 10 } });
    const events = getFanoutRecentEvents();
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].hookName).toBe(h);
  });

  it('records the eventType from the payload', () => {
    const h = nextHook();
    const wrapped = wrapMessagesHandler(h, () => {});
    wrapped({ eventType: 'UPDATE', new: { id: 5 } });
    const record = getFanoutLastEvents().get(h);
    expect(record?.eventType).toBe('UPDATE');
  });

  it('records the rowId from new.id', () => {
    const h = nextHook();
    const wrapped = wrapMessagesHandler(h, () => {});
    wrapped({ eventType: 'INSERT', new: { id: 42 } });
    const record = getFanoutLastEvents().get(h);
    expect(record?.rowId).toBe('42');
  });

  it('records the rowId from old.id when new is absent', () => {
    const h = nextHook();
    const wrapped = wrapMessagesHandler(h, () => {});
    wrapped({ eventType: 'DELETE', old: { id: 7 } });
    const record = getFanoutLastEvents().get(h);
    expect(record?.rowId).toBe('7');
  });

  it('records rowId as null when both new and old are absent', () => {
    const h = nextHook();
    const wrapped = wrapMessagesHandler(h, () => {});
    wrapped({ eventType: 'SYSTEM' });
    const record = getFanoutLastEvents().get(h);
    expect(record?.rowId).toBeNull();
  });

  it('updates lastEventByHook with the most recent event', () => {
    const h = nextHook();
    const wrapped = wrapMessagesHandler(h, () => {});
    wrapped({ eventType: 'INSERT', new: { id: 1 } });
    wrapped({ eventType: 'UPDATE', new: { id: 2 } });
    const record = getFanoutLastEvents().get(h) as FanoutEventRecord;
    expect(record.eventType).toBe('UPDATE');
    expect(record.rowId).toBe('2');
  });

  it('prepends to recentEvents (newest first)', () => {
    const h = nextHook();
    const wrapped = wrapMessagesHandler(h, () => {});
    wrapped({ eventType: 'INSERT', new: { id: 1 } });
    wrapped({ eventType: 'UPDATE', new: { id: 2 } });
    const events = getFanoutRecentEvents();
    expect(events[0].eventType).toBe('UPDATE');
    expect(events[1].eventType).toBe('INSERT');
  });

  it('caps recentEvents at 50 entries', () => {
    const h = nextHook();
    const wrapped = wrapMessagesHandler(h, () => {});
    for (let i = 0; i < 60; i++) {
      wrapped({ eventType: 'INSERT', new: { id: i } });
    }
    expect(getFanoutRecentEvents().length).toBeLessThanOrEqual(50);
  });

  it('notifies listeners after each event', () => {
    const cb = vi.fn();
    const unsub = subscribeFanoutBus(cb);
    try {
      const wrapped = wrapMessagesHandler(nextHook(), () => {});
      wrapped({ eventType: 'INSERT', new: { id: 1 } });
      expect(cb).toHaveBeenCalled();
    } finally {
      unsub();
    }
  });

  it('tracks independent lastEvents per hookName', () => {
    const h1 = nextHook();
    const h2 = nextHook();
    const w1 = wrapMessagesHandler(h1, () => {});
    const w2 = wrapMessagesHandler(h2, () => {});
    w1({ eventType: 'INSERT', new: { id: 1 } });
    w2({ eventType: 'DELETE', old: { id: 9 } });
    const events = getFanoutLastEvents();
    expect(events.get(h1)?.eventType).toBe('INSERT');
    expect(events.get(h2)?.eventType).toBe('DELETE');
  });
});
