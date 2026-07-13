import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ticketStore as TicketStoreType } from '../ticketStore';

const STORAGE_KEY = 'inbox.tickets.overlay.v1';

// Module-level cachedOverlay persists across imports — vi.resetModules()
// forces a fresh require so the cache always starts null.
beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

async function getStore(): Promise<typeof TicketStoreType> {
  return (await import('../ticketStore')).ticketStore;
}

// ── snapshot / get ─────────────────────────────────────────────────────────

describe('ticketStore.snapshot', () => {
  it('returns an empty object when storage is empty', async () => {
    const store = await getStore();
    expect(store.snapshot()).toEqual({});
  });

  it('returns the same reference on successive calls (cache)', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    const a = store.snapshot();
    const b = store.snapshot();
    expect(a).toBe(b);
  });
});

describe('ticketStore.get', () => {
  it('returns null for an unknown contactId', async () => {
    const store = await getStore();
    expect(store.get('unknown')).toBeNull();
  });

  it('returns the state after bootstrap', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    const state = store.get('c1');
    expect(state).not.toBeNull();
    expect(state!.status).toBe('open');
  });
});

// ── bootstrap ──────────────────────────────────────────────────────────────

describe('ticketStore.bootstrap — creation', () => {
  it('creates a new entry with status "open"', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    expect(store.get('c1')!.status).toBe('open');
  });

  it('sets assignedTo to null when no seed', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    expect(store.get('c1')!.assignedTo).toBeNull();
  });

  it('sets queueId to null when no seed', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    expect(store.get('c1')!.queueId).toBeNull();
  });

  it('initialises events as an empty array', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    expect(store.get('c1')!.events).toHaveLength(0);
  });

  it('sets openedAt from seed when provided', async () => {
    const store = await getStore();
    const ts = '2024-01-15T10:00:00.000Z';
    store.bootstrap('c1', { openedAt: ts });
    expect(store.get('c1')!.openedAt).toBe(ts);
  });

  it('sets assignedTo from seed when provided', async () => {
    const store = await getStore();
    store.bootstrap('c1', { assignedTo: 'agent-1' });
    expect(store.get('c1')!.assignedTo).toBe('agent-1');
  });

  it('sets queueId from seed when provided', async () => {
    const store = await getStore();
    store.bootstrap('c1', { queueId: 'q-1' });
    expect(store.get('c1')!.queueId).toBe('q-1');
  });

  it('persists to localStorage', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed['c1']).toBeDefined();
  });
});

describe('ticketStore.bootstrap — idempotency', () => {
  it('is a no-op when the contact already exists', async () => {
    const store = await getStore();
    store.bootstrap('c1', { assignedTo: 'original-agent' });
    store.bootstrap('c1', { assignedTo: 'new-agent' });
    expect(store.get('c1')!.assignedTo).toBe('original-agent');
  });

  it('does not add events when called on existing contact', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    store.bootstrap('c1');
    expect(store.get('c1')!.events).toHaveLength(0);
  });

  it('does not dispatch custom event on no-op', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    const listener = vi.fn();
    window.addEventListener('ticket-overlay-changed', listener);
    store.bootstrap('c1'); // no-op
    window.removeEventListener('ticket-overlay-changed', listener);
    expect(listener).not.toHaveBeenCalled();
  });
});

// ── setStatus ──────────────────────────────────────────────────────────────

describe('ticketStore.setStatus — basic transitions', () => {
  it('creates a status_change event', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    store.setStatus('c1', 'in_progress', 'agent-1');
    const state = store.get('c1')!;
    expect(state.events).toHaveLength(1);
    expect(state.events[0].type).toBe('status_change');
  });

  it('updates status to the new value', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    store.setStatus('c1', 'in_progress', 'agent-1');
    expect(store.get('c1')!.status).toBe('in_progress');
  });

  it('records fromStatus and toStatus on the event', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    store.setStatus('c1', 'resolved', 'agent-1');
    const ev = store.get('c1')!.events[0];
    expect(ev.fromStatus).toBe('open');
    expect(ev.toStatus).toBe('resolved');
  });

  it('records performedBy on the event', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    store.setStatus('c1', 'resolved', 'user-42');
    expect(store.get('c1')!.events[0].performedBy).toBe('user-42');
  });

  it('sets resolvedAt when transitioning to "resolved"', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    store.setStatus('c1', 'resolved', null);
    expect(store.get('c1')!.resolvedAt).not.toBeNull();
  });

  it('clears resolvedAt when transitioning away from "resolved"', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    store.setStatus('c1', 'resolved', null);
    store.setStatus('c1', 'open', null);
    expect(store.get('c1')!.resolvedAt).toBeNull();
  });

  it('prepends events (newest first)', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    store.setStatus('c1', 'in_progress', null);
    store.setStatus('c1', 'resolved', null);
    const events = store.get('c1')!.events;
    expect(events[0].toStatus).toBe('resolved');
    expect(events[1].toStatus).toBe('in_progress');
  });
});

