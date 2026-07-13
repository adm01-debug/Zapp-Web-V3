import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from '@/lib/eventBus';

// The eventBus is a module singleton. We must call clear() in beforeEach so
// tests are fully isolated from each other.
beforeEach(() => {
  eventBus.clear();
});

// ── listenerCount ─────────────────────────────────────────────────────────────

describe('listenerCount', () => {
  it('returns 0 when no listeners are registered', () => {
    expect(eventBus.listenerCount('message:sent')).toBe(0);
  });

  it('returns 1 after one listener is added', () => {
    eventBus.on('message:sent', () => {});
    expect(eventBus.listenerCount('message:sent')).toBe(1);
  });

  it('returns 2 after two distinct listeners are added for the same event', () => {
    eventBus.on('message:sent', () => {});
    eventBus.on('message:sent', () => {});
    expect(eventBus.listenerCount('message:sent')).toBe(2);
  });

  it('counts listeners per-event independently', () => {
    eventBus.on('message:sent', () => {});
    eventBus.on('connection:status', () => {});
    eventBus.on('connection:status', () => {});
    expect(eventBus.listenerCount('message:sent')).toBe(1);
    expect(eventBus.listenerCount('connection:status')).toBe(2);
  });
});

// ── on / emit ─────────────────────────────────────────────────────────────────

describe('on — basic subscription', () => {
  it('listener is called when event is emitted', () => {
    let called = false;
    eventBus.on('message:sent', () => { called = true; });
    eventBus.emit('message:sent', { contactId: 'c1', content: 'hello' });
    expect(called).toBe(true);
  });

  it('listener receives the emitted payload', () => {
    let received: { contactId: string; content: string } | null = null;
    eventBus.on('message:sent', (p) => { received = p; });
    eventBus.emit('message:sent', { contactId: 'c1', content: 'hello' });
    expect(received).toEqual({ contactId: 'c1', content: 'hello' });
  });

  it('multiple listeners all receive the event', () => {
    const log: number[] = [];
    eventBus.on('message:sent', () => log.push(1));
    eventBus.on('message:sent', () => log.push(2));
    eventBus.emit('message:sent', { contactId: 'c1', content: 'x' });
    expect(log).toContain(1);
    expect(log).toContain(2);
    expect(log).toHaveLength(2);
  });

  it('adding the same callback twice still fires it only once', () => {
    let count = 0;
    const cb = () => { count++; };
    eventBus.on('message:sent', cb);
    eventBus.on('message:sent', cb); // Set semantics — same ref
    eventBus.emit('message:sent', { contactId: 'c1', content: 'x' });
    expect(count).toBe(1);
  });
});

describe('emit — no-op when no listeners', () => {
  it('emitting without listeners does not throw', () => {
    expect(() =>
      eventBus.emit('message:sent', { contactId: 'c1', content: 'x' })
    ).not.toThrow();
  });
});

// ── on — unsubscribe via returned function ────────────────────────────────────

describe('on — unsubscribe', () => {
  it('unsubscribe function stops the listener from receiving further events', () => {
    let count = 0;
    const unsub = eventBus.on('message:sent', () => { count++; });
    unsub();
    eventBus.emit('message:sent', { contactId: 'c1', content: 'x' });
    expect(count).toBe(0);
  });

  it('unsubscribing one listener leaves others intact', () => {
    const counts = [0, 0];
    const unsub = eventBus.on('message:sent', () => { counts[0]++; });
    eventBus.on('message:sent', () => { counts[1]++; });
    unsub();
    eventBus.emit('message:sent', { contactId: 'c1', content: 'x' });
    expect(counts[0]).toBe(0);
    expect(counts[1]).toBe(1);
  });

  it('listenerCount decrements after unsubscribe', () => {
    const unsub = eventBus.on('message:sent', () => {});
    expect(eventBus.listenerCount('message:sent')).toBe(1);
    unsub();
    expect(eventBus.listenerCount('message:sent')).toBe(0);
  });

  it('unsubscribing twice does not throw', () => {
    const unsub = eventBus.on('message:sent', () => {});
    unsub();
    expect(() => unsub()).not.toThrow();
  });
});

// ── off ───────────────────────────────────────────────────────────────────────