describe('ticketStore.setStatus — no-op behaviour', () => {
  it('is a no-op when status is unchanged on an existing entry', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    store.setStatus('c1', 'open', null); // same status
    expect(store.get('c1')!.events).toHaveLength(0);
  });

  it('does not dispatch event when status is unchanged', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    const calls: Event[] = [];
    window.addEventListener('ticket-overlay-changed', (e) => calls.push(e));
    store.setStatus('c1', 'open', null); // no-op
    window.removeEventListener('ticket-overlay-changed', () => undefined);
    expect(calls).toHaveLength(0);
  });

  it('creates a new entry with status "open" first when contact does not exist', async () => {
    const store = await getStore();
    store.setStatus('ghost', 'in_progress', null);
    expect(store.get('ghost')!.status).toBe('in_progress');
  });
});

describe('ticketStore.setStatus — event cap', () => {
  it('caps events at 50', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    // 51 transitions: open→in_progress→resolved→open... repeating
    const cycle: ('open' | 'in_progress' | 'resolved')[] = ['in_progress', 'resolved', 'open'];
    for (let i = 0; i < 51; i++) {
      store.setStatus('c1', cycle[i % 3], null);
    }
    expect(store.get('c1')!.events.length).toBeLessThanOrEqual(50);
  });
});

// ── assign ─────────────────────────────────────────────────────────────────

describe('ticketStore.assign — event types', () => {
  it('creates an "assign" event when assigning to a new agent (prev=null)', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    store.assign('c1', 'agent-1', null);
    const events = store.get('c1')!.events;
    const assignEv = events.find((e) => e.type === 'assign');
    expect(assignEv).toBeDefined();
    expect(assignEv!.toAgentId).toBe('agent-1');
  });

  it('creates a "transfer" event when replacing an existing agent', async () => {
    const store = await getStore();
    store.bootstrap('c1', { assignedTo: 'agent-1' });
    // pre-populate so assignedTo is already set
    store.assign('c1', 'agent-2', null);
    // The first event should be transfer (after auto-promotion status_change)
    const evs = store.get('c1')!.events;
    const transferEv = evs.find((e) => e.type === 'transfer');
    expect(transferEv).toBeDefined();
    expect(transferEv!.fromAgentId).toBe('agent-1');
    expect(transferEv!.toAgentId).toBe('agent-2');
  });

  it('creates an "unassign" event when agentId is null', async () => {
    const store = await getStore();
    store.bootstrap('c1', { assignedTo: 'agent-1' });
    store.assign('c1', null, null);
    const evs = store.get('c1')!.events;
    const unassignEv = evs.find((e) => e.type === 'unassign');
    expect(unassignEv).toBeDefined();
  });

  it('creates an "auto_routed" event when opts.auto=true', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    store.assign('c1', 'agent-1', null, { auto: true });
    const evs = store.get('c1')!.events;
    const autoEv = evs.find((e) => e.type === 'auto_routed');
    expect(autoEv).toBeDefined();
  });

  it('auto_routed takes priority over other type determination', async () => {
    const store = await getStore();
    store.bootstrap('c1', { assignedTo: 'agent-1' });
    store.assign('c1', null, null, { auto: true }); // would be unassign without auto
    const ev = store.get('c1')!.events[0];
    expect(ev.type).toBe('auto_routed');
  });
});

describe('ticketStore.assign — auto-promotion to in_progress', () => {
  it('promotes from "open" to "in_progress" when an agent is assigned', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    store.assign('c1', 'agent-1', null);
    expect(store.get('c1')!.status).toBe('in_progress');
  });

  it('promotes from "resolved" to "in_progress" when an agent is re-assigned', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    store.setStatus('c1', 'resolved', null);
    store.assign('c1', 'agent-1', null);
    expect(store.get('c1')!.status).toBe('in_progress');
  });

  it('creates 2 events during auto-promotion (status_change + assign)', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    store.assign('c1', 'agent-1', null);
    const evs = store.get('c1')!.events;
    expect(evs).toHaveLength(2);
    expect(evs[0].type).toBe('status_change');
    expect(evs[1].type).toBe('assign');
  });

  it('status_change event has fromStatus="open" and toStatus="in_progress"', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    store.assign('c1', 'agent-1', null);
    const statusEv = store.get('c1')!.events[0];
    expect(statusEv.fromStatus).toBe('open');
    expect(statusEv.toStatus).toBe('in_progress');
  });

  it('does NOT promote when status is already in_progress', async () => {
    const store = await getStore();
    store.bootstrap('c1', { assignedTo: 'agent-1' });
    // Manually set to in_progress first
    store.setStatus('c1', 'in_progress', null);
    const prevEventCount = store.get('c1')!.events.length;
    store.assign('c1', 'agent-2', null);
    // Should only add 1 event (transfer), not 2
    expect(store.get('c1')!.events.length).toBe(prevEventCount + 1);
  });
});

describe('ticketStore.assign — no-op', () => {
  it('is a no-op when assigning the same agent with no queueId change', async () => {
    const store = await getStore();
    store.bootstrap('c1', { assignedTo: 'agent-1' });
    store.assign('c1', 'agent-1', null);
    // only events from bootstrap (none) since bootstrap doesn't fire events
    // and the assign is a no-op
    expect(store.get('c1')!.events).toHaveLength(0);
  });

  it('is NOT a no-op when same agent but queueId changes', async () => {
    const store = await getStore();
    store.bootstrap('c1', { assignedTo: 'agent-1', queueId: 'q-1' });
    store.assign('c1', 'agent-1', null, { queueId: 'q-2' });
    expect(store.get('c1')!.events.length).toBeGreaterThan(0);
  });

  it('updates queueId when opts.queueId is provided', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    store.assign('c1', 'agent-1', null, { queueId: 'q-99' });
    expect(store.get('c1')!.queueId).toBe('q-99');
  });

  it('does not change queueId when opts.queueId is not provided', async () => {
    const store = await getStore();
    store.bootstrap('c1', { queueId: 'original-q' });
    store.assign('c1', 'agent-1', null);
    expect(store.get('c1')!.queueId).toBe('original-q');
  });

  it('sets queueId to null when opts.queueId is explicitly null', async () => {
    const store = await getStore();
    store.bootstrap('c1', { queueId: 'q-1' });
    store.assign('c1', 'agent-1', null, { queueId: null });
    expect(store.get('c1')!.queueId).toBeNull();
  });
});

describe('ticketStore.assign — agent fields on event', () => {
  it('records toAgentId on the assign event', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    store.assign('c1', 'agent-99', null);
    const assignEv = store.get('c1')!.events.find((e) => e.type === 'assign');
    expect(assignEv!.toAgentId).toBe('agent-99');
  });

  it('records fromAgentId as null when first assignment', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    store.assign('c1', 'agent-1', null);
    const assignEv = store.get('c1')!.events.find((e) => e.type === 'assign');
    expect(assignEv!.fromAgentId).toBeNull();
  });
});

// ── subscribe ──────────────────────────────────────────────────────────────

describe('ticketStore.subscribe', () => {
  it('calls listener when setStatus mutates state', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    const calls: number[] = [];
    store.subscribe(() => calls.push(1));
    store.setStatus('c1', 'in_progress', null);
    expect(calls).toHaveLength(1);
  });

  it('calls listener when assign mutates state', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    const calls: number[] = [];
    store.subscribe(() => calls.push(1));
    store.assign('c1', 'agent-1', null);
    expect(calls).toHaveLength(1);
  });

  it('does NOT call listener when setStatus is a no-op', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    const calls: number[] = [];
    store.subscribe(() => calls.push(1));
    store.setStatus('c1', 'open', null); // no-op
    expect(calls).toHaveLength(0);
  });

  it('unsubscribe stops receiving notifications', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    const calls: number[] = [];
    const unsub = store.subscribe(() => calls.push(1));
    unsub();
    store.setStatus('c1', 'in_progress', null);
    expect(calls).toHaveLength(0);
  });

  it('multiple listeners all receive notifications', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    const a: number[] = [];
    const b: number[] = [];
    store.subscribe(() => a.push(1));
    store.subscribe(() => b.push(1));
    store.setStatus('c1', 'in_progress', null);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('unsubscribing one listener does not affect others', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    const a: number[] = [];
    const b: number[] = [];
    const unsub = store.subscribe(() => a.push(1));
    store.subscribe(() => b.push(1));
    unsub();
    store.setStatus('c1', 'in_progress', null);
    expect(a).toHaveLength(0);
    expect(b).toHaveLength(1);
  });
});

// ── cross-contact isolation ────────────────────────────────────────────────

describe('ticketStore — contact isolation', () => {
  it('maintains independent state per contactId', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    store.bootstrap('c2');
    store.setStatus('c1', 'resolved', null);
    expect(store.get('c1')!.status).toBe('resolved');
    expect(store.get('c2')!.status).toBe('open');
  });

  it('snapshot contains all bootstrapped contacts', async () => {
    const store = await getStore();
    store.bootstrap('c1');
    store.bootstrap('c2');
    store.bootstrap('c3');
    const snap = store.snapshot();
    expect(Object.keys(snap)).toContain('c1');
    expect(Object.keys(snap)).toContain('c2');
    expect(Object.keys(snap)).toContain('c3');
  });
});

// ── localStorage persistence ───────────────────────────────────────────────

describe('ticketStore — localStorage persistence', () => {
  it('state survives a module cache bust (simulates page reload)', async () => {
    const store1 = await getStore();
    store1.bootstrap('c1');
    store1.setStatus('c1', 'resolved', null);

    // Simulate reload: clear module cache but keep localStorage
    vi.resetModules();
    const store2 = await getStore();
    expect(store2.get('c1')!.status).toBe('resolved');
  });

  it('gracefully handles corrupt localStorage data', async () => {
    localStorage.setItem(STORAGE_KEY, 'not-json{{{');
    const store = await getStore();
    expect(store.snapshot()).toEqual({});
  });
});