describe('off', () => {
  it('removes the specified listener by reference', () => {
    let count = 0;
    const cb = () => { count++; };
    eventBus.on('message:received', cb);
    eventBus.off('message:received', cb);
    eventBus.emit('message:received', { contactId: 'c1', content: 'x', sender: 's' });
    expect(count).toBe(0);
  });

  it('does not remove other listeners for the same event', () => {
    const counts = [0, 0];
    const cb1 = () => { counts[0]++; };
    const cb2 = () => { counts[1]++; };
    eventBus.on('message:received', cb1);
    eventBus.on('message:received', cb2);
    eventBus.off('message:received', cb1);
    eventBus.emit('message:received', { contactId: 'c1', content: 'x', sender: 's' });
    expect(counts[0]).toBe(0);
    expect(counts[1]).toBe(1);
  });

  it('calling off for a non-existent listener does not throw', () => {
    const cb = () => {};
    expect(() => eventBus.off('message:sent', cb)).not.toThrow();
  });
});

// ── clear ─────────────────────────────────────────────────────────────────────

describe('clear — specific event', () => {
  it('removes all listeners for the specified event', () => {
    let count = 0;
    eventBus.on('message:sent', () => { count++; });
    eventBus.on('message:sent', () => { count++; });
    eventBus.clear('message:sent');
    eventBus.emit('message:sent', { contactId: 'c1', content: 'x' });
    expect(count).toBe(0);
  });

  it('listenerCount is 0 after clear for that event', () => {
    eventBus.on('message:sent', () => {});
    eventBus.clear('message:sent');
    expect(eventBus.listenerCount('message:sent')).toBe(0);
  });

  it('does not affect listeners for other events', () => {
    let count = 0;
    eventBus.on('message:received', () => { count++; });
    eventBus.clear('message:sent');
    eventBus.emit('message:received', { contactId: 'c1', content: 'x', sender: 's' });
    expect(count).toBe(1);
  });
});

describe('clear — all events', () => {
  it('clear() with no argument removes all listeners', () => {
    let countA = 0;
    let countB = 0;
    eventBus.on('message:sent', () => { countA++; });
    eventBus.on('connection:status', () => { countB++; });
    eventBus.clear();
    eventBus.emit('message:sent', { contactId: 'c1', content: 'x' });
    eventBus.emit('connection:status', { isOnline: true, isConnected: true });
    expect(countA).toBe(0);
    expect(countB).toBe(0);
  });
});

// ── error isolation ────────────────────────────────────────────────────────────

describe('emit — error isolation', () => {
  it('a throwing listener does not prevent subsequent listeners from running', () => {
    let secondCalled = false;
    eventBus.on('message:sent', () => { throw new Error('boom'); });
    eventBus.on('message:sent', () => { secondCalled = true; });
    // Should not throw; error is swallowed by the bus
    expect(() =>
      eventBus.emit('message:sent', { contactId: 'c1', content: 'x' })
    ).not.toThrow();
    expect(secondCalled).toBe(true);
  });
});

// ── different event types (type-level smoke tests) ────────────────────────────

describe('different event shapes', () => {
  it('connection:recovered event is received with correct payload', () => {
    let recv: { instanceName: string } | null = null;
    eventBus.on('connection:recovered', (p) => { recv = p; });
    eventBus.emit('connection:recovered', { instanceName: 'wpp2' });
    expect(recv).toEqual({ instanceName: 'wpp2' });
  });

  it('sla:breach event is received with correct payload', () => {
    let recv: { contactId: string; slaMinutes: number } | null = null;
    eventBus.on('sla:breach', (p) => { recv = p; });
    eventBus.emit('sla:breach', { contactId: 'c1', slaMinutes: 30 });
    expect(recv).toEqual({ contactId: 'c1', slaMinutes: 30 });
  });

  it('notification:show event is received correctly', () => {
    let recv: { title: string; body: string; type: 'info' | 'warning' | 'error' } | null = null;
    eventBus.on('notification:show', (p) => { recv = p; });
    eventBus.emit('notification:show', { title: 'T', body: 'B', type: 'warning' });
    expect(recv).toEqual({ title: 'T', body: 'B', type: 'warning' });
  });
});
